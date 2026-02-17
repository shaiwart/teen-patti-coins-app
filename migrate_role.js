const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'teen-patti-app-v2',
    password: '123',
    port: 5432,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration...');

        // Add role column if not exists
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN 
                    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'USER'; 
                END IF; 
            END $$;
        `);
        console.log('Added role column.');

        // Set specific user as SUPER_ADMIN (Change email as needed)
        const adminEmail = 'admin@example.com';
        const res = await client.query("UPDATE users SET role = 'SUPER_ADMIN' WHERE email = $1 RETURNING *", [adminEmail]);

        if (res.rowCount > 0) {
            console.log(`User ${adminEmail} promoted to SUPER_ADMIN.`);
        } else {
            console.log(`User ${adminEmail} not found. Please register this user first.`);
        }

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
