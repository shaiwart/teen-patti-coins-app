const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runSchema(pool) {
    const client = await pool.connect();
    try {
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        await client.query(schema);
        console.log('✅ Database Schema verified/applied successfully.');
    } catch (err) {
        console.error('❌ Error applying schema:', err);
    } finally {
        client.release();
    }
}

module.exports = { runSchema };
