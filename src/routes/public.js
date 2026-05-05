const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const products = db.listProducts();
  const categories = db.listCategories();
  res.render('home', {
    title: 'Infinity IL — חנות',
    products, categoriesAll: categories,
    siteName: db.getSetting('site_name'),
    siteSubtitle: db.getSetting('site_subtitle'),
    discordInvite: db.getSetting('discord_invite'),
    heroTagline: db.getSetting('hero_tagline')
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
  const related = db.listProductsByCategory(p.category_slug || '').filter(x => x.id !== p.id).slice(0, 4);
  res.render('product', { title: p.name, product: p, related });
});

module.exports = router;
