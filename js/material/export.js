// ============================================================
// js/material/export.js — IQC Material: Export Excel Utilities
// Menggunakan SheetJS (xlsx) yang di-load via CDN di HTML.
// Menggantikan fungsi download langsung dari Google Sheets.
// ============================================================

/**
 * Export array of objects ke file .xlsx
 * @param {object[]} data       - Array of objects (kolom = key)
 * @param {string[]} headers    - Urutan kolom header (key dari object)
 * @param {string[]} headerLabels - Label tampilan header (human-readable)
 * @param {string}  sheetName  - Nama sheet di Excel
 * @param {string}  filename   - Nama file output (tanpa ekstensi)
 */
function exportToExcel(data, headers, headerLabels, sheetName, filename) {
    if (typeof XLSX === 'undefined') {
        alert('Library SheetJS belum dimuat. Pastikan CDN XLSX tersedia.');
        return;
    }

    const rows = data.map(row =>
        headers.reduce((acc, key, i) => {
            acc[headerLabels[i] || key] = row[key] ?? '';
            return acc;
        }, {})
    );

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: headerLabels });

    // Style header (bold) — SheetJS community edition limited styling
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
        if (cell) {
            cell.s = { font: { bold: true }, fill: { fgColor: { rgb: '10B981' } } };
        }
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}_${formatDateForFilename(new Date())}.xlsx`);
}

function formatDateForFilename(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

// ─── EXPORT MASTER DATA ───────────────────────────────────────
export function exportMasterDataToExcel(data) {
    if (!data || !data.length) { alert('Tidak ada data untuk diekspor.'); return; }

    const headers = [
        'po_number', 'material_name', 'item_description', 'uom',
        'supplier_name', 'po_area', 'planned_qty', 'product_code',
        'model_name', 'bucket', 'receive_date', 'shipment_number',
        'no_bc', 'bc_type', 'receive_number', 'material_type', 'status'
    ];
    const labels = [
        'PO Number', 'Material Name', 'Material Description', 'UOM',
        'Supplier Name', 'PO Area', 'Batch Size', 'Product Code',
        'Model Name', 'Bucket', 'Receive Date', 'Shipment Number',
        'No BC', 'BC Type', 'Receive Number', 'Material Type', 'Status'
    ];

    // Normalize field names (api.js normalizeRow already does this, but just in case)
    const normalized = data.map(r => ({
        ...r,
        planned_qty:   r.planned_qty  || r.batch_size || 0,
        supplier_name: r.supplier_name || r.vendor_name || r.supplier || '',
    }));

    exportToExcel(normalized, headers, labels, 'Master Data', 'IQC_MasterData');
}

// ─── EXPORT INSPECTION LOG ────────────────────────────────────
export function exportInspectionLogToExcel(data) {
    if (!data || !data.length) { alert('Tidak ada data untuk diekspor.'); return; }

    const headers = [
        'inspection_date', 'po_no', 'material_name', 'item_description',
        'inspection_type', 'inspector_nik', 'qty_receive', 'ok', 'no_qty',
        'defect_notes', 'rolling_inspection', 'approved_by_leader',
        'color_check_status', 'packaging_status', 'status', 'input_type'
    ];
    const labels = [
        'Tanggal Inspeksi', 'PO Number', 'Material Name', 'Deskripsi',
        'Jenis Inspeksi', 'Inspector NIK', 'Qty Receive', 'Qty OK', 'Qty Fail',
        'Catatan Defect', 'Rolling Inspection', 'Approved By Leader',
        'Color Check', 'Packaging Check', 'Status', 'Input Type'
    ];

    const normalized = data.map(r => ({
        ...r,
        inspection_date: r.inspection_date
            ? (r.inspection_date instanceof Date
                ? r.inspection_date.toLocaleDateString('id-ID')
                : String(r.inspection_date).substring(0, 16).replace('T', ' '))
            : '',
    }));

    exportToExcel(normalized, headers, labels, 'Inspection Log', 'IQC_InspectionLog');
}

// ─── EXPORT CLAIMS ────────────────────────────────────────────
export function exportClaimsToExcel(data) {
    if (!data || !data.length) { alert('Tidak ada data untuk diekspor.'); return; }

    const headers = [
        'created_at', 'po_number', 'material_name', 'vendor_name',
        'material_type', 'claimed_qty', 'original_planned_qty', 'new_planned_qty',
        'reason', 'ref_number', 'submitted_by'
    ];
    const labels = [
        'Tanggal Klaim', 'PO Number', 'Material Name', 'Vendor',
        'Material Type', 'Qty Diklaim', 'Batch Size Asal', 'Batch Size Baru',
        'Alasan', 'No Referensi', 'Submitted By'
    ];

    const normalized = data.map(r => ({
        ...r,
        created_at: r.created_at ? String(r.created_at).substring(0, 16).replace('T', ' ') : '',
    }));

    exportToExcel(normalized, headers, labels, 'Claims', 'IQC_Claims');
}
