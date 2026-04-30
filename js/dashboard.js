// PENTING: Ganti dengan URL Web App Google Apps Script Anda
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxt5mmTI3bTAFMpaDo6VgVoKk8raDecfOoCbqsZgdK1-BwErb-VHROC0RSj8O8NYoR-JA/exec';

// --- IMPOR AUTH MODULE ---
import { requireRole, getUser, signOut, UI_TEST_MODE, ROLES } from './auth.js';
import { showAlert, showConfirm } from './dialog.js';

// Global variables
let allInspections = [];
let allDefects = [];
let chartInstances = {};
let currentFttPeriod = 'days';
let currentDefectPlant = 'all';
let currentGradePlant = 'all';
let ncvsFttSortOrder = 'desc';

// New state variable for table view limit
let currentLimitView = 'today'; // Default tampilan awal tabel adalah 'today'
let currentAuditorTableFilter = 'all'; // Default auditor untuk tabel adalah 'all'

// Auditor mappings for plants
const plant1Auditors = ['Badrowi', 'Sopan Sopian', 'Elita', 'Puji', 'Muadaroh', 'Yaffie', 'Anin'];  
const plant2Auditors = ['Iksan', 'Inda', 'Inggit', 'Yusuf', 'Anin'];


export async function initDashboard() {
    // --- ROLE CHECK: Hanya supervisor dan admin yang boleh akses analytics ---
    const user = await getUser();
    const role = user?.user_metadata?.role || ROLES.AUDITOR;
    if (![ROLES.SUPERVISOR, ROLES.ADMIN].includes(role)) {
        const container = document.getElementById('view-analytics');
        if (container) {
            container.innerHTML = `<div class="flex items-center justify-center h-64"><div class="text-center"><p class="text-xl font-semibold text-slate-700">Access Denied</p><p class="text-slate-500 mt-2">You need Supervisor or Admin role to view Analytics.</p></div></div>`;
        }
        return;
    }

    // Tampilkan nama user yang sedang login
    const dashUserEl = document.getElementById('dash-user-display');
    if (dashUserEl && user) {
        const displayName = user.user_metadata?.display_name || user.user_metadata?.nik || 'User';
        dashUserEl.textContent = displayName;
    }

    // Tombol logout
    const logoutBtn = document.getElementById('dash-logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const yes = await showConfirm('Sesi Anda akan diakhiri.', 'Yakin ingin logout?', 'Ya, Logout', 'Batal');
            if (yes) await signOut();
        });
    }

    fetchData();
    document.getElementById('applyFilter').addEventListener('click', updateDashboard);
    document.getElementById('resetFilter').addEventListener('click', resetFilters);

    document.getElementById('ftt-time-filter').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentFttPeriod = e.target.dataset.period;
            document.querySelectorAll('#ftt-time-filter .btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            updateDashboard();
        }
    });

    const defectPlantEl = document.getElementById('defect-plant-filter');
    if (defectPlantEl) defectPlantEl.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentDefectPlant = e.target.dataset.plant;
            document.querySelectorAll('#defect-plant-filter .btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            updateDashboard();
        }
    });

    const gradePlantEl = document.getElementById('grade-plant-filter');
    if (gradePlantEl) gradePlantEl.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentGradePlant = e.target.dataset.plant;
            document.querySelectorAll('#grade-plant-filter .btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            updateDashboard();
        }
    });

    document.getElementById('ncvs-sort-filter').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            ncvsFttSortOrder = e.target.dataset.sort;
            document.querySelectorAll('#ncvs-sort-filter .btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            updateDashboard();
        }
    });

    // New event listener for the Limit View filter
// NEW: Event listener for Auditor Table Filter dropdown
    document.getElementById('auditorTableFilter').addEventListener('change', (e) => {
        currentAuditorTableFilter = e.target.value;
        updateDashboard(); // Panggil updateDashboard saat filter auditor tabel berubah
    });

    // NEW: Event listener for Limit View Filter dropdown
    document.getElementById('limitViewFilter').addEventListener('change', (e) => {
        currentLimitView = e.target.value;
        updateDashboard(); // Panggil updateDashboard saat filter limit view berubah
    });
}

async function fetchData() {
    const loadingOverlay = document.getElementById('analytics-loading-overlay');
    const urlErrorOverlay = document.getElementById('url-error-overlay');

    // ── UI TESTING MODE: Gunakan data dummy, skip fetch ke GAS ──
    if (UI_TEST_MODE) {
        loadingOverlay.style.display = 'none';
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        const twoDaysAgo = new Date(today); twoDaysAgo.setDate(today.getDate() - 2);

        allInspections = [
            { Timestamp: today, Auditor: 'Badrowi', NCVS: '101', Model: 'NIKE DYNAMO FREE (PS)', 'Style Number': '343738-013', Qty_Inspect: 30, FTT: 0.93, Rework_Rate: 0.05, A_Grade: 28, B_Grade: 1, C_Grade: 0, Rework_Kiri: 1, Rework_Kanan: 0, Rework_Pairs: 1 },
            { Timestamp: today, Auditor: 'Iksan', NCVS: '201', Model: 'WMNS TENNIS CLASSIC', 'Style Number': '312498-129', Qty_Inspect: 25, FTT: 0.88, Rework_Rate: 0.08, A_Grade: 22, B_Grade: 2, C_Grade: 0, Rework_Kiri: 1, Rework_Kanan: 1, Rework_Pairs: 0 },
            { Timestamp: today, Auditor: 'Elita', NCVS: '102', Model: 'NIKE DYNAMO FREE (TD)', 'Style Number': '343938-013', Qty_Inspect: 20, FTT: 0.95, Rework_Rate: 0.03, A_Grade: 19, B_Grade: 0, C_Grade: 0, Rework_Kiri: 1, Rework_Kanan: 0, Rework_Pairs: 0 },
            { Timestamp: yesterday, Auditor: 'Puji', NCVS: '103', Model: 'NIKE DYNAMO FREE (PS)', 'Style Number': '343738-020', Qty_Inspect: 35, FTT: 0.80, Rework_Rate: 0.12, A_Grade: 28, B_Grade: 3, C_Grade: 0, Rework_Kiri: 2, Rework_Kanan: 1, Rework_Pairs: 1 },
            { Timestamp: yesterday, Auditor: 'Badrowi', NCVS: '104', Model: 'WMNS TENNIS CLASSIC', 'Style Number': '312498-148', Qty_Inspect: 28, FTT: 0.96, Rework_Rate: 0.02, A_Grade: 27, B_Grade: 0, C_Grade: 1, Rework_Kiri: 0, Rework_Kanan: 0, Rework_Pairs: 1 },
            { Timestamp: twoDaysAgo, Auditor: 'Muadaroh', NCVS: '105', Model: 'NIKE DYNAMO FREE (PS)', 'Style Number': '343738-021', Qty_Inspect: 40, FTT: 0.75, Rework_Rate: 0.15, A_Grade: 30, B_Grade: 5, C_Grade: 1, Rework_Kiri: 2, Rework_Kanan: 2, Rework_Pairs: 2 },
        ];
        allDefects = [
            { Timestamp: today, Auditor: 'Badrowi', NCVS: '101', DefectType: 'OVER CEMENT', Position: 'LEFT', Level: 'r-grade', Count: 1 },
            { Timestamp: today, Auditor: 'Badrowi', NCVS: '101', DefectType: 'STAIN UPPER', Position: 'PAIRS', Level: 'b-grade', Count: 1 },
            { Timestamp: today, Auditor: 'Iksan', NCVS: '201', DefectType: 'BOND GAP UPPER', Position: 'RIGHT', Level: 'r-grade', Count: 1 },
            { Timestamp: today, Auditor: 'Iksan', NCVS: '201', DefectType: 'OVER CEMENT', Position: 'PAIRS', Level: 'b-grade', Count: 2 },
            { Timestamp: yesterday, Auditor: 'Puji', NCVS: '103', DefectType: 'WRINKLE', Position: 'LEFT', Level: 'r-grade', Count: 2 },
            { Timestamp: yesterday, Auditor: 'Puji', NCVS: '103', DefectType: 'THREAD END', Position: 'RIGHT', Level: 'b-grade', Count: 1 },
        ];

        populateFilters({
            auditors: [...new Set(allInspections.map(i => i.Auditor).filter(Boolean))],
            ncvs: [...new Set(allInspections.map(i => i.NCVS).filter(Boolean))],
            models: [...new Set(allInspections.map(i => i.Model).filter(Boolean))],
            styleNumbers: [...new Set(allInspections.map(i => i['Style Number']).filter(Boolean))],
        });
        updateDashboard();
        return;
    }
    // ── Akhir UI TESTING MODE ──

    loadingOverlay.style.display = 'flex';
    try {
        const response = await fetch(SCRIPT_URL);
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        // Mapping dari schema GAS baru (sessions + defects)
        const rawSessions = data.sessions || data.inspections || [];
        const rawDefects  = data.defects  || [];

        allInspections = rawSessions.map(item => {
            // Support both new schema (camelCase) and old schema (spaced headers)
            const qtyInspect = Number(item.QtyInspect || item.Qty_Inspect || item['Qty Inspect']) || 0;
            const pass       = Number(item.Pass   || item['Qty Pass'])   || 0;
            const defect     = Number(item.Defect || item['Qty Defect']) || 0;
            const ftt        = qtyInspect > 0 ? pass   / qtyInspect : 0;
            const defectRate = qtyInspect > 0 ? defect / qtyInspect : 0;
            return {
                Timestamp:       new Date(item.Timestamp || item.timeStamp),
                TanggalIncoming: item.TanggalIncoming || item.Date        || '',
                MaterialType:    item.MaterialType    || item['Material Type'] || '',
                Auditor:         item.Auditor         || item['User Login'] || '',
                Vendor:          item.Vendor          || '',
                Component:       item.Component       || '',
                Process:         item.Process         || '',
                'Style Number':  item.StyleNumber     || item['Style Number'] || '',
                Model:           item.ModelName       || item.Model           || '',
                QtyIncoming:     Number(item.QtyIncoming || item['Qty Incoming']) || 0,
                Qty_Inspect:     qtyInspect,
                Pass:            pass,
                Defect:          defect,
                FTT:             ftt,
                Rework_Rate:     defectRate,
                SessionId:       item.SessionId || item.SessionID || '',
            };
        });

        allDefects = rawDefects.map(item => ({
            SessionId:       item.SessionId       || item.SessionID      || '',
            TanggalIncoming: item.TanggalIncoming || item.Date           || '',
            Vendor:          item.Vendor          || '',
            Component:       item.Component       || '',
            DefectType:      item.DefectType      || item['Issue Findings'] || item.Type || '',
            Count:           Number(item.Count)   || 0,
        }));

        populateFilters({
            auditors:     [...new Set(allInspections.map(i => i.Auditor).filter(Boolean))],
            vendors:      [...new Set(allInspections.map(i => i.Vendor).filter(Boolean))],
            materialTypes:[...new Set(allInspections.map(i => i.MaterialType).filter(Boolean))],
            models:       [...new Set(allInspections.map(i => i.Model).filter(Boolean))],
            styleNumbers: [...new Set(allInspections.map(i => i['Style Number']).filter(Boolean))],
            // backward-compat
            ncvs:         [...new Set(allInspections.map(i => i.NCVS).filter(Boolean))],
        });
        updateDashboard();

    } catch (error) {
        console.error('Error fetching data:', error);
        // Changed alert message
        await showAlert('Gagal memuat data. Pastikan URL Web App sudah benar, sudah di-deploy ulang, dan akses diset ke "Anyone".\nError: ' + error.message, 'error', 'Gagal Memuat Data');
    } finally {
        loadingOverlay.style.display = 'none';
    }

function populateFilters(filters) {
    const populate = (elementId, options) => {
        const select = document.getElementById(elementId);
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">All</option>';
        (options || []).forEach(option => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = option;
            select.appendChild(opt);
        });
        if (currentVal) select.value = currentVal;
    };
    populate('auditorFilter', (filters.auditors || []).sort());
    populate('vendorFilter',  (filters.vendors  || []).sort());
    populate('modelFilter',   (filters.models   || []).sort());

    // Populate the table auditor filter dynamically from actual data
    const auditorTableSelect = document.getElementById('auditorTableFilter');
    if (auditorTableSelect) {
        const currentVal = auditorTableSelect.value;
        auditorTableSelect.innerHTML = '<option value="all">All Auditor</option>';
        (filters.auditors || []).slice().sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            auditorTableSelect.appendChild(opt);
        });
        if (currentVal && currentVal !== 'all') {
            auditorTableSelect.value = currentVal;
        }
    }
}

function resetFilters() {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('auditorFilter').value = '';
    const vf = document.getElementById('vendorFilter');       if (vf) vf.value = '';
    const mf = document.getElementById('materialTypeFilter'); if (mf) mf.value = '';
    document.getElementById('modelFilter').value = '';
    updateDashboard();
}

function updateDashboard() {
    const filters = {
        startDate:    document.getElementById('startDate').value ? new Date(document.getElementById('startDate').value) : null,
        endDate:      document.getElementById('endDate').value   ? new Date(document.getElementById('endDate').value)   : null,
        auditor:      document.getElementById('auditorFilter').value,
        vendor:       document.getElementById('vendorFilter')?.value       || '',
        materialType: document.getElementById('materialTypeFilter')?.value || '',
        model:        document.getElementById('modelFilter').value,
    };

    if (filters.endDate) filters.endDate.setHours(23, 59, 59, 999);

    const filteredInspections = allInspections.filter(item => {
        const d = item.Timestamp;
        return (!filters.startDate    || d >= filters.startDate) &&
               (!filters.endDate      || d <= filters.endDate) &&
               (!filters.auditor      || item.Auditor      === filters.auditor) &&
               (!filters.vendor       || item.Vendor       === filters.vendor) &&
               (!filters.materialType || item.MaterialType === filters.materialType) &&
               (!filters.model        || item.Model        === filters.model);
    });

    // Match defects by SessionId from filtered sessions
    const sessionIds = new Set(filteredInspections.map(s => s.SessionId).filter(Boolean));
    const filteredDefects = sessionIds.size > 0
        ? allDefects.filter(d => sessionIds.has(d.SessionId))
        : allDefects.filter(d => {
            const dt = d.TanggalIncoming ? new Date(d.TanggalIncoming) : null;
            return (!filters.startDate || !dt || dt >= filters.startDate) &&
                   (!filters.endDate   || !dt || dt <= filters.endDate) &&
                   (!filters.vendor    || d.Vendor === filters.vendor);
          });

    updateMetrics(filteredInspections);
    updateFttChart(filteredInspections, currentFttPeriod);
    updateDefectChart(filteredDefects);
    updateGradePieChart(filteredInspections);
    updateNcvsFttChart(filteredInspections, ncvsFttSortOrder);
    updateInspectionTable(filteredInspections);
}

function updateMetrics(data) {
    const totalQtyInspect = data.reduce((sum, item) => sum + item.Qty_Inspect, 0);
    const totalPass       = data.reduce((sum, item) => sum + item.Pass,        0);
    const totalDefect     = data.reduce((sum, item) => sum + item.Defect,      0);

    const fttPct        = totalQtyInspect > 0 ? (totalPass   / totalQtyInspect) * 100 : 0;
    const defectRatePct = totalQtyInspect > 0 ? (totalDefect / totalQtyInspect) * 100 : 0;

    document.getElementById('analytics-fttOutput').textContent = `${fttPct.toFixed(2)}%`;
    document.getElementById('reworkRateOutput').textContent    = `${defectRatePct.toFixed(2)}%`;
    const totalEl = document.getElementById('totalInspectedOutput');
    if (totalEl) totalEl.textContent = totalQtyInspect.toLocaleString('id-ID');

    // Animate circular progress rings
    const fttRing = document.getElementById('ftt-ring');
    if (fttRing) fttRing.setAttribute('stroke-dasharray', `${Math.min(fttPct, 100).toFixed(1)}, 100`);
    const defectRing = document.getElementById('defectrate-ring');
    if (defectRing) defectRing.setAttribute('stroke-dasharray', `${Math.min(defectRatePct, 100).toFixed(1)}, 100`);
}

function renderChart(ctx, type, data, options) {
    const id = ctx.canvas.id;
    if (chartInstances[id]) {
        chartInstances[id].destroy();
    }
    chartInstances[id] = new Chart(ctx, { type, data, options });
}

function updateFttChart(data, period) {
    const ctx = document.getElementById('fttChart').getContext('2d');
    const groupedData = {};

    data.forEach(item => {
        const date = item.Timestamp;
        let key;
        if (period === 'days') {
            // Ini adalah bagian yang mengatur format MM/DD/YYYY
            const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Bulan (01-12)
            const day = date.getDate().toString().padStart(2, '0');        // Hari (01-31)
            const year = date.getFullYear();                                  // Tahun (YYYY)
            key = `${month}/${day}/${year}`; // Format MM/DD/YYYY
        } else { // months
            // Untuk periode bulanan, tetap tampilkan nama bulan dan tahun (contoh: "Juli 2025")
            key = date.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
        }
        if (!groupedData[key]) {
            groupedData[key] = { fttSum: 0, count: 0 };
        }
        groupedData[key].fttSum += item.FTT;
        groupedData[key].count++;
    });

    const labels = Object.keys(groupedData).sort((a, b) => {
        if (period === 'days') {
            // Saat mengurutkan, pastikan kita mengurutkan sebagai tanggal, bukan string
            // Karena format MM/DD/YYYY, new Date(string) akan bekerja dengan baik.
            return new Date(a) - new Date(b);
        } else {
            // Logika pengurutan untuk bulan tetap sama
            const dateA = new Date(a.replace(/(\w+)\s(\d{4})/, "1 $1 $2"));
            const dateB = new Date(b.replace(/(\w+)\s(\d{4})/, "1 $1 $2"));
            return dateA - dateB;
        }
    });

    const finalLabels = (period === 'days' && labels.length > 11) ? labels.slice(-11) : labels;
    const chartData = finalLabels.map(label => {
        const avg = groupedData[label].count > 0 ? groupedData[label].fttSum / groupedData[label].count : 0;
        return (avg * 100);
    });

    renderChart(ctx, 'line', {
        labels: finalLabels,
        datasets: [{
            label: 'Average FTT (%)',
            data: chartData,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true
        }]
    }, {
        responsive: true, maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    callback: value => `${value.toFixed(0)}%`
                }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += `${context.parsed.y.toFixed(2)}%`;
                        }
                        return label;
                    }
                }
            }
        }
    });
}


function updateDefectChart(data) {
    const ctx = document.getElementById('defectChart').getContext('2d');
    const defectTotals = {};
    data.forEach(item => {
        const name = item.DefectType;
        if (!name) return;
        defectTotals[name] = (defectTotals[name] || 0) + (Number(item.Count) || 0);
    });

    const sorted = Object.entries(defectTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const palette = [
        'rgba(239,68,68,0.75)', 'rgba(245,158,11,0.75)', 'rgba(99,102,241,0.75)',
        'rgba(16,185,129,0.75)', 'rgba(107,114,128,0.75)',
    ];
    renderChart(ctx, 'bar', {
        labels: sorted.map(d => d[0]),
        datasets: [{
            label: 'Total Defects',
            data: sorted.map(d => d[1]),
            backgroundColor: sorted.map((_, i) => palette[i] || palette[4]),
            borderRadius: 4,
        }]
    }, {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    });
}

function updateGradePieChart(data) {
    const ctx = document.getElementById('gradePieChart').getContext('2d');
    const totalPass   = data.reduce((sum, item) => sum + item.Pass,   0);
    const totalDefect = data.reduce((sum, item) => sum + item.Defect, 0);

    renderChart(ctx, 'doughnut', {
        labels: ['Pass', 'Defect'],
        datasets: [{
            data: [totalPass, totalDefect],
            backgroundColor: ['#22c55e', '#ef4444'],
            borderWidth: 2,
        }]
    }, {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const total = totalPass + totalDefect;
                        const pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                        return ` ${context.label}: ${context.parsed} (${pct}%)`;
                    }
                }
            }
        }
    });
}

function updateNcvsFttChart(data, sortOrder) {
    const ctx = document.getElementById('ncvsFttChart').getContext('2d');
    const vendorData = {};

    data.forEach(item => {
        const vendor = item.Vendor;
        if (!vendor) return;
        if (!vendorData[vendor]) vendorData[vendor] = { passSum: 0, inspectSum: 0 };
        vendorData[vendor].passSum    += item.Pass;
        vendorData[vendor].inspectSum += item.Qty_Inspect;
    });

    let processed = Object.entries(vendorData).map(([vendor, vals]) => ({
        vendor,
        avgFtt: vals.inspectSum > 0 ? (vals.passSum / vals.inspectSum) * 100 : 0
    }));

    processed.sort((a, b) => sortOrder === 'asc' ? a.avgFtt - b.avgFtt : b.avgFtt - a.avgFtt);

    renderChart(ctx, 'bar', {
        labels: processed.map(d => d.vendor),
        datasets: [{
            label: 'FTT (%)',
            data: processed.map(d => d.avgFtt),
            backgroundColor: 'rgba(99, 102, 241, 0.65)',
            borderRadius: 4,
        }]
    }, {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x.toFixed(2)}%` } }
        },
        scales: {
            x: { beginAtZero: true, max: 100, ticks: { callback: v => `${v}%` } }
        }
    });
}

function updateInspectionTable(data) {
    const tbody = document.getElementById('inspectionTableBody');
    tbody.innerHTML = '';

    let limitedData = data;

    if (currentAuditorTableFilter !== 'all') {
        limitedData = limitedData.filter(item => item.Auditor === currentAuditorTableFilter);
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // --- MODIFIKASI: Logika pemfilteran tanggal berdasarkan currentLimitView ---
    if (currentLimitView === 'today') {
        limitedData = limitedData.filter(item => {
            const itemDate = new Date(item.Timestamp.getFullYear(), item.Timestamp.getMonth(), item.Timestamp.getDate());
            return itemDate.getTime() === today.getTime();
        });
    } else if (currentLimitView === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1); // Mundur 1 hari
        limitedData = limitedData.filter(item => {
            const itemDate = new Date(item.Timestamp.getFullYear(), item.Timestamp.getMonth(), item.Timestamp.getDate());
            return itemDate.getTime() === yesterday.getTime();
        });
    } else if (currentLimitView === 'this_week') {
        const firstDayOfWeek = new Date(today);
        firstDayOfWeek.setDate(today.getDate() - today.getDay()); // Mendapat hari Minggu minggu ini (00:00:00)
        firstDayOfWeek.setHours(0, 0, 0, 0); // Pastikan tepat di awal hari Minggu
        limitedData = limitedData.filter(item => item.Timestamp >= firstDayOfWeek);
    } else if (currentLimitView === 'last_week') { // Logika untuk "Last Week"
        const endOfLastWeek = new Date(today);
        endOfLastWeek.setDate(today.getDate() - today.getDay() - 1); // Mundur ke hari Sabtu minggu lalu
        endOfLastWeek.setHours(23, 59, 59, 999); // Hingga akhir hari Sabtu

        const startOfLastWeek = new Date(endOfLastWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 6); // Mundur 6 hari dari Sabtu untuk mendapatkan Minggu minggu lalu
        startOfLastWeek.setHours(0, 0, 0, 0); // Mulai dari awal hari Minggu

        limitedData = limitedData.filter(item => item.Timestamp >= startOfLastWeek && item.Timestamp <= endOfLastWeek);
    }
    // --- AKHIR MODIFIKASI FILTER TANGGAL ---

    const sortedData = limitedData.sort((a, b) => b.Timestamp.getTime() - a.Timestamp.getTime());

    if (!sortedData.length) {
        tbody.innerHTML = `<tr><td colspan="12" class="px-4 py-6 text-center text-sm text-slate-400">No data available for the selected period.</td></tr>`;
        return;
    }

    sortedData.forEach(item => {
        const fttPct = item.Qty_Inspect > 0 ? ((item.Pass / item.Qty_Inspect) * 100).toFixed(1) : '0.0';
        const fttColor = parseFloat(fttPct) >= 92 ? 'text-green-600' : parseFloat(fttPct) >= 80 ? 'text-yellow-600' : 'text-red-600';
        const materialBadge = item.MaterialType === 'upper'
            ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">Upper</span>'
            : item.MaterialType === 'bottom'
            ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Bottom</span>'
            : '<span class="text-slate-400">—</span>';
        const row = document.createElement('tr');
        row.className = 'border-b border-slate-100 hover:bg-slate-50 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-500">${item.Timestamp.toLocaleString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</td>
            <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-700">${item.TanggalIncoming || '—'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">${item.Auditor}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-700">${item.Vendor || '—'}</td>
            <td class="px-4 py-3 whitespace-nowrap">${materialBadge}</td>
            <td class="px-4 py-3 text-xs text-slate-600 max-w-[140px] truncate">${item.Component || '—'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-700">${item['Style Number'] || '—'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-right tabular-nums">${item.QtyIncoming}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-right tabular-nums">${item.Qty_Inspect}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-right tabular-nums text-green-600 font-medium">${item.Pass}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-right tabular-nums text-red-500 font-medium">${item.Defect}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-bold tabular-nums ${fttColor}">${fttPct}%</td>
        `;
        tbody.appendChild(row);
    });
}
}
