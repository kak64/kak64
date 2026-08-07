// BuildCheck Portal — the smart assistant (העוזר החכם).
// Two honest engines, no smoke: (1) a data engine that answers questions
// from the company's live task data, and (2) a curated construction
// knowledge base (Hebrew field norms). Designed as a pluggable provider —
// a server deployment can route the same ask() call to the Claude API.

import { todayStr } from './util.js';
import { categoryById, roleById } from './directory.js';
import { STATUS, isOverdue, companyTasks, companyStats, tasksForWorker } from './tasks.js';

// ---------------------------------------------------------------------------
// Curated construction knowledge base (industry norms — verify against the
// current standard / project spec; phrased accordingly).
// ---------------------------------------------------------------------------

export const KNOWLEDGE = [
  { id: 'sink-water-height', keywords: ['גובה', 'נקודות מים', 'כיור'], categoryId: 'plumbing', subId: 'complet',
    answer: 'גובה נקודות מים בכיור: 60 ס"מ מהריצוף הסופי. בשיטת השטיכמוס (קו לייזר בגובה 1 מטר) — מודדים 40 ס"מ מקו הלייזר כלפי מטה.' },
  { id: 'sink-drain-height', keywords: ['ניקוז', 'דלוחין', 'כיור', 'גובה'], categoryId: 'plumbing', subId: 'complet',
    answer: 'גובה ניקוז דלוחין של כיור: 50 ס"מ מהריצוף הסופי — בדיוק 50 ס"מ מתחת לקו לייזר של 1 מטר.' },
  { id: 'interpuck', keywords: ['אינטרפוץ', 'מקלחת', 'מרכז'], categoryId: 'plumbing', subId: 'complet',
    answer: 'מרכז אינטרפוץ במקלחת: 42 ס"מ מהקיר כולל טיח. נקודות המים — 22 ס"מ מהקיר בגובה 1.10 מטר (10 ס"מ מעל קו לייזר של מטר).' },
  { id: 'plaster', keywords: ['טיח', 'קרמיקה', 'תוספת', 'קיר גולמי'], categoryId: 'plumbing', subId: 'complet',
    answer: 'כשמודדים מקיר גולמי מוסיפים 2–3 ס"מ עבור טיח וקרמיקה. לדוגמה: מידה 45 ס"מ בתוכנית → יעד 47–48 ס"מ בשטח.' },
  { id: 'drain-slope', keywords: ['שיפוע', 'דלוחין', 'ביוב', 'קו'], categoryId: 'plumbing', subId: 'drains',
    answer: 'שיפוע תקין לקווי דלוחין: 1.5%–2% לכיוון הקולטן (למשל ירידה של 3–4 ס"מ על 2 מטר). פחות מזה — זרימה איטית וסתימות; יותר מדי — המים בורחים מהמוצקים.' },
  { id: 'laser-datum', keywords: ['שטיכמוס', 'לייזר', 'קו ייחוס', 'ממ"ד', 'ממד'], categoryId: 'plumbing', subId: 'complet',
    answer: 'קו שטיכמוס: מודדים 1.00 מטר מהמדרגה החיצונית הנמוכה של הממ"ד לכיוון הדירה (לא בתוך הממ"ד), פותחים לייזר בגובה הזה, וכל בדיקת גובה נמדדת ממנו: מרחק = 100 ס"מ − גובה היעד.' },
  { id: 'socket-height', keywords: ['גובה', 'שקע', 'שקעים'], categoryId: 'electric', subId: 'points',
    answer: 'גובה שקעים מקובל: 25 ס"מ מהריצוף בחדרים, ומעל משטח עבודה במטבח כ-110–120 ס"מ. מפסקי תאורה: כ-110 ס"מ. יש לאמת מול תוכנית החשמל של הפרויקט.' },
  { id: 'socket-water', keywords: ['שקע', 'מים', 'מרחק', 'מטבח'], categoryId: 'electric', subId: 'points',
    answer: 'מרחק בטיחות מקובל בין שקע חשמל לנקודת מים/ברז: 60 ס"מ לפחות (או מיגון מתאים). נקודה קרובה מדי היא ליקוי בטיחותי — לתעד ולתקן.' },
  { id: 'rcd', keywords: ['פחת', 'ממסר', 'לוח חשמל'], categoryId: 'electric', subId: 'panel',
    answer: 'בלוח דירתי חובה ממסר פחת ברגישות 30mA. בבדיקת לוח: סימון מעגלים ברור, חיזוק מוליכים, ובדיקת לחצן הפחת בפועל.' },
  { id: 'railing', keywords: ['מעקה', 'מעקות', 'גובה'], categoryId: 'safety', subId: 'openings',
    answer: 'מעקה תקני: גובה 105 ס"מ לפחות, ללא פתחים שכדור בקוטר 10 ס"מ עובר דרכם, ועמידות לעומס אופקי. פתחים ברצפה חייבים כיסוי קשיח מסומן או מעקה היקפי.' },
  { id: 'flood-test', keywords: ['הצפה', 'איטום', 'בדיקת הצפה'], categoryId: 'sealing', subId: 'wet',
    answer: 'בדיקת הצפה בחדר רטוב: אוטמים את הניקוז, מציפים כ-2–3 ס"מ מים ל-48 שעות, ובודקים רטיבות בתקרה למטה ובקירות סמוכים. חובה לתעד לפני ריצוף.' },
  { id: 'membrane-overlap', keywords: ['יריעות', 'ביטומניות', 'חפיפה', 'גג'], categoryId: 'sealing', subId: 'roof',
    answer: 'ביריעות ביטומניות בגג: חפיפה של 10 ס"מ לפחות בין יריעות, הלחמה מלאה בשוליים, ורולקות בפינות. לבדוק סביב קולטנים ומעברי צנרת.' },
  { id: 'curing', keywords: ['אשפרה', 'בטון', 'יציקה'], categoryId: 'shell', subId: 'casting',
    answer: 'אשפרת בטון: הרטבה שוטפת לפחות 7 ימים אחרי היציקה (או יריעות/חומר אשפרה). דילוג על אשפרה פוגע בחוזק הסופי ומייצר סדיקה.' },
  { id: 'balcony-slope', keywords: ['שיפוע', 'מרפסת', 'ריצוף', 'ניקוז מרפסת'], categoryId: 'finish', subId: 'tiling',
    answer: 'שיפוע ריצוף במרפסות ואזורים רטובים: 1%–1.5% לכיוון הניקוז. בודקים עם פלס ומים בפועל — שלולית עומדת = ליקוי.' },
  { id: 'tile-flatness', keywords: ['מישוריות', 'ריצוף', 'סרגל'], categoryId: 'finish', subId: 'tiling',
    answer: 'מישוריות ריצוף מקובלת: סטייה עד 2 מ"מ בסרגל של 2 מטר, ללא "שיניים" בין אריחים. בדיקה בסרגל אלומיניום ופנס צד.' },
  { id: 'scaffold', keywords: ['פיגום', 'פיגומים'], categoryId: 'safety', subId: 'scaffold',
    answer: 'פיגום: עיגון למבנה לפי תוכנית, משטחי עבודה מלאים, מאחזי יד ולוח רגל, ובדיקת מנהל עבודה אחרי כל הפסקת עבודה/מזג אוויר קיצון. תיעוד בפנקס.' },
  { id: 'ac-drain', keywords: ['ניקוז', 'מזגן', 'מיזוג'], categoryId: 'hvac', subId: 'ac-drain',
    answer: 'ניקוז מזגן: שיפוע רציף של כ-1% לפחות לכיוון נקודת הניקוז, חיבור תקין לקו דלוחין (עם סיפון), ובידוד צנרת הגז. נזילת עיבוי היא הליקוי הנפוץ ביותר אחרי אכלוס.' },
];

// ---------------------------------------------------------------------------
// The assistant
// ---------------------------------------------------------------------------

/**
 * Answer a user's question from live data or the knowledge base.
 * Returns { answer, source: 'data'|'knowledge'|'help', actions: [...] }.
 * Actions let the UI turn an answer into a move (e.g. prefill a dispatch).
 */
export function askAssistant(db, user, text, { today = todayStr() } = {}) {
  const q = String(text ?? '').trim();
  if (!q) return help(user);

  const dataAnswer = tryDataIntents(db, user, q, today);
  if (dataAnswer) return { ...dataAnswer, source: 'data' };

  const kb = bestKnowledge(q);
  if (kb) {
    const actions = [];
    if (user.kind === 'manager' && kb.categoryId) {
      actions.push({
        type: 'dispatch_draft',
        categoryId: kb.categoryId,
        subcategoryId: kb.subId,
        label: `📤 שלח משימת בדיקה — ${categoryById(db, kb.categoryId)?.name ?? ''}`,
      });
    }
    return { answer: kb.answer, source: 'knowledge', actions };
  }
  return help(user);
}

function help(user) {
  const dataExamples = user.kind === 'worker'
    ? '"מה יש לי היום?", "כמה משימות באיחור?"'
    : '"כמה משימות באיחור?", "מה שיעור הליקויים?", "מי העובד המוביל?"';
  return {
    source: 'help',
    actions: [],
    answer: `אני עונה על שני סוגי שאלות:\n• על הנתונים שלך — למשל ${dataExamples}\n• ידע מקצועי לשטח — למשל "מה גובה נקודות מים בכיור?", "מה שיפוע דלוחין תקין?", "כמה זמן בדיקת הצפה?"\n\nנסח שוב ואנסה לעזור.`,
  };
}

function bestKnowledge(q) {
  let best = null;
  let bestScore = 0;
  for (const entry of KNOWLEDGE) {
    const score = entry.keywords.reduce((s, k) => s + (q.includes(k) ? (k.length > 3 ? 2 : 1) : 0), 0);
    if (score > bestScore) { best = entry; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

// ---------------------------------------------------------------------------
// Data intents
// ---------------------------------------------------------------------------

function tryDataIntents(db, user, q, today) {
  const has = (...words) => words.some((w) => q.includes(w));

  if (user.kind === 'appadmin') {
    if (has('סטטוס', 'סיכום', 'מצב', 'כמה')) {
      const companies = db.companies.length;
      const workers = db.users.filter((u) => u.kind === 'worker').length;
      const managers = db.users.filter((u) => u.kind === 'manager').length;
      return { answer: `במערכת ${companies} חברות, ${managers} מנהלי חברה ו-${workers} עובדים. סה"כ ${db.tasks.length} משימות נשלחו.`, actions: [] };
    }
    return null;
  }

  // Worker: scope to own assignments.
  if (user.kind === 'worker') {
    if (has('היום', 'מחר') && has('משימ', 'יש לי', 'עבודה', 'מה')) {
      const date = has('מחר') ? addDays(today, 1) : today;
      const open = tasksForWorker(db, user.id, { date })
        .filter(({ assignment }) => assignment.status === STATUS.PENDING || assignment.status === STATUS.IN_PROGRESS);
      if (open.length === 0) return { answer: `אין לך משימות פתוחות ל${has('מחר') ? 'מחר' : 'היום'} 🙌`, actions: [] };
      const lines = open.map(({ task }) => `• ${task.title} — בשעה ${task.execTime}, לסיים עד ${task.dueDate}`);
      return { answer: `יש לך ${open.length} משימות:\n${lines.join('\n')}`, actions: [] };
    }
    if (has('איחור', 'באיחור')) {
      const late = tasksForWorker(db, user.id).filter(({ task, assignment }) => isOverdue(task, assignment, today));
      return late.length === 0
        ? { answer: 'אין לך משימות באיחור. כל הכבוד! ✔', actions: [] }
        : { answer: `יש לך ${late.length} משימות באיחור:\n${late.map(({ task }) => `• ${task.title} (עד ${task.dueDate})`).join('\n')}`, actions: [] };
    }
    if (has('סטטוס', 'סיכום', 'מצב')) {
      const mine = tasksForWorker(db, user.id);
      const done = mine.filter(({ assignment }) => assignment.status === STATUS.SUBMITTED || assignment.status === STATUS.APPROVED).length;
      return { answer: `סה"כ ${mine.length} משימות שלך: ${done} עם דוח שנשלח, ${mine.length - done} פתוחות.`, actions: [] };
    }
    return null;
  }

  // Manager: company-wide.
  const companyId = user.companyId;

  if (has('איחור', 'באיחור')) {
    const late = [];
    for (const task of companyTasks(db, companyId)) {
      for (const a of task.assignments) {
        if (isOverdue(task, a, today)) late.push({ task, a });
      }
    }
    if (late.length === 0) return { answer: 'אין משימות באיחור כרגע ✔', actions: [] };
    const lines = late.slice(0, 6).map(({ task, a }) => `• ${task.title} — ${userNameOf(db, a.workerId)} (עד ${task.dueDate})`);
    return { answer: `${late.length} שיוכים באיחור:\n${lines.join('\n')}${late.length > 6 ? `\n…ועוד ${late.length - 6}` : ''}`, actions: [] };
  }

  if (has('ליקוי', 'ליקויים')) {
    const byCat = new Map();
    let total = 0;
    for (const task of companyTasks(db, companyId)) {
      for (const a of task.assignments) {
        for (const item of a.report?.items ?? []) {
          if (item.status === 'defect') {
            total++;
            byCat.set(task.categoryId, (byCat.get(task.categoryId) ?? 0) + 1);
          }
        }
      }
    }
    if (total === 0) return { answer: 'לא דווחו ליקויים עד כה.', actions: [] };
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const lines = top.map(([catId, n]) => `• ${categoryById(db, catId)?.name ?? catId}: ${n}`);
    return { answer: `דווחו ${total} ליקויים בסך הכול:\n${lines.join('\n')}`, actions: [] };
  }

  if (has('עובד') && has('מוביל', 'הכי', 'מצטיין')) {
    const perWorker = new Map();
    for (const task of companyTasks(db, companyId)) {
      for (const a of task.assignments) {
        if (a.status === STATUS.SUBMITTED || a.status === STATUS.APPROVED) {
          perWorker.set(a.workerId, (perWorker.get(a.workerId) ?? 0) + 1);
        }
      }
    }
    if (perWorker.size === 0) return { answer: 'עוד לא נשלחו דוחות, אז אין דירוג עובדים.', actions: [] };
    const sorted = [...perWorker.entries()].sort((a, b) => b[1] - a[1]);
    const [topId, topCount] = sorted[0];
    return { answer: `העובד עם הכי הרבה דוחות: ${userNameOf(db, topId)} (${topCount} דוחות).\n${sorted.slice(0, 5).map(([id, n]) => `• ${userNameOf(db, id)}: ${n}`).join('\n')}`, actions: [] };
  }

  if (has('סטטוס', 'סיכום', 'מצב', 'איך אנחנו')) {
    const s = companyStats(db, companyId, today);
    return {
      answer: `תמונת מצב: ${s.total} שיוכי משימות — ${s.pending} ממתינים, ${s.in_progress} בביצוע, ${s.submitted} דוחות לאישור, ${s.approved} אושרו, ${s.overdue} באיחור.`,
      actions: s.submitted > 0 ? [{ type: 'open_tab', tab: 'overview', label: '👀 עבור לדוחות שממתינים לאישור' }] : [],
    };
  }

  if (has('פרויקט', 'פרויקטים')) {
    const projects = db.projects ?? [];
    if (projects.length === 0) {
      return { answer: 'עוד לא הוגדרו פרויקטים. העלה גרמושקה בסטודיו התוכניות ואבנה לך תוכנית ביקורת מלאה.', actions: [{ type: 'open_tab', tab: 'studio', label: '📐 פתח את סטודיו התוכניות' }] };
    }
    const lines = projects.filter((p) => p.companyId === companyId)
      .map((p) => `• ${p.name}: ${p.taskIds.length} משימות בתוכנית`);
    return { answer: `פרויקטים פעילים:\n${lines.join('\n')}`, actions: [] };
  }

  return null;
}

function userNameOf(db, id) {
  return db.users.find((u) => u.id === id)?.name ?? '—';
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Role label helper for UI greetings. */
export function assistantIntro(db, user) {
  if (user.kind === 'worker') {
    const role = roleById(db, user.roleId);
    return `שלום ${user.name.split(' ')[0]}! אני העוזר החכם. שאל אותי על המשימות שלך או שאלות מקצועיות${role ? ` בתחום ${role.name}` : ''}.`;
  }
  if (user.kind === 'manager') {
    return `שלום ${user.name.split(' ')[0]}! שאל אותי על מצב המשימות, ליקויים ועובדים — או כל שאלה מקצועית מהשטח.`;
  }
  return 'שלום! שאל אותי על נתוני המערכת או שאלות מקצועיות מעולם הבנייה.';
}
