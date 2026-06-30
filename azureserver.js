require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// SQL config
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: false }
};

// Azure Blob client
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_BLOB_CONTAINER);

// Ensure container exists
async function ensureContainer() {
  const exists = await containerClient.exists();
  if (!exists) await containerClient.create();
}
ensureContainer();

// Save form data + files
app.post('/save', upload.array('files'), async (req, res) => {
  try {
    const files = req.files || [];
    const fileNames = [];

    // Upload each file to Azure Blob Storage
    for (const file of files) {
      const blobName = Date.now() + '_' + file.originalname;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(file.buffer);
      fileNames.push(blobName);
    }

    // Connect to SQL
    const pool = await sql.connect(sqlConfig);
    const data = req.body;

    await pool.request()
      .input('Client', sql.NVarChar(255), data.client)
      .input('Gender', sql.NVarChar(10), data.gender)
      .input('TypeOfDocument', sql.NVarChar(100), data.typeOfDocument)
      .input('Document', sql.NVarChar(255), data.document)
      .input('DateReceivedOD', sql.DateTime, data.dateReceivedOD)
      .input('DateRoutedToPENRO', sql.DateTime, data.dateRoutedToPENRO)
      .input('DateReleasedFromPENRO', sql.DateTime, data.dateReleasedFromPENRO)
      .input('Division', sql.NVarChar(255), data.division)
      .input('DateReleased', sql.DateTime, data.dateReleased)
      .input('ReceivedBy', sql.NVarChar(255), data.receivedBy)
      .input('FileName', sql.NVarChar(255), fileNames.join(',')) // store filenames comma-separated
      .query(`INSERT INTO DocumentTracking
        (Client, Gender, TypeOfDocument, Document, DateReceivedOD, DateRoutedToPENRO,
         DateReleasedFromPENRO, Division, DateReleased, ReceivedBy, FileName)
        VALUES (@Client, @Gender, @TypeOfDocument, @Document, @DateReceivedOD,
                @DateRoutedToPENRO, @DateReleasedFromPENRO, @Division, @DateReleased, @ReceivedBy, @FileName)`);

    pool.close();
    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));