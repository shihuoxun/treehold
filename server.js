require('dotenv').config();
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'treehole-admin';
const DEFAULT_DAILY_LIMIT = 1;

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'treehole',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  timezone: 'Z'
};

let pool;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  return pool;
}

async function runMigrations() {
  const db = await getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS letters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      content TEXT NOT NULL,
      ip_address VARCHAR(64),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reply_text TEXT,
      reply_created_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(64) PRIMARY KEY,
      value VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

const dbReady = runMigrations().catch((error) => {
  console.error('Failed to run database migrations:', error);
  process.exit(1);
});

async function getDailyLimit() {
  await dbReady;
  const db = await getPool();
  const [rows] = await db.query('SELECT value FROM settings WHERE `key` = ?', ['daily_limit']);
  if (!rows.length) {
    await setDailyLimit(DEFAULT_DAILY_LIMIT);
    return DEFAULT_DAILY_LIMIT;
  }
  const parsed = parseInt(rows[0].value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

async function setDailyLimit(limit) {
  await dbReady;
  const db = await getPool();
  await db.query(
    'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    ['daily_limit', String(limit)]
  );
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/letters', async (req, res) => {
  try {
    await dbReady;
    const { content } = req.body || {};
    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      return res.status(400).json({ error: 'Please share at least 10 characters so the Tree Hole can hear you.' });
    }

    const db = await getPool();
    const dailyLimit = await getDailyLimit();
    const ip = getClientIp(req);
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total FROM letters WHERE ip_address = ? AND DATE(created_at) = CURRENT_DATE`,
      [ip]
    );
    const todayCount = rows[0]?.total || 0;

    if (todayCount >= dailyLimit) {
      return res.status(429).json({
        error: `You reached today's sharing limit of ${dailyLimit}. Please return tomorrow--your feelings matter.`
      });
    }

    await db.query('INSERT INTO letters(content, ip_address) VALUES(?, ?)', [content.trim(), ip]);
    res.json({ message: 'Your letter is resting safely in the Tree Hole. Thank you for trusting this space.' });
  } catch (error) {
    console.error('Failed to save letter:', error);
    res.status(500).json({ error: 'The Tree Hole is resting. Please try again soon.' });
  }
});

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/admin/letters', requireAdmin, async (req, res) => {
  try {
    await dbReady;
    const db = await getPool();
    const [letters] = await db.query(
      `SELECT id, content, ip_address, created_at, reply_text, reply_created_at FROM letters ORDER BY created_at DESC`
    );
    const hydrated = letters.map((letter) => ({
      ...letter,
      created_at: letter.created_at ? letter.created_at.toISOString() : null,
      reply_created_at: letter.reply_created_at ? letter.reply_created_at.toISOString() : null
    }));
    res.json({ letters: hydrated });
  } catch (error) {
    console.error('Failed to load letters:', error);
    res.status(500).json({ error: 'Unable to load letters.' });
  }
});

app.post('/api/admin/letters/:id/reply', requireAdmin, async (req, res) => {
  try {
    await dbReady;
    const letterId = Number(req.params.id);
    const { replyText } = req.body || {};
    if (!letterId) {
      return res.status(400).json({ error: 'Invalid letter id' });
    }

    const sanitized = replyText && replyText.trim().length > 0 ? replyText.trim() : null;
    const db = await getPool();
    await db.query(
      `UPDATE letters SET reply_text = ?, reply_created_at = IF(? IS NULL, NULL, NOW()) WHERE id = ?`,
      [sanitized, sanitized, letterId]
    );

    res.json({ message: 'Reply saved.' });
  } catch (error) {
    console.error('Failed to save reply:', error);
    res.status(500).json({ error: 'Unable to save reply.' });
  }
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const dailyLimit = await getDailyLimit();
    res.json({ dailyLimit });
  } catch (error) {
    console.error('Failed to load settings:', error);
    res.status(500).json({ error: 'Unable to load settings.' });
  }
});

app.post('/api/admin/settings/daily-limit', requireAdmin, async (req, res) => {
  try {
    const { dailyLimit } = req.body || {};
    const parsed = parseInt(dailyLimit, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'Daily limit must be a positive whole number.' });
    }

    await setDailyLimit(parsed);
    res.json({ message: 'Daily limit updated.', dailyLimit: parsed });
  } catch (error) {
    console.error('Failed to update daily limit:', error);
    res.status(500).json({ error: 'Unable to update daily limit.' });
  }
});

app.get('/api/settings/public', async (req, res) => {
  try {
    const dailyLimit = await getDailyLimit();
    res.json({ dailyLimit });
  } catch (error) {
    console.error('Failed to load public settings:', error);
    res.status(500).json({ error: 'Unable to load public settings.' });
  }
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Psychological Tree Hole server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
