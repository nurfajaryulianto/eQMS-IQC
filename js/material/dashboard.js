// ============================================================
// js/material/dashboard.js — IQC Material: Dashboard KPI Logic
// ============================================================

import { requireMaterialRole, materialLogout, MATERIAL_TEST_MODE, MATERIAL_ROLES } from './auth.js';
import { apiGetInspectionData } from './api.js';

// ─── STATE ───────────────────────────────────────────────────
let allInspections = [];
let filteredData = [];
let chartInstances = {};
let currentPeriod = 'daily';
let currentUser = null;

// ─── MOCK DATA ────────────────────────────────────────────────
function generateMockData() {
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const twoDays = new Date(today); twoDays.setDate(today.getDate() - 2);
    const fiveDays = new Date(today); fiveDays.setDate(today.getDate() - 5);

    return [
        { inspection_id: 'INSP-001', inspection_date: today, po_number: 'PO-2025-001', material_name: 'Upper Leather A', vendor_name: 'PT Sumber Makmur', inspector_nik: 'INS001', qty_inspect: 200, qty_fail: 4, result_status: 'Fail', input_type: 'manual' },
        { inspection_id: 'INSP-002', inspection_date: today, po_number: 'PO-2025-002', material_name: 'Outsole Rubber', vendor_name: 'CV Karet Nusantara', inspector_nik: 'INS002', qty_inspect: 150, qty_fail: 0, result_status: 'Pass', input_type: 'manual' },
        { inspection_id: 'INSP-003', inspection_date: yesterday, po_number: 'PO-2025-003', material_name: 'EVA Midsole', vendor_name: 'PT Foam Indo', inspector_nik: 'INS001', qty_inspect: 100, qty_fail: 8, result_status: 'Fail', input_type: 'manual' },
        { inspection_id: 'INSP-004', inspection_date: yesterday, po_number: 'PO-2025-004', material_name: 'Textile Lace', vendor_name: 'PT Sumber Makmur', inspector_nik: 'INS003', qty_inspect: 300, qty_fail: 3, result_status: 'Fail', input_type: 'manual' },
        { inspection_id: 'INSP-005', inspection_date: twoDays, po_number: 'PO-2025-005', material_name: 'Thread Nylon', vendor_name: 'CV Benang Jaya', inspector_nik: 'INS002', qty_inspect: 50, qty_fail: 0, result_status: 'Pass', input_type: 'batch_pass_all' },
        { inspection_id: 'INSP-006', inspection_date: fiveDays, po_number: 'PO-2025-006', material_name: 'Upper Mesh B', vendor_name: 'PT Sumber Makmur', inspector_nik: 'INS001', qty_inspect: 180, qty_fail: 12, result_status: 'Fail', input_type: 'manual' },
        { inspection_id: 'INSP-007', inspection_date: fiveDays, po_number: 'PO-2025-007', material_name: 'Outsole Foam', vendor_name: 'CV Karet Nusantara', inspector_nik: 'INS003', qty_inspect: 90, qty_fail: 2, result_status: 'Fail', input_type: 'manual' },
    ];
}

// ─── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireMaterialRole([MATERIAL_ROLES.ADMIN, MATERIAL_ROLES.SUPERVISOR, MATERIAL_ROLES.MANAGER]);
    if (!currentUser) return;

    setupNavbar(currentUser);
    setupLogout();
    setDefaultDates();
    await fetchData();
});

function setupNavbar(user) {
    const el = document.getElementById('nav-user-name');
    if (el) el.textContent = user.name || user.nik || 'User';

    const role = user.role;
    if (role === MATERIAL_ROLES.ADMIN || role === MATERIAL_ROLES.SUPERVISOR || role === MATERIAL_ROLES.MANAGER) {
        const adminLink = document.getElementById('nav-admin-link');
        if (adminLink) adminLink.style.display = 'flex';
    }
}

function setupLogout() {
    const btn = document.getElementById('nav-logout-btn');
    if (btn) btn.addEventListener('click', async () => {
        if (confirm('Yakin ingin logout?')) {
            await materialLogout();
        }
    });
}

function setDefaultDates() {
    const today = new Date();
    const fmt = d => d.toISOString().split('T')[0];
    const minus = n => { const d = new Date(today); d.setDate(today.getDate() - n); return d; };

    document.getElementById('filter-end').value = fmt(today);
    document.getElementById('filter-start').value = fmt(today);
}

// ─── FETCH DATA ───────────────────────────────────────────────

async function fetchData() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('visible');

    try {
        if (MATERIAL_TEST_MODE) {
            allInspections = generateMockData().map(d => ({
                ...d,
                inspection_date: new Date(d.inspection_date),
                qty_inspect: Number(d.qty_inspect),
                qty_fail: Number(d.qty_fail),
            }));
        } else {
            const result = await apiGetInspectionData({ limit: 10000 });
            if (result.data) {
                allInspections = (result.data || []).map(d => ({
                    ...d,
                    inspection_date: d.inspection_date ? new Date(d.inspection_date) : new Date(),
                    qty_inspect:     Number(d.qty_inspect) || 0,
                    qty_fail:        Number(d.qty_fail)    || 0,
                }));
            }
        }

        populateFilters();
        applyFilter();

    } catch (err) {
        console.error('fetchData error:', err);
    } finally {
        if (overlay) overlay.classList.remove('visible');
    }
}

// ─── POPULATE FILTER DROPDOWNS ────────────────────────────────

function populateFilters() {
    const vendors = [...new Set(allInspections.map(d => d.vendor_name).filter(Boolean))].sort();
    const inspectors = [...new Set(allInspections.map(d => d.inspector_nik).filter(Boolean))].sort();

    const populate = (id, options) => {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        el.innerHTML = `<option value="">${el.id === 'filter-vendor' ? 'Semua Vendor' : 'Semua Inspector'}</option>`;
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = o.textContent = opt;
            el.appendChild(o);
        });
        if (current) el.value = current;
    };
    populate('filter-vendor', vendors);
    populate('filter-inspector', inspectors);
}

// ─── APPLY FILTER ─────────────────────────────────────────────

window.applyFilter = function () {
    const startStr = document.getElementById('filter-start')?.value;
    const endStr = document.getElementById('filter-end')?.value;
    const vendor = document.getElementById('filter-vendor')?.value || '';
    const inspector = document.getElementById('filter-inspector')?.value || '';

    const parseDate = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const start = parseDate(startStr);
    const end = parseDate(endStr);
    if (end) end.setHours(23, 59, 59, 999);

    filteredData = allInspections.filter(d => {
        const dt = d.inspection_date;
        return (!start || dt >= start) &&
            (!end || dt <= end) &&
            (!vendor || d.vendor_name === vendor) &&
            (!inspector || d.inspector_nik === inspector);
    });

    updateKPICards();
    renderCharts();
    
};

window.resetFilter = function () {
    setDefaultDates();
    const vendorEl = document.getElementById('filter-vendor');
    const inspectorEl = document.getElementById('filter-inspector');
    if (vendorEl) vendorEl.value = '';
    if (inspectorEl) inspectorEl.value = '';
    setPeriod('daily');
};

// ─── PERIOD FILTER ────────────────────────────────────────────

window.setPeriod = function (period) {
    currentPeriod = period;
    ['daily', 'weekly', 'monthly'].forEach(p => {
        const btn = document.getElementById('period-' + p);
        if (btn) btn.classList.toggle('active', p === period);
    });

    const today = new Date();
    const fmt = d => d.toISOString().split('T')[0];
    const minus = n => { const d = new Date(today); d.setDate(today.getDate() - n); return d; };

    const startEl = document.getElementById('filter-start');
    const endEl = document.getElementById('filter-end');
    if (!startEl || !endEl) return;

    endEl.value = fmt(today);
    if (period === 'daily') startEl.value = fmt(today);
    if (period === 'weekly') startEl.value = fmt(minus(6));
    if (period === 'monthly') startEl.value = fmt(minus(29));

    applyFilter();
};

// ─── KPI CARDS ────────────────────────────────────────────────

function updateKPICards() {
    const totalInspect = filteredData.reduce((s, d) => s + (Number(d.qty_inspect) || 0), 0);
    const totalFail = filteredData.reduce((s, d) => s + (Number(d.qty_fail) || 0), 0);
    const totalPass = totalInspect - totalFail;

    const ftt = totalInspect > 0 ? (totalPass / totalInspect) * 100 : 0;
    const rejectRate = totalInspect > 0 ? (totalFail / totalInspect) * 100 : 0;

    const totalPoInspected = filteredData.length;
    const passPoCount = filteredData.filter(d => (Number(d.qty_fail) || 0) === 0).length;
    const failPoCount = totalPoInspected - passPoCount;

    const fttColor = ftt >= 95 ? '#16a34a' : ftt >= 85 ? '#d97706' : '#dc2626';
    const rejectColor = rejectRate <= 2 ? '#16a34a' : rejectRate <= 5 ? '#d97706' : '#dc2626';

    setKPI('kpi-ftt', `${ftt.toFixed(1)}%`, `${totalPoInspected.toLocaleString('id-ID')} baris PO`, fttColor);
    setKPI('kpi-reject', `${rejectRate.toFixed(2)}%`, `${totalFail.toLocaleString('id-ID')} unit fail`, rejectColor);

    const poSub = `${totalInspect.toLocaleString('id-ID')} total unit (${passPoCount} Pass | ${failPoCount} Fail)`;
    setKPI('kpi-po', totalPoInspected.toLocaleString('id-ID'), poSub, null);
    setKPI('kpi-qty', totalPoInspected.toLocaleString('id-ID'), poSub, null);
}

function setKPI(id, value, sub, color) {
    const el = document.getElementById(id);
    const subEl = document.getElementById(id + '-sub');
    if (el) { el.textContent = value; if (color) el.style.color = color; }
    if (subEl) subEl.textContent = sub;
}

// ─── CHARTS ──────────────────────────────────────────────────

function renderCharts() {
    renderVendorChart();
    renderFTTTrendChart();
}

function renderVendorChart() {
    const ctx = document.getElementById('chart-vendor');
    if (!ctx) return;

    // Aggregate reject rate per vendor
    const vendorMap = {};
    filteredData.forEach(d => {
        if (!vendorMap[d.vendor_name]) vendorMap[d.vendor_name] = { inspect: 0, fail: 0 };
        vendorMap[d.vendor_name].inspect += d.qty_inspect;
        vendorMap[d.vendor_name].fail += d.qty_fail;
    });

    const labels = Object.keys(vendorMap).sort();
    const rates = labels.map(v => vendorMap[v].inspect > 0 ? ((vendorMap[v].fail / vendorMap[v].inspect) * 100) : 0);

    const colors = rates.map(r => r <= 2 ? '#10b981' : r <= 5 ? '#f59e0b' : '#ef4444');

    if (chartInstances.vendor) chartInstances.vendor.destroy();
    chartInstances.vendor = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ data: rates, backgroundColor: colors, borderRadius: 6, borderSkipped: false }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => v + '%', color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                },
                x: { ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }, grid: { display: false } },
            },
        },
    });
}

function renderFTTTrendChart() {
    const ctx = document.getElementById('chart-ftt-trend');
    if (!ctx) return;

    // Group by date
    const dateMap = {};
    filteredData.forEach(d => {
        const dateKey = d.inspection_date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        if (!dateMap[dateKey]) dateMap[dateKey] = { inspect: 0, fail: 0 };
        dateMap[dateKey].inspect += d.qty_inspect;
        dateMap[dateKey].fail += d.qty_fail;
    });

    const labels = Object.keys(dateMap);
    const ftts = labels.map(dt => {
        const grp = dateMap[dt];
        return grp.inspect > 0 ? ((grp.inspect - grp.fail) / grp.inspect) * 100 : 0;
    });

    if (chartInstances.ftt) chartInstances.ftt.destroy();
    chartInstances.ftt = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: ftts,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#10b981',
                pointRadius: 4,
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    min: 0, max: 100,
                    ticks: { callback: v => v + '%', color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                },
                x: { ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }, grid: { display: false } },
            },
        },
    });
}



// ─── UTILS ───────────────────────────────────────────────────

function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
