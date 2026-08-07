// BuildCheck Portal — database shape, serialization, and demo seed.
// The db is a plain serializable object; the browser app persists it to
// localStorage, tests keep it in memory. seedDemo() builds a realistic
// client company with fixed demo credentials so the portal is alive on
// first open (dates are relative to "today" at seed time).

import { defaultCtx, todayStr, addDaysStr } from './util.js';
import { baseRoles, baseDistricts, baseCategories } from './directory.js';
import { createCompany, createManager, createWorker } from './auth.js';
import { dispatchTask, startAssignment, submitReport, approveAssignment, resolveDefect } from './tasks.js';

export const DB_VERSION = 3;

export function createDb(ctx = defaultCtx()) {
  const db = {
    version: DB_VERSION,
    meta: { nextId: 1 },
    roles: baseRoles(),
    districts: baseDistricts(),
    categories: baseCategories(),
    companies: [],
    users: [],
    tasks: [],
    projects: [],
    fines: [],
  };
  db.users.push({
    id: 'usr_admin',
    kind: 'appadmin',
    companyId: null,
    name: 'מנהל האפליקציה',
    roleId: null, districtId: null, areaId: null,
    username: 'admin',
    password: '1234',
    active: true,
    createdAt: ctx.now(),
  });
  return db;
}

export function serializeDb(db) {
  return JSON.stringify(db);
}

export function deserializeDb(json) {
  try {
    const db = JSON.parse(json);
    if (db?.version !== DB_VERSION || !Array.isArray(db.users)) return null;
    return db;
  } catch {
    return null;
  }
}

/** Placeholder "site photo" as a small SVG data URI (demo seed only). */
export function placeholderPhoto(label, color = '#5c6673') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
    <rect width="320" height="240" fill="${color}"/>
    <rect x="12" y="12" width="296" height="216" fill="none" stroke="#ffffff66" stroke-width="2"/>
    <circle cx="160" cy="102" r="34" fill="none" stroke="#ffffffaa" stroke-width="4"/>
    <circle cx="160" cy="102" r="12" fill="#ffffffaa"/>
    <text x="160" y="190" font-family="sans-serif" font-size="17" fill="#fff" text-anchor="middle">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ---------------------------------------------------------------------------
// Demo seed
// ---------------------------------------------------------------------------

export function seedDemo(db, ctx = defaultCtx()) {
  const admin = db.users.find((u) => u.username === 'admin');
  const today = todayStr(new Date(ctx.now()));
  const yesterday = addDaysStr(today, -1);
  const lastWeek = addDaysStr(today, -6);

  const company = createCompany(db, admin, { name: 'א.ב. בנייה והנדסה' }, ctx);
  company.logoSeed = 7; // stable demo identity

  const { user: manager } = createManager(db, admin, {
    companyId: company.id, name: 'אוהד לוי', username: 'ohad', password: '1234',
  }, ctx);

  const { user: yossi } = createWorker(db, manager, {
    name: 'יוסי כהן', roleId: 'plumber', districtId: 'center', areaId: 'petah-tikva',
    username: 'yossi', password: '1234',
  }, ctx);
  const { user: david } = createWorker(db, manager, {
    name: 'דוד מזרחי', roleId: 'electrician', districtId: 'center', areaId: 'rishon',
    username: 'david', password: '1234',
  }, ctx);
  const { user: moshe } = createWorker(db, manager, {
    name: 'משה פרץ', roleId: 'hvac', districtId: 'north', areaId: 'haifa',
    username: 'moshe', password: '1234',
  }, ctx);
  const { user: avi } = createWorker(db, manager, {
    name: 'אבי שלום', roleId: 'tiler', districtId: 'center', areaId: 'petah-tikva',
    username: 'avi', password: '1234',
  }, ctx);
  const { user: noa } = createWorker(db, manager, {
    name: 'נועה ברק', roleId: 'safety', districtId: 'center', areaId: 'petah-tikva',
    username: 'noa', password: '1234',
  }, ctx);
  const { user: haim } = createWorker(db, manager, {
    name: 'חיים דדון', roleId: 'sealer', districtId: 'south', areaId: 'ashdod',
    username: 'haim', password: '1234',
  }, ctx);

  // Second client company — multi-tenant branding on the login screen.
  const company2 = createCompany(db, admin, { name: 'גל-ים הנדסה בע"מ' }, ctx);
  company2.logoSeed = 4212;
  const { user: manager2 } = createManager(db, admin, {
    companyId: company2.id, name: 'רונה גל', username: 'rona', password: '1234',
  }, ctx);
  createWorker(db, manager2, {
    name: 'סמי אוחיון', roleId: 'plumber', districtId: 'tel-aviv', areaId: 'holon',
    username: 'sami', password: '1234',
  }, ctx);

  // Two weeks of history so the dashboard trend and defect analytics are
  // alive: submitted/approved single-check reports on alternating days.
  const HISTORY = [
    { d: -12, w: david, cat: 'electric', sub: 'lighting', defect: false, approve: true },
    { d: -11, w: yossi, cat: 'plumbing', sub: 'risers', defect: false, approve: true },
    { d: -9, w: avi, cat: 'finish', sub: 'tiling', defect: true, note: 'שלולית במרפסת דירה 6 — שיפוע הפוך', approve: true },
    { d: -8, w: moshe, cat: 'hvac', sub: 'units', defect: false, approve: true },
    { d: -7, w: haim, cat: 'sealing', sub: 'wet', defect: true, note: 'רטיבות בתקרת דירה 3 אחרי הצפה', approve: true },
    { d: -5, w: david, cat: 'electric', sub: 'points', defect: false, approve: true },
    { d: -4, w: yossi, cat: 'plumbing', sub: 'drains', defect: true, note: 'שיפוע 1% בלבד בקו מטבח דירה 9', approve: false },
    { d: -3, w: noa, cat: 'safety', sub: 'openings', defect: true, note: 'פתח רצפה ללא כיסוי בקומה 4', approve: false },
    { d: -2, w: avi, cat: 'finish', sub: 'paint', defect: false, approve: true },
  ];
  for (const h of HISTORY) {
    const date = addDaysStr(today, h.d);
    const cat = db.categories.find((c) => c.id === h.cat);
    const sub = cat.subs.find((s) => s.id === h.sub);
    const task = dispatchTask(db, manager, {
      title: `${cat.name} · ${sub.name} — מגדל A`,
      site: 'פרויקט נופי השרון, פתח תקווה',
      categoryId: h.cat, subcategoryId: h.sub,
      target: { roleId: h.w.roleId },
      execDate: date, execTime: '08:00', dueDate: addDaysStr(date, 2),
    }, ctx);
    startAssignment(db, h.w, task.id, ctx);
    submitReport(db, h.w, task.id, {
      items: task.checks.map((label, i) => (h.defect && i === 0
        ? { status: 'defect', measurement: null, note: h.note, photos: [placeholderPhoto('ליקוי — ' + sub.name, '#8a2f3c')] }
        : { status: 'ok', measurement: null, note: '', photos: [placeholderPhoto(label.slice(0, 18))] })),
      summary: h.defect ? h.note : 'בוצע ותקין.',
    }, ctx);
    if (h.approve) approveAssignment(db, manager, task.id, h.w.id, ctx);
  }

  // Task 1 — today, pending, targeted by role (plumbers).
  dispatchTask(db, manager, {
    title: 'קומפלטים — בניין A, קומה 1, דירה 12',
    site: 'פרויקט נופי השרון, פתח תקווה',
    description: 'בדיקת קומפלטים מלאה מול תוכנית ביצוע מהדורה 4. שים לב לשינויי דיירים.',
    categoryId: 'plumbing', subcategoryId: 'complet',
    target: { roleId: 'plumber', districtId: 'center' },
    execDate: today, execTime: '08:00', dueDate: addDaysStr(today, 2),
  }, ctx);

  // Task 2 — today, pending, targeted by district (north).
  dispatchTask(db, manager, {
    title: 'ניקוזי מזגן — מגדל B, קומות 3-5',
    site: 'מגדלי הנמל, חיפה',
    categoryId: 'hvac', subcategoryId: 'ac-drain',
    target: { districtId: 'north' },
    execDate: today, execTime: '10:30', dueDate: addDaysStr(today, 1),
  }, ctx);

  // Task 3 — yesterday, submitted report awaiting approval (defect found).
  const t3 = dispatchTask(db, manager, {
    title: 'נקודות ושקעים — דירה 8',
    site: 'פרויקט נופי השרון, פתח תקווה',
    categoryId: 'electric', subcategoryId: 'points',
    target: { roleId: 'electrician' },
    execDate: yesterday, execTime: '09:00', dueDate: today,
  }, ctx);
  startAssignment(db, david, t3.id, ctx);
  submitReport(db, david, t3.id, {
    items: [
      { status: 'ok', measurement: { value: 25, unit: 'cm' }, note: '', photos: [placeholderPhoto('שקעים סלון — תקין')] },
      { status: 'defect', measurement: { value: 40, unit: 'cm' }, note: 'שקע מטבח קרוב מדי לנקודת מים — נדרש 60 ס"מ לפחות', photos: [placeholderPhoto('ליקוי — שקע מטבח', '#8a2f3c')] },
      { status: 'ok', measurement: null, note: '', photos: [placeholderPhoto('הארקה — תקין')] },
    ],
    summary: 'נמצא ליקוי אחד במטבח, שאר הנקודות תקינות. ממתין להנחיה.',
  }, ctx);

  // Task 4 — last week, already approved.
  const t4 = dispatchTask(db, manager, {
    title: 'לוח חשמל דירתי — דירות 1-4',
    site: 'פרויקט נופי השרון, פתח תקווה',
    categoryId: 'electric', subcategoryId: 'panel',
    target: { roleId: 'electrician' },
    execDate: lastWeek, execTime: '08:30', dueDate: addDaysStr(lastWeek, 1),
  }, ctx);
  startAssignment(db, david, t4.id, ctx);
  submitReport(db, david, t4.id, {
    items: [
      { status: 'ok', measurement: null, note: '', photos: [placeholderPhoto('סימון מעגלים')] },
      { status: 'ok', measurement: null, note: '', photos: [placeholderPhoto('ממסר פחת')] },
      { status: 'ok', measurement: null, note: '', photos: [placeholderPhoto('חיזוק מוליכים')] },
    ],
    summary: 'הלוח תקין במלואו.',
  }, ctx);
  approveAssignment(db, manager, t4.id, david.id, ctx);

  // Task 5 — a rejected report that led to a fine, so the fines ledger and
  // risk score have real data on first load.
  const t5 = dispatchTask(db, manager, {
    title: 'ריצוף מרפסות — קומה 2',
    site: 'פרויקט נופי השרון, פתח תקווה',
    categoryId: 'finish', subcategoryId: 'tiling',
    target: { roleId: 'tiler' },
    execDate: addDaysStr(today, -4), execTime: '08:00', dueDate: addDaysStr(today, -2),
  }, ctx);
  startAssignment(db, avi, t5.id, ctx);
  submitReport(db, avi, t5.id, {
    items: t5.checks.map((label, i) => (i === 0
      ? { status: 'defect', measurement: { value: 0.3, unit: 'm' }, note: 'שיפוע הפוך במרפסת — מים נעמדים ליד הדלת', photos: [placeholderPhoto('ליקוי שיפוע', '#8a2f3c')] }
      : { status: 'ok', measurement: null, note: '', photos: [placeholderPhoto(label.slice(0, 16))] })),
    summary: 'נמצא ליקוי שיפוע חמור.',
  }, ctx);
  resolveDefect(db, manager, t5.id, avi.id, { kind: 'fine', amount: 2500, reason: 'שיפוע ריצוף לקוי חוזר — נדרש תיקון על חשבון קבלן המשנה' }, ctx);

  return { company, manager, workers: { yossi, david } };
}
