require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initDb, purgeOldLoginAttempts } = require('./src/db');
const { attachUser } = require('./src/middleware');
const { csrfMiddleware } = require('./src/csrf');

const publicRoutes = require('./src/routes/public');
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const serverRoutes = require('./src/routes/servers');
const billingRoutes = require('./src/routes/billing');
const ticketRoutes = require('./src/routes/tickets');
const adminRoutes = require('./src/routes/admin');
const accountRoutes = require('./src/routes/account');

// Sanity-check critical env vars
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('FATAL: SESSION_SECRET must be set to at least 32 chars in .env');
  console.error('Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
  console.error('FATAL: ENCRYPTION_KEY must be set to a 64-char hex string in .env');
  console.error('Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

initDb();
purgeOldLoginAttempts();

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Hide framework fingerprint
app.disable('x-powered-by');

// Trust reverse proxy (set TRUST_PROXY=1 if behind nginx/Caddy/Cloudflare)
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // EJS uses inline event handlers in places
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: isProd ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProd ? '7d' : 0,
  etag: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
app.use(flash());

// Global rate limit (gentle): 600 requests per 15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'יותר מדי בקשות. נסה שוב בעוד מספר דקות.'
}));

// Strict rate limits for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד 15 דקות.'
});
app.use('/login', authLimiter);
app.use('/register', authLimiter);

app.use(attachUser);

app.use((req, res, next) => {
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info')
  };
  res.locals.path = req.path;
  res.locals.brand = process.env.BRAND_NAME || 'FutureIL Hosting';
  res.locals.supportEmail = process.env.SUPPORT_EMAIL || 'support@example.com';
  res.locals.supportPhone = process.env.SUPPORT_PHONE || '03-0000000';
  next();
});

app.use(csrfMiddleware);

app.use('/', publicRoutes);
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/dashboard/servers', serverRoutes);
app.use('/dashboard/billing', billingRoutes);
app.use('/dashboard/tickets', ticketRoutes);
app.use('/dashboard', accountRoutes);
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
  console.log(`${process.env.BRAND_NAME || 'Hosting panel'} listening on http://localhost:${port}`);
  if (!isProd) console.log('NODE_ENV != production: secure cookies disabled (dev mode)');
});
