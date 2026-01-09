
const { pool } = require('./src/services/db');

async function checkLines() {
    try {
        const [rows] = await pool.query('SELECT * FROM `lines`');
        console.log('LINES:', JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit();
}

checkLines();
