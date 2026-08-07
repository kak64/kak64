// BuildCheck Portal — organizational directory: roles, districts/areas, and
// task categories divided into sub-categories with default check items.
// These are the app-level registries the app admin maintains; company
// managers pick from them when creating workers and dispatching tasks.

import { nextId } from './util.js';

export function baseRoles() {
  return [
    // ניהול ופיקוח
    { id: 'foreman', slug: 'foreman', name: 'מנהל עבודה' },
    { id: 'project-manager', slug: 'pm', name: 'מנהל פרויקט' },
    { id: 'site-engineer', slug: 'engineer', name: 'מהנדס ביצוע' },
    { id: 'surveyor', slug: 'surveyor', name: 'מודד' },
    { id: 'qa', slug: 'qa', name: 'מפקח איכות' },
    { id: 'safety', slug: 'safety', name: 'ממונה בטיחות' },
    // שלד
    { id: 'formwork', slug: 'formwork', name: 'טפסן' },
    { id: 'rebar', slug: 'rebar', name: 'ברזלן' },
    { id: 'concrete', slug: 'concrete', name: 'יוצק בטון' },
    { id: 'crane', slug: 'crane', name: 'מפעיל עגורן' },
    // מערכות
    { id: 'plumber', slug: 'plumber', name: 'אינסטלטור' },
    { id: 'sprinkler', slug: 'sprinkler', name: 'טכנאי ספרינקלרים' },
    { id: 'electrician', slug: 'electric', name: 'חשמלאי' },
    { id: 'lowvolt', slug: 'lowvolt', name: 'טכנאי מנ"מ ותקשורת' },
    { id: 'hvac', slug: 'hvac', name: 'טכנאי מיזוג' },
    { id: 'elevator', slug: 'elevator', name: 'טכנאי מעליות' },
    // גמר ומעטפת
    { id: 'sealer', slug: 'sealer', name: 'אטם' },
    { id: 'tiler', slug: 'tiler', name: 'רצף' },
    { id: 'drywall', slug: 'gips', name: 'גבסן' },
    { id: 'painter', slug: 'paint', name: 'צבעי' },
    { id: 'aluminum', slug: 'alum', name: 'אלומיניומיסט' },
    { id: 'carpenter', slug: 'carpenter', name: 'נגר ודלתות' },
    { id: 'gardener', slug: 'garden', name: 'פיתוח וגינון' },
  ];
}

export function baseDistricts() {
  return [
    { id: 'north', name: 'צפון', areas: [
      { id: 'haifa', name: 'חיפה' },
      { id: 'krayot', name: 'קריות' },
      { id: 'akko', name: 'עכו ונהריה' },
      { id: 'nazareth', name: 'נצרת והעמקים' },
      { id: 'galil', name: 'גליל עליון' },
    ] },
    { id: 'center', name: 'מרכז', areas: [
      { id: 'petah-tikva', name: 'פתח תקווה' },
      { id: 'rishon', name: 'ראשון לציון' },
      { id: 'rehovot', name: 'רחובות ונס ציונה' },
      { id: 'netanya', name: 'נתניה והשרון' },
      { id: 'modiin', name: 'מודיעין' },
    ] },
    { id: 'tel-aviv', name: 'תל אביב', areas: [
      { id: 'ta-city', name: 'תל אביב' },
      { id: 'ramat-gan', name: 'רמת גן וגבעתיים' },
      { id: 'holon', name: 'חולון ובת ים' },
      { id: 'herzliya', name: 'הרצליה ורמת השרון' },
    ] },
    { id: 'jerusalem', name: 'ירושלים', areas: [
      { id: 'jm-city', name: 'ירושלים' },
      { id: 'beit-shemesh', name: 'בית שמש' },
      { id: 'maale-adumim', name: 'מעלה אדומים' },
      { id: 'mevaseret', name: 'מבשרת ציון' },
    ] },
    { id: 'south', name: 'דרום', areas: [
      { id: 'beer-sheva', name: 'באר שבע' },
      { id: 'ashdod', name: 'אשדוד' },
      { id: 'ashkelon', name: 'אשקלון' },
      { id: 'eilat', name: 'אילת' },
    ] },
  ];
}

export function baseCategories() {
  return [
    { id: 'shell', name: 'שלד ובטון', icon: '🏗️', subs: [
      { id: 'formwork', name: 'טפסנות', checks: ['תמיכות ואומנות לפי תוכנית', 'אנכיות ופילוס טפסות', 'ניקיון וסגירת טפסות לפני יציקה'] },
      { id: 'rebar', name: 'זיון', checks: ['קוטר ומרווח מוטות לפי תוכנית קונסטרוקציה', 'שומרי מרחק (כיסוי בטון)', 'חפיפות ועיגונים'] },
      { id: 'casting', name: 'יציקות ואשפרה', checks: ['סומך ותעודת משלוח בטון', 'ויברציה מלאה ללא כיסי חצץ', 'אשפרה רציפה 7 ימים'] },
      { id: 'seismic', name: 'ממ"דים', checks: ['עובי דפנות לפי תוכנית', 'מסגרות פלדה ודלת הדף', 'פתחי אוורור וסינון'] },
    ] },
    { id: 'plumbing', name: 'אינסטלציה', icon: '🔧', subs: [
      { id: 'complet', name: 'קומפלטים', checks: ['מרכז נקודות מים בכיור (תוספת טיח 2-3 ס"מ)', 'גובה נקודות מים — 60 ס"מ מריצוף', 'גובה ניקוז דלוחין — 50 ס"מ', 'אינטרפוץ — 42 ס"מ מהקיר כולל טיח'] },
      { id: 'risers', name: 'לחץ מים ורייזרים', checks: ['חיבור משאבה זמנית', 'לחץ עבודה רציף בקו', 'אטימות מחברים וברזים'] },
      { id: 'drains', name: 'דלוחין ושיפועים', checks: ['שיפוע 1.5%-2% לכיוון קולטן', 'חיבור תקין לקולטן', 'פקיקת פתחי צנרת נגד חצץ'] },
    ] },
    { id: 'electric', name: 'חשמל', icon: '⚡', subs: [
      { id: 'points', name: 'נקודות ושקעים', checks: ['גובה שקעים — 25 ס"מ מריצוף', 'מרחק 60 ס"מ מנקודות מים', 'חיבור הארקה בכל נקודה'] },
      { id: 'panel', name: 'לוח חשמל', checks: ['סימון מעגלים מלא', 'ממסר פחת 30mA תקין', 'חיזוק מוליכים ומהדקים'] },
      { id: 'lighting', name: 'תאורה', checks: ['נקודות מאור לפי תוכנית', 'מפסקים — גובה 110 ס"מ', 'תאורה זמנית תקנית באתר'] },
      { id: 'comm', name: 'תקשורת ומנ"מ', checks: ['צנרת תקשורת ירוקה', 'קופסאות ריכוז דירתיות', 'הכנה לסיבים אופטיים'] },
    ] },
    { id: 'hvac', name: 'מיזוג אוויר', icon: '❄️', subs: [
      { id: 'ac-drain', name: 'ניקוזי מזגן', checks: ['שיפוע קו ניקוז רציף', 'חיבור לקו דלוחין עם סיפון', 'בידוד צנרת גז'] },
      { id: 'gas', name: 'צנרת גז', checks: ['לחץ בדיקה תקני', 'בידוד רציף ללא קרעים', 'שילוט ותוויות בקצוות'] },
      { id: 'units', name: 'יחידות פנים', checks: ['מיקום מאייד לפי תוכנית', 'גובה תלייה אחיד', 'גישה לתחזוקה ופילטרים'] },
    ] },
    { id: 'sealing', name: 'איטום', icon: '💧', subs: [
      { id: 'wet', name: 'חדרים רטובים', checks: ['הרבצה תחתונה מלאה', 'איטום רצפה + רולקות בפינות', 'בדיקת הצפה 48 שעות מתועדת'] },
      { id: 'roof', name: 'גגות', checks: ['יריעות ביטומניות בחפיפה 10 ס"מ', 'רולקות והלחמות שוליים', 'איטום סביב קולטנים ומעברים'] },
      { id: 'basement', name: 'מרתפים וקירות תת-קרקעיים', checks: ['איטום כנגד קרקע', 'הגנה על שכבת איטום', 'ניקוז היקפי תקין'] },
    ] },
    { id: 'finish', name: 'עבודות גמר', icon: '🧱', subs: [
      { id: 'tiling', name: 'ריצוף וחיפוי', checks: ['שיפוע 1%-1.5% לניקוז במרפסות', 'מישוריות — עד 2 מ"מ בסרגל 2 מ\'', 'מילוי רובה מלא ואחיד'] },
      { id: 'paint', name: 'צבע', checks: ['שכבות לפי מפרט', 'גימור פינות וחיבורי תקרה', 'ניקיון משטחים ומשקופים'] },
      { id: 'doors', name: 'דלתות ומשקופים', checks: ['פילוס משקוף לשני צירים', 'פתיחה וסגירה חופשית', 'גימור והלבשות היקפיות'] },
      { id: 'aluminum', name: 'אלומיניום וחלונות', checks: ['איטום היקפי סביב משקופים', 'ניקוז מסילות תקין', 'זכוכית תקנית ומדבקות'] },
    ] },
    { id: 'safety', name: 'בטיחות', icon: '🦺', subs: [
      { id: 'scaffold', name: 'פיגומים', checks: ['עיגון למבנה לפי תוכנית', 'משטחי עבודה ומאחזי יד מלאים', 'רישום בפנקס פיגום'] },
      { id: 'openings', name: 'מעקות ופתחים', checks: ['מעקה תקני — 105 ס"מ גובה', 'כיסוי קשיח ומסומן לפתחי רצפה', 'שילוט אזהרה'] },
      { id: 'ppe', name: 'ציוד מגן אישי', checks: ['קסדות לכל עובד', 'רתמות בעבודה בגובה', 'נעלי עבודה תקניות'] },
      { id: 'electric-temp', name: 'חשמל זמני', checks: ['לוח זמני תקני ונעול', 'פחת 30mA בלוח הזמני', 'כבלים תקינים ומורמים'] },
    ] },
    { id: 'elevator', name: 'מעליות', icon: '🛗', subs: [
      { id: 'shaft', name: 'פיר מעלית', checks: ['מידות פיר לפי תוכנית יצרן', 'אנכיות פיר לכל הגובה', 'פתחי קומה מאובטחים'] },
      { id: 'machine', name: 'חדר מכונות', checks: ['אוורור ותאורה תקניים', 'גישה בטוחה ודלת ננעלת', 'ווי תלייה לפי מפרט'] },
      { id: 'install', name: 'התקנה ומסירה', checks: ['פסי הובלה מפולסים', 'דלתות קומה מכוונות', 'אישור בודק מוסמך'] },
    ] },
    { id: 'development', name: 'פיתוח חוץ', icon: '🌳', subs: [
      { id: 'paving', name: 'ריצוף ושבילים', checks: ['תשתית מהודקת בשכבות', 'שיפועי ניקוז 1%-2%', 'אבני שפה יציבות'] },
      { id: 'drainage', name: 'ניקוז', checks: ['קולטנים ושוחות נקיים', 'שיפועי קווים לפי תוכנית', 'חיבור לרשת העירונית'] },
      { id: 'landscape', name: 'גינון והשקיה', checks: ['אדמת גן 30 ס"מ לפחות', 'מערכת השקיה תקינה', 'ניקוז ערוגות'] },
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
