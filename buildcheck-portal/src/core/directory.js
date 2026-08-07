// BuildCheck Portal — organizational directory: roles, districts/areas, and
// task categories divided into sub-categories with default check items.
// These are the app-level registries the app admin maintains; company
// managers pick from them when creating workers and dispatching tasks.

import { nextId } from './util.js';

export function baseRoles() {
  return [
    { id: 'foreman', slug: 'foreman', name: 'מנהל עבודה' },
    { id: 'plumber', slug: 'plumber', name: 'אינסטלטור' },
    { id: 'electrician', slug: 'electric', name: 'חשמלאי' },
    { id: 'hvac', slug: 'hvac', name: 'טכנאי מיזוג' },
    { id: 'tiler', slug: 'tiler', name: 'רצף' },
    { id: 'drywall', slug: 'gips', name: 'גבסן' },
    { id: 'painter', slug: 'paint', name: 'צבעי' },
    { id: 'qa', slug: 'qa', name: 'מפקח איכות' },
    { id: 'safety', slug: 'safety', name: 'ממונה בטיחות' },
  ];
}

export function baseDistricts() {
  return [
    { id: 'north', name: 'צפון', areas: [
      { id: 'haifa', name: 'חיפה' },
      { id: 'krayot', name: 'קריות' },
      { id: 'galil', name: 'גליל' },
    ] },
    { id: 'center', name: 'מרכז', areas: [
      { id: 'petah-tikva', name: 'פתח תקווה' },
      { id: 'rishon', name: 'ראשון לציון' },
      { id: 'rehovot', name: 'רחובות' },
    ] },
    { id: 'tel-aviv', name: 'תל אביב', areas: [
      { id: 'ta-city', name: 'תל אביב' },
      { id: 'ramat-gan', name: 'רמת גן' },
      { id: 'holon', name: 'חולון' },
    ] },
    { id: 'jerusalem', name: 'ירושלים', areas: [
      { id: 'jm-city', name: 'ירושלים' },
      { id: 'beit-shemesh', name: 'בית שמש' },
      { id: 'maale-adumim', name: 'מעלה אדומים' },
    ] },
    { id: 'south', name: 'דרום', areas: [
      { id: 'beer-sheva', name: 'באר שבע' },
      { id: 'ashdod', name: 'אשדוד' },
      { id: 'ashkelon', name: 'אשקלון' },
    ] },
  ];
}

export function baseCategories() {
  return [
    { id: 'plumbing', name: 'אינסטלציה', icon: '🔧', subs: [
      { id: 'complet', name: 'קומפלטים', checks: ['מרכז נקודות מים בכיור', 'גובה נקודות מים', 'ניקוז דלוחין', 'אינטרפוץ מקלחת'] },
      { id: 'risers', name: 'לחץ מים ורייזרים', checks: ['חיבור משאבה זמנית', 'לחץ עבודה בקו', 'אטימות מחברים'] },
      { id: 'drains', name: 'דלוחין ושיפועים', checks: ['שיפוע 1.5%-2%', 'חיבור לקולטן', 'פקיקת פתחי צנרת'] },
      { id: 'sealing', name: 'איטום חדרים רטובים', checks: ['הרבצה תחתונה', 'איטום רצפה', 'אטימת מעבירי צנרת'] },
    ] },
    { id: 'electric', name: 'חשמל', icon: '⚡', subs: [
      { id: 'points', name: 'נקודות ושקעים', checks: ['גובה שקעים', 'מרחק מנקודות מים', 'חיבור הארקה'] },
      { id: 'panel', name: 'לוח חשמל', checks: ['סימון מעגלים', 'ממסר פחת', 'חיזוק מוליכים'] },
      { id: 'lighting', name: 'תאורה', checks: ['נקודות מאור', 'מפסקים', 'תאורה זמנית תקנית'] },
    ] },
    { id: 'hvac', name: 'מיזוג אוויר', icon: '❄️', subs: [
      { id: 'ac-drain', name: 'ניקוזי מזגן', checks: ['שיפוע קו ניקוז', 'חיבור לקו דלוחין', 'בידוד צנרת'] },
      { id: 'gas', name: 'צנרת גז', checks: ['לחץ בדיקה', 'בידוד צנרת', 'שילוט ותוויות'] },
      { id: 'units', name: 'יחידות פנים', checks: ['מיקום מאייד', 'גובה תלייה', 'גישה לתחזוקה'] },
    ] },
    { id: 'finish', name: 'עבודות גמר', icon: '🧱', subs: [
      { id: 'tiling', name: 'ריצוף וחיפוי', checks: ['שיפועי ריצוף', 'מישוריות', 'מילוי רובה'] },
      { id: 'paint', name: 'צבע', checks: ['מספר שכבות', 'גימור פינות', 'ניקיון משטחים'] },
      { id: 'doors', name: 'דלתות ומשקופים', checks: ['פילוס משקוף', 'פתיחה וסגירה', 'גימור היקפי'] },
    ] },
    { id: 'safety', name: 'בטיחות', icon: '🦺', subs: [
      { id: 'scaffold', name: 'פיגומים', checks: ['תקינות רכיבים', 'עיגון למבנה', 'מאחזי יד'] },
      { id: 'openings', name: 'מעקות ופתחים', checks: ['כיסוי פתחים', 'מעקות תקניים', 'שילוט אזהרה'] },
      { id: 'ppe', name: 'ציוד מגן אישי', checks: ['קסדות', 'רתמות בגובה', 'נעלי עבודה'] },
    ] },
  ];
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function roleById(db, id) { return db.roles.find((r) => r.id === id) ?? null; }
export function districtById(db, id) { return db.districts.find((d) => d.id === id) ?? null; }
export function areaById(db, districtId, areaId) {
  return districtById(db, districtId)?.areas.find((a) => a.id === areaId) ?? null;
}
export function categoryById(db, id) { return db.categories.find((c) => c.id === id) ?? null; }
export function subcategoryById(db, categoryId, subId) {
  return categoryById(db, categoryId)?.subs.find((s) => s.id === subId) ?? null;
}

// ---------------------------------------------------------------------------
// Registry management (app admin)
// ---------------------------------------------------------------------------

function assertAppAdmin(actor, what) {
  if (actor?.kind !== 'appadmin') throw new Error(`רק מנהל האפליקציה רשאי ${what}`);
}

export function addRole(db, actor, { name, slug = 'staff' }) {
  assertAppAdmin(actor, 'להוסיף תפקידים');
  if (!name?.trim()) throw new Error('נדרש שם תפקיד');
  if (db.roles.some((r) => r.name === name.trim())) throw new Error('תפקיד בשם זה כבר קיים');
  const role = { id: nextId(db, 'role'), slug, name: name.trim() };
  db.roles.push(role);
  return role;
}

export function addCategory(db, actor, { name, icon = '📋' }) {
  assertAppAdmin(actor, 'להוסיף קטגוריות');
  if (!name?.trim()) throw new Error('נדרש שם קטגוריה');
  const category = { id: nextId(db, 'cat'), name: name.trim(), icon, subs: [] };
  db.categories.push(category);
  return category;
}

export function addSubcategory(db, actor, categoryId, { name, checks = [] }) {
  assertAppAdmin(actor, 'להוסיף תתי-קטגוריות');
  const category = categoryById(db, categoryId);
  if (!category) throw new Error('קטגוריה לא נמצאה');
  if (!name?.trim()) throw new Error('נדרש שם תת-קטגוריה');
  const sub = { id: nextId(db, 'sub'), name: name.trim(), checks: checks.filter((c) => c?.trim()) };
  category.subs.push(sub);
  return sub;
}
