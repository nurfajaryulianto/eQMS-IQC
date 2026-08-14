// =============================================================
// admin.js — Admin Panel: CRUD for Defects Catalog and Users
// Source of truth: Supabase. localStorage = read cache for script.js.
// =============================================================

import {
    dbGetDefects,   dbInsertDefect,   dbUpdateDefect,   dbDeleteDefect,
    dbGetAppUsers,
    dbCreateAuthUser, dbUpdateAuthUser, dbDeleteAuthUser,
    dbGetVendors,   dbInsertVendor,   dbUpdateVendor,   dbDeleteVendor,
    dbGetComponents,dbInsertComponent,dbUpdateComponent,dbDeleteComponent,
    dbGetProcesses, dbInsertProcess,  dbUpdateProcess,  dbDeleteProcess,
    dbGetStyleModels, dbInsertStyleModel, dbUpdateStyleModel, dbDeleteStyleModel, dbUpsertStyleModelsBatch,
} from './db.js';
import { showAlert, showConfirm } from './dialog.js';

export const DEFECTS_KEY    = 'eqms_defects_v1';
export const USERS_KEY      = 'eqms_users_v1';
export const VENDORS_KEY    = 'eqms_vendors_v1';
export const COMPONENTS_KEY = 'eqms_components_v1';
export const PROCESSES_KEY  = 'eqms_processes_v1';
export const MODELS_KEY     = 'eqms_style_models_v1';
const SCRIPT_URL            = 'https://script.google.com/macros/s/AKfycbxt5mmTI3bTAFMpaDo6VgVoKk8raDecfOoCbqsZgdK1-BwErb-VHROC0RSj8O8NYoR-JA/exec';

// ─── localStorage CACHE (dibaca oleh script.js secara sinkron) ───────────────
// Supabase adalah sumber data utama.
// localStorage diperbarui setiap kali Supabase berhasil diakses.

export function getDefects() {
    try {
        const raw = localStorage.getItem(DEFECTS_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

export function saveDefects(defects) {
    localStorage.setItem(DEFECTS_KEY, JSON.stringify(defects));
}

export function getUsers() {
    try {
        const raw = localStorage.getItem(USERS_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

export function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getVendors() {
    try {
        const raw = localStorage.getItem(VENDORS_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

export function saveVendors(vendors) {
    localStorage.setItem(VENDORS_KEY, JSON.stringify(vendors));
}

export function getComponents() {
    try {
        const raw = localStorage.getItem(COMPONENTS_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

export function saveComponents(components) {
    localStorage.setItem(COMPONENTS_KEY, JSON.stringify(components));
}

export function getProcesses() {
    try {
        const raw = localStorage.getItem(PROCESSES_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

export function saveProcesses(processes) {
    localStorage.setItem(PROCESSES_KEY, JSON.stringify(processes));
}

export function getStyleModels() {
    try {
        const raw = localStorage.getItem(MODELS_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return [];
}

export function saveStyleModels(models) {
    localStorage.setItem(MODELS_KEY, JSON.stringify(models));
}

/** Kembalikan styleModelDatabase-compatible object { STYLE_NUMBER: MODEL_NAME } */
export function getStyleModelDatabaseMap() {
    const models = getStyleModels();
    const map = {};
    models.forEach(m => { map[m.style_number] = m.model_name; });
    return map;
}

// ─── SUPABASE SYNC ───────────────────────────────────────────
// Ambil semua data dari Supabase, perbarui localStorage cache.
// Diekspor agar bisa dipanggil dari script.js saat startup.

import { UI_TEST_MODE } from './auth.js';

export async function syncAllFromSupabase() {
    if (UI_TEST_MODE) {
        console.log("[TEST MODE] Skipping Supabase catalog sync, using local mock cache.");
        return {
            defects: getDefects(),
            users: getUsers(),
            vendors: getVendors(),
            components: getComponents(),
            processes: getProcesses()
        };
    }

    const [defects, users, vendors, components, processes, styleModels] = await Promise.all([
        dbGetDefects(),
        dbGetAppUsers(),
        dbGetVendors(),
        dbGetComponents(),
        dbGetProcesses(),
        dbGetStyleModels(),
    ]);
    saveDefects(defects);
    saveUsers(users);
    saveVendors(vendors);
    saveComponents(components);
    saveProcesses(processes);
    saveStyleModels(styleModels);
    return { defects, users, vendors, components, processes, styleModels };
}

// ─── RENDER SELECT OPTIONS (used by script.js) ───────────────

export function renderVendorOptions(select) {
    const vendors = getVendors();
    const current = select.value;
    select.innerHTML = '<option value="">Pilih Vendor</option>';
    vendors.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.name;
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

export function renderComponentOptions(select, vendorName = '') {
    const components = getComponents();
    const vendors    = getVendors();
    const current    = select.value;
    select.innerHTML = '<option value="">Pilih Component</option>';
    let filtered = components;
    if (vendorName) {
        const vendor = vendors.find(v => v.name === vendorName);
        filtered = vendor ? components.filter(c => c.vendor_id === vendor.id) : [];
    }
    filtered.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

export function renderProcessOptions(select, componentName = '') {
    const processes  = getProcesses();
    const components = getComponents();
    select.innerHTML = '<option value="">Pilih Process</option>';
    if (!componentName) return;
    const component = components.find(c => c.name === componentName);
    if (!component) return;
    const filtered = processes.filter(p => p.component_id === component.id);
    filtered.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

// ─── RENDER DEFECT BUTTONS (used by script.js) ───────────────

const CATEGORY_STYLES = {
    minor:    { bg: 'bg-blue-50',   hover: 'hover:bg-blue-100',   border: 'border-blue-200',   text: 'text-blue-800'   },
    major:    { bg: 'bg-amber-50',  hover: 'hover:bg-amber-100',  border: 'border-amber-200',  text: 'text-amber-800'  },
    critical: { bg: 'bg-red-50',    hover: 'hover:bg-red-100',    border: 'border-red-200',    text: 'text-red-800'    },
};

export function renderDefectButtons(container) {
    const defects = getDefects();
    container.innerHTML = '';
    defects.forEach(d => {
        const s = CATEGORY_STYLES[d.category] || CATEGORY_STYLES.minor;
        const btn = document.createElement('button');
        btn.className = `defect-button ${s.bg} ${s.hover} border ${s.border} rounded-lg p-2 text-center text-xs font-medium ${s.text} transition-colors h-14 flex items-center justify-center leading-tight`;
        btn.dataset.defect = d.name;
        btn.textContent = d.label;
        container.appendChild(btn);
    });
}

const LIBRARY_CATS = [
    {
        key: 'minor',
        headerBg: 'bg-blue-600', icon: 'info', title: 'Minor / Cosmetic',
        itemBg: 'bg-blue-50', itemBorder: 'border-blue-100', itemText: 'text-blue-900',
        footerBg: 'bg-blue-50', footerBorder: 'border-blue-100', footerText: 'text-blue-600',
        footnote: 'Usually reworkable. Does not affect structural integrity.'
    },
    {
        key: 'major',
        headerBg: 'bg-amber-500', icon: 'warning', title: 'Major / Aesthetic',
        itemBg: 'bg-amber-50', itemBorder: 'border-amber-100', itemText: 'text-amber-900',
        footerBg: 'bg-amber-50', footerBorder: 'border-amber-100', footerText: 'text-amber-700',
        footnote: 'Visible defects affecting appearance.'
    },
    {
        key: 'critical',
        headerBg: 'bg-red-600', icon: 'error', title: 'Critical / Structural',
        itemBg: 'bg-red-50', itemBorder: 'border-red-100', itemText: 'text-red-900',
        footerBg: 'bg-red-50', footerBorder: 'border-red-100', footerText: 'text-red-600',
        footnote: 'Structural/safety critical. Typically reject or quarantine.'
    }
];

export function renderDefectLibrary() {
    const grid = document.getElementById('defect-library-grid');
    if (!grid) return;
    const defects = getDefects();
    const grouped = { minor: [], major: [], critical: [] };
    defects.forEach(d => { if (grouped[d.category]) grouped[d.category].push(d); });
    grid.innerHTML = LIBRARY_CATS.map(c => {
        const list = grouped[c.key] || [];
        const items = list.length > 0
            ? list.map(d => `<div class="${c.itemBg} border ${c.itemBorder} rounded-lg px-3 py-2 text-xs font-medium ${c.itemText}">${escHtml(d.label)}</div>`).join('')
            : `<div class="col-span-2 text-xs text-slate-400 text-center py-4 italic">Belum ada defect</div>`;
        return `
        <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div class="px-4 py-3 ${c.headerBg} flex items-center gap-2">
                <span class="material-symbols-outlined text-white text-[18px]">${c.icon}</span>
                <h3 class="text-sm font-semibold text-white">${c.title}</h3>
                <span class="ml-auto text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">${list.length} types</span>
            </div>
            <div class="p-3 grid grid-cols-2 gap-2">${items}</div>
            <div class="px-4 py-2 ${c.footerBg} border-t ${c.footerBorder}">
                <p class="text-xs ${c.footerText}">${c.footnote}</p>
            </div>
        </div>`;
    }).join('');
}

// ─── ADMIN PANEL INIT ────────────────────────────────────────

let adminPanelInitialized = false;
let editingDefectId    = null;
let editingUserId      = null;
let editingVendorId    = null;
let editingComponentId = null;
let editingProcessId   = null;
let editingModelId     = null;
let modelsSearchQuery  = '';
let modelsBatchPreview = [];

export async function initAdminPanel() {
    if (adminPanelInitialized) return;
    adminPanelInitialized = true;

    // Tampilkan loading di semua tab sebelum data Supabase tiba
    setTabsLoading(true);

    try {
        await syncAllFromSupabase();
    } catch (err) {
        console.error('Admin: gagal sync dari Supabase', err);
        showAdminError('Gagal memuat data dari Supabase. Periksa koneksi dan konfigurasi RLS.');
    }

    setTabsLoading(false);
    populateAdminFormSelects();
    renderDefectsTab();
    renderUsersTab();
    renderVendorsTab();
    renderComponentsTab();
    renderProcessesTab();
    renderModelsTab();

    document.getElementById('admin-tab-defects').addEventListener('click',    () => switchAdminTab('defects'));
    document.getElementById('admin-tab-users').addEventListener('click',      () => switchAdminTab('users'));
    document.getElementById('admin-tab-vendors').addEventListener('click',    () => switchAdminTab('vendors'));
    document.getElementById('admin-tab-components').addEventListener('click', () => switchAdminTab('components'));
    document.getElementById('admin-tab-processes').addEventListener('click',  () => switchAdminTab('processes'));
    document.getElementById('admin-tab-models').addEventListener('click',     () => switchAdminTab('models'));
    document.getElementById('admin-tab-spreadsheet').addEventListener('click',() => switchAdminTab('spreadsheet'));

    // Models tab event bindings
    const modelForm = document.getElementById('admin-model-form');
    if (modelForm) modelForm.addEventListener('submit', handleModelSubmit);
    const modelCancel = document.getElementById('admin-model-cancel');
    if (modelCancel) modelCancel.addEventListener('click', cancelModelEdit);
    const modelSearch = document.getElementById('admin-model-search');
    if (modelSearch) modelSearch.addEventListener('input', e => {
        modelsSearchQuery = e.target.value.toLowerCase();
        renderModelsTable();
    });
    const batchTextBtn = document.getElementById('admin-models-batch-parse-btn');
    if (batchTextBtn) batchTextBtn.addEventListener('click', handleModelsBatchParse);
    const batchFileInput = document.getElementById('admin-models-batch-file');
    if (batchFileInput) batchFileInput.addEventListener('change', handleModelsBatchFileUpload);
    const batchConfirmBtn = document.getElementById('admin-models-batch-confirm-btn');
    if (batchConfirmBtn) batchConfirmBtn.addEventListener('click', handleModelsBatchConfirm);
    const batchCancelBtn = document.getElementById('admin-models-batch-cancel-btn');
    if (batchCancelBtn) batchCancelBtn.addEventListener('click', () => {
        modelsBatchPreview = [];
        document.getElementById('admin-models-batch-preview').classList.add('hidden');
    });

    const createSpreadsheetBtn = document.getElementById('admin-create-spreadsheet-btn');
    if (createSpreadsheetBtn) {
        createSpreadsheetBtn.addEventListener('click', handleCreateSpreadsheet);
    }
    // Also wire the Settings page hidden create button
    const settingsCreateBtn = document.getElementById('settings-create-spreadsheet-btn');
    if (settingsCreateBtn) {
        settingsCreateBtn.addEventListener('click', handleCreateSpreadsheet);
    }

    document.getElementById('admin-defect-form').addEventListener('submit', handleDefectSubmit);
    document.getElementById('admin-defect-cancel').addEventListener('click', cancelDefectEdit);

    document.getElementById('admin-user-form').addEventListener('submit', handleUserSubmit);
    document.getElementById('admin-user-cancel').addEventListener('click', cancelUserEdit);

    document.getElementById('admin-vendor-form').addEventListener('submit', handleVendorSubmit);
    document.getElementById('admin-vendor-cancel').addEventListener('click', cancelVendorEdit);

    document.getElementById('admin-component-form').addEventListener('submit', handleComponentSubmit);
    document.getElementById('admin-component-cancel').addEventListener('click', cancelComponentEdit);

    document.getElementById('admin-process-form').addEventListener('submit', handleProcessSubmit);
    document.getElementById('admin-process-cancel').addEventListener('click', cancelProcessEdit);

    const procVendorSel = document.getElementById('process-input-vendor');
    if (procVendorSel) {
        procVendorSel.addEventListener('change', () => {
            const procCompSel = document.getElementById('process-input-component');
            if (procCompSel) procCompSel.value = '';
            _populateProcessFormComponent(procVendorSel.value);
        });
    }
}

function switchAdminTab(tab) {
    ['defects', 'users', 'vendors', 'components', 'processes', 'models', 'spreadsheet'].forEach(t => {
        const isActive = t === tab;
        const btn   = document.getElementById(`admin-tab-${t}`);
        const panel = document.getElementById(`admin-panel-${t}`);
        if (!btn || !panel) return;
        btn.classList.toggle('border-blue-600', isActive);
        btn.classList.toggle('text-blue-600',   isActive);
        btn.classList.toggle('font-semibold',   isActive);
        btn.classList.toggle('border-transparent', !isActive);
        btn.classList.toggle('text-slate-500',  !isActive);
        panel.classList.toggle('hidden', !isActive);
    });

    if (tab === 'spreadsheet') {
        window.loadSubcontInspectionLog();
    }
}

// ─── DEFECTS TAB ─────────────────────────────────────────────

function renderDefectsTab() {
    const defects = getDefects();
    const tbody = document.getElementById('admin-defects-tbody');
    if (!tbody) return;

    const countEl = document.getElementById('admin-defects-count');
    if (countEl) countEl.textContent = `${defects.length} defects`;

    tbody.innerHTML = defects.map(d => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 font-medium text-slate-800 text-sm">${escHtml(d.label)}</td>
            <td class="px-4 py-2.5 font-mono text-xs text-slate-500">${escHtml(d.name)}</td>
            <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${categoryBadge(d.category)}">${d.category}</span>
            </td>
            <td class="px-4 py-2.5">
                <div class="flex gap-3">
                    <button onclick="window.__adminEditDefect(${d.id})" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onclick="window.__adminDeleteDefect(${d.id})" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
            </td>
        </tr>`).join('');
}

function categoryBadge(cat) {
    return { minor: 'bg-blue-100 text-blue-700', major: 'bg-amber-100 text-amber-700', critical: 'bg-red-100 text-red-700' }[cat] || 'bg-slate-100 text-slate-600';
}

function handleDefectSubmit(e) {
    e.preventDefault();
    const label = document.getElementById('defect-input-label').value.trim();
    const name  = document.getElementById('defect-input-name').value.trim().toUpperCase();
    const cat   = document.getElementById('defect-input-category').value;
    if (!label || !name || !cat) return;

    const btn = e.target.querySelector('button[type="submit"]');
    setFormBusy(btn, true);

    const finish = async () => {
        try {
            if (editingDefectId !== null) {
                await dbUpdateDefect(editingDefectId, { name, label, category: cat });
            } else {
                await dbInsertDefect({ name, label, category: cat });
            }
            const fresh = await dbGetDefects();
            saveDefects(fresh);
            renderDefectsTab();
            refreshDefectButtonsInForm();
            cancelDefectEdit();
        } catch (err) {
            await showAlert(`Gagal menyimpan defect: ${err.message}`, 'error');
        } finally {
            setFormBusy(btn, false);
        }
    };
    finish();
}

window.__adminEditDefect = function(id) {
    const defect = getDefects().find(d => d.id === id);
    if (!defect) return;
    editingDefectId = id;
    document.getElementById('defect-input-label').value    = defect.label;
    document.getElementById('defect-input-name').value     = defect.name;
    document.getElementById('defect-input-category').value = defect.category;
    document.getElementById('admin-defect-form-title').textContent = 'Edit Defect';
    document.getElementById('admin-defect-cancel').classList.remove('hidden');
    document.getElementById('defect-input-label').focus();
};

window.__adminDeleteDefect = async function(id) {
    const confirmed = await showConfirm('Log inspeksi yang sudah ada tidak terpengaruh.', 'Hapus defect ini?', 'Ya, Hapus', 'Batal');
    if (!confirmed) return;
    try {
        await dbDeleteDefect(id);
        const fresh = await dbGetDefects();
        saveDefects(fresh);
        renderDefectsTab();
        refreshDefectButtonsInForm();
    } catch (err) {
        await showAlert(`Gagal menghapus defect: ${err.message}`, 'error');
    }
};

function cancelDefectEdit() {
    editingDefectId = null;
    document.getElementById('admin-defect-form').reset();
    document.getElementById('admin-defect-form-title').textContent = 'Add Defect';
    document.getElementById('admin-defect-cancel').classList.add('hidden');
}

// ─── USERS TAB ───────────────────────────────────────────────

function renderUsersTab() {
    const users = getUsers();
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;

    const countEl = document.getElementById('admin-users-count');
    if (countEl) countEl.textContent = `${users.length} users`;

    tbody.innerHTML = users.map(u => {
        const hasAuth = Boolean(u.auth_user_id);
        const authBadge = hasAuth
            ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">\u2713 Can Login</span>'
            : '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600">No Auth</span>';
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 font-mono text-slate-700 text-sm">${escHtml(u.nik)}</td>
            <td class="px-4 py-2.5 font-medium text-slate-800 text-sm">${escHtml(u.display_name)}</td>
            <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadge(u.role)} capitalize">${u.role}</span>
            </td>
            <td class="px-4 py-2.5">${authBadge}</td>
            <td class="px-4 py-2.5 text-xs text-slate-400">${new Date(u.created_at).toLocaleDateString('id-ID')}</td>
            <td class="px-4 py-2.5">
                <div class="flex gap-3">
                    <button onclick="window.__adminEditUser(${u.id})" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onclick="window.__adminDeleteUser(${u.id})" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function roleBadge(role) {
    return { admin: 'bg-purple-100 text-purple-700', supervisor: 'bg-blue-100 text-blue-700', manager: 'bg-emerald-100 text-emerald-700', inspector: 'bg-slate-100 text-slate-600' }[role] || 'bg-slate-100 text-slate-600';
}

function handleUserSubmit(e) {
    e.preventDefault();
    const nik      = document.getElementById('user-input-nik').value.trim();
    const name     = document.getElementById('user-input-name').value.trim();
    const role     = document.getElementById('user-input-role').value;
    const password = document.getElementById('user-input-password')?.value ?? '';

    if (!nik || !name || !role) return;

    if (!/^[a-zA-Z0-9]{1,20}$/.test(nik)) {
        showAlert('NIK hanya boleh alfanumerik, maks 20 karakter.', 'warning', 'Format NIK Tidak Valid');
        return;
    }
    if (editingUserId === null && !password) {
        showAlert('Password wajib diisi untuk user baru.', 'warning', 'Password Kosong');
        return;
    }
    if (password && password.length < 6) {
        showAlert('Password minimal 6 karakter.', 'warning', 'Password Terlalu Pendek');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    setFormBusy(btn, true);

    const finish = async () => {
        try {
            if (editingUserId !== null) {
                await dbUpdateAuthUser(editingUserId, { display_name: name, role, password: password || undefined });
            } else {
                await dbCreateAuthUser({ nik, display_name: name, role, password });
            }
            const fresh = await dbGetAppUsers();
            saveUsers(fresh);
            renderUsersTab();
            cancelUserEdit();
            await showAlert(
                editingUserId !== null ? `User "${name}" berhasil diperbarui.` : `User "${name}" berhasil dibuat. User sekarang bisa login dengan NIK: ${nik}`,
                'success'
            );
        } catch (err) {
            await showAlert(`Gagal menyimpan user: ${err.message}`, 'error');
        } finally {
            setFormBusy(btn, false);
        }
    };
    finish();
}

window.__adminEditUser = function(id) {
    const user = getUsers().find(u => u.id === id);
    if (!user) return;
    editingUserId = id;
    const nikInput = document.getElementById('user-input-nik');
    if (nikInput) { nikInput.value = user.nik; nikInput.disabled = true; }
    document.getElementById('user-input-name').value = user.display_name;
    document.getElementById('user-input-role').value = user.role;
    // Password optional saat edit
    const pwInput = document.getElementById('user-input-password');
    const pwHint  = document.getElementById('user-password-hint');
    if (pwInput) { pwInput.value = ''; pwInput.required = false; }
    if (pwHint)  { pwHint.textContent = 'Kosongkan jika tidak ingin mengubah password.'; }
    document.getElementById('admin-user-form-title').textContent = 'Edit User';
    document.getElementById('admin-user-cancel').classList.remove('hidden');
    document.getElementById('user-input-name').focus();
};

window.__adminDeleteUser = async function(id) {
    const user = getUsers().find(u => u.id === id);
    if (!user) return;
    const confirmed = await showConfirm(`User "${user.display_name}" (${user.nik}) akan dihapus permanen dari sistem dan tidak bisa login lagi.`, 'Hapus User?', 'Ya, Hapus', 'Batal');
    if (!confirmed) return;
    try {
        await dbDeleteAuthUser(id);
        const fresh = await dbGetAppUsers();
        saveUsers(fresh);
        renderUsersTab();
    } catch (err) {
        await showAlert(`Gagal menghapus user: ${err.message}`, 'error');
    }
};

function cancelUserEdit() {
    editingUserId = null;
    document.getElementById('admin-user-form').reset();
    const nikInput = document.getElementById('user-input-nik');
    if (nikInput) nikInput.disabled = false;
    const pwInput = document.getElementById('user-input-password');
    const pwHint  = document.getElementById('user-password-hint');
    if (pwInput) { pwInput.value = ''; pwInput.required = true; }
    if (pwHint)  { pwHint.textContent = 'Minimal 6 karakter.'; }
    document.getElementById('admin-user-form-title').textContent = 'Add User';
    document.getElementById('admin-user-cancel').classList.add('hidden');
}

// ─── VENDORS TAB ─────────────────────────────────────────────

function renderVendorsTab() {
    const vendors = getVendors();
    const tbody = document.getElementById('admin-vendors-tbody');
    if (!tbody) return;
    const countEl = document.getElementById('admin-vendors-count');
    if (countEl) countEl.textContent = `${vendors.length} vendors`;
    tbody.innerHTML = vendors.map(v => {
        const typeBadge = v.material_type === 'upper'
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">Upper</span>'
            : v.material_type === 'bottom'
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Bottom</span>'
            : '<span class="text-xs text-slate-400">&mdash;</span>';
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 font-medium text-slate-800 text-sm">${escHtml(v.name)}</td>
            <td class="px-4 py-2.5">${typeBadge}</td>
            <td class="px-4 py-2.5">
                <div class="flex gap-3">
                    <button onclick="window.__adminEditVendor(${v.id})" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onclick="window.__adminDeleteVendor(${v.id})" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function handleVendorSubmit(e) {
    e.preventDefault();
    const name         = document.getElementById('vendor-input-name').value.trim();
    const materialType = document.getElementById('vendor-input-material-type').value;
    if (!name || !materialType) { showAlert('Vendor Name dan Material Type wajib diisi.', 'warning', 'Form Tidak Lengkap'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    setFormBusy(btn, true);

    const finish = async () => {
        try {
            if (editingVendorId !== null) {
                await dbUpdateVendor(editingVendorId, { name, material_type: materialType });
            } else {
                await dbInsertVendor({ name, material_type: materialType });
            }
            const fresh = await dbGetVendors();
            saveVendors(fresh);
            renderVendorsTab();
            refreshDropdownsInForm();
            cancelVendorEdit();
        } catch (err) {
            await showAlert(`Gagal menyimpan vendor: ${err.message}`, 'error');
        } finally {
            setFormBusy(btn, false);
        }
    };
    finish();
}

window.__adminEditVendor = function(id) {
    const vendor = getVendors().find(v => v.id === id);
    if (!vendor) return;
    editingVendorId = id;
    document.getElementById('vendor-input-name').value          = vendor.name;
    document.getElementById('vendor-input-material-type').value = vendor.material_type ?? '';
    document.getElementById('admin-vendor-form-title').textContent = 'Edit Vendor';
    document.getElementById('admin-vendor-cancel').classList.remove('hidden');
    document.getElementById('vendor-input-name').focus();
};

window.__adminDeleteVendor = async function(id) {
    const confirmed = await showConfirm('Vendor yang dihapus tidak dapat dikembalikan.', 'Hapus Vendor?', 'Ya, Hapus', 'Batal');
    if (!confirmed) return;
    try {
        await dbDeleteVendor(id);
        const fresh = await dbGetVendors();
        saveVendors(fresh);
        renderVendorsTab();
        refreshDropdownsInForm();
    } catch (err) {
        await showAlert(`Gagal menghapus vendor: ${err.message}`, 'error');
    }
};

function cancelVendorEdit() {
    editingVendorId = null;
    document.getElementById('admin-vendor-form').reset();
    document.getElementById('admin-vendor-form-title').textContent = 'Add Vendor';
    document.getElementById('admin-vendor-cancel').classList.add('hidden');
}

// ─── COMPONENTS TAB ──────────────────────────────────────────

function renderComponentsTab() {
    const components = getComponents();
    const vendors    = getVendors();
    const tbody = document.getElementById('admin-components-tbody');
    if (!tbody) return;
    const countEl = document.getElementById('admin-components-count');
    if (countEl) countEl.textContent = `${components.length} components`;
    tbody.innerHTML = components.map(c => {
        const vendor = vendors.find(v => v.id === c.vendor_id);
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 font-medium text-slate-800 text-sm">${escHtml(c.name)}</td>
            <td class="px-4 py-2.5 text-sm text-slate-500">${vendor ? escHtml(vendor.name) : '\u2014'}</td>
            <td class="px-4 py-2.5">
                <div class="flex gap-3">
                    <button onclick="window.__adminEditComponent(${c.id})" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onclick="window.__adminDeleteComponent(${c.id})" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function handleComponentSubmit(e) {
    e.preventDefault();
    const name     = document.getElementById('component-input-name').value.trim();
    const vendorId = parseInt(document.getElementById('component-input-vendor').value, 10) || null;
    if (!name) return;

    const btn = e.target.querySelector('button[type="submit"]');
    setFormBusy(btn, true);

    const finish = async () => {
        try {
            if (editingComponentId !== null) {
                await dbUpdateComponent(editingComponentId, { name, vendor_id: vendorId });
            } else {
                await dbInsertComponent({ name, vendor_id: vendorId });
            }
            const fresh = await dbGetComponents();
            saveComponents(fresh);
            renderComponentsTab();
            refreshDropdownsInForm();
            cancelComponentEdit();
        } catch (err) {
            await showAlert(`Gagal menyimpan component: ${err.message}`, 'error');
        } finally {
            setFormBusy(btn, false);
        }
    };
    finish();
}

window.__adminEditComponent = function(id) {
    const comp = getComponents().find(c => c.id === id);
    if (!comp) return;
    editingComponentId = id;
    document.getElementById('component-input-vendor').value = comp.vendor_id ?? '';
    document.getElementById('component-input-name').value   = comp.name;
    document.getElementById('admin-component-form-title').textContent = 'Edit Component';
    document.getElementById('admin-component-cancel').classList.remove('hidden');
    document.getElementById('component-input-name').focus();
};

window.__adminDeleteComponent = async function(id) {
    const confirmed = await showConfirm('Component yang dihapus tidak dapat dikembalikan.', 'Hapus Component?', 'Ya, Hapus', 'Batal');
    if (!confirmed) return;
    try {
        await dbDeleteComponent(id);
        const fresh = await dbGetComponents();
        saveComponents(fresh);
        renderComponentsTab();
        refreshDropdownsInForm();
    } catch (err) {
        await showAlert(`Gagal menghapus component: ${err.message}`, 'error');
    }
};

function cancelComponentEdit() {
    editingComponentId = null;
    document.getElementById('admin-component-form').reset();
    document.getElementById('admin-component-form-title').textContent = 'Add Component';
    document.getElementById('admin-component-cancel').classList.add('hidden');
}

// ─── HELPERS ─────────────────────────────────────────────────

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Nonaktifkan tombol submit selama request Supabase berjalan. */
function setFormBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? 'Menyimpan…' : 'Simpan';
}

/** Tampilkan banner error di admin panel. */
function showAdminError(msg) {
    const el = document.getElementById('admin-error-banner');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
    else    { console.error('[Admin]', msg); }
}

/** Tampilkan/sembunyikan skeleton loading di semua tab. */
function setTabsLoading(loading) {
    ['defects', 'users', 'vendors', 'components', 'processes'].forEach(tab => {
        const tbody = document.getElementById(`admin-${tab}-tbody`);
        if (!tbody) return;
        if (loading) {
            tbody.innerHTML = `<tr><td colspan="10" class="px-4 py-6 text-center text-sm text-slate-400">Memuat data dari Supabase…</td></tr>`;
        }
    });
}

function refreshDefectButtonsInForm() {
    const container = document.getElementById('defect-buttons-container');
    if (container) {
        renderDefectButtons(container);
        if (typeof window.__reattachDefectListeners === 'function') {
            window.__reattachDefectListeners();
        }
    }
    renderDefectLibrary();
}

function populateAdminFormSelects() {
    // Vendor select in component form
    const compVendorSel = document.getElementById('component-input-vendor');
    if (compVendorSel) {
        const vendors = getVendors();
        const cur = compVendorSel.value;
        compVendorSel.innerHTML = '<option value="">— No Vendor —</option>';
        vendors.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.name;
            compVendorSel.appendChild(opt);
        });
        if (cur) compVendorSel.value = cur;
    }
    // Vendor select in process form
    const procVendorSel = document.getElementById('process-input-vendor');
    if (procVendorSel) {
        const vendors = getVendors();
        const cur = procVendorSel.value;
        procVendorSel.innerHTML = '<option value="">Pilih Vendor (opsional)</option>';
        vendors.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.name;
            procVendorSel.appendChild(opt);
        });
        if (cur) procVendorSel.value = cur;
    }
    // Component select in process form (filtered by vendor if selected)
    _populateProcessFormComponent(procVendorSel ? procVendorSel.value : '');
}

function _populateProcessFormComponent(vendorId) {
    const procCompSel = document.getElementById('process-input-component');
    if (!procCompSel) return;
    const components = getComponents();
    const cur = procCompSel.value;
    procCompSel.innerHTML = '<option value="">Pilih Component</option>';
    const filtered = vendorId
        ? components.filter(c => String(c.vendor_id) === String(vendorId))
        : components;
    filtered.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        procCompSel.appendChild(opt);
    });
    if (cur) procCompSel.value = cur;
}

function refreshDropdownsInForm() {
    if (typeof window.__reattachVendorOptions === 'function') window.__reattachVendorOptions();
    if (typeof window.__reattachComponentOptions === 'function') window.__reattachComponentOptions();
    if (typeof window.__reattachProcessOptions === 'function') window.__reattachProcessOptions();
    populateAdminFormSelects();
}

// ─── PROCESSES TAB ───────────────────────────────────────────────

function renderProcessesTab() {
    const processes  = getProcesses();
    const tbody = document.getElementById('admin-processes-tbody');
    if (!tbody) return;
    const countEl = document.getElementById('admin-processes-count');
    if (countEl) countEl.textContent = `${processes.length} processes`;
    tbody.innerHTML = processes.map(p => {
        const matType = p.material_type ? p.material_type.toUpperCase() : 'ALL';
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 font-medium text-slate-800 text-sm">${escHtml(p.name)}</td>
            <td class="px-4 py-2.5 text-sm text-slate-500">${escHtml(matType)}</td>
            <td class="px-4 py-2.5">
                <div class="flex gap-3">
                    <button onclick="window.__adminEditProcess(${p.id})" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onclick="window.__adminDeleteProcess(${p.id})" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function handleProcessSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('process-input-name').value.trim();
    const materialType = document.getElementById('process-input-material-type').value || null;
    if (!name) { showAlert('Masukkan nama process.', 'warning', 'Form Tidak Lengkap'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    setFormBusy(btn, true);

    const finish = async () => {
        try {
            if (editingProcessId !== null) {
                await dbUpdateProcess(editingProcessId, { name, component_id: null, material_type: materialType });
            } else {
                await dbInsertProcess({ name, component_id: null, material_type: materialType });
            }
            const fresh = await dbGetProcesses();
            saveProcesses(fresh);
            renderProcessesTab();
            cancelProcessEdit();
            refreshDropdownsInForm();
        } catch (err) {
            await showAlert(`Gagal menyimpan process: ${err.message}`, 'error');
        } finally {
            setFormBusy(btn, false);
        }
    };
    finish();
}

window.__adminEditProcess = function(id) {
    const proc = getProcesses().find(p => p.id === id);
    if (!proc) return;
    editingProcessId = id;
    document.getElementById('process-input-name').value = proc.name;
    document.getElementById('process-input-material-type').value = proc.material_type || '';
    document.getElementById('admin-process-form-title').textContent = 'Edit Process';
    document.getElementById('admin-process-cancel').classList.remove('hidden');
    document.getElementById('process-input-name').focus();
};

window.__adminDeleteProcess = async function(id) {
    const confirmed = await showConfirm('Process yang dihapus tidak dapat dikembalikan.', 'Hapus Process?', 'Ya, Hapus', 'Batal');
    if (!confirmed) return;
    try {
        await dbDeleteProcess(id);
        const fresh = await dbGetProcesses();
        saveProcesses(fresh);
        renderProcessesTab();
        refreshDropdownsInForm();
    } catch (err) {
        await showAlert(`Gagal menghapus process: ${err.message}`, 'error');
    }
};

function cancelProcessEdit() {
    editingProcessId = null;
    document.getElementById('admin-process-form').reset();
    document.getElementById('process-input-material-type').value = '';
    document.getElementById('admin-process-form-title').textContent = 'Add Process';
    document.getElementById('admin-process-cancel').classList.add('hidden');
}

// ─── SPREADSHEET INTEGRATION ──────────────────────────────────

async function loadSpreadsheetStatus() {
    const infoContainer = document.getElementById('admin-spreadsheet-info');
    const openBtn = document.getElementById('admin-open-spreadsheet-btn');
    if (!infoContainer) return;

    infoContainer.innerHTML = '<div class="flex items-center gap-2 text-slate-500"><span class="animate-spin text-sm">⏳</span><span>Loading spreadsheet status...</span></div>';
    if (openBtn) openBtn.classList.add('hidden');

    try {
        const res = await fetch(`${SCRIPT_URL}?action=getStatus`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const data = await res.json();
        
        if (data.status === 'ok') {
            infoContainer.innerHTML = `
                <div class="flex flex-col gap-1">
                    <span class="text-slate-800 font-semibold">${data.spreadsheetName || 'eQMS IQC Database'}</span>
                    <span class="text-xs text-slate-500 break-all font-mono">ID: ${data.spreadsheetId}</span>
                </div>
            `;
            if (openBtn && data.spreadsheetUrl) {
                openBtn.href = data.spreadsheetUrl;
                openBtn.classList.remove('hidden');
            }
        } else {
            throw new Error(data.message || 'Failed to load spreadsheet status');
        }
    } catch (err) {
        console.error(err);
        infoContainer.innerHTML = `<span class="text-red-500 font-medium text-xs">Failed to load status: ${err.message}. Make sure Google Apps Script Web App is deployed.</span>`;
    }
}

async function handleCreateSpreadsheet() {
    const confirmed = await showConfirm(
        'Are you sure you want to create a new Google Spreadsheet as the eQMS database?\n\nA new spreadsheet will be created in the Google account that deployed the Web App, and all new transactions will be saved there.',
        'Create Spreadsheet'
    );
    if (!confirmed) return;

    const infoContainer = document.getElementById('admin-spreadsheet-info');
    const createBtn = document.getElementById('admin-create-spreadsheet-btn');
    const openBtn = document.getElementById('admin-open-spreadsheet-btn');
    
    if (createBtn) createBtn.disabled = true;
    infoContainer.innerHTML = '<div class="flex items-center gap-2 text-slate-600"><span class="animate-spin text-lg">⏳</span><span>Creating and initializing new spreadsheet...</span></div>';
    
    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'createSpreadsheet' })
        });
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const data = await res.json();
        
        if (data.status === 'ok') {
            await showAlert(`New Spreadsheet successfully created!\n\nName: ${data.spreadsheetName || 'eQMS-IQC-Database'}\n\nAll subsequent new entries will be saved directly to this spreadsheet.`, 'success', 'Success');
            
            infoContainer.innerHTML = `
                <div class="flex flex-col gap-1 text-emerald-800">
                    <span class="font-semibold">Active: ${data.spreadsheetName || 'eQMS-IQC-Database'}</span>
                    <span class="text-xs break-all text-slate-500 font-mono">ID: ${data.spreadsheetId}</span>
                </div>
            `;
            if (openBtn && data.spreadsheetUrl) {
                openBtn.href = data.spreadsheetUrl;
                openBtn.classList.remove('hidden');
            }
        } else {
            throw new Error(data.message || 'Failed to create spreadsheet');
        }
    } catch (err) {
        console.error(err);
        await showAlert(`Failed to create spreadsheet: ${err.message}`, 'error', 'Error');
        await window.loadSubcontInspectionLog(); // Restore original status
    } finally {
        if (createBtn) createBtn.disabled = false;
    }
}

// ─── MODELS TAB ───────────────────────────────────────────────

function renderModelsTab() {
    renderModelsTable();
    const countEl = document.getElementById('admin-models-count');
    if (countEl) countEl.textContent = `${getStyleModels().length} models`;
}

function renderModelsTable() {
    const tbody = document.getElementById('admin-models-tbody');
    if (!tbody) return;
    const models = getStyleModels();
    const query  = modelsSearchQuery.trim();
    const filtered = query
        ? models.filter(m =>
            m.style_number.toLowerCase().includes(query) ||
            m.model_name.toLowerCase().includes(query)
          )
        : models;

    const countEl = document.getElementById('admin-models-count');
    if (countEl) countEl.textContent = `${filtered.length} / ${models.length} models`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-8 text-center text-sm text-slate-400 italic">${
            query ? 'Tidak ada model yang sesuai pencarian.' : 'Belum ada model. Tambahkan di bawah.'
        }</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(m => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-2.5 text-xs font-mono font-semibold text-blue-700">${escHtml(m.style_number)}</td>
            <td class="px-4 py-2.5 text-xs text-slate-700">${escHtml(m.model_name)}</td>
            <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <button onclick="window.__adminEditModel(${m.id})"
                    class="text-xs text-blue-600 hover:text-blue-800 mr-3 font-medium">Edit</button>
                <button onclick="window.__adminDeleteModel(${m.id})"
                    class="text-xs text-red-500 hover:text-red-700 font-medium">Hapus</button>
            </td>
        </tr>
    `).join('');

    // Expose handlers to global scope for inline onclick
    window.__adminEditModel = async (id) => {
        const m = getStyleModels().find(x => x.id === id);
        if (!m) return;
        editingModelId = id;
        document.getElementById('admin-model-style-number').value = m.style_number;
        document.getElementById('admin-model-model-name').value   = m.model_name;
        document.getElementById('admin-model-submit-btn').textContent = 'Update Model';
        document.getElementById('admin-model-cancel').classList.remove('hidden');
        document.getElementById('admin-model-style-number').focus();
    };

    window.__adminDeleteModel = async (id) => {
        const m = getStyleModels().find(x => x.id === id);
        if (!m) return;
        const ok = await showConfirm(`Hapus model "${m.style_number} — ${m.model_name}"?`, 'Hapus Model');
        if (!ok) return;
        try {
            await dbDeleteStyleModel(id);
            const updated = await dbGetStyleModels();
            saveStyleModels(updated);
            renderModelsTab();
            await showAlert('Model berhasil dihapus.', 'success', 'Berhasil');
        } catch (err) {
            await showAlert(`Gagal menghapus: ${err.message}`, 'error', 'Error');
        }
    };
}

async function handleModelSubmit(e) {
    e.preventDefault();
    const styleNumber = document.getElementById('admin-model-style-number').value.trim();
    const modelName   = document.getElementById('admin-model-model-name').value.trim();
    if (!styleNumber || !modelName) return;
    try {
        if (editingModelId) {
            await dbUpdateStyleModel(editingModelId, { style_number: styleNumber, model_name: modelName });
        } else {
            await dbInsertStyleModel({ style_number: styleNumber, model_name: modelName });
        }
        const updated = await dbGetStyleModels();
        saveStyleModels(updated);
        cancelModelEdit();
        renderModelsTab();
        await showAlert(editingModelId ? 'Model diperbarui.' : 'Model ditambahkan.', 'success', 'Berhasil');
    } catch (err) {
        await showAlert(`Gagal menyimpan: ${err.message}`, 'error', 'Error');
    }
}

function cancelModelEdit() {
    editingModelId = null;
    const form = document.getElementById('admin-model-form');
    if (form) form.reset();
    const submitBtn = document.getElementById('admin-model-submit-btn');
    if (submitBtn) submitBtn.textContent = 'Tambah Model';
    const cancelBtn = document.getElementById('admin-model-cancel');
    if (cancelBtn) cancelBtn.classList.add('hidden');
}

/** Parse raw text (CSV or STYLE: MODEL per line) into [{style_number, model_name}] */
function parseModelsBatchText(raw) {
    return raw.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
            // Support both comma-separated and colon-separated
            const sepIdx = line.includes(',') ? line.indexOf(',') : line.indexOf(':');
            if (sepIdx < 0) return null;
            const styleNumber = line.slice(0, sepIdx).trim();
            const modelName   = line.slice(sepIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!styleNumber || !modelName) return null;
            return { style_number: styleNumber.toUpperCase(), model_name: modelName };
        })
        .filter(Boolean);
}

function handleModelsBatchParse() {
    const raw = document.getElementById('admin-models-batch-text').value;
    modelsBatchPreview = parseModelsBatchText(raw);
    showModelsBatchPreview();
}

function handleModelsBatchFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        modelsBatchPreview = parseModelsBatchText(ev.target.result);
        showModelsBatchPreview();
    };
    reader.readAsText(file);
}

function showModelsBatchPreview() {
    const previewSection = document.getElementById('admin-models-batch-preview');
    const previewTbody   = document.getElementById('admin-models-batch-preview-tbody');
    const previewCount   = document.getElementById('admin-models-batch-preview-count');
    if (!previewSection || !previewTbody) return;

    if (modelsBatchPreview.length === 0) {
        previewSection.classList.add('hidden');
        showAlert('Tidak ada data yang dapat diparsing. Pastikan format: STYLE_NUMBER,MODEL_NAME atau STYLE_NUMBER: MODEL_NAME', 'error', 'Format Error');
        return;
    }

    if (previewCount) previewCount.textContent = `${modelsBatchPreview.length} entries`;
    previewTbody.innerHTML = modelsBatchPreview.slice(0, 20).map(r => `
        <tr class="border-b border-slate-100">
            <td class="px-3 py-1.5 text-xs font-mono text-blue-700">${escHtml(r.style_number)}</td>
            <td class="px-3 py-1.5 text-xs text-slate-700">${escHtml(r.model_name)}</td>
        </tr>
    `).join('') + (modelsBatchPreview.length > 20
        ? `<tr><td colspan="2" class="px-3 py-2 text-xs text-slate-400 italic text-center">... dan ${modelsBatchPreview.length - 20} lainnya</td></tr>`
        : '');
    previewSection.classList.remove('hidden');
}

async function handleModelsBatchConfirm() {
    if (modelsBatchPreview.length === 0) return;
    const btn = document.getElementById('admin-models-batch-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading...'; }
    try {
        await dbUpsertStyleModelsBatch(modelsBatchPreview);
        const updated = await dbGetStyleModels();
        saveStyleModels(updated);
        modelsBatchPreview = [];
        document.getElementById('admin-models-batch-preview').classList.add('hidden');
        document.getElementById('admin-models-batch-text').value = '';
        const fileInput = document.getElementById('admin-models-batch-file');
        if (fileInput) fileInput.value = '';
        renderModelsTab();
        await showAlert(`${updated.length} model berhasil disimpan ke database!`, 'success', 'Upload Berhasil');
    } catch (err) {
        await showAlert(`Gagal upload batch: ${err.message}`, 'error', 'Error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Konfirmasi Upload'; }
    }
}


// ============================================================
// SUBCONT INSPECTION LOG (SUPABASE 2-TABEL & EXPORT 2-SHEET)
// ============================================================

let currentSubcontLogSessions = [];
let currentSubcontLogDefects = [];

window.switchSubcontLogSubtab = function(tab) {
    const btnSessions = document.getElementById('subcont-log-tab-sessions');
    const btnDefects = document.getElementById('subcont-log-tab-defects');
    const viewSessions = document.getElementById('subcont-view-sessions');
    const viewDefects = document.getElementById('subcont-view-defects');

    if (tab === 'sessions') {
        if (btnSessions) btnSessions.className = 'py-1.5 px-3.5 rounded-md bg-white text-slate-900 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer';
        if (btnDefects) btnDefects.className = 'py-1.5 px-3.5 rounded-md text-slate-500 hover:text-slate-900 transition-all flex items-center gap-1.5 cursor-pointer';
        if (viewSessions) viewSessions.classList.remove('hidden');
        if (viewDefects) viewDefects.classList.add('hidden');
    } else {
        if (btnDefects) btnDefects.className = 'py-1.5 px-3.5 rounded-md bg-white text-slate-900 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer';
        if (btnSessions) btnSessions.className = 'py-1.5 px-3.5 rounded-md text-slate-500 hover:text-slate-900 transition-all flex items-center gap-1.5 cursor-pointer';
        if (viewDefects) viewDefects.classList.remove('hidden');
        if (viewSessions) viewSessions.classList.add('hidden');
    }
};

window.loadSubcontInspectionLog = async function() {
    const tbodySessions = document.getElementById('subcont-sessions-tbody');
    const tbodyDefects = document.getElementById('subcont-defects-tbody');
    const badgeSessions = document.getElementById('subcont-sessions-count-badge');
    const badgeDefects = document.getElementById('subcont-defects-count-badge');

    if (tbodySessions) tbodySessions.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-slate-400"><span class="inline-block animate-spin mr-2">?</span>Memuat data sesi inspeksi...</td></tr>';
    if (tbodyDefects) tbodyDefects.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400"><span class="inline-block animate-spin mr-2">?</span>Memuat rincian defect...</td></tr>';

    try {
        const dateStart = document.getElementById('subcont-log-start')?.value || '';
        const dateEnd = document.getElementById('subcont-log-end')?.value || '';
        const vendorVal = document.getElementById('subcont-log-vendor-filter')?.value || 'all';
        const statusVal = document.getElementById('subcont-log-status-filter')?.value || 'all';

        // Query Supabase subcont_inspections (Sheet 1)
        let qSess = supabase.from('subcont_inspections').select('*').order('timestamp', { ascending: false }).limit(200);
        if (dateStart) qSess = qSess.gte('tanggal_insp', dateStart);
        if (dateEnd) qSess = qSess.lte('tanggal_insp', dateEnd);
        if (vendorVal !== 'all') qSess = qSess.ilike('vendor', %%);
        if (statusVal !== 'all') qSess = qSess.eq('status', statusVal);

        // Query Supabase subcont_defect_logs (Sheet 2)
        let qDef = supabase.from('subcont_defect_logs').select('*').order('date', { ascending: false }).limit(500);
        if (dateStart) qDef = qDef.gte('date', dateStart);
        if (dateEnd) qDef = qDef.lte('date', dateEnd);
        if (vendorVal !== 'all') qDef = qDef.ilike('vendor', %%);

        const [resSess, resDef] = await Promise.all([qSess, qDef]);

        if (resSess.error) throw resSess.error;
        if (resDef.error) throw resDef.error;

        currentSubcontLogSessions = resSess.data || [];
        currentSubcontLogDefects = resDef.data || [];

        // Populate Vendor Filter dropdown jika belum
        const vendorFilterSelect = document.getElementById('subcont-log-vendor-filter');
        if (vendorFilterSelect && vendorFilterSelect.options.length <= 1) {
            const vendors = [...new Set(currentSubcontLogSessions.map(s => s.vendor).filter(Boolean))].sort();
            vendors.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                vendorFilterSelect.appendChild(opt);
            });
        }

        if (badgeSessions) badgeSessions.textContent = currentSubcontLogSessions.length;
        if (badgeDefects) badgeDefects.textContent = currentSubcontLogDefects.length;

        renderSubcontLogSessions(currentSubcontLogSessions);
        renderSubcontLogDefects(currentSubcontLogDefects);

    } catch (err) {
        console.error('loadSubcontInspectionLog error:', err);
        if (tbodySessions) tbodySessions.innerHTML = <tr><td colspan="11" class="py-6 text-center text-rose-500 font-semibold">Gagal memuat log sesi: </td></tr>;
        if (tbodyDefects) tbodyDefects.innerHTML = <tr><td colspan="7" class="py-6 text-center text-rose-500 font-semibold">Gagal memuat log defect: </td></tr>;
    }
};

function renderSubcontLogSessions(sessions) {
    const tbody = document.getElementById('subcont-sessions-tbody');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="py-8 text-center text-slate-400 italic">Tidak ada data sesi inspeksi ditemukan.</td></tr>';
        return;
    }

    tbody.innerHTML = sessions.map(s => {
        const tgl = s.tanggal_insp || s.date || (s.timestamp ? String(s.timestamp).substring(0, 10) : '-');
        const stClass = (s.status || 'Done').toLowerCase() === 'done'
            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
            : 'bg-amber-100 text-amber-700 border-amber-200';

        const safeSessionId = encodeURIComponent(s.session_id);

        return 
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-2.5 px-3 whitespace-nowrap font-medium text-slate-900"></td>
                <td class="py-2.5 px-3 font-semibold text-slate-800"></td>
                <td class="py-2.5 px-3">
                    <div class="font-bold text-slate-900"></div>
                    <div class="text-[10px] text-slate-500 font-mono"></div>
                </td>
                <td class="py-2.5 px-3">
                    <div class="font-medium text-slate-800"></div>
                    <div class="text-[10px] text-slate-500"></div>
                </td>
                <td class="py-2.5 px-3 text-slate-600"></td>
                <td class="py-2.5 px-3 text-right font-mono"></td>
                <td class="py-2.5 px-3 text-right font-mono font-medium"></td>
                <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-600"></td>
                <td class="py-2.5 px-3 text-right font-mono font-bold text-rose-600"></td>
                <td class="py-2.5 px-3 text-center">
                    <span class="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border ">
                        
                    </span>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <button onclick="window.showSubcontSessionDetail('')" 
                        class="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 rounded-md text-[11px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1">
                        <span class="material-symbols-outlined text-[13px]">visibility</span> Detail
                    </button>
                </td>
            </tr>
        ;
    }).join('');
}

function renderSubcontLogDefects(defects) {
    const tbody = document.getElementById('subcont-defects-tbody');
    if (!tbody) return;

    if (!defects || defects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400 italic">Tidak ada temuan defect ditemukan.</td></tr>';
        return;
    }

    tbody.innerHTML = defects.map((d, idx) => {
        return 
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-2.5 px-3 text-slate-400 font-mono"></td>
                <td class="py-2.5 px-3 whitespace-nowrap font-medium text-slate-900"></td>
                <td class="py-2.5 px-3 font-semibold text-slate-800"></td>
                <td class="py-2.5 px-3 font-medium text-slate-700"></td>
                <td class="py-2.5 px-3 font-bold text-rose-600"></td>
                <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900"></td>
                <td class="py-2.5 px-3 text-[10px] text-slate-400 font-mono max-w-[150px] truncate"></td>
            </tr>
        ;
    }).join('');
}

window.showSubcontSessionDetail = function(rawSessionId) {
    const sessionId = decodeURIComponent(rawSessionId);
    const session = currentSubcontLogSessions.find(s => s.session_id === sessionId);
    if (!session) return;

    const modal = document.getElementById('subcont-session-detail-modal');
    const title = document.getElementById('subcont-modal-title');
    const subtitle = document.getElementById('subcont-modal-subtitle');
    const grid = document.getElementById('subcont-modal-info-grid');
    const defectsTbody = document.getElementById('subcont-modal-defects-tbody');
    const evidenceBox = document.getElementById('subcont-modal-evidence-box');
    const evidenceImg = document.getElementById('subcont-modal-evidence-img');

    if (title) title.textContent = ${session.model || 'Model'} ();
    if (subtitle) subtitle.textContent = Vendor:  | Sesi:  | Auditor: ;

    if (grid) {
        grid.innerHTML = 
            <div><span class="text-slate-400 block text-[10px]">Tgl Incoming</span><span class="font-bold text-slate-800"></span></div>
            <div><span class="text-slate-400 block text-[10px]">Tgl Inspeksi</span><span class="font-bold text-slate-800"></span></div>
            <div><span class="text-slate-400 block text-[10px]">Qty Incoming</span><span class="font-bold text-slate-800"></span></div>
            <div><span class="text-slate-400 block text-[10px]">Qty Inspect</span><span class="font-bold text-slate-800"></span></div>
            <div><span class="text-slate-400 block text-[10px]">Qty Pass</span><span class="font-bold text-emerald-600"></span></div>
            <div><span class="text-slate-400 block text-[10px]">Qty Defect</span><span class="font-bold text-rose-600"></span></div>
            <div><span class="text-slate-400 block text-[10px]">FTT Rate</span><span class="font-bold text-emerald-700"></span></div>
            <div><span class="text-slate-400 block text-[10px]">Status</span><span class="font-bold text-slate-800"></span></div>
        ;
    }

    // Filter defect detail for this session
    const sessionDefects = currentSubcontLogDefects.filter(d => d.session_id === sessionId);
    if (defectsTbody) {
        if (sessionDefects.length > 0) {
            defectsTbody.innerHTML = sessionDefects.map(d => 
                <tr>
                    <td class="py-2 px-3 font-medium text-slate-700"></td>
                    <td class="py-2 px-3 font-bold text-rose-600"></td>
                    <td class="py-2 px-3 text-right font-mono font-bold"></td>
                </tr>
            ).join('');
        } else {
            defectsTbody.innerHTML = '<tr><td colspan="3" class="py-3 text-center text-slate-400 italic">Tidak ada rincian defect untuk sesi ini (Pass All).</td></tr>';
        }
    }

    if (session.evidence_url && evidenceImg && evidenceBox) {
        evidenceImg.src = session.evidence_url;
        evidenceBox.classList.remove('hidden');
    } else if (evidenceBox) {
        evidenceBox.classList.add('hidden');
    }

    if (modal) modal.classList.remove('hidden');
};

window.exportSubcontInspectionLog = function() {
    if (typeof XLSX === 'undefined') {
        alert('Library SheetJS (XLSX) belum dimuat.');
        return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Inspection_Sessions
    const sRows = (currentSubcontLogSessions || []).map(s => ({
        'SessionID':     s.session_id || '',
        'timeStamp':     s.timestamp ? String(s.timestamp).replace('T', ' ').substring(0, 19) : '',
        'Date':          s.date || '',
        'Material Type': s.material_type || '',
        'User Login':    s.user_login || '',
        'Vendor':        s.vendor || '',
        'Component':     s.component || '',
        'Process':       s.process || '',
        'Style Number':  s.style_number || '',
        'Model':         s.model || '',
        'Qty Incoming':  Number(s.qty_incoming) || 0,
        'Qty Inspect':   Number(s.qty_inspect) || 0,
        'Qty Pass':      Number(s.qty_pass) || 0,
        'Qty Defect':    Number(s.qty_defect) || 0,
        'FTT (%)':       s.ftt ? (Number(s.ftt) * 100).toFixed(1) + '%' : '',
        'TanggalInsp':   s.tanggal_insp || '',
        'Bucket':        s.bucket || '',
        'ApprovedBy':    s.approved_by || '',
        'EvidenceUrl':   s.evidence_url || '',
        'Status':        s.status || 'Done',
    }));
    const ws1 = XLSX.utils.json_to_sheet(sRows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Inspection_Sessions');

    // Sheet 2: Defect_Breakdown
    const dRows = (currentSubcontLogDefects || []).map(d => ({
        'SessionId':     d.session_id || '',
        'Date':          d.date || '',
        'Vendor':        d.vendor || '',
        'Component':     d.component || '',
        'Issue Finding': d.issue_finding || '',
        'Count':         Number(d.count) || 0,
    }));
    const ws2 = XLSX.utils.json_to_sheet(dRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Defect_Breakdown');

    const nowStr = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    XLSX.writeFile(wb, IQC_Subcont_InspectionLog_.xlsx);
};
