require('dotenv').config()
const mysql = require('mysql2/promise')
const bcrypt = require('bcrypt')

async function seed() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dashlg_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  })

  try {
    console.log('Seeding database...')

    // Seed Users
    const passwordHash = await bcrypt.hash('admin123', 10)
    await pool.query(`
      INSERT INTO users (username, password, role) 
      VALUES (?, ?, ?) 
      ON DUPLICATE KEY UPDATE password = VALUES(password)
    `, ['admin', passwordHash, 'admin'])
    console.log('User admin created/updated')

    // Seed Lines
    for (let i = 1; i <= 10; i++) {
      await pool.query(`INSERT IGNORE INTO \`lines\` (nama_line) VALUES (?)`, [`Line ${i}`])
    }
    console.log('Lines seeded')

    // Seed Mesin
    const machines = [
      { nama: 'Juki DDL-8700', merk: 'Juki', jenis: 'Sewing' },
      { nama: 'Brother S-7000', merk: 'Brother', jenis: 'Sewing' },
      { nama: 'Yamato VC-2700', merk: 'Yamato', jenis: 'Overlock' },
      { nama: 'Pegasus M900', merk: 'Pegasus', jenis: 'Overlock' }
    ]
    for (const m of machines) {
      await pool.query(`
        INSERT IGNORE INTO mesin (nama, merk, jenis) VALUES (?, ?, ?)
      `, [m.nama, m.merk, m.jenis])
    }
    console.log('Machines seeded')

    // Seed Devices
    for (let i = 1; i <= 5; i++) {
      await pool.query(`
        INSERT IGNORE INTO devices (nama, tipe, status) VALUES (?, ?, ?)
      `, [`Transmitter ${i}`, 'ESP32', 'aktif'])
    }
    console.log('Devices seeded')

    // Seed Styles
    const styles = [
      { orc: 'ORC-001', style: 'Style A', quantity: 1000 },
      { orc: 'ORC-002', style: 'Style B', quantity: 2000 }
    ]
    for (const s of styles) {
      await pool.query(`
        INSERT IGNORE INTO styles (orc, style, quantity) VALUES (?, ?, ?)
      `, [s.orc, s.style, s.quantity])
    }
    console.log('Styles seeded')

    // Note: We don't seed active orders/counters automatically to avoid messing up logic, 
    // but the basics are there.

    console.log('Seeding completed.')
  } catch (err) {
    console.error('Seeding failed:', err)
  } finally {
    await pool.end()
  }
}

seed()
