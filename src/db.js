const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  cfx_id TEXT UNIQUE,
  cfx_username TEXT,
  avatar_url TEXT,
  is_admin INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  sale_price REAL,
  image_url TEXT,
  badge TEXT,
  badge_color TEXT,
  tags TEXT,
  features TEXT,
  is_package INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  stock INTEGER,
  sold_count INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  total REAL NOT NULL,
  payment_method TEXT,
  status TEXT DEFAULT 'pending',
  transaction_id TEXT,
  notes TEXT,
  points_earned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT,
  qty INTEGER DEFAULT 1,
  price REAL,
  meta TEXT,
  receipt_code TEXT UNIQUE,
  redeemed INTEGER DEFAULT 0,
  redeemed_at TEXT,
  redeemed_player TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, user_id)
);

CREATE TABLE IF NOT EXISTS wishlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS flash_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  deal_price REAL NOT NULL,
  ends_at TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL,
  avatar_url TEXT,
  rating INTEGER DEFAULT 5,
  body TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_flash_active ON flash_deals(active, ends_at);
`);

// Idempotent migrations for users upgrading from earlier schemas
function safeAlter(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`); } catch (e) { /* ignore */ }
  }
}
safeAlter('users', 'points', 'INTEGER DEFAULT 0');
safeAlter('users', 'referral_code', 'TEXT');
safeAlter('users', 'referred_by', 'INTEGER');
safeAlter('products', 'stock', 'INTEGER');
safeAlter('products', 'sold_count', 'INTEGER DEFAULT 0');
safeAlter('products', 'rating_sum', 'INTEGER DEFAULT 0');
safeAlter('products', 'rating_count', 'INTEGER DEFAULT 0');
safeAlter('products', 'views', 'INTEGER DEFAULT 0');
safeAlter('products', 'is_featured', 'INTEGER DEFAULT 0');
safeAlter('orders', 'points_earned', 'INTEGER DEFAULT 0');
safeAlter('order_items', 'receipt_code', 'TEXT');
safeAlter('order_items', 'redeemed', 'INTEGER DEFAULT 0');
safeAlter('order_items', 'redeemed_at', 'TEXT');
safeAlter('order_items', 'redeemed_player', 'TEXT');

// ----------------- Seed -----------------
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@infinity-il.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  if (userCount === 0) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`INSERT INTO users (username, email, password_hash, is_admin) VALUES (?,?,?,1)`)
      .run(adminUsername, adminEmail, hash);
    console.log(`✦ Created admin user: ${adminEmail} / ${adminPassword}`);
  }

  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const seedCats = [
      { slug: 'vip',        name: 'VIP',        icon: '👑', color: '#a855f7', sort_order: 1 },
      { slug: 'cars',       name: 'רכבים',      icon: '🚗', color: '#22c55e', sort_order: 2 },
      { slug: 'bikes',      name: 'אופנועים',   icon: '🏍️', color: '#3b82f6', sort_order: 3 },
      { slug: 'buses',      name: 'אוטובוסים',  icon: '🚌', color: '#f59e0b', sort_order: 4 },
      { slug: 'helis',      name: 'מסוקים',     icon: '🚁', color: '#ec4899', sort_order: 5 },
      { slug: 'weapons',    name: 'נשקים',      icon: '🔫', color: '#ef4444', sort_order: 6 },
      { slug: 'packages',   name: 'חבילות',     icon: '📦', color: '#8b5cf6', sort_order: 7 },
      { slug: 'deals',      name: 'מבצעים',     icon: '🔥', color: '#f97316', sort_order: 8 }
    ];
    const insCat = db.prepare(`INSERT INTO categories (slug, name, icon, color, sort_order) VALUES (?,?,?,?,?)`);
    seedCats.forEach(c => insCat.run(c.slug, c.name, c.icon, c.color, c.sort_order));
  }

  const prodCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (prodCount === 0) {
    const cats = db.prepare('SELECT id, slug FROM categories').all().reduce((m, c) => (m[c.slug] = c.id, m), {});
    const seedProducts = [
      { cat: 'cars', name: 'Yamaha R1', desc: 'אופנוע ספורט מהיר ואיכותי - שיא במהירות.', price: 44, badge: 'NEW', badge_color: '#22c55e', features: 'מהירות מקסימום: 299 קמ"ש\nצבע מתכתי\nבוסט מותאם' },
      { cat: 'cars', name: 'Harley Davidson', desc: 'הרלי בסטייל - יוקרה אמריקאית.', price: 39, badge: 'SALE', badge_color: '#ef4444', features: 'מנוע V-Twin\nסאונד מותאם אישית' },
      { cat: 'cars', name: 'Ducati Panigale V4', desc: 'מפלצת איטלקית - 299 קמ"ש בלי בעיות.', price: 49, badge: 'HOT', badge_color: '#ef4444' },
      { cat: 'cars', name: 'Rolls Royce Phantom', desc: 'יוקרה ברמה אחרת - לרגע אחד אתה מלך.', price: 120, badge: 'VIP', badge_color: '#a855f7' },
      { cat: 'cars', name: 'BMW M5', desc: 'הרכב הספורטיבי המוערך ביותר - 660 כ"ס מתחת לרגלייך.', price: 45, badge: 'NEW', badge_color: '#22c55e' },
      { cat: 'cars', name: 'Ferrari 488', desc: 'פרארי קלאסית - שילוב של עוצמה ויוקרה.', price: 75, badge: 'מבצע', badge_color: '#f59e0b' },
      { cat: 'cars', name: 'Lamborghini Urus', desc: 'SUV ספורטיבי יוקרתי - שילוב של ביצועים ומידות.', price: 69, badge: 'VIP', badge_color: '#a855f7' },
      { cat: 'cars', name: 'Bugatti Chiron', desc: 'מפלצת מהירות יוקרתית - מנוע 1500 כ"ס.', price: 89, badge: 'TOP', badge_color: '#ef4444' },
      { cat: 'vip', name: 'הזרקת כסף', desc: 'הזרקת כסף חד פעמי לשרת.', price: 9, badge: 'מבצע', badge_color: '#f59e0b' },
      { cat: 'vip', name: 'הזרקת כסף קבוע', desc: 'הזרקת כסף קבוע יומית - מתחדש בעצמו.', price: 49, badge: 'TOP', badge_color: '#ef4444' },
      { cat: 'vip', name: 'הזרקת בוסט 24 שעות', desc: 'הזרקת בוסט מלאה לכל המתבקש למשך 24 שעות.', price: 15, badge: 'NEW', badge_color: '#22c55e' },
      { cat: 'vip', name: 'VIP זהב', desc: 'VIP זהב - כל ההטבות + חניה נוספת + פנסים פרטיים.', price: 99, badge: 'TOP', badge_color: '#ef4444' },
      { cat: 'vip', name: 'VIP כסף', desc: 'VIP כסף - אפשרויות מימון, הרשאות מתקדמות.', price: 59, badge: 'VIP', badge_color: '#a855f7' },
      { cat: 'vip', name: 'VIP ברונזה', desc: 'נוכל להגיע למעלה מהר יותר עם הטבות בסיס.', price: 29, badge: 'מבצע', badge_color: '#f59e0b' },
      { cat: 'packages', name: 'MEGA PACK', desc: 'VIP זהב + Bugatti + הזרקת כסף + מסוק + רובה M4', price: 149, badge: 'TOP', badge_color: '#ef4444', is_package: 1, features: 'VIP זהב\nBugatti Chiron\nהזרקת כסף 30K\nמסוק פרטי\nרובה M4' },
      { cat: 'packages', name: 'STARTER PACK', desc: 'חבילה מושלמת לכל אחד שמתחיל - VIP ברונזה + רכב + נשק', price: 79, badge: 'מבצע', badge_color: '#f59e0b', is_package: 1, features: 'VIP ברונזה\nרכב לבחירה (עד 50K)\nאקדח Pistol' },
      { cat: 'helis', name: 'מסוק רגיל', desc: 'מסוק שיתופי - שילוב של מהירות ויוקרה.', price: 39, badge: 'NEW', badge_color: '#22c55e' },
      { cat: 'helis', name: 'מסוק VIP', desc: 'מסוק יוקרתי - אובחנות מלאה, הטבות בלתי רגילות + פנסים מותאמים.', price: 69, badge: 'VIP', badge_color: '#a855f7' },
      { cat: 'buses', name: 'אוטובוס פרטי', desc: 'אוטובוס פרטי - מתאים לכל סוגי הסיורים.', price: 79, badge: 'מבצע', badge_color: '#f59e0b' },
      { cat: 'weapons', name: 'חבילת נשקים מלאה', desc: 'כל הנשקים בחבילה אחת - הפסקת ירי שלמה.', price: 59, badge: 'TOP', badge_color: '#ef4444', is_package: 1, features: 'AK-47\nM4A1\nDesert Eagle\nSniper\nגרגרים' },
      { cat: 'weapons', name: 'Sniper Rifle', desc: 'רובה צלפים מקצועי - מגיע על כל ידי לרודן.', price: 25, badge: 'VIP', badge_color: '#a855f7' },
      { cat: 'weapons', name: 'Desert Eagle', desc: 'אקדח חזק וזריז - אקדח לכל מצב.', price: 15, badge: 'NEW', badge_color: '#22c55e' },
      { cat: 'weapons', name: 'AR-15', desc: 'רובה תקיפה מתקדם - דיוק של מי בכל הדרך.', price: 19, badge: 'NEW', badge_color: '#22c55e' },
      { cat: 'weapons', name: 'Annihilator', desc: 'מטוס קרב יוקרתי - אקדם וקדמי.', price: 79, badge: 'מבצע', badge_color: '#f59e0b' },
      { cat: 'weapons', name: 'Buzzard Attack', desc: 'מסוק קרב סופר חזק - שילוב של מהירות ויוקרה.', price: 89, badge: 'TOP', badge_color: '#ef4444' },
      { cat: 'deals', name: 'מבצע החודש!', desc: 'מבצע חמושה - הצטרפו עכשיו - חבילה לפני שכליי גמור.', price: 59, badge: 'מבצע', badge_color: '#f59e0b', features: '50% הנחה\nרק 50 כרטיסים\nתוקף עד סוף החודש' }
    ];
    const insP = db.prepare(`INSERT INTO products (category_id, name, description, price, badge, badge_color, features, is_package, sort_order)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    seedProducts.forEach((p, i) => {
      insP.run(cats[p.cat] || null, p.name, p.desc, p.price, p.badge || null, p.badge_color || null, p.features || null, p.is_package ? 1 : 0, i);
    });
  }

  const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (settingsCount === 0) {
    const ins = db.prepare(`INSERT INTO settings (key, value) VALUES (?,?)`);
    ins.run('site_name', 'Infinity IL');
    ins.run('site_subtitle', 'ROLEPLAY SERVER STORE');
    ins.run('discord_invite', 'https://discord.gg/infinity-il');
    ins.run('hero_tagline', 'הכניסו את הקהילה הכי טובה במזרח התיכון');
    ins.run('announcement_bar', '🔥 קוד WELCOME10 — 10₪ הנחה על כל קנייה ראשונה · הצטרפו לדיסקורד שלנו!');
    ins.run('announcement_link', '');
    ins.run('discord_webhook_url', '');
    ins.run('fivem_endpoint', '');
    ins.run('fivem_server_name', 'Infinity IL Roleplay');
    ins.run('points_per_currency', '1');
    ins.run('points_redeem_rate', '100');
    ins.run('referral_bonus', '10');
    ins.run('hero_image_url', '');
    ins.run('monthly_goal', '5000');
    ins.run('monthly_goal_label', 'יעד חודשי');
    // Bearer token used by the FiveM resource to call /api/redeem.
    // Auto-generated; admin can rotate it from /admin/settings.
    ins.run('fivem_api_token', generateApiToken());
    ins.run('receipt_prefix', 'inf');
  }

  // Seed testimonials
  const testCount = db.prepare('SELECT COUNT(*) AS c FROM testimonials').get().c;
  if (testCount === 0) {
    const ins = db.prepare(`INSERT INTO testimonials (author, rating, body, sort_order) VALUES (?,?,?,?)`);
    ins.run('David K.', 5, 'הקהילה הכי טובה ברולפליי הישראלי. השרת חלק, הצוות אדיב, והחנות מסודרת. כיף לקנות פה.', 1);
    ins.run('Yossi M.', 5, 'קניתי VIP זהב — הופעל תוך 30 שניות. שווה כל שקל. ממליץ בחום!', 2);
    ins.run('Liron B.', 5, 'מערכת התשלום מהירה, ה-Discord פעיל, וההטבות אמיתיות. 10/10.', 3);
    ins.run('Roi A.', 4, 'חוויית רולפליי ברמה גבוהה. הצוות עוזר תמיד, החנות עובדת מצוין.', 4);
  }

  // Seed FAQ
  const faqCount = db.prepare('SELECT COUNT(*) AS c FROM faq').get().c;
  if (faqCount === 0) {
    const ins = db.prepare(`INSERT INTO faq (question, answer, sort_order) VALUES (?,?,?)`);
    ins.run('כמה זמן לוקח עד שאני מקבל את ההטבה?', 'ברוב המקרים ההטבה מופעלת אוטומטית תוך פחות מדקה. אם זה לא קרה — פנו אלינו ב-Discord ואנחנו נטפל בזה מיד.', 1);
    ins.run('איך אני משלם?', 'אנחנו תומכים ב-PayPal וב-Bit. שני האמצעים מאובטחים לחלוטין ומיידיים.', 2);
    ins.run('מה קורה אם הצטערתי על הקנייה?', 'מדיניות החזר תוך 7 ימים על מוצרים שעדיין לא הופעלו בשרת. מספיק לפנות אלינו ב-Discord.', 3);
    ins.run('איך עובדות נקודות הנאמנות?', 'על כל ₪ שאתם מוציאים אתם מקבלים נקודה. אפשר לפדות אותן בקנייה הבאה. בנוסף, חבר שמצטרף עם הקוד שלכם — שניכם מקבלים בונוס.', 4);
    ins.run('אני יכול להעביר חבילה לחבר?', 'כן! VIP וחבילות ניתנות להעברה. צרו קשר ב-Discord עם פרטי המקבל.', 5);
  }

  // Backfill referral codes for users that don't have one
  const usersNoCode = db.prepare(`SELECT id, username FROM users WHERE referral_code IS NULL OR referral_code = ''`).all();
  const updRef = db.prepare(`UPDATE users SET referral_code = ? WHERE id = ?`);
  usersNoCode.forEach(u => updRef.run(generateRefCode(u.username), u.id));
}

function generateRefCode(username) {
  const base = (username || 'USER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'USER';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${suffix}`;
}

function generateApiToken() {
  return require('crypto').randomBytes(24).toString('hex');
}

// Receipt code: e.g. inf-K7P9X2A3F1B8 — 12 random hex+letters, prefixed.
function generateReceiptCode() {
  const stored = db.prepare(`SELECT value FROM settings WHERE key = 'receipt_prefix'`).get();
  const prefix = (stored && stored.value || process.env.RECEIPT_PREFIX || 'inf').toLowerCase();
  let code, exists;
  do {
    const part = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
    code = `${prefix}-${part.toUpperCase()}`;
    exists = db.prepare('SELECT 1 FROM order_items WHERE receipt_code = ?').get(code);
  } while (exists);
  return code;
}

seed();

// ----------------- Helpers -----------------
const Q = {
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserByDiscord: db.prepare('SELECT * FROM users WHERE discord_id = ?'),
  getUserByCfx: db.prepare('SELECT * FROM users WHERE cfx_id = ?'),
  getUserByRefCode: db.prepare('SELECT * FROM users WHERE referral_code = ?'),
  insertUser: db.prepare(`INSERT INTO users (username, email, password_hash, discord_id, discord_username, cfx_id, cfx_username, avatar_url, referral_code, referred_by)
                          VALUES (?,?,?,?,?,?,?,?,?,?)`),
  updateUser: db.prepare(`UPDATE users SET username=?, email=?, avatar_url=? WHERE id=?`),
  setUserAdmin: db.prepare(`UPDATE users SET is_admin=? WHERE id=?`),
  listUsers: db.prepare('SELECT * FROM users ORDER BY id DESC'),
  addUserPoints: db.prepare(`UPDATE users SET points = points + ? WHERE id = ?`),

  listCategories: db.prepare('SELECT * FROM categories ORDER BY sort_order, name'),
  getCategoryBySlug: db.prepare('SELECT * FROM categories WHERE slug = ?'),
  getCategoryById: db.prepare('SELECT * FROM categories WHERE id = ?'),
  insertCategory: db.prepare(`INSERT INTO categories (slug, name, icon, color, sort_order) VALUES (?,?,?,?,?)`),
  updateCategory: db.prepare(`UPDATE categories SET slug=?, name=?, icon=?, color=?, sort_order=? WHERE id=?`),
  deleteCategory: db.prepare('DELETE FROM categories WHERE id = ?'),

  listProducts: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.color AS category_color, c.icon AS category_icon
                            FROM products p LEFT JOIN categories c ON p.category_id = c.id
                            WHERE p.active = 1 ORDER BY p.sort_order, p.id DESC`),
  listProductsByCategory: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.color AS category_color, c.icon AS category_icon
                            FROM products p LEFT JOIN categories c ON p.category_id = c.id
                            WHERE p.active = 1 AND c.slug = ? ORDER BY p.sort_order, p.id DESC`),
  listAllProducts: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p
                               LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.id DESC`),
  getProduct: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.color AS category_color, c.icon AS category_icon
                          FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?`),
  insertProduct: db.prepare(`INSERT INTO products (category_id, name, description, price, sale_price, image_url, badge, badge_color, tags, features, is_package, active, sort_order, stock, is_featured)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  updateProduct: db.prepare(`UPDATE products SET category_id=?, name=?, description=?, price=?, sale_price=?, image_url=?, badge=?, badge_color=?, tags=?, features=?, is_package=?, active=?, sort_order=?, stock=?, is_featured=? WHERE id=?`),
  deleteProduct: db.prepare('DELETE FROM products WHERE id = ?'),
  bumpProductViews: db.prepare(`UPDATE products SET views = views + 1 WHERE id = ?`),
  bumpProductSold: db.prepare(`UPDATE products SET sold_count = sold_count + ?, stock = CASE WHEN stock IS NULL THEN NULL ELSE MAX(0, stock - ?) END WHERE id = ?`),
  listFeaturedProducts: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.color AS category_color, c.icon AS category_icon
                                    FROM products p LEFT JOIN categories c ON p.category_id = c.id
                                    WHERE p.active = 1 AND p.is_featured = 1 ORDER BY p.sort_order LIMIT 8`),
  listBestSellers: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.color AS category_color, c.icon AS category_icon
                               FROM products p LEFT JOIN categories c ON p.category_id = c.id
                               WHERE p.active = 1 ORDER BY p.sold_count DESC, p.id DESC LIMIT 8`),
  searchProducts: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.color AS category_color, c.icon AS category_icon
                              FROM products p LEFT JOIN categories c ON p.category_id = c.id
                              WHERE p.active = 1 AND (p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)
                              ORDER BY p.sold_count DESC, p.id DESC`),

  insertOrder: db.prepare(`INSERT INTO orders (user_id, total, payment_method, status, transaction_id, notes, points_earned) VALUES (?,?,?,?,?,?,?)`),
  insertOrderItem: db.prepare(`INSERT INTO order_items (order_id, product_id, product_name, qty, price, meta, receipt_code) VALUES (?,?,?,?,?,?,?)`),
  setItemRedeemed: db.prepare(`UPDATE order_items SET redeemed = 1, redeemed_at = CURRENT_TIMESTAMP, redeemed_player = ? WHERE receipt_code = ? AND redeemed = 0`),
  getItemByCode: db.prepare(`SELECT oi.*, p.name AS product_full_name, p.description AS product_description, p.features AS product_features, p.tags AS product_tags, p.is_package, o.status AS order_status, o.user_id, u.username, u.email
                              FROM order_items oi
                              JOIN orders o ON oi.order_id = o.id
                              LEFT JOIN products p ON oi.product_id = p.id
                              LEFT JOIN users u ON o.user_id = u.id
                              WHERE oi.receipt_code = ?`),
  listAllRedemptions: db.prepare(`SELECT oi.*, o.created_at AS ordered_at, u.username
                                  FROM order_items oi
                                  JOIN orders o ON oi.order_id = o.id
                                  LEFT JOIN users u ON o.user_id = u.id
                                  ORDER BY oi.id DESC LIMIT 200`),
  listOrders: db.prepare(`SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.id DESC`),
  listOrdersForUser: db.prepare(`SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC`),
  getOrder: db.prepare(`SELECT o.*, u.username, u.email FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?`),
  listOrderItems: db.prepare(`SELECT * FROM order_items WHERE order_id = ?`),
  updateOrderStatus: db.prepare(`UPDATE orders SET status = ? WHERE id = ?`),
  recentPaidOrders: db.prepare(`SELECT o.id, o.total, o.created_at, u.username, u.avatar_url
                                FROM orders o LEFT JOIN users u ON o.user_id = u.id
                                WHERE o.status = 'paid' ORDER BY o.id DESC LIMIT ?`),
  recentItemsForActivity: db.prepare(`SELECT oi.product_name, oi.qty, o.created_at, u.username, u.avatar_url, p.image_url, p.id AS product_id
                                      FROM order_items oi
                                      JOIN orders o ON oi.order_id = o.id
                                      LEFT JOIN users u ON o.user_id = u.id
                                      LEFT JOIN products p ON oi.product_id = p.id
                                      WHERE o.status = 'paid'
                                      ORDER BY o.id DESC LIMIT ?`),

  insertReview: db.prepare(`INSERT INTO reviews (product_id, user_id, username, rating, comment) VALUES (?,?,?,?,?)
                            ON CONFLICT(product_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = CURRENT_TIMESTAMP`),
  listReviewsForProduct: db.prepare(`SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC`),
  recomputeProductRating: db.prepare(`UPDATE products SET rating_sum = (SELECT COALESCE(SUM(rating), 0) FROM reviews WHERE product_id = ?), rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?) WHERE id = ?`),

  insertWishlist: db.prepare(`INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?,?)`),
  removeWishlist: db.prepare(`DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`),
  isWishlisted: db.prepare(`SELECT 1 FROM wishlist WHERE user_id = ? AND product_id = ?`),
  listWishlistFor: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.color AS category_color, c.icon AS category_icon
                               FROM wishlist w JOIN products p ON w.product_id = p.id
                               LEFT JOIN categories c ON p.category_id = c.id
                               WHERE w.user_id = ? ORDER BY w.id DESC`),

  listFlashDeals: db.prepare(`SELECT fd.*, p.name AS product_name, p.price AS product_price, p.image_url, c.color AS category_color, c.icon AS category_icon
                              FROM flash_deals fd JOIN products p ON fd.product_id = p.id
                              LEFT JOIN categories c ON p.category_id = c.id
                              WHERE fd.active = 1 AND fd.ends_at > datetime('now')
                              ORDER BY fd.ends_at ASC`),
  listAllFlashDeals: db.prepare(`SELECT fd.*, p.name AS product_name FROM flash_deals fd JOIN products p ON fd.product_id = p.id ORDER BY fd.id DESC`),
  insertFlashDeal: db.prepare(`INSERT INTO flash_deals (product_id, deal_price, ends_at, active) VALUES (?,?,?,?)`),
  deleteFlashDeal: db.prepare(`DELETE FROM flash_deals WHERE id = ?`),
  getActiveFlashForProduct: db.prepare(`SELECT * FROM flash_deals WHERE product_id = ? AND active = 1 AND ends_at > datetime('now') ORDER BY ends_at ASC LIMIT 1`),

  listTestimonials: db.prepare(`SELECT * FROM testimonials WHERE active = 1 ORDER BY sort_order, id`),
  listAllTestimonials: db.prepare(`SELECT * FROM testimonials ORDER BY sort_order, id`),
  insertTestimonial: db.prepare(`INSERT INTO testimonials (author, avatar_url, rating, body, active, sort_order) VALUES (?,?,?,?,?,?)`),
  deleteTestimonial: db.prepare(`DELETE FROM testimonials WHERE id = ?`),

  listFaq: db.prepare(`SELECT * FROM faq WHERE active = 1 ORDER BY sort_order, id`),
  listAllFaq: db.prepare(`SELECT * FROM faq ORDER BY sort_order, id`),
  insertFaq: db.prepare(`INSERT INTO faq (question, answer, active, sort_order) VALUES (?,?,?,?)`),
  deleteFaq: db.prepare(`DELETE FROM faq WHERE id = ?`),

  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare(`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
};

module.exports = {
  raw: db,

  // users
  getUserById: id => Q.getUserById.get(id),
  getUserByEmail: email => Q.getUserByEmail.get(email),
  getUserByUsername: u => Q.getUserByUsername.get(u),
  getUserByDiscord: id => Q.getUserByDiscord.get(id),
  getUserByCfx: id => Q.getUserByCfx.get(id),
  getUserByRefCode: c => Q.getUserByRefCode.get(c),
  createUser: (data) => {
    const referralCode = generateRefCode(data.username);
    const r = Q.insertUser.run(
      data.username, data.email || null, data.password_hash || null,
      data.discord_id || null, data.discord_username || null,
      data.cfx_id || null, data.cfx_username || null, data.avatar_url || null,
      referralCode, data.referred_by || null
    );
    return Q.getUserById.get(r.lastInsertRowid);
  },
  updateUser: (id, data) => Q.updateUser.run(data.username, data.email || null, data.avatar_url || null, id),
  setUserAdmin: (id, isAdmin) => Q.setUserAdmin.run(isAdmin ? 1 : 0, id),
  listUsers: () => Q.listUsers.all(),
  addUserPoints: (id, pts) => Q.addUserPoints.run(pts, id),

  // categories
  listCategories: () => Q.listCategories.all(),
  getCategoryBySlug: s => Q.getCategoryBySlug.get(s),
  getCategoryById: id => Q.getCategoryById.get(id),
  createCategory: (d) => Q.insertCategory.run(d.slug, d.name, d.icon || null, d.color || null, d.sort_order || 0),
  updateCategory: (id, d) => Q.updateCategory.run(d.slug, d.name, d.icon || null, d.color || null, d.sort_order || 0, id),
  deleteCategory: (id) => Q.deleteCategory.run(id),

  // products
  listProducts: () => Q.listProducts.all(),
  listProductsByCategory: slug => Q.listProductsByCategory.all(slug),
  listAllProducts: () => Q.listAllProducts.all(),
  listFeaturedProducts: () => Q.listFeaturedProducts.all(),
  listBestSellers: () => Q.listBestSellers.all(),
  searchProducts: (q) => {
    const like = `%${q}%`;
    return Q.searchProducts.all(like, like, like);
  },
  getProduct: id => Q.getProduct.get(id),
  createProduct: (d) => {
    const r = Q.insertProduct.run(
      d.category_id || null, d.name, d.description || '', Number(d.price) || 0,
      d.sale_price ? Number(d.sale_price) : null, d.image_url || null,
      d.badge || null, d.badge_color || null, d.tags || null, d.features || null,
      d.is_package ? 1 : 0, d.active === undefined ? 1 : (d.active ? 1 : 0),
      Number(d.sort_order) || 0,
      d.stock !== undefined && d.stock !== '' && d.stock !== null ? Number(d.stock) : null,
      d.is_featured ? 1 : 0
    );
    return Q.getProduct.get(r.lastInsertRowid);
  },
  updateProduct: (id, d) => Q.updateProduct.run(
    d.category_id || null, d.name, d.description || '', Number(d.price) || 0,
    d.sale_price ? Number(d.sale_price) : null, d.image_url || null,
    d.badge || null, d.badge_color || null, d.tags || null, d.features || null,
    d.is_package ? 1 : 0, d.active ? 1 : 0, Number(d.sort_order) || 0,
    d.stock !== undefined && d.stock !== '' && d.stock !== null ? Number(d.stock) : null,
    d.is_featured ? 1 : 0, id
  ),
  deleteProduct: (id) => Q.deleteProduct.run(id),
  bumpProductViews: (id) => Q.bumpProductViews.run(id),
  bumpProductSold: (id, qty) => Q.bumpProductSold.run(qty, qty, id),

  // reviews
  upsertReview: (data) => {
    Q.insertReview.run(data.product_id, data.user_id, data.username, data.rating, data.comment || null);
    Q.recomputeProductRating.run(data.product_id, data.product_id, data.product_id);
  },
  listReviewsForProduct: (pid) => Q.listReviewsForProduct.all(pid),

  // wishlist
  toggleWishlist: (userId, productId) => {
    if (Q.isWishlisted.get(userId, productId)) {
      Q.removeWishlist.run(userId, productId);
      return false;
    }
    Q.insertWishlist.run(userId, productId);
    return true;
  },
  isWishlisted: (userId, productId) => !!Q.isWishlisted.get(userId, productId),
  listWishlistFor: (userId) => Q.listWishlistFor.all(userId),

  // flash deals
  listFlashDeals: () => Q.listFlashDeals.all(),
  listAllFlashDeals: () => Q.listAllFlashDeals.all(),
  createFlashDeal: (d) => Q.insertFlashDeal.run(d.product_id, d.deal_price, d.ends_at, d.active ? 1 : 0),
  deleteFlashDeal: (id) => Q.deleteFlashDeal.run(id),
  getActiveFlashForProduct: (pid) => Q.getActiveFlashForProduct.get(pid),

  // testimonials
  listTestimonials: () => Q.listTestimonials.all(),
  listAllTestimonials: () => Q.listAllTestimonials.all(),
  createTestimonial: (d) => Q.insertTestimonial.run(d.author, d.avatar_url || null, Number(d.rating) || 5, d.body, d.active ? 1 : 0, Number(d.sort_order) || 0),
  deleteTestimonial: (id) => Q.deleteTestimonial.run(id),

  // faq
  listFaq: () => Q.listFaq.all(),
  listAllFaq: () => Q.listAllFaq.all(),
  createFaq: (d) => Q.insertFaq.run(d.question, d.answer, d.active ? 1 : 0, Number(d.sort_order) || 0),
  deleteFaq: (id) => Q.deleteFaq.run(id),

  // activity feed
  recentItemsForActivity: (limit = 12) => Q.recentItemsForActivity.all(limit),
  recentPaidOrders: (limit = 8) => Q.recentPaidOrders.all(limit),

  // leaderboard (top buyers in last 30 days)
  topBuyersThisMonth: (limit = 5) => db.prepare(`
    SELECT u.id, u.username, u.avatar_url, SUM(o.total) AS total_spent, COUNT(o.id) AS order_count
    FROM orders o JOIN users u ON o.user_id = u.id
    WHERE o.status = 'paid' AND o.created_at >= datetime('now', '-30 days')
    GROUP BY u.id
    ORDER BY total_spent DESC
    LIMIT ?
  `).all(limit),

  // monthly revenue (this calendar month)
  salesThisMonth: () => db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total
    FROM orders
    WHERE status = 'paid' AND created_at >= date('now', 'start of month')
  `).get().total,

  // orders
  createOrder: (userId, items, total, paymentMethod, transactionId = null, notes = null, pointsEarned = 0) => {
    const tx = db.transaction(() => {
      const r = Q.insertOrder.run(userId, total, paymentMethod, 'pending', transactionId, notes, pointsEarned);
      const orderId = r.lastInsertRowid;
      items.forEach(it => {
        const code = it.receipt_code || generateReceiptCode();
        Q.insertOrderItem.run(orderId, it.product_id, it.name, it.qty, it.price, it.meta || null, code);
      });
      return orderId;
    });
    return tx();
  },
  redeemReceiptCode: (code, player) => {
    const item = Q.getItemByCode.get(code);
    if (!item) return { ok: false, error: 'קוד לא נמצא' };
    if (item.order_status !== 'paid') return { ok: false, error: 'הקוד עוד לא שולם' };
    if (item.redeemed) return { ok: false, error: 'הקוד כבר מומש', redeemedAt: item.redeemed_at, redeemedPlayer: item.redeemed_player };
    Q.setItemRedeemed.run(player || 'unknown', code);
    return {
      ok: true,
      product: {
        id: item.product_id,
        name: item.product_full_name || item.product_name,
        description: item.product_description,
        features: item.product_features,
        tags: item.product_tags,
        is_package: !!item.is_package,
        qty: item.qty
      },
      buyer: { id: item.user_id, username: item.username, email: item.email },
      receipt_code: code
    };
  },
  getItemByCode: (code) => Q.getItemByCode.get(code),
  listAllRedemptions: () => Q.listAllRedemptions.all(),
  listOrders: () => Q.listOrders.all(),
  listOrdersForUser: (uid) => Q.listOrdersForUser.all(uid),
  getOrder: (id) => {
    const o = Q.getOrder.get(id);
    if (!o) return null;
    o.items = Q.listOrderItems.all(id);
    return o;
  },
  updateOrderStatus: (id, status) => Q.updateOrderStatus.run(status, id),

  // settings
  getSetting: (k) => { const r = Q.getSetting.get(k); return r ? r.value : null; },
  setSetting: (k, v) => Q.setSetting.run(k, v),
};
