import { Router } from 'express';
import { ask } from '../services/aiService.js';
import { store } from '../store.js';

const router = Router();

// POST /api/ai/ask — מקבל טקסט חופשי בעברית ומחזיר תשובה + פעולה מובנית
router.post('/ask', async (req, res) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text נדרש' });
  }

  const result = await ask(text.trim());

  // אם המשתמש ביקש להוסיף מוצר — נבצע את הפעולה בפועל בצד השרת
  if (result.action.type === 'add_shopping_item') {
    await store.addShopping(result.action.name, result.action.quantity);
  }

  res.json(result);
});

export default router;
