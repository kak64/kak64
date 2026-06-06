import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// --- Minimal .env loader (no external dependency) ---
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Zero-config: if no real JWT secret is set, generate one and persist it to
// .env so logins survive restarts. Lets the app run with a plain `npm start`
// on any OS without manual setup.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-to-a-long-random-string') {
  const secret = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = secret;
  try {
    const prev = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').replace(/^\s*JWT_SECRET=.*$/m, '').trim() : '';
    fs.writeFileSync(envPath, `${prev ? prev + '\n' : ''}JWT_SECRET=${secret}\n`);
  } catch { /* read-only fs — keep the in-memory secret for this run */ }
}

const express = (await import('express')).default;
const { default: authRoutes } = await import('./src/routes/auth.js');
const { default: spaceRoutes } = await import('./src/routes/spaces.js');
const { default: listRoutes } = await import('./src/routes/lists.js');
const { default: itemRoutes } = await import('./src/routes/items.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// API
app.use('/api/auth', authRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api/spaces/:spaceId/lists', listRoutes);
app.use('/api/spaces/:spaceId/lists/:listId/items', itemRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve the built client (after `npm run build`).
const dist = path.join(__dirname, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// JSON 404 for unmatched API routes.
app.use('/api', (_req, res) => res.status(404).json({ error: 'לא נמצא' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Yachad server running on http://localhost:${PORT}`));
