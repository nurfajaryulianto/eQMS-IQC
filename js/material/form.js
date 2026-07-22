// ============================================================
// js/material/form.js — IQC Material: Form Inspeksi Logic
// ============================================================

import { requireMaterialRole, materialLogout, MATERIAL_TEST_MODE, MATERIAL_ROLES } from './auth.js';

// ─── CONFIG ──────────────────────────────────────────────────
// Ganti dengan URL Web App GAS Material Anda setelah di-deploy
const MATERIAL_GAS_URL = 'https://script.google.com/macros/s/AKfycbz8pi3DM_Rqu-3RVkmArhbAGjBRk3li6D6sM3v609_NTZO1SuJ4MIfTCcbGKfT8snAehw/exec';

// ─── STATE ───────────────────────────────────────────────────
let allPOData = [];       // semua master_data dari GAS
let filteredPO = [];      // setelah filter/search
let selectedPO = null;    // PO yang sedang dipilih user
let currentUser = null;   // user yang sedang login

// ─── MOCK DATA (MATERIAL_TEST_MODE) ─────────────────────────
const MOCK_MASTER_DATA = [
    {
        po_number: 'PO-2025-001',
        material_name: 'Upper Leather — Type A',
        item_description: 'Full-grain leather panel for upper',
        uom: 'pcs',
        vendor_name: 'PT Sumber Makmur',
        style: 'NK-DYN-001',
        model_shoe: 'NIKE DYNAMO FREE',
        receive_date: '2026-07-22',
        planned_qty: 500,
        status: 'pending',
    },
    {
        po_number: 'PO-2025-002',
        material_name: 'Outsole Rubber B-Grade',
        item_description: 'Rubber compound outsole, natural blend',
        uom: 'pcs',
        vendor_name: 'CV Karet Nusantara',
        style: 'NK-DYN-001',
        model_shoe: 'NIKE DYNAMO FREE',
        receive_date: '2026-07-21',
        planned_qty: 300,
        status: 'pending',
    },
    {
        po_number: 'PO-2025-003',
        material_name: 'EVA Midsole Foam',
        item_description: 'Expanded EVA foam midsole, density 25',
        uom: 'pcs',
        vendor_name: 'PT Foam Indo',
        style: 'NK-TC-002',
        model_shoe: 'WMNS TENNIS CLASSIC',
        receive_date: '2026-07-20',
        planned_qty: 200,
        status: 'done',
    },
    {
        po_number: 'PO-2025-004',
        material_name: 'Textile Lace Flat 120cm',
        item_description: 'Polyester flat lace, white, 120cm',
        uom: 'set',
        vendor_name: 'PT Sumber Makmur',
        style: 'NK-TC-002',
        model_shoe: 'WMNS TENNIS CLASSIC',
        receive_date: '2026-07-20',
        planned_qty: 400,
        status: 'pending',
    },
    {
        po_number: 'PO-2025-005',
        material_name: 'Thread Nylon 40 Black',
        item_description: 'Nylon thread #40, black, 500m spool',
        uom: 'spool',
        vendor_name: 'CV Benang Jaya',
        style: 'MULTI',
        model_shoe: 'Multiple Models',
        receive_date: '2026-07-19',
        planned_qty: 150,
        status: 'pending',
    },
];

async function populateLeaders() {
    const leaderSelect = document.getElementById('approved-by-leader');
    if (!leaderSelect) return;
    
    leaderSelect.innerHTML = '<option value="">— Tanpa Persetujuan —</option>';
    
    try {
        let users = [];
        if (MATERIAL_TEST_MODE) {
            users = [
                { nik: 'admin', name: 'Admin Material', role: 'admin' },
                { nik: 'spv01', name: 'Supervisor A', role: 'supervisor' },
                { nik: 'mgr01', name: 'Manager B', role: 'manager' },
                { nik: 'inspector1', name: 'Inspector C', role: 'inspector' }
            ];
        } else {
            const res = await fetch(`${MATERIAL_GAS_URL}?action=getUsers`);
            const json = await res.json();
            users = json.data || [];
        }
        
        // Filter for supervisor and manager roles
        const leaders = users.filter(u => {
            const role = String(u.role).toLowerCase().trim();
            return role === 'supervisor' || role === 'manager';
        });
        
        leaders.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.name || u.nik;
            opt.textContent = `${u.name || u.nik} (${u.role})`;
            leaderSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('populateLeaders error:', err);
    }
}

// ─── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireMaterialRole([MATERIAL_ROLES.ADMIN, MATERIAL_ROLES.SUPERVISOR, MATERIAL_ROLES.MANAGER, MATERIAL_ROLES.INSPECTOR]);
    if (!currentUser) return; // requireMaterialRole handles redirect

    setupNavbar(currentUser);
    setupValidationDialog();
    setupLogout();

    await fetchMasterData();
    await populateLeaders();

    const leaderSelect = document.getElementById('approved-by-leader');
    if (leaderSelect) {
        leaderSelect.addEventListener('change', () => {
            const container = document.getElementById('evidence-upload-container');
            const fileInput = document.getElementById('evidence-file');
            if (container) {
                if (leaderSelect.value) {
                    container.style.display = 'block';
                } else {
                    container.style.display = 'none';
                    if (fileInput) fileInput.value = '';
                }
            }
        });
    }
});

// ─── NAVBAR ──────────────────────────────────────────────────

function setupNavbar(user) {
    const nameEl = document.getElementById('nav-user-name');
    if (nameEl) {
        nameEl.textContent = user.name || user.nik || 'User';
    }

    const role = user.role;

    // Show admin & dashboard links for admin, supervisor, manager
    if (role === MATERIAL_ROLES.ADMIN || role === MATERIAL_ROLES.SUPERVISOR || role === MATERIAL_ROLES.MANAGER) {
        const dashLink = document.getElementById('nav-dashboard-link');
        const adminLink = document.getElementById('nav-admin-link');
        if (dashLink) dashLink.style.display = 'flex';
        if (adminLink) adminLink.style.display = 'flex';
    }
}

// ─── LOGOUT ──────────────────────────────────────────────────

function setupLogout() {
    const btn = document.getElementById('nav-logout-btn');
    if (btn) {
        btn.addEventListener('click', async () => {
            if (confirm('Yakin ingin logout?')) {
                await materialLogout();
            }
        });
    }
}

// ─── FETCH MASTER DATA ────────────────────────────────────────

async function fetchMasterData() {
    const syncEl = document.getElementById('sync-status-text');

    try {
        if (MATERIAL_TEST_MODE) {
            allPOData = MOCK_MASTER_DATA;
            setSyncStatus('Data mock aktif', 'ok');
            renderPOList(allPOData);
            return;
        }

        setSyncStatus('Memuat data...', 'loading');
        const res = await fetch(`${MATERIAL_GAS_URL}?action=getMasterData`);
        const json = await res.json();

        if (json.error) throw new Error(json.error);

        allPOData = (json.data || []).map(row => ({
            po_number: row.po_number || row.PONumber || '',
            material_name: row.material_name || row.MaterialName || '',
            item_description: row.item_description || row.ItemDescription || '',
            uom: row.uom || row.UOM || '',
            vendor_name: row.vendor_name || row.VendorName || '',
            style: row.style || row.Style || '',
            model_shoe: row.model_shoe || row.ModelShoe || '',
            planned_qty: Number(row.planned_qty || row.PlannedQty) || 0,
            receive_date: row.receive_date || row.ReceiveDate || '',
            status: (row.status || row.Status || 'pending').toLowerCase(),
        }));

        setSyncStatus(`${allPOData.length} item tersedia`, 'ok');
        renderPOList(allPOData);

    } catch (err) {
        console.error('fetchMasterData error:', err);
        setSyncStatus('Gagal memuat data', 'error');
        showToast('Gagal memuat data PO: ' + err.message, 'error');
        showPOEmpty();
    }
}

function setSyncStatus(text, state) {
    const el = document.getElementById('sync-status');
    const textEl = document.getElementById('sync-status-text');
    if (!el || !textEl) return;
    textEl.textContent = text;

    const styles = {
        ok: { bg: '#f0fdf4', border: '#86efac', color: '#16a34a', icon: 'wifi' },
        loading: { bg: '#eff6ff', border: '#93c5fd', color: '#2563eb', icon: 'sync' },
        error: { bg: '#fff5f5', border: '#fca5a5', color: '#dc2626', icon: 'wifi_off' },
    };
    const s = styles[state] || styles.ok;
    el.style.background = s.bg;
    el.style.borderColor = s.border;
    el.style.color = s.color;
    const iconEl = el.querySelector('.material-symbols-outlined');
    if (iconEl) iconEl.textContent = s.icon;
}


// ─── RENDER PO LIST ───────────────────────────────────────────

function renderPOList(data) {
    const container = document.getElementById('po-list');
    const loadingEl = document.getElementById('po-loading');
    const emptyEl = document.getElementById('po-empty');
    const countEl = document.getElementById('po-count-badge');

    if (loadingEl) loadingEl.style.display = 'none';

    if (!data.length) {
        showPOEmpty();
        if (countEl) countEl.textContent = '0 item';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (countEl) countEl.textContent = `${data.length} item`;

    // Remove existing cards (keep loading/empty elements)
    container.querySelectorAll('.po-card').forEach(el => el.remove());

    // Sort: pending -> 0, in-progress -> 1, done -> 2
    const sorted = [...data].sort((a, b) => {
        const order = { 'pending': 0, 'in-progress': 1, 'done': 2 };
        const valA = order[a.status] !== undefined ? order[a.status] : 0;
        const valB = order[b.status] !== undefined ? order[b.status] : 0;
        return valA - valB;
    });

    sorted.forEach(po => {

        const card = document.createElement('div');
        card.className = 'po-card';
        card.dataset.poNumber = po.po_number;

        const badgeClass = po.status === 'done' ? 'badge-done' : (po.status === 'in-progress' ? 'badge-progress' : 'badge-pending');
        const badgeText = po.status === 'done' ? 'Done' : (po.status === 'in-progress' ? 'In-Progress' : 'Pending');
        const isDisabled = po.status === 'done';

        if (isDisabled) {
            card.style.opacity = '0.55';
            card.style.cursor = 'default';
        }

        card.innerHTML = `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:10px;">
                <div>
                    <div style="font-size:13px; font-weight:700; color:#ffffff; margin-bottom:2px;">${esc(po.po_number)}</div>
                    <div style="font-size:12px; color:rgba(255, 255, 255, 0.7); font-weight:500;">${esc(po.vendor_name)}</div>
                </div>
                <span style="font-size:11px; font-weight:700; padding:3px 9px; border-radius:99px; white-space:nowrap; flex-shrink:0;" class="${badgeClass}">${badgeText}</span>
            </div>
            <div style="font-size:13px; color:#34d399; font-weight:700; margin-bottom:4px; line-height:1.3;">${esc(po.material_name)}</div>
            <div style="font-size:11px; color:rgba(255, 255, 255, 0.5); margin-bottom:8px;">${esc(po.item_description)}</div>
            <div style="display:flex; gap:12px; font-size:11px; color:rgba(255, 255, 255, 0.7);">
                <span><span style="color:rgba(255, 255, 255, 0.5);">QTY </span>${po.planned_qty.toLocaleString('id-ID')} ${esc(po.uom)}</span>
                <span><span style="color:rgba(255, 255, 255, 0.5);">STYLE </span>${esc(po.style)}</span>
            </div>
        `;

        if (!isDisabled) {
            card.addEventListener('click', () => selectPO(po, card));
        }

        container.appendChild(card);
    });
}

function showPOEmpty() {
    const loadingEl = document.getElementById('po-loading');
    const emptyEl = document.getElementById('po-empty');
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
}

function formatReceiveDate(raw) {
    if (!raw) return '—';
    const str = String(raw).trim();
    if (!str || str === 'null' || str === 'undefined') return '—';
    if (str.includes('T')) return str.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return str;
}

// ─── SELECT PO ────────────────────────────────────────────────

function selectPO(po, cardEl) {
    // Deselect all
    document.querySelectorAll('.po-card').forEach(c => c.classList.remove('selected'));
    cardEl.classList.add('selected');

    selectedPO = po;

    // Show detail
    const detailEl = document.getElementById('po-detail');
    if (detailEl) {
        detailEl.style.fontStyle = 'normal';
        detailEl.innerHTML = `
            <div style="display:grid; grid-template-columns:auto 1fr; gap:6px 14px; font-size:13px;">
                ${row('PO Number', po.po_number)}
                ${row('Material', po.material_name)}
                ${row('Deskripsi', po.item_description)}
                ${row('UOM', po.uom)}
                ${row('Vendor', po.vendor_name)}
                ${row('Style', po.style)}
                ${row('Model Sepatu', po.model_shoe)}
                ${row('Received Date', formatReceiveDate(po.receive_date))}
                ${row('Planned Qty', `${po.planned_qty.toLocaleString('id-ID')} ${po.uom}`)}
            </div>
        `;
    }

    // Enable form
    const formSection = document.getElementById('qty-form-section');
    if (formSection) {
        formSection.style.opacity = '1';
        formSection.style.pointerEvents = 'auto';
    }

    // Reset inputs
    const qtyInspectEl = document.getElementById('qty-inspect');
    const qtyFailEl = document.getElementById('qty-fail');
    const notesEl = document.getElementById('defect-notes');
    const checkColorEl = document.getElementById('check-color');
    if (qtyInspectEl) qtyInspectEl.value = '';
    if (qtyFailEl) qtyFailEl.value = '';
    if (notesEl) notesEl.value = '';
    if (checkColorEl) checkColorEl.value = 'OK';
    updateCalculations();
}

function row(label, value) {
    return `<span style="color:rgba(255,255,255,0.6); font-weight:600; white-space:nowrap; align-self:start;">${label}</span><span style="color:#ffffff; font-weight:500; word-break:break-word; overflow-wrap:anywhere; line-height:1.4;">${esc(String(value))}</span>`;
}

// ─── FILTER PO LIST ───────────────────────────────────────────

window.filterPOList = function () {
    const search = (document.getElementById('po-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('status-filter')?.value || 'all';

    filteredPO = allPOData.filter(po => {
        const matchSearch = !search || [
            po.po_number, po.material_name, po.item_description, po.vendor_name, po.style, po.model_shoe
        ].some(f => (f || '').toLowerCase().includes(search));

        const matchStatus = status === 'all' || 
            (status === 'in-progress' ? (po.status === 'in-progress' || po.status === 'in progress') : po.status === status);

        return matchSearch && matchStatus;
    });

    renderPOList(filteredPO);
};

// ─── QTY CALCULATIONS ─────────────────────────────────────────

window.updateCalculations = function () {
    const inspect = parseInt(document.getElementById('qty-inspect')?.value, 10) || 0;
    const fail = parseInt(document.getElementById('qty-fail')?.value, 10) || 0;
    const pass = Math.max(0, inspect - fail);

    const passRateEl = document.getElementById('calc-pass-rate');
    const failRateEl = document.getElementById('calc-fail-rate');

    if (inspect > 0) {
        const passRate = ((pass / inspect) * 100).toFixed(1);
        const failRate = ((fail / inspect) * 100).toFixed(1);
        if (passRateEl) passRateEl.textContent = `${passRate}%`;
        if (failRateEl) failRateEl.textContent = `${failRate}%`;
    } else {
        if (passRateEl) passRateEl.textContent = '—';
        if (failRateEl) failRateEl.textContent = '—';
    }
};

// ─── VALIDATION & SUBMIT ──────────────────────────────────────

window.openValidationDialog = function () {
    const inspect = parseInt(document.getElementById('qty-inspect')?.value, 10) || 0;
    const fail = parseInt(document.getElementById('qty-fail')?.value, 10) || 0;
    const notes = document.getElementById('defect-notes')?.value.trim() || '';
    const leaderSelect = document.getElementById('approved-by-leader');
    const fileInput = document.getElementById('evidence-file');

    const errors = [];
    if (!selectedPO) errors.push('Silakan pilih PO/Material terlebih dahulu.');
    if (inspect <= 0) errors.push('Qty Inspect harus lebih dari 0.');
    if (fail < 0) errors.push('Qty Fail tidak boleh negatif.');
    if (fail > inspect) errors.push(`Qty Fail (${fail}) tidak boleh melebihi Qty Inspect (${inspect}).`);
    
    if (leaderSelect && leaderSelect.value) {
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            errors.push('Harap upload evidence / bukti persetujuan leader.');
        }
    }

    const errorsEl = document.getElementById('validation-errors');
    const summaryEl = document.getElementById('validation-summary');
    const overlay = document.getElementById('validation-overlay');

    if (errors.length) {
        errorsEl.style.display = 'block';
        errorsEl.innerHTML = errors.map(e =>
            `<div style="display:flex;align-items:center;gap:8px;color:#dc2626;font-size:13px;font-weight:500;">
                <span class="material-symbols-outlined" style="font-size:16px;flex-shrink:0;">error</span>${e}
            </div>`
        ).join('');
        summaryEl.style.display = 'none';
    } else {
        errorsEl.style.display = 'none';
        const pass = inspect - fail;
        const passRate = ((pass / inspect) * 100).toFixed(1);
        const rolling = document.getElementById('rolling-inspection')?.checked ? 'Yes' : 'No';
        const checkColor = document.getElementById('check-color')?.value.trim() || 'OK';
        const leaderVal = leaderSelect && leaderSelect.value ? leaderSelect.value : 'Tidak Ada';
        const evidenceFileText = fileInput && fileInput.files.length > 0 ? fileInput.files[0].name : '—';
        const statusChecking = document.getElementById('checking-status')?.value === 'in-progress' ? 'In-Progress (Belum Selesai)' : 'Done (Selesai)';
        summaryEl.innerHTML = `
            ${summaryRow('PO Number', selectedPO.po_number)}
            ${summaryRow('Material', selectedPO.material_name)}
            ${summaryRow('Vendor', selectedPO.vendor_name)}
            ${summaryRow('Qty Inspect', inspect.toLocaleString('id-ID'))}
            ${summaryRow('Qty Fail', fail.toLocaleString('id-ID'))}
            ${summaryRow('Qty Pass', `${pass.toLocaleString('id-ID')} (${passRate}%)`)}
            ${summaryRow('Check Color', checkColor)}
            ${summaryRow('Rolling Method', rolling)}
            ${summaryRow('Leader Approval', leaderVal)}
            ${leaderSelect && leaderSelect.value ? summaryRow('Evidence File', evidenceFileText) : ''}
            ${summaryRow('Status Checking', statusChecking)}
            ${notes ? summaryRow('Catatan', notes) : ''}
        `;
    }

    overlay.style.display = 'flex';
};

function summaryRow(label, value) {
    return `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:12px;">
        <span style="color:#94a3b8; font-weight:600; font-size:12px; white-space:nowrap;">${label}</span>
        <span style="color:white; font-weight:600; font-size:13px; text-align:right;">${esc(String(value))}</span>
    </div>`;
}

function setupValidationDialog() {
    const overlay = document.getElementById('validation-overlay');
    const cancelBtn = document.getElementById('validation-cancel-btn');
    const confirmBtn = document.getElementById('validation-confirm-btn');

    if (cancelBtn) cancelBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
    if (confirmBtn) confirmBtn.addEventListener('click', submitInspection);
}

async function submitInspection() {
    const overlay = document.getElementById('validation-overlay');
    const loading = document.getElementById('loading-overlay');
    const loadingTxt = document.getElementById('loading-text');

    overlay.style.display = 'none';
    loading.classList.add('visible');
    if (loadingTxt) loadingTxt.textContent = 'Menyimpan data...';

    const inspect = parseInt(document.getElementById('qty-inspect')?.value, 10) || 0;
    const fail = parseInt(document.getElementById('qty-fail')?.value, 10) || 0;
    const notes = document.getElementById('defect-notes')?.value.trim() || '';
    const rollingChecked = document.getElementById('rolling-inspection')?.checked ? 'Yes' : 'No';
    const inspectorNik = currentUser?.nik || '';
    const checkColor = document.getElementById('check-color')?.value.trim() || 'OK';
    const leaderSelect = document.getElementById('approved-by-leader');
    const fileInput = document.getElementById('evidence-file');

    let fileData = null;
    let fileName = '';
    let fileType = '';

    if (leaderSelect && leaderSelect.value && fileInput && fileInput.files.length > 0) {
        if (loadingTxt) loadingTxt.textContent = 'Membaca file evidence...';
        const file = fileInput.files[0];
        fileName = file.name;
        fileType = file.type;
        try {
            fileData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            });
        } catch (err) {
            loading.classList.remove('visible');
            showToast('Gagal membaca file evidence.', 'error');
            return;
        }
    }

    if (loadingTxt) loadingTxt.textContent = 'Mengirim data ke server...';

    const checkingStatus = document.getElementById('checking-status')?.value || 'done';

    const payload = {
        action: 'submitInspection',
        po_number: selectedPO.po_number,
        inspector_nik: inspectorNik,
        qty_inspect: inspect,
        qty_fail: fail,
        defect_notes: notes,
        result_status: fail === 0 ? 'Pass' : 'Fail',
        input_type: 'manual',
        rolling_inspection: rollingChecked,
        check_color: checkColor,
        approved_by_leader: leaderSelect ? leaderSelect.value : '',
        file_data: fileData,
        file_name: fileName,
        file_type: fileType,
        inspection_date: new Date().toISOString(),
        status: checkingStatus,
    };

    try {
        if (MATERIAL_TEST_MODE) {
            console.log('[TEST MODE] Payload:', JSON.stringify(payload, null, 2));
            await delay(1000);
            // Update PO status in local mock
            const idx = allPOData.findIndex(p => p.po_number === selectedPO.po_number);
            if (idx !== -1) allPOData[idx].status = checkingStatus;

            loading.classList.remove('visible');
            showToast(`Data inspeksi ${selectedPO.po_number} berhasil disimpan! (simulasi)`, 'success');
            resetForm();
            filterPOList();
            return;
        }

        const res = await fetch(MATERIAL_GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (json.status === 'ok' || res.ok) {
            loading.classList.remove('visible');
            showToast(`Data inspeksi ${selectedPO.po_number} berhasil disimpan!`, 'success');
            // Refresh data
            await fetchMasterData();
            resetForm();
        } else {
            throw new Error(json.message || 'Gagal menyimpan data.');
        }

    } catch (err) {
        console.error('submitInspection error:', err);
        loading.classList.remove('visible');
        showToast('Error: ' + err.message, 'error');
    }
}

function resetForm() {
    selectedPO = null;
    document.querySelectorAll('.po-card').forEach(c => c.classList.remove('selected'));

    const formSection = document.getElementById('qty-form-section');
    if (formSection) { formSection.style.opacity = '0.4'; formSection.style.pointerEvents = 'none'; }

    const detailEl = document.getElementById('po-detail');
    if (detailEl) { detailEl.innerHTML = 'Pilih PO dari daftar di kiri untuk mulai inspeksi.'; detailEl.style.fontStyle = 'italic'; }

    ['qty-inspect', 'qty-fail'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    const rollingCheck = document.getElementById('rolling-inspection');
    if (rollingCheck) rollingCheck.checked = false;

    const notesEl = document.getElementById('defect-notes');
    if (notesEl) notesEl.value = '';

    const leaderSelect = document.getElementById('approved-by-leader');
    if (leaderSelect) leaderSelect.value = '';
    const fileInput = document.getElementById('evidence-file');
    if (fileInput) fileInput.value = '';
    const container = document.getElementById('evidence-upload-container');
    if (container) container.style.display = 'none';

    document.getElementById('calc-pass-rate').textContent = '—';
    document.getElementById('calc-fail-rate').textContent = '—';
}

// ─── TOAST ───────────────────────────────────────────────────

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

// ─── UTILS ───────────────────────────────────────────────────

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
