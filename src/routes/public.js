const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY price_monthly').all();
  res.render('home', { title: 'דף הבית', plans });
});

router.get('/plans', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY price_monthly').all();
  res.render('plans', { title: 'חבילות אחסון', plans });
});

router.get('/about', (req, res) => {
  res.render('about', { title: 'אודות' });
});

router.get('/contact', (req, res) => {
  res.render('contact', { title: 'צור קשר' });
});

router.get('/terms', (req, res) => {
  res.render('terms', { title: 'תנאי שימוש' });
});

module.exports = router;
