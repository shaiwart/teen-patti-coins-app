const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running migration: Add games_won to players table...');
        await client.query(`
            ALTER TABLE players 
            ADD COLUMN IF NOT EXISTS games_won INTEGER DEFAULT 0;
        `);
        console.log('✅ Migration successful: games_won column added.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
