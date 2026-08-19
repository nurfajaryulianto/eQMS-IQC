import { supabase } from './db.js';
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
let modelFttSortOrder = 'desc';

// New state variable for table view limit
let currentLimitView = 'today'; // Default tampilan awal tabel adalah 'today'
let currentAuditorTableFilter = 'all'; // Default auditor untuk tabel adalah 'all'

// Auditor mappings for plants
const plant1Auditors = ['Badrowi', 'Sopan Sopian', 'Elita', 'Puji', 'Muadaroh', 'Yaffie', 'Anin'];
const plant2Auditors = ['Iksan', 'Inda', 'Inggit', 'Yusuf', 'Anin'];


export async function initDashboard() {
    const user = await getUser();
    const role = user?.user_metadata?.role || ROLES.INSPECTOR;
    if (![ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN].includes(role)) {
        const container = document.getElementById('view-analytics');
        if (container) {
            container.innerHTML = `<div class="flex items-center justify-center h-64"><div class="text-center"><p class="text-xl font-semibold text-slate-700">Access Denied</p><p class="text-slate-500 mt-2">You need Supervisor, Manager, or Admin role to view Analytics.</p></div></div>`;
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

    // Set default date filters to today in local time
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const startDateEl = document.getElementById('startDate');
    const endDateEl = document.getElementById('endDate');
    if (startDateEl) startDateEl.value = todayStr;
    if (endDateEl) endDateEl.value = todayStr;

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

    const modelSortEl = document.getElementById('model-sort-filter');
    if (modelSortEl) {
        modelSortEl.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                modelFttSortOrder = e.target.dataset.sort;
                document.querySelectorAll('#model-sort-filter .btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                updateDashboard();
            }
        });
    }

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
        // Query directly from Supabase subcont_inspections & subcont_defect_logs (<100ms)
        const [resSess, resDef] = await Promise.all([
            supabase.from('subcont_inspections').select('*').order('date', { ascending: true }),
            supabase.from('subcont_defect_logs').select('*').order('date', { ascending: true })
        ]);

        if (resSess.error) throw resSess.error;
        if (resDef.error) throw resDef.error;

        const rawSessions = resSess.data || [];
        const rawDefects = resDef.data || [];

        allInspections = rawSessions.map(item => {
            const qtyInspect = Number(item.qty_inspect) || 0;
            const pass = Number(item.qty_pass) || 0;
            const defect = Number(item.qty_defect) || 0;
            const ftt = qtyInspect > 0 ? pass / qtyInspect : 0;
            const defectRate = qtyInspect > 0 ? defect / qtyInspect : 0;
            return {
                Timestamp: new Date(item.timestamp || item.created_at),
                TanggalIncoming: item.date || '',
                TanggalInspection: item.tanggal_insp || item.date || '',
                Bucket: item.bucket || '',
                MaterialType: item.material_type || '',
                Auditor: item.user_login || '',
                Vendor: item.vendor || '',
                Component: item.component || '',
                Process: item.process || '',
                'Style Number': item.style_number || '',
                Model: item.model || '',
                QtyIncoming: Number(item.qty_incoming) || 0,
                Qty_Inspect: qtyInspect,
                Pass: pass,
                Defect: defect,
                FTT: ftt,
                Rework_Rate: defectRate,
                SessionId: item.session_id || '',
                ApprovedByLeader: item.approved_by || '',
                EvidenceUrl: item.evidence_url || '',
            };
        });

        allDefects = rawDefects.map(item => ({
            SessionId: item.session_id || '',
            TanggalIncoming: item.date || '',
            Vendor: item.vendor || '',
            Component: item.component || '',
            DefectType: item.issue_finding || '',
            Count: Number(item.count) || 0,
        }));

        populateFilters({
            auditors: [...new Set(allInspections.map(i => i.Auditor).filter(Boolean))],
            vendors: [...new Set(allInspections.map(i => i.Vendor).filter(Boolean))],
            materialTypes: [...new Set(allInspections.map(i => i.MaterialType).filter(Boolean))],
            models: [...new Set(allInspections.map(i => i.Model).filter(Boolean))],
            styleNumbers: [...new Set(allInspections.map(i => i['Style Number']).filter(Boolean))],
            // backward-compat
            ncvs: [...new Set(allInspections.map(i => i.NCVS).filter(Boolean))],
        });
        updateDashboard();

    } catch (error) {
        console.error('Error fetching data:', error);
        await showAlert('Gagal memuat data analitik: ' + error.message, 'error', 'Gagal Memuat Data');
    } finally {
        loadingOverlay.style.display = 'none';
    }
} // end fetchData

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
    populate('vendorFilter', (filters.vendors || []).sort());
    populate('modelFilter', (filters.models || []).sort());

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
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const startDateEl = document.getElementById('startDate');
    const endDateEl = document.getElementById('endDate');
    if (startDateEl) startDateEl.value = todayStr;
    if (endDateEl) endDateEl.value = todayStr;

    document.getElementById('auditorFilter').value = '';
    const vf = document.getElementById('vendorFilter'); if (vf) vf.value = '';
    const mf = document.getElementById('materialTypeFilter'); if (mf) mf.value = '';
    document.getElementById('modelFilter').value = '';
    updateDashboard();
}

function getItemDateStr(item) {
    if (item.TanggalInspection && typeof item.TanggalInspection === 'string') {
        const trimmed = item.TanggalInspection.trim().substring(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    }
    if (item.TanggalIncoming && typeof item.TanggalIncoming === 'string') {
        const trimmed = item.TanggalIncoming.trim().substring(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    }
    if (item.Timestamp instanceof Date && !isNaN(item.Timestamp)) {
        const year = item.Timestamp.getFullYear();
        const month = String(item.Timestamp.getMonth() + 1).padStart(2, '0');
        const day = String(item.Timestamp.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return '';
}

function updateDashboard() {
    const startVal = document.getElementById('startDate')?.value || '';
    const endVal = document.getElementById('endDate')?.value || '';

    const filters = {
        startDate: startVal,
        endDate: endVal,
        auditor: document.getElementById('auditorFilter')?.value || '',
        vendor: document.getElementById('vendorFilter')?.value || '',
        materialType: document.getElementById('materialTypeFilter')?.value || '',
        model: document.getElementById('modelFilter')?.value || '',
    };

    const filteredInspections = allInspections.filter(item => {
        const d = getItemDateStr(item);
        return (!filters.startDate || (d && d >= filters.startDate)) &&
            (!filters.endDate || (d && d <= filters.endDate)) &&
            (!filters.auditor || item.Auditor === filters.auditor) &&
            (!filters.vendor || item.Vendor === filters.vendor) &&
            (!filters.materialType || item.MaterialType === filters.materialType) &&
            (!filters.model || item.Model === filters.model);
    });

    // Match defects by SessionId from filtered sessions
    const sessionIds = new Set(filteredInspections.map(s => s.SessionId).filter(Boolean));
    const filteredDefects = sessionIds.size > 0
        ? allDefects.filter(d => sessionIds.has(d.SessionId))
        : allDefects.filter(d => {
            const dt = (d.TanggalIncoming || '').trim().substring(0, 10);
            return (!filters.startDate || (dt && dt >= filters.startDate)) &&
                (!filters.endDate || (dt && dt <= filters.endDate)) &&
                (!filters.vendor || d.Vendor === filters.vendor);
        });

    updateMetrics(filteredInspections);
    updateFttChart(filteredInspections, currentFttPeriod);
    updateDefectChart(filteredDefects);
    updateModelPerformanceChart(filteredInspections, modelFttSortOrder);
    updateNcvsFttChart(filteredInspections, ncvsFttSortOrder);
    updateInspectionTable(filteredInspections);
}

function updateMetrics(data) {
    const totalQtyInspect = data.reduce((sum, item) => sum + item.Qty_Inspect, 0);
    const totalPass = data.reduce((sum, item) => sum + item.Pass, 0);
    const totalDefect = data.reduce((sum, item) => sum + item.Defect, 0);

    const fttPct = totalQtyInspect > 0 ? (totalPass / totalQtyInspect) * 100 : 0;
    const defectRatePct = totalQtyInspect > 0 ? (totalDefect / totalQtyInspect) * 100 : 0;

    document.getElementById('analytics-fttOutput').textContent = `${fttPct.toFixed(2)}%`;
    document.getElementById('reworkRateOutput').textContent = `${defectRatePct.toFixed(2)}%`;
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
        const dateStr = getItemDateStr(item);
        let key = '';
        if (dateStr) {
            const [y, m, d] = dateStr.split('-').map(Number);
            if (period === 'days') {
                const month = String(m).padStart(2, '0');
                const day = String(d).padStart(2, '0');
                key = `${month}/${day}/${y}`;
            } else {
                const dt = new Date(y, m - 1, d);
                key = dt.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
            }
        } else {
            key = 'N/A';
        }
        if (!groupedData[key]) {
            groupedData[key] = { fttSum: 0, count: 0 };
        }
        groupedData[key].fttSum += item.FTT;
        groupedData[key].count++;
    });

    const labels = Object.keys(groupedData).sort((a, b) => {
        if (period === 'days') {
            return new Date(a) - new Date(b);
        } else {
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
                    label: function (context) {
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

function updateModelPerformanceChart(data, sortOrder) {
    const el = document.getElementById('modelFttChart');
    if (!el) return;
    const ctx = el.getContext('2d');
    const modelData = {};

    data.forEach(item => {
        const model = item.Model || item.ModelName;
        if (!model) return;
        if (!modelData[model]) modelData[model] = { passSum: 0, inspectSum: 0 };
        const pass = item.Pass != null ? item.Pass : (item.A_Grade != null ? item.A_Grade : Math.round(item.Qty_Inspect * (item.FTT || 0)));
        const inspect = item.Qty_Inspect || item.QtyIncoming || 0;
        modelData[model].passSum += pass;
        modelData[model].inspectSum += inspect;
    });

    let processed = Object.entries(modelData).map(([model, vals]) => ({
        model,
        avgFtt: vals.inspectSum > 0 ? (vals.passSum / vals.inspectSum) * 100 : 0
    }));

    processed.sort((a, b) => sortOrder === 'asc' ? a.avgFtt - b.avgFtt : b.avgFtt - a.avgFtt);

    renderChart(ctx, 'bar', {
        labels: processed.map(d => d.model),
        datasets: [{
            label: 'FTT (%)',
            data: processed.map(d => d.avgFtt),
            backgroundColor: 'rgba(16, 185, 129, 0.65)',
            borderColor: 'rgba(16, 185, 129, 1)',
            borderWidth: 1,
            borderRadius: 4,
        }]
    }, {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` FTT: ${ctx.parsed.y.toFixed(2)}%` } }
        },
        scales: {
            y: { beginAtZero: true, max: 100, ticks: { callback: v => `${v}%` } }
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
        vendorData[vendor].passSum += item.Pass;
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
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(2)}%` } }
        },
        scales: {
            y: { beginAtZero: true, max: 100, ticks: { callback: v => `${v}%` } }
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

    const toYMD = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const now = new Date();
    const todayStr = toYMD(now);
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yesterdayStr = toYMD(yest);

    // --- MODIFIKASI: Logika pemfilteran tanggal berdasarkan currentLimitView ---
    if (currentLimitView === 'today') {
        limitedData = limitedData.filter(item => getItemDateStr(item) === todayStr);
    } else if (currentLimitView === 'yesterday') {
        limitedData = limitedData.filter(item => getItemDateStr(item) === yesterdayStr);
    } else if (currentLimitView === 'this_week') {
        const firstDayOfWeek = new Date(now);
        firstDayOfWeek.setDate(now.getDate() - now.getDay());
        const startWeekStr = toYMD(firstDayOfWeek);
        limitedData = limitedData.filter(item => {
            const d = getItemDateStr(item);
            return d >= startWeekStr && d <= todayStr;
        });
    } else if (currentLimitView === 'last_week') {
        const endOfLastWeek = new Date(now);
        endOfLastWeek.setDate(now.getDate() - now.getDay() - 1);
        const startOfLastWeek = new Date(endOfLastWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 6);
        const startLastWeekStr = toYMD(startOfLastWeek);
        const endLastWeekStr = toYMD(endOfLastWeek);
        limitedData = limitedData.filter(item => {
            const d = getItemDateStr(item);
            return d >= startLastWeekStr && d <= endLastWeekStr;
        });
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
            <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-500">${item.Timestamp.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-700">${item.TanggalIncoming || '—'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-700">${item.TanggalInspection || '—'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-700">${item.Bucket || '—'}</td>
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

function parseDateString(str) {
    if (!str) return null;
    if (str.includes('-')) return new Date(str);
    if (str.includes('/')) {
        const parts = str.split('/');
        return new Date(parts[2], parts[0] - 1, parts[1]);
    }
    return new Date(str);
}

export async function initLeaderMonitor() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const startEl = document.getElementById('leader-monitor-start');
    const endEl = document.getElementById('leader-monitor-end');
    if (startEl && !startEl.value) startEl.value = todayStr;
    if (endEl && !endEl.value) endEl.value = todayStr;

    if (!allInspections.length) {
        await fetchData();
    }
    renderLeaderMonitor();

    const filterBtn = document.getElementById('leader-monitor-filter-btn');
    if (filterBtn) {
        filterBtn.onclick = () => renderLeaderMonitor();
    }
    const resetBtn = document.getElementById('leader-monitor-reset-btn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            if (startEl) startEl.value = todayStr;
            if (endEl) endEl.value = todayStr;
            const statusSelect = document.getElementById('leader-monitor-status');
            if (statusSelect) statusSelect.value = 'all';
            renderLeaderMonitor();
        };
    }
    const refreshBtn = document.getElementById('leader-monitor-refresh-btn');
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            const tbody = document.getElementById('leader-monitor-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-sm text-slate-400">Refreshing data from server...</td></tr>';
            await fetchData();
            renderLeaderMonitor();
        };
    }
}

function renderLeaderMonitor() {
    const tbody = document.getElementById('leader-monitor-tbody');
    if (!tbody) return;

    const startVal = document.getElementById('leader-monitor-start')?.value;
    const endVal = document.getElementById('leader-monitor-end')?.value;
    const statusVal = document.getElementById('leader-monitor-status')?.value || 'all';

    const startDate = startVal ? new Date(startVal + 'T00:00:00') : null;
    const endDate = endVal ? new Date(endVal + 'T23:59:59') : null;

    const filtered = allInspections.filter(item => {
        const inspDateStr = item.TanggalInspection || item.TanggalIncoming;
        if (inspDateStr) {
            const dateObj = parseDateString(inspDateStr);
            if (dateObj) {
                if (startDate && dateObj < startDate) return false;
                if (endDate && dateObj > endDate) return false;
            }
        }

        const hasDefects = item.Defect > 0;
        const leaderApproved = item.ApprovedByLeader && item.ApprovedByLeader.trim().length > 0;

        if (statusVal === 'pending') {
            return hasDefects && !leaderApproved;
        } else if (statusVal === 'approved') {
            return hasDefects && leaderApproved;
        } else if (statusVal === 'autopass') {
            return !hasDefects;
        }
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-sm text-slate-400">Tidak ada data hasil monitoring yang sesuai filter.</td></tr>';
        return;
    }

    filtered.sort((a, b) => b.Timestamp - a.Timestamp);

    tbody.innerHTML = filtered.map(item => {
        let statusBadge = '';
        const hasDefects = item.Defect > 0;
        const leaderApproved = item.ApprovedByLeader && item.ApprovedByLeader.trim().length > 0;

        if (!hasDefects) {
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Auto-Pass</span>';
        } else if (leaderApproved) {
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Approved</span>';
        } else {
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 animate-pulse">Pending Approval</span>';
        }

        const approvedText = item.ApprovedByLeader || '<span class="text-slate-400 font-normal italic">—</span>';
        
        let evidenceLink = '<span class="text-slate-400 italic">—</span>';
        if (item.EvidenceUrl) {
            evidenceLink = `<a href="${item.EvidenceUrl}" target="_blank" class="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold">
                <span class="material-symbols-outlined text-[14px]">visibility</span> Lihat Bukti
            </a>`;
        }

        const rawDate = item.TanggalInspection || item.TanggalIncoming || '';
        let dateFormatted = '—';
        if (rawDate) {
            const dateObj = new Date(rawDate);
            if (!isNaN(dateObj.getTime())) {
                dateFormatted = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
            } else {
                dateFormatted = rawDate;
            }
        }

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-600">${dateFormatted}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-800">${item.Auditor}</td>
                <td class="px-4 py-3 text-xs text-slate-600">
                    <span class="font-bold text-slate-700 block">${item.Vendor || '—'}</span>
                    <span class="text-[11px]">${item.Component || '—'}</span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-xs">
                    <span class="font-mono block">${item['Style Number'] || '—'}</span>
                    <span class="text-slate-500">${item.Model || '—'}</span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right tabular-nums text-slate-700">${item.Qty_Inspect.toLocaleString('id-ID')}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-right tabular-nums font-semibold ${item.Defect > 0 ? 'text-red-500' : 'text-slate-500'}">${item.Defect.toLocaleString('id-ID')}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center">${statusBadge}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-800">${approvedText}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center">${evidenceLink}</td>
            </tr>
        `;
    }).join('');
}
