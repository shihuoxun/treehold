const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'treehole',
  waitForConnections: true,
  connectionLimit: 2
};

(async () => {
  let pool;
  try {
    pool = mysql.createPool(DB_CONFIG);
    const [settings] = await pool.query('SELECT `key`, value FROM settings');
    const [letters] = await pool.query(
      'SELECT id, LEFT(content, 120) AS preview, ip_address, created_at, reply_text IS NOT NULL AS has_reply FROM letters ORDER BY created_at DESC LIMIT 50'
    );

    console.log('--- Settings ---');
    if (!settings.length) {
      console.log('No settings rows yet. The server will create defaults on first run.');
    } else {
      settings.forEach((row) => console.log(`${row.key}: ${row.value}`));
    }

    console.log('\n--- Recent Letters (max 50) ---');
    if (!letters.length) {
      console.log('No letters stored.');
    } else {
      letters.forEach((letter) => {
        const createdAt =
          letter.created_at && typeof letter.created_at.toISOString === 'function'
            ? letter.created_at.toISOString()
            : letter.created_at;
        console.log(
          `#${letter.id} | ${createdAt || 'unknown'} | IP ${letter.ip_address || 'n/a'} | Reply: ${
            letter.has_reply ? 'yes' : 'no'
          }`
        );
        console.log(`  ${letter.preview}`);
      });
    }
  } catch (error) {
    console.error('Failed to inspect database. Ensure MySQL credentials/env vars are set.', error);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
})();
