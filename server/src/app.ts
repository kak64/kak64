import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import shoppingList from './routes/shoppingList.js';
import finance from './routes/finance.js';
import calendar from './routes/calendar.js';
import vault from './routes/vault.js';
import ai from './routes/ai.js';
import tasks from './routes/tasks.js';
import expenses from './routes/expenses.js';
import kids from './routes/kids.js';

export function createApp() {
  const app = express();

  // ----- Middleware הגנה בסיסי -----
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN?.split(',') ?? true,
      credentials: true,
    }),
  );
  app.use(express.json());

  // ----- Health check -----
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'family-plus-api' }));

  // ----- דף שורש ידידותי (זהו שרת ה-API; הממשק רץ על 5173) -----
  app.get('/', (_req, res) => {
    const clientUrl = process.env.CLIENT_ORIGIN?.split(',')[0] ?? 'http://localhost:5173';
    res.type('html').send(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>family+ API</title>
<style>body{font-family:system-ui;background:#0b0b16;color:#e2e8f0;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;text-align:center}a{color:#818cf8;font-weight:700}
.card{background:#13162c;border:1px solid #312e81;border-radius:24px;padding:40px;max-width:420px}
code{background:#0b0b16;padding:2px 8px;border-radius:6px;color:#a5b4fc}</style></head>
<body><div class="card">
<h1>🚀 +family API</h1>
<p>זהו <b>שרת ה-API</b> בלבד (פורט 4000) — אין כאן ממשק.</p>
<p>הממשק (האפליקציה) נמצא כאן:</p>
<p style="font-size:20px"><a href="${clientUrl}">${clientUrl}</a></p>
<p style="color:#64748b;font-size:13px">בדיקת חיים: <code>/api/health</code></p>
</div></body></html>`);
  });

  // ----- Routes -----
  app.use('/api/shopping-list', shoppingList);
  app.use('/api/finance', finance);
  app.use('/api/calendar', calendar);
  app.use('/api', vault); // /api/documents, /api/passwords
  app.use('/api/ai', ai);
  app.use('/api/tasks', tasks);
  app.use('/api/expenses', expenses);
  app.use('/api/kids', kids);

  // ----- 404 -----
  app.use((_req, res) => res.status(404).json({ error: 'נתיב לא נמצא' }));

  return app;
}
