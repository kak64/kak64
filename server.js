import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Minimal .env loader (no external dependency) ---
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const express = (await import('express')).default;
const { default: authRoutes } = await import('./src/routes/auth.js');
const { default: homeRoutes } = await import('./src/routes/homes.js');
const { default: shoppingRoutes } = await import('./src/routes/shopping.js');
const { default: taskRoutes } = await import('./src/routes/tasks.js');
const { default: activityRoutes } = await import('./src/routes/activity.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// API
app.use('/api/auth', authRoutes);
app.use('/api/homes', homeRoutes);
app.use('/api/homes/:homeId/shopping', shoppingRoutes);
app.use('/api/homes/:homeId/tasks', taskRoutes);
app.use('/api/homes/:homeId/activity', activityRoutes);
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
app.listen(PORT, () => console.log(`Homly server running on http://localhost:${PORT}`));
