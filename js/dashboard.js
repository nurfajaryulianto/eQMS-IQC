// PENTING: Ganti dengan URL Web App Google Apps Script Anda
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxt5mmTI3bTAFMpaDo6VgVoKk8raDecfOoCbqsZgdK1-BwErb-VHROC0RSj8O8NYoR-JA/exec';

// --- IMPOR AUTH MODULE ---
import { requireRole, getUser, signOut, UI_TEST_MODE, ROLES } from './auth.js';

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
            if (confirm('Yakin ingin logout?')) {
                await signOut();
            }
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

    document.getElementById('defect-plant-filter').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentDefectPlant = e.target.dataset.plant;
            document.querySelectorAll('#defect-plant-filter .btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            updateDashboard();
        }
    });

    document.getElementById('grade-plant-filter').addEventListener('click', (e) => {
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
            const qtyInspect = Number(item.QtyInspect || item.Qty_Inspect) || 0;
            const pass       = Number(item.Pass)   || 0;
            const defect     = Number(item.Defect) || 0;
            // FTT & DefectRate dihitung dari data mentah (tidak disimpan di sheet)
            const ftt        = qtyInspect > 0 ? pass   / qtyInspect : 0;
            const defectRate = qtyInspect > 0 ? defect / qtyInspect : 0;
            return {
                Timestamp:       new Date(item.Timestamp),
                TanggalIncoming: item.TanggalIncoming || '',
                MaterialType:    item.MaterialType    || '',
                Auditor:         item.Auditor         || '',
                Vendor:          item.Vendor          || '',
                Component:       item.Component       || '',
                Process:         item.Process         || '',
                'Style Number':  item.StyleNumber     || item['Style Number'] || '',
                Model:           item.ModelName       || item.Model           || '',
                QtyIncoming:     Number(item.QtyIncoming) || 0,
                Qty_Inspect:     qtyInspect,
                Pass:            pass,
                Defect:          defect,
                FTT:             ftt,
                Rework_Rate:     defectRate,
                SessionId:       item.SessionId || '',
                // backward-compat
                NCVS:    item.NCVS    || '',
                A_Grade: Number(item.A_Grade) || 0,
                B_Grade: Number(item.B_Grade) || 0,
                C_Grade: Number(item.C_Grade) || 0,
            };
        });

        allDefects = rawDefects.map(item => ({
            SessionId:       item.SessionId       || '',
            TanggalIncoming: item.TanggalIncoming || '',
            Vendor:          item.Vendor          || '',
            Component:       item.Component       || '',
            DefectType:      item.DefectType      || item.Type || '',
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
        alert('Failed to load data. Please ensure the Web App URL is correct, re-deployed, and accessible to "Anyone".\nError: ' + error.message);
    } finally {
        loadingOverlay.style.display = 'none';
    }

function populateFilters(filters) {
    const populate = (elementId, options) => {
        const select = document.getElementById(elementId);
        select.innerHTML = '<option value="">All</option>'; // Changed text
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = option;
            select.appendChild(opt);
        });
    };
    populate('auditorFilter', filters.auditors.sort());
    populate('ncvsFilter', filters.ncvs.sort());
    populate('modelFilter', filters.models.sort());
    populate('styleNumberFilter', filters.styleNumbers.sort());

    // Populate the table auditor filter dynamically from actual data
    const auditorTableSelect = document.getElementById('auditorTableFilter');
    if (auditorTableSelect) {
        const currentVal = auditorTableSelect.value;
        auditorTableSelect.innerHTML = '<option value="all">All Auditor</option>';
        filters.auditors.slice().sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            auditorTableSelect.appendChild(opt);
        });
        // Restore previous selection if still valid
        if (currentVal && currentVal !== 'all') {
            auditorTableSelect.value = currentVal;
        }
    }
}

function resetFilters() {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('auditorFilter').value = '';
    document.getElementById('ncvsFilter').value = '';
    document.getElementById('modelFilter').value = '';
    document.getElementById('styleNumberFilter').value = '';
    updateDashboard();
}

function updateDashboard() {
    const filters = {
        startDate: document.getElementById('startDate').value ? new Date(document.getElementById('startDate').value) : null,
        endDate: document.getElementById('endDate').value ? new Date(document.getElementById('endDate').value) : null,
        auditor: document.getElementById('auditorFilter').value,
        ncvs: document.getElementById('ncvsFilter').value,
        model: document.getElementById('modelFilter').value,
        styleNumber: document.getElementById('styleNumberFilter').value,
    };

    if (filters.endDate) filters.endDate.setHours(23, 59, 59, 999);

    const filteredInspections = allInspections.filter(item => {
        const itemDate = item.Timestamp;
        return (!filters.startDate || itemDate >= filters.startDate) &&
            (!filters.endDate || itemDate <= filters.endDate) &&
            (!filters.auditor || item.Auditor === filters.auditor) &&
            (!filters.ncvs || item.NCVS == filters.ncvs) &&
            (!filters.model || item.Model === filters.model);
    });

    const filteredDefects = allDefects.filter(item => {
        const itemDate = item.Timestamp;
        return (!filters.startDate || itemDate >= filters.startDate) &&
            (!filters.endDate || itemDate <= filters.endDate) &&
            (!filters.auditor || item.Auditor === filters.auditor) &&
            (!filters.ncvs || item.NCVS == filters.ncvs) &&
            (!filters.model || item.Model === filters.model) &&
            (!filters.styleNumber || item['Style Number'] === filters.styleNumber);
    });

    updateMetrics(filteredInspections);
    updateFttChart(filteredInspections, currentFttPeriod);
    updateDefectChart(filteredDefects, currentDefectPlant);
    updateGradePieChart(filteredInspections, currentGradePlant);
    updateNcvsFttChart(filteredInspections, ncvsFttSortOrder);
    updateInspectionTable(filteredInspections);
}

function updateMetrics(data) {
    const totalInspected = data.reduce((sum, item) => sum + item.Qty_Inspect, 0);
    const totalAGrade = data.reduce((sum, item) => sum + item.A_Grade, 0);

    const fttSum = data.reduce((sum, item) => sum + item.FTT, 0);
    const reworkSum = data.reduce((sum, item) => sum + item.Rework_Rate, 0);

    const avgFtt = data.length > 0 ? fttSum / data.length : 0;
    const avgRework = data.length > 0 ? reworkSum / data.length : 0;
    const aGradePercentage = totalInspected > 0 ? (totalAGrade / totalInspected) * 100 : 0;

    document.getElementById('analytics-fttOutput').textContent = `${(avgFtt * 100).toFixed(2)}%`;
    document.getElementById('reworkRateOutput').textContent = `${(avgRework * 100).toFixed(2)}%`;
    document.getElementById('aGradeOutput').textContent = `${aGradePercentage.toFixed(2)}%`;
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


function updateDefectChart(data, plant) {
    const ctx = document.getElementById('defectChart').getContext('2d');
    let filteredData = data;

    if (plant === 'plant1') {
        filteredData = data.filter(d => plant1Auditors.includes(d.Auditor));
    } else if (plant === 'plant2') {
        filteredData = data.filter(d => plant2Auditors.includes(d.Auditor));
    }

    const defectCounts = {};
    filteredData.forEach(item => {
        const defectName = item.Defect; // Ini akan menjadi kunci utama, misalnya 'overcement'
        let count = Number(item.Total) || 0;

        // --- START MODIFIKASI UNTUK LOGIKA PAIRS ---
        // Asumsi: Jika ada kolom 'Type' dalam data defect Anda dan nilainya 'pairs'
        if (item.Position === 'Pairs') { // Pastikan kolom 'Position' ini ada di data defects Anda
            count = count * 2; // Kalikan dua jika tipenya 'pairs'
        }
        // --- END MODIFIKASI ---

        // Sekarang jumlahkan ke defectName utama
        defectCounts[defectName] = (defectCounts[defectName] || 0) + count;
    });

    const sortedDefects = Object.entries(defectCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

    const labels = sortedDefects.map(d => d[0]);
    const chartData = sortedDefects.map(d => d[1]);

    renderChart(ctx, 'bar', {
        labels: labels,
        datasets: [{
            label: 'Total Defects',
            data: chartData,
            backgroundColor: ['rgba(255, 99, 132, 0.6)', 'rgba(255, 159, 64, 0.6)', 'rgba(255, 205, 86, 0.6)'],
            borderColor: ['rgba(255, 99, 132, 1)', 'rgba(255, 159, 64, 1)', 'rgba(255, 205, 86, 1)'],
            borderWidth: 1
        }]
    }, {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
    });
}

function updateGradePieChart(data, plant) {
    const ctx = document.getElementById('gradePieChart').getContext('2d');
    let filteredData = data;

    if (plant === 'plant1') {
        filteredData = data.filter(d => plant1Auditors.includes(d.Auditor));
    } else if (plant === 'plant2') {
        filteredData = data.filter(d => plant2Auditors.includes(d.Auditor));
    }

    const totals = { a: 0, rework: 0, b: 0, c: 0 };

    filteredData.forEach(item => {
        totals.a += item.A_Grade;
        totals.b += item.B_Grade;
        totals.c += item.C_Grade;
        totals.rework += ((item.Rework_Kiri + item.Rework_Kanan) / 2) + item.Rework_Pairs;
    });

    renderChart(ctx, 'pie', {
        labels: ['A-Grade', 'Rework', 'B-Grade', 'C-Grade'],
        datasets: [{
            data: [totals.a, totals.rework, totals.b, totals.c],
            backgroundColor: ['#4CAF50', '#FFC107', '#FF9800', '#F44336'],
        }]
    }, { responsive: true, maintainAspectRatio: false });
}

function updateNcvsFttChart(data, sortOrder) {
    const ctx = document.getElementById('ncvsFttChart').getContext('2d');
    const ncvsData = {};

    data.forEach(item => {
        const ncvs = item.NCVS;
        if (!ncvs) return;
        if (!ncvsData[ncvs]) {
            ncvsData[ncvs] = { fttSum: 0, count: 0 };
        }
        ncvsData[ncvs].fttSum += item.FTT;
        ncvsData[ncvs].count++;
    });

    let processedData = Object.entries(ncvsData).map(([ncvs, values]) => ({
        ncvs: ncvs,
        avgFtt: values.count > 0 ? (values.fttSum / values.count) * 100 : 0
    }));

    processedData.sort((a, b) => {
        return sortOrder === 'asc' ? a.avgFtt - b.avgFtt : b.avgFtt - a.avgFtt;
    });

    const labels = processedData.map(item => item.ncvs);
    const chartData = processedData.map(item => item.avgFtt);

    renderChart(ctx, 'bar', {
        labels: labels,
        datasets: [{
            label: 'Average FTT (%)', // Changed label
            data: chartData,
            backgroundColor: 'rgba(153, 102, 255, 0.6)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1
        }]
    }, {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    callback: value => `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}%`
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
                        if (context.parsed.x !== null) {
                            label += `${context.parsed.x.toFixed(2)}%`;
                        }
                        return label;
                    }
                }
            }
        }
    });
}

function updateInspectionTable(data) {
    const tbody = document.getElementById('inspectionTableBody');
    tbody.innerHTML = '';

    let limitedData = data; // Ini adalah data yang sudah difilter dari filter utama (startDate, endDate, auditorFilter, ncvsFilter, modelFilter)

    // --- BARU: Filter data berdasarkan Auditor dari dropdown tabel ---
    if (currentAuditorTableFilter !== 'all') {
        limitedData = limitedData.filter(item => item.Auditor === currentAuditorTableFilter);
    }
    // --- AKHIR FILTER AUDITOR BARU ---

    // Menginisialisasi tanggal acuan
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Awal hari ini (00:00:00)

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

    if (sortedData.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="11" class="px-6 py-4 text-center text-sm text-gray-500">No data available for the selected view.</td>`;
        tbody.appendChild(row);
        return;
    }

    sortedData.forEach(item => {
        const row = document.createElement('tr');
        const reworkText = `${item.Rework_Kiri.toFixed(0)} / ${item.Rework_Kanan.toFixed(0)} / ${item.Rework_Pairs.toFixed(0)}`;
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.Timestamp.toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.Auditor}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.NCVS}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.Model}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.Qty_Inspect}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${(item.FTT * 100).toFixed(2)}%</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${(item.Rework_Rate * 100).toFixed(2)}%</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.A_Grade}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.B_Grade}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${item.C_Grade}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${reworkText}</td>
        `;
        tbody.appendChild(row);
    });
}
}
