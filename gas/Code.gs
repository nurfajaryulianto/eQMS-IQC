// ============================================================
// Google Apps Script: IQC Subcont Evidence Micro-Uploader
// Dedicated Service untuk menyimpan foto evidence ke Google Drive
// Database & Inspection Logs dikelola 100% oleh Supabase
// ============================================================

var SUBCONT_EVIDENCE_FOLDER_ID = '1JmRr8r8Fff4vazLexCzMVa_A9EfowHZO'; // Folder GDrive IQC Subcont Evidence

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

    var folder = DriveApp.getFolderById(SUBCONT_EVIDENCE_FOLDER_ID);
    var fileBlob = Utilities.newBlob(
      Utilities.base64Decode(payload.file_data),
      payload.file_type || 'image/png',
      payload.file_name
    );
    
    var driveFile = folder.createFile(fileBlob);
    driveFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);

    var fileId = driveFile.getId();
    var webViewUrl = driveFile.getUrl();

    return jsonResponse({
      status: 'ok',
      fileId: fileId,
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
    service: 'eQMS IQC Subcont Evidence Uploader',
    timestamp: new Date().toISOString()
  });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
