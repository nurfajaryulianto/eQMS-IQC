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
};

var SUPABASE_URL  = 'https://mymzszufrwmpkpmmlnnc.supabase.co';

// Header columns for master_data sheet (Matches ADF QC Lab layout exactly)
var MASTER_DATA_HEADERS = [
  'no', 'material_name', 'material_description', 'uom', 'supplier', 'supplier_name', 'po_area', 
  'batch_size', 'product_code', 'model_name', 'bucket', 'receive_date', 'po_number', 
  'shipment_number', 'no_bc', 'bc_type', 'receive_number', 'material_type',
  'status', 'uploaded_by', 'uploaded_at'
];

// Header columns for inspections sheet (Matches target 18-column image layout + metadata)
var INSPECTION_HEADERS = [
  'no', 'material_name', 'item_description', 'color', 'uom', 'suppliers', 'supplier_pengirim', 'po_no',
  'qty_receive', 'ok', 'no_qty', 'style', 'shoe_model', 'bucket', 'check_color', 'receive_date',
  'in_lab', 'lot', 'status', 'uploaded_at', 'inspection_id', 'inspector_nik',
  'defect_notes', 'rolling_inspection', 'approved_by_leader', 'evidence_url', 'inspection_date'
];

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
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON payload: ' + err.message });
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
      expiresAt.setHours(expiresAt.getHours() + 8);

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

function getMasterData(params) {
  var statusFilter = (params && params.status) ? params.status.toLowerCase() : 'all';
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) throw new Error('Sheet "master_data" tidak ditemukan.');

  var data        = sheet.getDataRange().getValues();
  var displayData = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return { data: [] }; // 1 header row

  var headers = data[0];

  function findCol(candList) {
    for (var c = 0; c < candList.length; c++) {
      var target = String(candList[c]).toLowerCase().replace(/[^a-z0-9]/g, '');
      for (var i = 0; i < headers.length; i++) {
        var h = String(headers[i] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (h === target) return i;
      }
    }
    return -1;
  }

  var poCol       = findCol(['po_number', 'ponumber', 'po_no', 'pono', 'po']);
  var matCol      = findCol(['material_name', 'materialname', 'material']);
  var descCol     = findCol(['material_description', 'item_description', 'description', 'deskripsi']);
  var uomCol      = findCol(['uom']);
  var suppCol     = findCol(['supplier', 'vendor_name', 'vendor', 'supplier_name']);
  var codeCol     = findCol(['product_code', 'style']);
  var modelCol    = findCol(['model_name', 'model_shoe', 'model']);
  var batchCol    = findCol(['batch_size', 'planned_qty', 'qty']);
  var rDateCol    = findCol(['receive_date', 'received_date', 'date', 'tanggal_receive', 'tanggal_terima', 'incoming_date', 'tanggal_incoming']);
  var statusCol   = findCol(['status']);

  var result = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var dispRow = displayData[r];

    function getStr(cIdx) {
      if (cIdx === -1) return '';
      var disp = (dispRow && dispRow[cIdx] != null) ? String(dispRow[cIdx]).trim() : '';
      if (disp) {
        if (disp.includes('T')) return disp.split('T')[0];
        return disp;
      }
      var val = row[cIdx];
      if (!val) return '';
      if (val instanceof Date) {
        try {
          return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } catch(err) {
          return val.toISOString().split('T')[0];
        }
      }
      var str = String(val).trim();
      if (str.includes('T')) return str.split('T')[0];
      return str;
    }

    var st = (getStr(statusCol) || 'pending').toLowerCase();
    if (statusFilter !== 'all' && st !== statusFilter) continue;

    var poVal = getStr(poCol);
    if (!poVal && rDateCol === -1 && matCol === -1) continue; // skip completely empty rows

    result.push({
      po_number: poVal,
      material_name: getStr(matCol),
      item_description: getStr(descCol),
      uom: getStr(uomCol),
      vendor_name: getStr(suppCol),
      style: getStr(codeCol),
      model_shoe: getStr(modelCol),
      planned_qty: Number(row[batchCol !== -1 ? batchCol : 7]) || 0,
      receive_date: getStr(rDateCol),
      status: st,
    });
  }

  return { data: result, total: result.length };
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

    var newRow = [];
    INSPECTION_HEADERS.forEach(function(h) {
      if (h === 'no') {
        newRow.push(Math.max(1, sheet.getLastRow() - 1)); // 2 header rows: NO starts atgetLastRow - 1
      }
      else if (h === 'inspection_id') newRow.push(inspectionId);
      else if (h === 'po_no') newRow.push(payload.po_number || '');
      else if (h === 'inspector_nik') newRow.push(payload.inspector_nik || '');
      
      // Inspection details
      else if (h === 'qty_receive') {
        var val = mdRowData ? Number(mdRowData[7]) : 0; // batch_size is index 7
        newRow.push(val);
      }
      else if (h === 'ok') {
        newRow.push(payload.qty_inspect - payload.qty_fail);
      }
      else if (h === 'no_qty') {
        newRow.push(payload.qty_fail);
      }
      else if (h === 'check_color') {
        newRow.push(payload.check_color || 'OK');
      }
      
      else if (h === 'defect_notes') newRow.push(payload.defect_notes || '');
      else if (h === 'rolling_inspection') newRow.push(payload.rolling_inspection || 'No');
      else if (h === 'approved_by_leader') newRow.push(payload.approved_by_leader || '');
      else if (h === 'evidence_url') newRow.push(evidenceUrl || '');
      else if (h === 'inspection_date') newRow.push(payload.inspection_date || now);
      
      else if (h === 'status') newRow.push(payload.status || 'done');
      else if (h === 'uploaded_at') newRow.push(now);
      
      // Map static elements from master_data
      else if (mdRowData) {
        if (h === 'material_name') newRow.push(mdRowData[1]); // material_name
        else if (h === 'item_description') newRow.push(mdRowData[2]); // material_description
        else if (h === 'uom') newRow.push(mdRowData[3]); // uom
        else if (h === 'suppliers') newRow.push(mdRowData[4]); // supplier
        else if (h === 'supplier_pengirim') newRow.push(mdRowData[5]); // supplier_name
        else if (h === 'style') newRow.push(mdRowData[8]); // product_code
        else if (h === 'shoe_model') newRow.push(mdRowData[9]); // model_name
        else if (h === 'bucket') newRow.push(mdRowData[10]); // bucket
        else if (h === 'receive_date') newRow.push(mdRowData[11]); // receive_date
        else newRow.push('');
      }
      else {
        newRow.push('');
      }
    });

    sheet.appendRow(newRow);

    // Update status in master_data
    updateMasterDataStatus(ss, payload.po_number, payload.status || 'done');

    return { status: 'ok', inspection_id: inspectionId, message: 'Data inspeksi berhasil disimpan.' };

  } finally {
    lock.releaseLock();
  }
}

function updateMasterDataStatus(ss, poNumber, newStatus) {
  var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) return;

  var data    = sheet.getDataRange().getValues();
  // status is Col S (index 18)
  // po_number is Col M (index 12)
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][12]).trim() === String(poNumber).trim()) {
      sheet.getRange(i + 1, 19).setValue(newStatus);
      break;
    }
  }
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
    
    // Map existing POs (Column M is index 12)
    // Row 2 is index 1 in data array
    for (var i = 1; i < data.length; i++) {
      var poKey = String(data[i][12]).trim();
      if (poKey) {
        existingMap[poKey] = true;
      }
    }

    var now        = new Date().toISOString();
    var uploaded   = payload.uploader_nik || 'admin';
    var insertRows = [];
    var rejectedPOs = [];

    rows.forEach(function(row) {
      // Maps keys from the uploaded ADF Layout Excel template exactly
      var po = String(row['PO Number'] || row['po_number'] || '').trim();
      if (!po) return;

      var matName = row['Material Name'] || row['material_name'] || '';
      var matDesc = row['Material Description'] || row['item_description'] || '';
      var uom = row['UOM'] || row['uom'] || '';
      var supplier = row['Supplier'] || row['suppliers'] || '';
      var supplierName = row['Supplier Name'] || row['supplier_pengirim'] || '';
      var batchSize = Number(row['Batch Size'] || row['qty_receive'] || 0);
      var productCode = row['Product Code'] || row['style'] || '';
      var modelName = row['Model Name'] || row['shoe_model'] || '';
      var bucket = row['Bucket'] || row['bucket'] || '';
      var receiveDate = row['Receive Date'] || row['receive_date'] || '';
      var shipment = row['Shipment Number'] || row['shipment_number'] || '';
      var noBc = row['No BC'] || row['no_bc'] || '';
      var bcType = row['BC Type'] || row['bc_type'] || '';
      var receiveNum = row['Receive Number'] || row['receive_number'] || '';
      var poArea = row['PO Area'] || row['po_area'] || '';
      var matType = row['Material Type'] || row['material_type'] || '';

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

      if (existingMap[po]) {
        rejectedPOs.push(po);
      } else {
        existingMap[po] = true;
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
      message: `Upload selesai: ${insertRows.length} baru, ${rejectedPOs.length} duplikat ditolak.`,
      inserted: insertRows.length,
      rejected: rejectedPOs,
    };

  } finally {
    lock.releaseLock();
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

    var data    = mdSheet.getDataRange().getValues();
    var now = new Date().toISOString();
    var adminNik = payload.admin_nik || 'admin';
    var count = 0;
    var newInspRows = [];

    // Filter by specific PO numbers if provided
    var targetPOs = null;
    if (payload.po_numbers && Array.isArray(payload.po_numbers)) {
      targetPOs = {};
      payload.po_numbers.forEach(function(po) {
        targetPOs[String(po).trim()] = true;
      });
    }

    for (var i = 1; i < data.length; i++) {
      var status = String(data[i][18] || '').toLowerCase(); // status is Col S (index 18)
      if (status !== 'pending') continue;

      var po  = String(data[i][12]).trim(); // po_number is Col M (index 12)
      if (targetPOs && !targetPOs[po]) continue;

      var qty = Number(data[i][7]) || 0; // batch_size is Col H (index 7)

      var newRow = [];
      var uniqueId = 'INSP-BATCH-' + Date.now() + '-' + i;
      
      INSPECTION_HEADERS.forEach(function(h) {
        if (h === 'no') {
          newRow.push(inspSheet.getLastRow() + newInspRows.length - 1);
        }
        else if (h === 'inspection_id') newRow.push(uniqueId);
        else if (h === 'po_no') newRow.push(po);
        else if (h === 'inspector_nik') newRow.push(adminNik);
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

      mdSheet.getRange(i + 1, 19).setValue('done');
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
      'status', 'uploaded_by', 'uploaded_at'
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
    var uHeaders = ['nik', 'password', 'name', 'role', 'created_at'];
    uSheet.getRange(1, 1, 1, uHeaders.length).setValues([uHeaders]);
    uSheet.getRange(1, 1, 1, uHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
    
    var now = new Date().toISOString();
    uSheet.appendRow(['admin', 'admin123', 'Admin Material', 'admin', now]);
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
        existingRowIdx = i + 1;
        break;
      }
    }

    var now = new Date().toISOString();

    if (existingRowIdx >= 0) {
      sheet.getRange(existingRowIdx, nameCol + 1).setValue(name);
      sheet.getRange(existingRowIdx, roleCol + 1).setValue(role);
      if (password) {
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
