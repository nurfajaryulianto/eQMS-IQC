// ============================================================
// js/material/form.js — IQC Material: Form Inspeksi Logic
// ============================================================

import { requireMaterialRole, materialLogout, MATERIAL_TEST_MODE, MATERIAL_ROLES, MATERIAL_GAS_URL, gasAuthedUrl, gasAuthedPayload } from './auth.js';

// ─── STATE ───────────────────────────────────────────────────
let allPOData = [];       // semua master_data dari GAS
let filteredPO = [];      // setelah filter/search
let selectedPO = null;    // PO yang sedang dipilih user
let currentUser = null;   // user yang sedang login

let currentInspectionType = 'raw'; // 'raw' | 'laminating'
let lamColorChoice = 'YES'; // 'YES' | 'NO'
let lamPackagingChoice = 'YES'; // 'YES' | 'NO'

// ─── GLOBAL SWITCHERS & TOGGLES FOR UI ───────────────────────

window.updateTabBadges = function (po) {
    const badgeRaw = document.getElementById('badge-tab-raw');
    const badgeLam = document.getElementById('badge-tab-laminating');
    const badgeBond = document.getElementById('badge-tab-bonding');
    const tabRaw = document.getElementById('tab-check-raw');
    const tabLam = document.getElementById('tab-check-laminating');
    const tabBond = document.getElementById('tab-check-bonding');

    if (!po) {
        [badgeRaw, badgeLam, badgeBond].forEach(b => {
            if (b) {
                b.textContent = 'Pending';
                b.style.background = 'rgba(255,255,255,0.08)';
                b.style.color = 'rgba(255,255,255,0.6)';
            }
        });
        return;
    }

    if (badgeRaw) {
        if (po.raw_done) {
            badgeRaw.textContent = '✓ Selesai';
            badgeRaw.style.background = 'rgba(16, 185, 129, 0.25)';
            badgeRaw.style.color = '#34d399';
            badgeRaw.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            if (tabRaw) tabRaw.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else {
            badgeRaw.textContent = 'Pending';
            badgeRaw.style.background = 'rgba(255,255,255,0.08)';
            badgeRaw.style.color = 'rgba(255,255,255,0.6)';
            badgeRaw.style.border = 'none';
        }
    }

    if (badgeLam) {
        if (po.laminating_done) {
            badgeLam.textContent = '✓ Selesai';
            badgeLam.style.background = 'rgba(16, 185, 129, 0.25)';
            badgeLam.style.color = '#34d399';
            badgeLam.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            if (tabLam) tabLam.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else {
            badgeLam.textContent = 'Pending';
            badgeLam.style.background = 'rgba(255,255,255,0.08)';
            badgeLam.style.color = 'rgba(255,255,255,0.6)';
            badgeLam.style.border = 'none';
        }
    }

    if (badgeBond) {
        if (po.bonding_done) {
            badgeBond.textContent = '✓ Selesai';
            badgeBond.style.background = 'rgba(16, 185, 129, 0.25)';
            badgeBond.style.color = '#34d399';
            badgeBond.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            if (tabBond) tabBond.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else {
            badgeBond.textContent = 'Pending';
            badgeBond.style.background = 'rgba(255,255,255,0.08)';
            badgeBond.style.color = 'rgba(255,255,255,0.6)';
            badgeBond.style.border = 'none';
        }
    }
};

window.switchInspectionTab = function (type) {
    currentInspectionType = type;
    const tabRaw = document.getElementById('tab-check-raw');
    const tabLam = document.getElementById('tab-check-laminating');
    const tabBond = document.getElementById('tab-check-bonding');
    const bodyRaw = document.getElementById('form-raw-material-body');
    const bodyLam = document.getElementById('form-laminating-material-body');
    const bodyBond = document.getElementById('form-bonding-test-body');
    const commonFields = document.getElementById('common-fields-body');
    const sectionTitle = document.getElementById('form-section-title');
    const doneNotice = document.getElementById('done-po-notice');
    const submitBtn = document.getElementById('submit-btn');

    const isRawDone = selectedPO && selectedPO.raw_done;
    const isLamDone = selectedPO && selectedPO.laminating_done;
    const isBondDone = selectedPO && selectedPO.bonding_done;

    [tabRaw, tabLam, tabBond].forEach(t => t && t.classList.remove('active'));
    if (bodyRaw) bodyRaw.style.display = 'none';
    if (bodyLam) bodyLam.style.display = 'none';
    if (bodyBond) bodyBond.style.display = 'none';

    if (type === 'raw') {
        if (tabRaw) tabRaw.classList.add('active');
        if (bodyRaw) bodyRaw.style.display = 'flex';
        if (commonFields) commonFields.style.display = 'flex';
        if (sectionTitle) sectionTitle.textContent = 'Input Hasil Inspeksi - Raw Material';

        if (isRawDone) {
            if (doneNotice) {
                doneNotice.style.display = 'flex';
                doneNotice.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0;">lock</span><span>Pengecekan <strong>Raw Material</strong> untuk PO ini telah <strong>Selesai (Done)</strong> dan dikunci. Pilih jenis pengecekan lainnya yang masih Pending.</span>`;
            }
            if (bodyRaw) { bodyRaw.style.opacity = '0.35'; bodyRaw.style.pointerEvents = 'none'; }
            if (commonFields) { commonFields.style.opacity = '0.35'; commonFields.style.pointerEvents = 'none'; }
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.4';
                submitBtn.style.pointerEvents = 'none';
                submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">lock</span> Pengecekan Sudah Selesai';
            }
        } else {
            if (doneNotice) doneNotice.style.display = 'none';
            if (bodyRaw) { bodyRaw.style.opacity = '1'; bodyRaw.style.pointerEvents = 'auto'; }
            if (commonFields) { commonFields.style.opacity = '1'; commonFields.style.pointerEvents = 'auto'; }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.pointerEvents = 'auto';
                submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">fact_check</span> Verifikasi & Simpan';
            }
        }
    } else if (type === 'laminating') {
        if (tabLam) tabLam.classList.add('active');
        if (bodyLam) bodyLam.style.display = 'flex';
        if (commonFields) commonFields.style.display = 'flex';
        if (sectionTitle) sectionTitle.textContent = 'Input Hasil Inspeksi - Laminating Material';

        if (isLamDone) {
            if (doneNotice) {
                doneNotice.style.display = 'flex';
                doneNotice.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0;">lock</span><span>Pengecekan <strong>Laminating Material</strong> untuk PO ini telah <strong>Selesai (Done)</strong> dan dikunci. Pilih jenis pengecekan lainnya yang masih Pending.</span>`;
            }
            if (bodyLam) { bodyLam.style.opacity = '0.35'; bodyLam.style.pointerEvents = 'none'; }
            if (commonFields) { commonFields.style.opacity = '0.35'; commonFields.style.pointerEvents = 'none'; }
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.4';
                submitBtn.style.pointerEvents = 'none';
                submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">lock</span> Pengecekan Sudah Selesai';
            }
        } else {
            if (doneNotice) doneNotice.style.display = 'none';
            if (bodyLam) { bodyLam.style.opacity = '1'; bodyLam.style.pointerEvents = 'auto'; }
            if (commonFields) { commonFields.style.opacity = '1'; commonFields.style.pointerEvents = 'auto'; }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.pointerEvents = 'auto';
                submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">fact_check</span> Verifikasi & Simpan';
            }
        }
    } else if (type === 'bonding') {
        if (tabBond) tabBond.classList.add('active');
        if (bodyBond) bodyBond.style.display = 'flex';
        if (commonFields) commonFields.style.display = 'none';
        if (sectionTitle) sectionTitle.textContent = 'Upload Hasil - Bonding Test';

        if (isBondDone) {
            if (doneNotice) {
                doneNotice.style.display = 'flex';
                doneNotice.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0;">lock</span><span>Pengujian <strong>Bonding Test</strong> untuk PO ini telah <strong>Selesai (Done)</strong> dan dikunci. Berkas sudah tersimpan di Google Drive.</span>`;
            }
            if (bodyBond) { bodyBond.style.opacity = '0.35'; bodyBond.style.pointerEvents = 'none'; }
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.4';
                submitBtn.style.pointerEvents = 'none';
                submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">lock</span> Pengecekan Sudah Selesai';
            }
        } else {
            if (doneNotice) doneNotice.style.display = 'none';
            if (bodyBond) { bodyBond.style.opacity = '1'; bodyBond.style.pointerEvents = 'auto'; }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.pointerEvents = 'auto';
                submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">fact_check</span> Verifikasi & Simpan';
            }
        }
    }
};

window.setLamColorChoice = function (choice) {
    lamColorChoice = choice;
    const btnYes = document.getElementById('lam-color-yes-btn');
    const btnNo = document.getElementById('lam-color-no-btn');
    if (choice === 'YES') {
        if (btnYes) btnYes.className = 'toggle-choice-btn active-yes';
        if (btnNo) btnNo.className = 'toggle-choice-btn';
    } else {
        if (btnYes) btnYes.className = 'toggle-choice-btn';
        if (btnNo) btnNo.className = 'toggle-choice-btn active-no';
    }
};

window.setLamPackagingChoice = function (choice) {
    lamPackagingChoice = choice;
    const btnYes = document.getElementById('lam-packaging-yes-btn');
    const btnNo = document.getElementById('lam-packaging-no-btn');
    const reasonWrap = document.getElementById('lam-packaging-reason-wrap');
    if (choice === 'YES') {
        if (btnYes) btnYes.className = 'toggle-choice-btn active-yes';
        if (btnNo) btnNo.className = 'toggle-choice-btn';
        if (reasonWrap) reasonWrap.style.display = 'none';
    } else {
        if (btnYes) btnYes.className = 'toggle-choice-btn';
        if (btnNo) btnNo.className = 'toggle-choice-btn active-no';
        if (reasonWrap) reasonWrap.style.display = 'block';
    }
};

window.toggleLamRollPercentage = function () {
    const chk = document.getElementById('lam-roll-checkbox');
    const wrap = document.getElementById('lam-roll-percentage-wrap');
    if (wrap) wrap.style.display = chk && chk.checked ? 'block' : 'none';
};

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
        checked_qty: 0,
        in_progress_qty: 0,
        balance_qty: 500,
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
        checked_qty: 120,
        in_progress_qty: 120,
        balance_qty: 180,
        status: 'in-progress',
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
        checked_qty: 0,
        in_progress_qty: 0,
        balance_qty: 200,
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
        checked_qty: 0,
        in_progress_qty: 0,
        balance_qty: 400,
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
        checked_qty: 50,
        in_progress_qty: 50,
        balance_qty: 100,
        status: 'in-progress',
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
            const url = await gasAuthedUrl('getUsers');
            const res = await fetch(url);
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
        const url = await gasAuthedUrl('getMasterData');
        const res = await fetch(url);
        const json = await res.json();

        if (json.error) throw new Error(json.error);

        allPOData = (json.data || []).map(row => {
            const plannedQty = Number(row.planned_qty || row.PlannedQty) || 0;
            const checkedQty = Number(row.checked_qty) || 0;
            const balanceQty = Math.max(0, plannedQty - checkedQty);
            const statusVal = (row.status || row.Status || 'pending').toLowerCase();
            return {
                po_number: row.po_number || row.PONumber || '',
                material_name: row.material_name || row.MaterialName || '',
                item_description: row.item_description || row.ItemDescription || '',
                uom: row.uom || row.UOM || '',
                vendor_name: row.vendor_name || row.VendorName || '',
                style: row.style || row.Style || '',
                model_shoe: row.model_shoe || row.ModelShoe || '',
                planned_qty: plannedQty,
                checked_qty: checkedQty,
                in_progress_qty: checkedQty,
                balance_qty: balanceQty,
                receive_date: row.receive_date || row.ReceiveDate || '',
                status: statusVal,
                raw_done: Boolean(row.raw_done),
                laminating_done: Boolean(row.laminating_done),
                bonding_done: Boolean(row.bonding_done)
            };
        });

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

        // All PO cards remain clickable regardless of status
        card.addEventListener('click', () => selectPO(po, card));

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

function showSwitchPOModal(fromPO, toPO) {
    return new Promise((resolve) => {
        const modal = document.getElementById('switch-po-modal');
        const fromEl = document.getElementById('switch-from-po');
        const toEl = document.getElementById('switch-to-po');
        const cancelBtn = document.getElementById('switch-po-cancel-btn');
        const confirmBtn = document.getElementById('switch-po-confirm-btn');

        if (!modal || !cancelBtn || !confirmBtn) {
            resolve(confirm(`Anda sedang mengisi form / memilih file untuk PO ${fromPO}.\n\nYakin ingin mengganti ke PO ${toPO}? Berkas yang sudah dipilih akan ter-reset.`));
            return;
        }

        if (fromEl) fromEl.textContent = fromPO;
        if (toEl) toEl.textContent = toPO;

        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
        };

        const onCancel = () => { cleanup(); resolve(false); };
        const onConfirm = () => { cleanup(); resolve(true); };

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
    });
}

async function selectPO(po, cardEl) {
    // Safety check: if user already chose a file or entered input for a different PO, confirm switch
    const bondingFileEl = document.getElementById('bonding-file');
    const evidenceFileEl = document.getElementById('evidence-file');
    const qtyInspectEl = document.getElementById('qty-inspect');
    const hasUnsubmittedData = (bondingFileEl && bondingFileEl.files.length > 0) ||
        (evidenceFileEl && evidenceFileEl.files.length > 0) ||
        (qtyInspectEl && qtyInspectEl.value && parseInt(qtyInspectEl.value, 10) > 0);

    if (selectedPO && selectedPO.po_number !== po.po_number && hasUnsubmittedData) {
        const confirmSwitch = await showSwitchPOModal(selectedPO.po_number, po.po_number);
        if (!confirmSwitch) {
            return; // Cancel PO switch
        }
    }

    // Deselect all
    document.querySelectorAll('.po-card').forEach(c => c.classList.remove('selected'));
    cardEl.classList.add('selected');

    selectedPO = po;

    // Reset file inputs when switching POs
    if (bondingFileEl) bondingFileEl.value = '';
    if (evidenceFileEl) evidenceFileEl.value = '';
    const bondingNotesEl = document.getElementById('bonding-notes');
    if (bondingNotesEl) bondingNotesEl.value = '';

    // Update target PO badge in bonding form
    const bondingTargetPoNo = document.getElementById('bonding-target-po-no');
    const bondingTargetMatName = document.getElementById('bonding-target-mat-name');
    if (bondingTargetPoNo) bondingTargetPoNo.textContent = po.po_number;
    if (bondingTargetMatName) bondingTargetMatName.textContent = po.material_name || '';

    // Show detail
    const detailEl = document.getElementById('po-detail');
    if (detailEl) {
        detailEl.style.fontStyle = 'normal';
        const checkedQty = po.checked_qty || 0;
        const balanceQty = po.balance_qty != null ? po.balance_qty : Math.max(0, po.planned_qty - checkedQty);
        const inProgressColor = checkedQty > 0 ? '#fbbf24' : 'rgba(255,255,255,0.7)';
        const balanceColor = balanceQty > 0 ? '#60a5fa' : '#34d399';
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
                <span style="color:rgba(255,255,255,0.6); font-weight:600; white-space:nowrap; align-self:start;">In-Progress Qty</span><span style="color:${inProgressColor}; font-weight:700; word-break:break-word; overflow-wrap:anywhere; line-height:1.4;">${checkedQty.toLocaleString('id-ID')} ${esc(po.uom)}</span>
                <span style="color:rgba(255,255,255,0.6); font-weight:600; white-space:nowrap; align-self:start;">Balance Qty</span><span style="color:${balanceColor}; font-weight:700; word-break:break-word; overflow-wrap:anywhere; line-height:1.4;">${balanceQty.toLocaleString('id-ID')} ${esc(po.uom)}</span>
            </div>
        `;
    }

    // Enable inspection type section & form section
    const typeSection = document.getElementById('inspection-type-section');
    if (typeSection) {
        typeSection.style.opacity = '1';
        typeSection.style.pointerEvents = 'auto';
    }
    const formSection = document.getElementById('qty-form-section');
    if (formSection) {
        formSection.style.opacity = '1';
        formSection.style.pointerEvents = 'auto';
    }

    // Update tab status badges for selected PO
    window.updateTabBadges(po);

    // Auto-select first pending tab or default to raw
    if (!po.raw_done) {
        switchInspectionTab('raw');
    } else if (!po.laminating_done) {
        switchInspectionTab('laminating');
    } else if (!po.bonding_done) {
        switchInspectionTab('bonding');
    } else {
        switchInspectionTab('raw');
    }

    // Reset inputs & set max attributes for error proofing
    const qtyFailEl = document.getElementById('qty-fail');
    const notesEl = document.getElementById('defect-notes');
    const checkColorEl = document.getElementById('check-color');

    const maxAllowed = getMaxAllowedInspect(po);
    if (qtyInspectEl) {
        qtyInspectEl.value = '';
        qtyInspectEl.max = maxAllowed;
        qtyInspectEl.placeholder = `Maks. ${maxAllowed.toLocaleString('id-ID')}`;
    }
    if (qtyFailEl) {
        qtyFailEl.value = '';
        qtyFailEl.max = maxAllowed;
        qtyFailEl.placeholder = `Maks. Qty Inspect`;
    }
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
    const dateVal = document.getElementById('po-date-filter')?.value || '';
    const clearBtn = document.getElementById('po-date-clear-btn');

    if (clearBtn) {
        clearBtn.style.display = dateVal ? 'flex' : 'none';
    }

    filteredPO = allPOData.filter(po => {
        const matchSearch = !search || [
            po.po_number, po.material_name, po.item_description, po.vendor_name, po.style, po.model_shoe
        ].some(f => (f || '').toLowerCase().includes(search));

        const matchStatus = status === 'all' ||
            (status === 'in-progress' ? (po.status === 'in-progress' || po.status === 'in progress') : po.status === status);

        let matchDate = true;
        if (dateVal) {
            const rawDate = String(po.receive_date || po.uploaded_at || '').trim();
            if (rawDate) {
                let normalizedDate = rawDate.split('T')[0];
                if (rawDate.includes('-') && rawDate.split('-')[0].length === 2) {
                    const parts = rawDate.split('-');
                    normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                } else if (rawDate.includes('/') && rawDate.split('/')[0].length === 2) {
                    const parts = rawDate.split('/');
                    normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                matchDate = (normalizedDate === dateVal);
            } else {
                matchDate = false;
            }
        }

        return matchSearch && matchStatus && matchDate;
    });

    renderPOList(filteredPO);
};

window.clearPOFilterDate = function () {
    const dateInput = document.getElementById('po-date-filter');
    if (dateInput) dateInput.value = '';
    filterPOList();
};

function getMaxAllowedInspect(po) {
    if (!po) return 0;
    if (po.checked_qty > 0 || po.status === 'in-progress' || po.status === 'in progress') {
        return po.balance_qty != null ? po.balance_qty : Math.max(0, po.planned_qty - (po.checked_qty || 0));
    }
    return po.planned_qty;
}

// ─── QTY CALCULATIONS & ERROR PROOFING ────────────────────────

window.updateCalculations = function () {
    const qtyInspectEl = document.getElementById('qty-inspect');
    const qtyFailEl = document.getElementById('qty-fail');

    let inspect = parseInt(qtyInspectEl?.value, 10) || 0;
    let fail = parseInt(qtyFailEl?.value, 10) || 0;

    // Error proofing: Clamp inspect to maxAllowed (Qty Balance if in-progress, Qty Received if pending)
    if (selectedPO) {
        const maxAllowed = getMaxAllowedInspect(selectedPO);
        const isProgress = (selectedPO.checked_qty > 0 || selectedPO.status === 'in-progress' || selectedPO.status === 'in progress');
        const labelType = isProgress ? 'Qty Balance' : 'Qty Received / Planned Qty';

        if (inspect > maxAllowed) {
            inspect = maxAllowed;
            if (qtyInspectEl) qtyInspectEl.value = maxAllowed;
            showToast(`Qty Inspect tidak boleh melebihi ${labelType} (${maxAllowed.toLocaleString('id-ID')} ${selectedPO.uom}).`, 'error');
        }
    }

    // Error proofing: Clamp fail to inspect
    if (fail > inspect) {
        fail = inspect;
        if (qtyFailEl) qtyFailEl.value = inspect;
        if (inspect > 0) {
            showToast(`Qty Fail tidak boleh melebihi Qty Inspect (${inspect}).`, 'error');
        }
    }

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

// ─── VALIDATION & SUBMIT ──────────────────────────────────────

window.openValidationDialog = function () {
    const inspect = parseInt(document.getElementById('qty-inspect')?.value, 10) || 0;
    const fail = parseInt(document.getElementById('qty-fail')?.value, 10) || 0;
    const notes = document.getElementById('defect-notes')?.value.trim() || '';
    const leaderSelect = document.getElementById('approved-by-leader');
    const fileInput = document.getElementById('evidence-file');

    const errors = [];
    if (!selectedPO) {
        errors.push('Silakan pilih PO/Material terlebih dahulu.');
    } else if (currentInspectionType === 'raw') {
        const maxAllowed = getMaxAllowedInspect(selectedPO);
        const isProgress = (selectedPO.checked_qty > 0 || selectedPO.status === 'in-progress' || selectedPO.status === 'in progress');
        const labelType = isProgress ? 'Qty Balance' : 'Qty Received / Planned Qty';

        if (inspect <= 0) {
            errors.push('Qty Inspect harus lebih dari 0.');
        } else if (inspect > maxAllowed) {
            errors.push(`Qty Inspect (${inspect}) tidak boleh melebihi ${labelType} (${maxAllowed.toLocaleString('id-ID')} ${selectedPO.uom}).`);
        }
        if (fail < 0) errors.push('Qty Fail tidak boleh negatif.');
        if (fail > inspect) errors.push(`Qty Fail (${fail}) tidak boleh melebihi Qty Inspect (${inspect}).`);
    } else if (currentInspectionType === 'laminating') {
        if (lamPackagingChoice === 'NO') {
            const reason = document.getElementById('lam-packaging-reason')?.value.trim();
            if (!reason) {
                errors.push('Harap isi Alasan Packaging NO / Reject.');
            }
        }
        const rollChk = document.getElementById('lam-roll-checkbox')?.checked;
        if (rollChk) {
            const pct = document.getElementById('lam-roll-percentage')?.value.trim();
            if (!pct) {
                errors.push('Harap isi Custom Percentage Roll (%).');
            }
        }
    } else if (currentInspectionType === 'bonding') {
        const bondingFileEl = document.getElementById('bonding-file');
        if (!bondingFileEl || !bondingFileEl.files || bondingFileEl.files.length === 0) {
            errors.push('Harap upload file evidence / dokumen Bonding Test.');
        }
    }

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
        const isRaw = currentInspectionType === 'raw';
        const isBonding = currentInspectionType === 'bonding';
        let inspectTypeLabel = 'Check Raw Material';
        if (currentInspectionType === 'laminating') inspectTypeLabel = 'Check Laminating Material';
        if (isBonding) inspectTypeLabel = 'Check Bonding Test';

        const leaderVal = leaderSelect && leaderSelect.value ? leaderSelect.value : 'Tidak Ada';
        const evidenceFileText = fileInput && fileInput.files.length > 0 ? fileInput.files[0].name : '—';
        const statusChecking = document.getElementById('checking-status')?.value === 'in-progress' ? 'In-Progress (Belum Selesai)' : 'Done (Selesai)';

        let summaryHtml = `
            ${summaryRow('Target PO Number', selectedPO.po_number, true)}
            ${summaryRow('Material Name', selectedPO.material_name)}
            ${summaryRow('Vendor', selectedPO.vendor_name)}
            ${summaryRow('Jenis Inspeksi', inspectTypeLabel)}
        `;

        if (isRaw) {
            const pass = inspect - fail;
            const passRate = ((pass / inspect) * 100).toFixed(1);
            const rolling = document.getElementById('rolling-inspection')?.checked ? 'Yes' : 'No';
            const checkColor = document.getElementById('check-color')?.value.trim() || 'OK';
            summaryHtml += `
                ${summaryRow('Qty Inspect', inspect.toLocaleString('id-ID'))}
                ${summaryRow('Qty Fail', fail.toLocaleString('id-ID'))}
                ${summaryRow('Qty Pass', `${pass.toLocaleString('id-ID')} (${passRate}%)`)}
                ${summaryRow('Check Color', checkColor)}
                ${summaryRow('Rolling Method', rolling)}
            `;
        } else if (isBonding) {
            const bondingFileEl = document.getElementById('bonding-file');
            const fileName = bondingFileEl && bondingFileEl.files.length > 0 ? bondingFileEl.files[0].name : '—';
            const bNotes = document.getElementById('bonding-notes')?.value.trim() || '—';
            summaryHtml += `
                ${summaryRow('File Bonding Test', fileName)}
                ${summaryRow('Catatan Bonding', bNotes)}
            `;
        } else {
            const colorRes = document.getElementById('lam-color-result')?.value.trim() || 'OK';
            const pkgReason = lamPackagingChoice === 'NO' ? (document.getElementById('lam-packaging-reason')?.value.trim() || '—') : 'OK';
            const rollChk = document.getElementById('lam-roll-checkbox')?.checked ? 'Yes' : 'No';
            const rollPct = rollChk === 'Yes' ? (document.getElementById('lam-roll-percentage')?.value.trim() || '—') : 'N/A';
            summaryHtml += `
                ${summaryRow('Color Check', `${lamColorChoice} (${colorRes})`)}
                ${summaryRow('Packaging Check', `${lamPackagingChoice} ${lamPackagingChoice === 'NO' ? `[Alasan: ${pkgReason}]` : ''}`)}
                ${summaryRow('Roll Inspection', `${rollChk} ${rollChk === 'Yes' ? `(${rollPct})` : ''}`)}
            `;
        }

        if (!isBonding) {
            summaryHtml += `
                ${summaryRow('Leader Approval', leaderVal)}
                ${leaderSelect && leaderSelect.value ? summaryRow('Evidence File', evidenceFileText) : ''}
                ${summaryRow('Status Checking', statusChecking)}
                ${notes ? summaryRow('Catatan', notes) : ''}
            `;
        }

        summaryEl.innerHTML = summaryHtml;
    }

    overlay.style.display = 'flex';
};

function summaryRow(label, value, isHighlight = false) {
    if (isHighlight) {
        return `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(16, 185, 129, 0.12); border:1.5px solid rgba(16, 185, 129, 0.3); padding:10px 14px; border-radius:12px; margin-bottom:4px;">
            <span style="color:#34d399; font-weight:700; font-size:12px; display:flex; align-items:center; gap:6px;">
                <span class="material-symbols-outlined" style="font-size:16px;">receipt_long</span>${label}
            </span>
            <span style="color:white; font-weight:800; font-size:14px; letter-spacing:0.02em;">${esc(String(value))}</span>
        </div>`;
    }
    return `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:2px 0;">
        <span style="color:rgba(255,255,255,0.5); font-weight:600; font-size:12px; white-space:nowrap;">${label}</span>
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

    const isBonding = currentInspectionType === 'bonding';
    const isRaw = currentInspectionType === 'raw';
    const isLam = currentInspectionType === 'laminating';

    let inspectTypeStr = 'Raw Material';
    if (isLam) inspectTypeStr = 'Laminating Material';
    if (isBonding) inspectTypeStr = 'Bonding Test';

    const inspect = isRaw ? (parseInt(document.getElementById('qty-inspect')?.value, 10) || 0) : 0;
    const fail = isRaw ? (parseInt(document.getElementById('qty-fail')?.value, 10) || 0) : 0;
    const notes = document.getElementById('defect-notes')?.value.trim() || '';
    const bondingNotes = isBonding ? (document.getElementById('bonding-notes')?.value.trim() || '') : '';
    const rollingChecked = document.getElementById('rolling-inspection')?.checked ? 'Yes' : 'No';
    const inspectorName = currentUser?.name || currentUser?.nik || '';
    const checkColor = document.getElementById('check-color')?.value.trim() || 'OK';
    const leaderSelect = document.getElementById('approved-by-leader');
    const fileInput = document.getElementById('evidence-file');
    const bondingFileEl = document.getElementById('bonding-file');

    const lamColorRes = document.getElementById('lam-color-result')?.value.trim() || 'Color OK';
    const lamPkgReason = lamPackagingChoice === 'NO' ? (document.getElementById('lam-packaging-reason')?.value.trim() || '') : '';
    const lamRollChk = document.getElementById('lam-roll-checkbox')?.checked ? 'Yes' : 'No';
    const lamRollPct = lamRollChk === 'Yes' ? (document.getElementById('lam-roll-percentage')?.value.trim() || '') : '';

    let fileData = null;
    let fileName = '';
    let fileType = '';

    if (isBonding && bondingFileEl && bondingFileEl.files.length > 0) {
        if (loadingTxt) loadingTxt.textContent = 'Membaca file bonding test...';
        const file = bondingFileEl.files[0];
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
            showToast('Gagal membaca file bonding test.', 'error');
            return;
        }
    } else if (leaderSelect && leaderSelect.value && fileInput && fileInput.files.length > 0) {
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

    const checkingStatus = isBonding ? 'done' : (document.getElementById('checking-status')?.value || 'done');

    const payload = await gasAuthedPayload({
        action: 'submitInspection',
        po_number: selectedPO.po_number,
        inspector_nik: inspectorName,
        inspector_name: inspectorName,
        inspection_type: inspectTypeStr,
        qty_inspect: inspect,
        qty_fail: fail,
        defect_notes: isBonding ? bondingNotes : notes,
        result_status: isBonding ? 'Pass' : (isRaw ? (fail === 0 ? 'Pass' : 'Fail') : (lamColorChoice === 'YES' && lamPackagingChoice === 'YES' ? 'Pass' : 'Fail')),
        input_type: 'manual',
        rolling_inspection: isRaw ? rollingChecked : (isBonding ? 'No' : lamRollChk),
        check_color: isRaw ? checkColor : (isBonding ? 'N/A' : lamColorRes),
        color_check_status: isRaw ? 'N/A' : (isBonding ? 'N/A' : lamColorChoice),
        color_check_result: isRaw ? checkColor : (isBonding ? 'N/A' : lamColorRes),
        packaging_status: isRaw ? 'N/A' : (isBonding ? 'N/A' : lamPackagingChoice),
        packaging_reject_reason: isBonding ? '' : lamPkgReason,
        roll_inspection_flag: isRaw ? rollingChecked : (isBonding ? 'No' : lamRollChk),
        roll_inspection_percentage: isRaw ? '' : (isBonding ? '' : lamRollPct),
        approved_by_leader: isBonding ? '' : (leaderSelect ? leaderSelect.value : ''),
        file_data: fileData,
        file_name: fileName,
        file_type: fileType,
        inspection_date: new Date().toISOString(),
        status: checkingStatus,
    });

    try {
        if (MATERIAL_TEST_MODE) {
            console.log('[TEST MODE] Payload:', JSON.stringify(payload, null, 2));
            await delay(1000);
            // Update PO status and checked qty in local mock
            const idx = allPOData.findIndex(p => p.po_number === selectedPO.po_number);
            if (idx !== -1) {
                allPOData[idx].status = checkingStatus;
                if (checkingStatus === 'in-progress') {
                    allPOData[idx].checked_qty = (allPOData[idx].checked_qty || 0) + inspect;
                    allPOData[idx].in_progress_qty = allPOData[idx].checked_qty;
                    allPOData[idx].balance_qty = Math.max(0, allPOData[idx].planned_qty - allPOData[idx].checked_qty);
                } else {
                    allPOData[idx].checked_qty = 0;
                    allPOData[idx].in_progress_qty = 0;
                    allPOData[idx].balance_qty = allPOData[idx].planned_qty;
                }
            }

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

window.resetForm = function (userTriggered = false) {
    selectedPO = null;
    document.querySelectorAll('.po-card').forEach(c => c.classList.remove('selected'));

    const typeSection = document.getElementById('inspection-type-section');
    if (typeSection) { typeSection.style.opacity = '0.4'; typeSection.style.pointerEvents = 'none'; }
    switchInspectionTab('raw');
    setLamColorChoice('YES');
    setLamPackagingChoice('YES');

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

    const lamRollChk = document.getElementById('lam-roll-checkbox');
    if (lamRollChk) { lamRollChk.checked = false; toggleLamRollPercentage(); }

    const lamPkgReason = document.getElementById('lam-packaging-reason');
    if (lamPkgReason) lamPkgReason.value = '';
    const lamRollPct = document.getElementById('lam-roll-percentage');
    if (lamRollPct) lamRollPct.value = '';
    const lamColorRes = document.getElementById('lam-color-result');
    if (lamColorRes) lamColorRes.value = 'Color OK';

    const bondingFileEl = document.getElementById('bonding-file');
    if (bondingFileEl) bondingFileEl.value = '';
    const bondingNotesEl = document.getElementById('bonding-notes');
    if (bondingNotesEl) bondingNotesEl.value = '';

    const bondingTargetPoNo = document.getElementById('bonding-target-po-no');
    const bondingTargetMatName = document.getElementById('bonding-target-mat-name');
    if (bondingTargetPoNo) bondingTargetPoNo.textContent = '—';
    if (bondingTargetMatName) bondingTargetMatName.textContent = '—';

    const notesEl = document.getElementById('defect-notes');
    if (notesEl) notesEl.value = '';

    const leaderSelect = document.getElementById('approved-by-leader');
    if (leaderSelect) leaderSelect.value = '';
    const fileInput = document.getElementById('evidence-file');
    if (fileInput) fileInput.value = '';
    const container = document.getElementById('evidence-upload-container');
    if (container) container.style.display = 'none';

    const calcPass = document.getElementById('calc-pass-rate');
    if (calcPass) calcPass.textContent = '—';
    const calcFail = document.getElementById('calc-fail-rate');
    if (calcFail) calcFail.textContent = '—';

    if (userTriggered) {
        showToast('Form inspeksi dan pilihan PO berhasil di-reset.', 'info');
    }
};

function resetForm() {
    window.resetForm(false);
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
