// ============================================================
// CodeMaterial.gs — GAS Backend untuk IQC Material App
// Deploy sebagai Web App (akses: Anyone) lalu salin URL ke form.js
// ============================================================

// ─── AUTH CONFIG ──────────────────────────────────────────────
var SUPABASE_URL_AUTH = 'https://mymzszufrwmpkpmmlnnc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bXpzenVmcndtcGtwbW1sbm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzgwODksImV4cCI6MjA5Mjg1NDA4OX0.gGu3xJ0yjUmLncz277gGSP8qiV8TiBrlJvg3C-t6ZJw'; // jangan hardcode service_role key di sini

// Peta: action mana boleh diakses role apa
var ACTION_ROLES = {
  // Read-only, semua role login boleh
  getMasterData: ['admin','supervisor','manager','inspector'],
  getInspectionData: ['admin','supervisor','manager','inspector'],
  getUsers: ['admin'],
  getMaterialAssignments: ['admin','supervisor','manager'],
  getClaims: ['admin','supervisor','manager'],
  getStatus: ['admin','supervisor','manager','inspector'],
  ping: ['admin','supervisor','manager','inspector'],
  generateTemplate: ['admin'],

  // Mutating — dibatasi lebih ketat
  submitInspection: ['admin','inspector'],
  bulkUpsertMasterData: ['admin'],
  passAll: ['admin'],
  saveUser: ['admin'],
  deleteUser: ['admin'],
  saveMaterialAssignment: ['admin'],
  deleteMaterialAssignment: ['admin'],
  submitClaim: ['admin','supervisor'],
  resetOrphanedStatus: ['admin'],
  syncMasterDataStatus: ['admin'],
};

/**
 * Memverifikasi access_token Supabase dan mengambil role/module dari user_metadata.
 * Melempar Error jika token tidak valid/kedaluwarsa.
 */
function verifySession(token) {
  if (!token) throw new Error('Unauthorized: token tidak disertakan.');

  var resp = UrlFetchApp.fetch(SUPABASE_URL_AUTH + '/auth/v1/user', {
    method: 'get',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + token
    },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Unauthorized: sesi tidak valid atau sudah kedaluwarsa.');
  }

  var body = JSON.parse(resp.getContentText());
  var meta = body.user_metadata || {};
  return {
    nik: meta.nik || '',
    role: String(meta.role || 'inspector').toLowerCase(),
    module: String(meta.module || meta.app_module || 'both').toLowerCase()
  };
}

/**
 * Memastikan action diizinkan untuk role yang terverifikasi.
 * Melempar Error jika tidak diizinkan.
 */
function authorizeAction(action, token) {
  var allowedRoles = ACTION_ROLES[action];
  if (!allowedRoles) throw new Error('Unauthorized: action tidak dikenali.');

  var session = verifySession(token);
  if (session.module !== 'material' && session.module !== 'both') {
    throw new Error('Unauthorized: akun tidak memiliki akses ke modul Material.');
  }
  if (allowedRoles.indexOf(session.role) === -1) {
    throw new Error('Unauthorized: role "' + session.role + '" tidak diizinkan untuk action ini.');
  }
  return session;
}

// ─── SPREADSHEET CONFIG ──────────────────────────────────────
var SPREADSHEET_ID = '13C5MdJR_WN1A6wUzlRXCPCz6hKRoiR3Mg-0p_lMLblQ';

var SHEET = {
  VENDORS:      'vendors',
  MASTER_DATA:  'master_data',
  INSPECTIONS:  'inspections',
  USERS:        'users',
  SETTINGS:     'settings',
  ASSIGNMENTS:  'material_assignments',
  CLAIMS:       'claims',
};

// Header columns for claims sheet
var CLAIMS_HEADERS = [
  'no', 'claim_date', 'po_number', 'material_name', 'vendor_name', 'material_type',
  'claimed_qty', 'reason', 'ref_number', 'submitted_by', 'original_planned_qty', 'new_planned_qty'
];

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
  var token  = (e && e.parameter && e.parameter.token) ? e.parameter.token : '';
  try {
    authorizeAction(action, token); // ← BARU: validasi sebelum apa pun dieksekusi

    if (action === 'getMasterData')          return jsonResponse(getMasterData(e.parameter));
    if (action === 'getInspectionData')      return jsonResponse(getInspectionData(e.parameter));
    if (action === 'getUsers')               return jsonResponse(getUsers());
    if (action === 'getMaterialAssignments') return jsonResponse(getMaterialAssignments());
    if (action === 'generateTemplate')       return generateTemplate();
    if (action === 'getClaims')              return jsonResponse(getClaims(e.parameter));
    if (action === 'getStatus') {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      return jsonResponse({
        status: 'ok',
        spreadsheetId: SPREADSHEET_ID,
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl()
      });
    }
    if (action === 'ping') return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
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
    authorizeAction(action, payload.token); // ← BARU: validasi sebelum apa pun dieksekusi

    if (action === 'submitInspection')        return jsonResponse(submitInspection(payload));
    if (action === 'bulkUpsertMasterData')    return jsonResponse(bulkUpsertMasterData(payload));
    if (action === 'passAll')                 return jsonResponse(passAll(payload));
    if (action === 'saveUser')                return jsonResponse(saveUser(payload));
    if (action === 'deleteUser')              return jsonResponse(deleteUser(payload));
    if (action === 'saveMaterialAssignment')  return jsonResponse(saveMaterialAssignment(payload));
    if (action === 'deleteMaterialAssignment')return jsonResponse(deleteMaterialAssignment(payload));
    if (action === 'submitClaim')             return jsonResponse(submitClaim(payload));
    if (action === 'resetOrphanedStatus')     return jsonResponse(resetOrphanedStatus());
    if (action === 'syncMasterDataStatus')    return jsonResponse(syncMasterDataStatus());
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}



function getMasterData(params) {
  var statusFilter = (params && params.status) ? params.status.toLowerCase() : 'all';

  // ─── CACHE CHECK ─────────────────────────────────────────
  var cache = CacheService.getScriptCache();
  var cacheKey = 'master_data_v1_' + statusFilter;
  var cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) throw new Error('Sheet "master_data" tidak ditemukan.');

  var data        = sheet.getDataRange().getValues();
  var displayData = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) {
    var emptyResult = { data: [] };
    cache.put(cacheKey, JSON.stringify(emptyResult), 60);
    return emptyResult;
  }

  // DYNAMIC LIVE LOOKUP from "inspections" sheet for single source of truth & per-inspection status
  var inspSheet = ss.getSheetByName(SHEET.INSPECTIONS);
  var inspMap = {};
  if (inspSheet && inspSheet.getLastRow() > 1) {
    var inspData = inspSheet.getDataRange().getValues();
    for (var i = 1; i < inspData.length; i++) {
      var mName = String(inspData[i][1] || '').trim().toLowerCase();
      var pNo = String(inspData[i][7] || '').trim().toLowerCase();
      var rQty = String(Number(inspData[i][8]) || 0).trim();
      var rDate = normalizeDateStr(inspData[i][15]);
      if (!pNo) continue;

      var fullKey = pNo + '___' + rDate + '___' + mName + '___' + rQty;
      var key3    = pNo + '___' + mName + '___' + rQty;
      var key2    = mName ? (pNo + '___' + mName) : pNo;

      var keys = [fullKey, key3, key2];
      keys.forEach(function(k) {
        if (!inspMap[k]) {
          inspMap[k] = {
            checked_qty: 0,
            raw_done: false,
            laminating_done: false,
            bonding_done: false,
            has_any_inspection: true,
            last_status: ''
          };
        }
      });

      var iType = String(inspData[i][27] || '').trim();
      var iStatus = String(inspData[i][18] || '').trim().toLowerCase();
      var okQty = Number(inspData[i][9]) || 0;
      var noQty = Number(inspData[i][10]) || 0;
      var bondingUrl = String(inspData[i][34] || '').trim();

      keys.forEach(function(k) {
        inspMap[k].checked_qty += (okQty + noQty);
        if (iType.indexOf('Raw Material') >= 0 && (iStatus === 'done' || (okQty + noQty) > 0)) {
          if (iStatus === 'done') inspMap[k].raw_done = true;
        }
        if (iType.indexOf('Laminating Material') >= 0) {
          inspMap[k].laminating_done = true;
        }
        if (iType.indexOf('Bonding Test') >= 0 || bondingUrl !== '') {
          inspMap[k].bonding_done = true;
        }
        inspMap[k].last_status = iStatus;
      });
    }
  }

  var result = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var disp = displayData[r];

    var poVal = String(row[12] || '').trim();
    if (!poVal) continue;

    var matNameVal = String(row[1] || '').trim().toLowerCase();
    var plannedQty = Number(row[7]) || 0;
    var poKey      = poVal.toLowerCase();
    var rDateVal   = normalizeDateStr(row[11]);
    var qtyKeyStr  = String(plannedQty).trim();

    var fullKey = poKey + '___' + rDateVal + '___' + matNameVal + '___' + qtyKeyStr;
    var key3    = poKey + '___' + matNameVal + '___' + qtyKeyStr;
    var key2    = poKey + '___' + matNameVal;

    var inspInfo = inspMap[fullKey] || inspMap[key3] || inspMap[key2];

    var checkedQty = inspInfo ? inspInfo.checked_qty : 0;
    var rawDone = inspInfo ? (inspInfo.raw_done || (checkedQty >= plannedQty && plannedQty > 0)) : false;
    var lamDone = inspInfo ? inspInfo.laminating_done : false;
    var bondDone = inspInfo ? inspInfo.bonding_done : false;

    var dynamicStatus = 'pending';
    if (!inspInfo) {
      dynamicStatus = 'pending';
    } else if (rawDone || checkedQty >= plannedQty) {
      dynamicStatus = 'done';
    } else if (checkedQty > 0 || inspInfo.has_any_inspection) {
      dynamicStatus = 'in-progress';
    }

    // NOTE: Self-healing write-back DIHAPUS dari sini.
    // Gunakan action 'syncMasterDataStatus' terpisah untuk itu (lihat fungsi baru di bawah).

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
      row_idx:          r + 1,
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
      bonding_done:     bondDone,
      material_type:    String(row[17] || '').trim()
    });
  }

  var finalResult = { data: result, total: result.length };

  // ─── SAVE TO CACHE (60 detik) ──────────────────────────────
  try {
    var payload = JSON.stringify(finalResult);
    // CacheService punya limit 100KB per key; kalau kelewat, skip caching daripada error
    if (payload.length < 95000) {
      cache.put(cacheKey, payload, 60);
    }
  } catch (e) {
    // Cache put gagal (misal payload kebesaran) — tidak masalah, lanjut tanpa cache
  }

  return finalResult;
}

// ─── RESET ORPHANED STATUS ────────────────────────────────────
// Memaksa sinkronisasi: setiap baris di master_data yang ber-status
// 'done' tapi TIDAK memiliki baris inspeksi yang sesuai di sheet
// 'inspections' akan direset ke 'pending' seketika.
function resetOrphanedStatus() {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    var mdSheet   = ss.getSheetByName(SHEET.MASTER_DATA);
    var inspSheet = ss.getSheetByName(SHEET.INSPECTIONS);
    if (!mdSheet) throw new Error('Sheet master_data tidak ditemukan.');

    var mdData = mdSheet.getDataRange().getValues();
    if (mdData.length < 2) return { status: 'ok', message: 'Tidak ada data di master_data.', reset_count: 0 };

    // Build inspMap from inspections sheet (same composite key as getMasterData)
    var inspMap = {};
    if (inspSheet && inspSheet.getLastRow() > 1) {
      var inspData = inspSheet.getDataRange().getValues();
      for (var i = 1; i < inspData.length; i++) {
        var mName = String(inspData[i][1] || '').trim().toLowerCase();
        var pNo   = String(inspData[i][7] || '').trim().toLowerCase();
        var rQty  = String(Number(inspData[i][8]) || 0).trim();
        var rDate = normalizeDateStr(inspData[i][15]);
        if (!pNo) continue;

        var fullKey = pNo + '___' + rDate + '___' + mName + '___' + rQty;
        var key3    = pNo + '___' + mName + '___' + rQty;
        var key2    = mName ? (pNo + '___' + mName) : pNo;
        inspMap[fullKey] = true;
        inspMap[key3]    = true;
        inspMap[key2]    = true;
      }
    }

    var resetCount = 0;
    var updated    = false;
    var numCols    = Math.max(mdData[0].length, 22);

    for (var r = 1; r < mdData.length; r++) {
      var row        = mdData[r];
      var poVal      = String(row[12] || '').trim();
      if (!poVal) continue;

      var currentStatus = String(row[18] || '').trim().toLowerCase();
      if (currentStatus !== 'done') continue; // only care about rows stuck as 'done'

      var matName   = String(row[1] || '').trim().toLowerCase();
      var poKey     = poVal.toLowerCase();
      var planned   = Number(row[7]) || 0;
      var rDateVal  = normalizeDateStr(row[11]);
      var qtyStr    = String(planned).trim();

      var fKey = poKey + '___' + rDateVal + '___' + matName + '___' + qtyStr;
      var k3   = poKey + '___' + matName + '___' + qtyStr;
      var k2   = poKey + '___' + matName;

      var hasInspection = !!(inspMap[fKey] || inspMap[k3] || inspMap[k2]);
      if (!hasInspection) {
        // No matching inspection row -> reset status to 'pending'
        while (row.length < numCols) row.push('');
        row[18] = 'pending';
        row[21] = '';        // clear checked_qty
        resetCount++;
        updated = true;
      }
    }

    if (updated) {
      // Pad all rows to same column count before bulk write
      for (var p = 0; p < mdData.length; p++) {
        while (mdData[p].length < numCols) mdData[p].push('');
      }
      mdSheet.getRange(1, 1, mdData.length, numCols).setValues(mdData);

      // BARU: invalidasi cache karena master_data berubah
      CacheService.getScriptCache().removeAll(['master_data_v1_all', 'master_data_v1_pending', 'master_data_v1_in-progress', 'master_data_v1_done']);
    }

    return {
      status: 'ok',
      message: resetCount > 0
        ? resetCount + ' baris direset ke "pending" karena tidak ada data inspeksi yang sesuai.'
        : 'Semua data sudah sinkron — tidak ada baris yang perlu direset.',
      reset_count: resetCount
    };
  } finally {
    lock.releaseLock();
  }
}

// ─── SYNC MASTER DATA STATUS (Manual Trigger) ──────────────────
// Menjalankan proses self-healing yang dulu berjalan otomatis di getMasterData.
// Sekarang dipanggil manual lewat tombol "Sync Status" di UI.
function syncMasterDataStatus() {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
    if (!sheet) throw new Error('Sheet "master_data" tidak ditemukan.');

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { status: 'ok', message: 'Tidak ada data.', updated_count: 0 };

    var inspSheet = ss.getSheetByName(SHEET.INSPECTIONS);
    var inspMap = {};
    if (inspSheet && inspSheet.getLastRow() > 1) {
      var inspData = inspSheet.getDataRange().getValues();
      for (var i = 1; i < inspData.length; i++) {
        var mName = String(inspData[i][1] || '').trim().toLowerCase();
        var pNo = String(inspData[i][7] || '').trim().toLowerCase();
        var rQty = String(Number(inspData[i][8]) || 0).trim();
        var rDate = normalizeDateStr(inspData[i][15]);
        if (!pNo) continue;

        var fullKey = pNo + '___' + rDate + '___' + mName + '___' + rQty;
        var key3    = pNo + '___' + mName + '___' + rQty;
        var key2    = mName ? (pNo + '___' + mName) : pNo;

        var keys = [fullKey, key3, key2];
        keys.forEach(function(k) {
          if (!inspMap[k]) {
            inspMap[k] = { checked_qty: 0, raw_done: false, has_any_inspection: true };
          }
        });

        var iType = String(inspData[i][27] || '').trim();
        var iStatus = String(inspData[i][18] || '').trim().toLowerCase();
        var okQty = Number(inspData[i][9]) || 0;
        var noQty = Number(inspData[i][10]) || 0;

        keys.forEach(function(k) {
          inspMap[k].checked_qty += (okQty + noQty);
          if (iType.indexOf('Raw Material') >= 0 && iStatus === 'done') {
            inspMap[k].raw_done = true;
          }
        });
      }
    }

    var numCols = Math.max(data[0].length, 22);
    var updatedCount = 0;
    var mdUpdated = false;

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      while (row.length < numCols) row.push('');

      var poVal = String(row[12] || '').trim();
      if (!poVal) continue;

      var matNameVal = String(row[1] || '').trim().toLowerCase();
      var plannedQty = Number(row[7]) || 0;
      var poKey      = poVal.toLowerCase();
      var rDateVal   = normalizeDateStr(row[11]);
      var qtyKeyStr  = String(plannedQty).trim();

      var fullKey = poKey + '___' + rDateVal + '___' + matNameVal + '___' + qtyKeyStr;
      var key3    = poKey + '___' + matNameVal + '___' + qtyKeyStr;
      var key2    = poKey + '___' + matNameVal;

      var inspInfo = inspMap[fullKey] || inspMap[key3] || inspMap[key2];
      var checkedQty = inspInfo ? inspInfo.checked_qty : 0;
      var rawDone = inspInfo ? (inspInfo.raw_done || (checkedQty >= plannedQty && plannedQty > 0)) : false;

      var dynamicStatus = 'pending';
      if (!inspInfo) {
        dynamicStatus = 'pending';
      } else if (rawDone || checkedQty >= plannedQty) {
        dynamicStatus = 'done';
      } else if (checkedQty > 0 || inspInfo.has_any_inspection) {
        dynamicStatus = 'in-progress';
      }

      var currentStoredStatus = String(row[18] || '').trim().toLowerCase();
      var currentStoredQty = row[21] === '' ? 0 : (Number(row[21]) || 0);
      var expectedStoredQty = (dynamicStatus === 'done' || dynamicStatus === 'pending') ? '' : checkedQty;

      if (currentStoredStatus !== dynamicStatus || String(currentStoredQty) !== String(expectedStoredQty)) {
        row[18] = dynamicStatus;
        row[21] = expectedStoredQty;
        mdUpdated = true;
        updatedCount++;
      }
    }

    if (mdUpdated) {
      sheet.getRange(1, 1, data.length, numCols).setValues(data);
      // Invalidate cache karena data sudah berubah
      var cache = CacheService.getScriptCache();
      cache.removeAll(['master_data_v1_all', 'master_data_v1_pending', 'master_data_v1_in-progress', 'master_data_v1_done']);
    }

    return {
      status: 'ok',
      message: updatedCount > 0
        ? updatedCount + ' baris berhasil disinkronkan.'
        : 'Semua data sudah sinkron — tidak ada baris yang perlu diupdate.',
      updated_count: updatedCount
    };
  } finally {
    lock.releaseLock();
  }
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
    
    // Map existing POs + Receive Date + Material Name + Receive Number (GRN) + Batch Size (Col H / index 7) to allow multiple distinct items
    for (var i = 1; i < data.length; i++) {
      var poKey = String(data[i][12] || '').trim();
      var dateKey = normalizeDateStr(data[i][11]);
      var matKey = String(data[i][1] || '').trim();
      var recNumKey = String(data[i][16] || '').trim();
      var qtyKey = String(Number(data[i][7]) || 0).trim();
      if (poKey) {
        var fullKey = (poKey + '___' + dateKey + '___' + matKey + '___' + recNumKey + '___' + qtyKey).toLowerCase();
        existingMap[fullKey] = true;
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

      var dupKey = (po + '___' + normalizeDateStr(receiveDate) + '___' + matName + '___' + receiveNum + '___' + batchSize).toLowerCase();

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
        rejectedPOs.push(po + ' (' + matName + ' Qty: ' + batchSize + ' - Tgl: ' + (receiveDate || 'N/A') + ')');
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

    CacheService.getScriptCache().removeAll(['master_data_v1_all', 'master_data_v1_pending', 'master_data_v1_in-progress', 'master_data_v1_done']);

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
  if (data.length < 2) return { data: [] }; // 1 header row

  var rows    = data.slice(1);

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

    // Find PO & Material in master_data (using MASTER_DATA_HEADERS layout)
    var mdSheet = ss.getSheetByName(SHEET.MASTER_DATA);
    var mdRowData = null;
    if (mdSheet) {
      var mdData = mdSheet.getDataRange().getValues();
      var targetPo = String(payload.po_number || '').trim().toLowerCase();
      var targetMat = String(payload.material_name || '').trim().toLowerCase();
      for (var i = 1; i < mdData.length; i++) {
        var rowPo = String(mdData[i][12] || '').trim().toLowerCase();
        var rowMat = String(mdData[i][1] || '').trim().toLowerCase();
        if (rowPo === targetPo && (!targetMat || rowMat === targetMat)) {
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

    // STRICT SINGLE-ROW PER PO & MATERIAL MECHANISM:
    // Check if a row for this PO & Material already exists in sheet "inspections"
    var targetPO = String(payload.po_number || '').trim().toLowerCase();
    var targetMat = String(payload.material_name || '').trim().toLowerCase();
    var existingRowIndex = -1;
    var existingRowValues = null;

    if (targetPO && sheet.getLastRow() > 1) {
      var allRows = sheet.getDataRange().getValues();
      for (var r = 1; r < allRows.length; r++) {
        var rowPO = String(allRows[r][7] || '').trim().toLowerCase();   // Index 7 is po_no
        var rowMat = String(allRows[r][1] || '').trim().toLowerCase();  // Index 1 is material_name
        if (rowPO === targetPO && (!targetMat || rowMat === targetMat)) {
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
      updateMasterDataStatus(ss, payload.po_number, payload.material_name, payload.status || 'done', qtyInspected);

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
    updateMasterDataStatus(ss, payload.po_number, payload.material_name, payload.status || 'done', qtyInspected);

    return { status: 'ok', inspection_id: inspectionId, message: 'Data inspeksi berhasil disimpan.' };

  } finally {
    lock.releaseLock();
  }
}

function updateMasterDataStatus(ss, poNumber, materialName, newStatus, qtyInspected) {
  var sheet = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!sheet) return;

  var data      = sheet.getDataRange().getValues();
  var targetPo  = String(poNumber || '').trim().toLowerCase();
  var targetMat = String(materialName || '').trim().toLowerCase();

  // status is Col S (index 18), checked_qty is Col V (index 21)
  // po_number is Col M (index 12), material_name is Col B (index 1)
  for (var i = 1; i < data.length; i++) {
    var rowPo  = String(data[i][12] || '').trim().toLowerCase();
    var rowMat = String(data[i][1] || '').trim().toLowerCase();
    if (rowPo === targetPo && (!targetMat || rowMat === targetMat)) {
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
    if (data.length < 2) return { status: 'ok', message: 'Tidak ada data.', count: 0 };

    // Normalize data grid to ensure all rows have at least 22 columns (Col V is index 21)
    var numCols = Math.max(data[0].length, 22);
    for (var r = 0; r < data.length; r++) {
      while (data[r].length < numCols) {
        data[r].push('');
      }
    }

    var now   = new Date().toISOString();
    var adminNik  = payload.admin_nik || 'admin';
    var adminName = payload.admin_name || 'Admin Material';
    var count = 0;
    var newInspRows = [];
    var existingInspUpdated = false;

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

    // Filter by specific row indexes if provided (allows unique matching for duplicate PO rows)
    var targetRowIndexes = null;
    if (payload.row_indexes && Array.isArray(payload.row_indexes)) {
      targetRowIndexes = {};
      payload.row_indexes.forEach(function(idx) {
        targetRowIndexes[Number(idx)] = true;
      });
    }

    // Filter by specific PO numbers if provided (fallback for backward compatibility)
    var targetPOsMap = null;
    if (!targetRowIndexes && payload.po_numbers && Array.isArray(payload.po_numbers)) {
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

    // Index existing inspection rows by PO + Material Name + Qty + Date (composite keys matching getMasterData)
    var inspMapByItem = {};
    var existingInspData = inspSheet.getLastRow() > 1 ? inspSheet.getDataRange().getValues() : [];
    for (var r = 1; r < existingInspData.length; r++) {
      var mName = String(existingInspData[r][1] || '').trim().toLowerCase(); // Col B (index 1) is material_name
      var pNo   = String(existingInspData[r][7] || '').trim().toLowerCase(); // Col H (index 7) is po_no
      var rQty  = String(Number(existingInspData[r][8]) || 0).trim();         // Col I (index 8) is qty_receive
      var rDate = normalizeDateStr(existingInspData[r][15]);                 // Col P (index 15) is receive_date
      if (!pNo) continue;

      var fullKey = pNo + '___' + rDate + '___' + mName + '___' + rQty;
      var key3    = pNo + '___' + mName + '___' + rQty;
      var key2    = mName ? (pNo + '___' + mName) : pNo;

      inspMapByItem[fullKey] = r + 1;
      inspMapByItem[key3]    = r + 1;
      inspMapByItem[key2]    = r + 1;
    }

    var baseInspLastRow = inspSheet.getLastRow();

    for (var i = 1; i < data.length; i++) {
      var rowIdx = i + 1; // 1-based row index in Sheet

      var poRaw = String(data[i][12] || '').trim(); // po_number is Col M (index 12)
      if (!poRaw) continue;

      var poLower = poRaw.toLowerCase();

      // Check if this row is selected (by row index first, fallback to PO string matching)
      var isMatched = false;
      if (targetRowIndexes) {
        if (targetRowIndexes[rowIdx]) {
          isMatched = true;
        }
      } else if (!targetPOsMap) {
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

      var qty        = Number(data[i][7]) || 0;                      // batch_size is Col H (index 7)
      var matType    = String(data[i][17] || '').trim().toLowerCase(); // material_type is Col R (index 17)
      var matName    = String(data[i][1] || '').trim().toLowerCase();  // material_name is Col B (index 1)
      var rDateVal   = normalizeDateStr(data[i][11]);                 // receive_date is Col L (index 11)
      var qtyKeyStr  = String(qty).trim();

      var itemFullKey = poLower + '___' + rDateVal + '___' + matName + '___' + qtyKeyStr;
      var itemKey3    = poLower + '___' + matName + '___' + qtyKeyStr;
      var itemKey2    = poLower + '___' + matName;

      var foundList = assignMap[matType] || assignMap[matName] || [];
      var assignedInspectorName = (Array.isArray(foundList) && foundList.length > 0) ? foundList.join(', ') : adminName;

      // Check if matching inspection row exists for this specific item
      var existingRowIdx = inspMapByItem[itemFullKey] || inspMapByItem[itemKey3] || inspMapByItem[itemKey2] || -1;

      // Check actual dynamic status based on inspections sheet
      var actualInspStatus = '';
      var okQty = 0;
      var noQty = 0;
      var iType = '';
      if (existingRowIdx > 1 && existingInspData[existingRowIdx - 1]) {
        var existingRow = existingInspData[existingRowIdx - 1];
        actualInspStatus = String(existingRow[18] || '').trim().toLowerCase();
        okQty = Number(existingRow[9]) || 0;
        noQty = Number(existingRow[10]) || 0;
        iType = String(existingRow[27] || '').trim();
      }

      var checkedQty = okQty + noQty;
      var rawDone = (iType.indexOf('Raw Material') >= 0 && (actualInspStatus === 'done' || (checkedQty >= qty && qty > 0)));
      var isDynamicallyDone = (rawDone || actualInspStatus === 'done');

      // Skip if dynamically done (already completed in inspections sheet)
      if (isDynamicallyDone) {
        continue;
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

        // Also update inspection_type to contain 'Raw Material'
        var curType = String(existingRow[27] || '').trim();
        if (!curType.includes('Raw Material')) {
          existingRow[27] = curType ? ('Raw Material, ' + curType) : 'Raw Material';
        }

        existingInspUpdated = true;
      } else {
        var newRow = [];
        var uniqueId = 'INSP-BATCH-' + Date.now() + '-' + i;
        
        INSPECTION_HEADERS.forEach(function(h) {
          if (h === 'no') {
            newRow.push(baseInspLastRow + newInspRows.length);
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
          else if (h === 'inspection_type') newRow.push('Raw Material');
          
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

        var newRowIndex = baseInspLastRow + newInspRows.length;
        inspMapByItem[itemFullKey] = newRowIndex;
        inspMapByItem[itemKey3]    = newRowIndex;
        inspMapByItem[itemKey2]    = newRowIndex;
      }

      // Update in-memory data for master_data sheet (Col S is index 18, Col V is index 21)
      data[i][18] = 'done';
      data[i][21] = ''; // Clear checked_qty
      count++;
    }

    // Single bulk write to master_data sheet for all updated rows (15-50x speed improvement)
    if (count > 0) {
      mdSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }

    // Bulk write updated existing rows back to inspections sheet
    if (existingInspUpdated && existingInspData.length > 0) {
      inspSheet.getRange(1, 1, existingInspData.length, existingInspData[0].length).setValues(existingInspData);
    }

    // Single bulk append for new inspection rows
    if (newInspRows.length > 0) {
      inspSheet.getRange(inspSheet.getLastRow() + 1, 1, newInspRows.length, newInspRows[0].length)
        .setValues(newInspRows);
    }

    CacheService.getScriptCache().removeAll(['master_data_v1_all', 'master_data_v1_pending', 'master_data_v1_in-progress', 'master_data_v1_done']);

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

  // inspections
  var inspSheet = ss.getSheetByName(SHEET.INSPECTIONS) || ss.insertSheet(SHEET.INSPECTIONS);
  if (inspSheet.getLastRow() <= 1) {
    if (inspSheet.getLastRow() > 0) inspSheet.clear();
    inspSheet.getRange(1, 1, 1, INSPECTION_HEADERS.length).setValues([INSPECTION_HEADERS]);
    inspSheet.getRange(1, 1, 1, INSPECTION_HEADERS.length).setFontWeight('bold').setBackground('#10b981').setFontColor('#ffffff');
  }

  // users
  var uSheet = ss.getSheetByName(SHEET.USERS) || ss.insertSheet(SHEET.USERS);
  if (uSheet.getLastRow() === 0) {
    var uHeaders = ['nik', 'name', 'role', 'material_assignment', 'created_at'];
    uSheet.getRange(1, 1, 1, uHeaders.length).setValues([uHeaders]);
    uSheet.getRange(1, 1, 1, uHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
    
    var now = new Date().toISOString();
    uSheet.appendRow(['admin', 'Admin Material', 'admin', '', now]);
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
    var matAssign = String(payload.material_assignment || payload.material_type || '').trim();

    if (!nik || !name || !role) throw new Error('Data tidak lengkap. NIK, Nama, dan Role wajib diisi.');

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.USERS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.USERS);
      // BARU: kolom 'password' dihapus dari header default
      sheet.getRange(1, 1, 1, 5).setValues([['nik', 'name', 'role', 'material_assignment', 'created_at']]);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e2e8f0');
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });

    var assignCol = headers.indexOf('material_assignment');
    if (assignCol < 0) {
      assignCol = headers.length;
      headers.push('material_assignment');
      sheet.getRange(1, assignCol + 1).setValue('material_assignment').setFontWeight('bold');
    }

    var nikCol = headers.indexOf('nik');
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
      return { status: 'ok', message: 'User berhasil diperbarui.' };
    } else {
      var newRow = [];
      headers.forEach(function(h) {
        if (h === 'nik') newRow.push(nik);
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

// ─── CLAIM MECHANISM ──────────────────────────────────────────

/**
 * submitClaim — Kurangi planned_qty di master_data, catat di sheet 'claims'
 * Payload: { row_idx, po_number, material_name, claim_qty, reason, ref_number, submitted_by }
 */
function submitClaim(payload) {
  var rowIdx      = payload.row_idx ? Number(payload.row_idx) : null;
  var poNumber    = String(payload.po_number || '').trim();
  var materialName= String(payload.material_name || '').trim().toLowerCase();
  var claimQty    = Number(payload.claim_qty);
  var reason      = String(payload.reason || '').trim();
  var refNumber   = String(payload.ref_number || '').trim();
  var submittedBy = String(payload.submitted_by || 'admin').trim();

  if (!poNumber && !rowIdx) throw new Error('PO number atau row_idx tidak boleh kosong.');
  if (!claimQty || claimQty <= 0) throw new Error('Qty klaim harus lebih dari 0.');
  if (!reason) throw new Error('Alasan klaim tidak boleh kosong.');

  var ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  var mdSheet   = ss.getSheetByName(SHEET.MASTER_DATA);
  if (!mdSheet) throw new Error('Sheet master_data tidak ditemukan.');

  var data    = mdSheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var poCol       = headers.indexOf('po_number') >= 0 ? headers.indexOf('po_number') : 12;
  var plannedCol  = headers.indexOf('planned_qty') >= 0 ? headers.indexOf('planned_qty') : 7;
  var matNameCol  = headers.indexOf('material_name') >= 0 ? headers.indexOf('material_name') : 1;
  var vendorCol   = headers.indexOf('supplier_name') >= 0 ? headers.indexOf('supplier_name') : 5;
  var matTypeCol  = headers.indexOf('material_type') >= 0 ? headers.indexOf('material_type') : 17;

  var targetRowIdx = -1;
  var originalPlannedQty = 0;
  var materialNameActual = '';
  var vendorName = '';
  var materialType = '';

  // PRIORITAS 1: cari via row_idx (paling presisi — row_idx = r+1 dari getMasterData)
  if (rowIdx && data[rowIdx - 1]) {
    var candidate = data[rowIdx - 1];
    var candidatePo = String(candidate[poCol] || '').trim();
    // Verifikasi PO cocok, untuk jaga-jaga kalau sheet berubah antara load & submit
    if (candidatePo.toLowerCase() === poNumber.toLowerCase()) {
      targetRowIdx = rowIdx - 1;
      originalPlannedQty = Number(candidate[plannedCol]) || 0;
      materialNameActual = String(candidate[matNameCol] || '').trim();
      vendorName   = String(candidate[vendorCol] || '').trim();
      materialType = String(candidate[matTypeCol] || '').trim();
    }
  }

  // FALLBACK: cari via po_number + material_name (kompatibilitas lama)
  if (targetRowIdx < 0) {
    for (var r = 1; r < data.length; r++) {
      var rowPo = String(data[r][poCol] || '').trim();
      var rowMat = String(data[r][matNameCol] || '').trim().toLowerCase();
      if (rowPo.toLowerCase() === poNumber.toLowerCase() && (!materialName || rowMat === materialName)) {
        targetRowIdx = r;
        originalPlannedQty = Number(data[r][plannedCol]) || 0;
        materialNameActual = String(data[r][matNameCol] || '').trim();
        vendorName   = String(data[r][vendorCol] || '').trim();
        materialType = String(data[r][matTypeCol] || '').trim();
        break;
      }
    }
  }

  if (targetRowIdx < 0) throw new Error('Data material untuk PO "' + poNumber + '" tidak ditemukan atau tidak cocok lagi — silakan refresh data dan coba lagi.');
  if (claimQty >= originalPlannedQty) throw new Error('Qty klaim (' + claimQty + ') tidak boleh melebihi atau sama dengan planned qty (' + originalPlannedQty + ').');

  var newPlannedQty = originalPlannedQty - claimQty;
  mdSheet.getRange(targetRowIdx + 1, plannedCol + 1).setValue(newPlannedQty);

  var claimSheet = ss.getSheetByName(SHEET.CLAIMS);
  if (!claimSheet) {
    claimSheet = ss.insertSheet(SHEET.CLAIMS);
    claimSheet.getRange(1, 1, 1, CLAIMS_HEADERS.length).setValues([CLAIMS_HEADERS]);
    claimSheet.getRange(1, 1, 1, CLAIMS_HEADERS.length).setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff');
  }

  var lastRow   = claimSheet.getLastRow();
  var nextNo    = lastRow;
  var claimDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  claimSheet.appendRow([
    nextNo, claimDate, poNumber, materialNameActual, vendorName, materialType,
    claimQty, reason, refNumber, submittedBy, originalPlannedQty, newPlannedQty
  ]);

  // Invalidasi cache karena master_data berubah
  CacheService.getScriptCache().removeAll(['master_data_v1_all', 'master_data_v1_pending', 'master_data_v1_in-progress', 'master_data_v1_done']);

  return {
    success: true,
    po_number: poNumber,
    material_name: materialNameActual,
    original_planned_qty: originalPlannedQty,
    claimed_qty: claimQty,
    new_planned_qty: newPlannedQty,
    message: 'Klaim berhasil untuk ' + materialNameActual + '. Planned Qty diperbarui dari ' + originalPlannedQty + ' menjadi ' + newPlannedQty + '.'
  };
}

/**
 * getClaims — Ambil riwayat klaim dari sheet 'claims'
 * Params: { po_number (optional filter) }
 */
function getClaims(params) {
  var poFilter = params && params.po_number ? String(params.po_number).trim().toLowerCase() : '';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var claimSheet = ss.getSheetByName(SHEET.CLAIMS);
  if (!claimSheet || claimSheet.getLastRow() < 2) return { data: [], total: 0 };

  var data    = claimSheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var result = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    if (poFilter && String(obj.po_number || '').toLowerCase() !== poFilter) continue;
    result.push(obj);
  }

  // Sort by claim_date descending (newest first)
  result.reverse();

  return { data: result, total: result.length };
}
