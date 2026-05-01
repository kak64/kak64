require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');

const { initDb } = require('./src/db');
const { attachUser } = require('./src/middleware');

const publicRoutes = require('./src/routes/public');
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const serverRoutes = require('./src/routes/servers');
const billingRoutes = require('./src/routes/billing');
const ticketRoutes = require('./src/routes/tickets');
const adminRoutes = require('./src/routes/admin');

initDb();

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());

app.use(attachUser);

app.use((req, res, next) => {
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info')
  };
  res.locals.path = req.path;
  next();
});

app.use('/', publicRoutes);
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/dashboard/servers', serverRoutes);
app.use('/dashboard/billing', billingRoutes);
app.use('/dashboard/tickets', ticketRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('error', { title: 'לא נמצא', message: 'הדף שחיפשת אינו קיים.' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { title: 'שגיאה', message: 'אירעה שגיאה בשרת.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Hosting panel listening on http://localhost:${port}`);
});
