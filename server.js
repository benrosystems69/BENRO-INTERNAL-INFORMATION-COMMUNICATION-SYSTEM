

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = DriveApp.getFolderById("1VD0J4AdgBlE2_ToylOtCgqlCuLX49v9t"); // Google Drive folder for files

    let fileUrls = [];
    if (data.files) {
      data.files.forEach(f => {
        const blob = Utilities.newBlob(Utilities.base64Decode(f.content), "application/octet-stream", f.name);
        const file = folder.createFile(blob);
        fileUrls.push(file.getUrl());
      });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
    sheet.appendRow([
      data.client, data.gender, data.typeOfDocument, data.document,
      data.dateReceivedOD, data.dateRoutedPenro, data.dateReleasedPenro,
      data.division, data.dateReleased, data.receivedBy,
      fileUrls.join(", ")
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", fileUrls }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.message }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}