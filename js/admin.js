// =============================================================
// admin.js — Admin Panel: CRUD for Defects Catalog and Users
// Source of truth: Supabase. localStorage = read cache for script.js.
// =============================================================

import {
    dbGetDefects,   dbInsertDefect,   dbUpdateDefect,   dbDeleteDefect,
    dbGetAppUsers,  dbInsertAppUser,  dbUpdateAppUser,  dbDeleteAppUser,
    dbGetVendors,   dbInsertVendor,   dbUpdateVendor,   dbDeleteVendor,
    dbGetComponents,dbInsertComponent,dbUpdateComponent,dbDeleteComponent,
    dbGetProcesses, dbInsertProcess,  dbUpdateProcess,  dbDeleteProcess,
} from './db.js';

export const DEFECTS_KEY    = 'eqms_defects_v1';
export const USERS_KEY      = 'eqms_users_v1';
export const VENDORS_KEY    = 'eqms_vendors_v1';
export const COMPONENTS_KEY = 'eqms_components_v1';
export const PROCESSES_KEY  = 'eqms_processes_v1';

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

// ─── SUPABASE SYNC ───────────────────────────────────────────
// Ambil semua data dari Supabase, perbarui localStorage cache.
// Diekspor agar bisa dipanggil dari script.js saat startup.

export async function syncAllFromSupabase() {
    const [defects, users, vendors, components, processes] = await Promise.all([
        dbGetDefects(),
        dbGetAppUsers(),
        dbGetVendors(),
        dbGetComponents(),
        dbGetProcesses(),
    ]);
    saveDefects(defects);
    saveUsers(users);
    saveVendors(vendors);
    saveComponents(components);
    saveProcesses(processes);
    return { defects, users, vendors, components, processes };
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

    document.getElementById('admin-tab-defects').addEventListener('click',    () => switchAdminTab('defects'));
    document.getElementById('admin-tab-users').addEventListener('click',      () => switchAdminTab('users'));
    document.getElementById('admin-tab-vendors').addEventListener('click',    () => switchAdminTab('vendors'));
    document.getElementById('admin-tab-components').addEventListener('click', () => switchAdminTab('components'));
    document.getElementById('admin-tab-processes').addEventListener('click',  () => switchAdminTab('processes'));

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
    ['defects', 'users', 'vendors', 'components', 'processes'].forEach(t => {
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
            alert(`Gagal menyimpan defect: ${err.message}`);
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
    if (!confirm('Hapus defect ini? Log inspeksi yang sudah ada tidak terpengaruh.')) return;
    try {
        await dbDeleteDefect(id);
        const fresh = await dbGetDefects();
        saveDefects(fresh);
        renderDefectsTab();
        refreshDefectButtonsInForm();
    } catch (err) {
        alert(`Gagal menghapus defect: ${err.message}`);
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

    tbody.innerHTML = users.map(u => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 font-mono text-slate-700 text-sm">${escHtml(u.nik)}</td>
            <td class="px-4 py-2.5 font-medium text-slate-800 text-sm">${escHtml(u.display_name)}</td>
            <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadge(u.role)} capitalize">${u.role}</span>
            </td>
            <td class="px-4 py-2.5 text-xs text-slate-400">${new Date(u.created_at).toLocaleDateString('id-ID')}</td>
            <td class="px-4 py-2.5">
                <div class="flex gap-3">
                    <button onclick="window.__adminEditUser(${u.id})" class="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onclick="window.__adminDeleteUser(${u.id})" class="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
            </td>
        </tr>`).join('');
}

function roleBadge(role) {
    return { admin: 'bg-purple-100 text-purple-700', supervisor: 'bg-blue-100 text-blue-700', auditor: 'bg-slate-100 text-slate-600' }[role] || 'bg-slate-100 text-slate-600';
}

function handleUserSubmit(e) {
    e.preventDefault();
    const nik  = document.getElementById('user-input-nik').value.trim();
    const name = document.getElementById('user-input-name').value.trim();
    const role = document.getElementById('user-input-role').value;
    if (!nik || !name || !role) return;

    if (!/^[a-zA-Z0-9]{1,20}$/.test(nik)) {
        alert('NIK hanya boleh alfanumerik, maks 20 karakter.');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    setFormBusy(btn, true);

    const finish = async () => {
        try {
            if (editingUserId !== null) {
                await dbUpdateAppUser(editingUserId, { nik, display_name: name, role });
            } else {
                await dbInsertAppUser({ nik, display_name: name, role });
            }
            const fresh = await dbGetAppUsers();
            saveUsers(fresh);
            renderUsersTab();
            cancelUserEdit();
        } catch (err) {
            alert(`Gagal menyimpan user: ${err.message}`);
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
    document.getElementById('user-input-nik').value  = user.nik;
    document.getElementById('user-input-name').value = user.display_name;
    document.getElementById('user-input-role').value = user.role;
    document.getElementById('admin-user-form-title').textContent = 'Edit User';
    document.getElementById('admin-user-cancel').classList.remove('hidden');
    document.getElementById('user-input-nik').focus();
};

window.__adminDeleteUser = async function(id) {
    const user = getUsers().find(u => u.id === id);
    if (!user) return;
    if (!confirm(`Hapus user "${user.display_name}" (${user.nik})?`)) return;
    try {
        await dbDeleteAppUser(id);
        const fresh = await dbGetAppUsers();
        saveUsers(fresh);
        renderUsersTab();
    } catch (err) {
        alert(`Gagal menghapus user: ${err.message}`);
    }
};

function cancelUserEdit() {
    editingUserId = null;
    document.getElementById('admin-user-form').reset();
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
    if (!name || !materialType) { alert('Vendor Name dan Material Type wajib diisi.'); return; }

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
            alert(`Gagal menyimpan vendor: ${err.message}`);
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
    if (!confirm('Hapus vendor ini?')) return;
    try {
        await dbDeleteVendor(id);
        const fresh = await dbGetVendors();
        saveVendors(fresh);
        renderVendorsTab();
        refreshDropdownsInForm();
    } catch (err) {
        alert(`Gagal menghapus vendor: ${err.message}`);
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
            alert(`Gagal menyimpan component: ${err.message}`);
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
    if (!confirm('Hapus component ini?')) return;
    try {
        await dbDeleteComponent(id);
        const fresh = await dbGetComponents();
        saveComponents(fresh);
        renderComponentsTab();
        refreshDropdownsInForm();
    } catch (err) {
        alert(`Gagal menghapus component: ${err.message}`);
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
    const components = getComponents();
    const vendors    = getVendors();
    const tbody = document.getElementById('admin-processes-tbody');
    if (!tbody) return;
    const countEl = document.getElementById('admin-processes-count');
    if (countEl) countEl.textContent = `${processes.length} processes`;
    tbody.innerHTML = processes.map(p => {
        const comp   = components.find(c => c.id === p.component_id);
        const vendor = comp ? vendors.find(v => v.id === comp.vendor_id) : null;
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 font-medium text-slate-800 text-sm">${escHtml(p.name)}</td>
            <td class="px-4 py-2.5 text-sm text-slate-500">${comp   ? escHtml(comp.name)   : '\u2014'}</td>
            <td class="px-4 py-2.5 text-sm text-slate-500">${vendor ? escHtml(vendor.name) : '\u2014'}</td>
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
    const name        = document.getElementById('process-input-name').value.trim();
    const componentId = parseInt(document.getElementById('process-input-component').value, 10) || null;
    if (!name || !componentId) { alert('Pilih component dan masukkan nama process.'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    setFormBusy(btn, true);

    const finish = async () => {
        try {
            if (editingProcessId !== null) {
                await dbUpdateProcess(editingProcessId, { name, component_id: componentId });
            } else {
                await dbInsertProcess({ name, component_id: componentId });
            }
            const fresh = await dbGetProcesses();
            saveProcesses(fresh);
            renderProcessesTab();
            cancelProcessEdit();
            refreshDropdownsInForm();
        } catch (err) {
            alert(`Gagal menyimpan process: ${err.message}`);
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
    // Restore vendor first (look up via component), then filter & set component
    const comp = getComponents().find(c => c.id === proc.component_id);
    const vendorId = comp ? (comp.vendor_id ?? '') : '';
    const procVendorSel = document.getElementById('process-input-vendor');
    if (procVendorSel) procVendorSel.value = vendorId;
    _populateProcessFormComponent(String(vendorId));
    document.getElementById('process-input-component').value = proc.component_id ?? '';
    document.getElementById('process-input-name').value      = proc.name;
    document.getElementById('admin-process-form-title').textContent = 'Edit Process';
    document.getElementById('admin-process-cancel').classList.remove('hidden');
    document.getElementById('process-input-name').focus();
};

window.__adminDeleteProcess = async function(id) {
    if (!confirm('Hapus process ini?')) return;
    try {
        await dbDeleteProcess(id);
        const fresh = await dbGetProcesses();
        saveProcesses(fresh);
        renderProcessesTab();
        refreshDropdownsInForm();
    } catch (err) {
        alert(`Gagal menghapus process: ${err.message}`);
    }
};

function cancelProcessEdit() {
    editingProcessId = null;
    document.getElementById('admin-process-form').reset();
    const procVendorSel = document.getElementById('process-input-vendor');
    if (procVendorSel) procVendorSel.value = '';
    _populateProcessFormComponent('');
    document.getElementById('admin-process-form-title').textContent = 'Add Process';
    document.getElementById('admin-process-cancel').classList.add('hidden');
}

