/**
 * eQMS — Google Apps Script Backend
 * ===================================
 * Cara deploy:
 *  1. Buka script.google.com → New project
 *  2. Paste seluruh kode ini, ganti SPREADSHEET_ID di bawah
 *  3. Deploy → New deployment → Web App
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  4. Copy URL deployment, tempel ke script.js (fetch URL) dan dashboard.js (SCRIPT_URL)
 *
 * Sheet yang akan dibuat otomatis:
 *  - "Sessions"      : 1 row per sesi inspeksi
 *  - "DefectDetails" : 1 row per jenis defect per sesi
 */

// ── GANTI DENGAN ID SPREADSHEET ANDA ──────────────────────────
// Buka spreadsheet → lihat URL: docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
// ──────────────────────────────────────────────────────────────

// ── Header definisi — urutan ini menentukan kolom di sheet ────
const SESSIONS_HEADERS = [
  'SessionId',
  'Timestamp',
  'TanggalIncoming',
  'MaterialType',
  'Auditor',
  'Vendor',
  'Component',
  'Process',
  'StyleNumber',
  'ModelName',
  'QtyIncoming',
  'QtyInspect',
  'Pass',
  'Defect',
];

const DEFECT_HEADERS = [
  'SessionId',
  'TanggalIncoming',
  'Vendor',
  'Component',
  'DefectType',
  'Count',
];

// Tab PivotReady — flat join, siap langsung dipakai Pivot Table
// Tidak ada SessionId, tidak ada QtyInspect/FTT → hindari double-counting
const PIVOT_HEADERS = [
  'TanggalIncoming',
  'MaterialType',
  'Auditor',
  'Vendor',
  'Component',
  'Process',
  'DefectType',
  'DefectCount',
];

// ─────────────────────────────────────────────────────────────
// WRITE: Terima POST dari form inspeksi
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);

    const sessionSheet = getOrCreateSheet(ss, 'Sessions',      SESSIONS_HEADERS);
    const defectSheet  = getOrCreateSheet(ss, 'DefectDetails', DEFECT_HEADERS);
    const pivotSheet   = getOrCreateSheet(ss, 'PivotReady',     PIVOT_HEADERS);

    // Buat sessionId unik: tanggal + random 4 karakter
    const sessionId = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmmss')
      + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    // Tulis satu baris ke Sessions
    const sessionRow = [
      sessionId,
      data.timestamp        || '',
      data.tanggalIncoming  || '',
      data.materialType     || '',
      data.auditor          || '',
      data.vendor           || '',
      data.component        || '',
      data.process          || '',
      data.styleNumber      || '',
      data.modelName        || '',
      data.qtyIncoming      || 0,
      data.qtyInspect       || 0,
      data.pass             || 0,
      data.defect           || 0,
    ];
    sessionSheet.appendRow(sessionRow);

    // Tulis baris per defect ke DefectDetails (slim — 6 kolom)
    if (Array.isArray(data.defects) && data.defects.length > 0) {
      data.defects.forEach(d => {
        defectSheet.appendRow([
          sessionId,
          data.tanggalIncoming || '',
          data.vendor          || '',
          data.component       || '',
          d.type  || '',
          d.count || 0,
        ]);

        // Tulis juga ke PivotReady — flat join lengkap untuk pivot table
        pivotSheet.appendRow([
          data.tanggalIncoming || '',
          data.materialType    || '',
          data.auditor         || '',
          data.vendor          || '',
          data.component       || '',
          data.process         || '',
          d.type  || '',
          d.count || 0,
        ]);
      });
    }

    return jsonResponse({ status: 'ok', message: 'Data berhasil disimpan!', sessionId });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// READ: Kirim data ke dashboard analytics (GET)
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const ss             = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sessionSheet   = getOrCreateSheet(ss, 'Sessions',      SESSIONS_HEADERS);
    const defectSheet    = getOrCreateSheet(ss, 'DefectDetails', DEFECT_HEADERS);

    const sessions = sheetToObjects(sessionSheet);
    const defects  = sheetToObjects(defectSheet);

    // FTT dihitung dari data mentah, bukan disimpan di sheet
    const sessionsWithFtt = sessions.map(s => ({
      ...s,
      FTT:        s.QtyInspect > 0 ? s.Pass / s.QtyInspect : 0,
      DefectRate: s.QtyInspect > 0 ? s.Defect / s.QtyInspect : 0,
    }));

    return jsonResponse({ status: 'ok', sessions: sessionsWithFtt, defects });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Ambil sheet berdasarkan nama. Jika belum ada, buat baru dengan header.
 */
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    // Freeze baris header
    sheet.setFrozenRows(1);
    // Format header: bold + background biru gelap + teks putih
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold')
               .setBackground('#1e3a5f')
               .setFontColor('#ffffff');
    // Auto-resize kolom
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

/**
 * Konversi sheet ke array of objects menggunakan baris pertama sebagai key.
 */
function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];          // Hanya header, tidak ada data
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

/**
 * Kembalikan JSON response dengan CORS header.
 */
function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


