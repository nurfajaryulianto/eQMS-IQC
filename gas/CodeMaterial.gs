// ============================================================
// CodeMaterial.gs — GAS Backend untuk IQC Material App
// Deploy sebagai Web App (akses: Anyone) lalu salin URL ke form.js
// ============================================================

// ─── SPREADSHEET CONFIG ──────────────────────────────────────
var SPREADSHEET_ID = '13C5MdJR_WN1A6wUzlRXCPCz6hKRoiR3Mg-0p_lMLblQ';

var SHEET = {
  VENDORS:      'vendors',
  MASTER_DATA:  'master_data',
  INSPECTIONS:  'inspections',
  USERS:        'users',
  SETTINGS:     'settings',
  ASSIGNMENTS:  'material_assignments',
};

var SUPABASE_URL  = 'https://mymzszufrwmpkpmmlnnc.supabase.co';

// Header columns for master_data sheet (Matches ADF QC Lab layout exactly)
var MASTER_DATA_HEADERS = [
  'no', 'material_name', 'material_description', 'uom', 'supplier', 'supplier_name', 'po_area', 
  'batch_size', 'product_code', 'model_name', 'bucket', 'receive_date', 'po_number', 
  'shipment_number', 'no_bc', 'bc_type', 'receive_number', 'material_type',
  'status', 'uploaded_by', 'uploaded_at', 'checked_qty'
];

// Header columns for inspections sheet (Matches target 18-column image layout + metadata)
var INSPECTION_HEADERS = [
  'no', 'material_name', 'item_description', 'color', 'uom', 'suppliers', 'supplier_pengirim', 'po_no',
  'qty_receive', 'ok', 'no_qty', 'style', 'shoe_model', 'bucket', 'check_color', 'receive_date',
  'in_lab', 'lot', 'status', 'uploaded_at', 'inspection_id', 'inspector_nik',
  'defect_notes', 'rolling_inspection', 'approved_by_leader', 'evidence_url', 'inspection_date',
  'inspection_type', 'color_check_status', 'color_check_result', 'packaging_status',
  'packaging_reject_reason', 'roll_inspection_flag', 'roll_inspection_percentage', 'bonding_test_url'
];

/**
 * UTILITY FUNCTION: Jalankan fungsi ini 1x di Apps Script Editor
 * untuk otomatis memperbarui Baris 1 pada sheet 'inspections' dengan 35 kolom header lengkap.
 */
function setupInspectionHeaders() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.INSPECTIONS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.INSPECTIONS);
  }
  
  sheet.getRange(1, 1, 1, INSPECTION_HEADERS.length).setValues([INSPECTION_HEADERS]);
  sheet.getRange(1, 1, 1, INSPECTION_HEADERS.length).setFontWeight("bold").setBackground("#10b981").setFontColor("#ffffff");
  
  Logger.log("Berhasil memperbarui Baris 1 sheet 'inspections' dengan 35 kolom header lengkap!");
}

// ─── ENTRY POINTS ─────────────────────────────────────────────

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  try {
    if (action === 'getMasterData')          return jsonResponse(getMasterData(e.parameter));
    if (action === 'getInspectionData')      return jsonResponse(getInspectionData(e.parameter));
    if (action === 'getUsers')               return jsonResponse(getUsers());
    if (action === 'getMaterialAssignments') return jsonResponse(getMaterialAssignments());
    if (action === 'generateTemplate')       return generateTemplate();
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
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON payload: ' + err.message });
  }

  var action = payload.action || '';
  try {
    if (action === 'login')                  return jsonResponse(login(payload));
    if (action === 'submitInspection')       return jsonResponse(submitInspection(payload));
    if (action === 'bulkUpsertMasterData')   return jsonResponse(bulkUpsertMasterData(payload));
    if (action === 'passAll')                return jsonResponse(passAll(payload));
    if (action === 'saveUser')               return jsonResponse(saveUser(payload));
    if (action === 'deleteUser')             return jsonResponse(deleteUser(payload));
    if (action === 'saveMaterialAssignment')   return jsonResponse(saveMaterialAssignment(payload));
    if (action === 'deleteMaterialAssignment') return jsonResponse(deleteMaterialAssignment(payload));
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
      
      var matAssignCol = headers.indexOf('material_assignment');
      var matAssignVal = matAssignCol >= 0 ? String(data[i][matAssignCol] || '').trim() : '';

      var expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8);

      return {
        nik: rowNik,
        name: nameVal,
        role: roleVal,
        material_assignment: matAssignVal,
        token: 'token_' + Utilities.getUuid(),
        expires_at: expiresAt.toISOString()
      };
    }
  }

  throw new Error('NIK atau password salah.');
}

function getMasterData(params) {
  var statusFilter = (params && params.status) ? params.status.toLowerCase() : 'all';
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) throw new Error('Sheet "master_data" tidak ditemukan.');

  var data        = sheet.getDataRange().getValues();
  var displayData = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return { data: [] };

  // DYNAMIC LIVE LOOKUP from "inspections" sheet for single source of truth & per-inspection status
  var inspSheet = ss.getSheetByName(SHEET.INSPECTIONS);
  var inspMap = {};
  if (inspSheet && inspSheet.getLastRow() > 1) {
    var inspData = inspSheet.getDataRange().getValues();
    // Col indices in inspections sheet:
    // 7: po_no
    // 9: ok, 10: no_qty
    // 18: status ('done' / 'in-progress')
    // 27: inspection_type ('Raw Material', 'Laminating Material', 'Bonding Test')
    // 28: color_check_status
    // 34: bonding_test_url (Col AI / index 34)
    for (var i = 1; i < inspData.length; i++) {
      var pNo = String(inspData[i][7] || '').trim().toLowerCase();
      if (!pNo) continue;
      if (!inspMap[pNo]) {
        inspMap[pNo] = {
          checked_qty: 0,
          raw_done: false,
          laminating_done: false,
          bonding_done: false,
          has_any_inspection: true,
          last_status: ''
        };
      }

      var iType = String(inspData[i][27] || '').trim();
      var iStatus = String(inspData[i][18] || '').trim().toLowerCase();
      var okQty = Number(inspData[i][9]) || 0;
      var noQty = Number(inspData[i][10]) || 0;
      var colorStatus = String(inspData[i][28] || '').trim();
      var bondingUrl = String(inspData[i][34] || '').trim();

      inspMap[pNo].checked_qty += (okQty + noQty);

      if (iType.indexOf('Raw Material') >= 0 && (iStatus === 'done' || (okQty + noQty) > 0)) {
        if (iStatus === 'done') inspMap[pNo].raw_done = true;
      }
      if (iType.indexOf('Laminating Material') >= 0) {
        inspMap[pNo].laminating_done = true;
      }
      if (iType.indexOf('Bonding Test') >= 0 || bondingUrl !== '') {
        inspMap[pNo].bonding_done = true;
      }

      inspMap[pNo].last_status = iStatus;
    }
  }

  var result = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var disp = displayData[r];

    var poVal = String(row[12] || '').trim();
    if (!poVal) continue; // skip rows without PO number

    var plannedQty = Number(row[7]) || 0;
    var poKey = poVal.toLowerCase();
    var inspInfo = inspMap[poKey];

    // Calculate dynamic checked_qty & status based on live inspections sheet
    var checkedQty = inspInfo ? inspInfo.checked_qty : 0;
    var rawDone = inspInfo ? (inspInfo.raw_done || (checkedQty >= plannedQty && plannedQty > 0)) : false;
    var lamDone = inspInfo ? inspInfo.laminating_done : false;
    var bondDone = inspInfo ? inspInfo.bonding_done : false;

    var dynamicStatus = 'pending';
    if (!inspInfo) {
      // No active rows in inspections sheet -> automatically reset to 'pending'!
      dynamicStatus = 'pending';
    } else if (rawDone || checkedQty >= plannedQty) {
      dynamicStatus = 'done';
    } else if (checkedQty > 0 || inspInfo.has_any_inspection) {
      dynamicStatus = 'in-progress';
    }

    if (statusFilter !== 'all' && dynamicStatus !== statusFilter) continue;

    var rdVal = disp[11] || '';
    if (!rdVal && row[11] != null && row[11] !== '') {
      try {
        if (row[11] instanceof Date || (typeof row[11] === 'object' && row[11].getTime)) {
          rdVal = Utilities.formatDate(row[11], Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          rdVal = String(row[11]).trim();
        }
      } catch(e) {
        rdVal = String(row[11]).trim();
      }
    }

    var balanceQty = Math.max(0, plannedQty - checkedQty);

    result.push({
      po_number:        poVal,
      material_name:    String(row[1] || '').trim(),
      item_description: String(row[2] || '').trim(),
      uom:              String(row[3] || '').trim(),
      vendor_name:      String(row[5] || row[4] || '').trim(),
      style:            String(row[8] || '').trim(),
      model_shoe:       String(row[9] || '').trim(),
      planned_qty:      plannedQty,
      checked_qty:      checkedQty,
      in_progress_qty:  checkedQty,
      balance_qty:      balanceQty,
      receive_date:     rdVal,
      status:           dynamicStatus,
      raw_done:         rawDone,
      laminating_done:  lamDone,
      bonding_done:     bondDone
    });
  }

  return { data: result, total: result.length };
}

// Helper to extract values from uploaded Excel row object regardless of exact header casing/spacing
function getExcelVal(rObj, candList) {
  if (!rObj) return '';
  var keys = Object.keys(rObj);
  for (var c = 0; c < candList.length; c++) {
    var target = String(candList[c]).toLowerCase().replace(/[^a-z0-9]/g, '');
    for (var k = 0; k < keys.length; k++) {
      var keyClean = String(keys[k] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keyClean === target && rObj[keys[k]] != null && rObj[keys[k]] !== '') {
        return rObj[keys[k]];
      }
    }
  }
  return '';
}

function normalizeDateStr(dVal) {
  if (!dVal) return '';
  if (dVal instanceof Date) {
    try { return Utilities.formatDate(dVal, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch(e) {}
  }
  var str = String(dVal).trim();
  if (!str) return '';
  if (str.indexOf('T') > 0) return str.split('T')[0];
  var clean = str.split(' ')[0];
  if (clean.indexOf('-') > 0 && clean.split('-')[0].length <= 2) {
    var p1 = clean.split('-');
    if (p1.length === 3) return p1[2] + '-' + (p1[1].length === 1 ? '0' + p1[1] : p1[1]) + '-' + (p1[0].length === 1 ? '0' + p1[0] : p1[0]);
  }
  if (clean.indexOf('/') > 0 && clean.split('/')[0].length <= 2) {
    var p2 = clean.split('/');
    if (p2.length === 3) return p2[2] + '-' + (p2[1].length === 1 ? '0' + p2[1] : p2[1]) + '-' + (p2[0].length === 1 ? '0' + p2[0] : p2[0]);
  }
  return clean.toLowerCase();
}

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
    var existingMap = {};
    
    // Map existing POs + Receive Date (Column M is index 12, Column L is index 11)
    for (var i = 1; i < data.length; i++) {
      var poKey = String(data[i][12]).trim();
      var dateKey = normalizeDateStr(data[i][11]);
      if (poKey) {
        existingMap[(poKey + '___' + dateKey).toLowerCase()] = true;
      }
    }

    var now        = new Date().toISOString();
    var uploaded   = payload.uploader_nik || 'admin';
    var insertRows = [];
    var rejectedPOs = [];

    rows.forEach(function(row) {
      // Maps keys from the uploaded ADF Layout Excel template flexibly
      var po = String(getExcelVal(row, ['PO Number', 'po_number', 'po_no', 'ponumber', 'po'])).trim();
      if (!po) return;

      var matName = getExcelVal(row, ['Material Name', 'material_name', 'materialname', 'material']);
      var matDesc = getExcelVal(row, ['Material Description', 'item_description', 'material_description', 'description', 'deskripsi']);
      var uom = getExcelVal(row, ['UOM', 'uom']);
      var supplier = getExcelVal(row, ['Supplier', 'supplier', 'vendor', 'vendor_name']);
      var supplierName = getExcelVal(row, ['Supplier Name', 'supplier_name', 'vendor_name']);
      var batchSize = Number(getExcelVal(row, ['Batch Size', 'batch_size', 'planned_qty', 'qty', 'qty_receive'])) || 0;
      var productCode = getExcelVal(row, ['Product Code', 'product_code', 'style', 'style_number']);
      var modelName = getExcelVal(row, ['Model Name', 'model_name', 'model_shoe', 'shoe_model', 'model']);
      var bucket = getExcelVal(row, ['Bucket', 'bucket']);
      var receiveDate = getExcelVal(row, ['Receive Date', 'receive_date', 'received_date', 'receivedate', 'date', 'tanggal_receive', 'tanggal_terima', 'incoming_date', 'tanggal_incoming']);
      var shipment = getExcelVal(row, ['Shipment Number', 'shipment_number']);
      var noBc = getExcelVal(row, ['No BC', 'no_bc']);
      var bcType = getExcelVal(row, ['BC Type', 'bc_type']);
      var receiveNum = getExcelVal(row, ['Receive Number', 'receive_number']);
      var poArea = getExcelVal(row, ['PO Area', 'po_area']);
      var matType = getExcelVal(row, ['Material Type', 'material_type']);

      var dupKey = (po + '___' + normalizeDateStr(receiveDate)).toLowerCase();

      var newRow = [];
      MASTER_DATA_HEADERS.forEach(function(h) {
        if (h === 'no') newRow.push('');
        else if (h === 'material_name') newRow.push(matName);
        else if (h === 'material_description') newRow.push(matDesc);
        else if (h === 'uom') newRow.push(uom);
        else if (h === 'supplier') newRow.push(supplier);
        else if (h === 'supplier_name') newRow.push(supplierName);
        else if (h === 'po_area') newRow.push(poArea);
        else if (h === 'batch_size') newRow.push(batchSize);
        else if (h === 'product_code') newRow.push(productCode);
        else if (h === 'model_name') newRow.push(modelName);
        else if (h === 'bucket') newRow.push(bucket);
        else if (h === 'receive_date') newRow.push(receiveDate);
        else if (h === 'po_number') newRow.push(po);
        else if (h === 'shipment_number') newRow.push(shipment);
        else if (h === 'no_bc') newRow.push(noBc);
        else if (h === 'bc_type') newRow.push(bcType);
        else if (h === 'receive_number') newRow.push(receiveNum);
        else if (h === 'material_type') newRow.push(matType);
        else if (h === 'status') newRow.push('pending');
        else if (h === 'uploaded_by') newRow.push(uploaded);
        else if (h === 'uploaded_at') newRow.push(now);
        else newRow.push('');
      });

      if (existingMap[dupKey]) {
        rejectedPOs.push(po + ' (Tgl: ' + (receiveDate || 'N/A') + ')');
      } else {
        existingMap[dupKey] = true;
        insertRows.push(newRow);
      }
    });

    if (insertRows.length) {
      var currentLastRow = sheet.getLastRow();
      var startingNo = Math.max(0, currentLastRow - 1) + 1;
      insertRows.forEach(function(r, idx) {
        r[0] = startingNo + idx;
      });
      sheet.getRange(currentLastRow + 1, 1, insertRows.length, insertRows[0].length).setValues(insertRows);
    }

    return {
      status:  'ok',
      message: `Upload selesai: ${insertRows.length} baru disimpan, ${rejectedPOs.length} duplikat (PO & Receive Date sama) ditolak.`,
      inserted: insertRows.length,
      rejected: rejectedPOs,
    };

  } finally {
    lock.releaseLock();
  }
}

// ─── GET INSPECTION DATA (untuk Dashboard) ────────────────────

function getInspectionData(params) {
  var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet    = ss.getSheetByName(SHEET.INSPECTIONS);
  if (!sheet) throw new Error('Sheet "inspections" tidak ditemukan.');

  var data    = sheet.getDataRange().getValues();
  if (data.length < 3) return { data: [] }; // 2 header rows

  var rows    = data.slice(2);

  var inspections = rows.map(function(row) {
    var obj = {};
    INSPECTION_HEADERS.forEach(function(h, i) { 
      obj[h] = row[i] !== undefined ? row[i] : ''; 
    });
    // Compatibility mapping for dashboard
    obj.po_number = obj.po_no || '';
    obj.qty_inspect = (Number(obj.ok) || 0) + (Number(obj.no_qty) || 0);
    obj.qty_fail = Number(obj.no_qty) || 0;
    obj.result_status = obj.qty_fail === 0 ? 'Pass' : 'Fail';
    obj.inspection_date = obj.inspection_date || '';
    obj.material_name = obj.material_name || '';
    obj.vendor_name = obj.suppliers || '';
    obj.style = obj.style || '';
    obj.model_shoe = obj.shoe_model || '';
    obj.item_description = obj.item_description || '';
    return obj;
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
        var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
        var subDepartmentFolder = getOrCreateSubfolder(parentFolder, "IQC Material");
        
        var fileBlob = Utilities.newBlob(Utilities.base64Decode(payload.file_data), payload.file_type || 'image/png', payload.file_name);
        var driveFile = subDepartmentFolder.createFile(fileBlob);
        driveFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
        evidenceUrl = driveFile.getUrl();
      } catch (err) {
        throw new Error('Gagal upload file bukti: ' + err.message);
      }
    }

    var inspectionId = 'INSP-' + new Date().getTime();
    var now = new Date().toISOString();

    // Find PO in master_data (using MASTER_DATA_HEADERS layout)
    var mdSheet = ss.getSheetByName(SHEET.MASTER_DATA);
    var mdRowData = null;
    if (mdSheet) {
      var mdData = mdSheet.getDataRange().getValues();
      // po_number is Col M (index 12)
      for (var i = 1; i < mdData.length; i++) {
        if (String(mdData[i][12]).trim() === String(payload.po_number).trim()) {
          mdRowData = mdData[i];
          break;
        }
      }
    }

    // Error proofing: Qty Inspect cannot exceed Qty Balance (for in-progress) or Qty Received (for pending)
    var plannedQty = mdRowData ? Number(mdRowData[7]) || 0 : 0;
    var existingChecked = mdRowData ? Number(mdRowData[21]) || 0 : 0;
    var mdStatus = mdRowData ? String(mdRowData[18] || '').toLowerCase().trim() : '';

    var maxAllowedBackend = (mdStatus === 'in-progress' || existingChecked > 0) ? Math.max(0, plannedQty - existingChecked) : plannedQty;
    var inspectQty = Number(payload.qty_inspect) || 0;

    if (maxAllowedBackend > 0 && inspectQty > maxAllowedBackend) {
      var labelTypeBackend = (mdStatus === 'in-progress' || existingChecked > 0) ? 'Qty Balance' : 'Qty Received';
      throw new Error('Qty Inspect (' + inspectQty + ') tidak boleh melebihi ' + labelTypeBackend + ' (' + maxAllowedBackend + ').');
    }

    // STRICT SINGLE-ROW PER PO MECHANISM:
    // Check if a row for this PO already exists in sheet "inspections"
    var targetPO = String(payload.po_number || '').trim().toLowerCase();
    var existingRowIndex = -1;
    var existingRowValues = null;

    if (targetPO && sheet.getLastRow() > 1) {
      var allRows = sheet.getDataRange().getValues();
      for (var r = 1; r < allRows.length; r++) {
        var rowPO = String(allRows[r][7] || '').trim().toLowerCase(); // Index 7 is po_no
        if (rowPO === targetPO) {
          existingRowIndex = r + 1; // 1-based row index in Sheet
          existingRowValues = allRows[r];
          break;
        }
      }
    }

    if (existingRowIndex > 1 && existingRowValues) {
      // UPDATE EXISTING ROW IN PLACE (STRICTLY 1 ROW PER PO)
      var isBonding = (payload.inspection_type === 'Bonding Test');
      var isLam = (payload.inspection_type === 'Laminating Material');
      var isRaw = (payload.inspection_type === 'Raw Material' || !payload.inspection_type);

      // Col indices (0-indexed in array):
      // 9: ok, 10: no_qty
      // 18: status ('done' / 'in-progress')
      // 21: inspector_nik, 22: defect_notes
      // 24: approved_by_leader, 25: evidence_url (Col Z)
      // 27: inspection_type
      // 28: color_check_status, 29: color_check_result, 30: packaging_status, 31: packaging_reject_reason
      // 32: roll_inspection_flag, 33: roll_inspection_percentage
      // 34: bonding_test_url (Col AI)

      if (isBonding) {
        var bondingUrl = evidenceUrl || payload.bonding_test_url || '';
        if (bondingUrl) existingRowValues[34] = bondingUrl;
        var bNotes = payload.bonding_notes || payload.defect_notes || '';
        if (bNotes) {
          var oldNotes = String(existingRowValues[22] || '').trim();
          existingRowValues[22] = oldNotes ? (oldNotes + '; [Bonding Test]: ' + bNotes) : ('[Bonding Test]: ' + bNotes);
        }
      } else if (isLam) {
        existingRowValues[28] = payload.color_check_status || 'YES';
        existingRowValues[29] = payload.color_check_result || payload.check_color || 'Color OK';
        existingRowValues[30] = payload.packaging_status || 'YES';
        existingRowValues[31] = payload.packaging_reject_reason || '';
        existingRowValues[32] = payload.roll_inspection_flag || payload.rolling_inspection || 'No';
        existingRowValues[33] = payload.roll_inspection_percentage || '';
        
        var curType = String(existingRowValues[27] || '').trim();
        if (!curType.includes('Laminating Material')) {
          existingRowValues[27] = curType ? (curType + ', Laminating Material') : 'Laminating Material';
        }
        if (payload.approved_by_leader) existingRowValues[24] = payload.approved_by_leader;
        if (evidenceUrl) existingRowValues[25] = evidenceUrl; // Column Z
        if (payload.defect_notes) {
          var oldN = String(existingRowValues[22] || '').trim();
          existingRowValues[22] = oldN ? (oldN + '; ' + payload.defect_notes) : payload.defect_notes;
        }
      } else {
        // Raw Material inspection update
        var prevOK = Number(existingRowValues[9]) || 0;
        var prevNO = Number(existingRowValues[10]) || 0;
        var curOK = Math.max(0, (payload.qty_inspect || 0) - (payload.qty_fail || 0));
        var curNO = Number(payload.qty_fail) || 0;

        existingRowValues[9] = prevOK + curOK;
        existingRowValues[10] = prevNO + curNO;
        existingRowValues[14] = payload.check_color || 'OK';
        existingRowValues[23] = payload.rolling_inspection || 'No';
        if (payload.approved_by_leader) existingRowValues[24] = payload.approved_by_leader;
        if (evidenceUrl) existingRowValues[25] = evidenceUrl; // Column Z
        if (payload.defect_notes) {
          var oldN = String(existingRowValues[22] || '').trim();
          existingRowValues[22] = oldN ? (oldN + '; ' + payload.defect_notes) : payload.defect_notes;
        }
        var curType = String(existingRowValues[27] || '').trim();
        if (!curType.includes('Raw Material')) {
          existingRowValues[27] = curType ? ('Raw Material, ' + curType) : 'Raw Material';
        }
      }

      existingRowValues[18] = payload.status || 'done'; // Col S status
      if (payload.inspector_name || payload.inspector_nik) existingRowValues[21] = payload.inspector_name || payload.inspector_nik;
      existingRowValues[19] = now; // uploaded_at

      // Write updated row back to Sheet at existingRowIndex (Col 1 to 35)
      sheet.getRange(existingRowIndex, 1, 1, 35).setValues([existingRowValues]);

      var qtyInspected = Number(payload.qty_inspect) || 0;
      updateMasterDataStatus(ss, payload.po_number, payload.status || 'done', qtyInspected);

      return { status: 'ok', inspection_id: String(existingRowValues[20] || inspectionId), message: 'Data inspeksi berhasil diperbarui pada baris PO yang sama.' };
    }

    // IF NO EXISTING ROW: Create 1 single new row
    var currentOK = Math.max(0, (payload.qty_inspect || 0) - (payload.qty_fail || 0));
    var currentNO = Number(payload.qty_fail) || 0;
    var currentNotes = payload.defect_notes || payload.bonding_notes || '';

    var newRow = [];
    INSPECTION_HEADERS.forEach(function(h) {
      if (h === 'no') {
        newRow.push(Math.max(1, sheet.getLastRow() - 1)); // 2 header rows
      }
      else if (h === 'inspection_id') newRow.push(inspectionId);
      else if (h === 'po_no') newRow.push(payload.po_number || '');
      else if (h === 'inspector_nik') newRow.push(payload.inspector_name || payload.inspector_nik || '');
      
      else if (h === 'qty_receive') {
        var val = mdRowData ? Number(mdRowData[7]) : 0;
        newRow.push(val);
      }
      else if (h === 'ok') newRow.push(currentOK);
      else if (h === 'no_qty') newRow.push(currentNO);
      else if (h === 'check_color') newRow.push(payload.check_color || 'OK');
      
      else if (h === 'defect_notes') newRow.push(currentNotes);
      else if (h === 'rolling_inspection') newRow.push(payload.rolling_inspection || 'No');
      else if (h === 'approved_by_leader') newRow.push(payload.approved_by_leader || '');
      else if (h === 'evidence_url') newRow.push(payload.inspection_type === 'Bonding Test' ? '' : (evidenceUrl || ''));
      else if (h === 'inspection_date') newRow.push(payload.inspection_date || now);

      else if (h === 'inspection_type') newRow.push(payload.inspection_type || 'Raw Material');
      else if (h === 'color_check_status') newRow.push(payload.inspection_type === 'Laminating Material' ? (payload.color_check_status || 'YES') : '');
      else if (h === 'color_check_result') newRow.push(payload.inspection_type === 'Laminating Material' ? (payload.color_check_result || 'Color OK') : '');
      else if (h === 'packaging_status') newRow.push(payload.inspection_type === 'Laminating Material' ? (payload.packaging_status || 'YES') : '');
      else if (h === 'packaging_reject_reason') newRow.push(payload.inspection_type === 'Laminating Material' ? (payload.packaging_reject_reason || '') : '');
      else if (h === 'roll_inspection_flag') newRow.push(payload.inspection_type === 'Laminating Material' ? (payload.roll_inspection_flag || 'No') : '');
      else if (h === 'roll_inspection_percentage') newRow.push(payload.inspection_type === 'Laminating Material' ? (payload.roll_inspection_percentage || '') : '');
      else if (h === 'bonding_test_url') newRow.push(payload.bonding_test_url || (payload.inspection_type === 'Bonding Test' ? evidenceUrl : ''));

      else if (h === 'status') newRow.push(payload.status || 'done');
      else if (h === 'uploaded_at') newRow.push(now);
      
      else if (mdRowData) {
        if (h === 'material_name') newRow.push(mdRowData[1]);
        else if (h === 'item_description') newRow.push(mdRowData[2]);
        else if (h === 'uom') newRow.push(mdRowData[3]);
        else if (h === 'suppliers') newRow.push(mdRowData[4]);
        else if (h === 'supplier_pengirim') newRow.push(mdRowData[5]);
        else if (h === 'style') newRow.push(mdRowData[8]);
        else if (h === 'shoe_model') newRow.push(mdRowData[9]);
        else if (h === 'bucket') newRow.push(mdRowData[10]);
        else if (h === 'receive_date') newRow.push(mdRowData[11]);
        else newRow.push('');
      }
      else {
        newRow.push('');
      }
    });

    sheet.appendRow(newRow);

    // Update status and checked_qty in master_data
    var qtyInspected = Number(payload.qty_inspect) || 0;
    updateMasterDataStatus(ss, payload.po_number, payload.status || 'done', qtyInspected);

    return { status: 'ok', inspection_id: inspectionId, message: 'Data inspeksi berhasil disimpan.' };

  } finally {
    lock.releaseLock();
  }
}

function updateMasterDataStatus(ss, poNumber, newStatus, qtyInspected) {
  var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) return;

  var data    = sheet.getDataRange().getValues();
  // status is Col S (index 18), checked_qty is Col V (index 21)
  // po_number is Col M (index 12)
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][12]).trim() === String(poNumber).trim()) {
      sheet.getRange(i + 1, 19).setValue(newStatus);

      // Update checked_qty column (index 21 = col 22)
      if (newStatus === 'in-progress') {
        // Accumulate: existing checked_qty + newly inspected qty
        var existingChecked = Number(data[i][21]) || 0;
        sheet.getRange(i + 1, 22).setValue(existingChecked + (qtyInspected || 0));
      } else if (newStatus === 'done' || newStatus === 'pending') {
        // Clear checked_qty when done or pending
        sheet.getRange(i + 1, 22).setValue('');
      }
      break;
    }
  }
}

// ─── PASS ALL ─────────────────────────────────────────────────

function passAll(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    var mdSheet  = ss.getSheetByName(SHEET.MASTER_DATA);
    var inspSheet= ss.getSheetByName(SHEET.INSPECTIONS);
    if (!mdSheet)   throw new Error('Sheet "master_data" tidak ditemukan.');
    if (!inspSheet) throw new Error('Sheet "inspections" tidak ditemukan.');

    var data  = mdSheet.getDataRange().getValues();
    var now   = new Date().toISOString();
    var adminNik  = payload.admin_nik || 'admin';
    var adminName = payload.admin_name || 'Admin Material';
    var count = 0;
    var newInspRows = [];

    // Load material assignments map from USERS sheet and ASSIGNMENTS sheet
    var assignMap = {};
    var uSheet = ss.getSheetByName(SHEET.USERS);
    if (uSheet && uSheet.getLastRow() > 1) {
      var uData = uSheet.getDataRange().getValues();
      var uHdrs = uData[0].map(function(h) { return String(h).toLowerCase().trim(); });
      var uNameCol = uHdrs.indexOf('name');
      var uMatCol = uHdrs.indexOf('material_assignment');
      if (uNameCol >= 0 && uMatCol >= 0) {
        for (var u = 1; u < uData.length; u++) {
          var uname = String(uData[u][uNameCol] || '').trim();
          var umats = String(uData[u][uMatCol] || '').trim();
          if (uname && umats) {
            var splitted = umats.split(',');
            splitted.forEach(function(sm) {
              var cleanMat = sm.trim().toLowerCase();
              if (cleanMat) {
                if (!assignMap[cleanMat]) {
                  assignMap[cleanMat] = [uname];
                } else if (assignMap[cleanMat].indexOf(uname) < 0) {
                  assignMap[cleanMat].push(uname);
                }
              }
            });
          }
        }
      }
    }

    var assignSheet = ss.getSheetByName(SHEET.ASSIGNMENTS);
    if (assignSheet && assignSheet.getLastRow() > 1) {
      var assignData = assignSheet.getDataRange().getValues();
      var aHeaders = assignData[0].map(function(h) { return String(h).toLowerCase().trim(); });
      var mtCol = aHeaders.indexOf('material_type');
      var nameCol = aHeaders.indexOf('inspector_name');
      var nikCol = aHeaders.indexOf('inspector_nik');
      for (var k = 1; k < assignData.length; k++) {
        var mt = String(assignData[k][mtCol] || '').trim().toLowerCase();
        var iname = String(assignData[k][nameCol] || assignData[k][nikCol] || '').trim();
        if (mt && iname) {
          if (!assignMap[mt]) {
            assignMap[mt] = [iname];
          } else if (Array.isArray(assignMap[mt]) && assignMap[mt].indexOf(iname) < 0) {
            assignMap[mt].push(iname);
          }
        }
      }
    }

    // Filter by specific PO numbers if provided (handles single & comma-separated PO strings)
    var targetPOsMap = null;
    if (payload.po_numbers && Array.isArray(payload.po_numbers)) {
      targetPOsMap = {};
      payload.po_numbers.forEach(function(poStr) {
        var str = String(poStr || '').trim().toLowerCase();
        if (str) {
          targetPOsMap[str] = true;
          var parts = str.split(',');
          parts.forEach(function(p) {
            var sub = p.trim().toLowerCase();
            if (sub) targetPOsMap[sub] = true;
          });
        }
      });
    }

    // Index existing inspection rows by PO number (Col H / index 7) to avoid duplicate rows
    var inspMapByPO = {};
    var existingInspData = inspSheet.getLastRow() > 1 ? inspSheet.getDataRange().getValues() : [];
    for (var r = 1; r < existingInspData.length; r++) {
      var poKey = String(existingInspData[r][7] || '').trim().toLowerCase();
      if (poKey) {
        inspMapByPO[poKey] = r + 1;
        var pParts = poKey.split(',');
        pParts.forEach(function(pp) {
          var cleanSub = pp.trim().toLowerCase();
          if (cleanSub) inspMapByPO[cleanSub] = r + 1;
        });
      }
    }

    for (var i = 1; i < data.length; i++) {
      var poRaw = String(data[i][12] || '').trim(); // po_number is Col M (index 12)
      if (!poRaw) continue;

      var poLower = poRaw.toLowerCase();

      // Check if this row's PO matches targetPOsMap
      var isMatched = false;
      if (!targetPOsMap) {
        isMatched = true; // No selection filter, process all
      } else if (targetPOsMap[poLower]) {
        isMatched = true; // Exact match
      } else {
        // Check sub-parts if row or selection contains comma-separated POs
        var subParts = poLower.split(',');
        for (var s = 0; s < subParts.length; s++) {
          var subClean = subParts[s].trim();
          if (subClean && targetPOsMap[subClean]) {
            isMatched = true;
            break;
          }
        }
      }

      if (!isMatched) continue; // Skip if not matched

      var currentStatus = String(data[i][18] || '').trim().toLowerCase(); // status is Col S (index 18)
      if (currentStatus === 'done') continue; // Skip items already completed

      var qty = Number(data[i][7]) || 0; // batch_size is Col H (index 7)
      var matType = String(data[i][17] || '').trim().toLowerCase(); // material_type is Col R (index 17)
      var matName = String(data[i][1] || '').trim().toLowerCase();  // material_name is Col B (index 1)

      var foundList = assignMap[matType] || assignMap[matName] || [];
      var assignedInspectorName = (Array.isArray(foundList) && foundList.length > 0) ? foundList.join(', ') : adminName;

      // Check if any sub-PO already exists in inspMapByPO
      var existingRowIdx = -1;
      if (inspMapByPO[poLower]) {
        existingRowIdx = inspMapByPO[poLower];
      } else {
        var subParts2 = poLower.split(',');
        for (var s2 = 0; s2 < subParts2.length; s2++) {
          var sub2 = subParts2[s2].trim();
          if (sub2 && inspMapByPO[sub2]) {
            existingRowIdx = inspMapByPO[sub2];
            break;
          }
        }
      }

      // Update existing inspection row if present, otherwise create new row
      if (existingRowIdx > 1 && existingInspData[existingRowIdx - 1]) {
        var existingRow = existingInspData[existingRowIdx - 1];

        // Col indices: 9 (ok), 10 (no_qty), 14 (check_color), 18 (status), 19 (uploaded_at), 21 (inspector_nik), 26 (inspection_date)
        existingRow[9] = qty;
        existingRow[10] = 0;
        existingRow[14] = 'OK';
        existingRow[18] = 'done';
        existingRow[19] = now;
        existingRow[21] = assignedInspectorName;
        existingRow[26] = now;
      } else {
        var newRow = [];
        var uniqueId = 'INSP-BATCH-' + Date.now() + '-' + i;
        
        INSPECTION_HEADERS.forEach(function(h) {
          if (h === 'no') {
            newRow.push(inspSheet.getLastRow() + newInspRows.length);
          }
          else if (h === 'inspection_id') newRow.push(uniqueId);
          else if (h === 'po_no') newRow.push(poRaw);
          else if (h === 'inspector_nik') newRow.push(assignedInspectorName);
          else if (h === 'qty_receive') newRow.push(qty);
          else if (h === 'ok') newRow.push(qty);
          else if (h === 'no_qty') newRow.push(0);
          else if (h === 'check_color') newRow.push('OK');
          else if (h === 'status') newRow.push('done');
          else if (h === 'uploaded_at') newRow.push(now);
          else if (h === 'inspection_date') newRow.push(now);
          
          // Map static elements
          else if (h === 'material_name') newRow.push(data[i][1]);
          else if (h === 'item_description') newRow.push(data[i][2]);
          else if (h === 'uom') newRow.push(data[i][3]);
          else if (h === 'suppliers') newRow.push(data[i][4]);
          else if (h === 'supplier_pengirim') newRow.push(data[i][5]);
          else if (h === 'style') newRow.push(data[i][8]);
          else if (h === 'shoe_model') newRow.push(data[i][9]);
          else if (h === 'bucket') newRow.push(data[i][10]);
          else if (h === 'receive_date') newRow.push(data[i][11]);
          else newRow.push('');
        });

        newInspRows.push(newRow);
      }

      // Update in-memory data for master_data sheet (Col S is index 18, Col V is index 21)
      data[i][18] = 'done';
      data[i][21] = 0; // Clear checked_qty
      count++;
    }

    // Single bulk write to master_data sheet for all updated rows (15-50x speed improvement)
    if (count > 0) {
      mdSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }

    // Single bulk append for new inspection rows
    if (newInspRows.length > 0) {
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

function generateTemplate() {
  var headers = [
    'Material Name', 'Material Description', 'UOM', 'Supplier',
    'Supplier Name', 'PO Area', 'Batch Size', 'Product Code',
    'Model Name', 'Bucket', 'Receive Date', 'PO Number',
    'Shipment Number', 'No BC', 'BC Type', 'Receive Number', 'Material Type'
  ];

  var csvContent = headers.join(',') + '\n';
  csvContent += '"RM.LTH.1070000003.00A","FP JUNIOR BUCK - 1.4-1.6MM - DYE THROUGH - N/A - N/A - BLACK(00A)","Square Feet","YOUNGIL LEATHER INDONESIA PT.","","RM-LKL",9605.5,"CU6620-001","NIKE COURT VISION MID - BLACK/BLACK","260525,260810","01-07-2026","1263026745,1263035401","YLI/DO/26/11490,YLI/DO/26/11491","105743","BC 2.7","111260042835,111260042840","LEATHER"\n';

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
  } catch (err) {
    return null;
  }
}

// ─── SETUP SPREADSHEET HEADERS ────────────────────────────────

function setupSpreadsheetHeaders() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // vendors
  var vSheet = ss.getSheetByName(SHEET.VENDORS) || ss.insertSheet(SHEET.VENDORS);
  if (vSheet.getLastRow() === 0) {
    vSheet.getRange(1, 1, 1, 3).setValues([['vendor_id', 'vendor_name', 'vendor_code']]);
    vSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e2e8f0');
  }

  // master_data (Pure ADF QC Lab Raw Material template structure)
  var mdSheet = ss.getSheetByName(SHEET.MASTER_DATA) || ss.insertSheet(SHEET.MASTER_DATA);
  if (mdSheet.getLastRow() <= 1) {
    if (mdSheet.getLastRow() > 0) mdSheet.clear();
    // Headers derived from the Excel sheet ADF Raw Material Layout
    var r1 = [
      'NO', 'Material Name', 'Material Description', 'UOM', 'Supplier', 'Supplier Name', 'PO Area', 
      'Batch Size', 'Product Code', 'Model Name', 'Bucket', 'Receive Date', 'PO Number', 
      'Shipment Number', 'No BC', 'BC Type', 'Receive Number', 'Material Type',
      'status', 'uploaded_by', 'uploaded_at', 'checked_qty'
    ];
    mdSheet.getRange(1, 1, 1, r1.length).setValues([r1]);
    mdSheet.getRange(1, 1, 1, r1.length).setFontWeight('bold').setBackground('#f1f5f9');
  }

  // inspections (Target 18-column layout from image + metadata)
  var inspSheet = ss.getSheetByName(SHEET.INSPECTIONS) || ss.insertSheet(SHEET.INSPECTIONS);
  if (inspSheet.getLastRow() <= 2) {
    if (inspSheet.getLastRow() > 0) inspSheet.clear();
    var r1 = ['NO', 'MATERIAL NAME', 'ITEM DESCRIPTION', 'COLOR', 'UOM', 'SUPPLIERS', 'SUPPLIER PENGIRIM', 'PO NO', 'INSPECTION', '', '', 'STYLE', 'SHOE MODEL', 'BUCKET', 'CHECK COLOR', 'RECEIVE DATE', 'IN LAB', 'LOT', 'status', 'uploaded_at', 'inspection_id', 'inspector_nik', 'defect_notes', 'rolling_inspection', 'approved_by_leader', 'evidence_url', 'inspection_date'];
    var r2 = ['', '', '', '', '', '', '', '', 'QTY RECEIVE', 'OK', 'NO', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    
    inspSheet.getRange(1, 1, 1, r1.length).setValues([r1]);
    inspSheet.getRange(2, 1, 1, r2.length).setValues([r2]);
    inspSheet.getRange(1, 1, 2, r1.length).setFontWeight('bold').setBackground('#f1f5f9');
  }

  // users
  var uSheet = ss.getSheetByName(SHEET.USERS) || ss.insertSheet(SHEET.USERS);
  if (uSheet.getLastRow() === 0) {
    var uHeaders = ['nik', 'password', 'name', 'role', 'material_assignment', 'created_at'];
    uSheet.getRange(1, 1, 1, uHeaders.length).setValues([uHeaders]);
    uSheet.getRange(1, 1, 1, uHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
    
    var now = new Date().toISOString();
    uSheet.appendRow(['admin', 'admin123', 'Admin Material', 'admin', '', now]);
  }

  // material_assignments
  var aSheet = ss.getSheetByName(SHEET.ASSIGNMENTS) || ss.insertSheet(SHEET.ASSIGNMENTS);
  if (aSheet.getLastRow() === 0) {
    var aHeaders = ['material_type', 'inspector_nik', 'inspector_name', 'updated_by', 'updated_at'];
    aSheet.getRange(1, 1, 1, aHeaders.length).setValues([aHeaders]);
    aSheet.getRange(1, 1, 1, aHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
  }

  SpreadsheetApp.flush();
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
    var matAssign = String(payload.material_assignment || payload.material_type || '').trim();

    if (!nik || !name || !role) throw new Error('Data tidak lengkap. NIK, Nama, dan Role wajib diisi.');

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.USERS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.USERS);
      sheet.getRange(1, 1, 1, 6).setValues([['nik', 'password', 'name', 'role', 'material_assignment', 'created_at']]);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e2e8f0');
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
    
    // Ensure material_assignment column exists in header row if older sheet
    var assignCol = headers.indexOf('material_assignment');
    if (assignCol < 0) {
      assignCol = headers.length;
      headers.push('material_assignment');
      sheet.getRange(1, assignCol + 1).setValue('material_assignment').setFontWeight('bold');
    }

    var nikCol = headers.indexOf('nik');
    var passCol = headers.indexOf('password');
    var nameCol = headers.indexOf('name');
    var roleCol = headers.indexOf('role');

    var existingRowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][nikCol]).trim().toLowerCase() === nik.toLowerCase()) {
        existingRowIdx = i + 1;
        break;
      }
    }

    var now = new Date().toISOString();

    if (existingRowIdx >= 0) {
      if (nameCol >= 0) sheet.getRange(existingRowIdx, nameCol + 1).setValue(name);
      if (roleCol >= 0) sheet.getRange(existingRowIdx, roleCol + 1).setValue(role);
      if (assignCol >= 0) sheet.getRange(existingRowIdx, assignCol + 1).setValue(matAssign);
      if (password && passCol >= 0) {
        sheet.getRange(existingRowIdx, passCol + 1).setValue(password);
      }
      return { status: 'ok', message: 'User berhasil diperbarui.' };
    } else {
      if (!password) throw new Error('Password wajib diisi untuk user baru.');
      
      var newRow = [];
      headers.forEach(function(h) {
        if (h === 'nik') newRow.push(nik);
        else if (h === 'password') newRow.push(password);
        else if (h === 'name') newRow.push(name);
        else if (h === 'role') newRow.push(role);
        else if (h === 'material_assignment') newRow.push(matAssign);
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

// ─── MATERIAL ASSIGNMENT CRUD ──────────────────────────────────

function getMaterialAssignments() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.ASSIGNMENTS);
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

function saveMaterialAssignment(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var materialType = String(payload.material_type || '').trim();
    var inspectorNik = String(payload.inspector_nik || '').trim();
    var inspectorName = String(payload.inspector_name || payload.inspector_nik || '').trim();
    var updatedBy = String(payload.updated_by || 'Admin').trim();

    if (!materialType || !inspectorName) {
      throw new Error('Material Type dan Inspector wajib diisi.');
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.ASSIGNMENTS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.ASSIGNMENTS);
      var aHeaders = ['material_type', 'inspector_nik', 'inspector_name', 'updated_by', 'updated_at'];
      sheet.getRange(1, 1, 1, aHeaders.length).setValues([aHeaders]);
      sheet.getRange(1, 1, 1, aHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var mtCol = headers.indexOf('material_type');
    var nikCol = headers.indexOf('inspector_nik');
    var nameCol = headers.indexOf('inspector_name');
    var byCol = headers.indexOf('updated_by');
    var dateCol = headers.indexOf('updated_at');

    var existingRowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][mtCol]).trim().toLowerCase() === materialType.toLowerCase()) {
        existingRowIdx = i + 1;
        break;
      }
    }

    var now = new Date().toISOString();

    if (existingRowIdx >= 0) {
      if (nikCol >= 0) sheet.getRange(existingRowIdx, nikCol + 1).setValue(inspectorNik);
      if (nameCol >= 0) sheet.getRange(existingRowIdx, nameCol + 1).setValue(inspectorName);
      if (byCol >= 0) sheet.getRange(existingRowIdx, byCol + 1).setValue(updatedBy);
      if (dateCol >= 0) sheet.getRange(existingRowIdx, dateCol + 1).setValue(now);
      return { status: 'ok', message: 'Material assignment berhasil diperbarui.' };
    } else {
      var newRow = [];
      headers.forEach(function(h) {
        if (h === 'material_type') newRow.push(materialType);
        else if (h === 'inspector_nik') newRow.push(inspectorNik);
        else if (h === 'inspector_name') newRow.push(inspectorName);
        else if (h === 'updated_by') newRow.push(updatedBy);
        else if (h === 'updated_at') newRow.push(now);
        else newRow.push('');
      });
      sheet.appendRow(newRow);
      return { status: 'ok', message: 'Material assignment baru berhasil ditambahkan.' };
    }
  } finally {
    lock.releaseLock();
  }
}

function deleteMaterialAssignment(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var materialType = String(payload.material_type || '').trim();
    if (!materialType) throw new Error('Material Type tidak valid.');

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.ASSIGNMENTS);
    if (!sheet) throw new Error('Sheet assignment tidak ditemukan.');

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var mtCol = headers.indexOf('material_type');

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][mtCol]).trim().toLowerCase() === materialType.toLowerCase()) {
        sheet.deleteRow(i + 1);
        return { status: 'ok', message: 'Assignment berhasil dihapus.' };
      }
    }

    throw new Error('Assignment tidak ditemukan.');
  } finally {
    lock.releaseLock();
  }
}

// ─── HELPER ───────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
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
