// ============================================================
// js/material/inspection-log.js — IQC Material: Inspection Log Tab
// Menggantikan tab Spreadsheet (yang mengacu ke Google Sheets).
// Data diambil langsung dari Supabase melalui api.js.
// ============================================================

import { apiGetInspectionData } from './api.js';
import { exportInspectionLogToExcel } from './export.js';

// ─── STATE ───────────────────────────────────────────────────
let allInspectionLog = [];
let currentPage      = 1;
const PAGE_LIMIT     = 50;
let currentFilters   = {};

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
        page:           currentPage,
        limit:          PAGE_LIMIT,
    };

    try {
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
            <tr><td colspan="10" style="padding:48px;text-align:center;color:rgba(255,255,255,0.35);">
                <span class="material-symbols-outlined" style="font-size:36px;display:block;margin-bottom:8px;">search_off</span>
                Tidak ada data inspeksi untuk filter ini.
            </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((d, i) => {
        // Robust date parsing (inspection_date, created_at, or receive_date)
        const rawDate = d.inspection_date || d.created_at || d.receive_date;
        let dateFmt = '—';
        if (rawDate) {
            const str = String(rawDate).trim();
            const isoPart = str.split('T')[0];
            const parts = isoPart.split(/[-/.]/);
            if (parts.length === 3) {
                let y = Number(parts[0]);
                let m = Number(parts[1]);
                let dy = Number(parts[2]);
                if (parts[0].length <= 2 && parts[2].length === 4) {
                    // Handle DD-MM-YYYY format
                    dy = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]);
                }
                if (y < 100) y += 2000;
                if (y > 1900 && m >= 1 && m <= 12 && dy >= 1 && dy <= 31) {
                    const dt = new Date(y, m - 1, dy);
                    dateFmt = dt.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
                }
            }
        }

        const ok    = Number(d.ok)     || 0;
        const noQty = Number(d.no_qty) || 0;
        const total = ok + noQty;
        const passRate = total > 0 ? ((ok / total) * 100).toFixed(0) + '%' : '—';

        const statusColor = d.status === 'done' ? '#34d399' : d.status === 'in-progress' ? '#fbbf24' : '#94a3b8';

        const typeBadge = (type) => {
            const colors = { 'Raw Material': '#60a5fa', 'Laminating Material': '#a78bfa', 'Bonding Test': '#f97316' };
            const c = colors[type] || '#94a3b8';
            return `<span style="font-size:10px;padding:2px 7px;border-radius:99px;background:${c}22;color:${c};border:1px solid ${c}44;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">${esc(type || '—')}</span>`;
        };

        // Shared td truncate style
        const T  = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const TD = `padding:10px 12px;${T}`;

        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="${TD}color:rgba(255,255,255,0.5);font-size:12px;" title="${dateFmt}">${dateFmt}</td>
            <td style="${TD}font-weight:700;color:#fff;font-size:12px;" title="${esc(d.po_no || d.po_number || '')}">${esc(d.po_no || d.po_number || '—')}</td>
            <td style="${TD}color:#34d399;font-weight:600;font-size:12px;" title="${esc(d.material_name||'')}">${esc(d.material_name || '—')}</td>
            <td style="padding:10px 12px;overflow:hidden;">${typeBadge(d.inspection_type)}</td>
            <td style="${TD}color:rgba(255,255,255,0.7);font-size:12px;" title="${esc(d.inspector_nik||'')}">${esc(d.inspector_nik || '—')}</td>
            <td style="${TD}text-align:right;font-weight:700;color:#fff;font-size:13px;">${ok.toLocaleString('id-ID')}</td>
            <td style="${TD}text-align:right;font-weight:700;color:#f87171;font-size:13px;">${noQty.toLocaleString('id-ID')}</td>
            <td style="${TD}text-align:right;color:#94a3b8;font-size:12px;">${passRate}</td>
            <td style="${TD}"><span style="font-size:11px;font-weight:700;color:${statusColor};">${(d.status || '—').toUpperCase()}</span></td>
            <td style="${TD}font-size:11px;color:rgba(255,255,255,0.4);" title="${esc(d.defect_notes||'')}">${esc(d.defect_notes || '—')}</td>
        </tr>`;
    }).join('');
}

function renderPagination(total, container) {
    if (!container) return;
    const totalPages = Math.ceil(total / PAGE_LIMIT);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const pages = [];
    if (currentPage > 1) pages.push(`<button onclick="ilogGoPage(${currentPage - 1})" style="padding:5px 12px;border-radius:6px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;">‹ Prev</button>`);
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) {
        const active = p === currentPage;
        pages.push(`<button onclick="ilogGoPage(${p})" style="padding:5px 12px;border-radius:6px;background:${active ? '#10b981' : 'rgba(255,255,255,0.07)'};border:1px solid ${active ? '#10b981' : 'rgba(255,255,255,0.12)'};color:#fff;cursor:pointer;font-size:12px;font-weight:${active ? '700' : '400'};">${p}</button>`);
    }
    if (currentPage < totalPages) pages.push(`<button onclick="ilogGoPage(${currentPage + 1})" style="padding:5px 12px;border-radius:6px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:12px;">Next ›</button>`);

    container.innerHTML = `<div style="display:flex;gap:6px;align-items:center;justify-content:center;">${pages.join('')}</div>`;
}

window.ilogGoPage = function(page) {
    currentPage = page;
    loadInspectionLog(false);
};

// ─── EXPORT ───────────────────────────────────────────────────
window.exportInspectionLog = async function() {
    const btn = document.getElementById('ilog-export-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }

    try {
        // Load semua data (tanpa pagination) untuk export
        const result = await apiGetInspectionData({ ...currentFilters, page: 1, limit: 9999 });
        exportInspectionLogToExcel(result.data || []);
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
