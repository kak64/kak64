import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import shoppingList from './routes/shoppingList.js';
import finance from './routes/finance.js';
import calendar from './routes/calendar.js';
import vault from './routes/vault.js';
import ai from './routes/ai.js';

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

  // ----- Routes -----
  app.use('/api/shopping-list', shoppingList);
  app.use('/api/finance', finance);
  app.use('/api/calendar', calendar);
  app.use('/api', vault); // /api/documents, /api/passwords
  app.use('/api/ai', ai);

  // ----- 404 -----
  app.use((_req, res) => res.status(404).json({ error: 'נתיב לא נמצא' }));

  return app;
}
