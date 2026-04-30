// ===========================================
// 1. Deklarasi Variabel Global dan DOM References (Modifikasi)
// ===========================================
// --- IMPOR DATABASE DARI FILE TERPISAH ---
import { styleModelDatabase } from './databasemodel.js';

// --- IMPOR AUTH MODULE ---
import { requireAuth, getUser, signOut, UI_TEST_MODE, ROLES } from './auth.js';
import { renderDefectButtons, renderDefectLibrary, renderVendorOptions, getVendors, getComponents, getProcesses, syncAllFromSupabase } from './admin.js';

let totalInspected = 0;
let defectCounts = {}; 

// --- VARIABEL UNTUK POLA MULTIPLE DEFECT ---
let selectedDefects = []; 
let currentInspectionPairs = []; 

// --- REWORK LOG: menyimpan posisi rework per item untuk kalkulasi FTT ---
// Karena posisi L/R/Pairs dihilangkan, default selalu 'PAIRS'
let reworkLog = [];
// ---------------------------------------------

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

// ─── Vendor / Component / Process Button-Selection ──────────────────────────
// State: single selection for vendor, multi for component & process
let selectedVendor    = '';
let selectedComponents = [];  // array of names
let selectedProcesses  = [];  // array of names
let selectedMaterialType = ''; // '' | 'upper' | 'bottom'

const VENDOR_BTN_CLS    = 'vendor-sel-btn';
const COMPONENT_BTN_CLS = 'component-sel-btn';
const PROCESS_BTN_CLS   = 'process-sel-btn';

function renderVendorButtons() {
    const vendors   = getVendors();
    const container = document.getElementById('vendor-btn-container');
    if (!container) return;
    container.innerHTML = '';
    const filtered = selectedMaterialType
        ? vendors.filter(v => v.material_type === selectedMaterialType)
        : vendors;
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
            selectedComponents = [];
            selectedProcesses  = [];
            refreshVendorButtons();
            renderComponentButtons(selectedVendor);
            renderProcessButtons([]);
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

function renderComponentButtons(vendorName) {
    const components = getComponents();
    const vendors    = getVendors();
    const container  = document.getElementById('component-btn-container');
    if (!container) return;
    container.innerHTML = '';
    let filtered = components;
    if (vendorName) {
        const vendor = vendors.find(v => v.name === vendorName);
        filtered = vendor ? components.filter(c => c.vendor_id === vendor.id) : [];
    }
    if (!filtered.length) {
        container.innerHTML = '<span class="text-xs text-slate-400 italic">— Pilih vendor terlebih dahulu —</span>';
        return;
    }
    filtered.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = c.name;
        btn.dataset.value = c.name;
        btn.className = `${COMPONENT_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
            bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300`;
        if (selectedComponents.includes(c.name)) applyComponentActive(btn);
        btn.addEventListener('click', () => {
            const idx = selectedComponents.indexOf(c.name);
            if (idx > -1) selectedComponents.splice(idx, 1);
            else selectedComponents.push(c.name);
            refreshComponentButtons();
            rebuildProcessButtons();
            checkInfoCompleteAndLockButtons();
            saveToLocalStorage();
        });
        container.appendChild(btn);
    });
}

function refreshComponentButtons() {
    document.querySelectorAll(`.${COMPONENT_BTN_CLS}`).forEach(btn => {
        if (selectedComponents.includes(btn.dataset.value)) applyComponentActive(btn);
        else applyComponentInactive(btn);
    });
}

function applyComponentActive(btn) {
    btn.className = `${COMPONENT_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
        bg-blue-600 border-blue-600 text-white shadow-sm`;
}
function applyComponentInactive(btn) {
    btn.className = `${COMPONENT_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
        bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300`;
}

function rebuildProcessButtons() {
    renderProcessButtons(selectedComponents);
    // Remove any selected processes no longer in the new list
    const processes  = getProcesses();
    const components = getComponents();
    const compIds    = components.filter(c => selectedComponents.includes(c.name)).map(c => c.id);
    const available  = [...new Set(processes.filter(p => compIds.includes(p.component_id)).map(p => p.name))];
    selectedProcesses = selectedProcesses.filter(p => available.includes(p));
}

function renderProcessButtons(componentNames) {
    const processes  = getProcesses();
    const components = getComponents();
    const container  = document.getElementById('process-btn-container');
    if (!container) return;
    container.innerHTML = '';
    const compIds  = components.filter(c => componentNames.includes(c.name)).map(c => c.id);
    const filtered = [...new Set(processes.filter(p => compIds.includes(p.component_id)).map(p => p.name))];
    if (!filtered.length) {
        container.innerHTML = componentNames.length
            ? '<span class="text-xs text-slate-400 italic">— Tidak ada process —</span>'
            : '<span class="text-xs text-slate-400 italic">— Pilih component terlebih dahulu —</span>';
        return;
    }
    filtered.forEach(name => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = name;
        btn.dataset.value = name;
        btn.className = `${PROCESS_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
            bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300`;
        if (selectedProcesses.includes(name)) applyProcessActive(btn);
        btn.addEventListener('click', () => {
            const idx = selectedProcesses.indexOf(name);
            if (idx > -1) selectedProcesses.splice(idx, 1);
            else selectedProcesses.push(name);
            refreshProcessButtons();
            checkInfoCompleteAndLockButtons();
            saveToLocalStorage();
        });
        container.appendChild(btn);
    });
}

function refreshProcessButtons() {
    document.querySelectorAll(`.${PROCESS_BTN_CLS}`).forEach(btn => {
        if (selectedProcesses.includes(btn.dataset.value)) applyProcessActive(btn);
        else applyProcessInactive(btn);
    });
}

function applyProcessActive(btn) {
    btn.className = `${PROCESS_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
        bg-blue-600 border-blue-600 text-white shadow-sm`;
}
function applyProcessInactive(btn) {
    btn.className = `${PROCESS_BTN_CLS} px-4 py-2 rounded-full border font-body-md text-body-md text-sm transition-colors 
        bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300`;
}

/**
 * Reset only the Context Selection (Vendor / Component / Process) without clearing other form fields.
 */
function resetContextSelection() {
    selectedMaterialType = '';
    const mtSelectEl = document.getElementById('material-type');
    if (mtSelectEl) mtSelectEl.value = '';
    selectedVendor    = '';
    selectedComponents = [];
    selectedProcesses  = [];
    renderVendorButtons();
    renderComponentButtons('');
    renderProcessButtons([]);
    checkInfoCompleteAndLockButtons();
    saveToLocalStorage();
}

/**
 * Returns true when all required info is filled so defect/grade buttons can be used.
 */
function isInfoComplete() {
    const qty = parseInt(qtySampleSetInput ? qtySampleSetInput.value : '0', 10);
    const tanggal = tanggalIncomingInput ? tanggalIncomingInput.value.trim() : '';
    return qty > 0 && tanggal && selectedVendor && selectedComponents.length > 0 && selectedProcesses.length > 0;
}

/**
 * Lock or unlock defect + grade buttons based on info completeness.
 * Also updates a visual hint banner.
 */
function checkInfoCompleteAndLockButtons() {
    const complete = isInfoComplete();
    const hint = document.getElementById('inspection-info-hint');
    if (hint) hint.classList.toggle('hidden', complete);

    if (!complete) {
        toggleButtonGroup(defectButtons, false);
        toggleButtonGroup(gradeInputButtons, false);
    } else {
        // Re-evaluate based on limit
        updateButtonStatesBasedOnLimit();
        if (currentInspectionLimit > 0 && totalInspected < currentInspectionLimit) {
            if (selectedDefects.length === 0 && currentInspectionPairs.length === 0) {
                initButtonStates();
            }
        }
    }
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
            materialType: selectedMaterialType,
            vendor: selectedVendor,
            component: selectedComponents,
            process: selectedProcesses
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

function loadFromLocalStorage() {
    try {
        const savedFormData = localStorage.getItem(STORAGE_KEYS.FORM_DATA);
        if (savedFormData) {
            const formData = JSON.parse(savedFormData);
            // Only restore auditor if not locked by session
            if (auditorSelect && !auditorSelect.dataset.sessionLocked) {
                auditorSelect.value = formData.auditor || '';
            }
            if (document.getElementById("model-name")) document.getElementById("model-name").value = formData.modelName || '';
            if (document.getElementById("style-number")) document.getElementById("style-number").value = formData.styleNumber || '';
            if (tanggalIncomingInput && formData.tanggalIncoming) tanggalIncomingInput.value = formData.tanggalIncoming;
            // Restore material type filter
            selectedMaterialType = formData.materialType || '';
            const mtSelect = document.getElementById('material-type');
            if (mtSelect) mtSelect.value = selectedMaterialType;
            // Restore vendor button selection
            selectedVendor = formData.vendor || '';
            renderVendorButtons();
            // Restore component button selection
            renderComponentButtons(selectedVendor);
            const compVals = Array.isArray(formData.component)
                ? formData.component
                : (formData.component ? [formData.component] : []);
            selectedComponents = compVals;
            refreshComponentButtons();
            // Restore process button selection
            rebuildProcessButtons();
            const procVals = Array.isArray(formData.process)
                ? formData.process
                : (formData.process ? [formData.process] : []);
            selectedProcesses = procVals;
            refreshProcessButtons();
        }

        const savedDefectCounts = localStorage.getItem(STORAGE_KEYS.DEFECT_COUNTS);
        if (savedDefectCounts) {
            defectCounts = JSON.parse(savedDefectCounts);
        }

        const savedQtyOutputs = localStorage.getItem(STORAGE_KEYS.QTY_OUTPUTS);
        if (savedQtyOutputs) {
            const qtyData = JSON.parse(savedQtyOutputs);
            for (const grade in qtyData) {
                qtyInspectOutputs[grade] = qtyData[grade];
            }
        }

        const savedStateVariables = localStorage.getItem(STORAGE_KEYS.STATE_VARIABLES);
        if (savedStateVariables) {
            const stateData = JSON.parse(savedStateVariables);
            selectedDefects = stateData.selectedDefects || [];
            currentInspectionPairs = stateData.currentInspectionPairs || [];
            totalInspected = stateData.totalInspected || 0;
            reworkLog = stateData.reworkLog || [];
        }
        
        // Memuat Qty Sample Set
        const savedQtySampleSet = localStorage.getItem(STORAGE_KEYS.QTY_SAMPLE_SET);
        if (qtySampleSetInput && savedQtySampleSet) {
            qtySampleSetInput.value = parseInt(savedQtySampleSet, 10) >= 0 ? savedQtySampleSet : '0';
            currentInspectionLimit = parseInt(savedQtySampleSet, 10) || 0;
        }
        
        // Update semua tampilan berdasarkan data yang dimuat
        updateAllDisplays();
        updateButtonStatesFromLoadedData();

    } catch (error) {
        console.error("Error saat memuat data dari localStorage:", error);
        resetAllFields();
    }
}

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

function updateButtonStatesFromLoadedData() {
    // Reset semua highlight dan state
    defectButtons.forEach(btn => btn.classList.remove('active'));
    
    // Highlight defect yang sedang dipilih dari data yang di-load
    selectedDefects.forEach(defectName => {
        const button = Array.from(defectButtons).find(btn => (btn.dataset.defect || btn.textContent.trim()) === defectName);
        if (button) button.classList.add('active');
    });

    updateAGradeButtonState();
    updateQtySectionState();
}

function clearLocalStorageExceptQtySampleSet() {
    try {
        localStorage.removeItem(STORAGE_KEYS.FORM_DATA);
        localStorage.removeItem(STORAGE_KEYS.DEFECT_COUNTS);
        localStorage.removeItem(STORAGE_KEYS.QTY_OUTPUTS);
        localStorage.removeItem(STORAGE_KEYS.STATE_VARIABLES);
        console.log("localStorage dibersihkan (kecuali qty sample set)");
    } catch (error) {
        console.error("Error saat membersihkan localStorage:", error);
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
    const saveButton = document.querySelector('.save-button');
    if (!saveButton) return;
    const minInspected = currentInspectionLimit > 0 ? Math.ceil(currentInspectionLimit * 0.1) : 1;
    const ready = currentInspectionLimit > 0 && totalInspected >= minInspected;
    saveButton.disabled = !ready;
    saveButton.classList.toggle('opacity-50', !ready);
    saveButton.classList.toggle('cursor-not-allowed', !ready);
    const hint = document.getElementById('save-progress-hint');
    if (hint) {
        if (currentInspectionLimit > 0) {
            hint.textContent = `Terinsepksi: ${totalInspected} / ${minInspected} min (10% dari ${currentInspectionLimit})`;
            hint.classList.toggle('hidden', ready);
        } else {
            hint.classList.add('hidden');
        }
    }
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
    const hasReachedLimit = totalInspected >= currentInspectionLimit && currentInspectionLimit > 0;
    if (hasReachedLimit) {
        toggleButtonGroup(defectButtons, false);
        toggleButtonGroup(gradeInputButtons, false);
        defectButtons.forEach(btn => btn.classList.remove('active'));
        gradeInputButtons.forEach(btn => btn.classList.remove('active'));
    } else if (currentInspectionLimit > 0) {
        if (selectedDefects.length === 0 && currentInspectionPairs.length === 0) {
            initButtonStates();
        }
    }
}

// ===========================================
// 4. Fungsi Utama: Inisialisasi Status Tombol
// ===========================================
function initButtonStates() {
    // Reset variabel state untuk siklus baru
    selectedDefects = [];
    currentInspectionPairs = [];

    // Reset tampilan visual tombol
    defectButtons.forEach(btn => btn.classList.remove('active'));
    
    // Aktifkan semua tombol defect
    toggleButtonGroup(defectButtons, true);

    updateAGradeButtonState();
    updateQtySectionState();
    
    // Cek batas inspeksi
    if (totalInspected >= currentInspectionLimit && currentInspectionLimit > 0) {
        toggleButtonGroup(defectButtons, false);
        toggleButtonGroup(gradeInputButtons, false);
    }
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
    // All rework items default to 'PAIRS' position
    const finalReworkPairs = reworkLog.length;
    return {
        finalReworkPairs,
        finalReworkKiri: 0,
        finalReworkKanan: 0,
        calculatedTotal: finalReworkPairs
    };
}

// ===========================================
// 7. Update Total Qty Inspect (termasuk FTT dan Redo Rate) (Perbaikan)
// ===========================================
function updateTotalQtyInspect() {
    let total = 0;
    for (const category in qtyInspectOutputs) {
        total += qtyInspectOutputs[category];
    }
    if (qtyInspectOutput) {
        qtyInspectOutput.textContent = total;
    }
    totalInspected = total;
    updateFTT();
    updateRedoRate();
    saveToLocalStorage();
    updateSaveButtonState();

    // Gunakan fungsi baru untuk mengecek limit
    updateButtonStatesBasedOnLimit();
}

// ===========================================
// 8. Menambahkan Defect ke Summary List (Logika Baru)
// ===========================================
function addAllDefectsToSummary(finalGrade) {
    if (currentInspectionPairs.length === 0 || !finalGrade) {
        console.warn("addDefectsToSummary: Tidak ada pasangan defect/posisi untuk dicatat.");
        return;
    }

    currentInspectionPairs.forEach(pair => {
        const { type, position } = pair;

        if (!defectCounts[type]) {
            defectCounts[type] = { "LEFT": {}, "PAIRS": {}, "RIGHT": {} };
        }
        if (!defectCounts[type][position]) {
            defectCounts[type][position] = {};
        }
        if (!defectCounts[type][position][finalGrade]) {
            defectCounts[type][position][finalGrade] = 0;
        }

        defectCounts[type][position][finalGrade]++;
    });

    console.log("defectCounts diupdate:", JSON.stringify(defectCounts));
    saveToLocalStorage();
}

// ===========================================
// 9. Menampilkan Summary Defect
// ===========================================
function updateDefectSummaryDisplay() {
    if (!summaryContainer) return;

    summaryContainer.innerHTML = '';
    const gradeOrder = ['defect'];
    const positionOrder = ['LEFT', 'PAIRS', 'RIGHT'];

    const summaryItems = [];

    for (const defectType in defectCounts) {
        for (const position of positionOrder) {
            if (defectCounts[defectType][position]) {
                for (const displayGrade of gradeOrder) {
                    if (defectCounts[defectType][position][displayGrade] && defectCounts[defectType][position][displayGrade] > 0) {
                        const count = defectCounts[defectType][position][displayGrade];
                        const item = document.createElement('div');
                        item.className = 'summary-item';
                        item.innerHTML = `
                            <div class="defect-col">${defectType}</div>
                            <div class="position-col">${position}</div>
                            <div class="level-col">DEFECT <span class="count">${count}</span></div>
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

// ===========================================
// 10. Event Handlers untuk Tombol (LOGIKA INTI BARU)
// ===========================================

// --- FUNGSI PEMBANTU UNTUK MENGONTROL QTY SECTION ---
// Grade buttons (except A) are enabled when defects are selected
function updateQtySectionState() {
    // Enable Defect button only when defects are selected
    const enable = selectedDefects.length > 0;
    gradeInputButtons.forEach(btn => {
        if (!btn.classList.contains('pass')) {
            btn.disabled = !enable;
            btn.classList.toggle('inactive', !enable);
        }
    });
}

// Handler untuk klik tombol Defect Menu Item
function handleDefectClick(button) {
    const defectName = button.dataset.defect || button.textContent.trim();
    const index = selectedDefects.indexOf(defectName);

    if (index > -1) {
        selectedDefects.splice(index, 1);
        button.classList.remove('active');
    } else {
        selectedDefects.push(defectName);
        button.classList.add('active');
    }

    // Grade buttons (except A) become available once defects are selected
    updateQtySectionState();
    updateAGradeButtonState();
    saveToLocalStorage();
}

// Handler untuk klik tombol Qty Section (Pass / Defect)
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

    const fttValueText = fttOutput ? fttOutput.innerText.replace("%", "").trim() : "0";
    const finalFtt = parseFloat(fttValueText) / 100;

    const redoRateValueText = redoRateOutput ? redoRateOutput.innerText.replace("%", "").trim() : "0";
    const finalRedoRate = parseFloat(redoRateValueText) / 100;

    const defectsToSend = [];
    for (const defectType in defectCounts) {
        for (const position in defectCounts[defectType]) {
            for (const grade in defectCounts[defectType][position]) {
                const count = defectCounts[defectType][position][grade];
                if (count > 0) {
                    defectsToSend.push({
                        type: defectType,
                        position: position,
                        level: grade,
                        count: count
                    });
                }
            }
        }
    }

    const dataToSend = {
        timestamp: new Date().toISOString(),
        auditor: document.getElementById("auditor").value,
        tanggalIncoming: document.getElementById("tanggal-incoming") ? document.getElementById("tanggal-incoming").value : '',
        materialType: selectedMaterialType || '',
        vendor: selectedVendor,
        component: selectedComponents.join(', '),
        process: selectedProcesses.join(', '),
        modelName: document.getElementById("model-name").value,
        styleNumber: document.getElementById("style-number").value,
        qtyIncoming: qtySampleSetInput ? parseInt(qtySampleSetInput.value, 10) || 0 : 0,
        qtyInspect: totalInspected,
        ftt: finalFtt,
        redoRate: finalRedoRate,
        "pass": qtyInspectOutputs['pass'],
        "defect": qtyInspectOutputs['defect'],
        defects: defectsToSend,
    };

    console.log("Data yang akan dikirim (setelah diproses):", JSON.stringify(dataToSend, null, 2));

    const saveButton = document.querySelector(".save-button");
    saveButton.disabled = true;
    saveButton.textContent = "MENYIMPAN...";

    if (loadingOverlay) {
        loadingOverlay.classList.add('visible');
    }

    try {
        // ── UI TESTING MODE: Skip POST ke GAS, simulasikan respons sukses ──
        if (UI_TEST_MODE) {
            console.log("[TEST MODE] Data yang akan dikirim:", JSON.stringify(dataToSend, null, 2));
            alert("[TEST MODE] Data berhasil disimpan! (simulasi — tidak ada data yang dikirim ke server)");
            appendSessionLog(dataToSend);
            resetAllFields();
            return;
        }
        // ── Akhir UI TESTING MODE ──

        const response = await fetch("https://script.google.com/macros/s/AKfycbz6MSvAqN2vhsasQ-fK_2hxgOkeue3zlc5TsfyLISX8VydruDi5CdTsDgmyPXozv3SB/exec", {
            method: "POST",
            body: JSON.stringify(dataToSend),
        });
        const resultText = await response.text();
        console.log("Respons server:", resultText);
        alert(resultText);

        if (response.ok && resultText.toLowerCase().includes("berhasil")) {
            appendSessionLog(dataToSend);
            resetAllFields();
        } 
    } catch (error) {
        console.error("Error saat mengirim data:", error);
        alert("Terjadi kesalahan saat menyimpan data.");
    } finally {
        if (loadingOverlay) {
            loadingOverlay.classList.remove('visible');
        }

        saveButton.textContent = "SIMPAN";
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
        alert("Harap login terlebih dahulu sebelum menyimpan data.");
        return false;
    }
    if (!tanggalIncoming) {
        alert("Harap isi Tanggal Incoming sebelum menyimpan data.");
        return false;
    }
    if (!selectedVendor) {
        alert("Harap pilih Vendor sebelum menyimpan data.");
        return false;
    }
    if (!selectedComponents.length) {
        alert("Harap pilih Component sebelum menyimpan data.");
        return false;
    }
    if (!selectedProcesses.length) {
        alert("Harap pilih Process sebelum menyimpan data.");
        return false;
    }
    if (!modelName || !styleNumber) {
        alert("Harap isi Style Number dan Model Name sebelum menyimpan data.");
        return false;
    }

    const styleNumberPattern = /^[a-zA-Z0-9]{6}-[a-zA-Z0-9]{3}$/;
    if (!styleNumberPattern.test(styleNumber)) {
        alert("Format Style Number tidak sesuai. Contoh: AH1567-100 atau 767688-001");
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
        alert('Jika ada item Defect, harap pastikan setidaknya ada satu defect yang tercatat sebelum menyimpan data!');
        return false;
    }
    return true;
}

// ===========================================
// 14. Validasi Qty Sample Set
// ===========================================
function validateQtySampleSet() {
    if (!qtySampleSetInput) {
        console.error("Elemen qty-sample-set tidak ditemukan!");
        return false;
    }

    const qtySampleSetValue = parseInt(qtySampleSetInput.value, 10);

    if (isNaN(qtySampleSetValue) || qtySampleSetValue <= 0) {
        alert("Harap masukkan Jumlah Qty Sample Set yang valid dan lebih dari 0.");
        return false;
    }

    const currentTotalInspect = totalInspected;

    if (currentTotalInspect !== qtySampleSetValue) {
        alert(`Jumlah total Qty Inspect (${currentTotalInspect}) harus sama dengan Qty Sample Set (${qtySampleSetValue}).`);
        return false;
    }

    return true;
}

// ===========================================
// 15. Reset Semua Field Setelah Simpan (Modifikasi)
// ===========================================
function resetAllFields() {
    // Restore auditor from session (readonly field stays unchanged)
    document.getElementById("model-name").value = "";
    const styleNumberEl = document.getElementById("style-number");
    if (styleNumberEl) {
        styleNumberEl.value = "";
        styleNumberEl.classList.remove('invalid-input');
    }
    // Reset new fields (except tanggal-incoming which resets to today)
    if (vendorSelect) vendorSelect.value = "";
    selectedMaterialType = '';
    const mtSelectEl = document.getElementById('material-type');
    if (mtSelectEl) mtSelectEl.value = '';
    selectedVendor = '';
    selectedComponents = [];
    selectedProcesses  = [];
    renderVendorButtons();
    renderComponentButtons('');
    renderProcessButtons([]);
    if (tanggalIncomingInput) tanggalIncomingInput.value = new Date().toISOString().split('T')[0];
    
    if (modelNameInput) {
        modelNameInput.value = "";
        modelNameInput.disabled = false;
    }

    for (const categoryKey in qtyInspectOutputs) {
        qtyInspectOutputs[categoryKey] = 0;
    }
    defectCounts = {};
    totalInspected = 0;
    selectedDefects = [];
    currentInspectionPairs = [];
    reworkLog = [];
    
    // Reset Qty Incoming ke 0 setelah simpan
    if (qtySampleSetInput) {
        qtySampleSetInput.value = 0;
        localStorage.setItem('qtySampleSet', 0);
    }
    currentInspectionLimit = 0;

    updateAllDisplays();
    if (summaryContainer) summaryContainer.innerHTML = "";
    checkInfoCompleteAndLockButtons();
    updateSaveButtonState();
    clearLocalStorageExceptQtySampleSet();
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
}

// ===========================================
// 16. Inisialisasi Aplikasi dan Event Listeners (Dilengkapi dengan loadFromLocalStorage)
// ===========================================
async function initApp() {
    console.log("Menginisialisasi aplikasi dengan alur yang diperbarui...");

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

    // Sembunyikan tombol statistik untuk auditor (hanya supervisor/admin)
    const userRole = user?.user_metadata?.role || ROLES.AUDITOR;
    const statisticBtn = document.querySelector('.statistic-button');
    if (statisticBtn && userRole === ROLES.AUDITOR) {
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
        } else {
            roleBadgeEl.className = 'hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize';
        }
    }

    // Hide analytics nav items for auditor role (admin sees everything)
    if (userRole === ROLES.AUDITOR) {
        document.querySelectorAll('[data-view="analytics"]').forEach(el => { el.style.display = 'none'; });
    }

    // Hide "New Inspection" button for supervisor only (admin keeps full access)
    if (userRole === ROLES.SUPERVISOR) {
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
            if (confirm('Yakin ingin logout?')) {
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

    // Sync catalog dari Supabase ke localStorage cache (agar defect buttons & dropdowns terisi)
    try { await syncAllFromSupabase(); } catch (e) { console.warn('Catalog sync failed, menggunakan cache:', e); }

    // Render defect buttons dynamically from admin-managed catalog
    const defectContainer = document.getElementById('defect-buttons-container');
    if (defectContainer) renderDefectButtons(defectContainer);
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
    renderComponentButtons(selectedVendor);
    renderProcessButtons(selectedComponents);
    window.__reattachVendorOptions    = () => { renderVendorButtons(); };
    window.__reattachComponentOptions = () => { renderComponentButtons(selectedVendor); };
    window.__reattachProcessOptions   = () => { rebuildProcessButtons(); };

    // Wire Reset button in Context Selection card
    const resetSelectionBtn = document.getElementById('reset-selection-btn');
    if (resetSelectionBtn) resetSelectionBtn.addEventListener('click', resetContextSelection);

    // Material Type filter
    const materialTypeSelect = document.getElementById('material-type');
    if (materialTypeSelect) {
        materialTypeSelect.addEventListener('change', () => {
            selectedMaterialType = materialTypeSelect.value;
            // If current vendor no longer matches the new filter, clear the cascade
            if (selectedVendor) {
                const vendors = getVendors();
                const vendor  = vendors.find(v => v.name === selectedVendor);
                if (!vendor || (selectedMaterialType && vendor.material_type !== selectedMaterialType)) {
                    selectedVendor     = '';
                    selectedComponents = [];
                    selectedProcesses  = [];
                    renderComponentButtons('');
                    renderProcessButtons([]);
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

    // Set default tanggal-incoming to today
    if (tanggalIncomingInput && !tanggalIncomingInput.value) {
        tanggalIncomingInput.value = new Date().toISOString().split('T')[0];
    }

    if (modelNameInput) {
        modelNameInput.addEventListener('input', saveToLocalStorage);
    }
    
    if (styleNumberInput) {
        styleNumberInput.addEventListener('input', () => {
            saveToLocalStorage();
            autoFillModelName();
        });
    }

    if (tanggalIncomingInput) tanggalIncomingInput.addEventListener('change', () => {
        saveToLocalStorage();
        checkInfoCompleteAndLockButtons();
    });

    function attachDefectListeners() {
        defectButtons = document.querySelectorAll('.defect-button');
        defectButtons.forEach(button => {
            button.addEventListener('click', () => {
                handleDefectClick(button);
                button.classList.add('active-feedback');
                setTimeout(() => button.classList.remove('active-feedback'), 200);
            });
        });
    }
    attachDefectListeners();
    window.__reattachDefectListeners = attachDefectListeners;

    gradeInputButtons.forEach(button => {
        button.addEventListener('click', () => {
            handleGradeClick(button);
            button.classList.add('active-feedback');
            setTimeout(() => button.classList.remove('active-feedback'), 200);
        });
    });

    const saveButton = document.querySelector(".save-button");
    if (saveButton) {
        saveButton.addEventListener("click", saveData);
    }

    if (qtySampleSetInput) {
        let storedQty = localStorage.getItem('qtySampleSet');
        let qtySampleSetValue;

        if (storedQty && !isNaN(parseInt(storedQty, 10)) && parseInt(storedQty, 10) >= 0) {
            qtySampleSetValue = parseInt(storedQty, 10);
        } else {
            qtySampleSetValue = 0;
        }

        qtySampleSetInput.value = qtySampleSetValue;
        currentInspectionLimit = qtySampleSetValue;

        qtySampleSetInput.addEventListener('change', () => {
            let newQty = parseInt(qtySampleSetInput.value, 10);
            
            if (isNaN(newQty) || newQty < 0) {
                alert("Qty Sample Set tidak boleh kurang dari 0.");
                qtySampleSetInput.value = currentInspectionLimit;
                return;
            }
            
            if (newQty < totalInspected) {
                alert(`Qty Sample Set tidak bisa lebih rendah dari Qty Inspect saat ini (${totalInspected}).`);
                qtySampleSetInput.value = currentInspectionLimit;
                return;
            }
            
            currentInspectionLimit = newQty;
            localStorage.setItem('qtySampleSet', newQty);
            
            updateButtonStatesBasedOnLimit();
            checkInfoCompleteAndLockButtons();
            updateSaveButtonState();
            saveToLocalStorage();
            
            console.log(`Qty Sample Set diubah menjadi: ${currentInspectionLimit}`);
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

    loadFromLocalStorage();

    if (selectedDefects.length === 0 && currentInspectionPairs.length === 0) {
        initButtonStates();
    }
    
    checkInfoCompleteAndLockButtons();
    updateTotalQtyInspect();

    console.log("Aplikasi berhasil diinisialisasi sepenuhnya dengan localStorage.");
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

