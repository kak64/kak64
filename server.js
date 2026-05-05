require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const fs = require('fs');

const db = require('./src/db');
const { attachUser, formatCurrency, effectivePrice, avgRating } = require('./src/middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure dirs exist
['db', 'public/uploads'].forEach(d => {
  const full = path.join(__dirname, d);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'db') }),
  secret: process.env.SESSION_SECRET || 'infinity-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30, httpOnly: true }
}));

app.use(attachUser);

// Globals available to every view
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.cartCount = req.session.cart
    ? req.session.cart.reduce((s, i) => s + i.qty, 0)
    : 0;
  res.locals.currencySymbol = process.env.CURRENCY_SYMBOL || '₪';
  res.locals.currency = process.env.CURRENCY || 'ILS';
  res.locals.formatCurrency = formatCurrency;
  res.locals.effectivePrice = effectivePrice;
  res.locals.avgRating = avgRating;
  res.locals.getActiveFlashForProduct = (id) => db.getActiveFlashForProduct(id);
  res.locals.isWishlisted = (pid) => req.user ? db.isWishlisted(req.user.id, pid) : false;
  res.locals.currentPath = req.path;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.categories = db.listCategoriesWithCounts();
  res.locals.announcement = db.getSetting('announcement_bar') || '';
  res.locals.announcementLink = db.getSetting('announcement_link') || '';
  res.locals.discordInviteGlobal = db.getSetting('discord_invite') || '';
  // Sidebar-shared globals (available on every page)
  res.locals.discordInvite = db.getSetting('discord_invite') || '';
  res.locals.fivemServerName = db.getSetting('fivem_server_name') || '';
  res.locals.monthlyGoal = Number(db.getSetting('monthly_goal') || 0);
  res.locals.monthlyGoalLabel = db.getSetting('monthly_goal_label') || 'יעד חודשי';
  res.locals.monthlySales = db.salesThisMonth();
  res.locals.topBuyers = db.topBuyersThisMonth(5);
  res.locals.activity = db.recentItemsForActivity(8);
  next();
});

// Routes
app.use('/', require('./src/routes/public'));
app.use('/auth', require('./src/routes/auth'));
app.use('/cart', require('./src/routes/cart'));
app.use('/checkout', require('./src/routes/checkout'));
app.use('/wishlist', require('./src/routes/wishlist'));
app.use('/reviews', require('./src/routes/reviews'));
app.use('/dashboard', require('./src/routes/dashboard'));
app.use('/admin', require('./src/routes/admin'));
app.use('/api', require('./src/routes/api'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: '404', message: 'הדף לא נמצא' });
});

// 500
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'שגיאה', message: 'אירעה שגיאת שרת' });
});

app.listen(PORT, () => {
  console.log(`✦ Infinity IL store listening on http://localhost:${PORT}`);
});
