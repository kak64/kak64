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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT,
  qty INTEGER DEFAULT 1,
  price REAL,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

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
  }
}

seed();

// ----------------- Helpers -----------------
const Q = {
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserByDiscord: db.prepare('SELECT * FROM users WHERE discord_id = ?'),
  getUserByCfx: db.prepare('SELECT * FROM users WHERE cfx_id = ?'),
  insertUser: db.prepare(`INSERT INTO users (username, email, password_hash, discord_id, discord_username, cfx_id, cfx_username, avatar_url)
                          VALUES (?,?,?,?,?,?,?,?)`),
  updateUser: db.prepare(`UPDATE users SET username=?, email=?, avatar_url=? WHERE id=?`),
  setUserAdmin: db.prepare(`UPDATE users SET is_admin=? WHERE id=?`),
  listUsers: db.prepare('SELECT * FROM users ORDER BY id DESC'),

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
  insertProduct: db.prepare(`INSERT INTO products (category_id, name, description, price, sale_price, image_url, badge, badge_color, tags, features, is_package, active, sort_order)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  updateProduct: db.prepare(`UPDATE products SET category_id=?, name=?, description=?, price=?, sale_price=?, image_url=?, badge=?, badge_color=?, tags=?, features=?, is_package=?, active=?, sort_order=? WHERE id=?`),
  deleteProduct: db.prepare('DELETE FROM products WHERE id = ?'),

  insertOrder: db.prepare(`INSERT INTO orders (user_id, total, payment_method, status, transaction_id, notes) VALUES (?,?,?,?,?,?)`),
  insertOrderItem: db.prepare(`INSERT INTO order_items (order_id, product_id, product_name, qty, price, meta) VALUES (?,?,?,?,?,?)`),
  listOrders: db.prepare(`SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.id DESC`),
  listOrdersForUser: db.prepare(`SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC`),
  getOrder: db.prepare(`SELECT o.*, u.username, u.email FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?`),
  listOrderItems: db.prepare(`SELECT * FROM order_items WHERE order_id = ?`),
  updateOrderStatus: db.prepare(`UPDATE orders SET status = ? WHERE id = ?`),

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
  createUser: (data) => {
    const r = Q.insertUser.run(
      data.username, data.email || null, data.password_hash || null,
      data.discord_id || null, data.discord_username || null,
      data.cfx_id || null, data.cfx_username || null, data.avatar_url || null
    );
    return Q.getUserById.get(r.lastInsertRowid);
  },
  updateUser: (id, data) => Q.updateUser.run(data.username, data.email || null, data.avatar_url || null, id),
  setUserAdmin: (id, isAdmin) => Q.setUserAdmin.run(isAdmin ? 1 : 0, id),
  listUsers: () => Q.listUsers.all(),

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
  getProduct: id => Q.getProduct.get(id),
  createProduct: (d) => {
    const r = Q.insertProduct.run(
      d.category_id || null, d.name, d.description || '', Number(d.price) || 0,
      d.sale_price ? Number(d.sale_price) : null, d.image_url || null,
      d.badge || null, d.badge_color || null, d.tags || null, d.features || null,
      d.is_package ? 1 : 0, d.active === undefined ? 1 : (d.active ? 1 : 0),
      Number(d.sort_order) || 0
    );
    return Q.getProduct.get(r.lastInsertRowid);
  },
  updateProduct: (id, d) => Q.updateProduct.run(
    d.category_id || null, d.name, d.description || '', Number(d.price) || 0,
    d.sale_price ? Number(d.sale_price) : null, d.image_url || null,
    d.badge || null, d.badge_color || null, d.tags || null, d.features || null,
    d.is_package ? 1 : 0, d.active ? 1 : 0, Number(d.sort_order) || 0, id
  ),
  deleteProduct: (id) => Q.deleteProduct.run(id),

  // orders
  createOrder: (userId, items, total, paymentMethod, transactionId = null, notes = null) => {
    const tx = db.transaction(() => {
      const r = Q.insertOrder.run(userId, total, paymentMethod, 'pending', transactionId, notes);
      const orderId = r.lastInsertRowid;
      items.forEach(it => Q.insertOrderItem.run(orderId, it.product_id, it.name, it.qty, it.price, it.meta || null));
      return orderId;
    });
    return tx();
  },
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
