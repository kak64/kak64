export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}

// Relative time in Hebrew, matching the app's "לפני שעה" / "לפני 9 שע׳" feel.
export function relativeTime(iso) {
  if (!iso) return '';
  // SQLite stores UTC "YYYY-MM-DD HH:MM:SS"; normalize to ISO.
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return 'הרגע';
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? 'לפני דקה' : `לפני ${min} דק׳`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? 'לפני שעה' : `לפני ${hr} שע׳`;
  const day = Math.floor(hr / 24);
  if (day < 7) return day === 1 ? 'אתמול' : `לפני ${day} ימים`;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export function todayLabel() {
  const d = new Date();
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const months = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
  return `יום ${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return { text: 'לילה טוב', emoji: '🌙' };
  if (h < 12) return { text: 'בוקר טוב', emoji: '☀️' };
  if (h < 18) return { text: 'צהריים טובים', emoji: '🌤️' };
  if (h < 22) return { text: 'ערב טוב', emoji: '🌆' };
  return { text: 'לילה טוב', emoji: '🌙' };
}

// Shopping categories used for grouping + the add sheet.
export const CATEGORIES = ['מוצרי חלב', 'פירות וירקות', 'בשר ודגים', 'מאפים', 'ניקיון', 'יבשים', 'קפואים', 'אחר'];

// Naive keyword-based category guess (used for voice + quick add).
const KEYWORDS = {
  'מוצרי חלב': ['חלב', 'גבינה', 'יוגורט', 'קוטג', 'שמנת', 'חמאה', 'ביצים', 'ביצה'],
  'פירות וירקות': ['בננה', 'תפוח', 'עגבני', 'מלפפון', 'גזר', 'בצל', 'תפוז', 'לימון', 'אבוקדו', 'חסה', 'תפוח אדמה'],
  'בשר ודגים': ['עוף', 'בשר', 'דג', 'סלמון', 'הודו', 'נקניק', 'שניצל'],
  'מאפים': ['לחם', 'לחמני', 'פיתה', 'בורקס', 'עוגה', 'קרואסון'],
  'ניקיון': ['סבון', 'אקונומיקה', 'נייר טואלט', 'מגבונים', 'שקיות זבל', 'אבקת כביסה', 'מרכך'],
  'קפואים': ['קפוא', 'גלידה', 'אפונה'],
};
export function guessCategory(name = '') {
  const n = name.trim();
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => n.includes(w))) return cat;
  }
  return 'אחר';
}
