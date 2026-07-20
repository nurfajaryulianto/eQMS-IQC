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
    currentUser = await requireMaterialRole([MATERIAL_ROLES.ADMIN, MATERIAL_ROLES.SUPERVISOR, MATERIAL_ROLES.MANAGER]);
    if (!currentUser) return;

    setupNavbar(currentUser);
    setupLogout();
    await loadMasterData();
    if (typeof window.loadSpreadsheetStatus === 'function') {
        await window.loadSpreadsheetStatus();
    }
    
    // Show mock ADF loader in test mode
    if (MATERIAL_TEST_MODE) {
        const mockCont = document.getElementById('mock-adf-load-container');
        if (mockCont) mockCont.style.display = 'block';
    }
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
        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.06); transition: background-color 0.2s;">
            <td style="padding:10px 14px;font-weight:700;color:#ffffff;font-size:13px;white-space:nowrap;">${esc(d.po_number)}</td>
            <td style="padding:10px 14px;color:#34d399;font-weight:600;font-size:13px;max-width:200px;">${esc(d.material_name)}</td>
            <td style="padding:10px 14px;color:rgba(255,255,255,0.7);font-size:13px;white-space:nowrap;">${esc(d.vendor_name)}</td>
            <td style="padding:10px 14px;color:rgba(255,255,255,0.55);font-size:12px;">${esc(d.uom)}</td>
            <td style="padding:10px 14px;color:#ffffff;font-size:13px;text-align:right;font-weight:700;">${Number(d.planned_qty).toLocaleString('id-ID')}</td>
            <td style="padding:10px 14px;text-align:center;">${badge}</td>
        </tr>`;
    }).join('');
};

// ─── UPLOAD TAB: GENERATE TEMPLATE ───────────────────────────

window.downloadTemplate = async function () {
    if (UI_TEST_MODE) {
        // Generate CSV in browser
        const headers = [
            'Material Name', 'Material Description', 'UOM', 'Supplier',
            'Supplier Name', 'PO Area', 'Batch Size', 'Product Code',
            'Model Name', 'Bucket', 'Receive Date', 'PO Number',
            'Shipment Number', 'No BC', 'BC Type', 'Receive Number', 'Material Type'
        ];
        const example = '"RM.LTH.1070000003.00A","FP JUNIOR BUCK - 1.4-1.6MM - DYE THROUGH - N/A - N/A - BLACK(00A)","Square Feet","YOUNGIL LEATHER INDONESIA PT.","","RM-LKL",9605.5,"CU6620-001","NIKE COURT VISION MID - BLACK/BLACK","260525,260810","01-07-2026","1263026745,1263035401","YLI/DO/26/11490,YLI/DO/26/11491","105743","BC 2.7","111260042835,111260042840","LEATHER"';
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
            // ADF Layout headers are on the second row (index 1)
            parsedFileData = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '' });

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
            <tr style="background:rgba(255,255,255,0.02);border-bottom:1.5px solid rgba(255,255,255,0.08);">
                ${keys.map(k => `<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:rgba(255,255,255,0.45);white-space:nowrap;text-transform:uppercase;letter-spacing:0.04em;">${esc(k)}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${rows.map(row => `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                ${keys.map(k => `<td style="padding:7px 12px;font-size:12px;color:rgba(255,255,255,0.85);white-space:nowrap;">${esc(String(row[k]))}</td>`).join('')}
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
                const po = String(row['PO Number'] || row.po_number || '').trim();
                if (!po) return;
                const existing = allMasterData.findIndex(d => d.po_number === po);
                const newItem = {
                    po_number: po,
                    material_name: row['Material Name'] || row.material_name || '',
                    vendor_name: row['Supplier'] || row.vendor_name || '',
                    uom: row['UOM'] || row.uom || '',
                    planned_qty: Number(row['Batch Size'] || row.planned_qty) || 0,
                    status: 'pending'
                };
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

function parseReceiveDate(dateVal) {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return dateVal;
    
    const str = String(dateVal).trim();
    if (!str) return null;
    
    // ISO string or YYYY-MM-DDTHH:mm:ss...
    if (str.includes('T')) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
    }
    
    // Check DD-MM-YYYY or DD/MM/YYYY
    let m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        return new Date(year, month - 1, day);
    }
    
    // Check YYYY-MM-DD
    m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const day = parseInt(m[3], 10);
        return new Date(year, month - 1, day);
    }
    
    // Check Excel serial number
    if (/^\d+(\.\d+)?$/.test(str)) {
        const serial = parseFloat(str);
        const date = new Date((serial - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) return date;
    }
    
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

window.loadPassAllPreview = async function () {
    await loadMasterData();
    window.applyPassAllDateFilter();
};

window.applyPassAllDateFilter = function () {
    const startVal = document.getElementById('passall-filter-start')?.value;
    const endVal = document.getElementById('passall-filter-end')?.value;
    
    let filteredPending = allMasterData.filter(d => d.status === 'pending');
    
    const startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
    const endDate = endVal ? new Date(endVal + 'T23:59:59') : null;
    
    if (startDate || endDate) {
        filteredPending = filteredPending.filter(d => {
            const rDate = parseReceiveDate(d.receive_date);
            if (!rDate) return false;
            
            const rDateClear = new Date(rDate.getFullYear(), rDate.getMonth(), rDate.getDate());
            
            if (startDate) {
                const startClear = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                if (rDateClear < startClear) return false;
            }
            if (endDate) {
                const endClear = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                if (rDateClear > endClear) return false;
            }
            return true;
        });
    }

    const countEl = document.getElementById('passall-count');
    const listEl = document.getElementById('passall-list');
    if (countEl) countEl.textContent = `${filteredPending.length} item`;

    if (!listEl) return;
    if (!filteredPending.length) {
        listEl.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">Tidak ada item pending yang sesuai filter.</div>`;
        const btn = document.getElementById('passall-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;">done_all</span>Jalankan Pass (0 Item)`;
        }
        return;
    }

    listEl.innerHTML = filteredPending.map((d, i) => `
        <div style="padding:10px 14px;display:flex;align-items:center;gap:12px;${i < filteredPending.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.06);' : ''}">
            <input type="checkbox" class="passall-item-checkbox" data-po="${esc(d.po_number)}" checked onchange="window.updatePassAllSelectedCount()" style="width:16px;height:16px;cursor:pointer;">
            <div style="flex-grow:1;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div>
                    <div style="font-size:13px;font-weight:600;color:#ffffff;">
                        ${esc(d.po_number)} 
                        <span style="font-size:11px;font-weight:normal;color:rgba(255,255,255,0.4);margin-left:6px;">(${esc(d.receive_date || 'No Date')})</span>
                    </div>
                    <div style="font-size:12px;color:rgba(255, 255, 255, 0.7);"><span style="color:#34d399;font-weight:600;">${esc(d.material_name)}</span> — ${esc(d.vendor_name)}</div>
                </div>
                <span style="font-size:12px;color:rgba(255, 255, 255, 0.7);white-space:nowrap;margin-left:12px;font-weight:600;">${Number(d.planned_qty).toLocaleString('id-ID')} ${esc(d.uom)}</span>
            </div>
        </div>
    `).join('');

    // Reset select all checkbox to checked
    const masterCheckbox = document.getElementById('passall-select-all');
    if (masterCheckbox) {
        masterCheckbox.checked = true;
        masterCheckbox.indeterminate = false;
    }
    
    window.updatePassAllSelectedCount();
};

window.resetPassAllDateFilter = function () {
    const startInput = document.getElementById('passall-filter-start');
    const endInput = document.getElementById('passall-filter-end');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    window.applyPassAllDateFilter();
};

window.togglePassAllSelectAll = function (master) {
    const checkboxes = document.querySelectorAll('.passall-item-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
    window.updatePassAllSelectedCount();
};

window.updatePassAllSelectedCount = function () {
    const checkboxes = document.querySelectorAll('.passall-item-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const btn = document.getElementById('passall-btn');
    if (btn) {
        btn.disabled = checkedCount === 0;
        btn.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:18px;">done_all</span>
            Jalankan Pass (${checkedCount} Item)
        `;
    }
    
    const masterCheckbox = document.getElementById('passall-select-all');
    if (masterCheckbox) {
        masterCheckbox.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        masterCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }
};

window.confirmPassAll = async function () {
    const checkboxes = document.querySelectorAll('.passall-item-checkbox');
    const selectedPos = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.po);

    if (!selectedPos.length) { 
        showToast('Tidak ada item yang dipilih untuk di-pass.', 'info'); 
        return; 
    }

    if (!confirm(`Apakah Anda yakin ingin menandai ${selectedPos.length} item pilihan sebagai PASS? Tindakan ini tidak dapat dibatalkan.`)) return;

    setLoading(true, `Memproses ${selectedPos.length} item...`);

    try {
        if (MATERIAL_TEST_MODE) {
            await delay(2000);
            allMasterData.forEach(d => { 
                if (d.status === 'pending' && selectedPos.includes(d.po_number)) {
                    d.status = 'done'; 
                }
            });
            setLoading(false);
            showToast(`Pass berhasil: ${selectedPos.length} item ditandai sebagai Pass. (simulasi)`, 'success');
            await loadPassAllPreview();
            renderMasterTable();
            return;
        }

        const payload = {
            action: 'passAll',
            admin_nik: currentUser?.nik || 'admin',
            po_numbers: selectedPos
        };
        const res = await fetch(MATERIAL_GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        setLoading(false);
        showToast(json.message || 'Pass berhasil!', 'success');
        await loadMasterData();
        await loadPassAllPreview();

    } catch (err) {
        setLoading(false);
        showToast('Pass gagal: ' + err.message, 'error');
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

// ─── USER MANAGEMENT TAB ─────────────────────────────────────

let allUsers = [];
let editingUserNik = null;

// Expose users list loader
window.loadUsersList = async function() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">Memuat data user...</td></tr>`;

    try {
        if (MATERIAL_TEST_MODE) {
            allUsers = [
                { nik: 'admin', name: 'Admin Material', role: 'admin', created_at: '2026-07-10T12:00:00Z' },
                { nik: 'inspector1', name: 'Budi Santoso', role: 'inspector', created_at: '2026-07-12T08:30:00Z' },
                { nik: 'inspector2', name: 'Siti Rahma', role: 'inspector', created_at: '2026-07-14T09:45:00Z' },
            ];
        } else {
            const res = await fetch(`${MATERIAL_GAS_URL}?action=getUsers`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            allUsers = json.data || [];
        }
        renderUsersTable();
    } catch (err) {
        console.error(err);
        showToast('Gagal memuat daftar user: ' + err.message, 'error');
        tbody.innerHTML = `<tr><td colspan="5" style="padding:40px;text-align:center;color:#dc2626;font-size:13px;">Gagal memuat data user.</td></tr>`;
    }
};

function renderUsersTable() {
    const tbody = document.getElementById('users-tbody');
    const countEl = document.getElementById('users-count');
    if (!tbody) return;

    if (countEl) countEl.textContent = allUsers.length;

    if (!allUsers.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:48px;text-align:center;color:rgba(255,255,255,0.45);">Tidak ada user terdaftar.</td></tr>`;
        return;
    }

    tbody.innerHTML = allUsers.map(u => {
        const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        let roleLabel = '';
        if (u.role === 'admin') {
            roleLabel = `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(139,92,246,0.15);color:#c084fc;border:1px solid rgba(139,92,246,0.3);">Admin</span>`;
        } else if (u.role === 'supervisor') {
            roleLabel = `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);">Supervisor</span>`;
        } else if (u.role === 'manager') {
            roleLabel = `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);">Manager</span>`;
        } else {
            roleLabel = `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);">Inspector</span>`;
        }
        
        return `<tr>
            <td style="padding:12px 14px;font-weight:700;color:white;">${esc(u.nik)}</td>
            <td style="padding:12px 14px;color:rgba(255,255,255,0.85);">${esc(u.name)}</td>
            <td style="padding:12px 14px;">${roleLabel}</td>
            <td style="padding:12px 14px;color:rgba(255,255,255,0.5);">${esc(dateStr)}</td>
            <td style="padding:12px 14px;text-align:center;">
                <div style="display:flex;gap:12px;justify-content:center;">
                    <button onclick="window.editUser('${u.nik}')" class="btn-secondary" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;color:#60a5fa;border-color:rgba(96,165,250,0.3);">Edit</button>
                    <button onclick="window.deleteUser('${u.nik}')" class="btn-secondary" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;color:#f87171;border-color:rgba(248,113,113,0.3);">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

window.handleUserSubmit = async function(e) {
    e.preventDefault();
    const nikInput = document.getElementById('user-nik');
    const nameInput = document.getElementById('user-name');
    const roleInput = document.getElementById('user-role');
    const passwordInput = document.getElementById('user-password');

    const nik = nikInput.value.trim();
    const name = nameInput.value.trim();
    const role = roleInput.value;
    const password = passwordInput.value;

    if (!nik || !name || !role) {
        showToast('NIK, Nama, dan Role wajib diisi.', 'error');
        return;
    }

    if (!editingUserNik && !password) {
        showToast('Password wajib diisi untuk user baru.', 'error');
        return;
    }

    if (password && password.length < 6) {
        showToast('Password minimal 6 karakter.', 'error');
        return;
    }

    setLoading(true, 'Menyimpan data user...');

    const payload = {
        action: 'saveUser',
        nik: nik,
        name: name,
        role: role,
        password: password || undefined
    };

    try {
        if (MATERIAL_TEST_MODE) {
            console.log('[TEST MODE] Save User Payload:', payload);
            await delay(1000);
            if (editingUserNik) {
                const idx = allUsers.findIndex(u => u.nik === editingUserNik);
                if (idx !== -1) {
                    allUsers[idx].name = name;
                    allUsers[idx].role = role;
                }
            } else {
                allUsers.push({ nik, name, role, created_at: new Date().toISOString() });
            }
            showToast('User berhasil disimpan (simulasi)!', 'success');
        } else {
            const res = await fetch(MATERIAL_GAS_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            showToast(json.message || 'User berhasil disimpan!', 'success');
        }
        resetUserForm();
        await window.loadUsersList();
    } catch (err) {
        console.error(err);
        showToast('Gagal menyimpan user: ' + err.message, 'error');
    } finally {
        setLoading(false);
    }
};

window.editUser = function(nik) {
    const user = allUsers.find(u => String(u.nik) === String(nik));
    if (!user) return;

    editingUserNik = nik;

    const nikInput = document.getElementById('user-nik');
    const nameInput = document.getElementById('user-name');
    const roleInput = document.getElementById('user-role');
    const passwordInput = document.getElementById('user-password');
    const formTitle = document.getElementById('user-form-title');
    const cancelBtn = document.getElementById('btn-cancel-user-edit');
    const pwdRequiredStar = document.getElementById('pwd-required-star');

    if (nikInput) { nikInput.value = user.nik; nikInput.disabled = true; }
    if (nameInput) nameInput.value = user.name || '';
    if (roleInput) roleInput.value = user.role || 'inspector';
    if (passwordInput) {
        passwordInput.value = '';
        passwordInput.placeholder = 'Kosongkan jika tidak diubah';
        passwordInput.required = false;
    }
    if (pwdRequiredStar) pwdRequiredStar.style.display = 'none';
    if (formTitle) formTitle.textContent = 'Edit Pengguna: ' + user.nik;
    if (cancelBtn) cancelBtn.style.display = 'block';

    if (nameInput) nameInput.focus();
};

window.deleteUser = async function(nik) {
    if (nik.toLowerCase() === 'admin') {
        showToast('User default "admin" tidak dapat dihapus.', 'error');
        return;
    }

    if (!confirm(`Yakin ingin menghapus user "${nik}"? User ini tidak akan bisa login lagi.`)) {
        return;
    }

    setLoading(true, 'Menghapus user...');

    try {
        if (MATERIAL_TEST_MODE) {
            await delay(1000);
            allUsers = allUsers.filter(u => String(u.nik) !== String(nik));
            showToast('User berhasil dihapus (simulasi)!', 'success');
        } else {
            const res = await fetch(MATERIAL_GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'deleteUser', nik: nik })
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            showToast(json.message || 'User berhasil dihapus!', 'success');
        }
        await window.loadUsersList();
    } catch (err) {
        console.error(err);
        showToast('Gagal menghapus user: ' + err.message, 'error');
    } finally {
        setLoading(false);
    }
};

window.resetUserForm = function() {
    editingUserNik = null;
    const form = document.getElementById('user-form');
    if (form) form.reset();

    const nikInput = document.getElementById('user-nik');
    const passwordInput = document.getElementById('user-password');
    const formTitle = document.getElementById('user-form-title');
    const cancelBtn = document.getElementById('btn-cancel-user-edit');
    const pwdRequiredStar = document.getElementById('pwd-required-star');

    if (nikInput) nikInput.disabled = false;
    if (passwordInput) {
        passwordInput.placeholder = 'Minimal 6 karakter';
        passwordInput.required = true;
    }
    if (pwdRequiredStar) pwdRequiredStar.style.display = 'inline';
    if (formTitle) formTitle.textContent = 'Tambah Pengguna Baru';
    if (cancelBtn) cancelBtn.style.display = 'none';
};

// ─── SPREADSHEET STATUS ───────────────────────────────────────

window.loadSpreadsheetStatus = async function() {
    const infoContainer = document.getElementById('admin-spreadsheet-info');
    const openBtn = document.getElementById('admin-open-spreadsheet-btn');
    if (!infoContainer) return;

    infoContainer.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,0.45);font-size:13px;">⏳ <span>Loading spreadsheet status...</span></div>';
    if (openBtn) openBtn.style.display = 'none';

    try {
        if (MATERIAL_TEST_MODE) {
            infoContainer.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <span style="color:white;font-weight:600;">[TEST MODE] eQMS-IQC-Material-Database</span>
                    <span style="font-size:11px;color:rgba(255,255,255,0.4);font-family:monospace;">ID: mock_spreadsheet_id_123</span>
                </div>
            `;
            if (openBtn) {
                openBtn.href = '#';
                openBtn.style.display = 'flex';
            }
            return;
        }

        const res = await fetch(`${MATERIAL_GAS_URL}?action=getStatus`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const data = await res.json();
        
        if (data.spreadsheetId) {
            infoContainer.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <span style="color:white;font-weight:600;">${data.spreadsheetName || 'eQMS IQC Material Database'}</span>
                    <span style="font-size:11px;color:rgba(255,255,255,0.4);font-family:monospace;word-break:break-all;">ID: ${data.spreadsheetId}</span>
                </div>
            `;
            if (openBtn && data.spreadsheetUrl) {
                openBtn.href = data.spreadsheetUrl;
                openBtn.style.display = 'flex';
            }
        } else {
            throw new Error(data.message || 'Gagal memuat status spreadsheet');
        }
    } catch (err) {
        console.error(err);
        infoContainer.innerHTML = `<span style="color:#f87171;font-weight:600;font-size:12px;">Gagal memuat status: ${err.message}. Pastikan Web App sudah di-deploy dengan benar.</span>`;
    }
};

window.loadMockADFFile = function() {
    parsedFileData = [
      {
        "Material Name": "RM.LTH.1070000003.00A",
        "Material Description": "FP JUNIOR BUCK - 1.4-1.6MM - DYE THROUGH - N/A - N/A - BLACK(00A)",
        "UOM": "Square Feet",
        "Supplier": "YOUNGIL LEATHER INDONESIA PT.",
        "Supplier Name": "",
        "PO Area": "RM-LKL",
        "Batch Size": "9605.5",
        "Product Code": "CU6620-001",
        "Model Name": "NIKE COURT VISION MID - BLACK/BLACK",
        "Bucket": "260525,260810",
        "Receive Date": "01-07-2026",
        "PO Number": "1263026745,1263035401",
        "Shipment Number": "YLI/DO/26/11490,YLI/DO/26/11491",
        "No BC": "105743",
        "BC Type": "BC 2.7",
        "Receive Number": "111260042835,111260042840",
        "Material Type": "LEATHER "
      },
      {
        "Material Name": "RM.LTH.1090700002.0AN",
        "Material Description": "79564 - PM PU COATED NUBUCK - 1.2-1.4MM - DYE THROUGH - N/A - N/A - GREY FOG(0AN)",
        "UOM": "Square Feet",
        "Supplier": "OIA Global Logistics-SCM, Inc.",
        "Supplier Name": "YOUNGIL LEATHER INDONESIA PT.",
        "PO Area": "RM-IMP",
        "Batch Size": "72",
        "Product Code": "IH7681-004",
        "Model Name": "NIKE TERRASCOUT (PS) - IH7681-20259",
        "Bucket": "260727",
        "Receive Date": "01-07-2026",
        "PO Number": "1263026744",
        "Shipment Number": "YLI/DO/26/11492",
        "No BC": "105743",
        "BC Type": "BC 2.7",
        "Receive Number": "111260042837",
        "Material Type": "LEATHER "
      },
      {
        "Material Name": "RM.LTH.3060200003.00A",
        "Material Description": "FP GENERIC SPLIT SUEDE - 1.4-1.6MM - DYE THROUGH - N/A - N/A - BLACK(00A)",
        "UOM": "Square Feet",
        "Supplier": "DAEHWA LEATHER LESTARI PT.",
        "Supplier Name": "",
        "PO Area": "RM-LKL",
        "Batch Size": "20",
        "Product Code": "IU7628-001",
        "Model Name": "WMNS NIKE MD RUNNER 2 MM - IU7628-2",
        "Bucket": "260713",
        "Receive Date": "01-07-2026",
        "PO Number": "1263031843",
        "Shipment Number": "NC-26060144",
        "No BC": "364948",
        "BC Type": "BC 2.7",
        "Receive Number": "111260042828",
        "Material Type": "LEATHER "
      }
    ];
    document.getElementById('file-name').textContent = 'mock_adf_raw_material_layout.xlsx';
    document.getElementById('file-rows').textContent = `${parsedFileData.length} baris data`;
    renderPreviewTable(parsedFileData);
    document.getElementById('file-preview').style.display = 'block';
};

// ─── LEADER MONITORING LOG ──────────────────────────────────
let allLeaderMonitorInspections = [];

window.loadLeaderMonitorLog = async function() {
    const tbody = document.getElementById('leadermonitor-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="padding:48px;text-align:center;color:rgba(255,255,255,0.45);">Memuat data log...</td></tr>';
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const startEl = document.getElementById('leadermonitor-filter-start');
    const endEl = document.getElementById('leadermonitor-filter-end');
    if (startEl && !startEl.value) startEl.value = todayStr;
    if (endEl && !endEl.value) endEl.value = todayStr;

    try {
        if (MATERIAL_TEST_MODE) {
            allLeaderMonitorInspections = [
                {
                    po_no: '1263026745',
                    material_name: 'FP JUNIOR BUCK',
                    qty_inspect: 100,
                    qty_fail: 5,
                    status: 'done',
                    inspector_nik: 'auditor1',
                    approved_by_leader: 'Supervisor A',
                    evidence_url: 'https://example.com/evidence1.jpg',
                    inspection_date: new Date().toISOString()
                },
                {
                    po_no: '1263026744',
                    material_name: 'FP GENERIC SPLIT SUEDE',
                    qty_inspect: 80,
                    qty_fail: 0,
                    status: 'in-progress',
                    inspector_nik: 'auditor2',
                    approved_by_leader: '',
                    evidence_url: '',
                    inspection_date: new Date().toISOString()
                }
            ];
        } else {
            const res = await fetch(`${MATERIAL_GAS_URL}?action=getInspectionData`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            allLeaderMonitorInspections = json.data || [];
        }
        
        window.renderLeaderMonitorLog();
    } catch (err) {
        console.error(err);
        showToast('Gagal memuat log leader: ' + err.message, 'error');
        tbody.innerHTML = '<tr><td colspan="8" style="padding:48px;text-align:center;color:#f87171;">Gagal memuat data log.</td></tr>';
    }
};

window.renderLeaderMonitorLog = function() {
    const tbody = document.getElementById('leadermonitor-tbody');
    if (!tbody) return;

    const startVal = document.getElementById('leadermonitor-filter-start')?.value;
    const endVal = document.getElementById('leadermonitor-filter-end')?.value;
    const statusVal = document.getElementById('leadermonitor-filter-status')?.value || 'all';

    const startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
    const endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    const filtered = allLeaderMonitorInspections.filter(item => {
        const dateStr = item.inspection_date || item.uploaded_at;
        if (dateStr) {
            const dateObj = new Date(dateStr);
            if (!isNaN(dateObj.getTime())) {
                if (startDate && dateObj < startDate) return false;
                if (endDate && dateObj > endDate) return false;
            }
        }

        const fail = Number(item.qty_fail || item.no_qty) || 0;
        const hasDefects = fail > 0;
        const leaderApproved = item.approved_by_leader && item.approved_by_leader.trim().length > 0;

        if (statusVal === 'pending') {
            return hasDefects && !leaderApproved;
        } else if (statusVal === 'approved') {
            return hasDefects && leaderApproved;
        } else if (statusVal === 'autopass') {
            return !hasDefects;
        }
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:48px;text-align:center;color:rgba(255,255,255,0.45);">Tidak ada data monitoring yang sesuai filter.</td></tr>';
        return;
    }

    filtered.sort((a, b) => new Date(b.inspection_date || b.uploaded_at) - new Date(a.inspection_date || a.uploaded_at));

    tbody.innerHTML = filtered.map(item => {
        const fail = Number(item.qty_fail || item.no_qty) || 0;
        const inspect = Number(item.qty_inspect) || 0;
        const hasDefects = fail > 0;
        const leaderApproved = item.approved_by_leader && item.approved_by_leader.trim().length > 0;

        let statusBadge = '';
        if (!hasDefects) {
            statusBadge = '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);">Auto-Pass</span>';
        } else if (leaderApproved) {
            statusBadge = '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);">Approved</span>';
        } else {
            statusBadge = '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);">Pending Approval</span>';
        }

        const approvedText = item.approved_by_leader || '<span style="color:rgba(255,255,255,0.35);font-style:italic;">—</span>';
        
        let evidenceLink = '<span style="color:rgba(255,255,255,0.35);font-style:italic;">—</span>';
        if (item.evidence_url) {
            evidenceLink = `<a href="${item.evidence_url}" target="_blank" style="color:#60a5fa;text-decoration:none;font-weight:700;display:inline-flex;align-items:center;gap:4px;">
                <span class="material-symbols-outlined" style="font-size:14px;">visibility</span> Lihat Bukti
            </a>`;
        }

        const dateFormatted = item.inspection_date ? new Date(item.inspection_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

        return `<tr>
            <td style="padding:12px 14px;color:rgba(255,255,255,0.7);">${dateFormatted}</td>
            <td style="padding:12px 14px;font-weight:700;color:white;">${esc(item.inspector_nik || '—')}</td>
            <td style="padding:12px 14px;">
                <div style="font-weight:700;color:white;margin-bottom:2px;">PO: ${esc(item.po_no || item.po_number || '—')}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5);">${esc(item.material_name || '—')}</div>
            </td>
            <td style="padding:12px 14px;text-align:right;font-weight:600;color:white;">${inspect.toLocaleString('id-ID')}</td>
            <td style="padding:12px 14px;text-align:right;font-weight:600;color:${fail > 0 ? '#f87171' : 'rgba(255,255,255,0.7)'};">${fail.toLocaleString('id-ID')}</td>
            <td style="padding:12px 14px;text-align:center;">${statusBadge}</td>
            <td style="padding:12px 14px;font-weight:700;color:white;">${approvedText}</td>
            <td style="padding:12px 14px;text-align:center;">${evidenceLink}</td>
        </tr>`;
    }).join('');
};

window.applyLeaderMonitorFilter = function() {
    window.renderLeaderMonitorLog();
};

window.resetLeaderMonitorFilter = function() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const startEl = document.getElementById('leadermonitor-filter-start');
    const endEl = document.getElementById('leadermonitor-filter-end');
    const statusSelect = document.getElementById('leadermonitor-filter-status');
    if (startEl) startEl.value = todayStr;
    if (endEl) endEl.value = todayStr;
    if (statusSelect) statusSelect.value = 'all';
    window.renderLeaderMonitorLog();
};
