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
  'Status',       // 'In Progress' | 'Done' | '' (legacy = Done)
  'ItemsJSON',    // Full items JSON, stored only for In Progress drafts
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

    // Auto status determination: If approvedByLeader is present, mark status as Done
    let statusVal = data.status || 'Done';
    if (data.approvedByLeader && String(data.approvedByLeader).trim() !== '') {
      statusVal = 'Done';
    }

    const itemsJsonStr = Array.isArray(data.items) ? JSON.stringify(data.items) : '';

    // Self-healing update: if sessionId exists, overwrite existing session rows
    const isUpdate = Boolean(data.sessionId);
    const baseSessionId = isUpdate ? String(data.sessionId).trim() : (
      Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmmss')
      + '-' + Math.random().toString(36).substr(2, 4).toUpperCase()
    );

    if (isUpdate) {
      deleteRowsBySessionId(sessionSheet, baseSessionId);
      deleteRowsBySessionId(defectSheet, baseSessionId);
    }

    if (Array.isArray(data.items) && data.items.length > 0) {
      // Loop untuk setiap item inspeksi
      data.items.forEach((item, index) => {
        const sessionId = baseSessionId;
        
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
          statusVal,
          itemsJsonStr,
        ];
        sessionSheet.appendRow(sessionRow);

        // Tulis baris per defect ke DefectDetails & PivotReady (hanya jika Done atau jika ada defect)
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

      return jsonResponse({ status: 'ok', message: 'Data inspeksi berhasil disimpan!', sessionId: baseSessionId });
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
        statusVal,
        itemsJsonStr,
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

    // ── ACTION: Get all Inspection Results (Done & In-Progress) ──
    if (e && e.parameter && (e.parameter.action === 'getInspectionResults' || e.parameter.action === 'getInProgressSessions')) {
      const ss = SpreadsheetApp.openById(activeId);
      const sessionSheet = getOrCreateSheet(ss, 'Sessions', SESSIONS_HEADERS);
      const allData = sessionSheet.getDataRange().getValues();
      const displayData = sessionSheet.getDataRange().getDisplayValues();
      if (!allData || allData.length < 2) {
        return jsonResponse({ status: 'ok', sessions: [] });
      }

      const headers = allData[0];
      
      // Helper function for flexible, case-insensitive column matching
      function findColIndex(candList) {
        for (var c = 0; c < candList.length; c++) {
          var target = String(candList[c]).toLowerCase().replace(/[^a-z0-9]/g, '');
          for (var i = 0; i < headers.length; i++) {
            var h = String(headers[i] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (h === target) return i;
          }
        }
        return -1;
      }

      const sessionIdCol  = findColIndex(['SessionId', 'SessionID', 'ID']);
      const timestampCol  = findColIndex(['Timestamp', 'timeStamp', 'Time']);
      const tanggalCol    = findColIndex(['TanggalIncoming', 'Date', 'Tanggal', 'Tanggal Incoming']);
      const matTypeCol    = findColIndex(['MaterialType', 'Material Type']);
      const auditorCol    = findColIndex(['Auditor', 'User Login', 'UserLogin', 'User']);
      const vendorCol     = findColIndex(['Vendor']);
      const styleCol      = findColIndex(['StyleNumber', 'Style Number', 'Style']);
      const modelCol      = findColIndex(['ModelName', 'Model']);
      const componentCol  = findColIndex(['Component']);
      const processCol    = findColIndex(['Process']);
      const qtyIncCol     = findColIndex(['Qty Incoming', 'QtyIncoming']);
      const qtyInspCol    = findColIndex(['Qty Inspect', 'QtyInspect']);
      const passCol       = findColIndex(['Qty Pass', 'QtyPass', 'Pass']);
      const defectCol     = findColIndex(['Qty Defect', 'QtyDefect', 'Defect']);
      const tanggalInsCol = findColIndex(['TanggalInspection', 'TanggalInspect']);
      const bucketCol     = findColIndex(['Bucket', 'TanggalInspectBucket']);
      const statusCol     = findColIndex(['Status']);
      const itemsJsonCol  = findColIndex(['ItemsJSON']);

      function getCellStr(rIndex, cIndex, isDate) {
        if (cIndex === -1) return '';
        var disp = (displayData[rIndex] && displayData[rIndex][cIndex] != null) ? String(displayData[rIndex][cIndex]).trim() : '';
        if (disp) {
          if (isDate && disp.includes('T')) return disp.split('T')[0];
          return disp;
        }
        var val = allData[rIndex][cIndex];
        if (!val) return '';
        if (val instanceof Date) {
          try {
            return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          } catch(err) {
            return val.toISOString().split('T')[0];
          }
        }
        var str = String(val).trim();
        if (isDate && str.includes('T')) return str.split('T')[0];
        return str;
      }

      const sessionsMap = {};
      for (var r = 1; r < allData.length; r++) {
        var row = allData[r];
        
        var rawSid = getCellStr(r, sessionIdCol);
        // Normalize rawSid: strip trailing item index suffix like "-1", "-2" if present
        var parentSid = rawSid ? rawSid.replace(/-\d+$/, '') : ('ROW-' + r);
        var sid = parentSid;

        var st = getCellStr(r, statusCol) || 'Done';

        if (!sessionsMap[sid]) {
          var items = [];
          if (itemsJsonCol !== -1 && row[itemsJsonCol]) {
            try { items = JSON.parse(String(row[itemsJsonCol])); } catch(errItems) {}
          }

          var tIns = getCellStr(r, tanggalInsCol, true);
          var tInc = getCellStr(r, tanggalCol, true);
          var tTime = getCellStr(r, timestampCol, true);
          var tInspDate = tIns || tInc || tTime;
          
          sessionsMap[sid] = {
            sessionId: sid,
            timestamp: tTime,
            tanggalIncoming: tInc,
            tanggalInspection: tInspDate,
            tanggalBucket: getCellStr(r, bucketCol, true),
            materialType: getCellStr(r, matTypeCol),
            auditor: getCellStr(r, auditorCol),
            vendor: getCellStr(r, vendorCol),
            styleNumber: getCellStr(r, styleCol),
            modelName: getCellStr(r, modelCol),
            component: getCellStr(r, componentCol),
            process: getCellStr(r, processCol),
            status: st,
            items: items,
          };
        } else {
          // Update missing fields if subsequent rows have details
          if (!sessionsMap[sid].styleNumber) sessionsMap[sid].styleNumber = getCellStr(r, styleCol);
          if (!sessionsMap[sid].modelName) sessionsMap[sid].modelName = getCellStr(r, modelCol);
          if (!sessionsMap[sid].auditor) sessionsMap[sid].auditor = getCellStr(r, auditorCol);
          if (!sessionsMap[sid].tanggalIncoming) sessionsMap[sid].tanggalIncoming = getCellStr(r, tanggalCol, true);
          if (!sessionsMap[sid].tanggalInspection) {
            sessionsMap[sid].tanggalInspection = getCellStr(r, tanggalInsCol, true) || getCellStr(r, tanggalCol, true) || getCellStr(r, timestampCol, true);
          }
          if (!sessionsMap[sid].materialType) sessionsMap[sid].materialType = getCellStr(r, matTypeCol);
          if (!sessionsMap[sid].component) sessionsMap[sid].component = getCellStr(r, componentCol);
          if (!sessionsMap[sid].process) sessionsMap[sid].process = getCellStr(r, processCol);
        }

        // If row contains item details (flat sheet format), push item if not already present
        if (componentCol !== -1 && row[componentCol]) {
          var comp = String(row[componentCol] || '');
          var proc = processCol !== -1 ? String(row[processCol] || '') : '';
          var qInc = qtyIncCol !== -1 ? Number(row[qtyIncCol]) || 0 : 0;
          var qInsp = qtyInspCol !== -1 ? Number(row[qtyInspCol]) || 0 : 0;
          var qPass = passCol !== -1 ? Number(row[passCol]) || 0 : 0;
          var qDef = defectCol !== -1 ? Number(row[defectCol]) || 0 : 0;

          var exists = sessionsMap[sid].items.some(function(it) {
            return String(it.component || '').trim().toLowerCase() === comp.trim().toLowerCase() && 
                   String(it.process || '').trim().toLowerCase() === proc.trim().toLowerCase();
          });

          if (!exists) {
            sessionsMap[sid].items.push({
              component: comp,
              process: proc,
              qtyIncoming: qInc,
              qtyInspect: qInsp,
              pass: qPass,
              defect: qDef
            });
          }
        }
      }

      var sessionList = Object.keys(sessionsMap).map(function(k) { return sessionsMap[k]; });
      return jsonResponse({ status: 'ok', sessions: sessionList });
    }

    const ss             = SpreadsheetApp.openById(activeId);
    const sessionSheet   = getOrCreateSheet(ss, 'Sessions',      SESSIONS_HEADERS);
    const defectSheet    = getOrCreateSheet(ss, 'DefectDetails', DEFECT_HEADERS);

    const sessions = sheetToObjects(sessionSheet);
    const defects  = sheetToObjects(defectSheet);

    // Filter out In Progress drafts from analytics data
    const doneSessions = sessions.filter(function(s) {
      return s.Status !== 'In Progress';
    });

    // FTT dihitung dari data mentah, bukan disimpan di sheet
    const sessionsWithFtt = doneSessions.map(s => ({
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
    // Ensure Status and ItemsJSON headers exist at columns 19-20
    const firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!firstRow.includes('Status')) {
      const nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue('Status').setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
    }
    const firstRow2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!firstRow2.includes('ItemsJSON')) {
      const nextCol2 = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol2).setValue('ItemsJSON').setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
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

/**
 * Hapus baris lama berdasarkan SessionId untuk self-healing update
 */
function deleteRowsBySessionId(sheet, sid) {
  if (!sheet || !sid) return;
  const values = sheet.getDataRange().getValues();
  for (let r = values.length - 1; r >= 1; r--) {
    const rowSid = String(values[r][0] || '').trim();
    if (rowSid === sid || rowSid.startsWith(sid + '-')) {
      sheet.deleteRow(r + 1);
    }
  }
}


