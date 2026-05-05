const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin, flash } = require('../middleware');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, Date.now() + '_' + safe);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

router.use(requireAuth, requireAdmin);

// ----- Dashboard -----
router.get('/', (req, res) => {
  const orders = db.listOrders();
  const totalRevenue = orders.filter(o => o.status === 'paid').reduce((s, o) => s + o.total, 0);
  const stats = {
    users: db.listUsers().length,
    products: db.listAllProducts().length,
    categories: db.listCategories().length,
    orders: orders.length,
    revenue: totalRevenue
  };
  const recentOrders = orders.slice(0, 8);
  res.render('admin/index', { title: 'ניהול', stats, recentOrders });
});

// ----- Products -----
router.get('/products', (req, res) => {
  const products = db.listAllProducts();
  res.render('admin/products', { title: 'מוצרים', products });
});

router.get('/products/new', (req, res) => {
  res.render('admin/product-form', { title: 'מוצר חדש', product: null });
});

router.post('/products/new', upload.single('image'), (req, res) => {
  const data = parseProductForm(req);
  const product = db.createProduct(data);
  flash(req, 'success', `נוצר מוצר: ${product.name}`);
  res.redirect('/admin/products');
});

router.get('/products/:id/edit', (req, res) => {
  const product = db.getProduct(req.params.id);
  if (!product) return res.status(404).render('error', { title: '404', message: 'לא נמצא' });
  res.render('admin/product-form', { title: 'עריכת מוצר', product });
});

router.post('/products/:id/edit', upload.single('image'), (req, res) => {
  const existing = db.getProduct(req.params.id);
  if (!existing) return res.status(404).render('error', { title: '404', message: 'לא נמצא' });
  const data = parseProductForm(req);
  if (!data.image_url) data.image_url = existing.image_url;
  db.updateProduct(req.params.id, data);
  flash(req, 'success', 'המוצר עודכן');
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', (req, res) => {
  db.deleteProduct(req.params.id);
  flash(req, 'success', 'המוצר נמחק');
  res.redirect('/admin/products');
});

function parseProductForm(req) {
  return {
    category_id: req.body.category_id ? parseInt(req.body.category_id, 10) : null,
    name: (req.body.name || '').trim(),
    description: req.body.description || '',
    price: req.body.price,
    sale_price: req.body.sale_price || null,
    image_url: req.file ? '/uploads/' + req.file.filename : (req.body.image_url || null),
    badge: req.body.badge || null,
    badge_color: req.body.badge_color || null,
    tags: req.body.tags || null,
    features: req.body.features || null,
    is_package: req.body.is_package ? 1 : 0,
    active: req.body.active ? 1 : 0,
    sort_order: req.body.sort_order || 0,
    stock: req.body.stock === '' ? null : req.body.stock,
    is_featured: req.body.is_featured ? 1 : 0
  };
}

// ----- Categories -----
router.get('/categories', (req, res) => {
  res.render('admin/categories', { title: 'קטגוריות', categoriesList: db.listCategories() });
});

router.post('/categories/new', (req, res) => {
  const { slug, name, icon, color, sort_order } = req.body;
  if (!slug || !name) {
    flash(req, 'error', 'נדרש slug ושם');
    return res.redirect('/admin/categories');
  }
  try {
    db.createCategory({ slug, name, icon, color, sort_order });
    flash(req, 'success', 'קטגוריה נוצרה');
  } catch (e) {
    flash(req, 'error', 'שגיאה ביצירה (אולי slug כפול)');
  }
  res.redirect('/admin/categories');
});

router.post('/categories/:id/edit', (req, res) => {
  const { slug, name, icon, color, sort_order } = req.body;
  db.updateCategory(req.params.id, { slug, name, icon, color, sort_order });
  flash(req, 'success', 'הקטגוריה עודכנה');
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', (req, res) => {
  db.deleteCategory(req.params.id);
  flash(req, 'success', 'הקטגוריה נמחקה');
  res.redirect('/admin/categories');
});

// ----- Orders -----
router.get('/orders', (req, res) => {
  const orders = db.listOrders();
  res.render('admin/orders', { title: 'הזמנות', orders });
});

router.get('/orders/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).render('error', { title: '404', message: 'לא נמצאה' });
  res.render('admin/order', { title: `הזמנה #${order.id}`, order });
});

router.post('/orders/:id/status', (req, res) => {
  db.updateOrderStatus(req.params.id, req.body.status || 'pending');
  flash(req, 'success', 'סטטוס עודכן');
  res.redirect('/admin/orders/' + req.params.id);
});

// ----- Users -----
router.get('/users', (req, res) => {
  res.render('admin/users', { title: 'משתמשים', usersList: db.listUsers() });
});

router.post('/users/:id/admin', (req, res) => {
  const isAdmin = req.body.is_admin === '1';
  db.setUserAdmin(req.params.id, isAdmin);
  flash(req, 'success', 'הרשאות עודכנו');
  res.redirect('/admin/users');
});

// ----- Flash deals -----
router.get('/flash-deals', (req, res) => {
  const deals = db.listAllFlashDeals();
  const products = db.listAllProducts();
  res.render('admin/flash-deals', { title: 'מבצעי בזק', deals, products });
});

router.post('/flash-deals/new', (req, res) => {
  const { product_id, deal_price, ends_at, active } = req.body;
  if (!product_id || !deal_price || !ends_at) {
    flash(req, 'error', 'נדרש מוצר, מחיר ותאריך סיום');
    return res.redirect('/admin/flash-deals');
  }
  db.createFlashDeal({
    product_id: parseInt(product_id, 10),
    deal_price: Number(deal_price),
    ends_at,
    active: active ? 1 : 0
  });
  flash(req, 'success', 'מבצע בזק נוצר');
  res.redirect('/admin/flash-deals');
});

router.post('/flash-deals/:id/delete', (req, res) => {
  db.deleteFlashDeal(req.params.id);
  flash(req, 'success', 'נמחק');
  res.redirect('/admin/flash-deals');
});

// ----- Testimonials -----
router.get('/testimonials', (req, res) => {
  res.render('admin/testimonials', { title: 'המלצות', items: db.listAllTestimonials() });
});

router.post('/testimonials/new', upload.single('avatar'), (req, res) => {
  db.createTestimonial({
    author: req.body.author,
    avatar_url: req.file ? '/uploads/' + req.file.filename : (req.body.avatar_url || null),
    rating: req.body.rating,
    body: req.body.body,
    active: req.body.active ? 1 : 0,
    sort_order: req.body.sort_order
  });
  flash(req, 'success', 'המלצה נוצרה');
  res.redirect('/admin/testimonials');
});

router.post('/testimonials/:id/delete', (req, res) => {
  db.deleteTestimonial(req.params.id);
  flash(req, 'success', 'נמחק');
  res.redirect('/admin/testimonials');
});

// ----- FAQ -----
router.get('/faq', (req, res) => {
  res.render('admin/faq', { title: 'שאלות נפוצות', items: db.listAllFaq() });
});

router.post('/faq/new', (req, res) => {
  db.createFaq({
    question: req.body.question,
    answer: req.body.answer,
    active: req.body.active ? 1 : 0,
    sort_order: req.body.sort_order
  });
  flash(req, 'success', 'נוסף');
  res.redirect('/admin/faq');
});

router.post('/faq/:id/delete', (req, res) => {
  db.deleteFaq(req.params.id);
  flash(req, 'success', 'נמחק');
  res.redirect('/admin/faq');
});

router.post('/settings/rotate-token', (req, res) => {
  const token = require('crypto').randomBytes(24).toString('hex');
  db.setSetting('fivem_api_token', token);
  flash(req, 'success', 'הטוקן הוחלף — עדכנו את הסקריפט בשרת');
  res.redirect('/admin/settings');
});

// ----- Redemptions -----
router.get('/redemptions', (req, res) => {
  const items = db.listAllRedemptions();
  res.render('admin/redemptions', { title: 'מימושים', items });
});

// ----- Settings -----
router.get('/settings', (req, res) => {
  const allKeys = [
    'site_name', 'site_subtitle', 'discord_invite', 'hero_tagline',
    'hero_image_url', 'monthly_goal', 'monthly_goal_label',
    'announcement_bar', 'announcement_link',
    'discord_webhook_url', 'fivem_endpoint', 'fivem_server_name',
    'fivem_api_token', 'receipt_prefix',
    'extra_fee', 'discount_codes',
    'points_per_currency', 'points_redeem_rate', 'referral_bonus'
  ];
  const settingsMap = {};
  allKeys.forEach(k => settingsMap[k] = db.getSetting(k) || '');
  res.render('admin/settings', { title: 'הגדרות', settingsMap });
});

router.post('/settings', upload.single('hero_image'), (req, res) => {
  if (req.file) {
    db.setSetting('hero_image_url', '/uploads/' + req.file.filename);
  }
  Object.keys(req.body).forEach(k => db.setSetting(k, req.body[k] || ''));
  flash(req, 'success', 'ההגדרות נשמרו');
  res.redirect('/admin/settings');
});

module.exports = router;
