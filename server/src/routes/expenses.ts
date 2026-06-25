import { Router } from 'express';
import { store } from '../store.js';
import type { ExpenseCategory, Payer } from '../types.js';

const router = Router();

// GET /api/expenses
router.get('/', (_req, res) => {
  res.json(store.getExpenses());
});

// POST /api/expenses
router.post('/', (req, res) => {
  const { title, amount, category, payer } = req.body ?? {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title נדרש' });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) {
    return res.status(400).json({ error: 'amount לא תקין' });
  }
  const expense = store.addExpense({
    title: title.trim(),
    amount: amt,
    category: (category as ExpenseCategory) ?? 'פנאי',
    payer: (payer as Payer) ?? 'משותף',
  });
  res.status(201).json(expense);
});

export default router;
