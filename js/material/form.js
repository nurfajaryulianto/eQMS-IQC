// ============================================================
// js/material/form.js — IQC Material: Form Inspeksi Logic
// ============================================================

import { requireMaterialRole, materialLogout, MATERIAL_TEST_MODE, MATERIAL_ROLES } from './auth.js';
import { apiGetMasterData, apiGetUsers, apiSubmitInspection, apiReleaseMaterialToProduction } from './api.js';

// ─── STATE ───────────────────────────────────────────────────
let allPOData = [];       // semua master_data dari GAS
let filteredPO = [];      // setelah filter/search
let selectedPO = null;    // PO yang sedang dipilih user
let currentUser = null;   // user yang sedang login

let currentInspectionType = 'raw'; // 'raw' | 'rolling' | 'laminating' | 'bonding'
let lamColorChoice = 'YES'; // 'YES' | 'NO'
let lamPackagingChoice = 'YES'; // 'YES' | 'NO'
let pendingIsStepDone = false; // flag apakah submit tombol Selesai Inspect (true) atau Simpan Progress (false)

// ─── STEP CHECKERS & STATUS HELPERS ─────────────────────────
export function countCompletedSteps(po) {
    if (!po) return 0;
    return (po.raw_done ? 1 : 0) +
           (po.rolling_done ? 1 : 0) +
           (po.laminating_done ? 1 : 0) +
           (po.bonding_done ? 1 : 0);
}

export function isPOFullyDone(po) {
    if (!po) return false;
    const steps = countCompletedSteps(po);
    const isReleasedByAdmin = Boolean(po.released_by && (
        po.released_by.toLowerCase().includes('admin') ||
        po.released_by.toLowerCase().includes('supervisor') ||
        po.released_by.toLowerCase().includes('spv') ||
        po.released_by.toLowerCase().includes('manager')
    ));
    // Ready to Deliver HANYA jika:
    // 1. Sudah berstatus done di database DAN minimal 3 langkah terpenuhi, ATAU
    // 2. Seluruh 4 langkah terpenuhi, ATAU
    // 3. Sudah di-release resmi oleh Admin/Supervisor (Admin Override).
    return (po.status === 'done' && (steps >= 3 || isReleasedByAdmin)) || (steps >= 4);
}

export function isPOInProgress(po) {
    if (!po || isPOFullyDone(po)) return false;
    const steps = countCompletedSteps(po);
    return steps > 0 ||
           po.status === 'in-progress' ||
           po.status === 'in progress' ||
           (po.checked_qty > 0) ||
           po.status === 'done';
}

// ─── GLOBAL SWITCHERS & TOGGLES FOR UI ───────────────────────

window.updateTabBadges = function (po) {
    const badgeRaw = document.getElementById('badge-tab-raw');
    const badgeRolling = document.getElementById('badge-tab-rolling');
    const badgeLam = document.getElementById('badge-tab-laminating');
    const badgeBond = document.getElementById('badge-tab-bonding');
    const tabRaw = document.getElementById('tab-check-raw');
    const tabRolling = document.getElementById('tab-check-rolling');
    const tabLam = document.getElementById('tab-check-laminating');
    const tabBond = document.getElementById('tab-check-bonding');

    if (!po) {
        [badgeRaw, badgeRolling, badgeLam, badgeBond].forEach(b => {
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

    if (badgeRolling) {
        if (po.rolling_done) {
            badgeRolling.textContent = '✓ Selesai';
            badgeRolling.style.background = 'rgba(6, 182, 212, 0.25)';
            badgeRolling.style.color = '#22d3ee';
            badgeRolling.style.border = '1px solid rgba(6, 182, 212, 0.4)';
            if (tabRolling) tabRolling.style.borderColor = 'rgba(6, 182, 212, 0.3)';
        } else {
            badgeRolling.textContent = 'Pending';
            badgeRolling.style.background = 'rgba(255,255,255,0.08)';
            badgeRolling.style.color = 'rgba(255,255,255,0.6)';
            badgeRolling.style.border = 'none';
        }
    }

    if (badgeLam) {
        if (po.laminating_done) {
            badgeLam.textContent = '✓ Selesai';
            badgeLam.style.background = 'rgba(245, 158, 11, 0.25)';
            badgeLam.style.color = '#fbbf24';
            badgeLam.style.border = '1px solid rgba(245, 158, 11, 0.4)';
            if (tabLam) tabLam.style.borderColor = 'rgba(245, 158, 11, 0.3)';
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
            badgeBond.style.background = 'rgba(244, 63, 94, 0.25)';
            badgeBond.style.color = '#fb7185';
            badgeBond.style.border = '1px solid rgba(244, 63, 94, 0.4)';
            if (tabBond) tabBond.style.borderColor = 'rgba(244, 63, 94, 0.3)';
        } else {
            badgeBond.textContent = 'Pending';
            badgeBond.style.background = 'rgba(255,255,255,0.08)';
            badgeBond.style.color = 'rgba(255,255,255,0.6)';
            badgeBond.style.border = 'none';
        }
    }
};

// ─── Helper: cari inspeksi in-progress untuk tab type saat ini ───
function getInProgressInspection(type) {
    if (!selectedPO || !Array.isArray(selectedPO.material_inspections)) return null;
    const typeMap = { raw: 'raw material', rolling: 'rolling', laminating: 'laminating', bonding: 'bonding' };
    const keyword = typeMap[type] || type;
    return selectedPO.material_inspections.find(insp => {
        const itype = String(insp.inspection_type || '').toLowerCase();
        const status = String(insp.status || '').toLowerCase();
        return itype.includes(keyword) && status === 'in-progress';
    }) || null;
}

// ─── Helper: pre-fill form dari data inspeksi sebelumnya ─────────
function prefillFormFromInspection(insp, type) {
    if (!insp) return;
    if (type === 'raw') {
        const qtyInspEl = document.getElementById('qty-inspect');
        const qtyFailEl = document.getElementById('qty-fail');
        const colorEl = document.getElementById('check-color');
        const notesEl = document.getElementById('defect-notes');
        const ok = Number(insp.ok) || 0;
        const noQ = Number(insp.no_qty) || 0;
        if (qtyInspEl) qtyInspEl.value = ok + noQ;
        if (qtyFailEl) qtyFailEl.value = noQ;
        if (colorEl && insp.color_check_result) colorEl.value = insp.color_check_result;
        if (notesEl && insp.defect_notes) notesEl.value = insp.defect_notes;
        // Trigger qty change event to recalculate pass/fail rate
        if (qtyInspEl) qtyInspEl.dispatchEvent(new Event('input'));
        if (qtyFailEl) qtyFailEl.dispatchEvent(new Event('input'));
    } else if (type === 'rolling') {
        const statusEl = document.getElementById('rolling-inspect-status');
        const pctEl = document.getElementById('rolling-inspect-percentage');
        const notesEl = document.getElementById('rolling-inspect-notes');
        if (statusEl && insp.roll_inspection_flag) statusEl.value = insp.roll_inspection_flag;
        if (pctEl && insp.roll_inspection_percentage) pctEl.value = insp.roll_inspection_percentage;
        if (notesEl && insp.defect_notes) notesEl.value = insp.defect_notes;
    } else if (type === 'laminating') {
        const colorResEl = document.getElementById('lam-color-result');
        const pkgReasonEl = document.getElementById('lam-packaging-reason');
        const rollChkEl = document.getElementById('lam-roll-checkbox');
        const rollPctEl = document.getElementById('lam-roll-percentage');
        if (insp.color_check_status) window.setLamColorChoice(insp.color_check_status);
        if (colorResEl && insp.color_check_result) colorResEl.value = insp.color_check_result;
        if (insp.packaging_status) window.setLamPackagingChoice(insp.packaging_status);
        if (pkgReasonEl && insp.packaging_reject_reason) pkgReasonEl.value = insp.packaging_reject_reason;
        if (rollChkEl) {
            const hasRoll = insp.roll_inspection_flag === 'Yes' || insp.roll_inspection_percentage;
            rollChkEl.checked = Boolean(hasRoll);
            rollChkEl.dispatchEvent(new Event('change'));
        }
        if (rollPctEl && insp.roll_inspection_percentage) rollPctEl.value = insp.roll_inspection_percentage;
    }
    // Leader prefill
    const leaderEl = document.getElementById('approved-by-leader');
    if (leaderEl && insp.approved_by_leader) leaderEl.value = insp.approved_by_leader;
}

window.switchInspectionTab = function (type) {
    currentInspectionType = type;
    const tabRaw = document.getElementById('tab-check-raw');
    const tabRolling = document.getElementById('tab-check-rolling');
    const tabLam = document.getElementById('tab-check-laminating');
    const tabBond = document.getElementById('tab-check-bonding');
    const bodyRaw = document.getElementById('form-raw-material-body');
    const bodyRolling = document.getElementById('form-rolling-inspection-body');
    const bodyLam = document.getElementById('form-laminating-material-body');
    const bodyBond = document.getElementById('form-bonding-test-body');
    const commonFields = document.getElementById('common-fields-body');
    const sectionTitle = document.getElementById('form-section-title');
    const doneNotice = document.getElementById('done-po-notice');
    const isRawDone = selectedPO && selectedPO.raw_done;
    const isRollingDone = selectedPO && selectedPO.rolling_done;
    const isLamDone = selectedPO && selectedPO.laminating_done;
    const isBondDone = selectedPO && selectedPO.bonding_done;

    const isStageDone = (type === 'raw' && isRawDone) ||
                        (type === 'rolling' && isRollingDone) ||
                        (type === 'laminating' && isLamDone) ||
                        (type === 'bonding' && isBondDone);
    const isPOAlreadyDone = selectedPO && isPOFullyDone(selectedPO);

    // Deteksi in-progress inspection untuk tab ini
    const inProgressInsp = !isStageDone ? getInProgressInspection(type) : null;

    [tabRaw, tabRolling, tabLam, tabBond].forEach(t => t && t.classList.remove('active'));
    if (bodyRaw) bodyRaw.style.display = 'none';
    if (bodyRolling) bodyRolling.style.display = 'none';
    if (bodyLam) bodyLam.style.display = 'none';
    if (bodyBond) bodyBond.style.display = 'none';

    const labelMap = {
        raw: 'Raw Material',
        rolling: 'Rolling Inspection (Raw)',
        laminating: 'Laminating Material',
        bonding: 'Bonding Test',
    };
    const bodyMap = { raw: bodyRaw, rolling: bodyRolling, laminating: bodyLam, bonding: bodyBond };
    const titleMap = {
        raw: 'Input Hasil Inspeksi - Raw Material',
        rolling: 'Input Hasil Inspeksi - Rolling Inspection (Raw)',
        laminating: 'Input Hasil Inspeksi - Laminating Material',
        bonding: 'Upload Hasil - Bonding Test',
    };

    const activeTab = { raw: tabRaw, rolling: tabRolling, laminating: tabLam, bonding: tabBond }[type];
    const activeBody = bodyMap[type];
    if (activeTab) activeTab.classList.add('active');
    if (activeBody) activeBody.style.display = 'flex';
    if (commonFields) commonFields.style.display = (type === 'bonding') ? 'none' : 'flex';
    if (sectionTitle) sectionTitle.textContent = titleMap[type] || '';

    if (isStageDone) {
        // ── DONE: Tab terkunci permanen ──
        if (doneNotice) {
            doneNotice.style.display = 'flex';
            doneNotice.style.background = 'rgba(245, 158, 11, 0.10)';
            doneNotice.style.borderColor = 'rgba(245, 158, 11, 0.35)';
            doneNotice.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0;color:#fbbf24;">lock</span><span>Pengecekan <strong>${labelMap[type]}</strong> untuk PO ini telah <strong>Selesai (Done)</strong>. Pilih tab lainnya atau klik Rilis ke Produksi jika inspeksi sudah cukup.</span>`;
        }
        if (activeBody) { activeBody.style.opacity = '0.35'; activeBody.style.pointerEvents = 'none'; }
        if (commonFields && type !== 'bonding') { commonFields.style.opacity = '0.35'; commonFields.style.pointerEvents = 'none'; }
    } else if (inProgressInsp) {
        // ── IN-PROGRESS: Tampilkan notice + tombol Edit ──
        const ok = Number(inProgressInsp.ok) || 0;
        const noQ = Number(inProgressInsp.no_qty) || 0;
        const totalInsp = ok + noQ;
        const passRate = totalInsp > 0 ? ((ok / totalInsp) * 100).toFixed(1) : '—';
        const inspDate = inProgressInsp.inspection_date
            ? new Date(inProgressInsp.inspection_date).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '—';

        let summaryExtra = '';
        if (type === 'raw') {
            summaryExtra = `
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
                    <span style="font-size:12px;color:#94a3b8;">Qty Inspect: <strong style="color:#e2e8f0;">${totalInsp}</strong></span>
                    <span style="font-size:12px;color:#94a3b8;">Qty Fail: <strong style="color:#fca5a5;">${noQ}</strong></span>
                    <span style="font-size:12px;color:#94a3b8;">Pass Rate: <strong style="color:#6ee7b7;">${passRate}%</strong></span>
                </div>`;
        } else if (type === 'rolling') {
            summaryExtra = `
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
                    <span style="font-size:12px;color:#94a3b8;">Status: <strong style="color:#e2e8f0;">${inProgressInsp.roll_inspection_flag || '—'}</strong></span>
                    <span style="font-size:12px;color:#94a3b8;">Sample: <strong style="color:#e2e8f0;">${inProgressInsp.roll_inspection_percentage || '—'}</strong></span>
                </div>`;
        } else if (type === 'laminating') {
            summaryExtra = `
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
                    <span style="font-size:12px;color:#94a3b8;">Color: <strong style="color:#e2e8f0;">${inProgressInsp.color_check_status || '—'}</strong></span>
                    <span style="font-size:12px;color:#94a3b8;">Packaging: <strong style="color:#e2e8f0;">${inProgressInsp.packaging_status || '—'}</strong></span>
                </div>`;
        }

        if (doneNotice) {
            doneNotice.style.display = 'flex';
            doneNotice.style.flexDirection = 'column';
            doneNotice.style.alignItems = 'flex-start';
            doneNotice.style.gap = '10px';
            doneNotice.style.background = 'rgba(59, 130, 246, 0.10)';
            doneNotice.style.borderColor = 'rgba(59, 130, 246, 0.35)';
            doneNotice.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;width:100%;">
                    <span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0;color:#60a5fa;">edit_note</span>
                    <div style="flex:1;">
                        <div style="font-size:13px;font-weight:700;color:#93c5fd;">Inspeksi <strong>${labelMap[type]}</strong> tersimpan sebagai <strong>In-Progress</strong></div>
                        <div style="font-size:11px;color:#64748b;margin-top:2px;">Disimpan: ${inspDate} · oleh ${inProgressInsp.inspector_nik || '—'}</div>
                        ${summaryExtra}
                    </div>
                    <button type="button" id="btn-edit-inprogress"
                        style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(59,130,246,0.4);flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:16px;">edit</span> Edit
                    </button>
                </div>`;

            // Bind tombol Edit
            const editBtn = document.getElementById('btn-edit-inprogress');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    // Unlock form
                    if (activeBody) { activeBody.style.opacity = '1'; activeBody.style.pointerEvents = 'auto'; }
                    if (commonFields && type !== 'bonding') { commonFields.style.opacity = '1'; commonFields.style.pointerEvents = 'auto'; }
                    // Sembunyikan notice
                    if (doneNotice) doneNotice.style.display = 'none';
                    // Pre-fill data dari inspeksi sebelumnya
                    prefillFormFromInspection(inProgressInsp, type);
                    // Aktifkan tombol aksi
                    const btnSP = document.getElementById('btn-save-progress');
                    const btnFI = document.getElementById('btn-finish-inspect');
                    if (btnSP) { btnSP.disabled = false; btnSP.style.opacity = '1'; btnSP.style.pointerEvents = 'auto'; }
                    if (btnFI) { btnFI.disabled = false; btnFI.style.opacity = '1'; btnFI.style.pointerEvents = 'auto'; }
                });
            }
        }
        // Form terkunci sampai user klik Edit
        if (activeBody) { activeBody.style.opacity = '0.25'; activeBody.style.pointerEvents = 'none'; }
        if (commonFields && type !== 'bonding') { commonFields.style.opacity = '0.25'; commonFields.style.pointerEvents = 'none'; }
    } else {
        // ── CLEAN / BELUM ADA DATA: Form terbuka normal ──
        if (doneNotice) {
            doneNotice.style.display = 'none';
            doneNotice.style.flexDirection = '';
            doneNotice.style.alignItems = '';
            doneNotice.style.background = '';
            doneNotice.style.borderColor = '';
        }
        if (activeBody) { activeBody.style.opacity = '1'; activeBody.style.pointerEvents = 'auto'; }
        if (commonFields && type !== 'bonding') { commonFields.style.opacity = '1'; commonFields.style.pointerEvents = 'auto'; }
    }

    // ── Update Action Buttons ──
    const btnSaveProgress = document.getElementById('btn-save-progress');
    const btnFinishInspect = document.getElementById('btn-finish-inspect');
    const legacySubmit = document.getElementById('submit-btn');

    const lockButtons = isStageDone || isPOAlreadyDone || Boolean(inProgressInsp);

    if (btnSaveProgress) {
        btnSaveProgress.disabled = lockButtons;
        btnSaveProgress.style.opacity = lockButtons ? '0.4' : '1';
        btnSaveProgress.style.pointerEvents = lockButtons ? 'none' : 'auto';
        btnSaveProgress.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">bookmark_added</span> Simpan Progress';
    }

    if (btnFinishInspect) {
        if (isStageDone || isPOAlreadyDone) {
            btnFinishInspect.disabled = true;
            btnFinishInspect.style.opacity = '0.4';
            btnFinishInspect.style.pointerEvents = 'none';
            btnFinishInspect.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">check_circle</span> Tahap Selesai';
        } else {
            btnFinishInspect.disabled = Boolean(inProgressInsp); // terkunci sampai Edit diklik
            btnFinishInspect.style.opacity = inProgressInsp ? '0.4' : '1';
            btnFinishInspect.style.pointerEvents = inProgressInsp ? 'none' : 'auto';
            btnFinishInspect.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">task_alt</span> Selesai Inspect';
        }
    }

    if (legacySubmit) {
        legacySubmit.disabled = isStageDone && isPOAlreadyDone;
        legacySubmit.style.opacity = legacySubmit.disabled ? '0.4' : '1';
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
            const result = await apiGetUsers();
            users = (result.data || []).map(u => ({
                ...u,
                name: u.display_name || u.nik || u.name || u.email || '',
            }));
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

    // OPTIMASI: Jalankan fetchMasterData & populateLeaders secara PARALEL
    // (sebelumnya sequential → total waktu = waktu1 + waktu2)
    await Promise.all([
        fetchMasterData(),
        populateLeaders()
    ]);

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
        const result = await apiGetMasterData({ status: 'all' });

        allPOData = (result.data || []).map(row => ({
            id:             row.id,
            po_number:      row.po_number || '',
            material_name:  row.material_name || '',
            item_description: row.item_description || '',
            uom:            row.uom || '',
            vendor_name:    row.vendor_name || '',
            style:          row.style || '',
            model_shoe:     row.model_shoe || '',
            planned_qty:    Number(row.planned_qty) || 0,
            checked_qty:    Number(row.checked_qty) || 0,
            balance_qty:    Math.max(0, (Number(row.planned_qty) || 0) - (Number(row.checked_qty) || 0)),
            receive_date:   row.receive_date || '',
            status:         (row.status || 'pending').toLowerCase(),
            raw_done:       Boolean(row.raw_done),
            rolling_done:   Boolean(row.rolling_done),
            laminating_done: Boolean(row.laminating_done),
            bonding_done:   Boolean(row.bonding_done),
            material_type:  row.material_type || '',
            released_by:    row.released_by || '',
            released_at:    row.released_at || '',
            release_notes:  row.release_notes || '',
        }));

        setSyncStatus(`${allPOData.length} item tersedia`, 'ok');
        filterPOList();

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
        const getRank = (po) => {
            if (isPOFullyDone(po)) return 2;
            if (isPOInProgress(po)) return 1;
            return 0;
        };
        return getRank(a) - getRank(b);
    });

    sorted.forEach(po => {
        const card = document.createElement('div');
        card.className = 'po-card';
        card.dataset.poNumber = po.po_number;
        if (po.id) card.dataset.id = po.id;

        const isDone = isPOFullyDone(po);
        const isPartial = isPOInProgress(po);
        const badgeClass = isDone ? 'badge-done' : (isPartial ? 'badge-progress' : 'badge-pending');
        const badgeText = isDone ? 'Ready to Deliver' : (isPartial ? 'In-Progress' : 'Pending');

        const tagBadge = (done, label) => {
            if (done) {
                return `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-weight:700; display:inline-flex; align-items:center; gap:2px;">✓ ${label}</span>`;
            } else if (isDone) {
                return `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.03); color:rgba(255,255,255,0.3); border:1px dashed rgba(255,255,255,0.1); font-weight:600; display:inline-flex; align-items:center; gap:2px;">— ${label} (N/A)</span>`;
            } else {
                return `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.4); font-weight:600; display:inline-flex; align-items:center; gap:2px;">⏳ ${label}</span>`;
            }
        };

        card.innerHTML = `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:8px;">
                <div>
                    <div style="font-size:13px; font-weight:700; color:#ffffff; margin-bottom:2px;">${esc(po.po_number)}</div>
                    <div style="font-size:12px; color:rgba(255, 255, 255, 0.7); font-weight:500;">${esc(po.vendor_name)}</div>
                </div>
                <span style="font-size:11px; font-weight:700; padding:3px 9px; border-radius:99px; white-space:nowrap; flex-shrink:0;" class="${badgeClass}">${badgeText}</span>
            </div>
            <div style="font-size:13px; color:#34d399; font-weight:700; margin-bottom:4px; line-height:1.3;">${esc(po.material_name)}</div>
            <div style="font-size:11px; color:rgba(255, 255, 255, 0.5); margin-bottom:8px;">${esc(po.item_description)}</div>
            <div style="display:flex; gap:12px; font-size:11px; color:rgba(255, 255, 255, 0.7); margin-bottom:8px;">
                <span><span style="color:rgba(255, 255, 255, 0.5);">QTY </span>${po.planned_qty.toLocaleString('id-ID')} ${esc(po.uom)}</span>
                <span><span style="color:rgba(255, 255, 255, 0.5);">STYLE </span>${esc(po.style)}</span>
            </div>
            <div style="display:flex; gap:5px; flex-wrap:wrap; padding-top:6px; border-top:1px solid rgba(255,255,255,0.06);">
                ${tagBadge(po.raw_done, 'Raw')}
                ${tagBadge(po.rolling_done, 'Rolling')}
                ${tagBadge(po.laminating_done, 'Laminating')}
                ${tagBadge(po.bonding_done, 'Bonding')}
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
    if (!cardEl || !cardEl.classList || !cardEl.isConnected) {
        cardEl = (po.id ? document.querySelector(`.po-card[data-id="${po.id}"]`) : null) || 
                 document.querySelector(`.po-card[data-po-number="${po.po_number}"]`);
    }
    if (cardEl) cardEl.classList.add('selected');

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
        const isDone = isPOFullyDone(po);

        let releaseBannerHtml = '';
        if (isDone) {
            const relBy = po.released_by || 'Inspector';
            const relAt = po.released_at ? formatReceiveDate(po.released_at) : '—';
            releaseBannerHtml = `
                <div style="margin-top:14px; padding:12px 14px; border-radius:12px; background:rgba(16, 185, 129, 0.12); border:1.5px solid rgba(16, 185, 129, 0.35); display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="material-symbols-outlined" style="color:#34d399; font-size:24px;">verified</span>
                        <div>
                            <div style="color:#34d399; font-weight:800; font-size:13px;">READY TO DELIVER (DONE)</div>
                            <div style="color:rgba(255,255,255,0.6); font-size:11px;">Rilis oleh: <strong style="color:white;">${esc(relBy)}</strong> &bull; ${esc(relAt)}</div>
                        </div>
                    </div>
                    <span style="font-size:11px; font-weight:700; color:#34d399; background:rgba(16,185,129,0.2); padding:4px 8px; border-radius:6px;">Siap Kirim ke Produksi</span>
                </div>
            `;
        } else {
            const stepsDone = countCompletedSteps(po);
            const isAdminOrSpv = currentUser?.role === 'admin' || currentUser?.role === 'supervisor' || currentUser?.role === 'manager';
            
            let actionBtnHtml = '';
            if (isAdminOrSpv) {
                actionBtnHtml = `
                    <button type="button" onclick="quickReleaseCurrentPO()" style="padding:7px 14px; border-radius:8px; border:none; background:linear-gradient(135deg, #10b981, #059669); color:white; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(16,185,129,0.25); transition:all 0.2s;">
                        <span class="material-symbols-outlined" style="font-size:16px;">admin_panel_settings</span>
                        Rilis Khusus (Admin)
                    </button>
                `;
            } else if (stepsDone >= 3) {
                actionBtnHtml = `
                    <button type="button" onclick="quickReleaseCurrentPO()" style="padding:7px 14px; border-radius:8px; border:none; background:linear-gradient(135deg, #10b981, #059669); color:white; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(16,185,129,0.25); transition:all 0.2s;">
                        <span class="material-symbols-outlined" style="font-size:16px;">local_shipping</span>
                        Rilis ke Produksi (${stepsDone}/4 Selesai)
                    </button>
                `;
            } else {
                actionBtnHtml = `
                    <span style="font-size:11px; color:rgba(255,255,255,0.45); background:rgba(255,255,255,0.04); padding:4px 10px; border-radius:6px; border:1px dashed rgba(255,255,255,0.1);">
                        Minimal 3 tahap untuk rilis (Saat ini: ${stepsDone}/4)
                    </span>
                `;
            }

            releaseBannerHtml = `
                <div style="margin-top:14px; padding:12px 14px; border-radius:12px; background:rgba(255,255,255,0.03); border:1px dashed rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <div style="font-size:12px; color:rgba(255,255,255,0.65);">
                        Progres inspeksi: <strong style="color:${stepsDone >= 3 ? '#34d399' : '#fbbf24'}">${stepsDone} dari 4</strong> tahapan selesai
                    </div>
                    ${actionBtnHtml}
                </div>
            `;
        }

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
            ${releaseBannerHtml}
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

        const isDone = isPOFullyDone(po);
        const isPartial = isPOInProgress(po);
        const isPending = !isDone && !isPartial;

        let matchStatus = true;
        if (status === 'pending') {
            matchStatus = isPending;
        } else if (status === 'in-progress') {
            matchStatus = isPartial;
        } else if (status === 'done') {
            matchStatus = isDone;
        } else if (status === 'all') {
            matchStatus = true;
        }

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

window.openValidationDialog = function (isStepDone = false) {
    pendingIsStepDone = Boolean(isStepDone);

    // Sync hidden checking-status
    const checkingStatusEl = document.getElementById('checking-status');
    if (checkingStatusEl) {
        checkingStatusEl.value = pendingIsStepDone ? 'done' : 'in-progress';
    }

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

        if (pendingIsStepDone && inspect <= 0) {
            errors.push('Qty Inspect harus lebih dari 0 untuk menyelesaikan tahap ini.');
        } else if (!pendingIsStepDone && inspect < 0) {
            errors.push('Qty Inspect tidak boleh negatif.');
        }

        if (inspect > maxAllowed) {
            errors.push(`Qty Inspect (${inspect}) tidak boleh melebihi ${labelType} (${maxAllowed.toLocaleString('id-ID')} ${selectedPO.uom}).`);
        }
        if (fail < 0) errors.push('Qty Fail tidak boleh negatif.');
        if (fail > inspect) errors.push(`Qty Fail (${fail}) tidak boleh melebihi Qty Inspect (${inspect}).`);
    } else if (currentInspectionType === 'rolling') {
        const rollStatus = document.getElementById('rolling-inspect-status')?.value;
        const rollPct = document.getElementById('rolling-inspect-percentage')?.value.trim();
        if (pendingIsStepDone) {
            if (!rollStatus) errors.push('Pilih Status Roll Visual.');
            if (!rollPct) errors.push('Isi Roll Sample Percentage (%).');
        }
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
        if (pendingIsStepDone && (!bondingFileEl || !bondingFileEl.files || bondingFileEl.files.length === 0)) {
            errors.push('Harap upload file evidence / dokumen Bonding Test untuk menyelesaikan tahap ini.');
        }
    }

    if (leaderSelect && leaderSelect.value) {
        if (pendingIsStepDone && (!fileInput || !fileInput.files || fileInput.files.length === 0)) {
            errors.push('Harap upload evidence / bukti persetujuan leader.');
        }
    }

    const errorsEl = document.getElementById('validation-errors');
    const summaryEl = document.getElementById('validation-summary');
    const overlay = document.getElementById('validation-overlay');
    const modalTitle = document.getElementById('validation-modal-title');
    const modalDesc = document.getElementById('validation-modal-desc');
    const modalIcon = document.getElementById('validation-modal-icon');
    const modalIconBox = document.getElementById('validation-modal-icon-box');
    const confirmBtn = document.getElementById('validation-confirm-btn');

    // Adapt modal title, desc & confirm button based on Selesai Inspect vs Simpan Progress
    if (modalTitle) {
        modalTitle.textContent = pendingIsStepDone ? 'Konfirmasi Selesai Inspeksi Tahap' : 'Konfirmasi Simpan Progress Tahap';
    }
    if (modalDesc) {
        modalDesc.textContent = pendingIsStepDone 
            ? 'Tahapan inspeksi ini akan divalidasi dan ditandai SELESAI (Done).'
            : 'Periksa kembali data sebelum disimpan sebagai progres berjalan (In-Progress).';
    }
    if (modalIcon) {
        modalIcon.textContent = pendingIsStepDone ? 'task_alt' : 'bookmark_added';
    }
    if (modalIconBox) {
        modalIconBox.style.background = pendingIsStepDone ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)';
        modalIconBox.style.borderColor = pendingIsStepDone ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.4)';
    }
    if (confirmBtn) {
        if (pendingIsStepDone) {
            confirmBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">task_alt</span> Selesaikan Tahap';
            confirmBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        } else {
            confirmBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">bookmark_added</span> Simpan Progress';
            confirmBtn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
        }
    }

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
        const isRolling = currentInspectionType === 'rolling';
        const isBonding = currentInspectionType === 'bonding';
        let inspectTypeLabel = 'Check Raw Material';
        if (isRolling) inspectTypeLabel = 'Rolling Inspection (Raw Stage)';
        if (currentInspectionType === 'laminating') inspectTypeLabel = 'Check Laminating Material';
        if (isBonding) inspectTypeLabel = 'Check Bonding Test';

        const leaderVal = leaderSelect && leaderSelect.value ? leaderSelect.value : 'Tidak Ada';
        const evidenceFileText = fileInput && fileInput.files.length > 0 ? fileInput.files[0].name : '—';
        const actionStatusText = pendingIsStepDone ? 'Selesai Inspect (Tahapan Selesai / Done)' : 'Simpan Progress (Tahapan Berjalan / In-Progress)';

        let summaryHtml = `
            ${summaryRow('Tindakan', actionStatusText, true)}
            ${summaryRow('Target PO Number', selectedPO.po_number)}
            ${summaryRow('Material Name', selectedPO.material_name)}
            ${summaryRow('Vendor', selectedPO.vendor_name)}
            ${summaryRow('Jenis Inspeksi', inspectTypeLabel)}
        `;

        if (isRaw) {
            const pass = inspect - fail;
            const passRate = ((pass / inspect) * 100).toFixed(1);
            const checkColor = document.getElementById('check-color')?.value.trim() || 'OK';
            summaryHtml += `
                ${summaryRow('Qty Inspect', inspect.toLocaleString('id-ID'))}
                ${summaryRow('Qty Fail', fail.toLocaleString('id-ID'))}
                ${summaryRow('Qty Pass', `${pass.toLocaleString('id-ID')} (${passRate}%)`)}
                ${summaryRow('Check Color', checkColor)}
            `;
        } else if (isRolling) {
            const rollStatus = document.getElementById('rolling-inspect-status')?.value || 'OK';
            const rollPct = document.getElementById('rolling-inspect-percentage')?.value.trim() || '10%';
            const rollNotes = document.getElementById('rolling-inspect-notes')?.value.trim() || '—';
            summaryHtml += `
                ${summaryRow('Status Roll Visual', rollStatus)}
                ${summaryRow('Sample Percentage', rollPct)}
                ${summaryRow('Catatan Rolling', rollNotes)}
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

let isSubmittingInspection = false;

async function submitInspection() {
    if (isSubmittingInspection) return;
    isSubmittingInspection = true;

    const overlay = document.getElementById('validation-overlay');
    const loading = document.getElementById('loading-overlay');
    const loadingTxt = document.getElementById('loading-text');
    const confirmBtn = document.getElementById('validation-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;

    overlay.style.display = 'none';
    loading.classList.add('visible');
    if (loadingTxt) loadingTxt.textContent = 'Menyimpan data...';

    const isBonding = currentInspectionType === 'bonding';
    const isRolling = currentInspectionType === 'rolling';
    const isLam = currentInspectionType === 'laminating';
    const isRaw = currentInspectionType === 'raw';

    let inspectTypeStr = 'Raw Material';
    if (isRolling) inspectTypeStr = 'Rolling Inspection';
    else if (isLam) inspectTypeStr = 'Laminating';
    else if (isBonding) inspectTypeStr = 'Bonding Test';

    const inspect = isRaw ? (parseInt(document.getElementById('qty-inspect')?.value, 10) || 0) : 0;
    const fail = isRaw ? (parseInt(document.getElementById('qty-fail')?.value, 10) || 0) : 0;
    const notes = document.getElementById('defect-notes')?.value.trim() || '';
    const bondingNotes = isBonding ? (document.getElementById('bonding-notes')?.value.trim() || '') : '';
    const rollStatus = document.getElementById('rolling-inspect-status')?.value || 'OK';
    const rollPctVal = document.getElementById('rolling-inspect-percentage')?.value.trim() || '10%';
    const rollNotes = document.getElementById('rolling-inspect-notes')?.value.trim() || '';
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

    try {
        if (MATERIAL_TEST_MODE) {
            await delay(1000);
            const idx = allPOData.findIndex(p => (selectedPO.id && p.id === selectedPO.id) || (p.po_number === selectedPO.po_number && p.material_name === selectedPO.material_name));
            if (idx !== -1) {
                allPOData[idx].status = checkingStatus;
                if (checkingStatus === 'in-progress') {
                    allPOData[idx].checked_qty = (allPOData[idx].checked_qty || 0) + inspect;
                    allPOData[idx].balance_qty = Math.max(0, allPOData[idx].planned_qty - allPOData[idx].checked_qty);
                }
            }
            showToast(`Data inspeksi ${selectedPO.po_number} berhasil disimpan! (simulasi)`, 'success');
            resetForm();
            filterPOList();
            return;
        }

        const result = await apiSubmitInspection({
            master_data_id:           selectedPO.id || null,
            po_number:                selectedPO.po_number,
            material_name:            selectedPO.material_name,
            item_description:         selectedPO.item_description || '',
            qty_receive:              selectedPO.planned_qty,
            receive_date:             selectedPO.receive_date,
            inspector_nik:            inspectorName,
            inspector_name:           inspectorName,
            inspection_type:          inspectTypeStr,
            qty_inspect:              inspect,
            qty_fail:                 fail,
            defect_notes:             isRolling ? (rollNotes || notes) : (isBonding ? bondingNotes : notes),
            rolling_inspection:       isRolling ? 'Yes' : (isBonding ? 'No' : lamRollChk),
            check_color:              isRaw ? checkColor : (isBonding ? 'N/A' : lamColorRes),
            color_check_status:       isRaw ? '' : (isBonding ? '' : (isRolling ? rollStatus : lamColorChoice)),
            color_check_result:       isRaw ? checkColor : (isBonding ? '' : lamColorRes),
            packaging_status:         isRaw ? '' : (isBonding ? '' : (isRolling ? '' : lamPackagingChoice)),
            packaging_reject_reason:  isBonding ? '' : lamPkgReason,
            roll_inspection_flag:     isRolling ? rollStatus : (isBonding ? 'No' : lamRollChk),
            roll_inspection_percentage: isRolling ? rollPctVal : (isBonding ? '' : lamRollPct),
            approved_by_leader:       isBonding ? '' : (leaderSelect ? leaderSelect.value : ''),
            file_data:                fileData,
            file_name:                fileName,
            file_type:                fileType,
            inspection_date:          new Date().toISOString(),
            status:                   pendingIsStepDone ? 'done' : 'in-progress',
            is_step_done:             pendingIsStepDone,
            is_final_release:         false,
            released_by:              '',
            release_notes:            '',
        });

        if (result.status === 'ok') {
            const msg = result.message || (pendingIsStepDone 
                ? `Inspeksi tahap ${inspectTypeStr} pada PO ${selectedPO.po_number} berhasil diselesaikan!` 
                : `Progress inspeksi tahap ${inspectTypeStr} pada PO ${selectedPO.po_number} berhasil disimpan!`);
            showToast(msg, 'success');
            const curPoNum = selectedPO.po_number;
            const curPoId = selectedPO.id;
            const curMatName = selectedPO.material_name;
            await fetchMasterData();

            const updatedPO = allPOData.find(p => (curPoId && p.id === curPoId) || (p.po_number === curPoNum && p.material_name === curMatName));
            if (updatedPO) {
                let cardEl = document.querySelector(`.po-card[data-id="${updatedPO.id}"]`);
                if (!cardEl) {
                    // Jika tersembunyi karena filter status, kembalikan filter ke 'all' agar card tetap terlihat
                    const statusFilterEl = document.getElementById('status-filter');
                    if (statusFilterEl && statusFilterEl.value !== 'all') {
                        statusFilterEl.value = 'all';
                        filterPOList();
                        cardEl = document.querySelector(`.po-card[data-id="${updatedPO.id}"]`);
                    }
                }
                await selectPO(updatedPO, cardEl || document.createElement('div'));
            }
        } else {
            throw new Error(result.message || 'Gagal menyimpan data.');
        }

    } catch (err) {
        console.error('submitInspection error:', err);
        showToast('Error: ' + err.message, 'error');
    } finally {
        isSubmittingInspection = false;
        if (confirmBtn) confirmBtn.disabled = false;
        if (loading) loading.classList.remove('visible');
    }
}

window.quickReleaseCurrentPO = async function () {
    if (!selectedPO) {
        showToast('Pilih PO terlebih dahulu.', 'error');
        return;
    }
    const stepsDone = countCompletedSteps(selectedPO);
    const isAdminOrSpv = currentUser?.role === 'admin' || currentUser?.role === 'supervisor' || currentUser?.role === 'manager';

    if (!isAdminOrSpv && stepsDone < 3) {
        showToast(`Otorisasi ditolak: Minimal 3 tahapan inspeksi harus diselesaikan sebelum dapat dirilis ke produksi. Tahapan saat ini: ${stepsDone}/4. Hubungi Admin jika memerlukan rilis khusus.`, 'error');
        return;
    }

    let releaseNotes = 'Dirilis ke produksi setelah memenuhi minimal tahapan inspeksi';
    if (isAdminOrSpv && stepsDone < 3) {
        const inputReason = prompt(
            `Otorisasi Rilis Langsung (Ready to Deliver by Admin):\n\nNomor PO: ${selectedPO.po_number}\nMaterial: ${selectedPO.material_name}\nTahap selesai: ${stepsDone}/4\n\nMasukkan catatan/alasan rilis khusus oleh Admin (misal: CoA Vendor Valid / Disetujui SPV):`,
            'Disetujui Admin - Siap Kirim (CoA Valid)'
        );
        if (inputReason === null) return;
        if (!inputReason.trim()) {
            showToast('Catatan alasan rilis oleh Admin wajib diisi.', 'error');
            return;
        }
        releaseNotes = inputReason.trim();
    } else {
        const confirmRelease = confirm(
            `Konfirmasi Rilis ke Produksi?\n\nPO: ${selectedPO.po_number}\nMaterial: ${selectedPO.material_name}\nTahap selesai: ${stepsDone}/4\n\nMaterial ini akan ditandai SELESAI (Done) dan Siap Kirim (Ready to Deliver) ke Produksi.`
        );
        if (!confirmRelease) return;
    }

    const loading = document.getElementById('loading-overlay');
    const loadingTxt = document.getElementById('loading-text');
    if (loading) loading.classList.add('visible');
    if (loadingTxt) loadingTxt.textContent = 'Merilis material ke produksi...';

    try {
        const inspectorName = (currentUser?.name || currentUser?.nik || 'Inspector') + (isAdminOrSpv ? ' (Admin)' : '');
        await apiReleaseMaterialToProduction({
            masterDataId: selectedPO.id,
            releasedBy: inspectorName,
            releaseNotes: releaseNotes
        });

        if (loading) loading.classList.remove('visible');
        showToast(`PO ${selectedPO.po_number} berhasil dirilis ke produksi!`, 'success');

        const curPoNum = selectedPO.po_number;
        const curPoId = selectedPO.id;
        await fetchMasterData();

        const updatedPO = allPOData.find(p => (curPoId && p.id === curPoId) || p.po_number === curPoNum);
        if (updatedPO) {
            let cardEl = document.querySelector(`.po-card[data-po-number="${updatedPO.po_number}"]`);
            if (!cardEl) {
                const statusFilterEl = document.getElementById('status-filter');
                if (statusFilterEl && statusFilterEl.value !== 'all') {
                    statusFilterEl.value = 'all';
                    filterPOList();
                    cardEl = document.querySelector(`.po-card[data-po-number="${updatedPO.po_number}"]`);
                }
            }
            await selectPO(updatedPO, cardEl || document.createElement('div'));
        }
    } catch (err) {
        console.error('quickReleaseCurrentPO error:', err);
        if (loading) loading.classList.remove('visible');
        showToast('Gagal merilis material: ' + err.message, 'error');
    }
};

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
