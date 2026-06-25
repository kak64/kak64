import { Router } from 'express';
import { store } from '../store.js';

const router = Router();

// GET /api/documents — מסמכים משפחתיים (לחישוב תוקף בצד הלקוח)
router.get('/documents', (_req, res) => {
  res.json(store.getDocuments());
});

// GET /api/passwords — כספת סיסמאות (בפרודקשן מוחזר מפוענח מ-AES-256 לאחר אימות)
router.get('/passwords', (_req, res) => {
  res.json(store.getPasswords());
});

export default router;
