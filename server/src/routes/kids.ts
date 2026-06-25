import { Router } from 'express';
import { store } from '../store.js';
import type { KidTxCategory } from '../types.js';

const router = Router();

// GET /api/kids
router.get('/', (_req, res) => {
  res.json(store.getKids());
});

// POST /api/kids/:id/spend — הילד רושם הוצאה (מוריד מהיתרה)
router.post('/:id/spend', (req, res) => {
  const { label, amount, category } = req.body ?? {};
  const amt = Number(amount);
  if (!label || typeof label !== 'string' || !Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'label ו-amount נדרשים' });
  }
  const kid = store.kidSpend(req.params.id, label.trim(), amt, (category as KidTxCategory) ?? 'other');
  if (!kid) return res.status(404).json({ error: 'ילד לא נמצא' });
  res.status(201).json(kid);
});

export default router;
