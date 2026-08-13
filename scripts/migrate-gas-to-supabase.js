/**
 * migrate-gas-to-supabase.js
 * Script migrasi data historis dari Google Sheets ke Supabase PostgreSQL.
 *
 * CARA PAKAI:
 * 1. Pastikan supabase-material-db.sql sudah dijalankan di Supabase SQL Editor.
 * 2. Isi SUPABASE_URL, SUPABASE_ANON_KEY, dan SPREADSHEET_ID di bawah.
 * 3. Export data dari Google Sheets ke JSON (via GAS atau Download > CSV lalu convert).
 * 4. Simpan file data di folder ini dengan nama sesuai PATHS.
 * 5. Jalankan: node migrate-gas-to-supabase.js
 *
 * Atau jalankan langsung di browser console dengan import dinamis.
 */

// ─── KONFIGURASI ──────────────────────────────────────────────
const SUPABASE_URL      = 'https://mymzszufrwmpkpmmlnnc.supabase.co';
const SUPABASE_ANON_KEY = 'GANTI_DENGAN_SERVICE_ROLE_KEY'; // Gunakan service_role key untuk bypass RLS saat migrasi
const UPLOADER_NIK      = 'migration_script';

// ─── DATA PATHS ───────────────────────────────────────────────
// Export data GAS ke JSON, simpan di folder scripts/
const PATHS = {
    masterData:   './data/master_data.json',
    inspections:  './data/inspections.json',
    claims:       './data/claims.json',
};

// ─── UTILS ────────────────────────────────────────────────────
function parseDateSafe(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
    const sep = s.includes('/') ? '/' : '-';
    const parts = s.split(sep);
    if (parts.length === 3 && parts[0].length <= 2) {
        return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    return s;
}

async function supabaseInsert(table, rows, conflictCols = null) {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const headers = {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        conflictCols
            ? `resolution=ignore-duplicates,return=minimal`
            : 'return=minimal',
    };

    const BATCH = 500;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const qp = conflictCols ? `?on_conflict=${conflictCols}` : '';
        const res = await fetch(url + qp, {
            method:  'POST',
            headers,
            body:    JSON.stringify(batch),
        });
        if (!res.ok) {
            const text = await res.text();
            console.error(`[ERROR] ${table} batch ${Math.floor(i/BATCH)+1}:`, text);
        } else {
            inserted += batch.length;
            console.log(`[OK] ${table}: ${inserted}/${rows.length} rows inserted`);
        }
    }
    return inserted;
}

// ─── MIGRATE MASTER DATA ──────────────────────────────────────
async function migrateMasterData(rawData) {
    console.log('\n=== Migrasi Master Data ===');
    const rows = rawData.map(r => ({
        po_number:            String(r.po_number || r.PONumber    || r['PO Number']    || '').trim(),
        material_name:        String(r.material_name || r.MaterialName || r['Material Name'] || '').trim(),
        material_description: String(r.material_description || r.ItemDescription || r['Material Description'] || '').trim(),
        uom:                  String(r.uom || r.UOM || '').trim(),
        supplier:             String(r.supplier || r.Supplier || '').trim(),
        supplier_name:        String(r.supplier_name || r.SupplierName || r['Supplier Name'] || r.vendor_name || '').trim(),
        po_area:              String(r.po_area || r.POArea || r['PO Area'] || '').trim(),
        batch_size:           Number(r.batch_size || r.BatchSize || r['Batch Size'] || r.planned_qty || 0) || 0,
        product_code:         String(r.product_code || r.ProductCode || r['Product Code'] || r.style || '').trim(),
        model_name:           String(r.model_name || r.ModelName || r['Model Name'] || r.model_shoe || '').trim(),
        bucket:               String(r.bucket || r.Bucket || '').trim(),
        receive_date:         parseDateSafe(r.receive_date || r.ReceiveDate || r['Receive Date']),
        shipment_number:      String(r.shipment_number || r.ShipmentNumber || r['Shipment Number'] || '').trim(),
        no_bc:                String(r.no_bc || r.NoBc || r['No BC'] || '').trim(),
        bc_type:              String(r.bc_type || r.BcType || r['BC Type'] || '').trim(),
        receive_number:       String(r.receive_number || r.ReceiveNumber || r['Receive Number'] || '').trim(),
        material_type:        String(r.material_type || r.MaterialType || r['Material Type'] || '').trim(),
        status:               (String(r.status || 'pending')).toLowerCase(),
        uploaded_by:          UPLOADER_NIK,
    })).filter(r => r.po_number && r.material_name);

    console.log(`Akan insert ${rows.length} baris master data...`);
    const n = await supabaseInsert('material_master_data', rows);
    console.log(`Selesai: ${n} baris master data berhasil dimigrasi.`);
    return n;
}

// ─── MIGRATE INSPECTIONS ──────────────────────────────────────
async function migrateInspections(rawData) {
    console.log('\n=== Migrasi Inspections ===');
    const rows = rawData.map((r, i) => ({
        inspection_id:            String(r.inspection_id || `MIGR-${Date.now()}-${i}`).trim(),
        po_no:                    String(r.po_no || r.po_number || r.PONumber || '').trim(),
        material_name:            String(r.material_name || r.MaterialName || '').trim(),
        item_description:         String(r.item_description || r.ItemDescription || '').trim(),
        qty_receive:              Number(r.qty_receive || r.planned_qty || 0) || 0,
        ok:                       Number(r.ok || r.qty_ok || 0) || 0,
        no_qty:                   Number(r.no_qty || r.qty_fail || 0) || 0,
        receive_date:             parseDateSafe(r.receive_date || r.ReceiveDate),
        status:                   String(r.status || 'done').toLowerCase(),
        inspection_date:          r.inspection_date
                                    ? new Date(r.inspection_date).toISOString()
                                    : new Date().toISOString(),
        inspector_nik:            String(r.inspector_nik || r.inspector_name || '').trim(),
        defect_notes:             String(r.defect_notes || r.notes || r.bonding_notes || '').trim(),
        rolling_inspection:       String(r.rolling_inspection || 'No').trim(),
        approved_by_leader:       String(r.approved_by_leader || '').trim(),
        evidence_url:             String(r.evidence_url || r.drive_url || '').trim(),
        inspection_type:          String(r.inspection_type || 'Raw Material').trim(),
        color_check_status:       String(r.color_check_status || '').trim(),
        color_check_result:       String(r.color_check_result || '').trim(),
        packaging_status:         String(r.packaging_status || '').trim(),
        packaging_reject_reason:  String(r.packaging_reject_reason || '').trim(),
        roll_inspection_flag:     String(r.roll_inspection_flag || '').trim(),
        roll_inspection_percentage: String(r.roll_inspection_percentage || '').trim(),
        bonding_test_url:         String(r.bonding_test_url || '').trim(),
        input_type:               'historical_migration',
    })).filter(r => r.po_no && r.inspection_id);

    console.log(`Akan insert ${rows.length} baris inspeksi...`);
    const n = await supabaseInsert('material_inspections', rows);
    console.log(`Selesai: ${n} baris inspeksi berhasil dimigrasi.`);
    return n;
}

// ─── MIGRATE CLAIMS ───────────────────────────────────────────
async function migrateClaims(rawData) {
    console.log('\n=== Migrasi Claims ===');
    const rows = rawData.map(r => ({
        po_number:            String(r.po_number || r.PONumber || '').trim(),
        material_name:        String(r.material_name || '').trim(),
        vendor_name:          String(r.vendor_name || r.VendorName || '').trim(),
        material_type:        String(r.material_type || '').trim(),
        claimed_qty:          Number(r.claimed_qty || r.claim_qty || 0) || 0,
        original_planned_qty: Number(r.original_planned_qty || 0) || 0,
        new_planned_qty:      Number(r.new_planned_qty || 0) || 0,
        reason:               String(r.reason || '').trim(),
        ref_number:           String(r.ref_number || '').trim(),
        submitted_by:         String(r.submitted_by || UPLOADER_NIK).trim(),
        created_at:           r.claim_date || r.created_at
                                ? new Date(r.claim_date || r.created_at).toISOString()
                                : new Date().toISOString(),
    })).filter(r => r.po_number && r.claimed_qty > 0);

    console.log(`Akan insert ${rows.length} baris claims...`);
    const n = await supabaseInsert('material_claims', rows);
    console.log(`Selesai: ${n} baris claims berhasil dimigrasi.`);
    return n;
}

// ─── MAIN ─────────────────────────────────────────────────────
async function runMigration() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   IQC Material — Migrasi GAS → Supabase          ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`Target: ${SUPABASE_URL}`);
    console.log('');

    if (SUPABASE_ANON_KEY === 'GANTI_DENGAN_SERVICE_ROLE_KEY') {
        console.error('[STOP] Isi SUPABASE_ANON_KEY dengan service_role key dari Supabase dashboard dulu!');
        console.error('       Settings → API → service_role (bukan anon key)');
        return;
    }

    let masterData    = [];
    let inspections   = [];
    let claims        = [];

    // Load data jika dijalankan di Node.js
    if (typeof require !== 'undefined') {
        const fs = require('fs');
        if (fs.existsSync(PATHS.masterData))   masterData  = JSON.parse(fs.readFileSync(PATHS.masterData, 'utf8'));
        if (fs.existsSync(PATHS.inspections))  inspections = JSON.parse(fs.readFileSync(PATHS.inspections, 'utf8'));
        if (fs.existsSync(PATHS.claims))       claims      = JSON.parse(fs.readFileSync(PATHS.claims, 'utf8'));
    } else {
        // Di browser, data harus diset manual sebelum memanggil fungsi ini
        masterData  = window.__migMasterData   || [];
        inspections = window.__migInspections  || [];
        claims      = window.__migClaims       || [];
    }

    const results = {
        masterData:   masterData.length  > 0 ? await migrateMasterData(masterData)   : 0,
        inspections:  inspections.length > 0 ? await migrateInspections(inspections) : 0,
        claims:       claims.length      > 0 ? await migrateClaims(claims)           : 0,
    };

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║   RINGKASAN MIGRASI                               ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Master Data  : ${String(results.masterData).padEnd(33)}║`);
    console.log(`║  Inspections  : ${String(results.inspections).padEnd(33)}║`);
    console.log(`║  Claims       : ${String(results.claims).padEnd(33)}║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('\nMigrasi selesai! Verifikasi data di Supabase Dashboard.');
}

// Auto-run jika di Node.js
if (typeof module !== 'undefined' && require.main === module) {
    runMigration().catch(console.error);
}

// Export untuk browser
if (typeof window !== 'undefined') {
    window.runMigration = runMigration;
}
