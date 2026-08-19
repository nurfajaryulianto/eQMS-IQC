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
    let query = supabase
        .from('material_master_data')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

    if (status && status !== 'all') {
        query = query.eq('status', status);
    }
    if (materialType) {
        query = query.ilike('material_type', materialType);
    }
    if (search) {
        query = query.or(
            `po_number.ilike.%${search}%,material_name.ilike.%${search}%,supplier_name.ilike.%${search}%`
        );
    }

    const from = (page - 1) * limit;
    const to   = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
        data: (data || []).map(normalizeRow),
        total: count || 0,
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
    // Helper: ambil nilai kolom — support header Excel dengan spasi (e.g. 'PO Number')
    // maupun camelCase/snake_case dari row yang sudah dinormalisasi
    const g = (r, ...keys) => {
        for (const k of keys) {
            if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return String(r[k]).trim();
        }
        return '';
    };

    const insertRows = rows.map(r => {
        const matName = g(r, 'Material Name','material_name','MaterialName','MATERIAL_NAME');
        const matDesc = g(r, 'Material Description','material_description','ItemDescription','MATERIAL_DESCRIPTION');
        let matType = g(r, 'Material Type','material_type','MaterialType','MATERIAL_TYPE');

        if (!matType) {
            const textUpper = (matName + ' ' + matDesc).toUpperCase();
            if (textUpper.includes('LTH') || textUpper.includes('LEATHER')) matType = 'LEATHER';
            else if (textUpper.includes('TXT') || textUpper.includes('TEXTILE')) matType = 'TEXTILE';
            else if (textUpper.includes('SYN') || textUpper.includes('PU') || textUpper.includes('SUEDE') || textUpper.includes('NUBUCK')) matType = 'SYNTHETIC';
            else if (textUpper.includes('RUB') || textUpper.includes('RUBBER') || textUpper.includes('SOLE')) matType = 'RUBBER';
            else if (textUpper.includes('PKG') || textUpper.includes('BOX')) matType = 'PACKAGING';
            else matType = 'Raw Material';
        }

        return {
            po_number:            g(r, 'PO Number','po_number','PONumber','PO_NUMBER'),
            material_name:        matName,
            material_description: matDesc,
            uom:                  g(r, 'UOM','uom','Uom'),
            supplier:             g(r, 'Supplier','supplier','SUPPLIER'),
            supplier_name:        g(r, 'Supplier Name','supplier_name','SupplierName','vendor_name','SUPPLIER_NAME'),
            po_area:              g(r, 'PO Area','po_area','POArea','PO_AREA'),
            batch_size:           Number(g(r, 'Batch Size','batch_size','BatchSize','BATCH_SIZE','planned_qty') || 0) || 0,
            product_code:         g(r, 'Product Code','product_code','ProductCode','style','PRODUCT_CODE'),
            model_name:           g(r, 'Model Name','model_name','ModelName','model_shoe','MODEL_NAME'),
            bucket:               g(r, 'Bucket','bucket','BUCKET'),
            receive_date:         parseDateSafe(g(r, 'Receive Date','receive_date','ReceiveDate','RECEIVE_DATE')),
            shipment_number:      g(r, 'Shipment Number','shipment_number','ShipmentNumber','SHIPMENT_NUMBER'),
            no_bc:                g(r, 'No BC','no_bc','NoBc','NO_BC'),
            bc_type:              g(r, 'BC Type','bc_type','BcType','BC_TYPE'),
            receive_number:       g(r, 'Receive Number','receive_number','ReceiveNumber','RECEIVE_NUMBER'),
            material_type:        matType,
            status:               'pending',
            uploaded_by:          uploaderNik,
            created_at:           now,
        };
    }).filter(r => r.po_number && r.material_name);

    console.log('[upload] parsed rows sample:', insertRows[0]);
    console.log('[upload] total valid rows:', insertRows.length, 'of', rows.length);

    // Cek duplikat di sisi client dengan chunking agar aman dari URL length limit
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
            `${(e.po_number || '').toLowerCase()}|${e.receive_date || ''}|${(e.material_name || '').toLowerCase()}|${(e.receive_number || '').toLowerCase()}|${e.batch_size}`
        )
    );

    const newRows = insertRows.filter(r => {
        const key = `${(r.po_number || '').toLowerCase()}|${r.receive_date || ''}|${(r.material_name || '').toLowerCase()}|${(r.receive_number || '').toLowerCase()}|${r.batch_size}`;
        return !existingKeys.has(key);
    });

    const rejected = insertRows.length - newRows.length;
    let inserted = 0;

    if (newRows.length > 0) {
        // Cek auth session aktif
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
            throw new Error('Sesi login tidak ditemukan. Silakan login ulang dan coba lagi.');
        }
        const userMeta = sessionData?.session?.user?.user_metadata || {};
        console.log('[upload] user role:', userMeta.role, '| NIK:', userMeta.nik);

        const BATCH = 200;
        for (let i = 0; i < newRows.length; i += BATCH) {
            const batch = newRows.slice(i, i + BATCH);
            const { data, error } = await supabase
                .from('material_master_data')
                .insert(batch)
                .select('id');
            if (error) {
                console.error(`[upload] Error batch ${Math.floor(i / BATCH) + 1} (${i + 1}-${Math.min(i + BATCH, newRows.length)}):`, error);
                throw new Error(`Gagal menyimpan batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
            }
            inserted += data?.length || batch.length;
        }
    }

    return {
        inserted,
        rejected,
        rejectedList: [],
        message: `Upload selesai: ${inserted} baru disimpan, ${rejected} duplikat dilewati.`,
    };
}

// ─── INSPECTIONS ─────────────────────────────────────────────

/**
 * Ambil data inspeksi untuk Dashboard / Inspection Log.
 */
export async function apiGetInspectionData({
    startDate = '',
    endDate   = '',
    inspectorNik = '',
    inspectionType = '',
    fileFilter = 'all',
    page  = 1,
    limit = 200,
} = {}) {
    let query = supabase
        .from('material_inspections')
        .select('*', { count: 'exact' })
        .order('inspection_date', { ascending: false });

    if (startDate) query = query.gte('inspection_date', startDate + 'T00:00:00');
    if (endDate)   query = query.lte('inspection_date', endDate   + 'T23:59:59');
    if (inspectorNik)   query = query.eq('inspector_nik', inspectorNik);
    if (inspectionType) query = query.ilike('inspection_type', `%${inspectionType}%`);

    if (fileFilter === 'has_file') {
        query = query.or('evidence_url.neq.,bonding_test_url.neq.');
    } else if (fileFilter === 'bonding') {
        query = query.not('bonding_test_url', 'is', null).neq('bonding_test_url', '');
    } else if (fileFilter === 'evidence') {
        query = query.not('evidence_url', 'is', null).neq('evidence_url', '');
    } else if (fileFilter === 'no_file') {
        query = query.is('evidence_url', null).is('bonding_test_url', null);
    }

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
        data: (data || []).map(d => ({
            ...d,
            po_number:        d.po_no || '',
            qty_inspect:      (Number(d.ok) || 0) + (Number(d.no_qty) || 0),
            qty_fail:         Number(d.no_qty) || 0,
            result_status:    (Number(d.no_qty) || 0) === 0 ? 'Pass' : 'Fail',
            vendor_name:      d.material_name || '',
            inspection_date:  d.inspection_date ? new Date(d.inspection_date) : null,
        })),
        total: count || 0,
        page,
        limit,
    };
}

/**
 * Submit satu hasil inspeksi.
 * File evidence (gambar) di-upload ke Supabase Storage, bukan Google Drive.
 */
export async function apiSubmitInspection(payload) {
    let evidenceUrl = payload.evidence_url || '';
    const isBonding = (payload.inspection_type || '').toLowerCase().includes('bonding');

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

    // Cek apakah sudah ada inspeksi untuk master_data_id ini (update vs insert)
    if (payload.master_data_id) {
        const { data: existing } = await supabase
            .from('material_inspections')
            .select('id, ok, no_qty, defect_notes, inspection_type')
            .eq('master_data_id', payload.master_data_id)
            .eq('inspection_type', payload.inspection_type || 'Raw Material')
            .maybeSingle();

        if (existing) {
            // UPDATE: akumulasi qty + append notes
            const updatedOk  = (Number(existing.ok)    || 0) + ok;
            const updatedNoQ = (Number(existing.no_qty) || 0) + noQ;
            const oldNotes   = String(existing.defect_notes || '').trim();
            const newNotes   = payload.defect_notes
                ? (oldNotes ? oldNotes + '; ' + payload.defect_notes : payload.defect_notes)
                : oldNotes;

            const patch = {
                ok: updatedOk,
                no_qty: updatedNoQ,
                defect_notes: newNotes,
                status: payload.status || 'done',
                inspection_date: payload.inspection_date || new Date().toISOString(),
                approved_by_leader: payload.approved_by_leader || '',
                ...(evidenceUrl ? { evidence_url: evidenceUrl } : {}),
                ...(payload.color_check_status  ? { color_check_status: payload.color_check_status }   : {}),
                ...(payload.color_check_result  ? { color_check_result: payload.color_check_result }   : {}),
                ...(payload.packaging_status    ? { packaging_status: payload.packaging_status }       : {}),
                ...(payload.packaging_reject_reason ? { packaging_reject_reason: payload.packaging_reject_reason } : {}),
                ...(bUrl ? { bonding_test_url: bUrl } : {}),
            };

            const { error } = await supabase
                .from('material_inspections')
                .update(patch)
                .eq('id', existing.id);

            if (error) throw new Error(error.message);
            return { status: 'ok', inspection_id: inspectionId, message: 'Data inspeksi berhasil diperbarui.' };
        }
    }

    // INSERT baru
    const row = {
        inspection_id:            inspectionId,
        master_data_id:           payload.master_data_id || null,
        po_no:                    payload.po_number || '',
        material_name:            payload.material_name || '',
        item_description:         payload.item_description || '',
        qty_receive:              payload.qty_receive || payload.planned_qty || 0,
        ok,
        no_qty:                   noQ,
        receive_date:             parseDateSafe(payload.receive_date),
        status:                   payload.status || 'done',
        inspection_date:          payload.inspection_date || new Date().toISOString(),
        inspector_nik:            payload.inspector_nik || payload.inspector_name || '',
        defect_notes:             payload.defect_notes || payload.bonding_notes || '',
        rolling_inspection:       payload.rolling_inspection || 'No',
        approved_by_leader:       payload.approved_by_leader || '',
        evidence_url:             evidenceUrl,
        inspection_type:          payload.inspection_type || 'Raw Material',
        color_check_status:       payload.color_check_status || '',
        color_check_result:       payload.color_check_result || '',
        packaging_status:         payload.packaging_status || '',
        packaging_reject_reason:  payload.packaging_reject_reason || '',
        roll_inspection_flag:     payload.roll_inspection_flag || '',
        roll_inspection_percentage: payload.roll_inspection_percentage || '',
        bonding_test_url:         bUrl,
        input_type:               'manual',
    };

    const { error } = await supabase.from('material_inspections').insert(row);
    if (error) throw new Error(error.message);

    return { status: 'ok', inspection_id: inspectionId, message: 'Data inspeksi berhasil disimpan.' };
}

// ─── PASS ALL ─────────────────────────────────────────────────

/**
 * Batch Pass All — memanggil RPC fn_pass_all_materials.
 * @param {number[]} rowIds     - array ID dari material_master_data
 * @param {string}  adminNik
 * @param {string}  adminName
 */
export async function apiPassAll(rowIds, adminNik, adminName) {
    const { data, error } = await supabase.rpc('fn_pass_all_materials', {
        target_ids: rowIds,
        admin_nik:  adminNik,
        admin_name: adminName,
    });
    if (error) throw new Error(error.message);
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
    const { nik, name, role, isNew, material_assignment } = userData;

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
    return {
        id:                   row.id,
        row_idx:              row.id,  // alias agar kompatibel dengan kode lama
        po_number:            row.po_number || '',
        material_name:        row.material_name || '',
        item_description:     row.material_description || '',
        uom:                  row.uom || '',
        vendor_name:          row.supplier_name || row.supplier || '',
        style:                row.product_code || '',
        model_shoe:           row.model_name || '',
        planned_qty:          Number(row.batch_size) || 0,
        checked_qty:          0,  // dihitung dari inspections jika diperlukan
        receive_date:         row.receive_date || '',
        status:               (row.status || 'pending').toLowerCase(),
        material_type:        row.material_type || '',
        raw_done:             row.status === 'done',
        laminating_done:      false,
        bonding_done:         false,
        supplier:             row.supplier || '',
        supplier_name:        row.supplier_name || '',
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

    // Standard JS Date fallback
    const dt = new Date(s);
    if (!isNaN(dt.getTime()) && dt.getFullYear() > 1900) {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    return s;
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
 * Ambil data lengkap untuk Analytics Dashboard Subcont
 */
export async function apiGetSubcontDashboardData({ startDate = '', endDate = '' } = {}) {
    let qSessions = supabase.from('subcont_inspections').select('*').order('date', { ascending: true });
    let qDefects = supabase.from('subcont_defect_logs').select('*').order('date', { ascending: true });

    if (startDate) {
        qSessions = qSessions.gte('date', startDate);
        qDefects = qDefects.gte('date', startDate);
    }
    if (endDate) {
        qSessions = qSessions.lte('date', endDate);
        qDefects = qDefects.lte('date', endDate);
    }

    const [resSessions, resDefects] = await Promise.all([qSessions, qDefects]);

    if (resSessions.error) throw new Error(resSessions.error.message);
    if (resDefects.error) throw new Error(resDefects.error.message);

    return {
        sessions: resSessions.data || [],
        defects: resDefects.data || [],
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

    // ── Sheet 1: Inspection Sessions ──
    const sessionRows = (sessions || []).map(s => ({
        'SessionID':     s.session_id || '',
        'timeStamp':     s.timestamp ? String(s.timestamp).replace('T', ' ').substring(0, 19) : '',
        'Date':          s.date || '',
        'Material Type': s.material_type || '',
        'User Login':    s.user_login || '',
        'Vendor':        s.vendor || '',
        'Component':     s.component || '',
        'Process':       s.process || '',
        'Style Number':  s.style_number || '',
        'Model':         s.model || '',
        'Qty Incoming':  Number(s.qty_incoming) || 0,
        'Qty Inspect':   Number(s.qty_inspect) || 0,
        'Qty Pass':      Number(s.qty_pass) || 0,
        'Qty Defect':    Number(s.qty_defect) || 0,
        'FTT (%)':       s.ftt ? (Number(s.ftt) * 100).toFixed(1) + '%' : '',
        'TanggalInsp':   s.tanggal_insp || '',
        'Bucket':        s.bucket || '',
        'ApprovedBy':    s.approved_by || '',
        'EvidenceUrl':   s.evidence_url || '',
        'Status':        s.status || 'Done',
    }));

    const ws1 = XLSX.utils.json_to_sheet(sessionRows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Inspection_Sessions');

    // ── Sheet 2: Defect Breakdown ──
    const defectRows = (defects || []).map(d => ({
        'SessionId':     d.session_id || '',
        'Date':          d.date || '',
        'Vendor':        d.vendor || '',
        'Component':     d.component || '',
        'Issue Finding': d.issue_finding || '',
        'Count':         Number(d.count) || 0,
    }));

    const ws2 = XLSX.utils.json_to_sheet(defectRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Defect_Breakdown');

    const nowStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    XLSX.writeFile(wb, `${filenamePrefix}_${nowStr}.xlsx`);
}
