import type { AiResponse } from '../types';
import { categorize } from '../lib/categorize';

/**
 * מנוע NLU מקומי (offline) בעברית — משמש כ-fallback כשהשרת אינו זמין.
 * לוגיקה תואמת ל-server/src/services/hebrewNlu.ts.
 */
export function localAiAnswer(text: string): AiResponse {
  const t = text.trim();

  // הוספה לרשימת קניות: "תוסיף/הוסף ... לרשימה / לקניות"
  const addMatch = t.match(/(?:תוסיף|הוסף|תוסיפי|להוסיף)\s+(.+?)(?:\s+ל(?:רשימה|קניות|סל).*)?$/);
  if (addMatch && /(תוסיף|הוסף|תוסיפי|להוסיף)/.test(t)) {
    const name = addMatch[1].replace(/\s+ל(רשימה|קניות|סל).*$/, '').trim();
    const qtyMatch = name.match(/(\d+)/);
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    const cleanName = name.replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || name;
    return {
      reply: `הוספתי "${cleanName}" לרשימת הקניות (${categorize(cleanName)}).`,
      action: { type: 'add_shopping_item', name: cleanName, quantity, department: categorize(cleanName) },
    };
  }

  // שאלת תוקף מסמך: "מתי פג תוקף הדרכון ..."
  if (/(תוקף|פג|מתי).*(דרכון|תעודת זהות|ת"ז|רישיון)/.test(t)) {
    const hint = /דרכון/.test(t) ? 'דרכון' : /רישיון/.test(t) ? 'רישיון נהיגה' : 'תעודת זהות';
    return {
      reply: `בודק את תוקף ה${hint} בכספת המסמכים...`,
      action: { type: 'query_document_expiry', documentHint: hint },
    };
  }

  // שאלות פיננסיות
  if (/(כמה|שווי|תיק|פנסי|חיסכון|כסף|נכס)/.test(t)) {
    return {
      reply: 'הנה ריכוז המצב הפיננסי המשפחתי שלכם.',
      action: { type: 'query_finance' },
    };
  }

  return {
    reply: 'לא הבנתי את הבקשה. אפשר למשל: "תוסיף חלב לרשימה" או "מתי פג תוקף הדרכון?"',
    action: { type: 'unknown' },
  };
}
