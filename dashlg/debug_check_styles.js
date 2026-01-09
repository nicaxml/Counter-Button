
const { pool } = require('./src/services/db');

async function checkStyles() {
    try {
        const [rows] = await pool.query('SELECT * FROM styles');
        console.log('STYLES:', JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit();
}

checkStyles();
