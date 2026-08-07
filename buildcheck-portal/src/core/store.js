// BuildCheck Portal — database shape, serialization, and demo seed.
// The db is a plain serializable object; the browser app persists it to
// localStorage, tests keep it in memory. seedDemo() builds a realistic
// client company with fixed demo credentials so the portal is alive on
// first open (dates are relative to "today" at seed time).

import { defaultCtx, todayStr, addDaysStr } from './util.js';
import { baseRoles, baseDistricts, baseCategories } from './directory.js';
import { createCompany, createManager, createWorker } from './auth.js';
import { dispatchTask, startAssignment, submitReport, approveAssignment } from './tasks.js';

export const DB_VERSION = 1;

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
  createWorker(db, manager, {
    name: 'משה פרץ', roleId: 'hvac', districtId: 'north', areaId: 'haifa',
    username: 'moshe', password: '1234',
  }, ctx);

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

  return { company, manager, workers: { yossi, david } };
}
