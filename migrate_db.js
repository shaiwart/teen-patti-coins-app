const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'teen-patti-app-v2',
    password: '123',
    port: 5432,
});

async function migrate() {
    try {
        console.log('Connecting to database...');
        const client = await pool.connect();
        console.log('Connected to ' + client.database);

        console.log('Adding games_won and games_played columns...');

        try {
            await client.query(`ALTER TABLE players ADD COLUMN games_won INTEGER DEFAULT 0;`);
            console.log('Added games_won column.');
        } catch (e) {
            console.log('games_won column might already exist:', e.message);
        }

        try {
            await client.query(`ALTER TABLE players ADD COLUMN games_played INTEGER DEFAULT 0;`);
            console.log('Added games_played column.');
        } catch (e) {
            console.log('games_played column might already exist:', e.message);
        }

        client.release();
        console.log('Migration complete.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
