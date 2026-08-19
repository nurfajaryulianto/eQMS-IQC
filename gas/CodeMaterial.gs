// ============================================================
// Google Apps Script: IQC Material Evidence & Bonding Micro-Uploader
// Dedicated Service untuk menyimpan foto evidence & dokumen bonding ke Google Drive
// Database & Master Data dikelola 100% oleh Supabase
// ============================================================

var FOLDER_EVIDENCE_ID = '1x0WcZZFSIS5kzhBA77ZipNXUz9gqNk4Z'; // Folder GDrive IQC Material Evidence (Defect/Foto)
var FOLDER_BONDING_ID  = '1lhPvUruD6FdOWpxQma1L2y0cmT2uQI2p'; // Folder GDrive IQC Material Bonding Test

function doPost(e) {
  try {
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ status: 'error', message: 'Invalid JSON payload: ' + parseErr.message });
    }

    if (!payload.file_data || !payload.file_name) {
      return jsonResponse({ status: 'error', message: 'File data atau nama file kosong.' });
    }

    // Tentukan kategori & folder tujuan (Evidence vs Bonding Test)
    var isBonding = (payload.category === 'bonding' || 
                     payload.file_category === 'bonding' || 
                     String(payload.inspection_type || '').toLowerCase().indexOf('bonding') !== -1);

    var targetFolderId = isBonding ? FOLDER_BONDING_ID : FOLDER_EVIDENCE_ID;
    var folder = DriveApp.getFolderById(targetFolderId);

    // Format penamaan file terstruktur: [PREFIX]_[PO]_[MATERIAL]_[TIMESTAMP].[ext]
    var prefix   = isBonding ? 'BONDING' : 'DEFECT';
    var cleanPo  = String(payload.po_number || 'NO-PO').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    var cleanMat = String(payload.material_name || 'MAT').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    var dateStr  = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");

    var originalName = payload.file_name || 'file.png';
    var ext = originalName.indexOf('.') !== -1 ? originalName.substring(originalName.lastIndexOf('.')) : '.png';
    var structuredFileName = prefix + '_' + cleanPo + '_' + cleanMat + '_' + dateStr + ext;

    var fileBlob = Utilities.newBlob(
      Utilities.base64Decode(payload.file_data),
      payload.file_type || 'image/png',
      structuredFileName
    );
    
    var driveFile = folder.createFile(fileBlob);
    driveFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);

    var fileId = driveFile.getId();
    var webViewUrl = driveFile.getUrl();

    return jsonResponse({
      status: 'ok',
      fileId: fileId,
      category: isBonding ? 'bonding' : 'evidence',
      fileName: structuredFileName,
      evidenceUrl: webViewUrl,
      directUrl: 'https://lh3.googleusercontent.com/d/' + fileId
    });
  } catch (err) {
    return jsonResponse({ status: 'error', message: 'Gagal upload file ke Google Drive: ' + err.message });
  }
}

function doGet() {
  return jsonResponse({
    status: 'ok',
    service: 'eQMS IQC Material Evidence & Bonding Uploader',
    timestamp: new Date().toISOString()
  });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
