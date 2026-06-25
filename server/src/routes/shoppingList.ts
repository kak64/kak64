import { Router } from 'express';
import { store } from '../store.js';

const router = Router();

// GET /api/shopping-list — כל המוצרים
router.get('/', async (_req, res) => {
  res.json(await store.getShopping());
});

// POST /api/shopping-list — הוספת מוצר (ממויין אוטומטית למחלקה)
router.post('/', async (req, res) => {
  const { name, quantity } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name נדרש' });
  }
  const qty = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  const item = await store.addShopping(name.trim(), qty);
  res.status(201).json(item);
});

export default router;
