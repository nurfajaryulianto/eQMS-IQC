// ===========================================
// 1. Deklarasi Variabel Global dan DOM References (Modifikasi)
// ===========================================
// --- IMPOR DATABASE DARI FILE TERPISAH ---
import { styleModelDatabase } from './databasemodel.js';

// --- IMPOR AUTH MODULE ---
import { requireAuth, getUser, signOut, UI_TEST_MODE, ROLES } from './auth.js';
import { renderDefectButtons, renderDefectLibrary, renderVendorOptions, getVendors, getUsers, getComponents, getProcesses, syncAllFromSupabase } from './admin.js';
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

// ─── Vendor Button-Selection ──────────────────────────
// State: single selection for vendor
let selectedVendor    = '';
let selectedMaterialType = ''; // '' | 'upper' | 'bottom'

const VENDOR_BTN_CLS    = 'vendor-sel-btn';
const COMPONENT_BTN_CLS = 'component-sel-btn';
const PROCESS_BTN_CLS   = 'process-sel-btn';

function renderVendorButtons() {
    const container = document.getElementById('vendor-btn-container');
    if (!container) return;
    container.innerHTML = '';
    if (!selectedMaterialType) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Pilih material type terlebih dahulu —</span>';
        return;
    }
    const vendors  = getVendors();
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

function renderModalComponentButtons(vendorName) {
    const container = document.getElementById('modal-component-container');
    if (!container) return;
    container.innerHTML = '';
    if (!vendorName) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Pilih vendor di halaman utama terlebih dahulu —</span>';
        return;
    }
    const components = getComponents();
    const vendors    = getVendors();
    const vendor     = vendors.find(v => v.name === vendorName);
    const filtered   = vendor ? components.filter(c => c.vendor_id === vendor.id) : [];
    if (!filtered.length) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Tidak ada component untuk vendor ini —</span>';
        return;
    }
    filtered.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = c.name;
        btn.dataset.value = c.name;
        btn.className = 'modal-comp-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer';
        
        if (modalComponent === c.name) {
            btn.className = 'modal-comp-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-blue-600 border-blue-600 text-white shadow-sm cursor-pointer';
        }
        
        btn.addEventListener('click', () => {
            modalComponent = c.name;
            modalProcess = ''; // Reset process selection
            updateModalComponentButtonsActiveState();
            renderModalProcessButtons(modalComponent);
        });
        container.appendChild(btn);
    });
}

function updateModalComponentButtonsActiveState() {
    document.querySelectorAll('.modal-comp-btn').forEach(btn => {
        if (btn.dataset.value === modalComponent) {
            btn.className = 'modal-comp-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-blue-600 border-blue-600 text-white shadow-sm cursor-pointer';
        } else {
            btn.className = 'modal-comp-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer';
        }
    });
}

function renderModalProcessButtons(componentName) {
    const container = document.getElementById('modal-process-container');
    if (!container) return;
    container.innerHTML = '';
    if (!componentName) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Pilih component terlebih dahulu —</span>';
        return;
    }
    const processes  = getProcesses();
    const components = getComponents();
    const comp       = components.find(c => c.name === componentName);
    const filtered   = comp ? processes.filter(p => p.component_id === comp.id) : [];
    if (!filtered.length) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Tidak ada process untuk component ini —</span>';
        return;
    }
    filtered.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = p.name;
        btn.dataset.value = p.name;
        btn.className = 'modal-proc-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer';
        
        if (modalProcess === p.name) {
            btn.className = 'modal-proc-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-blue-600 border-blue-600 text-white shadow-sm cursor-pointer';
        }
        
        btn.addEventListener('click', () => {
            modalProcess = p.name;
            updateModalProcessButtonsActiveState();
        });
        container.appendChild(btn);
    });
}

function updateModalProcessButtonsActiveState() {
    document.querySelectorAll('.modal-proc-btn').forEach(btn => {
        if (btn.dataset.value === modalProcess) {
            btn.className = 'modal-proc-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-blue-600 border-blue-600 text-white shadow-sm cursor-pointer';
        } else {
            btn.className = 'modal-proc-btn px-3 py-1.5 rounded-full border text-xs transition-colors bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer';
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
    const mtSelectEl = document.getElementById("material-type");
    if (mtSelectEl) mtSelectEl.value = '';
    selectedMaterialType = '';
    selectedVendor = '';
    inspectionItems = [];
    editingItemIndex = null;
    
    // Reset datepickers
    const today = new Date().toISOString().split('T')[0];
    if (tanggalIncomingInput) tanggalIncomingInput.value = today;
    if (tanggalInspectionInput) tanggalInspectionInput.value = today;
    if (tanggalBucketInput) tanggalBucketInput.value = today;
    
    // Reset texts
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
    const fileInput = document.getElementById("evidence-file");
    if (fileInput) fileInput.value = '';
    const container = document.getElementById("evidence-upload-container");
    if (container) container.classList.add('hidden');

    updateTotalQtyInspect();
    checkInfoCompleteAndLockButtons();
    saveToLocalStorage();
}

/**
 * Returns true when all required info is filled so defect/grade buttons can be used.
 */
function isInfoComplete() {
    const tanggal = tanggalIncomingInput ? tanggalIncomingInput.value.trim() : '';
    const style = styleNumberInput ? styleNumberInput.value.trim() : '';
    const model = modelNameInput ? modelNameInput.value.trim() : '';
    return tanggal && selectedVendor && style && model && inspectionItems.length > 0;
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
// 2. Fungsi localStorage Komprehensif (Modifikasi)
// ===========================================

function saveToLocalStorage() {
    try {
        const formData = {
            auditor: auditorSelect ? auditorSelect.value : '',
            modelName: document.getElementById("model-name") ? document.getElementById("model-name").value : '',
            styleNumber: document.getElementById("style-number") ? document.getElementById("style-number").value : '',
            tanggalIncoming: tanggalIncomingInput ? tanggalIncomingInput.value : '',
            tanggalInspection: tanggalInspectionInput ? tanggalInspectionInput.value : '',
            tanggalBucket: tanggalBucketInput ? tanggalBucketInput.value : '',
            materialType: selectedMaterialType,
            vendor: selectedVendor,
            inspectionItems: inspectionItems
        };
        localStorage.setItem(STORAGE_KEYS.FORM_DATA, JSON.stringify(formData));
        localStorage.setItem(STORAGE_KEYS.DEFECT_COUNTS, JSON.stringify(defectCounts));
        localStorage.setItem(STORAGE_KEYS.QTY_OUTPUTS, JSON.stringify(qtyInspectOutputs));

        const stateVariables = {
            selectedDefects: selectedDefects,
            currentInspectionPairs: currentInspectionPairs,
            totalInspected: totalInspected,
            reworkLog: reworkLog
        };
        localStorage.setItem(STORAGE_KEYS.STATE_VARIABLES, JSON.stringify(stateVariables));

    } catch (error) {
        console.error("Error saat menyimpan data ke localStorage:", error);
    }
}

// loadFromLocalStorage dihapus — form selalu dimulai bersih setiap page load.

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

// updateButtonStatesFromLoadedData dihapus — tidak diperlukan karena form selalu fresh.

function clearLocalStorageExceptQtySampleSet() {
    try {
        localStorage.removeItem(STORAGE_KEYS.FORM_DATA);
        localStorage.removeItem(STORAGE_KEYS.DEFECT_COUNTS);
        localStorage.removeItem(STORAGE_KEYS.QTY_OUTPUTS);
        localStorage.removeItem(STORAGE_KEYS.STATE_VARIABLES);
    } catch (error) {
        console.error("Error saat membersihkan localStorage:", error);
    }
}

/** Hapus semua form storage termasuk qtySampleSet. Dipanggil saat refresh/logout. */
function clearAllFormStorage() {
    try {
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

window.__updateDefectCount = function(defectType, position, grade, newValue) {
    const val = parseInt(newValue, 10);
    if (isNaN(val) || val < 1) {
        defectCounts[defectType][position][grade] = 1;
    } else {
        defectCounts[defectType][position][grade] = val;
    }
    saveToLocalStorage();
    updateTotalQtyInspect();
};

window.__removeDefect = function(defectType, position, grade) {
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
        fileName = file.name;
        fileType = file.type;
        if (loadingOverlay) {
            loadingOverlay.classList.add('visible');
        }
        try {
            fileData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            });
        } catch (err) {
            if (loadingOverlay) {
                loadingOverlay.classList.remove('visible');
            }
            showAlert('Gagal membaca file evidence. Coba file lain.', 'error');
            return;
        }
    }

    const fttValueText = fttOutput ? fttOutput.innerText.replace("%", "").trim() : "0";
    const finalFtt = parseFloat(fttValueText) / 100;

    const redoRateValueText = redoRateOutput ? redoRateOutput.innerText.replace("%", "").trim() : "0";
    const finalRedoRate = parseFloat(redoRateValueText) / 100;

    const dataToSend = {
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
            await showAlert('Data berhasil disimpan! (simulasi — tidak ada data yang dikirim ke server)', 'success', '[TEST MODE]');
            appendSessionLog(dataToSend);
            resetAllFields();
            return;
        }
        // ── Akhir UI TESTING MODE ──

        const response = await fetch("https://script.google.com/macros/s/AKfycbxt5mmTI3bTAFMpaDo6VgVoKk8raDecfOoCbqsZgdK1-BwErb-VHROC0RSj8O8NYoR-JA/exec", {
            method: "POST",
            body: JSON.stringify(dataToSend),
        });
        const resultText = await response.text();
        console.log("Respons server:", resultText);
        let parsedResult = {};
        try { parsedResult = JSON.parse(resultText); } catch { /* plain text response */ }
        const isSuccess = response.ok && (parsedResult.status === 'ok' || resultText.toLowerCase().includes('berhasil'));
        if (isSuccess) {
            await showAlert(parsedResult.message || 'Data berhasil disimpan!', 'success', 'Tersimpan!');
            appendSessionLog(dataToSend);
            resetAllFields();
        } else {
            await showAlert(parsedResult.message || resultText || 'Gagal menyimpan data.', 'error');
        }
    } catch (error) {
        console.error("Error saat mengirim data:", error);
        await showAlert('Terjadi kesalahan saat menyimpan data. Periksa koneksi internet.', 'error');
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
    if (!modelName || !styleNumber) {
        showAlert('Harap isi Style Number dan Model Name sebelum menyimpan data.', 'warning', 'Data Tidak Lengkap');
        return false;
    }

    const styleNumberPattern = /^[a-zA-Z0-9]{6}-[a-zA-Z0-9]{3}$/;
    if (!styleNumberPattern.test(styleNumber)) {
        showAlert('Format Style Number tidak sesuai. Contoh: AH1567-100 atau 767688-001', 'warning', 'Format Tidak Valid');
        styleNumberInput.classList.add('invalid-input');
        return false;
    } else {
        styleNumberInput.classList.remove('invalid-input');
    }
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
            }
        });
        
        tbody.appendChild(tr);
    });
}

// Modal Form State Variables
let modalComponent = '';
let modalProcess = '';
let modalSelectedComponent = '';
let modalSelectedProcess = '';
let modalItemDefects = {}; 
let modalPassVal = 0;
let modalDefectVal = 0;
let modalQtyIncomingVal = 0;
let modalQtyInspectVal = 0;

function openInspectionItemModal(index = null) {
    const modal = document.getElementById('inspection-item-modal');
    if (!modal) return;
    
    editingItemIndex = index;
    
    // Clear / Init Modal fields
    const modalTitle = document.getElementById('modal-item-title');
    if (index === null) {
        modalTitle.textContent = 'Tambah Item Inspeksi';
        modalSelectedComponent = '';
        modalSelectedProcess = '';
        modalItemDefects = {};
        modalPassVal = 0;
        modalDefectVal = 0;
        
        // Default quantities
        modalQtyIncomingVal = 0;
        modalQtyInspectVal = 0;
        
        const modalModeSelect = document.getElementById('modal-qty-inspect-mode');
        if (modalModeSelect) modalModeSelect.value = 'manual';
    } else {
        modalTitle.textContent = 'Edit Item Inspeksi';
        const item = inspectionItems[index];
        modalSelectedComponent = item.component;
        modalSelectedProcess = item.process;
        modalQtyIncomingVal = item.qtyIncoming || 0;
        modalQtyInspectVal = item.qtyInspect || 0;
        modalPassVal = item.pass || 0;
        modalDefectVal = item.defect || 0;
        
        // Re-construct modalItemDefects map
        modalItemDefects = {};
        if (Array.isArray(item.defects)) {
            item.defects.forEach(d => {
                modalItemDefects[d.type] = d.count;
            });
        }
        
        const modalModeSelect = document.getElementById('modal-qty-inspect-mode');
        if (modalModeSelect) modalModeSelect.value = 'manual'; // Always default to manual edit mode for previously saved items
    }
    
    // Set inputs values
    const incomingInput = document.getElementById('modal-qty-incoming');
    if (incomingInput) incomingInput.value = modalQtyIncomingVal;
    
    const inspectInput = document.getElementById('modal-qty-inspect');
    if (inspectInput) inspectInput.value = modalQtyInspectVal;
    
    // Handle calculations inside modal
    const modalModeSelect = document.getElementById('modal-qty-inspect-mode');
    const updateModalQtyInspect = () => {
        if (!modalModeSelect || !incomingInput || !inspectInput) return;
        const mode = modalModeSelect.value;
        const incoming = parseInt(incomingInput.value, 10) || 0;
        
        if (mode === 'manual') {
            inspectInput.readOnly = false;
        } else {
            inspectInput.readOnly = true;
            let pct = 0.10;
            if (mode === 'percent_1') pct = 0.01;
            else if (mode === 'percent_5') pct = 0.05;
            else if (mode === 'percent_20') pct = 0.20;
            inspectInput.value = Math.round(incoming * pct);
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
    if (inspectInput) {
        inspectInput.oninput = () => {
            modalQtyInspectVal = parseInt(inspectInput.value, 10) || 0;
            updateModalGradeState();
        };
    }
    
    // Render Modal Components Buttons
    modalComponent = modalSelectedComponent;
    modalProcess = modalSelectedProcess;
    renderModalComponentButtons(selectedVendor);
    renderModalProcessButtons(modalComponent);
    
    // Render modal defect buttons dynamically
    const modalDefectsContainer = document.getElementById('modal-defect-buttons');
    if (modalDefectsContainer) {
        renderDefectButtons(modalDefectsContainer);
        // Bind click event for modal defects catalog
        const modalButtons = modalDefectsContainer.querySelectorAll('.defect-button');
        modalButtons.forEach(button => {
            button.addEventListener('click', () => {
                const defectType = button.dataset.defect || button.textContent.trim();
                window.handleModalDefectClick(defectType);
                button.classList.add('active-feedback');
                setTimeout(() => button.classList.remove('active-feedback'), 200);
            });
        });
    }
    
    // Render logged defects and update numbers
    updateModalGradeState();
    
    // Show Modal
    modal.classList.remove('hidden');
}

function updateModalGradeState() {
    let defectSum = 0;
    for (const type in modalItemDefects) {
        defectSum += modalItemDefects[type] || 0;
    }
    modalDefectVal = defectSum;
    
    modalPassVal = Math.max(0, modalQtyInspectVal - modalDefectVal);
    
    const passCounter = document.getElementById('modal-pass-counter');
    if (passCounter) passCounter.textContent = modalPassVal;
    
    const defectCounter = document.getElementById('modal-defect-counter');
    if (defectCounter) defectCounter.textContent = modalDefectVal;
    
    const inspectInput = document.getElementById('modal-qty-inspect');
    if (inspectInput) inspectInput.value = modalQtyInspectVal;
    
    renderModalLoggedDefects();
}

function renderModalLoggedDefects() {
    const container = document.getElementById('modal-logged-defects');
    if (!container) return;
    container.innerHTML = '';
    
    let hasDefects = false;
    for (const type in modalItemDefects) {
        const count = modalItemDefects[type] || 0;
        if (count > 0) {
            hasDefects = true;
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between py-1 text-xs text-slate-700';
            div.innerHTML = `
                <span class="font-medium">${type}</span>
                <div class="flex items-center gap-1.5">
                    <button type="button" class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-[10px] font-bold rounded hover:bg-slate-200 cursor-pointer" onclick="window.adjustModalDefect('${type}', -1)">-1</button>
                    <span class="font-bold text-slate-800 min-w-[20px] text-center">${count}</span>
                    <button type="button" class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-[10px] font-bold rounded hover:bg-slate-200 cursor-pointer" onclick="window.adjustModalDefect('${type}', 1)">+1</button>
                </div>
            `;
            container.appendChild(div);
        }
    }
    
    if (!hasDefects) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">Belum ada defect yang tercatat.</span>';
    }
}

window.adjustModalDefect = function(defectType, amount) {
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
    
    updateModalGradeState();
};

window.handleModalDefectClick = function(defectType) {
    window.adjustModalDefect(defectType, 1);
};

function closeInspectionItemModal() {
    const modal = document.getElementById('inspection-item-modal');
    if (modal) modal.classList.add('hidden');
    editingItemIndex = null;
}

function saveInspectionItem() {
    if (!modalComponent) {
        showAlert('Silakan pilih Component terlebih dahulu.', 'warning', 'Peringatan');
        return;
    }
    if (!modalProcess) {
        showAlert('Silakan pilih Process terlebih dahulu.', 'warning', 'Peringatan');
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
    
    const defectsArray = [];
    for (const type in modalItemDefects) {
        defectsArray.push({
            type,
            count: modalItemDefects[type]
        });
    }
    
    const itemData = {
        component: modalComponent,
        process: modalProcess,
        qtyIncoming: modalQtyIncomingVal,
        qtyInspect: modalQtyInspectVal,
        pass: modalPassVal,
        defect: modalDefectVal,
        defects: defectsArray
    };
    
    if (editingItemIndex === null) {
        const duplicate = inspectionItems.some(item => item.component === modalComponent && item.process === modalProcess);
        if (duplicate) {
            showAlert(`Kombinasi Component (${modalComponent}) dan Process (${modalProcess}) sudah ada di daftar. Silakan edit item yang ada.`, 'warning', 'Kombinasi Duplikat');
            return;
        }
        inspectionItems.push(itemData);
    } else {
        const duplicate = inspectionItems.some((item, index) => index !== editingItemIndex && item.component === modalComponent && item.process === modalProcess);
        if (duplicate) {
            showAlert(`Kombinasi Component (${modalComponent}) dan Process (${modalProcess}) sudah ada di daftar.`, 'warning', 'Kombinasi Duplikat');
            return;
        }
        inspectionItems[editingItemIndex] = itemData;
    }
    
    closeInspectionItemModal();
    renderInspectedItems();
    updateTotalQtyInspect();
    checkInfoCompleteAndLockButtons();
}

// ===========================================
// FUNGSI BARU: Auto-fill Model Name berdasarkan Style Number
// ===========================================
function autoFillModelName() {
    if (!styleNumberInput || !modelNameInput) {
        console.error("Elemen Style Number atau Model Name tidak ditemukan.");
        return;
    }

    const enteredStyleNumber = styleNumberInput.value.trim().toUpperCase();
    
    const matchedModel = styleModelDatabase[enteredStyleNumber];

    if (matchedModel) {
        modelNameInput.value = matchedModel;
        modelNameInput.disabled = true;
    } else {
        modelNameInput.value = "";
        modelNameInput.disabled = false;
    }
    checkInfoCompleteAndLockButtons();
}

// ===========================================
// 16. Inisialisasi Aplikasi dan Event Listeners
// ===========================================
async function initApp() {
    // Selalu mulai dengan state bersih — tidak memuat form data dari sesi sebelumnya
    clearAllFormStorage();
    console.log("Menginisialisasi aplikasi...");

    // --- AUTH GUARD: Selalu aktif. Perangkat baru/tanpa sesi → redirect login ---
    const session = await requireAuth();
    if (!session) return;

    // Tampilkan nama user yang sedang login di header
    const user = await getUser();
    const userDisplayEl = document.getElementById('user-display');
    if (userDisplayEl && user) {
        const displayName = user.user_metadata?.display_name || user.user_metadata?.nik || 'User';
        userDisplayEl.textContent = displayName;
    }

    // Sembunyikan tombol statistik untuk inspector (hanya supervisor/manager/admin)
    const userRole = user?.user_metadata?.role || ROLES.INSPECTOR;
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



    // Hide settings nav items for non-admin roles (only admin sees it)
    if (userRole !== ROLES.ADMIN) {
        document.querySelectorAll('[data-view="settings"]').forEach(el => { el.style.display = 'none'; });
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
        'pass':   document.getElementById('pass-counter'),
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

    // Populate Approved by Leader Select Options
    const leaderSelect = document.getElementById('approved-by-leader');
    if (leaderSelect) {
        leaderSelect.innerHTML = '<option value="">— Tanpa Persetujuan —</option>';
        try {
            const leaders = getUsers().filter(u => u.role === 'supervisor' || u.role === 'admin' || u.role === 'manager');
            leaders.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.display_name || u.nik;
                opt.textContent = `${u.display_name || u.nik} (${u.role})`;
                leaderSelect.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to populate leaders select:', e);
        }
        
        leaderSelect.addEventListener('change', () => {
            const container = document.getElementById('evidence-upload-container');
            const fileInput = document.getElementById('evidence-file');
            if (container) {
                if (leaderSelect.value) {
                    container.classList.remove('hidden');
                } else {
                    container.classList.add('hidden');
                    if (fileInput) fileInput.value = '';
                }
            }
        });
    }

    // Render defect buttons dynamically from admin-managed catalog (not rendering flat defect buttons anymore)
    renderDefectLibrary();
    // Show admin nav items for admin role
    if (userRole === ROLES.ADMIN) {
        document.querySelectorAll('[data-view="admin"]').forEach(el => { el.style.display = ''; });
    }

    defectButtons = document.querySelectorAll('.defect-button');
    gradeInputButtons = document.querySelectorAll('.input-button');

    auditorSelect = document.getElementById('auditor');
    modelNameInput = document.getElementById("model-name");
    styleNumberInput = document.getElementById("style-number");
    tanggalIncomingInput = document.getElementById('tanggal-incoming');
    vendorSelect    = document.getElementById('vendor');
    if (vendorSelect) renderVendorOptions(vendorSelect);
    
    // Render new button-based selectors
    renderVendorButtons();
    
    window.__reattachVendorOptions    = () => { renderVendorButtons(); };
    window.__reattachComponentOptions = () => { };
    window.__reattachProcessOptions   = () => { };

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
                const vendor  = vendors.find(v => v.name === selectedVendor);
                if (!vendor || (selectedMaterialType && vendor.material_type !== selectedMaterialType)) {
                    selectedVendor     = '';
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
    if (tanggalInspectionInput && !tanggalInspectionInput.value) {
        tanggalInspectionInput.value = todayStr;
    }
    if (tanggalBucketInput && !tanggalBucketInput.value) {
        tanggalBucketInput.value = todayStr;
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

    if (tanggalIncomingInput) tanggalIncomingInput.addEventListener('change', () => {
        saveToLocalStorage();
        checkInfoCompleteAndLockButtons();
    });
    if (tanggalInspectionInput) tanggalInspectionInput.addEventListener('change', saveToLocalStorage);
    if (tanggalBucketInput) tanggalBucketInput.addEventListener('change', saveToLocalStorage);

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

    console.log("Aplikasi berhasil diinisialisasi.");
}

document.addEventListener('DOMContentLoaded', initApp);

// ===========================================
// 17. Announcement Logic
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    const announcements = [
        { 
            date: "06-03-2025", 
            text: `E-QMS kini hadir dalam versi web sebagai upgrade dari sistem berbasis Google Spreadsheet, menawarkan kemudahan input bagi auditor, akurasi data yang lebih baik, serta mengurangi risiko human error maupun kendala teknis pada sistem lama. Implementasi E-QMS Web App merupakan bagian dari komitmen kami dalam digitalisasi proses mutu, sejalan dengan visi untuk menciptakan operasional yang agile, data-driven, dan berkelanjutan.

Apabila terdapat kendala teknis, silakan hubungi nomor berikut: 088972745194.`
        },
        {  
            date: "06-30-2025",
            text: `🛠️ FTT Sampling App Update v.2025.06

🎨 Tampilan & UI
1. Memperbaiki warna menu grade-defect yang secara fungsi aktif namun secara visual terlihat tidak aktif
2. Memperbarui ukuran frame antar section
3. Menambahkan highlight pada defect yang dipilih
4. Menambahkan tombol menu untuk dashboard data statistik
5. Mengimplementasikan overlay loading

🧩 Logika Inspeksi & Validasi
1. Membuat pola inspeksi untuk multi-defect dan multi-position
2. Mengembangkan logika pencegah double-click pada fitur defect position
3. Membuat logika agar setiap inspeksi hanya boleh berisi satu pairs defect position
4. Mengaktifkan pilihan grade-defect hanya jika defect position diklik
5. Menonaktifkan opsi A-grade ketika defect ditemukan
6. Membuat logika agar saat memilih B/C-grade, posisi defect tidak disimpan ke bagian rework
7. Membuat logika agar jumlah B/C-grade tidak memengaruhi perhitungan rework rate
8. Menambahkan validasi bahwa jumlah inspeksi tidak boleh melebihi 50/24

🔢 Counter, Grade, dan Nilai
1. Menambahkan nilai hitung ke masing-masing counter grade
2. Mengubah nilai counter defect-left dan defect-right menjadi 0.5
3. Menyesuaikan formula perhitungan FTT dan rework rate dengan pola nilai defect position yang baru

📦 Data Handling & Penyimpanan
1. Memastikan seluruh data input tersimpan dengan benar di localStorage
2. Mengimplementasikan validasi localStorage agar data tetap tersimpan meski browser ditutup atau di-refresh
3. Mengoptimasi keamanan dan volume data input API
4. Mengoptimasi batas permintaan (request limits) pada Vercel
5. Menerapkan rate limiting pada Vercel Functions
6. Menyimpan nilai yang tepat untuk Rework Left, Right, dan Pairs ke dalam database`
        },
        {  
            date: "07-31-2025", 
            text: `🛠️ FTT Sampling App Update v.2025.07 – Dashboard Enhancement & Maintenance

📊 Statistical Dashboard Upgrade
1. Menambahkan filter: Start/End Date, Auditor, NCVS, Model, Style Number
2. Mengimplementasikan bar, pie, dan line chart untuk FTT, defect, dan grade
3. Menampilkan Avg. FTT, Rework Rate, dan A-Grade Ratio (%, 2 desimal)
4. Menyesuaikan label, axis, dan format tanggal pada chart
5. Membatasi jumlah data point dan menambahkan opsi rentang waktu dinamis

📄 Full Inspection Data
1. Menambahkan fitur sort, filter, dan quick filter
2. Merapikan struktur, alignment, dan default view tabel

⚙️ Functional & UI Maintenance
1. Memformat seluruh metrik ke persen, presisi 2 desimal
2. Menyempurnakan spacing antar section dan konsistensi judul
3. Menambahkan input validation saat user mengakses menu B-Grade atau C-Grade
4. Menambahkan fitur auto-fill pada field model name berdasarkan input style number

🧱 Code Structure & Integration
1. Modularisasi HTML, CSS, JS untuk maintainability
2. Menghubungkan dashboard ke halaman utama aplikasi
3. Menambahkan tombol "Back to Main Page"
4. Optimasi load data dan refactor script untuk performa lebih baik`
        },
    ];
    let currentAnnouncementIndex = 0;
    let viewedAnnouncements = JSON.parse(localStorage.getItem('viewedAnnouncements')) || [];
    const announcementPopup = document.getElementById('announcement-popup');
    const announcementDateElement = document.getElementById('date-text');
    const announcementTextElement = document.getElementById('announcement-text');
    const announcementButton = document.getElementById('announcement-button');
    const closeButton = document.querySelector('#announcement-popup .close-button');
    const prevButton = document.getElementById('prev-announcement');
    const nextButton = document.getElementById('next-announcement');

    function showAnnouncement(index) {
        if (!announcementPopup || !announcementDateElement || !announcementTextElement || announcements.length === 0) return;

        currentAnnouncementIndex = index;
        announcementDateElement.textContent = announcements[index].date;
        announcementTextElement.innerHTML = announcements[index].text.replace(/\n/g, '<br>'); 
        announcementPopup.style.display = 'block';

        const announcementIdentifier = `${announcements[index].date}-${announcements[index].text.substring(0, 20)}`;
        if (!viewedAnnouncements.includes(announcementIdentifier)) {
            viewedAnnouncements.push(announcementIdentifier);
            localStorage.setItem('viewedAnnouncements', JSON.stringify(viewedAnnouncements));
        }
    }

    function closeAnnouncement() {
        if (announcementPopup) announcementPopup.style.display = 'none';
    }

    function nextAnnouncement() {
        if (announcements.length === 0) return;
        const nextIndex = (currentAnnouncementIndex + 1) % announcements.length;
        showAnnouncement(nextIndex);
    }

    function prevAnnouncement() {
        if (announcements.length === 0) return;
        const prevIndex = (currentAnnouncementIndex - 1 + announcements.length) % announcements.length;
        showAnnouncement(prevIndex);
    }

    if (announcementButton) {
        announcementButton.addEventListener('click', () => {
            if (announcements.length > 0) showAnnouncement(currentAnnouncementIndex);
        });
    }
    if (closeButton) closeButton.addEventListener('click', closeAnnouncement);
    if (prevButton) prevButton.addEventListener('click', prevAnnouncement);
    if (nextButton) nextButton.addEventListener('click', nextAnnouncement);

    if (announcements.length > 0) {
        let firstUnreadIndex = -1;
        for (let i = 0; i < announcements.length; i++) {
            const announcementIdentifier = `${announcements[i].date}-${announcements[i].text.substring(0, 20)}`;
            if (!viewedAnnouncements.includes(announcementIdentifier)) {
                firstUnreadIndex = i;
                break;
            }
        }
        if (firstUnreadIndex !== -1) {
            showAnnouncement(firstUnreadIndex);
        } else {
            currentAnnouncementIndex = announcements.length - 1;
        }
    }
});

// ===========================================
// Helper: Append session to localStorage log
// ===========================================
function appendSessionLog(data) {
    try {
        const raw = localStorage.getItem('sessionLog');
        const log = raw ? JSON.parse(raw) : [];
        log.push({
            timestamp: data.timestamp,
            auditor: data.auditor,
            modelName: data.modelName,
            styleNumber: data.styleNumber,
            qtyInspect: data.qtyInspect,
            ftt: Math.round((data.ftt || 0) * 100),
        });
        // Keep only last 200 entries to avoid storage bloat
        if (log.length > 200) log.splice(0, log.length - 200);
        localStorage.setItem('sessionLog', JSON.stringify(log));
    } catch (e) {
        console.warn('Could not write session log:', e);
    }
}

