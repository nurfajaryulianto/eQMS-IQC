// ============================================================
// js/material/api.js — IQC Material: Supabase API Layer
// Menggantikan seluruh gasGet / gasPost / GAS Web App calls.
// Semua fungsi menggunakan Supabase JS SDK dari auth.js.
// ============================================================

import { supabase, MATERIAL_GAS_URL } from './auth.js';

// ─── HELPER ──────────────────────────────────────────────────

/**
 * Ambil data user (NIK + nama) dari session Supabase saat ini.
 */
export async function getCurrentUserMeta() {
    const { data } = await supabase.auth.getUser();
    const meta = data?.user?.user_metadata || {};
    return {
        nik:  meta.nik  || meta.username || '',
        name: meta.name || meta.full_name || meta.nik || '',
        role: meta.role || '',
    };
}

// ─── MASTER DATA ─────────────────────────────────────────────

/**
 * Ambil daftar master data dengan filter opsional dan pagination.
 * @param {object} opts
 * @param {string}  opts.status       - 'all' | 'pending' | 'in-progress' | 'done'
 * @param {string}  opts.materialType - filter material_type (opsional)
 * @param {string}  opts.search       - pencarian po_number / material_name (opsional)
 * @param {number}  opts.page         - halaman (1-based, default 1)
 * @param {number}  opts.limit        - jumlah item per halaman (default 500)
 */
export async function apiGetMasterData({
    status = 'all',
    materialType = '',
    search = '',
    page = 1,
    limit = 500,
} = {}) {
    const buildQuery = (withJoin = true) => {
        let q = supabase
            .from('material_master_data')
            .select(withJoin ? '*, material_inspections(*)' : '*', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            q = q.eq('status', status);
        }
        if (materialType) {
            q = q.ilike('material_type', materialType);
        }
        if (search) {
            q = q.or(
                `po_number.ilike.%${search}%,material_name.ilike.%${search}%,supplier_name.ilike.%${search}%`
            );
        }
        return q;
    };

    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    let masterRows = [];
    let totalCount = null;

    if (limit <= 1000) {
        let query = buildQuery(true).range(from, to);
        let res = await query;
        if (res.error) {
            // Fallback jika nested join error
            const fb = await buildQuery(false).range(from, to);
            if (fb.error) throw new Error(fb.error.message);
            res = fb;
        }
        masterRows = res.data || [];
        totalCount = res.count ?? masterRows.length;
    } else {
        // Auto-chunking loop jika limit > 1000 (misal limit: 10000) untuk bypass batas PostgREST 1000
        let curFrom = from;
        const targetEnd = to;
        let useFallback = false;

        while (curFrom <= targetEnd) {
            const curTo = Math.min(curFrom + 999, targetEnd);
            let chunkRes = null;
            if (!useFallback) {
                chunkRes = await buildQuery(true).range(curFrom, curTo);
                if (chunkRes.error) {
                    useFallback = true;
                }
            }
            if (useFallback) {
                chunkRes = await buildQuery(false).range(curFrom, curTo);
                if (chunkRes.error) throw new Error(chunkRes.error.message);
            }

            if (chunkRes.count !== null && totalCount === null) {
                totalCount = chunkRes.count;
            }

            const batch = chunkRes.data || [];
            masterRows = masterRows.concat(batch);

            if (batch.length < (curTo - curFrom + 1)) {
                break;
            }
            curFrom += batch.length;
        }
    }

    // Fallback: jika ada master data yang material_inspections-nya kosong, cari berdasarkan po_number
    const unlinkedMaster = masterRows.filter(m => !m.material_inspections || (Array.isArray(m.material_inspections) && m.material_inspections.length === 0));
    if (unlinkedMaster.length > 0) {
        const poList = [...new Set(unlinkedMaster.map(m => m.po_number).filter(Boolean))];
        if (poList.length > 0) {
            try {
                const { data: inspList } = await supabase
                    .from('material_inspections')
                    .select('*')
                    .in('po_no', poList);
                if (inspList && inspList.length > 0) {
                    const inspMapByMdId = {};
                    const inspMapByPoMat = {};
                    inspList.forEach(insp => {
                        if (insp.master_data_id) {
                            if (!inspMapByMdId[insp.master_data_id]) inspMapByMdId[insp.master_data_id] = [];
                            inspMapByMdId[insp.master_data_id].push(insp);
                        }
                        const poKey = `${(insp.po_no || '').trim().toLowerCase()}_${(insp.material_name || '').trim().toLowerCase()}`;
                        if (!inspMapByPoMat[poKey]) inspMapByPoMat[poKey] = [];
                        inspMapByPoMat[poKey].push(insp);
                    });
                    masterRows.forEach(m => {
                        if (!m.material_inspections || (Array.isArray(m.material_inspections) && m.material_inspections.length === 0)) {
                            const poKey = `${(m.po_number || '').trim().toLowerCase()}_${(m.material_name || '').trim().toLowerCase()}`;
                            const found = (m.id && inspMapByMdId[m.id]) || (poKey !== '_' ? inspMapByPoMat[poKey] : null);
                            if (found && found.length > 0) {
                                m.material_inspections = found;
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn('Fallback inspection lookup warning:', e);
            }
        }
    }

    return {
        data: masterRows.map(normalizeRow),
        total: totalCount ?? masterRows.length,
        page,
        limit,
    };
}

/**
 * Update satu kolom/field di material_master_data (admin only, dikunci RLS).
 */
export async function apiUpdateMasterData(id, patch) {
    const { data, error } = await supabase
        .from('material_master_data')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Hapus baris master data (admin only).
 */
export async function apiDeleteMasterData(id) {
    const { error } = await supabase
        .from('material_master_data')
        .delete()
        .eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
}

/**
 * Upload batch baris master data dari Excel.
 * Menggunakan upsert dengan onConflict berdasarkan composite unique key.
 */
export async function apiBulkUpsertMasterData(rows, uploaderNik = '') {
    if (!rows || rows.length === 0) {
        return { inserted: 0, rejected: 0, rejectedList: [] };
    }

    const now = new Date().toISOString();

    // Helper ekstra fleksibel: mendukung variasi nama header Excel, spasi, newline, dan case-insensitive
    const g = (r, ...keys) => {
        // 1. Direct match
        for (const k of keys) {
            if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') {
                return String(r[k]).trim();
            }
        }
        // 2. Normalized match (lowercase tanpa spasi & karakter non-alfanumerik)
        const normMap = {};
        for (const rawKey of Object.keys(r)) {
            const clean = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!normMap[clean] && r[rawKey] !== undefined && r[rawKey] !== null) {
                normMap[clean] = r[rawKey];
            }
        }
        for (const k of keys) {
            const clean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normMap[clean] !== undefined && normMap[clean] !== null && String(normMap[clean]).trim() !== '') {
                return String(normMap[clean]).trim();
            }
        }
        return '';
    };

    const mappedRows = rows.map(r => {
        const matName = g(r, 'Material Name', 'material_name', 'MaterialName', 'MATERIAL_NAME', 'Material', 'material', 'Material Code', 'material_code', 'Item', 'item', 'Item Code', 'item_code', 'Kode Material', 'Nama Material');
        const matDesc = g(r, 'Material Description', 'material_description', 'ItemDescription', 'MATERIAL_DESCRIPTION', 'Item Description', 'item_description', 'Description', 'Deskripsi');
        let matType = g(r, 'Material Type', 'material_type', 'MaterialType', 'MATERIAL_TYPE', 'Jenis Material', 'Type');

        if (!matType) {
            const textUpper = (matName + ' ' + matDesc).toUpperCase();
            if (textUpper.includes('LTH') || textUpper.includes('LEATHER')) matType = 'LEATHER';
            else if (textUpper.includes('TXT') || textUpper.includes('TEXTILE')) matType = 'TEXTILE';
            else if (textUpper.includes('SYN') || textUpper.includes('PU') || textUpper.includes('SUEDE') || textUpper.includes('NUBUCK')) matType = 'SYNTHETIC';
            else if (textUpper.includes('RUB') || textUpper.includes('RUBBER') || textUpper.includes('SOLE')) matType = 'RUBBER';
            else if (textUpper.includes('PKG') || textUpper.includes('BOX')) matType = 'PACKAGING';
            else matType = 'Raw Material';
        }

        const rawBatchSize = g(r, 'Batch Size', 'batch_size', 'BatchSize', 'BATCH_SIZE', 'planned_qty', 'Planned Qty', 'QTY', 'Qty', 'Quantity', 'Jumlah', 'Jumlah Masuk');
        const parsedBatchSize = parseFloat(String(rawBatchSize).replace(/,/g, '')) || 0;

        return {
            po_number:            g(r, 'PO Number', 'po_number', 'PONumber', 'PO_NUMBER', 'po_no', 'PO No', 'PO NO', 'PONO', 'PO', 'po', 'Purchase Order', 'No PO', 'Nomor PO', 'No. PO'),
            material_name:        matName,
            material_description: matDesc,
            uom:                  g(r, 'UOM', 'uom', 'Uom', 'Unit', 'Satuan'),
            supplier:             g(r, 'Supplier', 'supplier', 'SUPPLIER'),
            supplier_name:        g(r, 'Supplier Name', 'supplier_name', 'SupplierName', 'vendor_name', 'Vendor Name', 'SUPPLIER_NAME', 'Supplier', 'supplier', 'Vendor', 'vendor', 'Nama Vendor', 'Nama Supplier'),
            po_area:              g(r, 'PO Area', 'po_area', 'POArea', 'PO_AREA', 'Area'),
            batch_size:           parsedBatchSize,
            product_code:         g(r, 'Product Code', 'product_code', 'ProductCode', 'style', 'Style', 'PRODUCT_CODE', 'Kode Produk', 'Art No'),
            model_name:           g(r, 'Model Name', 'model_name', 'ModelName', 'model_shoe', 'Model Shoe', 'MODEL_NAME', 'Model Sepatu'),
            bucket:               g(r, 'Bucket', 'bucket', 'BUCKET'),
            receive_date:         parseDateSafe(g(r, 'Receive Date', 'receive_date', 'ReceiveDate', 'RECEIVE_DATE', 'Tanggal Terima', 'Tgl Terima', 'Date')),
            shipment_number:      g(r, 'Shipment Number', 'shipment_number', 'ShipmentNumber', 'SHIPMENT_NUMBER', 'No Surat Jalan', 'Surat Jalan'),
            no_bc:                g(r, 'No BC', 'no_bc', 'NoBc', 'NO_BC', 'Nomor BC'),
            bc_type:              g(r, 'BC Type', 'bc_type', 'BcType', 'BC_TYPE', 'Jenis BC'),
            receive_number:       g(r, 'Receive Number', 'receive_number', 'ReceiveNumber', 'RECEIVE_NUMBER', 'No Penerimaan'),
            material_type:        matType,
            status:               'pending',
            uploaded_by:          uploaderNik,
            created_at:           now,
        };
    });

    const insertRows = [];
    const invalidRows = [];

    mappedRows.forEach((r, idx) => {
        if (r.po_number && r.material_name) {
            insertRows.push(r);
        } else {
            invalidRows.push({
                rowIdx: idx + 2,
                po_number: r.po_number || '(Kosong)',
                material_name: r.material_name || '(Kosong)'
            });
        }
    });

    if (insertRows.length === 0) {
        throw new Error('Tidak ada baris yang valid ditemukan. Pastikan file memiliki kolom Nomor PO dan Nama Material.');
    }

    console.log('[upload] parsed rows sample:', insertRows[0]);
    console.log('[upload] total valid rows:', insertRows.length, 'of', rows.length);

    // Helper key komposit identik dengan unique index uq_md_po_date_mat_recnum_qty
    const makeKey = (po, date, mat, recnum, qty) => {
        const p = String(po || '').trim().toLowerCase();
        const d = date ? String(date).split('T')[0].trim() : '';
        const m = String(mat || '').trim().toLowerCase();
        const r = String(recnum || '').trim().toLowerCase();
        const q = Math.round((Number(qty) || 0) * 100) / 100;
        return `${p}|${d}|${m}|${r}|${q}`;
    };

    // Ambil data existing dari database secara chunking
    const uniquePoList = [...new Set(insertRows.map(r => r.po_number))];
    let existing = [];
    const PO_CHUNK = 100;
    for (let i = 0; i < uniquePoList.length; i += PO_CHUNK) {
        const chunk = uniquePoList.slice(i, i + PO_CHUNK);
        const { data: exData, error: exErr } = await supabase
            .from('material_master_data')
            .select('po_number, receive_date, material_name, receive_number, batch_size')
            .in('po_number', chunk);
        if (!exErr && exData) {
            existing.push(...exData);
        }
    }

    const existingKeys = new Set(
        (existing || []).map(e =>
            makeKey(e.po_number, e.receive_date, e.material_name, e.receive_number, e.batch_size)
        )
    );

    // Filter duplikat dari database DAN deduplikasi intra-file
    const seenNewKeys = new Set();
    const newRows = [];
    const rejectedList = [];

    insertRows.forEach(r => {
        const key = makeKey(r.po_number, r.receive_date, r.material_name, r.receive_number, r.batch_size);
        if (existingKeys.has(key) || seenNewKeys.has(key)) {
            rejectedList.push(`${r.po_number} (${r.material_name})`);
        } else {
            seenNewKeys.add(key);
            newRows.push(r);
        }
    });

    const rejected = rejectedList.length;
    let inserted = 0;
    const newMasterIds = [];

    if (newRows.length > 0) {
        // Cek auth session aktif
        const { data: sessionData } = await supabase.auth.getSession();
        let token = sessionData?.session?.access_token;
        if (!token) {
            try {
                const s1 = JSON.parse(sessionStorage.getItem('eqms_material_auth_v1') || '{}');
                const s2 = JSON.parse(sessionStorage.getItem('eqms_auth_v1') || '{}');
                const s3 = JSON.parse(sessionStorage.getItem('iqc_material_session_v1') || '{}');
                const cand = (s1?.access_token && s1?.refresh_token) ? s1 : ((s2?.access_token && s2?.refresh_token) ? s2 : null);
                if (cand) {
                    await supabase.auth.setSession({
                        access_token: cand.access_token,
                        refresh_token: cand.refresh_token
                    });
                    token = cand.access_token;
                } else {
                    token = s1?.access_token || s2?.access_token || s3?.token || '';
                }
            } catch (_) {}
        }
        if (!token) {
            throw new Error('Sesi login tidak ditemukan. Silakan login ulang dan coba lagi.');
        }

        const BATCH = 100;
        for (let i = 0; i < newRows.length; i += BATCH) {
            const batch = newRows.slice(i, i + BATCH);
            try {
                const { data, error } = await supabase
                    .from('material_master_data')
                    .insert(batch)
                    .select('id');
                if (error) throw error;
                inserted += data?.length || batch.length;
                if (data && Array.isArray(data)) {
                    data.forEach(item => { if (item?.id) newMasterIds.push(item.id); });
                }
            } catch (batchErr) {
                // Fallback jika ada duplikat lolos di unique constraint: simpan per baris
                if (batchErr.message && (batchErr.message.includes('unique constraint') || batchErr.code === '23505')) {
                    for (const singleRow of batch) {
                        const { data: sData, error: sErr } = await supabase
                            .from('material_master_data')
                            .insert([singleRow])
                            .select('id');
                        if (!sErr) {
                            inserted++;
                            if (sData?.[0]?.id) newMasterIds.push(sData[0].id);
                        } else if (sErr.message && (sErr.message.includes('unique constraint') || sErr.code === '23505')) {
                            rejectedList.push(`${singleRow.po_number} (${singleRow.material_name})`);
                        } else {
                            throw sErr;
                        }
                    }
                } else {
                    console.error(`[upload] Error batch ${Math.floor(i / BATCH) + 1}:`, batchErr);
                    throw new Error(`Gagal menyimpan batch ${Math.floor(i / BATCH) + 1}: ${batchErr.message}`);
                }
            }
        }
    }

    return {
        inserted,
        rejected,
        rejectedList,
        totalExcelRows: rows.length,
        validCount: insertRows.length,
        invalidCount: invalidRows.length,
        invalidList: invalidRows.slice(0, 10),
        newPoList: [...new Set(newRows.map(r => r.po_number))],
        newMasterIds,
        batchTimestamp: now,
        message: `Upload selesai: ${inserted} baru disimpan, ${rejected} duplikat dilewati, ${invalidRows.length} baris tidak valid dilewati.`,
    };
}

// ─── INSPECTIONS ─────────────────────────────────────────────

/**
 * Ambil riwayat log inspeksi dari tabel material_inspections.
 */
export async function apiGetInspectionLogs({
    startDate = '',
    endDate = '',
    inspectionType = 'all',
    inspectorNik = '',
    fileFilter = 'all',
    materialDesc = '',
    page = 1,
    limit = 25,
} = {}) {
    let matchedMasterIds = [];
    let matchedPoNumbers = [];
    const isSearchingDesc = Boolean(materialDesc && materialDesc.trim());
    const rawDesc = isSearchingDesc ? materialDesc.trim() : '';

    if (isSearchingDesc) {
        // Ambil token kata dari input pencarian (abaikan tanda baca non-alfanumerik di tepi kata)
        const tokens = rawDesc
            .toLowerCase()
            .split(/[\s,]+/)
            .map(w => w.replace(/^[^a-zA-Z0-9"'-]+|[^a-zA-Z0-9"'-]+$/g, ''))
            .filter(w => w.length > 0);

        // Pilih kata kunci terpanjang untuk query pencarian awal di database
        const candidateTokens = [...tokens].sort((a, b) => b.length - a.length);
        const bestKeyword = candidateTokens[0] || rawDesc;
        const safeToken = bestKeyword.replace(/[,()"]/g, '').trim();

        try {
            // 1. Cari kandidat di material_master_data (karena deskripsi lengkap ada di tabel ini)
            let mdQuery = supabase
                .from('material_master_data')
                .select('id, po_number, material_name, material_description');

            if (safeToken) {
                mdQuery = mdQuery.or(`material_description.ilike.%${safeToken}%,material_name.ilike.%${safeToken}%,po_number.ilike.%${safeToken}%`);
            }

            const { data: mdCandidates } = await mdQuery.limit(500);

            if (mdCandidates && mdCandidates.length > 0) {
                // Filter kandidat master data: pastikan semua token kata yang diketik cocok
                const matchedCandidates = mdCandidates.filter(m => {
                    const text = `${m.material_name || ''} ${m.material_description || ''} ${m.po_number || ''}`.toLowerCase();
                    return tokens.every(t => text.includes(t));
                });

                const finalCandidates = matchedCandidates.length > 0 ? matchedCandidates : mdCandidates;
                matchedMasterIds = finalCandidates.map(m => m.id).filter(Boolean);
                matchedPoNumbers = [...new Set(finalCandidates.map(m => m.po_number).filter(Boolean))];
            }
        } catch (e) {
            console.warn('Lookup master_data for description search error:', e);
        }
    }

    const buildInspQuery = () => {
        let q = supabase
            .from('material_inspections')
            .select('*, material_master_data(*)', { count: 'exact' })
            .order('inspection_date', { ascending: false });

        if (startDate) {
            q = q.gte('inspection_date', startDate + 'T00:00:00.000Z');
        }
        if (endDate) {
            q = q.lte('inspection_date', endDate + 'T23:59:59.999Z');
        }
        if (inspectionType && inspectionType !== 'all') {
            q = q.ilike('inspection_type', inspectionType);
        }
        if (inspectorNik) {
            q = q.ilike('inspector_nik', `%${inspectorNik}%`);
        }

        if (isSearchingDesc) {
            if (orClauses.length > 0) {
                q = q.or(orClauses.join(','));
            } else {
                q = q.eq('id', -999999);
            }
        }

        // Filter berkas: has_files / has_bonding / has_evidence / no_files
        if (fileFilter === 'has_files') {
            q = q.or('evidence_url.neq.,bonding_test_url.neq.');
        } else if (fileFilter === 'has_bonding') {
            q = q.not('bonding_test_url', 'is', null).neq('bonding_test_url', '');
        } else if (fileFilter === 'has_evidence') {
            q = q.not('evidence_url', 'is', null).neq('evidence_url', '');
        } else if (fileFilter === 'no_files') {
            q = q.is('evidence_url', null).is('bonding_test_url', null);
        }

        return q;
    };

    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    let data = [];
    let count = null;

    if (limit <= 1000) {
        const res = await buildInspQuery().range(from, to);
        if (res.error) throw new Error(res.error.message);
        data = res.data || [];
        count = res.count ?? data.length;
    } else {
        // Auto-chunking loop jika limit > 1000 (misal limit: 9999 untuk Export Excel)
        let curFrom = from;
        const targetEnd = to;

        while (curFrom <= targetEnd) {
            const curTo = Math.min(curFrom + 999, targetEnd);
            const res = await buildInspQuery().range(curFrom, curTo);
            if (res.error) throw new Error(res.error.message);

            if (res.count !== null && count === null) {
                count = res.count;
            }

            const batch = res.data || [];
            data = data.concat(batch);

            if (batch.length < (curTo - curFrom + 1)) {
                break;
            }
            curFrom += batch.length;
        }
    }

    // Fallback enrichment jika ada record lama yang belum ter-link foreign key
    const unlinkedRows = (data || []).filter(d => !d.material_master_data && d.po_no);
    let masterMapById = {};
    let masterMapByPoMat = {};
    if (unlinkedRows.length > 0) {
        const poList = [...new Set(unlinkedRows.map(d => d.po_no))];
        try {
            const { data: mdList } = await supabase
                .from('material_master_data')
                .select('id, po_number, material_name, material_description, uom, product_code, model_name, bucket, supplier, supplier_name, receive_date, batch_size')
                .in('po_number', poList);

            if (mdList && mdList.length > 0) {
                mdList.forEach(m => {
                    if (m.id) masterMapById[m.id] = m;
                    const key = `${(m.po_number || '').trim().toLowerCase()}_${(m.material_name || '').trim().toLowerCase()}`;
                    masterMapByPoMat[key] = m;
                });
            }
        } catch (e) {
            console.warn('Fallback master data lookup warning:', e);
        }
    }

    const enriched = (data || []).map(d => {
        const poKey = `${(d.po_no || '').trim().toLowerCase()}_${(d.material_name || '').trim().toLowerCase()}`;
        const md = d.material_master_data || (d.master_data_id ? masterMapById[d.master_data_id] : null) || (poKey !== '_' ? masterMapByPoMat[poKey] : null) || {};
        const supName = (md.supplier_name && String(md.supplier_name).trim() !== '') ? String(md.supplier_name).trim() : ((d.supplier_name && String(d.supplier_name).trim() !== '') ? String(d.supplier_name).trim() : '');
        const sup = (md.supplier && String(md.supplier).trim() !== '') ? String(md.supplier).trim() : ((d.supplier && String(d.supplier).trim() !== '') ? String(d.supplier).trim() : '');
        const vendorName = supName || sup || '';
        const matName = d.material_name || md.material_name || '';
        const matDesc = d.item_description || md.material_description || d.material_description || '';

        return {
            ...d,
            po_number:            d.po_no || d.po_number || md.po_number || '',
            po_no:                d.po_no || d.po_number || md.po_number || '',
            material_name:        matName,
            material_description: matDesc,
            item_description:     matDesc,
            uom:                  d.uom || md.uom || '',
            style:                d.style || md.product_code || md.style || '',
            product_code:         d.style || md.product_code || md.style || '',
            model_shoe:           d.model_shoe || md.model_name || md.shoe_model || '',
            model_name:           d.model_shoe || md.model_name || md.shoe_model || '',
            shoe_model:           d.model_shoe || md.model_name || md.shoe_model || '',
            bucket:               d.bucket || md.bucket || '',
            supplier_name:        vendorName,
            vendor_name:          vendorName,
            supplier:             sup,
            receive_date:         d.receive_date || md.receive_date || '',
            qty_receive:          Number(d.qty_receive) || Number(md.batch_size) || 0,
            qty_inspect:          (Number(d.ok) || 0) + (Number(d.no_qty) || 0),
            qty_fail:             Number(d.no_qty) || 0,
            result_status:        (Number(d.no_qty) || 0) === 0 ? 'Pass' : 'Fail',
            inspection_date:      d.inspection_date ? new Date(d.inspection_date) : null,
        };
    });

    let finalRows = enriched;
    if (isSearchingDesc) {
        const tokens = rawDesc
            .toLowerCase()
            .split(/[\s,]+/)
            .map(w => w.replace(/^[^a-zA-Z0-9"'-]+|[^a-zA-Z0-9"'-]+$/g, ''))
            .filter(w => w.length > 0);

        finalRows = enriched.filter(row => {
            const haystack = `${row.material_name || ''} ${row.material_description || ''} ${row.item_description || ''} ${row.po_no || ''}`.toLowerCase();
            return tokens.every(t => haystack.includes(t));
        });
    }

    return {
        data: finalRows,
        total: isSearchingDesc ? finalRows.length : (count || 0),
        page,
        limit,
    };
}

export const apiGetInspectionData = apiGetInspectionLogs;

let consolidatedOnce = false;
export async function apiConsolidateDuplicateInspections() {
    if (consolidatedOnce) return;
    consolidatedOnce = true;
    try {
        const { data: rows } = await supabase
            .from('material_inspections')
            .select('*')
            .order('created_at', { ascending: true });

        if (!rows || rows.length <= 1) return;

        const grouped = {};
        rows.forEach(r => {
            const po = (r.po_no || r.po_number || '').trim().toLowerCase();
            const mat = (r.material_name || '').trim().toLowerCase();
            // Hanya kelompokkan jika ada master_data_id ATAU kombinasi PO + Material keduanya lengkap
            if (r.master_data_id) {
                const key = `md_${r.master_data_id}`;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(r);
            } else if (po && mat) {
                const key = `po_${po}_${mat}`;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(r);
            }
        });

        for (const key in grouped) {
            const list = grouped[key];
            if (list.length > 1) {
                // Pastikan seluruh item dalam grup memiliki material_name dan po_no yang sama persis
                const firstPo = (list[0].po_no || list[0].po_number || '').trim().toLowerCase();
                const firstMat = (list[0].material_name || '').trim().toLowerCase();
                const allSame = list.every(item => 
                    (item.po_no || item.po_number || '').trim().toLowerCase() === firstPo &&
                    (item.material_name || '').trim().toLowerCase() === firstMat
                );
                if (!allSame) continue; // Jangan gabungkan jika material tidak identik

                let primary = list.find(r => (Number(r.ok) > 0 || Number(r.no_qty) > 0 || (r.inspection_type || '').includes('Raw'))) || list[0];
                const others = list.filter(r => r.id !== primary.id);

                let mergedBonding = primary.bonding_test_url || '';
                let mergedEvidence = primary.evidence_url || '';
                let mergedColorStatus = primary.color_check_status || '';
                let mergedColorResult = primary.color_check_result || '';
                let mergedPkgStatus = primary.packaging_status || '';
                let mergedPkgReason = primary.packaging_reject_reason || '';
                let mergedRollFlag = primary.roll_inspection_flag || '';
                let mergedRollPct = primary.roll_inspection_percentage || '';
                let mergedNotes = primary.defect_notes || '';

                others.forEach(o => {
                    if (o.bonding_test_url) mergedBonding = o.bonding_test_url;
                    if (o.evidence_url && !mergedEvidence) mergedEvidence = o.evidence_url;
                    if (o.color_check_status) mergedColorStatus = o.color_check_status;
                    if (o.color_check_result) mergedColorResult = o.color_check_result;
                    if (o.packaging_status) mergedPkgStatus = o.packaging_status;
                    if (o.packaging_reject_reason) mergedPkgReason = o.packaging_reject_reason;
                    if (o.roll_inspection_flag) mergedRollFlag = o.roll_inspection_flag;
                    if (o.roll_inspection_percentage) mergedRollPct = o.roll_inspection_percentage;
                    if (o.defect_notes && !mergedNotes.includes(o.defect_notes)) {
                        mergedNotes = mergedNotes ? `${mergedNotes}; ${o.defect_notes}` : o.defect_notes;
                    }
                });

                await supabase.from('material_inspections').update({
                    bonding_test_url: mergedBonding,
                    evidence_url: mergedEvidence,
                    color_check_status: mergedColorStatus,
                    color_check_result: mergedColorResult,
                    packaging_status: mergedPkgStatus,
                    packaging_reject_reason: mergedPkgReason,
                    roll_inspection_flag: mergedRollFlag,
                    roll_inspection_percentage: mergedRollPct,
                    defect_notes: mergedNotes,
                    inspection_type: primary.inspection_type || 'Raw Material'
                }).eq('id', primary.id);

                const otherIds = others.map(o => o.id);
                await supabase.from('material_inspections').delete().in('id', otherIds);
            }
        }
    } catch (e) {
        console.warn('Auto-consolidation error:', e);
    }
}

/**
 * Submit satu hasil inspeksi.
 * Seluruh tipe inspeksi (Raw Material, Laminating, Bonding, Rolling) disatukan ke baris yang sama per Master Data.
 */
export async function apiSubmitInspection(payload) {
    let evidenceUrl = payload.evidence_url || '';
    const isBonding = (payload.inspection_type || '').toLowerCase().includes('bonding');
    const isLam = (payload.inspection_type || '').toLowerCase().includes('laminating');
    const isRolling = (payload.inspection_type || '').toLowerCase().includes('rolling');
    const isRaw = (payload.inspection_type || '').toLowerCase().includes('raw') || (!isBonding && !isLam && !isRolling);

    // Upload file evidence/bonding ke Google Drive jika ada
    if (payload.file_data && payload.file_name) {
        evidenceUrl = await uploadEvidenceFile(
            payload.file_data,
            payload.file_name,
            payload.file_type || 'image/png',
            {
                category: isBonding ? 'bonding' : 'evidence',
                po_number: payload.po_number,
                material_name: payload.material_name,
                inspection_type: payload.inspection_type
            }
        );
    }

    const bUrl = payload.bonding_test_url || (isBonding ? evidenceUrl : '');
    const inspectionId = payload.inspection_id || ('INSP-' + Date.now());
    const ok  = Math.max(0, (Number(payload.qty_inspect) || 0) - (Number(payload.qty_fail) || 0));
    const noQ = Number(payload.qty_fail) || 0;

    // Cek apakah sudah ada baris inspeksi untuk master_data_id ini (atau PO + Material)
    let existing = null;
    if (payload.master_data_id) {
        const { data } = await supabase
            .from('material_inspections')
            .select('*')
            .eq('master_data_id', payload.master_data_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        existing = data;
    }
    if (!existing && payload.po_number && payload.material_name) {
        const { data } = await supabase
            .from('material_inspections')
            .select('*')
            .eq('po_no', payload.po_number)
            .eq('material_name', payload.material_name)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        existing = data;
    }

    if (existing) {
        // UPDATE: Gabungkan data ke baris yang sama
        const updatedOk = isRaw ? (Number(payload.qty_inspect ? ok : existing.ok) || 0) : (Number(existing.ok) || 0);
        const updatedNoQ = isRaw ? (Number(payload.qty_inspect ? noQ : existing.no_qty) || 0) : (Number(existing.no_qty) || 0);

        let newNotes = existing.defect_notes || '';
        if (payload.defect_notes && !newNotes.includes(payload.defect_notes)) {
            newNotes = newNotes ? `${newNotes}; ${payload.defect_notes}` : payload.defect_notes;
        }

        const patch = {
            master_data_id: payload.master_data_id || existing.master_data_id || null,
            po_no: payload.po_number || existing.po_no,
            material_name: payload.material_name || existing.material_name,
            item_description: payload.item_description || existing.item_description,
            ...(isRaw ? { ok: updatedOk, no_qty: updatedNoQ } : {}),
            defect_notes: newNotes,
            status: payload.status || existing.status || 'done',
            inspection_date: payload.inspection_date || new Date().toISOString(),
            inspector_nik: payload.inspector_nik || existing.inspector_nik,
            approved_by_leader: payload.approved_by_leader || existing.approved_by_leader || '',
            ...(isRaw && evidenceUrl ? { evidence_url: evidenceUrl } : {}),
            ...(isRolling && evidenceUrl ? { evidence_url: evidenceUrl } : {}),
            ...(bUrl ? { bonding_test_url: bUrl } : {}),
            ...(payload.color_check_status ? { color_check_status: payload.color_check_status } : {}),
            ...(payload.color_check_result ? { color_check_result: payload.color_check_result } : {}),
            ...(payload.packaging_status ? { packaging_status: payload.packaging_status } : {}),
            ...(payload.roll_inspection_flag ? { roll_inspection_flag: payload.roll_inspection_flag } : {}),
            ...(payload.roll_inspection_percentage ? { roll_inspection_percentage: payload.roll_inspection_percentage } : {}),
            ...(payload.rolling_inspection ? { rolling_inspection: payload.rolling_inspection } : {}),
        };

        const { error } = await supabase
            .from('material_inspections')
            .update(patch)
            .eq('id', existing.id);

        if (error) throw new Error(error.message);

        // Update status master data
        if (payload.master_data_id) {
            const mdPatch = {
                updated_at: new Date().toISOString()
            };
            if (isRaw) mdPatch.raw_done = true;
            if (isRolling) mdPatch.rolling_done = true;
            if (isLam) mdPatch.laminating_done = true;
            if (isBonding) mdPatch.bonding_done = true;

            const { data: curMd } = await supabase
                .from('material_master_data')
                .select('raw_done, rolling_done, laminating_done, bonding_done, released_by')
                .eq('id', payload.master_data_id)
                .maybeSingle();

            const rDone = isRaw || Boolean(curMd?.raw_done);
            const rollDone = isRolling || Boolean(curMd?.rolling_done);
            const lDone = isLam || Boolean(curMd?.laminating_done);
            const bDone = isBonding || Boolean(curMd?.bonding_done);
            const totalSteps = (rDone ? 1 : 0) + (rollDone ? 1 : 0) + (lDone ? 1 : 0) + (bDone ? 1 : 0);
            const relBy = payload.released_by || curMd?.released_by || '';
            const isAdminRel = Boolean(relBy && (
                relBy.toLowerCase().includes('admin') ||
                relBy.toLowerCase().includes('supervisor') ||
                relBy.toLowerCase().includes('spv') ||
                relBy.toLowerCase().includes('manager')
            ));

            if ((payload.is_final_release && (totalSteps >= 3 || isAdminRel)) || totalSteps === 4) {
                mdPatch.status = 'done';
                mdPatch.released_by = payload.released_by || payload.inspector_name || payload.inspector_nik || 'Inspector';
                mdPatch.released_at = new Date().toISOString();
                if (payload.release_notes) mdPatch.release_notes = payload.release_notes;
            } else {
                mdPatch.status = 'in-progress';
            }

            await supabase
                .from('material_master_data')
                .update(mdPatch)
                .eq('id', payload.master_data_id);
        }

        return { status: 'ok', inspection_id: existing.inspection_id || inspectionId, message: payload.is_final_release ? 'Material berhasil diinspeksi & dirilis ke produksi!' : 'Data inspeksi berhasil diperbarui.' };
    }

    // INSERT BARIS PERTAMA
    let inspectTypeStr = payload.inspection_type || 'Raw Material';
    if (isRolling) inspectTypeStr = 'Rolling Inspection';
    else if (isLam) inspectTypeStr = 'Laminating';
    else if (isBonding) inspectTypeStr = 'Bonding Test';

    const row = {
        inspection_id:            inspectionId,
        master_data_id:           payload.master_data_id || null,
        po_no:                    payload.po_number || '',
        material_name:            payload.material_name || '',
        item_description:         payload.item_description || '',
        qty_receive:              payload.qty_receive || payload.planned_qty || 0,
        ok:                       isRaw ? ok : 0,
        no_qty:                   isRaw ? noQ : 0,
        receive_date:             parseDateSafe(payload.receive_date),
        status:                   payload.is_final_release ? 'done' : (payload.status || 'done'),
        inspection_date:          payload.inspection_date || new Date().toISOString(),
        inspector_nik:            payload.inspector_nik || payload.inspector_name || '',
        defect_notes:             payload.defect_notes || payload.bonding_notes || '',
        rolling_inspection:       isRolling ? 'Yes' : (payload.rolling_inspection || 'No'),
        approved_by_leader:       payload.approved_by_leader || '',
        evidence_url:             (isRaw || isRolling) ? evidenceUrl : '',
        inspection_type:          inspectTypeStr,
        color_check_status:       payload.color_check_status || '',
        color_check_result:       payload.color_check_result || '',
        packaging_status:         payload.packaging_status || '',
        packaging_reject_reason:  payload.packaging_reject_reason || '',
        roll_inspection_flag:     payload.roll_inspection_flag || (isRolling ? 'Yes' : ''),
        roll_inspection_percentage: payload.roll_inspection_percentage || '',
        bonding_test_url:         bUrl,
        input_type:               'manual',
    };

    const { error } = await supabase.from('material_inspections').insert(row);
    if (error) throw new Error(error.message);

    if (payload.master_data_id) {
        const mdPatch = {
            updated_at: new Date().toISOString()
        };
        if (isRaw) mdPatch.raw_done = true;
        if (isRolling) mdPatch.rolling_done = true;
        if (isLam) mdPatch.laminating_done = true;
        if (isBonding) mdPatch.bonding_done = true;

        const { data: curMd } = await supabase
            .from('material_master_data')
            .select('raw_done, rolling_done, laminating_done, bonding_done, released_by')
            .eq('id', payload.master_data_id)
            .maybeSingle();

        const rDone = isRaw || Boolean(curMd?.raw_done);
        const rollDone = isRolling || Boolean(curMd?.rolling_done);
        const lDone = isLam || Boolean(curMd?.laminating_done);
        const bDone = isBonding || Boolean(curMd?.bonding_done);
        const totalSteps = (rDone ? 1 : 0) + (rollDone ? 1 : 0) + (lDone ? 1 : 0) + (bDone ? 1 : 0);
        const relBy = payload.released_by || curMd?.released_by || '';
        const isAdminRel = Boolean(relBy && (
            relBy.toLowerCase().includes('admin') ||
            relBy.toLowerCase().includes('supervisor') ||
            relBy.toLowerCase().includes('spv') ||
            relBy.toLowerCase().includes('manager')
        ));

        if ((payload.is_final_release && (totalSteps >= 3 || isAdminRel)) || totalSteps === 4) {
            mdPatch.status = 'done';
            mdPatch.released_by = payload.released_by || payload.inspector_name || payload.inspector_nik || 'Inspector';
            mdPatch.released_at = new Date().toISOString();
            if (payload.release_notes) mdPatch.release_notes = payload.release_notes;
        } else {
            mdPatch.status = 'in-progress';
        }

        await supabase
            .from('material_master_data')
            .update(mdPatch)
            .eq('id', payload.master_data_id);
    }

    return { status: 'ok', inspection_id: inspectionId, message: payload.is_final_release ? 'Material berhasil diinspeksi & dirilis ke produksi!' : 'Data inspeksi berhasil disimpan.' };
}

/**
 * Rilis Material ke Produksi secara langsung (Ready to Deliver).
 * @param {number} masterDataId
 * @param {string} releasedBy
 * @param {string} releaseNotes
 */
export async function apiReleaseMaterialToProduction({ masterDataId, releasedBy, releaseNotes = '' }) {
    if (!masterDataId) throw new Error('masterDataId wajib diisi.');
    const now = new Date().toISOString();
    const patch = {
        status: 'done',
        released_by: releasedBy || 'Inspector',
        released_at: now,
        release_notes: releaseNotes || 'Dirilis ke produksi oleh inspector',
        updated_at: now
    };

    const { data, error } = await supabase
        .from('material_master_data')
        .update(patch)
        .eq('id', masterDataId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return { success: true, data };
}

/**
 * Update data inspeksi spesifik (Admin edit).
 */
export async function apiUpdateInspection(id, patch) {
    const { data, error } = await supabase
        .from('material_inspections')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Hapus data inspeksi (Admin delete) dengan mekanisme Self-Healing:
 * Otomatis mengembalikan status Master Data ke 'pending' jika tidak ada inspeksi tersisa.
 */
export async function apiDeleteInspection(id) {
    // 1. Ambil data inspeksi sebelum dihapus untuk mengetahui master_data_id
    const { data: insp } = await supabase
        .from('material_inspections')
        .select('id, master_data_id, po_no, material_name')
        .eq('id', id)
        .maybeSingle();

    // 2. Hapus baris inspeksi
    const { error } = await supabase
        .from('material_inspections')
        .delete()
        .eq('id', id);
    if (error) throw new Error(error.message);

    // 3. Self-healing: Cek sisa inspeksi untuk master_data terkait
    if (insp) {
        let mdId = insp.master_data_id;
        if (!mdId && insp.po_no && insp.material_name) {
            const { data: md } = await supabase
                .from('material_master_data')
                .select('id')
                .eq('po_number', insp.po_no)
                .eq('material_name', insp.material_name)
                .maybeSingle();
            if (md) mdId = md.id;
        }

        if (mdId) {
            const { data: remaining } = await supabase
                .from('material_inspections')
                .select('id, ok, no_qty, status')
                .eq('master_data_id', mdId);

            let newStatus = 'pending';
            if (remaining && remaining.length > 0) {
                const totalChecked = remaining.reduce((sum, r) => sum + (Number(r.ok) || 0) + (Number(r.no_qty) || 0), 0);
                const hasDone = remaining.some(r => r.status === 'done' || r.status === 'pass');
                if (hasDone) {
                    newStatus = 'done';
                } else if (totalChecked > 0) {
                    newStatus = 'in-progress';
                }
            }

            // Restore status ke master_data
            await supabase
                .from('material_master_data')
                .update({ status: newStatus })
                .eq('id', mdId);
        }
    }

    return { success: true };
}

// ─── PASS ALL ─────────────────────────────────────────────────

/**
 * Batch Pass All — memanggil RPC fn_pass_all_materials.
 * @param {number[]} rowIds     - array ID dari material_master_data
 * @param {string}  adminNik
 * @param {string}  adminName
 * @param {string}  reason
 */
export async function apiPassAll(rowIds, adminNik, adminName, reason = '') {
    const cleanIds = (Array.isArray(rowIds) ? rowIds : [])
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0);

    if (cleanIds.length === 0) {
        return { success: true, passed_count: 0, message: '0 item diproses (tidak ada ID valid).' };
    }

    const { data, error } = await supabase.rpc('fn_pass_all_materials', {
        target_ids: cleanIds,
        admin_nik:  adminNik,
        admin_name: adminName,
        p_reason:   reason || 'Sertifikat CoA / Lab Test Vendor Valid',
    });
    if (error) throw new Error(error.message);

    // Client-side self-healing: Sinkronisasikan item_description & supplier_name pada material_inspections yang baru dibuat
    try {
        if (rowIds && rowIds.length > 0) {
            const { data: mdRows } = await supabase
                .from('material_master_data')
                .select('id, material_name, material_description, supplier_name, supplier')
                .in('id', rowIds);

            if (mdRows && mdRows.length > 0) {
                for (const md of mdRows) {
                    const desc = md.material_description || md.material_name || '';
                    const sup = md.supplier_name || md.supplier || '';
                    if (desc || sup) {
                        await supabase
                            .from('material_inspections')
                            .update({
                                item_description: desc,
                                supplier_name: sup
                            })
                            .eq('master_data_id', md.id)
                            .or('item_description.is.null,item_description.eq.');
                    }
                }
            }
        }
    } catch (syncErr) {
        console.warn('[PassAll] Background sync warning:', syncErr);
    }

    return data;
}

// ─── CLAIMS ──────────────────────────────────────────────────

/**
 * Submit klaim — memanggil RPC fn_submit_claim_material.
 */
export async function apiSubmitClaim({ masterDataId, claimQty, reason, refNumber, submittedBy }) {
    const { data, error } = await supabase.rpc('fn_submit_claim_material', {
        p_master_data_id: masterDataId,
        p_claim_qty:      claimQty,
        p_reason:         reason,
        p_ref_number:     refNumber || '',
        p_submitted_by:   submittedBy,
    });
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Ambil riwayat claims.
 */
export async function apiGetClaims({ poNumber = '', limit = 200 } = {}) {
    let query = supabase
        .from('material_claims')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (poNumber) query = query.ilike('po_number', `%${poNumber}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { data: data || [] };
}

// ─── USERS (tabel material_users khusus IQC Material) ─────────

/**
 * Ambil daftar users dari tabel material_users Supabase.
 */
export async function apiGetUsers() {
    let { data, error } = await supabase
        .from('material_users')
        .select('*')
        .order('display_name', { ascending: true });

    // Fallback ke app_users jika material_users belum dimigrasi
    if (error && (error.code === '42P01' || error.message.includes('not found') || error.message.includes('does not exist'))) {
        const fb = await supabase.from('app_users').select('*').order('display_name', { ascending: true });
        if (fb.error) throw new Error(fb.error.message);
        data = fb.data;
    } else if (error) {
        throw new Error(error.message);
    }

    return { data: data || [] };
}

/**
 * Buat atau update user material di material_users.
 */
export async function apiSaveUser(userData) {
    const { nik, name, role, isNew, material_assignment, password } = userData;

    // 1. Prioritaskan Supabase RPC create_supabase_user (sinkronisasi Auth + app_users + material_users)
    try {
        const { data: rpcUserId, error: rpcErr } = await supabase.rpc('create_supabase_user', {
            p_nik: String(nik).trim(),
            p_name: String(name).trim(),
            p_role: String(role).trim().toLowerCase(),
            p_password: (password && password.trim()) ? password.trim() : (isNew ? 'user123' : ''),
            p_material_assignment: material_assignment || '',
        });

        if (!rpcErr && rpcUserId) {
            return { success: true, user_id: rpcUserId };
        }
        if (rpcErr) {
            console.warn('RPC create_supabase_user failed, falling back:', rpcErr);
        }
    } catch (rpcEx) {
        console.warn('RPC create_supabase_user exception, falling back:', rpcEx);
    }

    if (isNew) {
        // Panggil Vercel serverless function
        const res = await fetch('/api/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nik,
                display_name: name,
                role,
                password: userData.password,
                material_assignment: material_assignment || '',
                module: 'material',
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Gagal membuat user' }));
            throw new Error(err.error || 'Gagal membuat user');
        }
        return await res.json();
    }

    // Update user yang sudah ada di material_users
    let { data, error } = await supabase
        .from('material_users')
        .update({
            display_name: name,
            role,
            material_assignment: material_assignment || '',
            updated_at: new Date().toISOString(),
        })
        .eq('nik', nik)
        .select()
        .single();

    // Fallback update ke app_users jika material_users belum dibuat
    if (error && (error.code === '42P01' || error.message.includes('not found') || error.message.includes('does not exist'))) {
        const fb = await supabase
            .from('app_users')
            .update({ display_name: name, role, material_assignment: material_assignment || '' })
            .eq('nik', nik)
            .select()
            .single();
        if (fb.error) throw new Error(fb.error.message);
        data = fb.data;
    } else if (error) {
        throw new Error(error.message);
    }

    return data;
}

/**
 * Hapus user dari material_users.
 */
export async function apiDeleteUser(nik) {
    const res = await fetch('/api/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nik, module: 'material' }),
    });
    if (!res.ok) {
        // Jika endpoint serverless gagal, coba delete langsung dari material_users via supabase client
        const { error: delErr } = await supabase.from('material_users').delete().eq('nik', nik);
        if (delErr) {
            const err = await res.json().catch(() => ({ error: 'Gagal menghapus user' }));
            throw new Error(err.error || delErr.message);
        }
        return { success: true };
    }
    return await res.json();
}

// ─── MATERIAL ASSIGNMENTS ─────────────────────────────────────

export async function apiGetAssignments() {
    const { data, error } = await supabase
        .from('material_assignments')
        .select('*')
        .order('material_type', { ascending: true });
    if (error) throw new Error(error.message);
    return { data: data || [] };
}

export async function apiSaveAssignment({ materialType, inspectorNik, inspectorName, updatedBy, id }) {
    if (id) {
        // Update existing row
        const { data, error } = await supabase
            .from('material_assignments')
            .update({
                material_type:  materialType,
                inspector_nik:  inspectorNik,
                inspector_name: inspectorName,
                updated_by:     updatedBy,
                updated_at:     new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    } else {
        // Insert new row (allows multiple inspectors per material_type)
        const { data, error } = await supabase
            .from('material_assignments')
            .insert({
                material_type:  materialType,
                inspector_nik:  inspectorNik,
                inspector_name: inspectorName,
                updated_by:     updatedBy,
                updated_at:     new Date().toISOString(),
            })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }
}

export async function apiDeleteAssignment(id) {
    const { error } = await supabase
        .from('material_assignments')
        .delete()
        .eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────

/**
 * Normalize baris master data dari Supabase ke format yang dipakai frontend.
 */
function normalizeRow(row) {
    const inspections = Array.isArray(row.material_inspections)
        ? row.material_inspections
        : (row.material_inspections ? [row.material_inspections] : []);

    let rawDone = Boolean(row.raw_done);
    let rollingDone = Boolean(row.rolling_done);
    let lamDone = Boolean(row.laminating_done);
    let bondDone = Boolean(row.bonding_done);
    let checkedQty = 0;

    inspections.forEach(insp => {
        const ok = Number(insp.ok) || 0;
        const noQ = Number(insp.no_qty) || 0;
        const total = ok + noQ;
        checkedQty += total;

        const itype = String(insp.inspection_type || '').toLowerCase();
        if (itype.includes('rolling') || String(insp.rolling_inspection || '').toLowerCase() === 'yes' || String(insp.roll_inspection_flag || '').toLowerCase() === 'yes') {
            rollingDone = true;
        }
        if (itype.includes('laminating')) {
            lamDone = true;
        }
        if (itype.includes('bonding') || (insp.bonding_test_url && String(insp.bonding_test_url).trim() !== '')) {
            bondDone = true;
        }
        const colorStatus = String(insp.color_check_status || '').trim().toUpperCase();
        const pkgStatus = String(insp.packaging_status || '').trim().toUpperCase();
        if (colorStatus === 'YES' || colorStatus === 'NO' || pkgStatus === 'YES' || pkgStatus === 'NO') {
            lamDone = true;
        }
        if (itype.includes('raw') || total > 0 || (insp.evidence_url && String(insp.evidence_url).trim() !== '')) {
            rawDone = true;
        }
    });

    // Fallback jika status master data sudah done dari batch pass all (tanpa inspeksi manual)
    if ((row.status || '').toLowerCase() === 'done' && !rawDone && !rollingDone && !lamDone && !bondDone && row.released_by) {
        rawDone = true;
        rollingDone = true;
        lamDone = true;
        bondDone = true;
    }

    const stepsCount = (rawDone ? 1 : 0) + (rollingDone ? 1 : 0) + (lamDone ? 1 : 0) + (bondDone ? 1 : 0);
    const isReleasedByAdmin = Boolean(row.released_by && (
        row.released_by.toLowerCase().includes('admin') ||
        row.released_by.toLowerCase().includes('supervisor') ||
        row.released_by.toLowerCase().includes('spv') ||
        row.released_by.toLowerCase().includes('manager')
    ));

    // Syarat Ready to Deliver:
    // 1. Sudah berstatus done di database DAN minimal 3 tahapan terpenuhi, ATAU
    // 2. Seluruh 4 tahapan selesai, ATAU
    // 3. Dirilis resmi oleh Admin/Supervisor (Admin Override).
    const isAllDone = (stepsCount >= 3 && (row.status || '').toLowerCase() === 'done') ||
                      (stepsCount === 4) ||
                      (isReleasedByAdmin && (row.status || '').toLowerCase() === 'done');
    const isPartial = !isAllDone && (stepsCount > 0 || checkedQty > 0 || (row.status || '').toLowerCase() === 'in-progress' || (row.status || '').toLowerCase() === 'done');
    const computedStatus = isAllDone ? 'done' : (isPartial ? 'in-progress' : (row.status || 'pending').toLowerCase());

    const supName = (row.supplier_name && String(row.supplier_name).trim() !== '') ? String(row.supplier_name).trim() : '';
    const sup = (row.supplier && String(row.supplier).trim() !== '') ? String(row.supplier).trim() : '';
    const vendorName = supName || sup || '';
    const matDesc = row.material_description || row.item_description || '';

    return {
        id:                   row.id,
        row_idx:              row.id,  // alias agar kompatibel dengan kode lama
        po_number:            row.po_number || '',
        material_name:        row.material_name || '',
        material_description: matDesc,
        item_description:     matDesc,
        uom:                  row.uom || '',
        vendor_name:          vendorName,
        supplier_name:        vendorName,
        supplier:             sup,
        style:                row.product_code || '',
        model_shoe:           row.model_name || '',
        planned_qty:          Number(row.batch_size) || 0,
        checked_qty:          checkedQty,
        balance_qty:          Math.max(0, (Number(row.batch_size) || 0) - checkedQty),
        receive_date:         row.receive_date || '',
        status:               computedStatus,
        material_type:        row.material_type || '',
        raw_done:             rawDone,
        rolling_done:         rollingDone,
        laminating_done:      lamDone,
        bonding_done:         bondDone,
        released_by:          row.released_by || '',
        released_at:          row.released_at || '',
        release_notes:        row.release_notes || '',
        po_area:              row.po_area || '',
        bucket:               row.bucket || '',
        shipment_number:      row.shipment_number || '',
        no_bc:                row.no_bc || '',
        bc_type:              row.bc_type || '',
        receive_number:       row.receive_number || '',
        uploaded_by:          row.uploaded_by || '',
        created_at:           row.created_at || '',
    };
}

/**
 * Parse berbagai format tanggal menjadi string 'YYYY-MM-DD'.
 */
function parseDateSafe(val) {
    if (!val) return null;

    // SheetJS Date object
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Excel serial number (e.g., 45516)
    if (typeof val === 'number') {
        const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (!isNaN(dateObj.getTime())) {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }

    let s = String(val).trim();
    if (!s) return null;

    // ISO format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];

    // Check for DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, etc.
    const sep = s.includes('/') ? '/' : (s.includes('-') ? '-' : (s.includes('.') ? '.' : ''));
    if (sep) {
        const parts = s.split(sep);
        if (parts.length === 3) {
            let y, m, d;
            if (parts[0].length === 4) {
                // YYYY-MM-DD
                y = parts[0]; m = parts[1]; d = parts[2];
            } else if (parts[2].length === 4 || parts[2].length === 2) {
                // DD-MM-YYYY or MM-DD-YYYY
                y = parts[2].length === 2 ? '20' + parts[2].padStart(2, '0') : parts[2];
                if (Number(parts[0]) > 12) {
                    d = parts[0]; m = parts[1];
                } else {
                    d = parts[0]; m = parts[1];
                }
            }
            if (y && m && d) {
                const yr = Number(y);
                const mo = String(Number(m)).padStart(2, '0');
                const dy = String(Number(d)).padStart(2, '0');
                if (yr > 1900 && yr < 2100 && Number(mo) >= 1 && Number(mo) <= 12 && Number(dy) >= 1 && Number(dy) <= 31) {
                    return `${yr}-${mo}-${dy}`;
                }
            }
        }
    }

    // Compact YYYYMMDD (e.g. SAP export 20240525)
    if (/^\d{8}$/.test(s)) {
        const yr = s.slice(0, 4);
        const mo = s.slice(4, 6);
        const dy = s.slice(6, 8);
        if (Number(yr) > 1900 && Number(yr) < 2100 && Number(mo) >= 1 && Number(mo) <= 12 && Number(dy) >= 1 && Number(dy) <= 31) {
            return `${yr}-${mo}-${dy}`;
        }
    }

    // Standard JS Date fallback
    const dt = new Date(s);
    if (!isNaN(dt.getTime()) && dt.getFullYear() > 1900) {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    return null;
}

/**
 * Upload file evidence ke Google Drive via GAS micro-uploader.
 * Menggantikan Supabase Storage agar tidak memakan limit free tier.
 */
async function uploadEvidenceFile(fileDataBase64, fileName, mimeType, meta = {}) {
    try {
        const gasUrl = MATERIAL_GAS_URL || 'https://script.google.com/macros/s/AKfycbxPpUaDT-1xipllWqR4d-hrEDCK2AcR5d5oM7euWuTVIcSXyNXohz4dE5MK85WeIL8pRQ/exec';
        const res = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({
                action: 'uploadEvidence',
                file_data: fileDataBase64,
                file_name: fileName,
                file_type: mimeType || 'image/png',
                category: meta.category || (meta.inspection_type === 'Bonding Test' ? 'bonding' : 'evidence'),
                po_number: meta.po_number || '',
                material_name: meta.material_name || '',
                inspection_type: meta.inspection_type || ''
            })
        });

        if (res.ok) {
            const resData = await res.json();
            if (resData && resData.status === 'ok') {
                return resData.evidenceUrl || resData.directUrl || '';
            }
        }
        return '';
    } catch (e) {
        console.warn('uploadEvidenceFile ke Google Drive error:', e);
        return '';
    }
}

// ============================================================
// ─── SUBCONT SUPABASE API SERVICE (100% IDENTIK SPREADSHEET) ─
// ============================================================

const GAS_EVIDENCE_URL = 'https://script.google.com/macros/s/AKfycbxt5mmTI3bTAFMpaDo6VgVoKk8raDecfOoCbqsZgdK1-BwErb-VHROC0RSj8O8NYoR-JA/exec';

/**
 * Upload evidence photo ke Google Drive via GAS
 */
export async function uploadSubcontEvidenceFile(base64Data, fileName, contentType = 'image/png') {
    try {
        const res = await fetch(GAS_EVIDENCE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'uploadEvidence',
                file_data: base64Data,
                file_name: fileName,
                file_type: contentType
            })
        });
        if (res.ok) {
            const resData = await res.json();
            if (resData && resData.status === 'ok') {
                return resData.evidenceUrl || resData.directUrl || '';
            }
        }
        return '';
    } catch (err) {
        console.warn('Gagal upload evidence ke Google Drive:', err);
        return '';
    }
}

/**
 * Submit Sesi Inspeksi Subcont secara atomik ke 2 tabel:
 * 1. subcont_inspections (Sheet 1)
 * 2. subcont_defect_logs (Sheet 2)
 */
export async function apiSubmitSubcontInspection(payload) {
    let evidenceUrl = payload.evidence_url || '';

    // Upload evidence ke storage jika ada file base64
    if (payload.file_data && payload.file_name) {
        evidenceUrl = await uploadSubcontEvidenceFile(
            payload.file_data,
            payload.file_name,
            payload.file_type || 'image/png'
        );
    }

    const sessionId = payload.sessionId || (`SESS-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
    const dateIncoming = payload.tanggalIncoming ? payload.tanggalIncoming.substring(0, 10) : null;
    const dateInsp = payload.tanggalInspection ? payload.tanggalInspection.substring(0, 10) : new Date().toISOString().substring(0, 10);
    const dateBucket = payload.tanggalBucket ? payload.tanggalBucket.substring(0, 10) : null;

    const qtyIncoming = Number(payload.qtyIncoming) || 0;
    const qtyInspect = Number(payload.qtyInspect) || 0;
    const qtyPass = Number(payload.pass) || 0;
    const qtyDefect = Number(payload.defect) || 0;
    const ftt = qtyInspect > 0 ? Number((qtyPass / qtyInspect).toFixed(4)) : (payload.ftt || 0);
    const redoRate = qtyInspect > 0 ? Number((qtyDefect / qtyInspect).toFixed(4)) : (payload.redoRate || 0);

    // 1. Simpan Header ke subcont_inspections
    const headerRow = {
        session_id:     sessionId,
        timestamp:      payload.timestamp || new Date().toISOString(),
        date:           dateIncoming,
        material_type:  payload.materialType || '',
        user_login:     payload.auditor || '',
        vendor:         payload.vendor || '',
        component:      payload.component || '',
        process:        payload.process || '',
        style_number:   payload.styleNumber || '',
        model:          payload.modelName || '',
        qty_incoming:   qtyIncoming,
        qty_inspect:    qtyInspect,
        qty_pass:       qtyPass,
        qty_defect:     qtyDefect,
        ftt:            ftt,
        redo_rate:      redoRate,
        tanggal_insp:   dateInsp,
        bucket:         dateBucket,
        approved_by:    payload.approvedByLeader || '',
        evidence_url:   evidenceUrl,
        status:         payload.status || 'Done',
        updated_at:     new Date().toISOString(),
    };

    const { error: headerErr } = await supabase
        .from('subcont_inspections')
        .upsert(headerRow, { onConflict: 'session_id' });

    if (headerErr) throw new Error(`Gagal menyimpan header inspeksi: ${headerErr.message}`);

    // 2. Simpan Detail Cacat ke subcont_defect_logs
    if (Array.isArray(payload.items) && payload.items.length > 0) {
        // Hapus defect lama jika ini update session
        await supabase.from('subcont_defect_logs').delete().eq('session_id', sessionId);

        const defectRows = [];
        payload.items.forEach(item => {
            if (Array.isArray(item.defects) && item.defects.length > 0) {
                item.defects.forEach(d => {
                    const count = Number(d.count || d.qty || 1);
                    const defectName = d.type || d.defectType || d.issue_finding || d.name || '';
                    if (count > 0 && defectName) {
                        defectRows.push({
                            session_id:    sessionId,
                            date:          dateInsp,
                            vendor:        payload.vendor || '',
                            component:     item.component || '',
                            issue_finding: defectName,
                            count:         count,
                        });
                    }
                });
            } else if (Number(item.defect) > 0) {
                // Fallback jika tidak ada breakdown detail
                defectRows.push({
                    session_id:    sessionId,
                    date:          dateInsp,
                    vendor:        payload.vendor || '',
                    component:     item.component || '',
                    issue_finding: 'DEFECT GENERAL',
                    count:         Number(item.defect),
                });
            }
        });

        if (defectRows.length > 0) {
            const { error: defErr } = await supabase
                .from('subcont_defect_logs')
                .insert(defectRows);

            if (defErr) console.warn('Warning: Gagal menyimpan beberapa baris defect_logs:', defErr);
        }
    }

    return {
        success: true,
        sessionId: sessionId,
        message: 'Data inspeksi berhasil disimpan ke Supabase!',
    };
}

/**
 * Ambil daftar sesi inspeksi untuk galeri / Inspection Log
 */
export async function apiGetSubcontInspectionSessions({
    startDate = '',
    endDate = '',
    vendor = '',
    auditor = '',
    status = '',
    page = 1,
    limit = 100,
} = {}) {
    let query = supabase
        .from('subcont_inspections')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false });

    if (startDate) query = query.gte('tanggal_insp', startDate);
    if (endDate)   query = query.lte('tanggal_insp', endDate);
    if (vendor && vendor !== 'all')   query = query.ilike('vendor', `%${vendor}%`);
    if (auditor && auditor !== 'all') query = query.ilike('user_login', `%${auditor}%`);
    if (status && status !== 'all')   query = query.eq('status', status);

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
        data: data || [],
        total: count || 0,
        page,
        limit,
    };
}

/**
 * Ambil daftar defect logs (Sheet 2)
 */
export async function apiGetSubcontDefectLogs({
    startDate = '',
    endDate = '',
    vendor = '',
    component = '',
    issueFinding = '',
    limit = 500,
} = {}) {
    let query = supabase
        .from('subcont_defect_logs')
        .select('*')
        .order('date', { ascending: false })
        .limit(limit);

    if (startDate) query = query.gte('date', startDate);
    if (endDate)   query = query.lte('date', endDate);
    if (vendor && vendor !== 'all')       query = query.ilike('vendor', `%${vendor}%`);
    if (component && component !== 'all') query = query.ilike('component', `%${component}%`);
    if (issueFinding) query = query.ilike('issue_finding', `%${issueFinding}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return { data: data || [] };
}

/**
 * Helper auto-chunking untuk bypass PostgREST max_rows = 1000
 */
export async function fetchSupabaseAll(queryBuilderOrFn, maxRows = Infinity, chunkSize = 1000) {
    let allData = [];
    let from = 0;
    while (allData.length < maxRows) {
        const batchLimit = Math.min(chunkSize, maxRows - allData.length);
        const to = from + batchLimit - 1;
        const query = typeof queryBuilderOrFn === 'function' ? queryBuilderOrFn(from, to) : queryBuilderOrFn;
        const req = query && typeof query.range === 'function' ? query.range(from, to) : query;
        const { data, error } = await req;
        if (error) throw error;
        const rows = data || [];
        allData = allData.concat(rows);
        if (rows.length < batchLimit) break;
        from += rows.length;
    }
    return allData;
}

/**
 * Ambil data lengkap untuk Analytics Dashboard Subcont
 */
export async function apiGetSubcontDashboardData({ startDate = '', endDate = '' } = {}) {
    const qSessionsFn = () => {
        let q = supabase.from('subcont_inspections').select('*').order('date', { ascending: true });
        if (startDate) q = q.gte('date', startDate);
        if (endDate) q = q.lte('date', endDate);
        return q;
    };
    const qDefectsFn = () => {
        let q = supabase.from('subcont_defect_logs').select('*').order('date', { ascending: true });
        if (startDate) q = q.gte('date', startDate);
        if (endDate) q = q.lte('date', endDate);
        return q;
    };

    const [sessions, defects] = await Promise.all([
        fetchSupabaseAll(qSessionsFn),
        fetchSupabaseAll(qDefectsFn)
    ]);

    return {
        sessions: sessions || [],
        defects: defects || [],
    };
}

/**
 * Export Multi-Sheet Excel (Sheet 1: Sesi Inspeksi, Sheet 2: Defect Breakdown)
 */
export function exportSubcontLogToMultiSheetExcel(sessions, defects, filenamePrefix = 'IQC_Subcont_Log') {
    if (typeof XLSX === 'undefined') {
        alert('Library SheetJS (xlsx) belum dimuat.');
        return;
    }

    const wb = XLSX.utils.book_new();

    const cleanDateVal = (val) => {
        if (!val) return '';
        const str = String(val).trim();
        if (str.includes(',')) {
            const parts = str.split(',').map(s => s.trim()).filter(Boolean);
            return parts.pop() || '';
        }
        if (str.includes('T')) {
            return str.substring(0, 10);
        }
        return str.substring(0, 10);
    };

    // ── Sheet 1: Inspection Sessions ──
    const sessionRows = (sessions || []).map(s => ({
        'SessionID':           s.session_id || '',
        'Timestamp Input':     s.timestamp ? String(s.timestamp).replace('T', ' ').substring(0, 19) : '',
        'Tanggal Incoming':    cleanDateVal(s.date),
        'Material Type':       s.material_type || '',
        'Inspection Location': (s.inspection_location || '').toLowerCase().includes('vendor') ? 'In-Vendor Inspection' : 'In-House Inspection',
        'User Login':          s.user_login || '',
        'Vendor':              s.vendor || '',
        'Component':           s.component || '',
        'Process':             s.process || '',
        'Style Number':        s.style_number || '',
        'Model':               s.model || '',
        'Qty Incoming':        Number(s.qty_incoming) || 0,
        'Qty Inspect':         Number(s.qty_inspect) || 0,
        'Qty Pass':            Number(s.qty_pass) || 0,
        'Qty Defect':          Number(s.qty_defect) || 0,
        'FTT (%)':             s.ftt ? (Number(s.ftt) * 100).toFixed(1) + '%' : '',
        'Tanggal Inspeksi':    cleanDateVal(s.tanggal_insp),
        'Tanggal Bucket':      cleanDateVal(s.bucket),
        'ApprovedBy':          s.approved_by || '',
        'EvidenceUrl':         s.evidence_url || '',
        'Status':              s.status || 'Done',
    }));

    const ws1 = XLSX.utils.json_to_sheet(sessionRows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Inspection_Sessions');

    // ── Sheet 2: Defect Breakdown ──
    const defectRows = (defects || []).map(d => ({
        'SessionId':        d.session_id || '',
        'Tanggal Inspeksi': cleanDateVal(d.date),
        'Vendor':           d.vendor || '',
        'Component':        d.component || '',
        'Issue Finding':    d.issue_finding || '',
        'Count':            Number(d.count) || 0,
    }));

    const ws2 = XLSX.utils.json_to_sheet(defectRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Defect_Breakdown');

    const nowStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    XLSX.writeFile(wb, `${filenamePrefix}_${nowStr}.xlsx`);
}
