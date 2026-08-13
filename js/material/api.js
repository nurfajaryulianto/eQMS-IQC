// ============================================================
// js/material/api.js — IQC Material: Supabase API Layer
// Menggantikan seluruh gasGet / gasPost / GAS Web App calls.
// Semua fungsi menggunakan Supabase JS SDK dari auth.js.
// ============================================================

import { supabase } from './auth.js';

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
    const insertRows = rows.map(r => ({
        po_number:            String(r.po_number || '').trim(),
        material_name:        String(r.material_name || r.MaterialName || '').trim(),
        material_description: String(r.material_description || r.ItemDescription || '').trim(),
        uom:                  String(r.uom || r.UOM || '').trim(),
        supplier:             String(r.supplier || r.Supplier || '').trim(),
        supplier_name:        String(r.supplier_name || r.SupplierName || r.vendor_name || '').trim(),
        po_area:              String(r.po_area || r.POArea || '').trim(),
        batch_size:           Number(r.batch_size || r.BatchSize || r.planned_qty || 0) || 0,
        product_code:         String(r.product_code || r.ProductCode || r.style || '').trim(),
        model_name:           String(r.model_name || r.ModelName || r.model_shoe || '').trim(),
        bucket:               String(r.bucket || r.Bucket || '').trim(),
        receive_date:         parseDateSafe(r.receive_date || r.ReceiveDate),
        shipment_number:      String(r.shipment_number || r.ShipmentNumber || '').trim(),
        no_bc:                String(r.no_bc || r.NoBc || '').trim(),
        bc_type:              String(r.bc_type || r.BcType || '').trim(),
        receive_number:       String(r.receive_number || r.ReceiveNumber || '').trim(),
        material_type:        String(r.material_type || r.MaterialType || '').trim(),
        status:               'pending',
        uploaded_by:          uploaderNik,
        created_at:           now,
    })).filter(r => r.po_number && r.material_name);

    // Cek duplikat di sisi client sebelum insert
    const { data: existing } = await supabase
        .from('material_master_data')
        .select('po_number, receive_date, material_name, receive_number, batch_size')
        .in('po_number', insertRows.map(r => r.po_number));

    const existingKeys = new Set(
        (existing || []).map(e =>
            `${e.po_number.toLowerCase()}|${e.receive_date || ''}|${e.material_name.toLowerCase()}|${(e.receive_number || '').toLowerCase()}|${e.batch_size}`
        )
    );

    const newRows = insertRows.filter(r => {
        const key = `${r.po_number.toLowerCase()}|${r.receive_date || ''}|${r.material_name.toLowerCase()}|${(r.receive_number || '').toLowerCase()}|${r.batch_size}`;
        return !existingKeys.has(key);
    });

    const rejected = insertRows.length - newRows.length;
    let inserted = 0;

    if (newRows.length > 0) {
        const BATCH = 200;
        for (let i = 0; i < newRows.length; i += BATCH) {
            const batch = newRows.slice(i, i + BATCH);
            const { data, error } = await supabase
                .from('material_master_data')
                .insert(batch)
                .select();
            if (error) throw new Error(error.message);
            inserted += data?.length || 0;
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

    // Upload evidence file ke Supabase Storage jika ada
    if (payload.file_data && payload.file_name) {
        evidenceUrl = await uploadEvidenceFile(
            payload.file_data,
            payload.file_name,
            payload.file_type || 'image/png'
        );
    }

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
                ...(payload.bonding_test_url    ? { bonding_test_url: payload.bonding_test_url }       : {}),
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
        bonding_test_url:         payload.bonding_test_url || '',
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

// ─── USERS (dari app_users yang sudah ada) ────────────────────

/**
 * Ambil daftar users dari tabel app_users Supabase.
 */
export async function apiGetUsers() {
    const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('display_name', { ascending: true });
    if (error) throw new Error(error.message);
    return { data: data || [] };
}

/**
 * Buat atau update user.
 * Untuk create: gunakan Supabase Admin API via /api/create-user.js (Vercel function)
 * Untuk update metadata: update langsung di app_users
 */
export async function apiSaveUser(userData) {
    const { nik, name, role, isNew } = userData;

    if (isNew) {
        // Panggil Vercel serverless function (sudah ada di /api/create-user.js)
        const res = await fetch('/api/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nik, name, role, password: userData.password }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Gagal membuat user' }));
            throw new Error(err.error || 'Gagal membuat user');
        }
        return await res.json();
    }

    // Update user yang sudah ada di app_users
    const { data, error } = await supabase
        .from('app_users')
        .update({ display_name: name, role })
        .eq('nik', nik)
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Hapus user.
 */
export async function apiDeleteUser(nik) {
    const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nik }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gagal menghapus user' }));
        throw new Error(err.error || 'Gagal menghapus user');
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

export async function apiSaveAssignment({ materialType, inspectorNik, inspectorName, updatedBy }) {
    const { data, error } = await supabase
        .from('material_assignments')
        .upsert({
            material_type:  materialType,
            inspector_nik:  inspectorNik,
            inspector_name: inspectorName,
            updated_by:     updatedBy,
            updated_at:     new Date().toISOString(),
        }, { onConflict: 'material_type' })
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

export async function apiDeleteAssignment(materialType) {
    const { error } = await supabase
        .from('material_assignments')
        .delete()
        .eq('material_type', materialType);
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
    if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(val).trim();
    if (!s) return null;
    // ISO format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
    // DD-MM-YYYY atau DD/MM/YYYY
    const sep = s.includes('/') ? '/' : '-';
    const parts = s.split(sep);
    if (parts.length === 3 && parts[0].length <= 2) {
        return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    return s;
}

/**
 * Upload file evidence ke Supabase Storage bucket 'iqc-evidence'.
 * Menggantikan Google Drive upload di GAS.
 */
async function uploadEvidenceFile(fileDataBase64, fileName, mimeType) {
    try {
        // Decode base64 ke Uint8Array
        const binary = atob(fileDataBase64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const filePath = `evidence/${Date.now()}_${fileName}`;
        const { data, error } = await supabase.storage
            .from('iqc-evidence')
            .upload(filePath, bytes, { contentType: mimeType, upsert: false });

        if (error) {
            console.warn('Upload evidence gagal, lanjut tanpa URL:', error.message);
            return '';
        }

        const { data: urlData } = supabase.storage
            .from('iqc-evidence')
            .getPublicUrl(data.path);

        return urlData?.publicUrl || '';
    } catch (e) {
        console.warn('uploadEvidenceFile error:', e);
        return '';
    }
}
