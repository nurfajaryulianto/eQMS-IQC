// ============================================================
// js/material/admin.js — IQC Material: Admin Panel Logic
// ============================================================

import { requireMaterialRole, materialLogout, MATERIAL_TEST_MODE, MATERIAL_ROLES } from './auth.js';

// ─── CONFIG ──────────────────────────────────────────────────
const MATERIAL_GAS_URL = 'https://script.google.com/macros/s/AKfycbz8pi3DM_Rqu-3RVkmArhbAGjBRk3li6D6sM3v609_NTZO1SuJ4MIfTCcbGKfT8snAehw/exec';

// ─── STATE ───────────────────────────────────────────────────
let allMasterData = [];
let parsedFileData = [];
let currentUser = null;

// ─── MOCK DATA ────────────────────────────────────────────────
const MOCK_MASTER_DATA = [
    { po_number: 'PO-2025-001', material_name: 'Upper Leather — Type A', vendor_name: 'PT Sumber Makmur', uom: 'pcs', planned_qty: 500, status: 'pending' },
    { po_number: 'PO-2025-002', material_name: 'Outsole Rubber B-Grade', vendor_name: 'CV Karet Nusantara', uom: 'pcs', planned_qty: 300, status: 'pending' },
    { po_number: 'PO-2025-003', material_name: 'EVA Midsole Foam', vendor_name: 'PT Foam Indo', uom: 'pcs', planned_qty: 200, status: 'done' },
    { po_number: 'PO-2025-004', material_name: 'Textile Lace Flat 120cm', vendor_name: 'PT Sumber Makmur', uom: 'set', planned_qty: 400, status: 'pending' },
    { po_number: 'PO-2025-005', material_name: 'Thread Nylon 40 Black', vendor_name: 'CV Benang Jaya', uom: 'spool', planned_qty: 150, status: 'pending' },
];

// ─── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireMaterialRole([MATERIAL_ROLES.ADMIN]);
    if (!currentUser) return;

    setupNavbar(currentUser);
    setupLogout();
    await loadMasterData();
});

function setupNavbar(user) {
    const el = document.getElementById('nav-user-name');
    if (el) el.textContent = user.name || user.nik || 'Admin';
}

function setupLogout() {
    const btn = document.getElementById('nav-logout-btn');
    if (btn) btn.addEventListener('click', async () => {
        if (confirm('Yakin ingin logout?')) {
            await materialLogout();
        }
    });
}

// ─── MASTER DATA TAB ─────────────────────────────────────────

window.loadMasterData = async function () {
    const tbody = document.getElementById('master-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">Memuat data...</td></tr>`;

    try {
        if (MATERIAL_TEST_MODE) {
            allMasterData = MOCK_MASTER_DATA;
        } else {
            const res = await fetch(`${MATERIAL_GAS_URL}?action=getMasterData&status=all`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            allMasterData = json.data || [];
        }
        renderMasterTable();
    } catch (err) {
        console.error(err);
        showToast('Gagal memuat data: ' + err.message, 'error');
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding:40px;text-align:center;color:#dc2626;font-size:13px;">Gagal memuat data.</td></tr>`;
    }
};

window.renderMasterTable = function () {
    const filterStatus = document.getElementById('master-status-filter')?.value || 'all';
    const filtered = allMasterData.filter(d => filterStatus === 'all' || d.status === filterStatus);

    const countEl = document.getElementById('master-count');
    if (countEl) countEl.textContent = `${filtered.length} item`;

    const tbody = document.getElementById('master-tbody');
    if (!tbody) return;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:48px;text-align:center;">
            <div style="color:#94a3b8;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:32px;">inbox</span>
                Tidak ada data untuk filter ini.
            </div></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(d => {
        const badge = d.status === 'done'
            ? `<span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;" class="badge-done">Done</span>`
            : `<span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;" class="badge-pending">Pending</span>`;
        return `<tr style="border-bottom:1px solid #f1f5f9;hover:background:#f8fafc;">
            <td style="padding:10px 14px;font-weight:700;color:#0f172a;font-size:13px;white-space:nowrap;">${esc(d.po_number)}</td>
            <td style="padding:10px 14px;color:#334155;font-size:13px;max-width:200px;">${esc(d.material_name)}</td>
            <td style="padding:10px 14px;color:#64748b;font-size:13px;white-space:nowrap;">${esc(d.vendor_name)}</td>
            <td style="padding:10px 14px;color:#64748b;font-size:12px;">${esc(d.uom)}</td>
            <td style="padding:10px 14px;color:#334155;font-size:13px;text-align:right;font-weight:600;">${Number(d.planned_qty).toLocaleString('id-ID')}</td>
            <td style="padding:10px 14px;text-align:center;">${badge}</td>
        </tr>`;
    }).join('');
};

// ─── UPLOAD TAB: GENERATE TEMPLATE ───────────────────────────

window.downloadTemplate = async function () {
    if (UI_TEST_MODE) {
        // Generate CSV in browser
        const headers = ['po_number', 'material_name', 'item_description', 'uom', 'vendor_id', 'vendor_name', 'style', 'model_shoe', 'planned_qty'];
        const example = '"PO-CONTOH-001","Nama Material","Deskripsi item","pcs","V001","Nama Vendor","STYLE-001","Model Sepatu",100';
        const csv = headers.join(',') + '\n' + example + '\n';
        downloadCSV(csv, 'template_master_data_iqc_material.csv');
        showToast('Template berhasil didownload!', 'success');
        return;
    }

    try {
        const res = await fetch(`${MATERIAL_GAS_URL}?action=generateTemplate`);
        const text = await res.text();
        downloadCSV(text, 'template_master_data_iqc_material.csv');
        showToast('Template berhasil didownload!', 'success');
    } catch (err) {
        showToast('Gagal download template: ' + err.message, 'error');
    }
};

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// ─── UPLOAD TAB: FILE HANDLING ────────────────────────────────

window.handleFileSelect = function (e) {
    const file = e.target.files[0];
    if (file) processFile(file);
};

window.handleDrop = function (e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
};

window.handleDragOver = function (e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.add('drag-over');
};

window.handleDragLeave = function () {
    document.getElementById('drop-zone').classList.remove('drag-over');
};

function processFile(file) {
    const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
        showToast('Format file tidak didukung. Gunakan .xlsx, .xls, atau .csv', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            parsedFileData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            document.getElementById('file-name').textContent = file.name;
            document.getElementById('file-rows').textContent = `${parsedFileData.length} baris data`;
            renderPreviewTable(parsedFileData.slice(0, 10));
            document.getElementById('file-preview').style.display = 'block';

        } catch (err) {
            showToast('Gagal memproses file: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function renderPreviewTable(rows) {
    if (!rows.length) return;
    const table = document.getElementById('preview-table');
    const keys = Object.keys(rows[0]);

    table.innerHTML = `
        <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                ${keys.map(k => `<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;white-space:nowrap;text-transform:uppercase;letter-spacing:0.04em;">${esc(k)}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${rows.map(row => `<tr style="border-bottom:1px solid #f1f5f9;">
                ${keys.map(k => `<td style="padding:7px 12px;font-size:12px;color:#334155;white-space:nowrap;">${esc(String(row[k]))}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
    `;
}

window.clearFile = function () {
    parsedFileData = [];
    document.getElementById('file-input').value = '';
    document.getElementById('file-preview').style.display = 'none';
};

window.confirmUpload = async function () {
    if (!parsedFileData.length) { showToast('Tidak ada data untuk diupload.', 'error'); return; }

    if (!confirm(`Upload ${parsedFileData.length} baris data ke Spreadsheet? Data yang sudah ada (PO sama) akan diperbarui.`)) return;

    setLoading(true, `Mengupload ${parsedFileData.length} baris...`);

    try {
        if (MATERIAL_TEST_MODE) {
            await delay(1500);
            // Simulate adding to allMasterData
            parsedFileData.forEach(row => {
                const po = String(row.po_number || row['PO Number'] || '').trim();
                if (!po) return;
                const existing = allMasterData.findIndex(d => d.po_number === po);
                const newItem = { po_number: po, material_name: row.material_name || row['Material Name'] || '', vendor_name: row.vendor_name || row['Vendor Name'] || '', uom: row.uom || row['UOM'] || '', planned_qty: Number(row.planned_qty || row['Planned Qty']) || 0, status: 'pending' };
                if (existing >= 0) allMasterData[existing] = newItem;
                else allMasterData.push(newItem);
            });
            setLoading(false);
            showToast(`Upload berhasil: ${parsedFileData.length} baris diproses. (simulasi)`, 'success');
            clearFile();
            renderMasterTable();
            return;
        }

        const payload = {
            action: 'bulkUpsertMasterData',
            rows: parsedFileData,
            uploader_nik: currentUser?.nik || 'admin',
        };
        const res = await fetch(MATERIAL_GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        setLoading(false);
        showToast(json.message || 'Upload berhasil!', 'success');
        clearFile();
        await loadMasterData();

    } catch (err) {
        setLoading(false);
        showToast('Upload gagal: ' + err.message, 'error');
    }
};

// ─── PASS ALL TAB ─────────────────────────────────────────────

window.loadPassAllPreview = async function () {
    await loadMasterData();
    const pending = allMasterData.filter(d => d.status === 'pending');
    const countEl = document.getElementById('passall-count');
    const listEl = document.getElementById('passall-list');
    if (countEl) countEl.textContent = `${pending.length} item`;

    if (!listEl) return;
    if (!pending.length) {
        listEl.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">Tidak ada item pending. Semua item sudah diinspeksi.</div>`;
        const btn = document.getElementById('passall-btn');
        if (btn) btn.disabled = true;
        return;
    }

    listEl.innerHTML = pending.map((d, i) => `
        <div style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;${i < pending.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''}">
            <div>
                <div style="font-size:13px;font-weight:600;color:#0f172a;">${esc(d.po_number)}</div>
                <div style="font-size:12px;color:#64748b;">${esc(d.material_name)} — ${esc(d.vendor_name)}</div>
            </div>
            <span style="font-size:12px;color:#64748b;white-space:nowrap;margin-left:12px;">${Number(d.planned_qty).toLocaleString('id-ID')} ${esc(d.uom)}</span>
        </div>
    `).join('');
};

window.confirmPassAll = async function () {
    const pending = allMasterData.filter(d => d.status === 'pending');
    if (!pending.length) { showToast('Tidak ada item pending untuk di-pass.', 'info'); return; }

    if (!confirm(`Apakah Anda yakin ingin menandai ${pending.length} item sebagai PASS? Tindakan ini tidak dapat dibatalkan.`)) return;

    setLoading(true, `Memproses ${pending.length} item...`);

    try {
        if (MATERIAL_TEST_MODE) {
            await delay(2000);
            allMasterData.forEach(d => { if (d.status === 'pending') d.status = 'done'; });
            setLoading(false);
            showToast(`Pass All berhasil: ${pending.length} item ditandai sebagai Pass. (simulasi)`, 'success');
            await loadPassAllPreview();
            renderMasterTable();
            return;
        }

        const payload = {
            action: 'passAll',
            admin_nik: currentUser?.nik || 'admin',
        };
        const res = await fetch(MATERIAL_GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        setLoading(false);
        showToast(json.message || 'Pass All berhasil!', 'success');
        await loadMasterData();
        await loadPassAllPreview();

    } catch (err) {
        setLoading(false);
        showToast('Pass All gagal: ' + err.message, 'error');
    }
};

// ─── UTILS ───────────────────────────────────────────────────

function setLoading(show, text = 'Memproses...') {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    if (overlay) overlay.classList.toggle('visible', show);
    if (textEl && text) textEl.textContent = text;
}

let toastTimer = null;
function showToast(message, type = 'success') {
    const toast = document.getElementById('alert-toast');
    const iconEl = document.getElementById('toast-icon');
    const textEl = document.getElementById('toast-text');
    if (!toast) return;
    const styles = {
        success: { icon: 'check_circle', color: '#16a34a', border: '#86efac' },
        error: { icon: 'error', color: '#dc2626', border: '#fca5a5' },
        info: { icon: 'info', color: '#2563eb', border: '#93c5fd' },
    };
    const s = styles[type] || styles.info;
    if (iconEl) { iconEl.textContent = s.icon; iconEl.style.color = s.color; }
    if (textEl) textEl.textContent = message;
    toast.querySelector('div').style.borderColor = s.border;
    toast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 5000);
}

function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Expose for passall tab switch
document.addEventListener('DOMContentLoaded', () => {
    // Load pass all preview when tab is opened
    const passallTab = document.getElementById('tab-passall');
    if (passallTab) {
        passallTab.addEventListener('click', () => { window.loadPassAllPreview(); });
    }
});
