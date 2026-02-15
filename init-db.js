const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'teen-patti-app-v2',
    password: '123',
    port: 5432,
});

async function runSchema() {
    const client = await pool.connect();
    try {
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        await client.query(schema);
        console.log('Schema applied successfully');
    } catch (err) {
        console.error('Error applying schema', err);
    } finally {
        client.release();
        pool.end();
    }
}

runSchema();
