require("dotenv").config();
const sql = require("mssql");

async function testConnection() {
  try {
    // Using connection string directly
    const pool = await sql.connect(process.env.DB_CONNECTION_STRING);
    console.log("✅ Connected to Azure SQL via connection string!");
    await pool.close();
  } catch (err) {
    console.error("❌ Connection failed:", err.message);
  }
}

testConnection();