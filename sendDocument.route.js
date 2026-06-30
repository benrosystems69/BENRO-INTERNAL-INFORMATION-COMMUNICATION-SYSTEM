require("dotenv").config();
const express = require("express");
const multer = require("multer");
const sql = require("mssql");
const { BlobServiceClient } = require("@azure/storage-blob");

const router = express.Router();

// Multer setup for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Azure Blob setup
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.BLOB_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.BLOB_CONTAINER_NAME);

// Azure SQL configuration
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: false },
};

// Utility: Format date for SQL as string
function formatDate(input) {
  if (!input) return null;
  const d = new Date(input);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// Route: Receive form + files
router.post("/sendDocument", upload.array("files"), async (req, res) => {
  try {
    const {
      client, gender, typeOfDocument, documentName,
      dateReceivedOD, dateRoutedPenro, dateReleasedPenro,
      division, dateReleased, personnel
    } = req.body;

    // --- Upload files to Azure Blob
    const fileNames = [];
    for (const file of req.files || []) {
      const blobClient = containerClient.getBlockBlobClient(file.originalname);
      await blobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype }
      });
      fileNames.push(file.originalname);
    }

    // --- Insert data into Azure SQL
    await sql.connect(dbConfig);
    const request = new sql.Request();

    request.input("Client", sql.VarChar, client);
    request.input("Gender", sql.VarChar, gender);
    request.input("TypeOfDocument", sql.VarChar, typeOfDocument);
    request.input("Documentss", sql.VarChar, documentName);
    request.input("DateReceivedOD", sql.VarChar, formatDate(dateReceivedOD));
    request.input("DateRoutedToPENRO", sql.VarChar, formatDate(dateRoutedPenro));
    request.input("DateReleasedFromPENRO", sql.VarChar, formatDate(dateReleasedPenro));
    request.input("Division", sql.VarChar, division);
    request.input("DateReleased", sql.VarChar, formatDate(dateReleased));
    request.input("ReceivedBy", sql.VarChar, personnel);
    request.input("FileName", sql.VarChar, fileNames.join(", "));

    const query = `
      INSERT INTO DocumentTracking
      (Client, Gender, TypeOfDocument, Documentss,
       DateReceivedOD, DateRoutedToPENRO, DateReleasedFromPENRO,
       Division, DateReleased, ReceivedBy, FileName, CreatedAt)
      VALUES
      (@Client, @Gender, @TypeOfDocument, @Documentss,
       @DateReceivedOD, @DateRoutedToPENRO, @DateReleasedFromPENRO,
       @Division, @DateReleased, @ReceivedBy, @FileName, GETDATE())
    `;

    await request.query(query);

    res.json({ success: true, message: "✅ Data & files saved successfully!" });

  } catch (err) {
    console.error("Error saving document:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const sendDocumentRoute = require("./routes/sendDocument.route");
app.use("/api", sendDocumentRoute);