require('dotenv').config()
const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dashlg_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
})

async function initDb() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    })
    
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'dashlg_db'}\`;`)
    await connection.end()

    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    const [result] = await pool.query(schema)
    console.log('Database initialized successfully')
  } catch (err) {
    console.error('Error initializing database:', err)
  }
}

if (require.main === module) {
  initDb().then(() => process.exit())
}

module.exports = { pool, initDb }
