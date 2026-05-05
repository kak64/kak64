const express = require('express');
const db = require('../db');
const fivem = require('../fivem');
const router = express.Router();

router.get('/', (req, res) => {
  const products = db.listProducts();
  const categories = db.listCategoriesWithCounts();
  const featured = db.listFeaturedProducts();
  const bestSellers = db.listBestSellers();
  const flashDeals = db.listFlashDeals();
  const testimonials = db.listTestimonials();
  const faqs = db.listFaq();
  const activity = db.recentItemsForActivity(15);
  const topBuyers = db.topBuyersThisMonth(5);
  const monthlyGoal = Number(db.getSetting('monthly_goal') || 0);
  const monthlySales = db.salesThisMonth();
  res.render('home', {
    title: 'Infinity IL — חנות',
    products, categoriesAll: categories,
    featured, bestSellers, flashDeals, testimonials, faqs, activity,
    topBuyers, monthlyGoal, monthlySales,
    siteName: db.getSetting('site_name'),
    siteSubtitle: db.getSetting('site_subtitle'),
    discordInvite: db.getSetting('discord_invite'),
    heroTagline: db.getSetting('hero_tagline'),
    heroImageUrl: db.getSetting('hero_image_url'),
    monthlyGoalLabel: db.getSetting('monthly_goal_label') || 'יעד חודשי',
    fivemServerName: db.getSetting('fivem_server_name'),
    homeMessageTitle: db.getSetting('home_message_title') || '',
    homeMessageBody: db.getSetting('home_message_body') || ''
  });
});

router.get('/category/:slug', (req, res) => {
  const cat = db.getCategoryBySlug(req.params.slug);
  if (!cat) return res.status(404).render('error', { title: '404', message: 'קטגוריה לא נמצאה' });
  const products = db.listProductsByCategory(cat.slug);
  res.render('category', { title: cat.name, category: cat, products });
});

router.get('/product/:id', (req, res) => {
  const p = db.getProduct(req.params.id);
  if (!p) return res.status(404).render('error', { title: '404', message: 'מוצר לא נמצא' });
  db.bumpProductViews(p.id);
  const reviews = db.listReviewsForProduct(p.id);
  const related = db.listProductsByCategory(p.category_slug || '').filter(x => x.id !== p.id).slice(0, 4);
  const flash = db.getActiveFlashForProduct(p.id);
  // Has the user already purchased? They can leave a review.
  let canReview = false;
  if (req.user) {
    const orders = db.listOrdersForUser(req.user.id);
    canReview = orders.some(o => {
      if (o.status !== 'paid') return false;
      const items = db.raw.prepare('SELECT product_id FROM order_items WHERE order_id = ?').all(o.id);
      return items.some(i => i.product_id === p.id);
    });
  }
  res.render('product', { title: p.name, product: p, related, reviews, flashDeal: flash, canReview });
});

router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const results = q ? db.searchProducts(q) : [];
  res.render('search', { title: q ? `חיפוש: ${q}` : 'חיפוש', q, results });
});

// ---- API ----
router.get('/api/server-status', async (req, res) => {
  const s = await fivem.getStatus();
  res.json(s);
});

router.get('/api/activity', (req, res) => {
  const limit = Math.min(30, parseInt(req.query.limit || '15', 10));
  const items = db.recentItemsForActivity(limit).map(i => ({
    product_name: i.product_name,
    qty: i.qty,
    username: i.username,
    avatar_url: i.avatar_url,
    image_url: i.image_url,
    product_id: i.product_id,
    ago: i.created_at
  }));
  res.json(items);
});

router.get('/api/flash-deals', (req, res) => {
  res.json(db.listFlashDeals());
});

module.exports = router;
