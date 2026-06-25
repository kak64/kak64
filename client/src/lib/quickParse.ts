import type { ExpenseCategory, KidTxCategory, QuickAddKind, QuickAddParseResult } from '../types';
import { parseHebrewDateTime } from './datetime';

// פעלים/מילות פתיחה להסרה כדי לחלץ את הנושא
const LEAD_VERBS =
  /^(צריך\s+|אני\s+צריך\s+|תזכיר\s+לי\s+|תזכורת\s+|לקנות\s+את\s+|לקנות\s+|לקחת\s+|להביא\s+|לעשות\s+|תוסיף\s+|להוסיף\s+|תוסיפי\s+|לשלם\s+(?:על\s+|עבור\s+)?)/;

function stripLead(text: string): string {
  let t = text.trim();
  // ייתכנו כמה מילות פתיחה רצופות ("צריך לקנות")
  for (let i = 0; i < 3; i++) {
    const next = t.replace(LEAD_VERBS, '');
    if (next === t) break;
    t = next.trim();
  }
  return t;
}

/** מנקה מילות קישור מיותרות (לא מסיר "ל" שצמודה לפועל כמו "לתאם") */
function cleanSubject(text: string): string {
  return text
    .replace(/^את\s+/, '') // "את" מוביל
    .replace(/(^|\s)ל(\s|$)/g, ' ') // אות "ל" בודדת שנותרה
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * חילוץ סכום בשקלים: "ב-15", "ב15", "15 ש"ח", "₪15", "15 שקל"
 * מחזיר את הסכום ואת הטקסט ללא ביטוי הסכום.
 */
function extractAmount(text: string): { amount: number | null; rest: string } {
  const patterns = [
    /ב[-]?\s*(\d+(?:\.\d+)?)\s*(?:₪|ש"?ח|שקל(?:ים)?)?/,
    /(\d+(?:\.\d+)?)\s*(?:₪|ש"?ח|שקל(?:ים)?)/,
    /₪\s*(\d+(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      return { amount: parseFloat(m[1]), rest: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
    }
  }
  return { amount: null, rest: text };
}

const EXPENSE_KEYWORDS: { re: RegExp; category: ExpenseCategory }[] = [
  { re: /סופר|מזון|אוכל|מכולת|ירקות|רמי\s?לוי|שופרסל|רמי/, category: 'סופר/מזון' },
  { re: /ארנונה|חשמל|מים|גז|חשבון|אינטרנט|כבלים|ועד\s?בית/, category: 'חשבונות' },
  { re: /חוג|בית\s?ספר|גן|שכר\s?לימוד|חינוך|מורה|קייטנה/, category: 'חינוך/חוגים' },
  { re: /דלק|רכב|אוטו|תחבורה|מוסך|חניה|רב\s?קו|אוטובוס|רכבת/, category: 'רכב/תחבורה' },
  { re: /מסעדה|סרט|קולנוע|בילוי|פנאי|חופשה|מתנה|בגדים/, category: 'פנאי' },
];

export function guessExpenseCategory(text: string): ExpenseCategory {
  for (const { re, category } of EXPENSE_KEYWORDS) {
    if (re.test(text)) return category;
  }
  return 'פנאי';
}

const KID_KEYWORDS: { re: RegExp; category: KidTxCategory }[] = [
  { re: /גלידה|אוכל|פיצה|חטיף|ממתק|שוקולד|שתי|המבורגר|פלאפל/, category: 'food' },
  { re: /סרט|קולנוע|הצגה/, category: 'movie' },
  { re: /משחק|פלייסטיישן|גיים|אפליקצי|רובלוקס|פורטנייט/, category: 'games' },
  { re: /צעצוע|בובה|לגו|כדור/, category: 'toys' },
];

export function guessKidCategory(text: string): KidTxCategory {
  for (const { re, category } of KID_KEYWORDS) {
    if (re.test(text)) return category;
  }
  return 'other';
}

/**
 * ניתוח חכם של טקסט חופשי בעברית עבור ה-Quick Add.
 * דוגמה: "לקנות חלב למחר בבוקר" =>
 *   shoppingName: "חלב", taskTitle: "לקנות חלב", dueAt: <מחר 08:00>, dueLabel: "מחר בבוקר"
 */
export function parseQuickAdd(rawText: string, kind: QuickAddKind): QuickAddParseResult {
  const text = rawText.trim();
  const result: QuickAddParseResult = {};

  if (kind === 'expense') {
    const { amount, rest } = extractAmount(text);
    const subject = cleanSubject(stripLead(rest)) || 'הוצאה';
    result.amount = amount ?? 0;
    result.expenseTitle = subject;
    return result;
  }

  // shopping / task — מפצלים זמן מהנושא
  const { dueAt, dueLabel, rest } = parseHebrewDateTime(text);
  const subject = cleanSubject(stripLead(rest));

  if (kind === 'shopping') {
    result.shoppingName = subject;
    if (dueAt) {
      // פיצול: גם המוצר נוסף לקניות וגם נוצרת תזכורת ביומן
      result.taskTitle = `לקנות ${subject}`;
      result.dueAt = dueAt;
      result.dueLabel = dueLabel ?? undefined;
    }
  } else {
    result.taskTitle = subject || text;
    if (dueAt) {
      result.dueAt = dueAt;
      result.dueLabel = dueLabel ?? undefined;
    }
  }

  return result;
}
