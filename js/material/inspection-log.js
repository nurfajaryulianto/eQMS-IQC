// ============================================================
// js/material/inspection-log.js — IQC Material: Inspection Log Tab
// Menggantikan tab Spreadsheet (yang mengacu ke Google Sheets).
// Data diambil langsung dari Supabase melalui api.js.
// ============================================================

import { apiGetInspectionData, apiGetUsers, apiGetAssignments } from './api.js';
import { exportInspectionLogToExcel } from './export.js';

// ─── STATE ───────────────────────────────────────────────────
let allInspectionLog = [];
let currentPage      = 1;
let pageLimit        = 25;
let currentFilters   = {};
let appUsersList     = [];
let nikToNameMap     = {};

// ─── INIT ─────────────────────────────────────────────────────
export async function initInspectionLog() {
    setupFilters();
    await loadInspectionLog();
}

function setupFilters() {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDays = new Date(Date.now() - 30 * 86400 * 1000).toISOString().split('T')[0];

    const startEl = document.getElementById('ilog-start');
    const endEl   = document.getElementById('ilog-end');
    if (startEl && !startEl.value) startEl.value = thirtyDays;
    if (endEl   && !endEl.value)   endEl.value   = today;
}

// ─── LOAD ─────────────────────────────────────────────────────
export async function loadInspectionLog(resetPage = true) {
    if (resetPage) currentPage = 1;

    const tbody      = document.getElementById('ilog-tbody');
    const countEl    = document.getElementById('ilog-count');
    const paginEl    = document.getElementById('ilog-pagination');

    if (tbody) tbody.innerHTML = `
        <tr><td colspan="10" style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">
            <span class="material-symbols-outlined" style="font-size:28px;display:block;margin-bottom:8px;color:#34d399;">hourglass_top</span>
            Memuat data inspeksi...
        </td></tr>`;

    currentFilters = {
        startDate:      document.getElementById('ilog-start')?.value || '',
        endDate:        document.getElementById('ilog-end')?.value   || '',
        inspectorNik:   document.getElementById('ilog-inspector')?.value || '',
        inspectionType: document.getElementById('ilog-type')?.value  || '',
        fileFilter:     document.getElementById('ilog-file-filter')?.value || 'all',
        page:           currentPage,
        limit:          pageLimit,
    };

    try {
        // Load users from app_users to map NIK -> Name and Material Type -> Inspectors
        try {
            const uRes = await apiGetUsers();
            appUsersList = uRes.data || [];
            nikToNameMap = {};
            appUsersList.forEach(u => {
                const name = (u.display_name || u.name || u.nik || '').trim();
                if (u.nik) nikToNameMap[String(u.nik).trim()] = name;
            });
        } catch (_) { /* non-fatal fallback */ }

        const result = await apiGetInspectionData(currentFilters);
        allInspectionLog = result.data || [];
        const total = result.total || 0;

        if (countEl) countEl.textContent = `${total} record`;
        renderInspectionLog(allInspectionLog);
        renderPagination(total, paginEl);

    } catch (err) {
        console.error('loadInspectionLog error:', err);
        if (tbody) tbody.innerHTML = `
            <tr><td colspan="10" style="padding:40px;text-align:center;color:#f87171;">
                Gagal memuat data: ${err.message}
            </td></tr>`;
    }
}

// ─── RENDER TABLE ─────────────────────────────────────────────
function renderInspectionLog(data) {
    const tbody = document.getElementById('ilog-tbody');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = `
            <tr><td colspan="11" style="padding:48px;text-align:center;color:rgba(255,255,255,0.35);">
                <span class="material-symbols-outlined" style="font-size:36px;display:block;margin-bottom:8px;">search_off</span>
                Tidak ada data inspeksi untuk filter ini.
            </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((d, i) => {
        // --- Date: d.inspection_date is a JS Date object (converted in api.js)
        let dateFmt = '—';
        const rawDate = d.inspection_date || d.created_at;
        if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
            dateFmt = rawDate.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
        } else if (rawDate) {
            const s = String(rawDate);
            const iso = s.length >= 10 ? s.substring(0,10) : s;
            const pts = iso.split(/[-/]/);
            if (pts.length === 3) {
                let y = Number(pts[0]), m = Number(pts[1]), dy = Number(pts[2]);
                if (pts[0].length <= 2 && pts[2].length === 4) { y = Number(pts[2]); m = Number(pts[1]); dy = Number(pts[0]); }
                if (y < 100) y += 2000;
                if (y > 1900 && m >= 1 && m <= 12 && dy >= 1 && dy <= 31) {
                    dateFmt = new Date(y, m-1, dy).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
                }
            }
        }

        // --- Inspector resolution:
        // 1. Find all inspectors from app_users whose material_assignment matches this row's inspection_type / material_name
        const matType = (d.inspection_type || '').toUpperCase().trim();
        const matName = (d.material_name || '').toUpperCase().trim();

        let assignedInspectors = [];
        if (matType && matType !== 'RAW MATERIAL') {
            assignedInspectors = appUsersList.filter(u => {
                const uAssign = (u.material_assignment || '').toUpperCase();
                return u.role === 'inspector' && (uAssign.includes(matType) || uAssign === 'ALL');
            });
        } else if (matName) {
            // Check keywords from material name (e.g. LTH -> LEATHER, TXT -> TEXTILE)
            let inferredType = '';
            if (matName.includes('LTH') || matName.includes('LEATHER')) inferredType = 'LEATHER';
            else if (matName.includes('TXT') || matName.includes('TEXTILE')) inferredType = 'TEXTILE';
            else if (matName.includes('SYN') || matName.includes('PU') || matName.includes('SUEDE')) inferredType = 'SYNTHETIC';

            if (inferredType) {
                assignedInspectors = appUsersList.filter(u => {
                    const uAssign = (u.material_assignment || '').toUpperCase();
                    return u.role === 'inspector' && (uAssign.includes(inferredType) || uAssign === 'ALL');
                });
            }
        }

        let inspDisplay = '—';
        let inspTitle = '—';

        if (assignedInspectors.length > 0) {
            const names = assignedInspectors.map(u => (u.display_name || u.name || u.nik || '').trim()).filter(Boolean);
            inspDisplay = names.join(', ');
            inspTitle = names.join(' / ');
        } else {
            // Fallback: resolve inspector_nik to full name if exists
            const rawNik = (d.inspector_nik || '').trim();
            const resolvedName = nikToNameMap[rawNik] || d.inspector_name || rawNik;
            inspDisplay = resolvedName || '—';
            inspTitle = resolvedName || '—';
        }

        const ok    = Number(d.ok)     || 0;
        const noQty = Number(d.no_qty) || 0;
        const total = ok + noQty;
        const passRate = total > 0 ? ((ok / total) * 100).toFixed(0) + '%' : '—';

        const statusColor = d.status === 'done' ? '#34d399' : d.status === 'in-progress' ? '#fbbf24' : '#94a3b8';

        const typeBadge = (type) => {
            const typeColors = {
                'Raw Material': '#60a5fa', 'Laminating Material': '#a78bfa',
                'Bonding Test': '#f97316', 'LEATHER': '#10b981', 'TEXTILE': '#a78bfa',
                'SYNTHETIC': '#f59e0b', 'RUBBER': '#f87171', 'PACKAGING': '#34d399',
            };
            const c = typeColors[type] || '#94a3b8';
            return `<span style="font-size:10px;padding:2px 7px;border-radius:99px;background:${c}22;color:${c};border:1px solid ${c}44;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">` + esc(type || '—') + `</span>`;
        };

        const T  = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const TD = `padding:10px 12px;${T}`;

        const badges = [];
        if (d.bonding_test_url) {
            badges.push(`<a href="${d.bonding_test_url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:6px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.35);color:#60a5fa;font-size:10px;font-weight:700;text-decoration:none;" title="Buka Dokumen Bonding Test"><span class="material-symbols-outlined" style="font-size:13px;">science</span>Bonding</a>`);
        }
        if (d.evidence_url && d.evidence_url !== d.bonding_test_url) {
            badges.push(`<a href="${d.evidence_url}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:6px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#34d399;font-size:10px;font-weight:700;text-decoration:none;" title="Buka Foto Bukti"><span class="material-symbols-outlined" style="font-size:13px;">image</span>Foto</a>`);
        }
        const filesHtml = badges.length > 0
            ? `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">${badges.join('')}</div>`
            : `<span style="color:rgba(255,255,255,0.25);font-size:11px;">—</span>`;

        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="${TD}color:rgba(255,255,255,0.5);font-size:12px;" title="${dateFmt}">${dateFmt}</td>
            <td style="${TD}font-weight:700;color:#fff;font-size:12px;" title="${esc(d.po_no || d.po_number || '')}">${esc(d.po_no || d.po_number || '—')}</td>
            <td style="${TD}color:#34d399;font-weight:600;font-size:12px;" title="${esc(d.material_name||'')}">${esc(d.material_name || '—')}</td>
            <td style="padding:10px 12px;overflow:hidden;">${typeBadge(d.inspection_type)}</td>
            <td style="${TD}color:rgba(255,255,255,0.9);font-size:12px;cursor:default;" title="${esc(inspTitle)}">${esc(inspDisplay)}</td>
            <td style="${TD}text-align:right;font-weight:700;color:#fff;font-size:13px;">${ok.toLocaleString('id-ID')}</td>
            <td style="${TD}text-align:right;font-weight:700;color:#f87171;font-size:13px;">${noQty.toLocaleString('id-ID')}</td>
            <td style="${TD}text-align:right;color:#94a3b8;font-size:12px;">${passRate}</td>
            <td style="${TD}"><span style="font-size:11px;font-weight:700;color:${statusColor};">${(d.status || '—').toUpperCase()}</span></td>
            <td style="padding:10px 8px;text-align:center;">${filesHtml}</td>
            <td style="${TD}font-size:11px;color:rgba(255,255,255,0.4);" title="${esc(d.defect_notes||'')}">${esc(d.defect_notes || '—')}</td>
        </tr>`;
    }).join('');
}

function renderPagination(total, container) {
    if (!container) return;
    if (total === 0) {
        container.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(total / pageLimit) || 1;
    const startRow = (currentPage - 1) * pageLimit + 1;
    const endRow = Math.min(currentPage * pageLimit, total);

    const pages = [];
    const prevDisabled = currentPage <= 1;
    pages.push(`<button onclick="ilogGoPage(${currentPage - 1})" ${prevDisabled ? 'disabled' : ''} style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:${prevDisabled ? 'rgba(255,255,255,0.25)' : '#fff'};cursor:${prevDisabled ? 'not-allowed' : 'pointer'};font-size:12px;font-weight:600;display:flex;align-items:center;gap:4px;">‹ Prev</button>`);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    if (currentPage <= 3) endPage = Math.min(5, totalPages);
    if (currentPage >= totalPages - 2) startPage = Math.max(1, totalPages - 4);

    if (startPage > 1) {
        pages.push(`<button onclick="ilogGoPage(1)" style="padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:12px;">1</button>`);
        if (startPage > 2) pages.push(`<span style="color:rgba(255,255,255,0.3);padding:0 2px;">...</span>`);
    }

    for (let p = startPage; p <= endPage; p++) {
        const active = p === currentPage;
        pages.push(`<button onclick="ilogGoPage(${p})" style="padding:6px 12px;border-radius:8px;background:${active ? '#10b981' : 'rgba(255,255,255,0.06)'};border:1px solid ${active ? '#10b981' : 'rgba(255,255,255,0.1)'};color:#fff;cursor:pointer;font-size:12px;font-weight:${active ? '700' : '500'};box-shadow:${active ? '0 2px 8px rgba(16,185,129,0.35)' : 'none'};">${p}</button>`);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pages.push(`<span style="color:rgba(255,255,255,0.3);padding:0 2px;">...</span>`);
        pages.push(`<button onclick="ilogGoPage(${totalPages})" style="padding:6px 10px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:12px;">${totalPages}</button>`);
    }

    const nextDisabled = currentPage >= totalPages;
    pages.push(`<button onclick="ilogGoPage(${currentPage + 1})" ${nextDisabled ? 'disabled' : ''} style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:${nextDisabled ? 'rgba(255,255,255,0.25)' : '#fff'};cursor:${nextDisabled ? 'not-allowed' : 'pointer'};font-size:12px;font-weight:600;display:flex;align-items:center;gap:4px;">Next ›</button>`);

    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div style="font-size:12px;color:rgba(255,255,255,0.5);">
                Menampilkan <strong style="color:#fff;">${startRow} - ${endRow}</strong> dari <strong style="color:#34d399;">${total}</strong> data
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,255,255,0.5);">
                    <span>Baris per halaman:</span>
                    <select onchange="window.ilogSetPageLimit(this.value)" class="styled-input" style="padding:4px 8px;font-size:12px;width:auto;cursor:pointer;">
                        <option value="15" ${pageLimit === 15 ? 'selected' : ''}>15</option>
                        <option value="25" ${pageLimit === 25 ? 'selected' : ''}>25</option>
                        <option value="50" ${pageLimit === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${pageLimit === 100 ? 'selected' : ''}>100</option>
                    </select>
                </div>
                <div style="display:flex;gap:4px;align-items:center;">${pages.join('')}</div>
            </div>
        </div>
    `;
}

window.ilogGoPage = function(page) {
    currentPage = page;
    loadInspectionLog(false);
};

window.ilogSetPageLimit = function(limit) {
    pageLimit = parseInt(limit, 10) || 25;
    currentPage = 1;
    loadInspectionLog(false);
};

// ─── EXPORT ───────────────────────────────────────────────────
window.exportInspectionLog = async function() {
    const btn = document.getElementById('ilog-export-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }

    try {
        // Load semua data (tanpa pagination) untuk export
        const result = await apiGetInspectionData({ ...currentFilters, page: 1, limit: 9999 });
        const enriched = (result.data || []).map(d => {
            const matType = (d.inspection_type || '').toUpperCase().trim();
            const matName = (d.material_name || '').toUpperCase().trim();
            let assignedInspectors = [];
            if (matType && matType !== 'RAW MATERIAL') {
                assignedInspectors = appUsersList.filter(u => {
                    const uAssign = (u.material_assignment || '').toUpperCase();
                    return u.role === 'inspector' && (uAssign.includes(matType) || uAssign === 'ALL');
                });
            } else if (matName) {
                let inferredType = '';
                if (matName.includes('LTH') || matName.includes('LEATHER')) inferredType = 'LEATHER';
                else if (matName.includes('TXT') || matName.includes('TEXTILE')) inferredType = 'TEXTILE';
                else if (matName.includes('SYN') || matName.includes('PU') || matName.includes('SUEDE')) inferredType = 'SYNTHETIC';
                if (inferredType) {
                    assignedInspectors = appUsersList.filter(u => {
                        const uAssign = (u.material_assignment || '').toUpperCase();
                        return u.role === 'inspector' && (uAssign.includes(inferredType) || uAssign === 'ALL');
                    });
                }
            }

            let inspName = '';
            if (assignedInspectors.length > 0) {
                inspName = assignedInspectors.map(u => (u.display_name || u.name || u.nik || '').trim()).filter(Boolean).join(', ');
            } else {
                const rawNik = (d.inspector_nik || '').trim();
                inspName = nikToNameMap[rawNik] || d.inspector_name || rawNik;
            }

            return {
                ...d,
                inspector_nik: inspName || d.inspector_nik,
            };
        });

        exportInspectionLogToExcel(enriched);
    } catch (err) {
        alert('Gagal export: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⬇ Export Excel'; }
    }
};

// ─── HELPER ───────────────────────────────────────────────────
function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
