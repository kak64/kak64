import { Router } from 'express';
import { store } from '../store.js';

const router = Router();

// GET /api/finance — ריכוז פיננסי (נתוני דמה המדמים משיכה מהמסלקה הפנסיונית)
router.get('/', (_req, res) => {
  res.json(store.getFinance());
});

export default router;
