// ניתוח ביטויי זמן בעברית -> תאריך יעד (ISO) ותווית קריאה

interface DateTimeMatch {
  dueAt: string | null;
  dueLabel: string | null;
  /** הטקסט לאחר הסרת ביטויי הזמן (לחילוץ הנושא/המוצר) */
  rest: string;
}

const DAY_WORDS: Record<string, number> = {
  ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6,
};

const PART_OF_DAY: { re: RegExp; hour: number; label: string }[] = [
  { re: /בבוקר/, hour: 8, label: 'בבוקר' },
  { re: /בצהריים|בצהרים/, hour: 13, label: 'בצהריים' },
  { re: /אחה"?צ|אחר[\s-]?הצהריים/, hour: 16, label: 'אחר הצהריים' },
  { re: /בערב/, hour: 19, label: 'בערב' },
  { re: /בלילה/, hour: 21, label: 'בלילה' },
];

export function parseHebrewDateTime(text: string): DateTimeMatch {
  let rest = ` ${text} `;
  let label: string | null = null;
  const now = new Date();
  const target = new Date(now);
  let hasDate = false;
  let hour = 9; // ברירת מחדל אם צוין יום אך לא שעה
  let hasTime = false;

  // יום יחסי (כולל קידומת "ל" כמו "למחר")
  if (/ל?מחרתיים/.test(rest)) {
    target.setDate(now.getDate() + 2);
    label = 'מחרתיים';
    rest = rest.replace(/ל?מחרתיים/g, ' ');
    hasDate = true;
  } else if (/ל?מחר/.test(rest)) {
    target.setDate(now.getDate() + 1);
    label = 'מחר';
    rest = rest.replace(/ל?מחר/g, ' ');
    hasDate = true;
  } else if (/ל?היום/.test(rest)) {
    label = 'היום';
    rest = rest.replace(/ל?היום/g, ' ');
    hasDate = true;
  } else {
    // יום בשבוע: "ביום ראשון" / "בשבת"
    for (const [word, dow] of Object.entries(DAY_WORDS)) {
      const re = new RegExp(`ב?יום\\s+${word}|בש${word === 'שבת' ? 'בת' : ''}`);
      if (new RegExp(`(ביום\\s+${word}|ב${word})`).test(rest)) {
        const diff = (dow - now.getDay() + 7) % 7 || 7;
        target.setDate(now.getDate() + diff);
        label = `יום ${word}`;
        rest = rest.replace(new RegExp(`(ביום\\s+${word}|ב${word})`, 'g'), ' ');
        hasDate = true;
        void re;
        break;
      }
    }
  }

  // שעה מפורשת: "בשעה 9" / "ב-9" / "ב9"
  const explicit = rest.match(/ב(?:שעה\s*)?[-]?\s*(\d{1,2})(?::(\d{2}))?/);
  if (explicit) {
    hour = parseInt(explicit[1], 10);
    const min = explicit[2] ? parseInt(explicit[2], 10) : 0;
    target.setHours(hour, min, 0, 0);
    hasTime = true;
    label = label ? `${label} בשעה ${explicit[1]}${explicit[2] ? ':' + explicit[2] : ''}` : `בשעה ${explicit[1]}`;
    rest = rest.replace(explicit[0], ' ');
  } else {
    // חלק מהיום
    for (const p of PART_OF_DAY) {
      if (p.re.test(rest)) {
        hour = p.hour;
        target.setHours(hour, 0, 0, 0);
        hasTime = true;
        label = label ? `${label} ${p.label}` : p.label;
        rest = rest.replace(p.re, ' ');
        break;
      }
    }
  }

  if (hasDate && !hasTime) target.setHours(hour, 0, 0, 0);

  const matched = hasDate || hasTime;
  return {
    dueAt: matched ? target.toISOString() : null,
    dueLabel: label,
    rest: rest.replace(/\s+/g, ' ').trim(),
  };
}
