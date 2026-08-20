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
        'Supplier Name', 'PO Area', 'Batch Size (Planned Qty)', 'Product Code (Style)',
        'Model Name', 'Bucket', 'Receive Date', 'Shipment Number',
        'No BC', 'BC Type', 'Receive Number', 'Material Type', 'Status'
    ];

    const normalized = data.map(r => ({
        ...r,
        planned_qty:   r.planned_qty  || r.batch_size || 0,
        supplier_name: r.supplier_name || r.vendor_name || r.supplier || '',
        product_code:  r.product_code || r.style || '',
        model_name:    r.model_name || r.model_shoe || '',
        receive_date:  r.receive_date ? String(r.receive_date).split('T')[0] : '',
    }));

    exportToExcel(normalized, headers, labels, 'Master Data', 'IQC_Material_MasterData');
}

// ─── EXPORT INSPECTION LOG ────────────────────────────────────
export function exportInspectionLogToExcel(data) {
    if (!data || !data.length) { alert('Tidak ada data untuk diekspor.'); return; }

    const headers = [
        'inspection_date', 'inspection_id', 'po_no', 'material_name', 'item_description',
        'uom', 'supplier_name', 'style', 'model_shoe', 'bucket', 'receive_date',
        'qty_receive', 'ok', 'no_qty', 'pass_rate',
        'inspection_type', 'inspector_nik', 'approved_by_leader',
        'defect_notes', 'rolling_inspection',
        'color_check_status', 'color_check_result',
        'packaging_status', 'packaging_reject_reason',
        'roll_inspection_flag', 'roll_inspection_percentage',
        'evidence_url', 'bonding_test_url',
        'status'
    ];
    const labels = [
        'Tanggal Inspeksi', 'Inspection ID', 'PO Number', 'Material Name', 'Deskripsi Item',
        'UOM', 'Supplier / Vendor', 'Style', 'Model Sepatu', 'Bucket', 'Receive Date',
        'Qty Receive', 'Qty OK', 'Qty Fail (NO)', 'Pass Rate (%)',
        'Jenis Inspeksi', 'Inspector', 'Approved By Leader',
        'Catatan Defect', 'Rolling Inspection',
        'Color Check Status', 'Color Check Result',
        'Packaging Status', 'Packaging Reject Reason',
        'Roll Inspection Flag', 'Roll Inspection %',
        'Evidence Foto URL', 'Bonding Test URL',
        'Status'
    ];

    const normalized = data.map((r, idx) => {
        const ok = Number(r.ok) || 0;
        const noQty = Number(r.no_qty) || 0;
        const total = ok + noQty;
        const passRate = total > 0 ? ((ok / total) * 100).toFixed(1) + '%' : '100%';

        return {
            ...r,
            no: idx + 1,
            po_no: r.po_no || r.po_number || '',
            supplier_name: r.supplier_name || r.vendor_name || r.supplier || '',
            style: r.style || r.product_code || '',
            model_shoe: r.model_shoe || r.model_name || r.shoe_model || '',
            pass_rate: passRate,
            inspection_date: r.inspection_date
                ? (r.inspection_date instanceof Date
                    ? r.inspection_date.toLocaleDateString('id-ID') + ' ' + r.inspection_date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                    : String(r.inspection_date).substring(0, 16).replace('T', ' '))
                : '',
            receive_date: r.receive_date ? String(r.receive_date).split('T')[0] : '',
        };
    });

    exportToExcel(normalized, headers, labels, 'Inspection Log', 'IQC_Material_InspectionLog');
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
