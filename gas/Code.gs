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
const SPREADSHEET_ID = '1KLVddUlNGySE149gH9UD33DOjJMMCzcKHkvB0gZnqIc';
// ──────────────────────────────────────────────────────────────

// ── AMBIL ID SPREADSHEET DARI PROPERTIES SERVICE ATAU FALLBACK ─
function getActiveSpreadsheetId() {
  const propertyId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (propertyId) {
    return propertyId;
  }
  return SPREADSHEET_ID;
}

// Menghapus spreadsheet dinamis di properti script agar kembali ke spreadsheet awal
function resetToOriginalSpreadsheet() {
  PropertiesService.getScriptProperties().deleteProperty('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  getOrCreateSheet(ss, 'Sessions', SESSIONS_HEADERS);
  getOrCreateSheet(ss, 'DefectDetails', DEFECT_HEADERS);
  getOrCreateSheet(ss, 'PivotReady', PIVOT_HEADERS);
  Logger.log('Reset berhasil! Sekarang menggunakan Spreadsheet default ID dan header telah diperbarui: ' + SPREADSHEET_ID);
}

// ── BUAT SPREADSHEET BARU DAN INISIALISASI STRUKTURNYA ────────
function createAndInitializeSpreadsheet() {
  try {
    const newSs = SpreadsheetApp.create('eQMS-IQC-Database');
    const newId = newSs.getId();
    
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', newId);
    
    getOrCreateSheet(newSs, 'Sessions',      SESSIONS_HEADERS);
    getOrCreateSheet(newSs, 'DefectDetails', DEFECT_HEADERS);
    getOrCreateSheet(newSs, 'PivotReady',     PIVOT_HEADERS);
    
    return {
      status: 'ok',
      message: 'Spreadsheet baru berhasil dibuat dan diatur sebagai database aktif!',
      spreadsheetId: newId,
      spreadsheetUrl: newSs.getUrl(),
      spreadsheetName: newSs.getName()
    };
  } catch (err) {
    return {
      status: 'error',
      message: 'Gagal membuat spreadsheet: ' + err.message
    };
  }
}

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
  'TanggalInspection',
  'Bucket',
  'ApprovedByLeader',
  'EvidenceUrl',
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
    
    // Cek jika ada action createSpreadsheet dari POST
    if (data && data.action === 'createSpreadsheet') {
      const result = createAndInitializeSpreadsheet();
      return jsonResponse(result);
    }

    const ss   = SpreadsheetApp.openById(getActiveSpreadsheetId());

    // Save evidence file if uploaded
    var evidenceUrl = '';
    if (data.file_data && data.file_name) {
      try {
        var spreadsheetFile = DriveApp.getFileById(getActiveSpreadsheetId());
        var parents = spreadsheetFile.getParents();
        var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
        var subDepartmentFolder = getOrCreateSubfolder(parentFolder, "IQC Subcont");
        
        var fileBlob = Utilities.newBlob(Utilities.base64Decode(data.file_data), data.file_type || 'image/png', data.file_name);
        var driveFile = subDepartmentFolder.createFile(fileBlob);
        driveFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
        evidenceUrl = driveFile.getUrl();
      } catch (err) {
        throw new Error('Gagal upload file bukti: ' + err.message);
      }
    }

    const sessionSheet = getOrCreateSheet(ss, 'Sessions',      SESSIONS_HEADERS);
    const defectSheet  = getOrCreateSheet(ss, 'DefectDetails', DEFECT_HEADERS);
    const pivotSheet   = getOrCreateSheet(ss, 'PivotReady',     PIVOT_HEADERS);

    // Buat sessionId unik: tanggal + random 4 karakter
    const baseSessionId = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmmss')
      + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

    if (Array.isArray(data.items) && data.items.length > 0) {
      // Loop untuk setiap item inspeksi
      data.items.forEach((item, index) => {
        const sessionId = baseSessionId + '-' + (index + 1);
        
        const sessionRow = [
          sessionId,
          data.timestamp            || '',
          data.tanggalIncoming      || '',
          data.materialType         || '',
          data.auditor              || '',
          data.vendor               || '',
          item.component            || '',
          item.process              || '',
          data.styleNumber          || '',
          data.modelName            || '',
          item.qtyIncoming          || 0,
          item.qtyInspect           || 0,
          item.pass                 || 0,
          item.defect               || 0,
          data.tanggalInspection    || '',
          data.tanggalBucket        || '',
          data.approvedByLeader     || '',
          evidenceUrl               || '',
        ];
        sessionSheet.appendRow(sessionRow);

        // Tulis baris per defect ke DefectDetails & PivotReady
        if (Array.isArray(item.defects) && item.defects.length > 0) {
          item.defects.forEach(d => {
            defectSheet.appendRow([
              sessionId,
              data.tanggalIncoming || '',
              data.vendor          || '',
              item.component       || '',
              d.type  || '',
              d.count || 0,
            ]);

            pivotSheet.appendRow([
              data.tanggalIncoming || '',
              data.materialType    || '',
              data.auditor         || '',
              data.vendor          || '',
              item.component       || '',
              item.process         || '',
              d.type  || '',
              d.count || 0,
            ]);
          });
        }
      });

      return jsonResponse({ status: 'ok', message: 'Semua data item inspeksi berhasil disimpan!', sessionId: baseSessionId });
    } else {
      // Backward compatibility flow (single session)
      const sessionId = baseSessionId;
      const sessionRow = [
        sessionId,
        data.timestamp            || '',
        data.tanggalIncoming      || '',
        data.materialType         || '',
        data.auditor              || '',
        data.vendor               || '',
        data.component            || '',
        data.process              || '',
        data.styleNumber          || '',
        data.modelName            || '',
        data.qtyIncoming          || 0,
        data.qtyInspect           || 0,
        data.pass                 || 0,
        data.defect               || 0,
        data.tanggalInspection    || '',
        data.tanggalBucket        || '',
        data.approvedByLeader     || '',
        evidenceUrl               || '',
      ];
      sessionSheet.appendRow(sessionRow);

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
    }

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// READ: Kirim data ke dashboard analytics (GET)
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const activeId = getActiveSpreadsheetId();
    
    // Jika ada request status spreadsheet saja
    if (e && e.parameter && e.parameter.action === 'getStatus') {
      let name = 'eQMS IQC Database';
      let url = '';
      let isAvailable = true;
      try {
        const ss = SpreadsheetApp.openById(activeId);
        name = ss.getName();
        url = ss.getUrl();
      } catch (err) {
        isAvailable = false;
      }
      return jsonResponse({
        status: 'ok',
        isAvailable: isAvailable,
        spreadsheetId: activeId,
        spreadsheetName: name,
        spreadsheetUrl: url
      });
    }

    const ss             = SpreadsheetApp.openById(activeId);
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

    return jsonResponse({
      status: 'ok',
      sessions: sessionsWithFtt,
      defects,
      spreadsheetId: activeId,
      spreadsheetUrl: ss.getUrl(),
      spreadsheetName: ss.getName()
    });

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
  } else if (name === 'Sessions') {
    // Dynamic columns validation
    const lastCol = sheet.getLastColumn();
    if (lastCol > 0) {
      const firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const headersLower = firstRow.map(function(h) { return String(h).toLowerCase().trim(); });
      
      if (headersLower.indexOf('approvedbyleader') < 0) {
        sheet.getRange(1, lastCol + 1).setValue('ApprovedByLeader')
             .setFontWeight('bold')
             .setBackground('#1e3a5f')
             .setFontColor('#ffffff');
      }
      const lastCol2 = sheet.getLastColumn();
      const firstRow2 = sheet.getRange(1, 1, 1, lastCol2).getValues()[0];
      const headersLower2 = firstRow2.map(function(h) { return String(h).toLowerCase().trim(); });
      if (headersLower2.indexOf('evidenceurl') < 0) {
        sheet.getRange(1, lastCol2 + 1).setValue('EvidenceUrl')
             .setFontWeight('bold')
             .setBackground('#1e3a5f')
             .setFontColor('#ffffff');
      }
    }
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

function getOrCreateSubfolder(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}


