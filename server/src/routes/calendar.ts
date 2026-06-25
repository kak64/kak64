import { Router } from 'express';
import { store } from '../store.js';

const router = Router();

// GET /api/calendar — אירועי יומן (כולל מסונכרנים מ-Google Calendar)
router.get('/', (_req, res) => {
  res.json(store.getEvents());
});

export default router;
