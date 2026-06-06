export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}

export function relativeTime(iso) {
  if (!iso) return '';
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
  if (h < 6) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 18) return 'צהריים טובים';
  if (h < 22) return 'ערב טוב';
  return 'לילה טוב';
}

// Space types — the user picks what kind of shared space this is.
export const SPACE_TYPES = [
  { type: 'home', label: 'בית / משפחה', emoji: '🏠' },
  { type: 'roommates', label: 'שותפים לדירה', emoji: '🏘️' },
  { type: 'couple', label: 'זוג', emoji: '💞' },
  { type: 'team', label: 'צוות', emoji: '🚀' },
  { type: 'trip', label: 'טיול', emoji: '✈️' },
  { type: 'custom', label: 'אחר', emoji: '✨' },
];

// Starter list templates suggested when creating a space, by type.
export const STARTERS = {
  home: [
    { title: 'קניות לבית', emoji: '🛒', color: '#0fb9a6' },
    { title: 'מטלות הבית', emoji: '🧹', color: '#6c5ce7' },
  ],
  roommates: [
    { title: 'קניות משותפות', emoji: '🛒', color: '#0fb9a6' },
    { title: 'תורנויות ניקיון', emoji: '🧽', color: '#6c5ce7' },
    { title: 'הוצאות', emoji: '💸', color: '#e84393' },
  ],
  couple: [
    { title: 'לעשות ביחד', emoji: '💑', color: '#e84393' },
    { title: 'רעיונות לדייט', emoji: '🍷', color: '#a05cf0' },
  ],
  team: [
    { title: 'משימות', emoji: '✅', color: '#6c5ce7' },
    { title: 'רעיונות', emoji: '💡', color: '#fdcb6e' },
  ],
  trip: [
    { title: 'אריזה', emoji: '🧳', color: '#18a0c4' },
    { title: 'מקומות לבקר', emoji: '📍', color: '#e17055' },
  ],
  custom: [{ title: 'הרשימה הראשונה שלי', emoji: '📝', color: '#6c5ce7' }],
};

// Free choice of emoji + color for any new list.
export const LIST_EMOJIS = ['📝', '🛒', '✅', '🧹', '💸', '💡', '🧳', '🍳', '🎁', '🏋️', '📚', '🎬', '🐶', '🌱', '🔧', '🎉', '☕', '🧾', '📍', '🍷', '🧽', '🛠️'];
export const COLORS = ['#6c5ce7', '#0fb9a6', '#e84393', '#18a0c4', '#fdcb6e', '#e17055', '#a05cf0', '#00b894'];

// Hebrew labels for activity feed actions.
export const ACTION_LABEL = {
  added: 'הוסיף',
  done: 'סימן כבוצע',
  reopened: 'החזיר',
  removed: 'הסיר',
  created_list: 'יצר רשימה',
  removed_list: 'מחק רשימה',
};
