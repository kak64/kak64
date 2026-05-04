const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'db');
const DB_FILE = path.join(DB_DIR, 'data.sqlite');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      company TEXT,
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'ישראל',
      tax_id TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      cpu INTEGER NOT NULL,
      ram_gb INTEGER NOT NULL,
      disk_gb INTEGER NOT NULL,
      bandwidth_tb INTEGER NOT NULL DEFAULT 1,
      price_monthly REAL NOT NULL,
      os_options TEXT NOT NULL DEFAULT 'Ubuntu 22.04,Debian 12,CentOS Stream 9,Windows Server 2022',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      hostname TEXT NOT NULL,
      os TEXT NOT NULL,
      root_password TEXT,
      status TEXT NOT NULL DEFAULT 'provisioning',
      esxi_vm_id TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      is_internal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS server_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      admin_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS balance_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_id INTEGER REFERENCES users(id),
      amount REAL NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  addColumnIfMissing('servers', 'cancelled_at', 'TEXT');
  addColumnIfMissing('servers', 'suspended_at', 'TEXT');
  addColumnIfMissing('servers', 'auto_renew', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('servers', 'admin_notes', 'TEXT');
  addColumnIfMissing('users', 'suspended', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('users', 'admin_notes', 'TEXT');
  addColumnIfMissing('ticket_messages', 'is_internal', 'INTEGER NOT NULL DEFAULT 0');

  seedDefaults();
}

function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedDefaults() {
  const planCount = db.prepare('SELECT COUNT(*) AS c FROM plans').get().c;
  if (planCount === 0) {
    const insert = db.prepare(`INSERT INTO plans
      (name, description, cpu, ram_gb, disk_gb, bandwidth_tb, price_monthly)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run('Starter', 'מתאים לאתרים קטנים ופרויקטים אישיים', 1, 2, 40, 1, 49);
    insert.run('Business', 'מתאים לאתרי עסקים, חנויות ויישומים', 2, 4, 80, 2, 99);
    insert.run('Pro', 'ביצועים גבוהים לעומסים כבדים', 4, 8, 160, 5, 199);
    insert.run('Enterprise', 'שרת חזק לארגונים וצרכים מיוחדים', 8, 16, 320, 10, 399);
  }

  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase().trim();
  const password = (process.env.ADMIN_PASSWORD || 'admin1234').trim();
  const hash = bcrypt.hashSync(password, 10);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, role = ? WHERE id = ?')
      .run(hash, 'admin', existing.id);
    console.log(`[seed] Admin user synced: ${email}`);
  } else {
    db.prepare(`INSERT INTO users (email, password_hash, full_name, role)
      VALUES (?, ?, ?, 'admin')`).run(email, hash, 'מנהל מערכת');
    console.log(`[seed] Admin user created: ${email}`);
  }
}

module.exports = { db, initDb };
