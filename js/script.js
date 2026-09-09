import { supabase } from './db.js';
// ===========================================
// 1. Deklarasi Variabel Global dan DOM References (Modifikasi)
// ===========================================
const GAS_EVIDENCE_URL = 'https://script.google.com/macros/s/AKfycbxt5mmTI3bTAFMpaDo6VgVoKk8raDecfOoCbqsZgdK1-BwErb-VHROC0RSj8O8NYoR-JA/exec';
// --- IMPOR DATABASE DARI FILE TERPISAH ---
import { requireAuth, getUser, signOut, UI_TEST_MODE, ROLES } from './auth.js';
import { renderDefectButtons, getDefects, renderVendorOptions, getVendors, getUsers, getComponents, getProcesses, syncAllFromSupabase, getStyleModelDatabaseMap, getStyleModels } from './admin.js';
import { showAlert, showConfirm } from './dialog.js';

let totalInspected = 0;
let defectCounts = {};

// --- VARIABEL UNTUK POLA MULTIPLE DEFECT ---
let selectedDefects = [];
let currentInspectionPairs = [];

// --- REWORK LOG: menyimpan posisi rework per item untuk kalkulasi FTT ---
// Karena posisi L/R/Pairs dihilangkan, default selalu 'PAIRS'
let reworkLog = [];
// ---------------------------------------------

// --- STATE UNTUK MULTI ITEM KOMPONEN & PROSES ---
let inspectionItems = [];
let editingItemIndex = null;

const qtyInspectOutputs = {
    'pass': 0,
    'defect': 0
};

// Referensi Elemen DOM Utama - Akan diisi di initApp
let outputElements = {};
let fttOutput;
let qtyInspectOutput;
let summaryContainer;
let redoRateOutput;
let qtySampleSetInput;
let qtyInspectModeSelect;
let qtyInspectInput;
let tanggalInspectionInput;
let tanggalBucketInput;
let addItemBtn;
let inspectedItemsTbody;
let defectButtons;
let gradeInputButtons;
let auditorSelect;
let modelNameInput;
let styleNumberInput;
let tanggalIncomingInput;
let vendorSelect;
let selectedVendor = '';
let selectedMaterialType = ''; // '' | 'upper' | 'bottom'
let currentUser = null;
let currentUserRole = ROLES.INSPECTOR;
let isRestoringDraft = false;

// Variabel untuk limit dinamis
let currentInspectionLimit = 0;

// Kunci localStorage
const STORAGE_KEYS = {
    FORM_DATA: 'qms_form_data',
    DEFECT_COUNTS: 'qms_defect_counts',
    QTY_OUTPUTS: 'qms_qty_outputs',
    STATE_VARIABLES: 'qms_state_variables',
    QTY_SAMPLE_SET: 'qtySampleSet'
};

// ─── Multi-Date Inspection State & Helpers ─────────────────────
let selectedInspectionDates = [];

function renderInspectionTags(skipSave = false) {
    const container = document.getElementById('inspection-tags-container');
    const hiddenInput = document.getElementById('tanggal-inspection');
    if (!container) return;

    if (!selectedInspectionDates.length) {
        container.innerHTML = '<span style="font-size:12px;color:#94a3b8;font-style:italic;padding:2px 4px;">Belum ada tanggal inspection dipilih</span>';
        if (hiddenInput) hiddenInput.value = '';
        return;
    }

    container.innerHTML = selectedInspectionDates.map(dateStr => {
        const safeDate = String(dateStr).replace(/'/g, "\\'");
        return `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600;background:rgba(16, 185, 129, 0.16);color:#86efac;border:1px solid rgba(16, 185, 129, 0.4);box-shadow:0 1px 3px rgba(0,0,0,0.2);">
                <span>${dateStr}</span>
                <button type="button" onclick="window.removeInspectionDate('${safeDate}')" style="color:#34d399;background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:14px;line-height:1;" title="Hapus tanggal ${dateStr}">
                    <span class="material-symbols-outlined" style="font-size:14px;font-weight:bold;">close</span>
                </button>
            </span>
        `;
    }).join('');

    const joinedStr = selectedInspectionDates.join(', ');
    if (hiddenInput) hiddenInput.value = joinedStr;
    if (!skipSave && typeof saveToLocalStorage === 'function') {
        saveToLocalStorage();
    }
}

window.addInspectionDate = function(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return;
    const cleanDate = dateStr.trim();
    if (!cleanDate) return;

    if (cleanDate.includes(',')) {
        cleanDate.split(',').forEach(d => window.addInspectionDate(d));
        return;
    }

    if (!selectedInspectionDates.includes(cleanDate)) {
        selectedInspectionDates.push(cleanDate);
        selectedInspectionDates.sort();
        renderInspectionTags();
    }
};

window.removeInspectionDate = function(dateStr) {
    selectedInspectionDates = selectedInspectionDates.filter(d => d !== dateStr);
    renderInspectionTags();
};

window.setInspectionDates = function(val, skipSave = false) {
    selectedInspectionDates = [];
    if (!val) {
        renderInspectionTags(skipSave);
        return;
    }
    if (Array.isArray(val)) {
        val.forEach(d => {
            if (d && typeof d === 'string' && !selectedInspectionDates.includes(d.trim())) {
                selectedInspectionDates.push(d.trim());
            }
        });
    } else if (typeof val === 'string') {
        val.split(/[,]+/).forEach(d => {
            const trimmed = d.trim();
            if (trimmed && !selectedInspectionDates.includes(trimmed)) {
                selectedInspectionDates.push(trimmed);
            }
        });
    }
    renderInspectionTags(skipSave);
};

// ─── Multi-Date Bucket State & Helpers ─────────────────────────
let selectedBucketDates = [];

function renderBucketTags(skipSave = false) {
    const container = document.getElementById('bucket-tags-container');
    const hiddenInput = document.getElementById('tanggal-bucket');
    if (!container) return;

    if (!selectedBucketDates.length) {
        container.innerHTML = '<span style="font-size:12px;color:#94a3b8;font-style:italic;padding:2px 4px;">Belum ada tanggal bucket dipilih</span>';
        if (hiddenInput) hiddenInput.value = '';
        return;
    }

    container.innerHTML = selectedBucketDates.map(dateStr => {
        const safeDate = String(dateStr).replace(/'/g, "\\'");
        return `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600;background:rgba(59, 130, 246, 0.16);color:#93c5fd;border:1px solid rgba(59, 130, 246, 0.4);box-shadow:0 1px 3px rgba(0,0,0,0.2);">
                <span>${dateStr}</span>
                <button type="button" onclick="window.removeBucketDate('${safeDate}')" style="color:#60a5fa;background:transparent;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:14px;line-height:1;" title="Hapus tanggal ${dateStr}">
                    <span class="material-symbols-outlined" style="font-size:14px;font-weight:bold;">close</span>
                </button>
            </span>
        `;
    }).join('');

    const joinedStr = selectedBucketDates.join(', ');
    if (hiddenInput) hiddenInput.value = joinedStr;
    if (!skipSave && typeof saveToLocalStorage === 'function') {
        saveToLocalStorage();
    }
}

window.addBucketDate = function(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return;
    const cleanDate = dateStr.trim();
    if (!cleanDate) return;

    if (cleanDate.includes(',')) {
        cleanDate.split(',').forEach(d => window.addBucketDate(d));
        return;
    }

    if (!selectedBucketDates.includes(cleanDate)) {
        selectedBucketDates.push(cleanDate);
        selectedBucketDates.sort();
        renderBucketTags();
    }
};

window.removeBucketDate = function(dateStr) {
    selectedBucketDates = selectedBucketDates.filter(d => d !== dateStr);
    renderBucketTags();
};

window.setBucketDates = function(val, skipSave = false) {
    selectedBucketDates = [];
    if (!val) {
        renderBucketTags(skipSave);
        return;
    }
    if (Array.isArray(val)) {
        val.forEach(d => {
            if (d && typeof d === 'string' && !selectedBucketDates.includes(d.trim())) {
                selectedBucketDates.push(d.trim());
            }
        });
    } else if (typeof val === 'string') {
        val.split(/[,]+/).forEach(d => {
            const trimmed = d.trim();
            if (trimmed && !selectedBucketDates.includes(trimmed)) {
                selectedBucketDates.push(trimmed);
            }
        });
    }
    renderBucketTags(skipSave);
};

function initBucketComponent() {
    const todayStr = new Date().toISOString().split('T')[0];
    const bucketDatePicker = document.getElementById('bucket-date-picker');
    if (bucketDatePicker) {
        if (!bucketDatePicker.value) bucketDatePicker.value = todayStr;
        bucketDatePicker.onchange = () => {
            if (bucketDatePicker.value) {
                window.addBucketDate(bucketDatePicker.value);
            }
        };
    }
    if (!selectedBucketDates.length) {
        window.setBucketDates(todayStr, true);
    }
}

// ─── Multi-Style & Model Component ─────────────────────
let selectedStyles = []; // Array of { style: string, model: string }

function renderStyleTags(skipSave = false) {
    const container = document.getElementById('style-tags-container');
    const hiddenStyle = document.getElementById('style-number');
    const hiddenModel = document.getElementById('model-name');

    if (container) {
        if (!selectedStyles.length) {
            container.innerHTML = '<span style="font-size:12px;color:#94a3b8;font-style:italic;">Belum ada style number dipilih</span>';
        } else {
            container.innerHTML = selectedStyles.map(item => `
                <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(14, 165, 233, 0.16);border:1px solid rgba(14, 165, 233, 0.4);color:#bae6fd;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,0.2);">
                    <span style="font-weight:700;color:#38bdf8;">${item.style}</span>
                    <span style="color:#93c5fd;font-size:11px;">(${item.model || '—'})</span>
                    <button type="button" onclick="window.removeStyle('${item.style}')" style="background:transparent;border:none;color:#38bdf8;cursor:pointer;font-weight:bold;font-size:14px;line-height:1;padding:0 2px;" title="Hapus">&times;</button>
                </span>
            `).join('');
        }
    }

    const joinedStyles = selectedStyles.map(s => s.style).join(', ');
    const joinedModels = selectedStyles.map(s => s.model || '—').join(', ');
    if (hiddenStyle) hiddenStyle.value = joinedStyles;
    if (hiddenModel) hiddenModel.value = joinedModels;

    checkInfoCompleteAndLockButtons();
    if (!skipSave && typeof saveToLocalStorage === 'function') {
        saveToLocalStorage();
    }
}

window.addStyle = function(styleStr, optModelStr) {
    if (!styleStr || typeof styleStr !== 'string') return;
    const clean = styleStr.trim();
    if (!clean) return;

    if (clean.includes(',')) {
        clean.split(',').forEach(s => window.addStyle(s));
        return;
    }

    const upperStyle = clean.toUpperCase();
    if (selectedStyles.some(s => s.style === upperStyle)) {
        return; // Sudah ada dalam daftar
    }

    let modelName = optModelStr ? optModelStr.trim() : '';
    if (!modelName) {
        const modelMap = getStyleModelDatabaseMap();
        modelName = modelMap[upperStyle] || '—';
    }

    selectedStyles.push({ style: upperStyle, model: modelName });
    renderStyleTags();

    const inputEl = document.getElementById('style-number-input');
    if (inputEl) inputEl.value = '';
    const previewEl = document.getElementById('style-model-preview');
    if (previewEl) {
        previewEl.innerHTML = '';
        previewEl.style.display = 'none';
    }
};

window.removeStyle = function(styleStr) {
    selectedStyles = selectedStyles.filter(s => s.style !== styleStr);
    renderStyleTags();
};

window.setStyles = function(stylesVal, modelsVal, skipSave = false) {
    selectedStyles = [];
    if (!stylesVal) {
        renderStyleTags(skipSave);
        return;
    }

    const modelMap = getStyleModelDatabaseMap();

    if (Array.isArray(stylesVal)) {
        stylesVal.forEach(item => {
            if (!item) return;
            if (typeof item === 'object' && item.style) {
                const upper = String(item.style).trim().toUpperCase();
                const m = item.model || modelMap[upper] || '—';
                if (!selectedStyles.some(s => s.style === upper)) {
                    selectedStyles.push({ style: upper, model: m });
                }
            } else if (typeof item === 'string') {
                const upper = item.trim().toUpperCase();
                if (upper && !selectedStyles.some(s => s.style === upper)) {
                    selectedStyles.push({ style: upper, model: modelMap[upper] || '—' });
                }
            }
        });
    } else if (typeof stylesVal === 'string') {
        const sArr = stylesVal.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        const mArr = (typeof modelsVal === 'string' ? modelsVal.split(',') : []).map(m => m.trim());
        sArr.forEach((st, idx) => {
            if (!selectedStyles.some(s => s.style === st)) {
                const mName = (mArr[idx] && mArr[idx] !== '—') ? mArr[idx] : (modelMap[st] || '—');
                selectedStyles.push({ style: st, model: mName });
            }
        });
    }

    renderStyleTags(skipSave);
};

function populateStyleDatalist() {
    const datalist = document.getElementById('style-number-datalist');
    if (!datalist) return;
    try {
        const models = getStyleModels();
        if (Array.isArray(models) && models.length > 0) {
            datalist.innerHTML = models.map(m => 
                `<option value="${m.style_number}">${m.style_number} - ${m.model_name}</option>`
            ).join('');
        }
    } catch (e) {
        console.warn('Failed populating style datalist:', e);
    }
}

function updateStyleInputPreview(val) {
    const previewEl = document.getElementById('style-model-preview');
    if (!previewEl) return;
    const clean = (val || '').trim().toUpperCase();
    if (!clean) {
        previewEl.innerHTML = '';
        previewEl.style.display = 'none';
        return;
    }
    const modelMap = getStyleModelDatabaseMap();
    const matchedModel = modelMap[clean];
    if (matchedModel) {
        previewEl.style.display = 'block';
        previewEl.style.color = '#059669';
        previewEl.innerHTML = `Model terdeteksi: <strong>${matchedModel}</strong>`;
    } else if (clean.length >= 6) {
        previewEl.style.display = 'block';
        previewEl.style.color = '#d97706';
        previewEl.innerHTML = `Model tidak terdaftar di database master (akan diset "—")`;
    } else {
        previewEl.innerHTML = '';
        previewEl.style.display = 'none';
    }
}

// ─── Vendor Button-Selection ──────────────────────────

const VENDOR_BTN_CLS = 'vendor-sel-btn';
const COMPONENT_BTN_CLS = 'component-sel-btn';
const PROCESS_BTN_CLS = 'process-sel-btn';

function renderVendorButtons() {
    const container = document.getElementById('vendor-btn-container');
    if (!container) return;
    container.innerHTML = '';
    if (!selectedMaterialType) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Pilih material type terlebih dahulu —</span>';
        return;
    }
    const vendors = getVendors();
    const filtered = vendors.filter(v => v.material_type === selectedMaterialType);
    if (!filtered.length) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Tidak ada vendor untuk tipe ini —</span>';
        return;
    }
    filtered.forEach(v => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = v.name;
        btn.dataset.value = v.name;
        btn.className = `${VENDOR_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
            bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300`;
        if (selectedVendor === v.name) applyVendorActive(btn);
        btn.addEventListener('click', () => {
            selectedVendor = (selectedVendor === v.name) ? '' : v.name;
            if (addItemBtn) {
                addItemBtn.disabled = !selectedVendor;
            }
            // Clear items when vendor changes
            inspectionItems = [];
            renderInspectedItems();

            refreshVendorButtons();
            checkInfoCompleteAndLockButtons();
            saveToLocalStorage();
        });
        container.appendChild(btn);
    });
}

function refreshVendorButtons() {
    document.querySelectorAll(`.${VENDOR_BTN_CLS}`).forEach(btn => {
        if (btn.dataset.value === selectedVendor) applyVendorActive(btn);
        else applyVendorInactive(btn);
    });
}

function applyVendorActive(btn) {
    btn.className = `${VENDOR_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
        bg-blue-600 border-blue-600 text-white shadow-sm`;
}
function applyVendorInactive(btn) {
    btn.className = `${VENDOR_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
        bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300`;
}

// ─── Modal Component / Process Selection ──────────────────────────

// Modal Form State Variables (Declared early to avoid TDZ)
let modalInspectionMode = 'single'; // 'single' | 'bulk'
let modalComponent = '';
let modalSelectedComponents = [];
let modalActiveDefectComponent = '';
let modalProcesses = [];
let modalSelectedComponent = '';
let modalSelectedProcesses = [];
let modalItemDefects = {};
let modalComponentDefects = {};
let modalPassVal = 0;
let modalDefectVal = 0;
let modalQtyIncomingVal = 0;
let modalQtyInspectVal = 0;
let modalDefectSearchQuery = '';
let modalDefectActiveCategory = 'all';

function renderModalComponentButtons(vendorName) {
    const container = document.getElementById('modal-component-container');
    if (!container) return;
    container.innerHTML = '';
    if (!vendorName) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Pilih vendor di halaman utama terlebih dahulu —</span>';
        return;
    }
    const components = getComponents();
    const vendors = getVendors();
    const vendor = vendors.find(v => v.name === vendorName);
    const filtered = vendor ? components.filter(c => c.vendor_id === vendor.id) : [];
    if (!filtered.length) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Tidak ada component untuk vendor ini —</span>';
        return;
    }
    filtered.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.value = c.name;

        const isSelected = modalInspectionMode === 'bulk'
            ? modalSelectedComponents.includes(c.name)
            : modalComponent === c.name;

        if (isSelected) {
            btn.className = 'modal-comp-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-emerald-600 border-emerald-600 text-white shadow-sm cursor-pointer flex items-center gap-1';
            if (modalInspectionMode === 'bulk') {
                btn.innerHTML = `<span class="material-symbols-outlined text-[13px] align-text-bottom">check</span>${c.name}`;
            } else {
                btn.textContent = c.name;
            }
        } else {
            btn.className = 'modal-comp-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer flex items-center gap-1';
            btn.textContent = c.name;
        }

        btn.addEventListener('click', () => {
            if (modalInspectionMode === 'bulk') {
                if (modalSelectedComponents.includes(c.name)) {
                    modalSelectedComponents = modalSelectedComponents.filter(name => name !== c.name);
                    delete modalComponentDefects[c.name];
                    if (modalActiveDefectComponent === c.name) {
                        modalActiveDefectComponent = modalSelectedComponents[0] || '';
                    }
                } else {
                    modalSelectedComponents.push(c.name);
                    if (!modalComponentDefects[c.name]) modalComponentDefects[c.name] = {};
                    if (!modalActiveDefectComponent) {
                        modalActiveDefectComponent = c.name;
                    }
                }
                modalComponent = modalSelectedComponents.join(', ');
            } else {
                modalComponent = c.name;
                modalSelectedComponents = [c.name];
                modalActiveDefectComponent = c.name;
            }
            updateModalComponentButtonsActiveState();
            renderModalDefectTargetPills();
            renderEnhancedModalDefectButtons();
            updateModalGradeState();
        });
        container.appendChild(btn);
    });
}

function updateModalComponentButtonsActiveState() {
    document.querySelectorAll('.modal-comp-btn').forEach(btn => {
        const val = btn.dataset.value;
        const isSelected = modalInspectionMode === 'bulk'
            ? modalSelectedComponents.includes(val)
            : modalComponent === val;

        if (isSelected) {
            btn.className = 'modal-comp-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-emerald-600 border-emerald-600 text-white shadow-sm cursor-pointer flex items-center gap-1';
            if (modalInspectionMode === 'bulk') {
                btn.innerHTML = `<span class="material-symbols-outlined text-[13px] align-text-bottom">check</span>${val}`;
            } else {
                btn.textContent = val;
            }
        } else {
            btn.className = 'modal-comp-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer flex items-center gap-1';
            btn.textContent = val;
        }
    });
}

function renderModalDefectTargetPills() {
    const targetContainer = document.getElementById('modal-defect-target-container');
    const pillsContainer = document.getElementById('modal-defect-target-pills');
    const activeLabel = document.getElementById('modal-active-defect-component-label');
    const activeCompName = document.getElementById('modal-active-comp-name');

    if (modalInspectionMode !== 'bulk' || modalSelectedComponents.length <= 1) {
        if (targetContainer) targetContainer.classList.add('hidden');
        if (activeLabel) activeLabel.classList.add('hidden');
        return;
    }

    if (targetContainer) targetContainer.classList.remove('hidden');
    if (activeLabel) activeLabel.classList.remove('hidden');
    if (activeCompName) activeCompName.textContent = modalActiveDefectComponent || '—';

    if (!pillsContainer) return;
    pillsContainer.innerHTML = '';

    modalSelectedComponents.forEach(comp => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.comp = comp;

        // Calculate defects count for this component
        let defectCount = 0;
        const compDefects = modalComponentDefects[comp] || {};
        for (const t in compDefects) defectCount += (compDefects[t] || 0);

        const isActive = comp === modalActiveDefectComponent;
        btn.className = isActive
            ? 'px-3 py-1.5 rounded-lg border text-xs font-bold transition-all bg-amber-600 border-amber-600 text-white shadow-xs cursor-pointer flex items-center gap-1.5 ring-2 ring-amber-300'
            : 'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all bg-white border-amber-200 text-slate-700 hover:bg-amber-100/60 cursor-pointer flex items-center gap-1.5';

        const countBadge = defectCount > 0
            ? `<span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive ? 'bg-white text-amber-800' : 'bg-amber-200 text-amber-900'}">${defectCount}</span>`
            : '';

        btn.innerHTML = `<span>${comp}</span>${countBadge}`;

        btn.addEventListener('click', () => {
            modalActiveDefectComponent = comp;
            renderModalDefectTargetPills();
            if (activeCompName) activeCompName.textContent = comp;
            renderEnhancedModalDefectButtons();
        });

        pillsContainer.appendChild(btn);
    });
}

function renderModalProcessButtons() {
    const container = document.getElementById('modal-process-container');
    if (!container) return;
    container.innerHTML = '';
    const processes = getProcesses();
    const filtered = processes.filter(p => {
        if (!selectedMaterialType) return true;
        return !p.material_type || p.material_type === selectedMaterialType;
    });
    if (!filtered.length) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Tidak ada process untuk jenis material ini —</span>';
        return;
    }
    filtered.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.value = p.name;

        const isSelected = modalProcesses.includes(p.name);
        if (isSelected) {
            btn.innerHTML = `<span class="material-symbols-outlined text-[14px]">check</span> ${p.name}`;
            btn.className = 'modal-proc-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-emerald-600 border-emerald-600 text-white shadow-sm cursor-pointer flex items-center gap-1';
        } else {
            btn.textContent = p.name;
            btn.className = 'modal-proc-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer flex items-center gap-1';
        }

        btn.addEventListener('click', () => {
            if (modalProcesses.includes(p.name)) {
                modalProcesses = modalProcesses.filter(val => val !== p.name);
            } else {
                modalProcesses.push(p.name);
            }
            updateModalProcessButtonsActiveState();
        });
        container.appendChild(btn);
    });
}

function updateModalProcessButtonsActiveState() {
    document.querySelectorAll('.modal-proc-btn').forEach(btn => {
        const val = btn.dataset.value;
        const isSelected = modalProcesses.includes(val);
        if (isSelected) {
            btn.innerHTML = `<span class="material-symbols-outlined text-[14px]">check</span> ${val}`;
            btn.className = 'modal-proc-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-emerald-600 border-emerald-600 text-white shadow-sm cursor-pointer flex items-center gap-1';
        } else {
            btn.textContent = val;
            btn.className = 'modal-proc-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer flex items-center gap-1';
        }
    });
}

/**
 * Reset only the Context Selection (Vendor / Component / Process) without clearing other form fields.
 */
function resetContextSelection() {
    selectedMaterialType = '';
    const mtSelectEl = document.getElementById('material-type');
    if (mtSelectEl) mtSelectEl.value = '';
    selectedVendor = '';
    inspectionItems = [];
    editingItemIndex = null;
    renderVendorButtons();
    renderInspectedItems();
    if (addItemBtn) {
        addItemBtn.disabled = true;
    }
    updateTotalQtyInspect();
    checkInfoCompleteAndLockButtons();
    saveToLocalStorage();
}

function resetAllFields() {
    editingSessionId = null;
    const mtSelectEl = document.getElementById("material-type");
    if (mtSelectEl) mtSelectEl.value = '';
    const locSelectEl = document.getElementById("inspection-location");
    if (locSelectEl) locSelectEl.value = 'In-House Inspection';
    selectedMaterialType = '';
    selectedVendor = '';
    inspectionItems = [];
    editingItemIndex = null;

    // Reset datepickers
    const today = new Date().toISOString().split('T')[0];
    if (tanggalIncomingInput) tanggalIncomingInput.value = today;
    window.setInspectionDates(today);
    const inspPickerEl = document.getElementById('inspection-date-picker');
    if (inspPickerEl) inspPickerEl.value = today;
    window.setBucketDates(today);
    const bucketPickerEl = document.getElementById('bucket-date-picker');
    if (bucketPickerEl) bucketPickerEl.value = today;

    // Reset texts & styles
    window.setStyles([], '', true);
    const styleInputEl = document.getElementById('style-number-input');
    if (styleInputEl) styleInputEl.value = '';
    const stylePreviewEl = document.getElementById('style-model-preview');
    if (stylePreviewEl) {
        stylePreviewEl.innerHTML = '';
        stylePreviewEl.style.display = 'none';
    }
    if (styleNumberInput) styleNumberInput.value = '';
    if (modelNameInput) modelNameInput.value = '';

    // Reset quantities
    if (qtySampleSetInput) qtySampleSetInput.value = 0;
    if (qtyInspectModeSelect) qtyInspectModeSelect.value = 'manual';
    if (qtyInspectInput) {
        qtyInspectInput.value = 0;
        qtyInspectInput.readOnly = false;
    }

    // Reset overall counters
    totalInspected = 0;
    defectCounts = {};
    qtyInspectOutputs['pass'] = 0;
    qtyInspectOutputs['defect'] = 0;

    // Render
    renderVendorButtons();
    renderInspectedItems();

    if (addItemBtn) {
        addItemBtn.disabled = true;
    }

    const leaderSelect = document.getElementById("approved-by-leader");
    if (leaderSelect) leaderSelect.value = '';
    const leaderSelectMobile = document.getElementById("approved-by-leader-mobile");
    if (leaderSelectMobile) leaderSelectMobile.value = '';
    const fileInput = document.getElementById("evidence-file");
    if (fileInput) fileInput.value = '';
    const fileInputMobile = document.getElementById("evidence-file-mobile");
    if (fileInputMobile) fileInputMobile.value = '';
    const container = document.getElementById("evidence-upload-container");
    if (container) container.classList.add('hidden');
    const containerMobile = document.getElementById("evidence-upload-container-mobile");
    if (containerMobile) containerMobile.classList.add('hidden');

    if (typeof window.__syncInspectionStatusState === 'function') {
        window.__syncInspectionStatusState('Done');
    }

    updateTotalQtyInspect();
    checkInfoCompleteAndLockButtons();
    clearDraftStorage(true);
}

/**
 * Returns true when all required info is filled so defect/grade buttons can be used.
 */
function isInfoComplete() {
    const tanggal = tanggalIncomingInput ? tanggalIncomingInput.value.trim() : '';
    const hasStyle = (selectedStyles && selectedStyles.length > 0) || (styleNumberInput && styleNumberInput.value.trim());
    const hasModel = (selectedStyles && selectedStyles.length > 0) || (modelNameInput && modelNameInput.value.trim());
    return tanggal && selectedVendor && hasStyle && hasModel && inspectionItems.length > 0;
}

/**
 * Lock or unlock defect + grade buttons based on info completeness.
 * Also updates a visual hint banner.
 */
function checkInfoCompleteAndLockButtons() {
    const complete = isInfoComplete();
    const hint = document.getElementById('inspection-info-hint');
    if (hint) hint.classList.toggle('hidden', complete);

    updateSaveButtonState();
}

// ===========================================
// 2. Mekanisme LocalStorage Draf Inspeksi (Auto-Save & Restore)
// ===========================================

function getDraftStorageKey() {
    const uMeta = currentUser?.user_metadata || {};
    const nik = (uMeta.nik || uMeta.display_name || uMeta.email || 'anonymous').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return `qms_subcont_draft_${nik}`;
}

function formatDraftTime(isoStr) {
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Baru saja';
        if (diffMins < 60) return `${diffMins} menit lalu`;
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `Tersimpan jam ${hours}:${mins}`;
    } catch {
        return '';
    }
}

function saveToLocalStorage() {
    if (isRestoringDraft) return;
    try {
        const vendor = typeof selectedVendor !== 'undefined' ? selectedVendor : '';
        const style = document.getElementById("style-number")?.value?.trim() || '';
        const model = document.getElementById("model-name")?.value?.trim() || '';
        const styleInputBox = document.getElementById("style-number-input")?.value?.trim() || '';
        const items = Array.isArray(inspectionItems) ? inspectionItems : [];
        const matType = typeof selectedMaterialType !== 'undefined' ? selectedMaterialType : '';
        const incomingDate = tanggalIncomingInput ? tanggalIncomingInput.value : '';
        const inspLocation = document.getElementById('inspection-location')?.value || '';
        const leader = document.getElementById('approved-by-leader')?.value || '';

        // Cek apakah ada konten apa pun yang sudah diisi user
        const hasAnyContent = Boolean(
            vendor ||
            style ||
            model ||
            styleInputBox ||
            (selectedStyles && selectedStyles.length > 0) ||
            items.length > 0 ||
            matType ||
            (selectedInspectionDates && selectedInspectionDates.length > 1) ||
            (selectedBucketDates && selectedBucketDates.length > 1) ||
            leader ||
            editingSessionId
        );

        // Jika form kosong belum diisi apa pun oleh user, jangan lakukan apa-apa (JANGAN hapus draf!)
        if (!hasAnyContent) {
            return;
        }

        const draftData = {
            auditor: auditorSelect ? auditorSelect.value : '',
            modelName: model,
            styleNumber: style,
            styleInputBox: styleInputBox,
            selectedStyles: Array.isArray(selectedStyles) ? [...selectedStyles] : [],
            tanggalIncoming: incomingDate,
            tanggalInspection: tanggalInspectionInput ? tanggalInspectionInput.value : '',
            selectedInspectionDates: Array.isArray(selectedInspectionDates) ? [...selectedInspectionDates] : [],
            tanggalBucket: tanggalBucketInput ? tanggalBucketInput.value : '',
            selectedBucketDates: Array.isArray(selectedBucketDates) ? [...selectedBucketDates] : [],
            materialType: matType,
            vendor: vendor,
            inspectionLocation: inspLocation || 'In-House Inspection',
            status: document.getElementById('inspection-status')?.value || 'Done',
            approvedByLeader: leader,
            editingSessionId: editingSessionId || null,
            inspectionItems: items,
            savedAt: new Date().toISOString()
        };

        const key = getDraftStorageKey();
        localStorage.setItem(key, JSON.stringify(draftData));
        localStorage.setItem(STORAGE_KEYS.FORM_DATA, JSON.stringify(draftData));
    } catch (error) {
        console.error("Error saat menyimpan data draf ke localStorage:", error);
    }
}

function clearDraftStorage(hideBanner = true) {
    try {
        const key = getDraftStorageKey();
        localStorage.removeItem(key);
        localStorage.removeItem(STORAGE_KEYS.FORM_DATA);
        localStorage.removeItem(STORAGE_KEYS.DEFECT_COUNTS);
        localStorage.removeItem(STORAGE_KEYS.QTY_OUTPUTS);
        localStorage.removeItem(STORAGE_KEYS.STATE_VARIABLES);
        if (hideBanner) {
            const banner = document.getElementById('draft-restore-banner');
            if (banner) {
                banner.innerHTML = '';
                banner.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error("Error clearing draft storage:", e);
    }
}

function applyDraftToForm(draft) {
    if (!draft) return;
    isRestoringDraft = true;
    try {
        editingSessionId = draft.editingSessionId || null;

        if (draft.materialType) {
            selectedMaterialType = draft.materialType;
            const mtEl = document.getElementById('material-type');
            if (mtEl) mtEl.value = selectedMaterialType;
        }
        renderVendorButtons();

        if (draft.vendor) {
            selectedVendor = draft.vendor;
            refreshVendorButtons();
            if (addItemBtn) addItemBtn.disabled = false;
        }

        if (draft.tanggalIncoming) {
            const tinEl = document.getElementById('tanggal-incoming');
            if (tinEl) tinEl.value = draft.tanggalIncoming;
        }

        if (Array.isArray(draft.selectedInspectionDates) && draft.selectedInspectionDates.length) {
            window.setInspectionDates(draft.selectedInspectionDates, true);
        } else if (draft.tanggalInspection) {
            window.setInspectionDates(draft.tanggalInspection, true);
        }

        if (Array.isArray(draft.selectedBucketDates) && draft.selectedBucketDates.length) {
            window.setBucketDates(draft.selectedBucketDates, true);
        } else if (draft.tanggalBucket) {
            window.setBucketDates(draft.tanggalBucket, true);
        }

        if (Array.isArray(draft.selectedStyles) && draft.selectedStyles.length > 0) {
            window.setStyles(draft.selectedStyles, draft.modelName, true);
        } else if (draft.styleNumber) {
            window.setStyles(draft.styleNumber, draft.modelName, true);
        } else {
            window.setStyles([], '', true);
        }

        if (draft.styleInputBox) {
            const sInput = document.getElementById('style-number-input');
            if (sInput && !sInput.value) {
                sInput.value = draft.styleInputBox;
                if (typeof updateStyleInputPreview === 'function') {
                    updateStyleInputPreview(draft.styleInputBox);
                }
            }
        }

        if (draft.inspectionLocation) {
            const locEl = document.getElementById('inspection-location');
            if (locEl) locEl.value = draft.inspectionLocation;
        }

        if (draft.status && typeof window.__syncInspectionStatusState === 'function') {
            window.__syncInspectionStatusState(draft.status);
        }

        if (draft.approvedByLeader) {
            const lEl = document.getElementById('approved-by-leader');
            if (lEl) lEl.value = draft.approvedByLeader;
            const lMob = document.getElementById('approved-by-leader-mobile');
            if (lMob) lMob.value = draft.approvedByLeader;
            const dCont = document.getElementById('evidence-upload-container');
            if (dCont) dCont.classList.remove('hidden');
            const mCont = document.getElementById('evidence-upload-container-mobile');
            if (mCont) mCont.classList.remove('hidden');
        }

        if (Array.isArray(draft.inspectionItems) && draft.inspectionItems.length > 0) {
            inspectionItems = draft.inspectionItems.map(it => ({
                component: it.component,
                process: it.process || '',
                qtyIncoming: Number(it.qtyIncoming || 0),
                qtyInspect: Number(it.qtyInspect || 0),
                pass: Number(it.pass || 0),
                defect: Number(it.defect || 0),
                defects: Array.isArray(it.defects) ? [...it.defects] : []
            }));
        }

        renderInspectedItems();
        updateTotalQtyInspect();
        checkInfoCompleteAndLockButtons();
        updateSaveButtonState();
    } finally {
        isRestoringDraft = false;
    }
}

function checkAndRestoreDraft() {
    try {
        const key = getDraftStorageKey();
        const raw = localStorage.getItem(key) || localStorage.getItem(STORAGE_KEYS.FORM_DATA);
        if (!raw) return;

        const draft = JSON.parse(raw);
        if (!draft) return;

        const hasItems = Array.isArray(draft.inspectionItems) && draft.inspectionItems.length > 0;
        const hasStyles = Array.isArray(draft.selectedStyles) && draft.selectedStyles.length > 0;
        const hasContent = Boolean(draft.vendor || draft.styleNumber || draft.modelName || draft.materialType || draft.styleInputBox || hasItems || hasStyles);
        if (!hasContent) return;

        // Auto-apply draft to form so inspector does not start from zero
        applyDraftToForm(draft);

        // Show draft notification banner
        const banner = document.getElementById('draft-restore-banner');
        if (banner) {
            const timeStr = draft.savedAt ? formatDraftTime(draft.savedAt) : 'sesi sebelumnya';
            const vendorName = draft.vendor || '—';
            const modelName = draft.modelName || draft.styleNumber || '—';
            const itemCount = draft.inspectionItems?.length || 0;

            banner.innerHTML = `
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                            <span class="material-symbols-outlined text-xl">history</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 rounded shadow-xs">Draf Tersimpan Dipulihkan</span>
                                <span class="text-[11px] text-slate-400 font-medium">${timeStr}</span>
                            </div>
                            <p class="text-xs text-slate-200 font-medium mt-1">
                                <strong class="text-white font-semibold">${vendorName}</strong> • <span class="text-slate-300">${modelName}</span> • <span class="text-emerald-400 font-bold">${itemCount} item inspeksi</span>
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-center">
                        <button type="button" onclick="window.discardDraft()" class="px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">delete</span>
                            Buang Draf
                        </button>
                    </div>
                </div>
            `;
            banner.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Error checking and restoring draft:", e);
    }
}

window.discardDraft = async function () {
    const yes = await showConfirm('Draf inspeksi yang belum disimpan akan dibuang dan form dikosongkan.', 'Buang Draf?', 'Ya, Buang Draf', 'Batal');
    if (yes) {
        clearDraftStorage(true);
        resetAllFields();
        showAlert('Draf inspeksi berhasil dibuang.', 'info', 'Draf Dihapus');
    }
};

window.restoreDraft = function () {
    const key = getDraftStorageKey();
    const raw = localStorage.getItem(key) || localStorage.getItem(STORAGE_KEYS.FORM_DATA);
    if (raw) {
        applyDraftToForm(JSON.parse(raw));
        showAlert('Draf inspeksi berhasil dipulihkan.', 'success', 'Draf Dipulihkan');
    }
};

function updateAllDisplays() {
    // Update counter grade
    for (const grade in qtyInspectOutputs) {
        if (outputElements[grade]) {
            outputElements[grade].textContent = qtyInspectOutputs[grade];
        }
    }
    // Update summary dan statistik utama
    updateDefectSummaryDisplay();
    updateTotalQtyInspect();
}

function clearLocalStorageExceptQtySampleSet() {
    try {
        clearDraftStorage(true);
    } catch (error) {
        console.error("Error saat membersihkan localStorage:", error);
    }
}

/** Hapus semua form storage termasuk qtySampleSet. Dipanggil saat refresh/logout. */
function clearAllFormStorage() {
    try {
        clearDraftStorage(true);
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    } catch (error) {
        console.error("Error saat membersihkan semua form storage:", error);
    }
}

// ===========================================
// 3. Fungsi Pembantu: Mengatur Status Tombol
// ===========================================
function toggleButtonGroup(buttons, enable) {
    buttons.forEach(button => {
        button.disabled = !enable;
        button.classList.toggle('inactive', !enable);
        if (!enable) button.classList.remove('active');
    });
}

// ===========================================
// FUNGSI BARU: Update Save Button (≥10% Qty Incoming)
// ===========================================
function updateSaveButtonState() {
    const saveButtons = document.querySelectorAll('.save-button');
    const ready = isInfoComplete();
    saveButtons.forEach(btn => {
        btn.disabled = !ready;
        btn.classList.toggle('opacity-50', !ready);
        btn.classList.toggle('cursor-not-allowed', !ready);
    });
    const hints = document.querySelectorAll('.save-progress-hint');
    hints.forEach(hint => {
        hint.textContent = `Total item inspeksi: ${inspectionItems.length}`;
        hint.classList.toggle('hidden', !ready);
    });
}

// ===========================================
// FUNGSI BARU: Mengontrol Status Tombol Pass
// ===========================================
function updateAGradeButtonState() {
    const passButton = Array.from(gradeInputButtons).find(btn => btn.classList.contains('pass'));
    if (!passButton) return;
    const shouldBeDisabled = selectedDefects.length > 0 || currentInspectionPairs.length > 0;
    passButton.disabled = shouldBeDisabled;
    passButton.classList.toggle('inactive', shouldBeDisabled);
}

// ===========================================
// FUNGSI BARU: Mengatur Status Tombol Berdasarkan Qty Sample Set Limit
// ===========================================
function updateButtonStatesBasedOnLimit() {
    initButtonStates();
}

// ===========================================
// 4. Fungsi Utama: Inisialisasi Status Tombol
// ===========================================
function initButtonStates() {
    if (!defectButtons) return;
    const complete = isInfoComplete();
    toggleButtonGroup(defectButtons, complete);
    syncDefectButtonActiveStates();
}

// ===========================================
// 5. Update Qty Counters (removed L/R/P — kept for FTT calc via reworkLog)
// ===========================================

// ===========================================
// 6. Update FTT dan Redo Rate (MODIFIKASI FINAL v2)
// ===========================================
function updateFTT() {
    if (!fttOutput) return;
    const passCount = qtyInspectOutputs['pass'] || 0;
    const fttValue = totalInspected > 0 ? (passCount / totalInspected) * 100 : 0;
    fttOutput.textContent = `${fttValue.toFixed(2)}%`;
    if (fttValue >= 92) {
        fttOutput.className = 'counter high-ftt';
    } else if (fttValue >= 80) {
        fttOutput.className = 'counter medium-ftt';
    } else {
        fttOutput.className = 'counter low-ftt';
    }
}

function updateRedoRate() {
    if (!redoRateOutput) return;
    const defectCount = qtyInspectOutputs['defect'] || 0;
    const redoRateValue = totalInspected !== 0 ? (defectCount / totalInspected) * 100 : 0;
    redoRateOutput.textContent = `${redoRateValue.toFixed(2)}%`;
}

// ===========================================
// FUNGSI PEMBANTU BARU: Memproses & Memisahkan Tipe Rework (REVISI TOTAL)
// ===========================================
function getProcessedReworkCounts() {
    const finalReworkPairs = reworkLog.length;
    return {
        finalReworkPairs,
        finalReworkKiri: 0,
        finalReworkKanan: 0,
        calculatedTotal: finalReworkPairs
    };
}

// ===========================================
// 7. Update Total Qty Inspect (termasuk FTT dan Redo Rate)
// ===========================================
function updateTotalQtyInspect(isManualPassChange = false) {
    let totalPass = 0;
    let totalDefect = 0;
    let totalInspect = 0;

    // Aggregation
    defectCounts = {};
    inspectionItems.forEach(item => {
        totalPass += item.pass || 0;
        totalDefect += item.defect || 0;
        totalInspect += item.qtyInspect || 0;

        if (Array.isArray(item.defects)) {
            item.defects.forEach(d => {
                const type = d.type;
                if (!defectCounts[type]) {
                    defectCounts[type] = {
                        'PAIRS': {
                            'defect': 0
                        }
                    };
                }
                defectCounts[type]['PAIRS']['defect'] += d.count || 0;
            });
        }
    });

    qtyInspectOutputs['pass'] = totalPass;
    qtyInspectOutputs['defect'] = totalDefect;
    totalInspected = totalInspect;

    const passDisplay = document.getElementById('pass-counter');
    if (passDisplay) {
        passDisplay.textContent = totalPass;
    }

    const defectDisplay = document.getElementById('defect-counter');
    if (defectDisplay) {
        defectDisplay.textContent = totalDefect;
    }

    if (qtyInspectOutput) {
        qtyInspectOutput.textContent = totalInspected;
    }

    updateFTT();
    updateRedoRate();
    updateDefectSummaryDisplay();
    saveToLocalStorage();
    updateSaveButtonState();
}

// ===========================================
// 8. Menampilkan Summary Defect dan Event Handlers
// ===========================================

function syncDefectButtonActiveStates() {
    if (!defectButtons) return;
    defectButtons.forEach(button => {
        const defectType = button.dataset.defect || button.textContent.trim();
        const hasDefect = defectCounts[defectType] &&
            defectCounts[defectType]['PAIRS'] &&
            defectCounts[defectType]['PAIRS']['defect'] > 0;
        button.classList.toggle('active', hasDefect);
    });
}

window.__updateDefectCount = function (defectType, position, grade, newValue) {
    const val = parseInt(newValue, 10);
    if (isNaN(val) || val < 1) {
        defectCounts[defectType][position][grade] = 1;
    } else {
        defectCounts[defectType][position][grade] = val;
    }
    saveToLocalStorage();
    updateTotalQtyInspect();
};

window.__removeDefect = function (defectType, position, grade) {
    if (defectCounts[defectType] && defectCounts[defectType][position]) {
        delete defectCounts[defectType][position][grade];
        if (Object.keys(defectCounts[defectType][position]).length === 0) {
            delete defectCounts[defectType][position];
        }
        if (Object.keys(defectCounts[defectType]).length === 0) {
            delete defectCounts[defectType];
        }
    }
    saveToLocalStorage();
    updateTotalQtyInspect();
    updateDefectSummaryDisplay();
};

function updateDefectSummaryDisplay() {
    if (!summaryContainer) return;

    summaryContainer.innerHTML = '';
    const gradeOrder = ['defect'];
    const positionOrder = ['LEFT', 'PAIRS', 'RIGHT'];

    const summaryItems = [];

    for (const defectType in defectCounts) {
        for (const position of positionOrder) {
            if (defectCounts[defectType] && defectCounts[defectType][position]) {
                for (const displayGrade of gradeOrder) {
                    if (defectCounts[defectType][position][displayGrade] && defectCounts[defectType][position][displayGrade] > 0) {
                        const count = defectCounts[defectType][position][displayGrade];
                        const item = document.createElement('div');
                        item.className = 'summary-item flex items-center justify-between p-3 border-b border-slate-100 gap-3';
                        item.innerHTML = `
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-semibold text-slate-800 break-words">${defectType}</p>
                                <p class="text-xs text-slate-400 font-medium">${position}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <div class="px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-800 text-sm text-center min-w-[50px]">
                                    ${count}
                                </div>
                            </div>
                        `;
                        summaryItems.push({
                            defectType,
                            grade: displayGrade,
                            position,
                            element: item
                        });
                    }
                }
            }
        }
    }

    summaryItems.sort((a, b) => {
        if (a.defectType < b.defectType) return -1;
        if (a.defectType > b.defectType) return 1;
        return positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position);
    });

    summaryItems.forEach(itemData => {
        summaryContainer.appendChild(itemData.element);
    });
}

function handleDefectClick(button) {
    const defectType = button.dataset.defect || button.textContent.trim();
    const position = 'PAIRS';
    const grade = 'defect';

    if (!defectCounts[defectType]) {
        defectCounts[defectType] = {};
    }
    if (!defectCounts[defectType][position]) {
        defectCounts[defectType][position] = {};
    }

    if (defectCounts[defectType][position][grade]) {
        // Jika sudah ada, hapus (fungsi toggle)
        delete defectCounts[defectType][position][grade];
        if (Object.keys(defectCounts[defectType][position]).length === 0) {
            delete defectCounts[defectType][position];
        }
        if (Object.keys(defectCounts[defectType]).length === 0) {
            delete defectCounts[defectType];
        }
    } else {
        // Jika belum ada, tambahkan dengan jumlah default 1
        defectCounts[defectType][position][grade] = 1;
    }

    saveToLocalStorage();
    updateTotalQtyInspect();
    updateDefectSummaryDisplay();
}

function handleGradeClick(button) {
    const gradeCategory = Array.from(button.classList).find(cls => cls === 'pass' || cls === 'defect');
    if (!gradeCategory) return;

    processGradeClick(button, gradeCategory);
}

// --- FUNGSI PEMBANTU: Memproses klik grade setelah konfirmasi ---
function processGradeClick(button, gradeCategory) {
    if (gradeCategory === 'defect' && selectedDefects.length > 0) {
        selectedDefects.forEach(defectName => {
            currentInspectionPairs.push({ type: defectName, position: 'PAIRS' });
        });
    }

    qtyInspectOutputs[gradeCategory]++;

    updateAllDisplays();

    if (gradeCategory === 'defect') {
        addAllDefectsToSummary(gradeCategory);
    }

    updateDefectSummaryDisplay();
    saveToLocalStorage();

    setTimeout(() => {
        initButtonStates();
    }, 150);
}

// --- FUNGSI BARU: Menampilkan Pop-up Konfirmasi ---
function showConfirmationPopup(grade, onConfirmCallback) {
    const confirmationText = `Apakah Anda menemukan defect ${grade.toUpperCase()}?`;

    const popupOverlay = document.createElement('div');
    popupOverlay.className = 'confirmation-overlay';

    const popupContent = document.createElement('div');
    popupContent.className = 'confirmation-content';

    const message = document.createElement('p');
    message.textContent = confirmationText;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'confirmation-buttons';

    const backButton = document.createElement('button');
    backButton.textContent = 'Kembali';
    backButton.className = 'button-back';

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'YA';
    confirmButton.className = 'button-confirm';

    buttonContainer.appendChild(backButton);
    buttonContainer.appendChild(confirmButton);

    popupContent.appendChild(message);
    popupContent.appendChild(buttonContainer);
    popupOverlay.appendChild(popupContent);

    document.body.appendChild(popupOverlay);

    backButton.addEventListener('click', () => {
        document.body.removeChild(popupOverlay);
        console.log("Aksi dibatalkan oleh pengguna.");
    });

    confirmButton.addEventListener('click', () => {
        document.body.removeChild(popupOverlay);
        onConfirmCallback();
    });
}

async function compressImageFile(file, maxWidth = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
        if (!file.type || !file.type.startsWith('image/') || file.type.includes('gif') || file.type.includes('svg')) {
            const reader = new FileReader();
            reader.onload = () => resolve({
                base64: reader.result.split(',')[1],
                type: file.type || 'image/png',
                ext: file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'png'
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
            return;
        }

        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > maxWidth || h > maxWidth) {
                    if (w > h) {
                        h = Math.round((h * maxWidth) / w);
                        w = maxWidth;
                    } else {
                        w = Math.round((w * maxWidth) / h);
                        h = maxWidth;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve({
                    base64: dataUrl.split(',')[1],
                    type: 'image/jpeg',
                    ext: 'jpg'
                });
            };
            img.onerror = () => {
                resolve({
                    base64: e.target.result.split(',')[1],
                    type: file.type || 'image/png',
                    ext: file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'png'
                });
            };
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===========================================
// 11. Validasi Input dan Simpan Data (MODIFIKASI FINAL v3 - dengan Lazy Loading)
// ===========================================
async function saveData() {
    console.log("Memulai proses simpan data...");

    const loadingOverlay = document.getElementById('loading-overlay');

    if (!validateInputs() || !validateQtySampleSet()) {
        console.log("Validasi dasar gagal. Penyimpanan dibatalkan.");
        return;
    }

    // Leader and file evidence validation
    const leaderSelect = document.getElementById('approved-by-leader');
    const fileInput = document.getElementById('evidence-file');
    let fileData = null;
    let fileName = '';
    let fileType = '';

    if (leaderSelect && leaderSelect.value) {
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            showAlert('Harap upload evidence / bukti persetujuan leader.', 'warning', 'Evidence Wajib');
            return;
        }
        const file = fileInput.files[0];
        if (loadingOverlay) {
            loadingOverlay.classList.add('visible');
        }
        try {
            const compressed = await compressImageFile(file);
            fileData = compressed.base64;
            fileType = compressed.type;
            const sanitize = (str) => String(str || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25);
            const ext = compressed.ext || 'jpg';
            const vName = sanitize(selectedVendor) || 'VENDOR';
            const mName = sanitize(document.getElementById("model-name")?.value) || 'MODEL';
            const sName = sanitize(document.getElementById("style-number")?.value) || 'STYLE';
            const nowStr = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
            fileName = `EVIDENCE_${vName}_${mName}_${sName}_${nowStr}.${ext}`;
        } catch (err) {
            if (loadingOverlay) {
                loadingOverlay.classList.remove('visible');
            }
            showAlert('Gagal memproses file evidence. Coba file lain.', 'error');
            return;
        }
    }

    const fttValueText = fttOutput ? fttOutput.innerText.replace("%", "").trim() : "0";
    const finalFtt = parseFloat(fttValueText) / 100;

    const redoRateValueText = redoRateOutput ? redoRateOutput.innerText.replace("%", "").trim() : "0";
    const finalRedoRate = parseFloat(redoRateValueText) / 100;

    const dataToSend = {
        sessionId: editingSessionId || undefined,
        timestamp: new Date().toISOString(),
        auditor: document.getElementById("auditor").value,
        tanggalIncoming: document.getElementById("tanggal-incoming") ? document.getElementById("tanggal-incoming").value : '',
        tanggalInspection: document.getElementById("tanggal-inspection") ? document.getElementById("tanggal-inspection").value : '',
        tanggalBucket: document.getElementById("tanggal-bucket") ? document.getElementById("tanggal-bucket").value : '',
        materialType: selectedMaterialType || '',
        vendor: selectedVendor,
        component: inspectionItems.map(item => item.component).join(', '),
        process: inspectionItems.map(item => item.process).join(', '),
        modelName: document.getElementById("model-name").value,
        styleNumber: document.getElementById("style-number").value,
        qtyIncoming: inspectionItems.reduce((sum, item) => sum + (item.qtyIncoming || 0), 0),
        qtyInspect: totalInspected,
        ftt: finalFtt,
        redoRate: finalRedoRate,
        "pass": qtyInspectOutputs['pass'],
        "defect": qtyInspectOutputs['defect'],
        approvedByLeader: leaderSelect ? leaderSelect.value : '',
        inspectionLocation: document.getElementById('inspection-location')?.value || 'In-House Inspection',
        status: document.getElementById('inspection-status')?.value || 'Done',
        file_data: fileData,
        file_name: fileName,
        file_type: fileType,
        items: inspectionItems
    };

    console.log("Data yang akan dikirim (setelah diproses):", JSON.stringify(dataToSend, null, 2));

    const saveButtons = document.querySelectorAll(".save-button");
    saveButtons.forEach(btn => {
        btn.disabled = true;
        btn.textContent = "MENYIMPAN...";
    });

    if (loadingOverlay) {
        loadingOverlay.classList.add('visible');
    }

    try {
        // ── UI TESTING MODE: Skip POST ke GAS, simulasikan respons sukses ──
        if (UI_TEST_MODE) {
            console.log("[TEST MODE] Data yang akan dikirim:", JSON.stringify(dataToSend, null, 2));
            if (editingSessionId) {
                const idx = allInspectionSessions.findIndex(s => String(s.sessionId) === String(editingSessionId));
                if (idx !== -1) {
                    allInspectionSessions[idx] = {
                        ...allInspectionSessions[idx],
                        tanggalIncoming: dataToSend.tanggalIncoming,
                        tanggalInspection: dataToSend.tanggalInspection,
                        tanggalBucket: dataToSend.tanggalBucket,
                        materialType: dataToSend.materialType,
                        vendor: dataToSend.vendor,
                        styleNumber: dataToSend.styleNumber,
                        modelName: dataToSend.modelName,
                        approvedByLeader: dataToSend.approvedByLeader,
                        status: dataToSend.status,
                        items: dataToSend.items
                    };
                }
            } else {
                allInspectionSessions.unshift({
                    sessionId: dataToSend.sessionId || (`SESS-${Date.now()}`),
                    timestamp: dataToSend.timestamp,
                    tanggalIncoming: dataToSend.tanggalIncoming,
                    tanggalInspection: dataToSend.tanggalInspection,
                    tanggalBucket: dataToSend.tanggalBucket,
                    materialType: dataToSend.materialType,
                    vendor: dataToSend.vendor,
                    component: dataToSend.component,
                    process: dataToSend.process,
                    styleNumber: dataToSend.styleNumber,
                    modelName: dataToSend.modelName,
                    qtyIncoming: dataToSend.qtyIncoming,
                    qtyInspect: dataToSend.qtyInspect,
                    pass: dataToSend.pass,
                    defect: dataToSend.defect,
                    ftt: dataToSend.ftt,
                    redoRate: dataToSend.redoRate,
                    auditor: dataToSend.auditor,
                    approvedByLeader: dataToSend.approvedByLeader,
                    status: dataToSend.status,
                    evidenceUrl: '',
                    items: dataToSend.items
                });
            }

            if (loadingOverlay) {
                loadingOverlay.classList.remove('visible');
            }

            await showAlert('Data berhasil disimpan! (simulasi — tidak ada data yang dikirim ke server)', 'success', '[TEST MODE]');

            resetAllFields();
            if (typeof window.loadInspectionResults === 'function') window.loadInspectionResults();
            return;
        }
        // ── Akhir UI TESTING MODE ──

        // Simpan foto evidence ke Google Drive via GAS micro-uploader jika ada
        let evidenceUrl = '';
        if (dataToSend.file_data && dataToSend.file_name) {
            try {
                const res = await fetch(GAS_EVIDENCE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'uploadEvidence',
                        file_data: dataToSend.file_data,
                        file_name: dataToSend.file_name,
                        file_type: dataToSend.file_type || 'image/jpeg'
                    })
                });
                if (res.ok) {
                    const resData = await res.json();
                    if (resData && resData.status === 'ok') {
                        evidenceUrl = resData.evidenceUrl || resData.directUrl || '';
                    }
                }
            } catch (errUp) {
                console.warn('Upload evidence ke Google Drive gagal:', errUp);
            }
        }

        const baseSessId = dataToSend.sessionId || (`SESS-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
        const isMultiItem = Array.isArray(dataToSend.items) && dataToSend.items.length > 1;

        const sessionRowsToInsert = [];
        const defectRowsToInsert = [];

        if (Array.isArray(dataToSend.items) && dataToSend.items.length > 0) {
            dataToSend.items.forEach((it, idx) => {
                const itemSessId = isMultiItem ? `${baseSessId}-${idx + 1}` : baseSessId;
                const qIn = Number(it.qtyIncoming) || 0;
                const qInsp = Number(it.qtyInspect) || 0;
                const qPass = Number(it.pass) || 0;
                const qDef = Number(it.defect) || 0;
                const itemFtt = qInsp > 0 ? (qPass / qInsp) : 0;
                const itemRedo = qInsp > 0 ? (qDef / qInsp) : 0;

                sessionRowsToInsert.push({
                    session_id: itemSessId,
                    timestamp: dataToSend.timestamp || new Date().toISOString(),
                    date: dataToSend.tanggalIncoming ? dataToSend.tanggalIncoming.substring(0, 10) : null,
                    material_type: dataToSend.materialType || '',
                    inspection_location: dataToSend.inspectionLocation || 'In-House Inspection',
                    user_login: dataToSend.auditor || '',
                    vendor: dataToSend.vendor || '',
                    component: it.component || dataToSend.component || '',
                    process: it.process || dataToSend.process || '',
                    style_number: dataToSend.styleNumber || '',
                    model: dataToSend.modelName || '',
                    qty_incoming: qIn,
                    qty_inspect: qInsp,
                    qty_pass: qPass,
                    qty_defect: qDef,
                    ftt: Number(itemFtt.toFixed(4)),
                    redo_rate: Number(itemRedo.toFixed(4)),
                    tanggal_insp: dataToSend.tanggalInspection ? dataToSend.tanggalInspection.trim() : new Date().toISOString().substring(0, 10),
                    bucket: dataToSend.tanggalBucket ? dataToSend.tanggalBucket.trim() : null,
                    approved_by: dataToSend.approvedByLeader || '',
                    evidence_url: evidenceUrl,
                    status: dataToSend.status || 'Done',
                    updated_at: new Date().toISOString()
                });

                if (Array.isArray(it.defects) && it.defects.length > 0) {
                    it.defects.forEach(d => {
                        const cnt = Number(d.count || d.qty || 1);
                        const defectName = d.type || d.defectType || d.issue_finding || d.name || '';
                        if (cnt > 0 && defectName) {
                            defectRowsToInsert.push({
                                session_id: itemSessId,
                                date: dataToSend.tanggalInspection ? dataToSend.tanggalInspection.trim() : new Date().toISOString().substring(0, 10),
                                vendor: dataToSend.vendor || '',
                                component: it.component || '',
                                issue_finding: defectName,
                                count: cnt
                            });
                        }
                    });
                } else if (qDef > 0) {
                    defectRowsToInsert.push({
                                session_id: itemSessId,
                                date: dataToSend.tanggalInspection ? dataToSend.tanggalInspection.trim() : new Date().toISOString().substring(0, 10),
                                vendor: dataToSend.vendor || '',
                                component: it.component || '',
                                issue_finding: 'DEFECT GENERAL',
                                count: qDef
                    });
                }
            });
        } else {
            sessionRowsToInsert.push({
                session_id: baseSessId,
                timestamp: dataToSend.timestamp || new Date().toISOString(),
                date: dataToSend.tanggalIncoming ? dataToSend.tanggalIncoming.substring(0, 10) : null,
                material_type: dataToSend.materialType || '',
                inspection_location: dataToSend.inspectionLocation || 'In-House Inspection',
                user_login: dataToSend.auditor || '',
                vendor: dataToSend.vendor || '',
                component: dataToSend.component || '',
                process: dataToSend.process || '',
                style_number: dataToSend.styleNumber || '',
                model: dataToSend.modelName || '',
                qty_incoming: Number(dataToSend.qtyIncoming) || 0,
                qty_inspect: Number(dataToSend.qtyInspect) || 0,
                qty_pass: Number(dataToSend.pass) || 0,
                qty_defect: Number(dataToSend.defect) || 0,
                ftt: Number(dataToSend.ftt) || 0,
                redo_rate: Number(dataToSend.redoRate) || 0,
                tanggal_insp: dataToSend.tanggalInspection ? dataToSend.tanggalInspection.trim() : new Date().toISOString().substring(0, 10),
                bucket: dataToSend.tanggalBucket ? dataToSend.tanggalBucket.trim() : null,
                approved_by: dataToSend.approvedByLeader || '',
                evidence_url: evidenceUrl,
                status: dataToSend.status || 'Done',
                updated_at: new Date().toISOString()
            });
        }

        // Upsert all component rows
        for (const row of sessionRowsToInsert) {
            const { error: insErr } = await supabase.from('subcont_inspections').upsert(row, { onConflict: 'session_id' });
            if (insErr) {
                if (insErr.message && insErr.message.includes('invalid input syntax for type date')) {
                    throw new Error("Tipe kolom 'tanggal_insp', 'bucket', atau 'date' di database Supabase masih DATE. Jalankan migration_inspection_date_type.sql di Supabase SQL Editor agar bisa menyimpan >1 tanggal:\n\nALTER TABLE public.subcont_inspections ALTER COLUMN tanggal_insp TYPE TEXT USING tanggal_insp::TEXT;\nALTER TABLE public.subcont_inspections ALTER COLUMN bucket TYPE TEXT USING bucket::TEXT;\nALTER TABLE public.subcont_defect_logs ALTER COLUMN date TYPE TEXT USING date::TEXT;");
                }
                throw new Error(insErr.message);
            }
        }

        // Simpan defect details
        if (defectRowsToInsert.length > 0) {
            for (const row of sessionRowsToInsert) {
                await supabase.from('subcont_defect_logs').delete().eq('session_id', row.session_id);
            }
            const { error: defErr } = await supabase.from('subcont_defect_logs').insert(defectRowsToInsert);
            if (defErr) console.warn('Gagal insert defect logs:', defErr.message);
        }

        await showAlert('Data inspeksi berhasil disimpan!', 'success', 'Tersimpan!');
        resetAllFields();
        if (typeof window.loadInspectionResults === 'function') window.loadInspectionResults();
        if (typeof window.loadSubcontInspectionLog === 'function') window.loadSubcontInspectionLog();
    } catch (error) {
        console.error("Error saat mengirim data:", error);
        const errMsg = error.message || 'Terjadi kesalahan saat menyimpan data. Periksa koneksi internet.';
        await showAlert(errMsg, 'error', 'Gagal Menyimpan Data');
    } finally {
        if (loadingOverlay) {
            loadingOverlay.classList.remove('visible');
        }

        saveButtons.forEach(btn => {
            btn.textContent = "SIMPAN";
        });
        updateSaveButtonState();
    }
}

// ===========================================
// 12. Validasi Input Form (dari dokumen kedua)
// ===========================================
function validateInputs() {
    const auditor = auditorSelect.value.trim();
    const modelName = document.getElementById("model-name").value.trim();
    const styleNumberInput = document.getElementById("style-number");
    const styleNumber = styleNumberInput.value.trim();
    const tanggalIncoming = tanggalIncomingInput ? tanggalIncomingInput.value.trim() : '';

    if (!auditor) {
        showAlert('Harap login terlebih dahulu sebelum menyimpan data.', 'warning', 'Belum Login');
        return false;
    }
    if (!tanggalIncoming) {
        showAlert('Harap isi Tanggal Incoming sebelum menyimpan data.', 'warning', 'Data Tidak Lengkap');
        return false;
    }
    if (!selectedVendor) {
        showAlert('Harap pilih Vendor sebelum menyimpan data.', 'warning', 'Data Tidak Lengkap');
        return false;
    }
    if (!inspectionItems.length) {
        showAlert('Harap tambahkan minimal 1 Item Inspeksi sebelum menyimpan data.', 'warning', 'Data Tidak Lengkap');
        return false;
    }
    if ((!selectedStyles || !selectedStyles.length) && !styleNumber) {
        showAlert('Harap isi Style Number dan Model Name sebelum menyimpan data.', 'warning', 'Data Tidak Lengkap');
        return false;
    }

    const styleNumberPattern = /^[a-zA-Z0-9]{6}-[a-zA-Z0-9]{3}$/;
    const stylesToCheck = (selectedStyles && selectedStyles.length > 0)
        ? selectedStyles.map(s => s.style)
        : styleNumber.split(',').map(s => s.trim()).filter(Boolean);

    for (const st of stylesToCheck) {
        if (!styleNumberPattern.test(st)) {
            showAlert(`Format Style Number "${st}" tidak sesuai. Contoh: AH1567-100 atau 767688-001`, 'warning', 'Format Tidak Valid');
            const styleInputEl = document.getElementById('style-number-input');
            if (styleInputEl) styleInputEl.classList.add('invalid-input');
            return false;
        }
    }
    const styleInputEl = document.getElementById('style-number-input');
    if (styleInputEl) styleInputEl.classList.remove('invalid-input');
    if (styleNumberInput) styleNumberInput.classList.remove('invalid-input');
    return true;
}

// ===========================================
// 13. Validasi Defect sebelum Simpan
// ===========================================
function validateDefects() {
    const hasDefectRecorded = Object.values(defectCounts).some(positions =>
        Object.values(positions).some(grades =>
            Object.values(grades).some(count => count > 0)
        )
    );

    const hasDefectGradeInput = qtyInspectOutputs['defect'] > 0;

    if (hasDefectGradeInput && !hasDefectRecorded) {
        showAlert('Jika ada item Defect, harap pastikan setidaknya ada satu defect yang tercatat sebelum menyimpan data.', 'warning', 'Defect Belum Dicatat');
        return false;
    }
    return true;
}

// ===========================================
// 14. Validasi Qty Sample Set
// ===========================================
function validateQtySampleSet() {
    if (inspectionItems.length === 0) {
        showAlert('Harap tambahkan minimal 1 Item Inspeksi sebelum menyimpan data.', 'warning', 'Data Tidak Lengkap');
        return false;
    }
    for (const item of inspectionItems) {
        if (item.qtyIncoming <= 0 || item.qtyInspect <= 0) {
            showAlert(`Item ${item.component} - ${item.process} memiliki Qty Incoming atau Qty Inspect yang tidak valid (harus lebih dari 0).`, 'warning', 'Data Tidak Valid');
            return false;
        }
    }
    return true;
}

// ===========================================
// 15. Reset Semua Field Setelah Simpan (Modifikasi)
// ===========================================
// ===========================================
// MULTI-ITEM INSPECTION LOGIC (TAMBAHAN)
// ===========================================

function renderInspectedItems() {
    const tbody = document.getElementById('inspected-items-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (inspectionItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-3 py-4 text-center text-slate-400 italic">Belum ada item inspeksi. Silakan pilih Vendor lalu klik "Tambah Item".</td>
            </tr>
        `;
        return;
    }

    inspectionItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-150 hover:bg-slate-100/50 transition-colors';
        tr.innerHTML = `
            <td class="px-3 py-2.5 font-medium text-slate-800">${item.component}</td>
            <td class="px-3 py-2.5 text-slate-600">${item.process}</td>
            <td class="px-3 py-2.5 text-right font-semibold text-slate-800">${item.qtyInspect}</td>
            <td class="px-3 py-2.5 text-right font-semibold text-red-600">${item.defect}</td>
            <td class="px-3 py-2.5 text-center flex items-center justify-center gap-1.5">
                <button type="button" class="edit-item-btn p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer" data-index="${index}">
                    <span class="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button type="button" class="delete-item-btn p-1 text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer" data-index="${index}">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
            </td>
        `;

        tr.querySelector('.edit-item-btn').addEventListener('click', () => {
            openInspectionItemModal(index);
        });

        tr.querySelector('.delete-item-btn').addEventListener('click', async () => {
            const yes = await showConfirm(`Apakah Anda yakin ingin menghapus item inspeksi ${item.component} - ${item.process}?`, 'Hapus Item', 'Ya, Hapus', 'Batal');
            if (yes) {
                inspectionItems.splice(index, 1);
                renderInspectedItems();
                updateTotalQtyInspect();
                checkInfoCompleteAndLockButtons();
                saveToLocalStorage();
            }
        });

        tbody.appendChild(tr);
    });
}

const MODAL_DEFECT_CATEGORY_STYLES = {
    minor:    { bg: 'bg-blue-50',   hover: 'hover:bg-blue-100',   border: 'border-blue-200',   text: 'text-blue-800'   },
    major:    { bg: 'bg-amber-50',  hover: 'hover:bg-amber-100',  border: 'border-amber-200',  text: 'text-amber-800'  },
    critical: { bg: 'bg-red-50',    hover: 'hover:bg-red-100',    border: 'border-red-200',    text: 'text-red-800'    },
};

function renderEnhancedModalDefectButtons() {
    const container = document.getElementById('modal-defect-buttons');
    if (!container) return;
    container.innerHTML = '';

    const defects = getDefects();
    const query = (modalDefectSearchQuery || '').toLowerCase().trim();
    const category = modalDefectActiveCategory || 'all';

    const filtered = defects.filter(d => {
        const cat = d.category || 'minor';
        if (category !== 'all' && cat !== category) return false;
        if (query) {
            const nameMatch = (d.name || '').toLowerCase().includes(query);
            const labelMatch = (d.label || '').toLowerCase().includes(query);
            if (!nameMatch && !labelMatch) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="col-span-2 sm:col-span-3 text-center py-6 text-xs text-slate-400 italic">Tidak ada defect yang cocok dengan filter / pencarian.</div>';
        return;
    }

    const activeComp = modalInspectionMode === 'bulk' ? modalActiveDefectComponent : null;
    const currentDefectsMap = (modalInspectionMode === 'bulk' && activeComp)
        ? (modalComponentDefects[activeComp] || {})
        : modalItemDefects;

    filtered.forEach(d => {
        const cat = d.category || 'minor';
        const s = MODAL_DEFECT_CATEGORY_STYLES[cat] || MODAL_DEFECT_CATEGORY_STYLES.minor;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `defect-button relative ${s.bg} ${s.hover} border ${s.border} rounded-lg p-2 text-center text-xs font-medium ${s.text} transition-all h-14 flex items-center justify-center leading-tight cursor-pointer select-none`;
        btn.dataset.defect = d.name;

        const count = currentDefectsMap[d.name] || 0;
        let badgeHtml = '';
        if (count > 0) {
            badgeHtml = `<span class="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center shadow-md border-2 border-white pointer-events-none">${count}</span>`;
        }

        btn.innerHTML = `<span class="line-clamp-2">${d.label || d.name}</span>${badgeHtml}`;

        btn.addEventListener('click', () => {
            window.handleModalDefectClick(d.name);
            btn.classList.add('scale-95');
            setTimeout(() => btn.classList.remove('scale-95'), 120);
        });

        container.appendChild(btn);
    });
}

function initModalDefectControls() {
    const searchInput = document.getElementById('modal-defect-search');
    const searchClear = document.getElementById('modal-defect-search-clear');
    const categoryTabs = document.getElementById('modal-defect-category-tabs');

    if (searchInput) {
        searchInput.value = modalDefectSearchQuery;
        searchInput.oninput = () => {
            modalDefectSearchQuery = searchInput.value;
            if (searchClear) {
                if (modalDefectSearchQuery) searchClear.classList.remove('hidden');
                else searchClear.classList.add('hidden');
            }
            renderEnhancedModalDefectButtons();
        };
    }

    if (searchClear && searchInput) {
        searchClear.onclick = () => {
            searchInput.value = '';
            modalDefectSearchQuery = '';
            searchClear.classList.add('hidden');
            renderEnhancedModalDefectButtons();
            searchInput.focus();
        };
    }

    if (categoryTabs) {
        const catButtons = categoryTabs.querySelectorAll('.modal-cat-btn');
        catButtons.forEach(btn => {
            btn.onclick = () => {
                const cat = btn.dataset.cat || 'all';
                modalDefectActiveCategory = cat;

                catButtons.forEach(b => {
                    const bCat = b.dataset.cat;
                    if (bCat === cat) {
                        b.className = 'modal-cat-btn px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800 text-white transition-colors cursor-pointer';
                    } else {
                        let colorCls = 'text-slate-600 hover:bg-slate-100';
                        if (bCat === 'critical') colorCls = 'text-red-700 hover:bg-red-50';
                        if (bCat === 'major') colorCls = 'text-amber-700 hover:bg-amber-50';
                        if (bCat === 'minor') colorCls = 'text-blue-700 hover:bg-blue-50';
                        b.className = `modal-cat-btn px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 ${colorCls} border border-slate-200 transition-colors cursor-pointer`;
                    }
                });

                renderEnhancedModalDefectButtons();
            };
        });
    }
}

function openInspectionItemModal(index = null) {
    const modal = document.getElementById('inspection-item-modal');
    if (!modal) return;

    editingItemIndex = index;

    const modalTitle = document.getElementById('modal-item-title');
    const modeSelect = document.getElementById('modal-inspection-mode');
    const modeHint = document.getElementById('modal-mode-hint');

    // Reset defect search & filter state
    modalDefectSearchQuery = '';
    modalDefectActiveCategory = 'all';
    const searchInput = document.getElementById('modal-defect-search');
    if (searchInput) searchInput.value = '';
    const searchClear = document.getElementById('modal-defect-search-clear');
    if (searchClear) searchClear.classList.add('hidden');

    // Reset category tabs styling
    const categoryTabs = document.getElementById('modal-defect-category-tabs');
    if (categoryTabs) {
        const catButtons = categoryTabs.querySelectorAll('.modal-cat-btn');
        catButtons.forEach(b => {
            if (b.dataset.cat === 'all') {
                b.className = 'modal-cat-btn px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800 text-white transition-colors cursor-pointer';
            } else {
                let colorCls = 'text-slate-600 hover:bg-slate-100';
                if (b.dataset.cat === 'critical') colorCls = 'text-red-700 hover:bg-red-50';
                if (b.dataset.cat === 'major') colorCls = 'text-amber-700 hover:bg-amber-50';
                if (b.dataset.cat === 'minor') colorCls = 'text-blue-700 hover:bg-blue-50';
                b.className = `modal-cat-btn px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 ${colorCls} border border-slate-200 transition-colors cursor-pointer`;
            }
        });
    }

    if (index === null) {
        modalTitle.textContent = 'Tambah Item Inspeksi';
        modalInspectionMode = 'single';
        modalComponent = '';
        modalSelectedComponents = [];
        modalActiveDefectComponent = '';
        modalSelectedProcesses = [];
        modalItemDefects = {};
        modalComponentDefects = {};
        modalPassVal = 0;
        modalDefectVal = 0;
        modalQtyIncomingVal = 0;
        modalQtyInspectVal = 0;

        if (modeSelect) {
            modeSelect.value = 'single';
            modeSelect.disabled = false;
        }
        if (modeHint) modeHint.textContent = 'Pilih 1 komponen untuk diinspeksi.';

        const modalModeSelect = document.getElementById('modal-qty-inspect-mode');
        if (modalModeSelect) modalModeSelect.value = 'manual';
    } else {
        modalTitle.textContent = 'Edit Item Inspeksi';
        const item = inspectionItems[index];
        modalInspectionMode = 'single';
        modalComponent = item.component;
        modalSelectedComponents = [item.component];
        modalActiveDefectComponent = item.component;
        modalSelectedProcesses = item.process ? item.process.split(',').map(s => s.trim()) : [];
        modalQtyIncomingVal = item.qtyIncoming || 0;
        modalQtyInspectVal = item.qtyInspect || 0;
        modalPassVal = item.pass || 0;
        modalDefectVal = item.defect || 0;

        modalItemDefects = {};
        modalComponentDefects = {};
        modalComponentDefects[item.component] = {};
        if (Array.isArray(item.defects)) {
            item.defects.forEach(d => {
                const count = d.count || d.qty || 1;
                modalItemDefects[d.type] = count;
                modalComponentDefects[item.component][d.type] = count;
            });
        }

        if (modeSelect) {
            modeSelect.value = 'single';
            modeSelect.disabled = true;
        }
        if (modeHint) modeHint.textContent = 'Editing mode (komponen tunggal).';

        const modalModeSelect = document.getElementById('modal-qty-inspect-mode');
        if (modalModeSelect) modalModeSelect.value = 'manual';
    }

    // Bind mode selection change
    if (modeSelect) {
        modeSelect.onchange = () => {
            const newMode = modeSelect.value;
            modalInspectionMode = newMode;
            if (newMode === 'bulk') {
                if (modeHint) modeHint.textContent = 'Pilih 1 atau lebih komponen. Defect dapat diatribusikan per komponen.';
                if (modalComponent && !modalSelectedComponents.includes(modalComponent)) {
                    modalSelectedComponents = [modalComponent];
                }
                modalActiveDefectComponent = modalSelectedComponents[0] || '';
                modalSelectedComponents.forEach(comp => {
                    if (!modalComponentDefects[comp]) modalComponentDefects[comp] = {};
                });
            } else {
                if (modeHint) modeHint.textContent = 'Pilih 1 komponen untuk diinspeksi.';
                modalSelectedComponents = modalComponent ? [modalComponent] : [];
                modalActiveDefectComponent = modalComponent;
            }
            updateModalComponentButtonsActiveState();
            renderModalDefectTargetPills();
            renderEnhancedModalDefectButtons();
            updateModalGradeState();
        };
    }

    // Set inputs values
    const incomingInput = document.getElementById('modal-qty-incoming');
    if (incomingInput) incomingInput.value = modalQtyIncomingVal;

    const inspectInput = document.getElementById('modal-qty-inspect');
    if (inspectInput) inspectInput.value = modalQtyInspectVal;

    const customPctContainer = document.getElementById('modal-custom-pct-container');
    const customPctInput = document.getElementById('modal-custom-pct');
    if (customPctContainer) customPctContainer.classList.add('hidden');

    // Handle calculations inside modal
    const modalModeSelect = document.getElementById('modal-qty-inspect-mode');
    const updateModalQtyInspect = () => {
        if (!modalModeSelect || !incomingInput || !inspectInput) return;
        const mode = modalModeSelect.value;
        const incoming = parseInt(incomingInput.value, 10) || 0;

        if (mode === 'manual') {
            if (customPctContainer) customPctContainer.classList.add('hidden');
            inspectInput.readOnly = false;
        } else if (mode === 'custom_pct') {
            if (customPctContainer) customPctContainer.classList.remove('hidden');
            inspectInput.readOnly = true;
            const pctVal = parseFloat(customPctInput?.value) || 0;
            inspectInput.value = Math.ceil(incoming * (pctVal / 100));
        } else {
            if (customPctContainer) customPctContainer.classList.add('hidden');
            inspectInput.readOnly = true;
            let pct = 0.10;
            if (mode === 'percent_1') pct = 0.01;
            else if (mode === 'percent_5') pct = 0.05;
            else if (mode === 'percent_20') pct = 0.20;
            inspectInput.value = Math.ceil(incoming * pct);
        }
        modalQtyIncomingVal = incoming;
        modalQtyInspectVal = parseInt(inspectInput.value, 10) || 0;
        updateModalGradeState();
    };

    if (modalModeSelect) {
        modalModeSelect.onchange = updateModalQtyInspect;
    }
    if (incomingInput) {
        incomingInput.oninput = updateModalQtyInspect;
    }
    if (customPctInput) {
        customPctInput.oninput = updateModalQtyInspect;
    }
    if (inspectInput) {
        inspectInput.oninput = () => {
            modalQtyInspectVal = parseInt(inspectInput.value, 10) || 0;
            updateModalGradeState();
        };
    }

    // Render Modal Components Buttons
    modalProcesses = [...modalSelectedProcesses];
    renderModalComponentButtons(selectedVendor);
    renderModalProcessButtons();
    renderModalDefectTargetPills();

    // Initialize defect catalog controls & render buttons
    initModalDefectControls();
    renderEnhancedModalDefectButtons();

    // Render logged defects and update numbers
    updateModalGradeState();

    // Show Modal
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

function updateModalGradeState() {
    let defectSum = 0;

    if (modalInspectionMode === 'bulk') {
        modalSelectedComponents.forEach(comp => {
            const compMap = modalComponentDefects[comp] || {};
            for (const type in compMap) {
                defectSum += (compMap[type] || 0);
            }
        });
        modalDefectVal = defectSum;
        const totalSample = modalQtyInspectVal * Math.max(1, modalSelectedComponents.length);
        modalPassVal = Math.max(0, totalSample - modalDefectVal);
    } else {
        for (const type in modalItemDefects) {
            defectSum += modalItemDefects[type] || 0;
        }
        modalDefectVal = defectSum;
        modalPassVal = Math.max(0, modalQtyInspectVal - modalDefectVal);
    }

    const passCounter = document.getElementById('modal-pass-counter');
    if (passCounter) passCounter.textContent = modalPassVal;

    const defectCounter = document.getElementById('modal-defect-counter');
    if (defectCounter) defectCounter.textContent = modalDefectVal;

    const inspectInput = document.getElementById('modal-qty-inspect');
    if (inspectInput) inspectInput.value = modalQtyInspectVal;

    renderModalLoggedDefects();
    renderModalDefectTargetPills();
    renderEnhancedModalDefectButtons();
}

function renderModalLoggedDefects() {
    const container = document.getElementById('modal-logged-defects');
    if (!container) return;
    container.innerHTML = '';

    let hasDefects = false;

    if (modalInspectionMode === 'bulk') {
        modalSelectedComponents.forEach(comp => {
            const compMap = modalComponentDefects[comp] || {};
            for (const type in compMap) {
                const count = compMap[type] || 0;
                if (count > 0) {
                    hasDefects = true;
                    const div = document.createElement('div');
                    div.className = 'flex items-center justify-between py-1.5 text-xs text-slate-700';
                    div.innerHTML = `
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">${comp}</span>
                            <span class="font-medium text-slate-800">${type}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <button type="button" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[10px] font-bold rounded text-slate-700 cursor-pointer transition-colors" onclick="window.adjustModalDefect('${type}', -1, '${comp}')">-1</button>
                            <input type="number" min="0" value="${count}"
                                   title="Klik untuk ubah jumlah secara langsung" 
                                   class="w-14 text-center font-bold text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-text shadow-xs" 
                                   onchange="window.setModalDefectCount('${type}', this.value, '${comp}')" 
                                   onkeydown="if(event.key==='Enter'){ this.blur(); }" 
                                   onfocus="this.select()" />
                            <button type="button" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[10px] font-bold rounded text-slate-700 cursor-pointer transition-colors" onclick="window.adjustModalDefect('${type}', 1, '${comp}')">+1</button>
                        </div>
                    `;
                    container.appendChild(div);
                }
            }
        });
    } else {
        for (const type in modalItemDefects) {
            const count = modalItemDefects[type] || 0;
            if (count > 0) {
                hasDefects = true;
                const div = document.createElement('div');
                div.className = 'flex items-center justify-between py-1 text-xs text-slate-700';
                div.innerHTML = `
                    <span class="font-medium text-slate-800">${type}</span>
                    <div class="flex items-center gap-1.5">
                        <button type="button" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[10px] font-bold rounded text-slate-700 cursor-pointer transition-colors" onclick="window.adjustModalDefect('${type}', -1)">-1</button>
                        <input type="number" min="0" value="${count}"
                               title="Klik untuk ubah jumlah secara langsung" 
                               class="w-14 text-center font-bold text-slate-900 bg-white border border-slate-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-text shadow-xs" 
                               onchange="window.setModalDefectCount('${type}', this.value)" 
                               onkeydown="if(event.key==='Enter'){ this.blur(); }" 
                               onfocus="this.select()" />
                        <button type="button" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[10px] font-bold rounded text-slate-700 cursor-pointer transition-colors" onclick="window.adjustModalDefect('${type}', 1)">+1</button>
                    </div>
                `;
                container.appendChild(div);
            }
        }
    }

    if (!hasDefects) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">Belum ada defect yang tercatat.</span>';
    }
}

window.setModalDefectCount = function (defectType, val, compName = null) {
    const parsed = parseInt(val, 10);
    const newCount = isNaN(parsed) ? 0 : Math.max(0, parsed);

    if (modalInspectionMode === 'bulk') {
        const targetComp = compName || modalActiveDefectComponent;
        if (!targetComp) return;
        if (!modalComponentDefects[targetComp]) modalComponentDefects[targetComp] = {};

        if (newCount === 0) {
            delete modalComponentDefects[targetComp][defectType];
        } else {
            modalComponentDefects[targetComp][defectType] = newCount;
        }

        let compDefectSum = 0;
        for (const t in modalComponentDefects[targetComp]) {
            compDefectSum += (modalComponentDefects[targetComp][t] || 0);
        }
        if (compDefectSum > modalQtyInspectVal) {
            modalQtyInspectVal = compDefectSum;
        }
    } else {
        if (newCount === 0) {
            delete modalItemDefects[defectType];
        } else {
            modalItemDefects[defectType] = newCount;
        }

        let defectSum = 0;
        for (const type in modalItemDefects) {
            defectSum += modalItemDefects[type] || 0;
        }
        if (defectSum > modalQtyInspectVal) {
            modalQtyInspectVal = defectSum;
        }
    }

    updateModalGradeState();
};

window.adjustModalDefect = function (defectType, amount, compName = null) {
    if (modalInspectionMode === 'bulk') {
        const targetComp = compName || modalActiveDefectComponent;
        if (!targetComp) return;
        if (!modalComponentDefects[targetComp]) modalComponentDefects[targetComp] = {};

        const currentCount = modalComponentDefects[targetComp][defectType] || 0;
        const newCount = Math.max(0, currentCount + amount);

        if (newCount === 0) {
            delete modalComponentDefects[targetComp][defectType];
        } else {
            modalComponentDefects[targetComp][defectType] = newCount;
        }

        let compDefectSum = 0;
        for (const t in modalComponentDefects[targetComp]) {
            compDefectSum += (modalComponentDefects[targetComp][t] || 0);
        }
        if (compDefectSum > modalQtyInspectVal) {
            modalQtyInspectVal = compDefectSum;
        }
    } else {
        if (!modalItemDefects[defectType]) modalItemDefects[defectType] = 0;

        const currentCount = modalItemDefects[defectType];
        const newCount = Math.max(0, currentCount + amount);

        if (newCount === 0) {
            delete modalItemDefects[defectType];
        } else {
            modalItemDefects[defectType] = newCount;
        }

        let defectSum = 0;
        for (const type in modalItemDefects) {
            defectSum += modalItemDefects[type] || 0;
        }
        if (defectSum > modalQtyInspectVal) {
            modalQtyInspectVal = defectSum;
        }
    }

    updateModalGradeState();
};

window.handleModalDefectClick = function (defectType) {
    if (modalInspectionMode === 'bulk') {
        if (!modalActiveDefectComponent) {
            if (modalSelectedComponents.length > 0) {
                modalActiveDefectComponent = modalSelectedComponents[0];
            } else {
                showAlert('Silakan pilih minimal 1 Component terlebih dahulu.', 'warning', 'Peringatan');
                return;
            }
        }
        window.adjustModalDefect(defectType, 1, modalActiveDefectComponent);
    } else {
        if (!modalComponent) {
            showAlert('Silakan pilih Component terlebih dahulu.', 'warning', 'Peringatan');
            return;
        }
        window.adjustModalDefect(defectType, 1);
    }
};

function closeInspectionItemModal() {
    const modal = document.getElementById('inspection-item-modal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    editingItemIndex = null;
    modalDefectSearchQuery = '';
    modalDefectActiveCategory = 'all';
}

function saveInspectionItem() {
    if (modalInspectionMode === 'bulk') {
        if (!modalSelectedComponents || modalSelectedComponents.length === 0) {
            showAlert('Silakan pilih minimal 1 Component terlebih dahulu.', 'warning', 'Peringatan');
            return;
        }
    } else {
        if (!modalComponent) {
            showAlert('Silakan pilih Component terlebih dahulu.', 'warning', 'Peringatan');
            return;
        }
    }

    if (!modalProcesses || modalProcesses.length === 0) {
        showAlert('Silakan pilih minimal 1 Process terlebih dahulu.', 'warning', 'Peringatan');
        return;
    }
    if (modalQtyIncomingVal <= 0) {
        showAlert('Qty Incoming harus lebih besar dari 0.', 'warning', 'Peringatan');
        return;
    }
    if (modalQtyInspectVal <= 0) {
        showAlert('Qty Inspect harus lebih besar dari 0.', 'warning', 'Peringatan');
        return;
    }

    if (modalInspectionMode === 'bulk') {
        // Expand/unroll bulk components into independent items
        modalSelectedComponents.forEach(comp => {
            const compMap = modalComponentDefects[comp] || {};
            const defectsArray = [];
            let compDefectCount = 0;

            for (const type in compMap) {
                const cnt = compMap[type] || 0;
                if (cnt > 0) {
                    compDefectCount += cnt;
                    defectsArray.push({
                        type,
                        count: cnt
                    });
                }
            }

            const compPassCount = Math.max(0, modalQtyInspectVal - compDefectCount);

            const itemData = {
                component: comp,
                process: modalProcesses.join(', '),
                qtyIncoming: modalQtyIncomingVal,
                qtyInspect: modalQtyInspectVal,
                pass: compPassCount,
                defect: compDefectCount,
                defects: defectsArray
            };

            inspectionItems.push(itemData);
        });
    } else {
        const defectsArray = [];
        for (const type in modalItemDefects) {
            defectsArray.push({
                type,
                count: modalItemDefects[type]
            });
        }

        const itemData = {
            component: modalComponent,
            process: modalProcesses.join(', '),
            qtyIncoming: modalQtyIncomingVal,
            qtyInspect: modalQtyInspectVal,
            pass: modalPassVal,
            defect: modalDefectVal,
            defects: defectsArray
        };

        if (editingItemIndex === null) {
            inspectionItems.push(itemData);
        } else {
            inspectionItems[editingItemIndex] = itemData;
        }
    }

    closeInspectionItemModal();
    renderInspectedItems();
    updateTotalQtyInspect();
    checkInfoCompleteAndLockButtons();
    saveToLocalStorage();
}

// ===========================================
// FUNGSI BARU: Auto-fill Model Name berdasarkan Style Number
// ===========================================
function autoFillModelName() {
    const inputEl = document.getElementById('style-number-input');
    if (inputEl && inputEl.value) {
        updateStyleInputPreview(inputEl.value);
    }
    checkInfoCompleteAndLockButtons();
}

// ===========================================
// 16. Inisialisasi Aplikasi dan Event Listeners
// ===========================================
async function initApp() {
    console.log("Menginisialisasi aplikasi...");

    // --- AUTH GUARD: Selalu aktif. Perangkat baru/tanpa sesi → redirect login ---
    const session = await requireAuth();
    if (!session) return;

    // Tampilkan nama user yang sedang login di header
    const user = await getUser();
    currentUser = user;
    const userDisplayEl = document.getElementById('user-display');
    if (userDisplayEl && user) {
        const displayName = user.user_metadata?.display_name || user.user_metadata?.nik || 'User';
        userDisplayEl.textContent = displayName;
    }

    // Sembunyikan tombol statistik untuk inspector (hanya supervisor/manager/admin)
    const userRole = user?.user_metadata?.role || ROLES.INSPECTOR;
    currentUserRole = userRole;
    const statisticBtn = document.querySelector('.statistic-button');
    if (statisticBtn && userRole === ROLES.INSPECTOR) {
        statisticBtn.style.display = 'none';
    }

    // Bridge: expose role synchronously for showView() gate in inline script
    window.__eqmsUserRole = userRole;
    window.__eqmsDisplayName = user?.user_metadata?.display_name || user?.user_metadata?.nik || '—';
    window.__eqmsIsTestMode = UI_TEST_MODE;

    // Update role badge in header
    const roleBadgeEl = document.getElementById('user-role-badge');
    if (roleBadgeEl) {
        roleBadgeEl.textContent = userRole;
        if (userRole === ROLES.ADMIN) {
            roleBadgeEl.className = 'hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 capitalize';
        } else if (userRole === ROLES.SUPERVISOR) {
            roleBadgeEl.className = 'hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 capitalize';
        } else if (userRole === ROLES.MANAGER) {
            roleBadgeEl.className = 'hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize';
        } else {
            roleBadgeEl.className = 'hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize';
        }
    }





    // Hide "New Inspection" button for supervisor and manager only (admin keeps full access)
    if (userRole === ROLES.SUPERVISOR || userRole === ROLES.MANAGER) {
        const newInspBtn = document.getElementById('new-inspection-btn');
        if (newInspBtn) newInspBtn.style.display = 'none';
    }

    // Auto-navigate via URL param (e.g. direct link to a view)
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    if (viewParam && typeof window.showView === 'function') {
        window.showView(viewParam);
    } else {
        // Refresh inspection results if currently on results view to apply correct default filters
        const activeLink = document.querySelector('.nav-link.active');
        if (activeLink && activeLink.dataset.view === 'inspection-result') {
            window.loadInspectionResults();
        }
    }

    // Tombol logout
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const yes = await showConfirm('Sesi Anda akan diakhiri dan data form akan direset.', 'Yakin ingin logout?', 'Ya, Logout', 'Batal');
            if (yes) {
                clearAllFormStorage();
                await signOut();
            }
        });
    }

    outputElements = {
        'pass': document.getElementById('pass-counter'),
        'defect': document.getElementById('defect-counter')
    };
    fttOutput = document.getElementById('fttOutput');
    qtyInspectOutput = document.getElementById('qtyInspectOutput');
    summaryContainer = document.getElementById('summary-list');
    redoRateOutput = document.getElementById('redoRateOutput');
    qtySampleSetInput = document.getElementById('qty-sample-set');

    // Bind new DOM references
    qtyInspectModeSelect = document.getElementById('qty-inspect-mode');
    qtyInspectInput = document.getElementById('qty-inspect-input');
    tanggalInspectionInput = document.getElementById('tanggal-inspection');
    tanggalBucketInput = document.getElementById('tanggal-bucket');
    addItemBtn = document.getElementById('add-item-btn');
    inspectedItemsTbody = document.getElementById('inspected-items-tbody');

    // Sync catalog dari Supabase ke localStorage cache (agar defect buttons & dropdowns terisi)
    try { await syncAllFromSupabase(); } catch (e) { console.warn('Catalog sync failed, menggunakan cache:', e); }
    populateStyleDatalist();
    renderStyleTags(true);

    // Populate Approved by Leader Select Options (Desktop and Mobile)
    const leaderSelect = document.getElementById('approved-by-leader');
    const leaderSelectMobile = document.getElementById('approved-by-leader-mobile');

    function populateSelect(selectEl) {
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">— Tanpa Persetujuan —</option>';
        try {
            const leaders = getUsers().filter(u => u.role === 'supervisor' || u.role === 'manager');
            leaders.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.display_name || u.nik;
                opt.textContent = `${u.display_name || u.nik} (${u.role})`;
                selectEl.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to populate leaders select:', e);
        }
    }

    populateSelect(leaderSelect);
    populateSelect(leaderSelectMobile);

    function syncLeaderState(val) {
        const desktopSelect = document.getElementById('approved-by-leader');
        const mobileSelect = document.getElementById('approved-by-leader-mobile');
        const desktopContainer = document.getElementById('evidence-upload-container');
        const mobileContainer = document.getElementById('evidence-upload-container-mobile');

        if (desktopSelect && desktopSelect.value !== val) desktopSelect.value = val;
        if (mobileSelect && mobileSelect.value !== val) mobileSelect.value = val;

        if (desktopContainer) {
            if (val) desktopContainer.classList.remove('hidden');
            else {
                desktopContainer.classList.add('hidden');
                const fileInput = document.getElementById('evidence-file');
                if (fileInput) fileInput.value = '';
            }
        }
        if (mobileContainer) {
            if (val) mobileContainer.classList.remove('hidden');
            else {
                mobileContainer.classList.add('hidden');
                const fileInputMobile = document.getElementById('evidence-file-mobile');
                if (fileInputMobile) fileInputMobile.value = '';
            }
        }
    }

    if (leaderSelect) {
        leaderSelect.addEventListener('change', () => {
            syncLeaderState(leaderSelect.value);
            saveToLocalStorage();
        });
    }
    if (leaderSelectMobile) {
        leaderSelectMobile.addEventListener('change', () => {
            syncLeaderState(leaderSelectMobile.value);
            saveToLocalStorage();
        });
    }

    // Populate and sync Status Inspeksi (Desktop & Mobile)
    const statusSelect = document.getElementById('inspection-status');
    const statusSelectMobile = document.getElementById('inspection-status-mobile');

    function syncInspectionStatusState(val) {
        if (statusSelect && statusSelect.value !== val) statusSelect.value = val;
        if (statusSelectMobile && statusSelectMobile.value !== val) statusSelectMobile.value = val;
    }

    window.__syncInspectionStatusState = syncInspectionStatusState;

    if (statusSelect) {
        statusSelect.addEventListener('change', () => {
            syncInspectionStatusState(statusSelect.value);
            saveToLocalStorage();
        });
    }
    if (statusSelectMobile) {
        statusSelectMobile.addEventListener('change', () => {
            syncInspectionStatusState(statusSelectMobile.value);
            saveToLocalStorage();
        });
    }

    // Show admin nav items for admin role
    if (userRole === ROLES.ADMIN) {
        document.querySelectorAll('[data-view="admin"]').forEach(el => { el.style.display = ''; });
    }
    // Show leader monitor nav items for admin, supervisor, and manager
    if (userRole === ROLES.ADMIN || userRole === ROLES.SUPERVISOR || userRole === ROLES.MANAGER) {
        document.querySelectorAll('[data-view="leader-monitor"]').forEach(el => { el.style.display = ''; });
    }

    defectButtons = document.querySelectorAll('.defect-button');
    gradeInputButtons = document.querySelectorAll('.input-button');

    auditorSelect = document.getElementById('auditor');
    modelNameInput = document.getElementById("model-name");
    styleNumberInput = document.getElementById("style-number");
    tanggalIncomingInput = document.getElementById('tanggal-incoming');
    vendorSelect = document.getElementById('vendor');
    if (vendorSelect) renderVendorOptions(vendorSelect);

    // Render new button-based selectors
    renderVendorButtons();

    window.__reattachVendorOptions = () => { renderVendorButtons(); };
    window.__reattachComponentOptions = () => { };
    window.__reattachProcessOptions = () => { };

    // Wire Reset button in Context Selection card
    const resetSelectionBtn = document.getElementById('reset-selection-btn');
    if (resetSelectionBtn) resetSelectionBtn.addEventListener('click', resetContextSelection);

    // Material Type filter
    const materialTypeSelect = document.getElementById('material-type');
    if (materialTypeSelect) {
        materialTypeSelect.addEventListener('change', () => {
            selectedMaterialType = materialTypeSelect.value;
            // If current vendor no longer matches the new filter, clear vendor selection
            if (selectedVendor) {
                const vendors = getVendors();
                const vendor = vendors.find(v => v.name === selectedVendor);
                if (!vendor || (selectedMaterialType && vendor.material_type !== selectedMaterialType)) {
                    selectedVendor = '';
                    inspectionItems = [];
                    renderInspectedItems();
                    if (addItemBtn) addItemBtn.disabled = true;
                }
            }
            renderVendorButtons();
            checkInfoCompleteAndLockButtons();
            saveToLocalStorage();
        });
    }

    // --- AUTO-FILL AUDITOR FROM SESSION ---
    if (auditorSelect && user) {
        const sessionName = user.user_metadata?.display_name || user.user_metadata?.nik || '';
        if (sessionName) {
            auditorSelect.value = sessionName;
            auditorSelect.dataset.sessionLocked = 'true';
            const badge = document.getElementById('auditor-session-badge');
            if (badge) badge.classList.remove('hidden');
        }
    }

    // Set default dates to today
    const todayStr = new Date().toISOString().split('T')[0];
    if (tanggalIncomingInput && !tanggalIncomingInput.value) {
        tanggalIncomingInput.value = todayStr;
    }
    const inspectionDatePicker = document.getElementById('inspection-date-picker');
    if (inspectionDatePicker) {
        inspectionDatePicker.value = todayStr;
        inspectionDatePicker.addEventListener('change', () => {
            if (inspectionDatePicker.value) {
                window.addInspectionDate(inspectionDatePicker.value);
            }
        });
    }
    if (!selectedInspectionDates.length) {
        window.setInspectionDates(todayStr, true);
    }
    const bucketDatePicker = document.getElementById('bucket-date-picker');
    if (bucketDatePicker) {
        bucketDatePicker.value = todayStr;
        bucketDatePicker.addEventListener('change', () => {
            if (bucketDatePicker.value) {
                window.addBucketDate(bucketDatePicker.value);
            }
        });
    }
    if (!selectedBucketDates.length) {
        window.setBucketDates(todayStr, true);
    }

    if (modelNameInput) {
        modelNameInput.addEventListener('input', () => {
            saveToLocalStorage();
            checkInfoCompleteAndLockButtons();
        });
    }

    if (styleNumberInput) {
        styleNumberInput.addEventListener('input', () => {
            saveToLocalStorage();
            autoFillModelName();
            checkInfoCompleteAndLockButtons();
        });
    }

    // Bind Multi-Style input & button
    const styleInputBox = document.getElementById('style-number-input');
    const btnAddStyle = document.getElementById('btn-add-style');

    if (styleInputBox) {
        styleInputBox.addEventListener('input', () => {
            updateStyleInputPreview(styleInputBox.value);
            saveToLocalStorage();
        });
        styleInputBox.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (styleInputBox.value.trim()) {
                    window.addStyle(styleInputBox.value);
                }
            }
        });
        styleInputBox.addEventListener('blur', () => {
            if (styleInputBox.value.trim()) {
                window.addStyle(styleInputBox.value);
            }
        });
    }

    if (btnAddStyle && styleInputBox) {
        btnAddStyle.addEventListener('click', () => {
            if (styleInputBox.value.trim()) {
                window.addStyle(styleInputBox.value);
            } else {
                styleInputBox.focus();
            }
        });
    }

    if (tanggalIncomingInput) {
        tanggalIncomingInput.addEventListener('input', saveToLocalStorage);
        tanggalIncomingInput.addEventListener('change', () => {
            saveToLocalStorage();
            checkInfoCompleteAndLockButtons();
        });
    }
    if (tanggalInspectionInput) tanggalInspectionInput.addEventListener('change', saveToLocalStorage);
    if (tanggalBucketInput) tanggalBucketInput.addEventListener('change', saveToLocalStorage);

    const inspectionLocationInput = document.getElementById('inspection-location');
    if (inspectionLocationInput) {
        inspectionLocationInput.addEventListener('change', saveToLocalStorage);
    }

    // Bind Add Item action
    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            openInspectionItemModal();
        });
    }

    // Modal buttons bindings
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeInspectionItemModal);

    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeInspectionItemModal);

    const modalSaveItemBtn = document.getElementById('modal-save-item-btn');
    if (modalSaveItemBtn) modalSaveItemBtn.addEventListener('click', saveInspectionItem);

    const modalPassIncBtn = document.getElementById('modal-pass-inc-btn');
    if (modalPassIncBtn) {
        modalPassIncBtn.addEventListener('click', () => {
            modalQtyInspectVal += 1;
            updateModalGradeState();
        });
    }
    const modalDefectIncBtn = document.getElementById('modal-defect-inc-btn');
    if (modalDefectIncBtn) {
        modalDefectIncBtn.addEventListener('click', () => {
            showAlert('Silakan klik jenis defect di katalog untuk mencatat defect.', 'info', 'Petunjuk');
        });
    }

    const saveButtons = document.querySelectorAll(".save-button");
    saveButtons.forEach(btn => {
        btn.addEventListener("click", saveData);
    });

    const refreshResultBtn = document.getElementById('inspection-result-refresh-btn');
    if (refreshResultBtn) {
        refreshResultBtn.addEventListener('click', () => window.loadInspectionResults());
    }

    const resultSearch = document.getElementById('inspection-result-search');
    if (resultSearch) {
        resultSearch.addEventListener('input', () => renderInspectionResultTable(allInspectionSessions));
    }

    const resultStatusFilter = document.getElementById('inspection-result-status-filter');
    if (resultStatusFilter) {
        resultStatusFilter.addEventListener('change', () => renderInspectionResultTable(allInspectionSessions));
    }

    const resultAuditorFilter = document.getElementById('inspection-result-auditor-filter');
    if (resultAuditorFilter) {
        resultAuditorFilter.addEventListener('change', () => renderInspectionResultTable(allInspectionSessions));
    }

    const resultVendorFilter = document.getElementById('inspection-result-vendor-filter');
    if (resultVendorFilter) {
        resultVendorFilter.addEventListener('change', () => renderInspectionResultTable(allInspectionSessions));
    }

    const dateStartInput = document.getElementById('inspection-result-date-start');
    const dateEndInput = document.getElementById('inspection-result-date-end');
    if (dateStartInput) dateStartInput.addEventListener('change', () => renderInspectionResultTable(allInspectionSessions));
    if (dateEndInput) dateEndInput.addEventListener('change', () => renderInspectionResultTable(allInspectionSessions));

    const btnToday = document.getElementById('btn-filter-today');
    if (btnToday) {
        btnToday.addEventListener('click', () => {
            const todayStr = new Date().toISOString().split('T')[0];
            if (dateStartInput) dateStartInput.value = todayStr;
            if (dateEndInput) dateEndInput.value = todayStr;
            renderInspectionResultTable(allInspectionSessions);
        });
    }

    const btn7Days = document.getElementById('btn-filter-7days');
    if (btn7Days) {
        btn7Days.addEventListener('click', () => {
            const today = new Date();
            const past7 = new Date();
            past7.setDate(today.getDate() - 6);
            if (dateStartInput) dateStartInput.value = past7.toISOString().split('T')[0];
            if (dateEndInput) dateEndInput.value = today.toISOString().split('T')[0];
            renderInspectionResultTable(allInspectionSessions);
        });
    }

    const btnResetDate = document.getElementById('btn-filter-reset-date');
    if (btnResetDate) {
        btnResetDate.addEventListener('click', () => {
            if (dateStartInput) dateStartInput.value = '';
            if (dateEndInput) dateEndInput.value = '';
            renderInspectionResultTable(allInspectionSessions);
        });
    }

    const statisticButton = document.querySelector('.statistic-button');
    if (statisticButton) {
        statisticButton.addEventListener('click', () => {
            if (typeof window.showView === 'function') {
                window.showView('analytics');
            } else {
                window.location.href = 'dashboard.html';
            }
        });
    }

    renderInspectedItems();
    updateTotalQtyInspect();
    checkInfoCompleteAndLockButtons();

    // Pulihkan draf tersimpan dari localStorage jika ada
    checkAndRestoreDraft();

    console.log("Aplikasi berhasil diinisialisasi.");
}

document.addEventListener('DOMContentLoaded', initApp);


// ===========================================
// INSPECTION RESULT FEATURE (DONE & IN-PROGRESS)
// ===========================================

let allInspectionSessions = [];
let filterOptionsInitialized = false;
let editingSessionId = null;

/** Load all Inspection Results (Done & In-Progress) from Supabase */
window.loadInspectionResults = async function () {
    const gallery = document.getElementById('inspection-result-gallery');
    const badge = document.getElementById('inspection-result-count-badge');
    if (gallery) {
        gallery.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
                <span class="material-symbols-outlined text-4xl animate-spin mb-3 text-emerald-400">sync</span>
                <span class="text-sm italic">Memuat data Inspection Result...</span>
            </div>
        `;
    }

    try {
        if (UI_TEST_MODE) {
            allInspectionSessions = [
                {
                    sessionId: 'SESS-INSP-001',
                    tanggalInspection: '2026-07-20',
                    vendor: 'PT Forward Subcont',
                    materialType: 'upper',
                    styleNumber: 'NK-DYN-01',
                    modelName: 'NIKE DYNAMO FREE',
                    component: 'Vamp',
                    process: 'Stitching, Emboss',
                    auditor: 'Ninik Mulyani',
                    status: 'In-Progress',
                    items: [
                        { component: 'Vamp', process: 'Stitching, Emboss', qtyIncoming: 500, qtyInspect: 100, pass: 95, defect: 5 }
                    ]
                },
                {
                    sessionId: 'SESS-INSP-002',
                    tanggalInspection: '2026-07-19',
                    vendor: 'PT Victory Leather',
                    materialType: 'bottom',
                    styleNumber: 'NK-AIR-90',
                    modelName: 'AIR MAX 90',
                    component: 'Outsole',
                    process: 'Cementing',
                    auditor: 'Ninik Mulyani',
                    status: 'Done',
                    items: [
                        { component: 'Outsole', process: 'Cementing', qtyIncoming: 1000, qtyInspect: 100, pass: 100, defect: 0 }
                    ]
                }
            ];
        } else {
            // Query langsung dari Supabase subcont_inspections
            const { data: sessData, error: sessErr } = await supabase
                .from('subcont_inspections')
                .select('*')
                .order('timestamp', { ascending: false });

            if (sessErr) throw sessErr;

            allInspectionSessions = (sessData || []).map(row => ({
                sessionId: row.session_id,
                timestamp: row.timestamp || row.created_at,
                tanggalIncoming: row.date || '',
                tanggalInspection: row.tanggal_insp || row.date || '',
                tanggalBucket: row.bucket || '',
                materialType: row.material_type || '',
                auditor: row.user_login || '',
                vendor: row.vendor || '',
                component: row.component || '',
                process: row.process || '',
                styleNumber: row.style_number || '',
                modelName: row.model || '',
                qtyIncoming: Number(row.qty_incoming) || 0,
                qtyInspect: Number(row.qty_inspect) || 0,
                pass: Number(row.qty_pass) || 0,
                defect: Number(row.qty_defect) || 0,
                ftt: Number(row.ftt) || 0,
                redoRate: Number(row.redo_rate) || 0,
                approvedByLeader: row.approved_by || '',
                evidenceUrl: row.evidence_url || '',
                status: row.status || 'Done',
                items: row.component ? [{
                    component: row.component,
                    process: row.process || '',
                    qtyIncoming: Number(row.qty_incoming) || 0,
                    qtyInspect: Number(row.qty_inspect) || 0,
                    pass: Number(row.qty_pass) || 0,
                    defect: Number(row.qty_defect) || 0
                }] : []
            }));
        }

        populateFilterOptions();
        renderInspectionResultTable(allInspectionSessions);

    } catch (e) {
        console.error('[Inspection Result] Gagal memuat:', e);
        if (gallery) {
            gallery.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-16 text-red-400">
                    <span class="material-symbols-outlined text-4xl mb-3">error</span>
                    <span class="text-sm font-semibold">Gagal memuat data: ${e.message}</span>
                </div>
            `;
        }
    }
};

/** Populate unique Auditor and Vendor dropdown filters */
function populateFilterOptions() {
    const auditors = [...new Set(allInspectionSessions.map(s => s.auditor).filter(Boolean))].sort();
    const vendors = [...new Set(allInspectionSessions.map(s => s.vendor).filter(Boolean))].sort();

    // Populate Auditor filter
    const auditorSelect = document.getElementById('inspection-result-auditor-filter');
    if (auditorSelect) {
        const currentVal = auditorSelect.value;
        auditorSelect.innerHTML = '<option value="all">Semua Auditor</option>';
        auditors.forEach(aud => {
            const opt = document.createElement('option');
            opt.value = aud;
            opt.textContent = aud;
            auditorSelect.appendChild(opt);
        });

        // Set default to current user only on first initialization
        if (!filterOptionsInitialized) {
            const uMeta = currentUser?.user_metadata || {};
            const userDisplayName = (uMeta.display_name || uMeta.name || window.__eqmsDisplayName || '').trim().toLowerCase();
            const userNik = (uMeta.nik || '').trim().toLowerCase();
            const matched = auditors.find(a => {
                const audLower = a.trim().toLowerCase();
                return (userDisplayName && (audLower === userDisplayName || audLower.includes(userDisplayName))) ||
                       (userNik && (audLower === userNik || audLower.includes(userNik)));
            });
            if (matched) {
                auditorSelect.value = matched;
            } else {
                auditorSelect.value = 'all';
            }
        } else {
            if (currentVal && [...auditorSelect.options].some(o => o.value === currentVal)) {
                auditorSelect.value = currentVal;
            } else {
                auditorSelect.value = 'all';
            }
        }
    }

    // Populate Vendor filter
    const vendorSelect = document.getElementById('inspection-result-vendor-filter');
    if (vendorSelect) {
        const currentVal = vendorSelect.value;
        vendorSelect.innerHTML = '<option value="all">Semua Vendor</option>';
        vendors.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            vendorSelect.appendChild(opt);
        });
        if (currentVal && [...vendorSelect.options].some(o => o.value === currentVal)) {
            vendorSelect.value = currentVal;
        } else {
            vendorSelect.value = 'all';
        }
    }

    filterOptionsInitialized = true;
}

/** Check if the current user has permission to edit an in-progress session */
function canUserEditSession(session, user) {
    if (!session) return false;
    const role = (user?.user_metadata?.role || window.__eqmsUserRole || currentUserRole || ROLES.INSPECTOR).toLowerCase();
    // Admin dan Supervisor berwenang mengedit semua sesi
    if (role === ROLES.ADMIN || role === ROLES.SUPERVISOR) {
        return true;
    }

    const sessionAuditor = String(session.auditor || '').trim().toLowerCase();
    if (!sessionAuditor) return false;

    const uMeta = user?.user_metadata || {};
    const candidates = [
        uMeta.display_name,
        uMeta.name,
        uMeta.nik,
        user?.email,
        window.__eqmsDisplayName
    ].filter(Boolean).map(c => String(c).trim().toLowerCase());

    return candidates.some(c => c === sessionAuditor || sessionAuditor.includes(c) || c.includes(sessionAuditor));
}

/** Render inspection results gallery with status filter grouped by style/model */
function renderInspectionResultTable(sessions) {
    const gallery = document.getElementById('inspection-result-gallery');
    const badge = document.getElementById('inspection-result-count-badge');
    const searchVal = (document.getElementById('inspection-result-search')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('inspection-result-status-filter')?.value || 'all';
    const auditorFilter = document.getElementById('inspection-result-auditor-filter')?.value || 'all';
    const vendorFilter = document.getElementById('inspection-result-vendor-filter')?.value || 'all';
    const dateStart = document.getElementById('inspection-result-date-start')?.value || '';
    const dateEnd = document.getElementById('inspection-result-date-end')?.value || '';

    const filtered = sessions.filter(s => {
        let compStr = s.component || '';
        let procStr = s.process || '';
        if (s.items && s.items.length > 0) {
            if (!compStr) compStr = [...new Set(s.items.map(i => i.component).filter(Boolean))].join(', ');
            if (!procStr) procStr = [...new Set(s.items.map(i => i.process).filter(Boolean))].join(', ');
        }

        const matchesSearch = !searchVal ||
            (s.vendor || '').toLowerCase().includes(searchVal) ||
            (s.auditor || '').toLowerCase().includes(searchVal) ||
            (s.styleNumber || '').toLowerCase().includes(searchVal) ||
            (s.modelName || '').toLowerCase().includes(searchVal) ||
            (compStr || '').toLowerCase().includes(searchVal) ||
            (procStr || '').toLowerCase().includes(searchVal);

        const stLower = (s.status || 'Done').toLowerCase();
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'Done' && stLower === 'done') ||
            (statusFilter === 'In-Progress' && stLower.includes('progress')) ||
            (statusFilter === 'Pending Leader Approval' && (
                stLower.includes('leader') ||
                stLower.includes('approval') ||
                (Boolean(s.approvedByLeader) && stLower !== 'done')
            ));

        const matchesAuditor = auditorFilter === 'all' ||
            (s.auditor || '').toLowerCase() === auditorFilter.toLowerCase();

        const matchesVendor = vendorFilter === 'all' ||
            (s.vendor || '').toLowerCase() === vendorFilter.toLowerCase();

        let matchesDate = true;
        let sDates = [];
        let rawDate = s.tanggalInspection || s.tanggalIncoming || s.timestamp || '';
        if (rawDate && rawDate !== 'null' && rawDate !== 'undefined') {
            String(rawDate).split(/[,]+/).forEach(p => {
                const trimmed = p.trim();
                if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
                    sDates.push(trimmed.slice(0, 10));
                } else if (trimmed) {
                    const parsed = new Date(trimmed);
                    if (!isNaN(parsed.getTime())) sDates.push(parsed.toISOString().slice(0, 10));
                }
            });
        }
        if (dateStart || dateEnd) {
            if (!sDates.length) {
                matchesDate = false;
            } else {
                matchesDate = sDates.some(d => (!dateStart || d >= dateStart) && (!dateEnd || d <= dateEnd));
            }
        }

        return matchesSearch && matchesStatus && matchesDate && matchesAuditor && matchesVendor;
    });

    if (badge) badge.textContent = `${filtered.length} Sesi Inspeksi`;
    if (!gallery) return;

    if (!filtered.length) {
        gallery.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-16 text-slate-500">
                <span class="material-symbols-outlined text-4xl mb-2">find_in_page</span>
                <span class="text-sm italic">Tidak ada data hasil inspeksi yang cocok.</span>
            </div>
        `;
        return;
    }

    // Group filtered sessions by style number & model name
    const grouped = {};
    filtered.forEach(s => {
        const styleStr = (s.styleNumber || '—').trim();
        const modelStr = (s.modelName || '—').trim();
        const key = `${styleStr}|${modelStr}`;

        if (!grouped[key]) {
            grouped[key] = {
                styleNumber: styleStr,
                modelName: modelStr,
                vendors: new Set(),
                materials: new Set(),
                auditors: new Set(),
                dates: new Set(),
                statuses: new Set(),
                items: []
            };
        }

        const g = grouped[key];
        if (s.vendor) g.vendors.add(s.vendor);
        if (s.materialType) g.materials.add(s.materialType);
        if (s.auditor) g.auditors.add(s.auditor);
        if (s.status) g.statuses.add(s.status.toLowerCase().trim());

        let rawDate = s.tanggalInspection || s.tanggalIncoming || s.timestamp || '';
        if (rawDate && rawDate !== 'null' && rawDate !== 'undefined') {
            String(rawDate).split(/[,]+/).forEach(p => {
                const trimmed = p.trim();
                if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
                    g.dates.add(trimmed.slice(0, 10));
                } else if (trimmed) {
                    const parsed = new Date(trimmed);
                    if (!isNaN(parsed.getTime())) {
                        g.dates.add(parsed.toISOString().slice(0, 10));
                    }
                }
            });
        }

        if (s.items && s.items.length > 0) {
            s.items.forEach(it => {
                g.items.push({
                    sessionId: s.sessionId,
                    component: it.component || '—',
                    process: it.process || '—',
                    qtyIncoming: Number(it.qtyIncoming || 0),
                    qtyInspect: Number(it.qtyInspect || 0),
                    pass: Number(it.pass || 0),
                    defect: Number(it.defect || 0),
                    status: s.status || 'Done'
                });
            });
        } else {
            g.items.push({
                sessionId: s.sessionId,
                component: s.component || '—',
                process: s.process || '—',
                qtyIncoming: Number(s.qtyIncoming || 0),
                qtyInspect: Number(s.qtyInspect || 0),
                pass: Number(s.pass || 0),
                defect: Number(s.defect || 0),
                status: s.status || 'Done'
            });
        }
    });

    gallery.innerHTML = Object.values(grouped).map(g => {
        const hasPendingApproval = [...g.statuses].some(st => st.includes('leader') || st.includes('approval'));
        const hasInProgress = [...g.statuses].some(st => st.includes('progress') || st.includes('in-progress') || st.includes('in progress'));

        let statusBadgeHTML = '';
        if (hasPendingApproval) {
            statusBadgeHTML = `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    Pending Approval
                </span>
            `;
        } else if (hasInProgress) {
            statusBadgeHTML = `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    In-Progress
                </span>
            `;
        } else {
            statusBadgeHTML = `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Done
                </span>
            `;
        }

        const dateArr = [...g.dates].sort();
        const dateStr = dateArr.length > 1 ? `${dateArr[0]} s/d ${dateArr[dateArr.length - 1]}` : (dateArr[0] || '—');

        // Aggregate items by component and process — prevent doubling incoming for same component lot across inspection days
        const itemAgg = {};
        g.items.forEach(it => {
            const itemKey = `${it.component}|${it.process}`;
            if (!itemAgg[itemKey]) {
                itemAgg[itemKey] = {
                    component: it.component,
                    process: it.process,
                    qtyIncoming: 0,
                    qtyInspect: 0,
                    pass: 0,
                    defect: 0,
                    sessions: new Set()
                };
            }
            const agg = itemAgg[itemKey];
            agg.qtyIncoming += it.qtyIncoming;
            agg.qtyInspect += it.qtyInspect;
            agg.pass += it.pass;
            agg.defect += it.defect;
            agg.sessions.add(it.sessionId);
        });
        const aggregatedItems = Object.values(itemAgg);

        return `
            <div class="bg-white rounded-xl border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-all duration-200 ${(hasInProgress || hasPendingApproval) ? 'border-amber-400/30' : 'border-slate-200/40'}" style="min-height: 320px;">
                <!-- Decorative top bar -->
                <div class="h-1.5 w-full ${(hasInProgress || hasPendingApproval) ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}"></div>
                
                <div class="p-5 flex-1 flex flex-col gap-4">
                    <!-- Style and model name & Status -->
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h3 class="text-base font-extrabold text-slate-100 leading-tight mb-0.5">${g.modelName}</h3>
                            <p class="text-[11px] text-slate-400">Style Number: <span class="text-slate-300 font-semibold">${g.styleNumber}</span></p>
                        </div>
                        ${statusBadgeHTML}
                    </div>

                    <!-- Meta details -->
                    <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-700/20 pt-3 text-[11px]">
                        <div>
                            <span class="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">MATERIAL</span>
                            <span class="text-slate-300 font-medium truncate block capitalize" title="${[...g.materials].join(', ')}">${[...g.materials].join(', ') || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">VENDOR</span>
                            <span class="text-slate-300 font-medium truncate block capitalize" title="${[...g.vendors].join(', ')}">${[...g.vendors].join(', ') || '—'}</span>
                        </div>
                    </div>

                    <!-- Component Details Table -->
                    <div class="border-t border-slate-700/20 pt-3 flex-1 flex flex-col justify-between">
                        <span class="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">INSPECTION DETAILS</span>
                        <div class="overflow-x-auto border border-slate-700/20 rounded-lg bg-slate-900/10 max-h-[160px] thin-scroll">
                            <table class="w-full text-left border-collapse text-[10px]">
                                <thead>
                                    <tr class="bg-slate-800/40 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-700/20">
                                        <th class="px-2.5 py-1.5">Component / Process</th>
                                        <th class="px-2 py-1.5 text-right">Inc</th>
                                        <th class="px-2 py-1.5 text-right">Insp</th>
                                        <th class="px-2 py-1.5 text-right text-emerald-400">Pass</th>
                                        <th class="px-2 py-1.5 text-right text-rose-400">Def</th>
                                        <th class="px-2.5 py-1.5 text-center">Act</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-700/10 text-slate-300">
                                    ${aggregatedItems.map(item => {
            let actionHTML = '';
            const sessionIds = [...item.sessions];

            // Find active session for editing (In-Progress, Pending Leader Approval, etc.)
            const activeInProgSession = sessionIds.find(sid => {
                const sObj = sessions.find(sess => sess.sessionId === sid);
                if (!sObj) return false;
                const st = (sObj.status || '').toLowerCase();
                return st.includes('progress') || st.includes('leader') || st.includes('approval') || (Boolean(sObj.approvedByLeader) && st !== 'done');
            }) || sessionIds[0];

            const targetObj = sessions.find(sess => sess.sessionId === activeInProgSession);
            const isDone = targetObj && (targetObj.status || '').toLowerCase() === 'done';

            if (!isDone && activeInProgSession) {
                const canEdit = canUserEditSession(targetObj, currentUser);
                if (canEdit) {
                    actionHTML = `
                        <button onclick="window.continueInProgressSession('${activeInProgSession}')" 
                                title="Edit / Lanjutkan Sesi ${activeInProgSession}" 
                                class="inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold cursor-pointer transition-all duration-150">
                            <span class="material-symbols-outlined text-[12px]">edit</span>
                            <span>Edit</span>
                        </button>
                    `;
                } else {
                    const auditorName = targetObj?.auditor || 'Auditor lain';
                    actionHTML = `
                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[9px] font-medium" title="Sesi In-Progress milik ${auditorName} (Hanya dapat diedit oleh pemilik)">
                            <span class="material-symbols-outlined text-[11px] text-slate-500">lock</span>
                            <span>In-Prog</span>
                        </span>
                    `;
                }
            } else {
                actionHTML = `<span class="text-[9px] text-slate-500 font-bold">Done</span>`;
            }

            return `
                                            <tr class="hover:bg-slate-700/10 transition-colors">
                                                <td class="px-2.5 py-1.5 font-medium">
                                                    <span class="text-slate-200 block">${item.component}</span>
                                                    <span class="text-slate-400 text-[9px] block">${item.process}</span>
                                                </td>
                                                <td class="px-2 py-1.5 text-right">${item.qtyIncoming.toLocaleString('id-ID')}</td>
                                                <td class="px-2 py-1.5 text-right">${item.qtyInspect.toLocaleString('id-ID')}</td>
                                                <td class="px-2 py-1.5 text-right text-emerald-400 font-semibold">${item.pass.toLocaleString('id-ID')}</td>
                                                <td class="px-2 py-1.5 text-right text-rose-400 font-semibold">${item.defect.toLocaleString('id-ID')}</td>
                                                <td class="px-2.5 py-1.5 text-center">${actionHTML}</td>
                                            </tr>
                                        `;
        }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Footer area -->
                <div class="px-5 py-3 bg-slate-900/20 border-t border-slate-800/30 flex justify-between items-center text-[11px] text-slate-400">
                    <div class="flex items-center gap-1.5 font-medium truncate w-full" title="Auditor: ${[...g.auditors].join(', ')}">
                        <span class="material-symbols-outlined text-[14px]">person</span>
                        <span class="truncate max-w-[120px]">${[...g.auditors].join(', ')}</span>
                        <span class="text-slate-600">•</span>
                        <span class="truncate">${dateStr}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/** Continue/Load an in-progress or pending approval session back into the form */
window.continueInProgressSession = function (sessionId) {
    const session = allInspectionSessions.find(s => String(s.sessionId) === String(sessionId));
    if (!session) {
        showAlert('Data sesi tidak ditemukan.', 'error');
        return;
    }

    if (!canUserEditSession(session, currentUser)) {
        const ownerName = session.auditor || 'auditor lain';
        showAlert(`Akses ditolak: Sesi ini milik ${ownerName}. Anda hanya berwenang mengedit sesi milik Anda sendiri.`, 'error', 'Wewenang Terbatas');
        return;
    }

    editingSessionId = session.sessionId;

    // Set header fields
    const mtSelect = document.getElementById('material-type');
    if (mtSelect) { mtSelect.value = session.materialType || ''; selectedMaterialType = session.materialType || ''; }
    renderVendorButtons();

    if (session.vendor) {
        selectedVendor = session.vendor;
        document.querySelectorAll('.vendor-sel-btn').forEach(btn => {
            btn.classList.toggle('bg-emerald-600', btn.dataset.vendor === session.vendor);
            btn.classList.toggle('text-white', btn.dataset.vendor === session.vendor);
            btn.classList.toggle('border-emerald-600', btn.dataset.vendor === session.vendor);
        });
        if (addItemBtn) addItemBtn.disabled = false;
    }

    const tinEl = document.getElementById('tanggal-incoming');
    if (tinEl && session.tanggalIncoming) tinEl.value = session.tanggalIncoming;
    const tinsEl = document.getElementById('tanggal-inspection');
    if (tinsEl && session.tanggalInspection) tinsEl.value = session.tanggalInspection;
    if (session.tanggalInspection) {
        window.setInspectionDates(session.tanggalInspection);
    }
    const bVal = session.tanggalBucket || session.bucket || '';
    if (bVal) {
        window.setBucketDates(bVal);
    }
    const styleEl = document.getElementById('style-number');
    if (styleEl && session.styleNumber) styleEl.value = session.styleNumber;
    const modelEl = document.getElementById('model-name');
    if (modelEl && session.modelName) modelEl.value = session.modelName;
    if (session.styleNumber) {
        window.setStyles(session.styleNumber, session.modelName);
    }

    if (typeof window.__syncInspectionStatusState === 'function') {
        window.__syncInspectionStatusState(session.status || 'In-Progress');
    }

    const leaderSelect = document.getElementById('approved-by-leader');
    const leaderSelectMobile = document.getElementById('approved-by-leader-mobile');
    if (session.approvedByLeader) {
        if (leaderSelect) leaderSelect.value = session.approvedByLeader;
        if (leaderSelectMobile) leaderSelectMobile.value = session.approvedByLeader;
        const desktopContainer = document.getElementById('evidence-upload-container');
        const mobileContainer = document.getElementById('evidence-upload-container-mobile');
        if (desktopContainer) desktopContainer.classList.remove('hidden');
        if (mobileContainer) mobileContainer.classList.remove('hidden');
    }

    if (Array.isArray(session.items) && session.items.length > 0) {
        inspectionItems = [...session.items];
    } else if (session.component) {
        inspectionItems = [{
            component: session.component,
            process: session.process || '',
            qtyIncoming: Number(session.qtyIncoming || 0),
            qtyInspect: Number(session.qtyInspect || 0),
            pass: Number(session.pass || 0),
            defect: Number(session.defect || 0)
        }];
    }

    renderInspectedItems();
    updateTotalQtyInspect();
    checkInfoCompleteAndLockButtons();
    saveToLocalStorage();

    // Switch view to dashboard (Inspection Form)
    if (typeof window.showView === 'function') {
        window.showView('dashboard');
    }

    showAlert(`Sesi inspeksi ${session.vendor} (${session.sessionId}) berhasil dimuat ke form untuk di-edit/dilanjutkan!`, 'success', 'Sesi Dimuat');
};
