import { categorize } from '../lib/categorize.js';
import type { AiResponse } from '../types.js';

/**
 * מנוע NLU מבוסס-חוקים בעברית (offline, ללא תלות חיצונית).
 * מנתח בקשת משתמש בעברית ומחזיר תשובה + פעולה מובנית (JSON).
 * משמש כברירת מחדל וכ-fallback כאשר אין מפתח API ל-LLM.
 */
export function parseHebrew(text: string): AiResponse {
  const t = text.trim();

  // --- הוספה לרשימת קניות ---
  if (/(תוסיף|הוסף|תוסיפי|להוסיף|תכניס)/.test(t)) {
    const m = t.match(/(?:תוסיף|הוסף|תוסיפי|להוסיף|תכניס)\s+(.+)$/);
    let raw = (m?.[1] ?? '').replace(/\s+ל(רשימה|קניות|סל)(\s+הקניות)?\.?$/, '').trim();
    const qtyMatch = raw.match(/(\d+)/);
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    const name = raw.replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || raw;
    if (name) {
      const department = categorize(name);
      return {
        reply: `הוספתי "${name}" לרשימת הקניות (מחלקת ${department}).`,
        action: { type: 'add_shopping_item', name, quantity, department },
      };
    }
  }

  // --- שאלת תוקף מסמך ---
  if (/(תוקף|פג|מתי).*(דרכון|תעודת זהות|ת"ז|רישיון)/.test(t)) {
    const documentHint = /דרכון/.test(t)
      ? 'דרכון'
      : /רישיון/.test(t)
        ? 'רישיון נהיגה'
        : 'תעודת זהות';
    return {
      reply: `בודק את תוקף ה${documentHint} בכספת המסמכים...`,
      action: { type: 'query_document_expiry', documentHint },
    };
  }

  // --- שאלות פיננסיות ---
  if (/(כמה|שווי|תיק|פנסי|חיסכון|כסף|נכס|פיננס)/.test(t)) {
    return {
      reply: 'הנה ריכוז המצב הפיננסי המשפחתי שלכם.',
      action: { type: 'query_finance' },
    };
  }

  return {
    reply: 'לא הבנתי את הבקשה. נסו למשל: "תוסיף חלב לרשימה" או "מתי פג תוקף הדרכון?"',
    action: { type: 'unknown' },
  };
}
