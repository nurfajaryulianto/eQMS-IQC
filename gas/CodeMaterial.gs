// ============================================================
// CodeMaterial.gs — GAS Backend untuk IQC Material App
// Spreadsheet baru dengan sheet: vendors, master_data, inspections
// Deploy sebagai Web App (akses: Anyone) lalu salin URL ke form.js
// ============================================================

// ─── SPREADSHEET CONFIG ──────────────────────────────────────
// Ganti dengan ID Spreadsheet IQC Material yang baru dibuat
var SPREADSHEET_ID = '13C5MdJR_WN1A6wUzlRXCPCz6hKRoiR3Mg-0p_lMLblQ';

var SHEET = {
  VENDORS:      'vendors',
  MASTER_DATA:  'master_data',
  INSPECTIONS:  'inspections',
  USERS:        'users',
  SETTINGS:     'settings',
};

var SUPABASE_URL  = 'https://mymzszufrwmpkpmmlnnc.supabase.co';

// ─── ENTRY POINTS ─────────────────────────────────────────────

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  try {
    if (action === 'getMasterData')     return jsonResponse(getMasterData(e.parameter));
    if (action === 'getInspectionData') return jsonResponse(getInspectionData(e.parameter));
    if (action === 'getUsers')          return jsonResponse(getUsers());
    if (action === 'generateTemplate')  return generateTemplate();
    if (action === 'getStatus') {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      return jsonResponse({
        status: 'ok',
        spreadsheetId: SPREADSHEET_ID,
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl()
      });
    }
    if (action === 'ping')              return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' });
  }

  var action = payload.action || '';
  try {
    if (action === 'login')              return jsonResponse(login(payload));
    if (action === 'submitInspection')   return jsonResponse(submitInspection(payload));
    if (action === 'bulkUpsertMasterData') return jsonResponse(bulkUpsertMasterData(payload));
    if (action === 'passAll')            return jsonResponse(passAll(payload));
    if (action === 'saveUser')           return jsonResponse(saveUser(payload));
    if (action === 'deleteUser')         return jsonResponse(deleteUser(payload));
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ─── LOGIN HANDLER ────────────────────────────────────────────

function login(payload) {
  var nik = String(payload.nik || '').trim();
  var password = String(payload.password || '');
  if (!nik || !password) throw new Error('NIK dan password harus diisi');

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.USERS);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.USERS);
    sheet.getRange(1, 1, 1, 5).setValues([['nik', 'password', 'name', 'role', 'created_at']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e2e8f0');
  }

  var data = sheet.getDataRange().getValues();
  
  // Seed default admin if sheet only has headers
  if (data.length < 2) {
    var now = new Date().toISOString();
    sheet.appendRow(['admin', 'admin123', 'Admin Material', 'admin', now]);
    data = sheet.getDataRange().getValues();
  }

  var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var nikCol = headers.indexOf('nik');
  var passCol = headers.indexOf('password');
  var nameCol = headers.indexOf('name');
  var roleCol = headers.indexOf('role');

  if (nikCol < 0 || passCol < 0 || roleCol < 0) {
    throw new Error('Struktur sheet "users" tidak valid. Kolom nik, password, atau role tidak ditemukan.');
  }

  for (var i = 1; i < data.length; i++) {
    var rowNik = String(data[i][nikCol]).trim();
    var rowPass = String(data[i][passCol]).trim();
    if (rowNik.toLowerCase() === nik.toLowerCase() && rowPass === password) {
      var nameVal = nameCol >= 0 ? String(data[i][nameCol]) : rowNik;
      var roleVal = String(data[i][roleCol]).toLowerCase().trim();
      
      var expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8); // 8 jam expiry

      return {
        nik: rowNik,
        name: nameVal,
        role: roleVal,
        token: 'token_' + Utilities.getUuid(),
        expires_at: expiresAt.toISOString()
      };
    }
  }

  throw new Error('NIK atau password salah.');
}

// ─── GET MASTER DATA ──────────────────────────────────────────
// Mengembalikan daftar PO/Material dari sheet master_data
// Parameter: ?status=pending|done|all (default: all)

function getMasterData(params) {
  var statusFilter = (params && params.status) ? params.status.toLowerCase() : 'all';
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) throw new Error('Sheet "master_data" tidak ditemukan.');

  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return { data: [] };

  var headers = data[0].map(function(h) { return String(h).toLowerCase().replace(/ /g,'_'); });
  var rows = data.slice(1);

  var result = rows
    .map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    })
    .filter(function(obj) {
      if (statusFilter === 'all') return true;
      return (String(obj.status || '').toLowerCase()) === statusFilter;
    });

  return { data: result, total: result.length };
}

// ─── GET INSPECTION DATA (untuk Dashboard) ────────────────────

function getInspectionData(params) {
  var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet    = ss.getSheetByName(SHEET.INSPECTIONS);
  var mdSheet  = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) throw new Error('Sheet "inspections" tidak ditemukan.');

  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).toLowerCase().replace(/ /g,'_'); });
  var rows    = data.slice(1);

  var inspections = rows.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });

  // Enrich dengan master_data
  var masterMap = {};
  if (mdSheet) {
    var mdData = mdSheet.getDataRange().getValues();
    var mdHdr  = mdData[0].map(function(h) { return String(h).toLowerCase().replace(/ /g,'_'); });
    mdData.slice(1).forEach(function(row) {
      var obj = {};
      mdHdr.forEach(function(h, i) { obj[h] = row[i]; });
      masterMap[obj.po_number] = obj;
    });
  }

  inspections = inspections.map(function(insp) {
    var md = masterMap[insp.po_number] || {};
    return Object.assign({}, insp, {
      material_name:    md.material_name    || '',
      vendor_name:      md.vendor_name      || '',
      style:            md.style            || '',
      model_shoe:       md.model_shoe       || '',
      item_description: md.item_description || '',
    });
  });

  return { data: inspections, total: inspections.length };
}

// ─── SUBMIT INSPECTION ────────────────────────────────────────

function submitInspection(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.INSPECTIONS);
    if (!sheet) throw new Error('Sheet "inspections" tidak ditemukan.');

    // Save evidence file if uploaded
    var evidenceUrl = '';
    if (payload.file_data && payload.file_name) {
      try {
        var spreadsheetFile = DriveApp.getFileById(SPREADSHEET_ID);
        var parents = spreadsheetFile.getParents();
        var folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
        
        var fileBlob = Utilities.newBlob(Utilities.base64Decode(payload.file_data), payload.file_type || 'image/png', payload.file_name);
        var driveFile = folder.createFile(fileBlob);
        driveFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
        evidenceUrl = driveFile.getUrl();
      } catch (err) {
        throw new Error('Gagal upload file bukti: ' + err.message);
      }
    }

    var inspectionId = 'INSP-' + new Date().getTime();
    // Find index of headers in inspections to know where to write what
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).toLowerCase().trim(); });

    var now = new Date().toISOString();
    var row = [];

    headers.forEach(function(h) {
      if (h === 'inspection_id') row.push(inspectionId);
      else if (h === 'po_number') row.push(payload.po_number || '');
      else if (h === 'inspector_nik') row.push(payload.inspector_nik || '');
      else if (h === 'qty_inspect') row.push(payload.qty_inspect || 0);
      else if (h === 'qty_fail') row.push(payload.qty_fail || 0);
      else if (h === 'defect_notes') row.push(payload.defect_notes || '');
      else if (h === 'result_status') row.push(payload.result_status || 'Pass');
      else if (h === 'input_type') row.push(payload.input_type || 'manual');
      else if (h === 'rolling_inspection') row.push(payload.rolling_inspection || 'No');
      else if (h === 'approved_by_leader') row.push(payload.approved_by_leader || '');
      else if (h === 'evidence_url') row.push(evidenceUrl || payload.evidence_url || '');
      else if (h === 'inspection_date') row.push(payload.inspection_date || now);
      else if (h === 'created_at') row.push(now);
      else row.push('');
    });

    sheet.appendRow(row);

    // Update status di master_data
    updateMasterDataStatus(ss, payload.po_number, 'done');

    return { status: 'ok', inspection_id: inspectionId, message: 'Data inspeksi berhasil disimpan.' };

  } finally {
    lock.releaseLock();
  }
}

function updateMasterDataStatus(ss, poNumber, newStatus) {
  var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) return;

  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).toLowerCase().replace(/ /g,'_'); });
  var poCol   = headers.indexOf('po_number');
  var stCol   = headers.indexOf('status');
  if (poCol < 0 || stCol < 0) return;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][poCol]) === String(poNumber)) {
      sheet.getRange(i + 1, stCol + 1).setValue(newStatus);
      break;
    }
  }
}

// ─── BULK UPSERT MASTER DATA ──────────────────────────────────
// Menerima array rows dari hasil parsing SheetJS di frontend

function bulkUpsertMasterData(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var rows = payload.rows || [];
    if (!rows.length) return { status: 'ok', message: 'Tidak ada data untuk diproses.', count: 0 };

    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
    if (!sheet) throw new Error('Sheet "master_data" tidak ditemukan.');

    var data    = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toLowerCase().replace(/ /g,'_'); });
    var poCol   = headers.indexOf('po_number');

    // Build existing PO map for upsert
    var existingMap = {};
    data.slice(1).forEach(function(row, idx) {
      existingMap[String(row[poCol])] = idx + 2; // 1-indexed + header row
    });

    var now        = new Date().toISOString();
    var uploaded   = payload.uploader_nik || 'admin';
    var insertRows = [];
    var updateCount = 0;

    rows.forEach(function(row) {
      var po = String(row.po_number || row['PO Number'] || '').trim();
      if (!po) return;

      var newRow = [
        po,
        row.material_name    || row['Material Name']    || '',
        row.item_description || row['Item Description'] || '',
        row.uom              || row['UOM']              || '',
        row.vendor_id        || row['Vendor ID']        || '',
        row.vendor_name      || row['Vendor Name']      || '',
        row.style            || row['Style']            || '',
        row.model_shoe       || row['Model Shoe']       || '',
        Number(row.planned_qty || row['Planned Qty'])   || 0,
        'pending',
        uploaded,
        now,
      ];

      if (existingMap[po]) {
        // Update existing row
        sheet.getRange(existingMap[po], 1, 1, newRow.length).setValues([newRow]);
        updateCount++;
      } else {
        insertRows.push(newRow);
      }
    });

    if (insertRows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, insertRows.length, insertRows[0].length).setValues(insertRows);
    }

    return {
      status:  'ok',
      message: `Upload selesai: ${insertRows.length} baru, ${updateCount} diperbarui.`,
      inserted: insertRows.length,
      updated:  updateCount,
    };

  } finally {
    lock.releaseLock();
  }
}

// ─── PASS ALL ─────────────────────────────────────────────────
// Tandai semua item pending sebagai Pass secara batch

function passAll(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    var mdSheet  = ss.getSheetByName(SHEET.MASTER_DATA);
    var inspSheet= ss.getSheetByName(SHEET.INSPECTIONS);
    if (!mdSheet)   throw new Error('Sheet "master_data" tidak ditemukan.');
    if (!inspSheet) throw new Error('Sheet "inspections" tidak ditemukan.');

    var data    = mdSheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toLowerCase().replace(/ /g,'_'); });
    var poCol   = headers.indexOf('po_number');
    var stCol   = headers.indexOf('status');
    var qtyCol  = headers.indexOf('planned_qty');
    if (poCol < 0 || stCol < 0) throw new Error('Kolom po_number atau status tidak ditemukan.');

    // Find index of headers in inspections to match columns dynamically
    var inspHeaders = inspSheet.getRange(1, 1, 1, inspSheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).toLowerCase().trim(); });

    var now = new Date().toISOString();
    var adminNik = payload.admin_nik || 'admin';
    var count = 0;
    var newInspRows = [];

    for (var i = 1; i < data.length; i++) {
      var status = String(data[i][stCol] || '').toLowerCase();
      if (status !== 'pending') continue;

      var po  = String(data[i][poCol]);
      var qty = Number(data[i][qtyCol]) || 0;

      var newRow = [];
      var uniqueId = 'INSP-BATCH-' + Date.now() + '-' + i;
      
      inspHeaders.forEach(function(h) {
        if (h === 'inspection_id') newRow.push(uniqueId);
        else if (h === 'po_number') newRow.push(po);
        else if (h === 'inspector_nik') newRow.push(adminNik);
        else if (h === 'qty_inspect') newRow.push(qty);
        else if (h === 'qty_fail') newRow.push(0);
        else if (h === 'defect_notes') newRow.push('');
        else if (h === 'result_status') newRow.push('Pass');
        else if (h === 'input_type') newRow.push('batch_pass_all');
        else if (h === 'rolling_inspection') newRow.push('No');
        else if (h === 'inspection_date') newRow.push(now);
        else if (h === 'created_at') newRow.push(now);
        else newRow.push('');
      });

      newInspRows.push(newRow);

      // Update status to done
      mdSheet.getRange(i + 1, stCol + 1).setValue('done');
      count++;
    }

    if (newInspRows.length) {
      inspSheet.getRange(inspSheet.getLastRow() + 1, 1, newInspRows.length, newInspRows[0].length)
        .setValues(newInspRows);
    }

    return {
      status:  'ok',
      message: `Pass All selesai: ${count} item ditandai sebagai Pass.`,
      count:   count,
    };

  } finally {
    lock.releaseLock();
  }
}

// ─── GENERATE TEMPLATE ────────────────────────────────────────
// Mengembalikan file Excel template kosong (CSV sebagai fallback)

function generateTemplate() {
  // Header template
  var headers = [
    'po_number', 'material_name', 'item_description', 'uom',
    'vendor_id', 'vendor_name', 'style', 'model_shoe', 'planned_qty'
  ];

  var csvContent = headers.join(',') + '\n';
  // Tambahkan beberapa baris contoh
  csvContent += '"PO-CONTOH-001","Nama Material","Deskripsi item","pcs","V001","Nama Vendor","STYLE-001","Model Sepatu",100\n';

  var blob = Utilities.newBlob(csvContent, 'text/csv', 'template_master_data_iqc_material.csv');
  return ContentService.createTextOutput(blob.getDataAsString())
    .setMimeType(ContentService.MimeType.CSV);
}

// ─── VERIFY SUPABASE TOKEN (opsional) ────────────────────────

function verifySupabaseToken(token) {
  if (!token) return null;
  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText());
  } catch {
    return null;
  }
}

// ─── SETUP SPREADSHEET HEADERS (jalankan sekali saja) ─────────
// Buka Apps Script editor → Run → setupSpreadsheetHeaders

function setupSpreadsheetHeaders() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // vendors
  var vSheet = ss.getSheetByName(SHEET.VENDORS) || ss.insertSheet(SHEET.VENDORS);
  if (vSheet.getLastRow() === 0) {
    vSheet.getRange(1, 1, 1, 3).setValues([['vendor_id', 'vendor_name', 'vendor_code']]);
    vSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e2e8f0');
  }

  // master_data
  var mdSheet = ss.getSheetByName(SHEET.MASTER_DATA) || ss.insertSheet(SHEET.MASTER_DATA);
  if (mdSheet.getLastRow() === 0) {
    var mdHeaders = ['po_number','material_name','item_description','uom','vendor_id','vendor_name','style','model_shoe','planned_qty','status','uploaded_by','uploaded_at'];
    mdSheet.getRange(1, 1, 1, mdHeaders.length).setValues([mdHeaders]);
    mdSheet.getRange(1, 1, 1, mdHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
  }

  // inspections
  var inspSheet = ss.getSheetByName(SHEET.INSPECTIONS) || ss.insertSheet(SHEET.INSPECTIONS);
  var inspHeaders = ['inspection_id','po_number','inspector_nik','qty_inspect','qty_fail','defect_notes','result_status','input_type','rolling_inspection','approved_by_leader','evidence_url','inspection_date','created_at'];
  if (inspSheet.getLastRow() === 0) {
    inspSheet.getRange(1, 1, 1, inspHeaders.length).setValues([inspHeaders]);
    inspSheet.getRange(1, 1, 1, inspHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
  } else {
    var lastCol = inspSheet.getLastColumn();
    var firstRow = inspSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headersLower = firstRow.map(function(h) { return String(h).toLowerCase().trim(); });
    if (headersLower.indexOf('rolling_inspection') < 0) {
      inspSheet.getRange(1, lastCol + 1).setValue('rolling_inspection').setFontWeight('bold').setBackground('#e2e8f0');
    }
    
    // Refresh col check
    var lastCol2 = inspSheet.getLastColumn();
    var firstRow2 = inspSheet.getRange(1, 1, 1, lastCol2).getValues()[0];
    var headersLower2 = firstRow2.map(function(h) { return String(h).toLowerCase().trim(); });
    if (headersLower2.indexOf('approved_by_leader') < 0) {
      inspSheet.getRange(1, lastCol2 + 1).setValue('approved_by_leader').setFontWeight('bold').setBackground('#e2e8f0');
    }
    
    var lastCol3 = inspSheet.getLastColumn();
    var firstRow3 = inspSheet.getRange(1, 1, 1, lastCol3).getValues()[0];
    var headersLower3 = firstRow3.map(function(h) { return String(h).toLowerCase().trim(); });
    if (headersLower3.indexOf('evidence_url') < 0) {
      inspSheet.getRange(1, lastCol3 + 1).setValue('evidence_url').setFontWeight('bold').setBackground('#e2e8f0');
    }
  }

  // users
  var uSheet = ss.getSheetByName(SHEET.USERS) || ss.insertSheet(SHEET.USERS);
  if (uSheet.getLastRow() === 0) {
    var uHeaders = ['nik', 'password', 'name', 'role', 'created_at'];
    uSheet.getRange(1, 1, 1, uHeaders.length).setValues([uHeaders]);
    uSheet.getRange(1, 1, 1, uHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
    
    // Seed default admin user
    var now = new Date().toISOString();
    uSheet.appendRow(['admin', 'admin123', 'Admin Material', 'admin', now]);
  }

  SpreadsheetApp.flush();
  Logger.log('Setup selesai! Sheets tersedia: vendors, master_data, inspections, users');
}

// ─── HELPER ───────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── USER MANAGEMENT CRUD ─────────────────────────────────────

function getUsers() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.USERS);
  if (!sheet) return { data: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { data: [] };

  var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var rows = data.slice(1);

  var result = rows.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[h] = row[i];
    });
    return obj;
  });

  return { data: result };
}

function saveUser(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var nik = String(payload.nik || '').trim();
    var name = String(payload.name || '').trim();
    var role = String(payload.role || '').trim();
    var password = String(payload.password || '').trim();

    if (!nik || !name || !role) throw new Error('Data tidak lengkap. NIK, Nama, dan Role wajib diisi.');

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.USERS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.USERS);
      sheet.getRange(1, 1, 1, 5).setValues([['nik', 'password', 'name', 'role', 'created_at']]);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e2e8f0');
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var nikCol = headers.indexOf('nik');
    var passCol = headers.indexOf('password');
    var nameCol = headers.indexOf('name');
    var roleCol = headers.indexOf('role');

    var existingRowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][nikCol]).trim().toLowerCase() === nik.toLowerCase()) {
        existingRowIdx = i + 1; // 1-indexed, +1 header
        break;
      }
    }

    var now = new Date().toISOString();

    if (existingRowIdx >= 0) {
      // Update
      sheet.getRange(existingRowIdx, nameCol + 1).setValue(name);
      sheet.getRange(existingRowIdx, roleCol + 1).setValue(role);
      if (password) {
        sheet.getRange(existingRowIdx, passCol + 1).setValue(password);
      }
      return { status: 'ok', message: 'User berhasil diperbarui.' };
    } else {
      // Insert new user
      if (!password) throw new Error('Password wajib diisi untuk user baru.');
      
      var newRow = [];
      headers.forEach(function(h) {
        if (h === 'nik') newRow.push(nik);
        else if (h === 'password') newRow.push(password);
        else if (h === 'name') newRow.push(name);
        else if (h === 'role') newRow.push(role);
        else if (h === 'created_at') newRow.push(now);
        else newRow.push('');
      });
      sheet.appendRow(newRow);
      return { status: 'ok', message: 'User baru berhasil didaftarkan.' };
    }

  } finally {
    lock.releaseLock();
  }
}

function deleteUser(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var nik = String(payload.nik || '').trim();
    if (!nik) throw new Error('NIK tidak valid.');

    // Proteksi default admin
    if (nik.toLowerCase() === 'admin') {
      throw new Error('User default "admin" tidak dapat dihapus.');
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.USERS);
    if (!sheet) throw new Error('Sheet "users" tidak ditemukan.');

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var nikCol = headers.indexOf('nik');

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][nikCol]).trim().toLowerCase() === nik.toLowerCase()) {
        sheet.deleteRow(i + 1);
        return { status: 'ok', message: 'User berhasil dihapus.' };
      }
    }

    throw new Error('User tidak ditemukan.');

  } finally {
    lock.releaseLock();
  }
}
