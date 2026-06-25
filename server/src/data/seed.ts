import type {
  CalendarEvent,
  Expense,
  FamilyDocument,
  FamilyTask,
  FinancePortfolio,
  KidWallet,
  ShoppingItem,
  VaultPassword,
} from '../types.js';
import { categorize } from '../lib/categorize.js';

let seq = 0;
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

const mk = (name: string, quantity = 1, purchased = false): ShoppingItem => ({
  id: uid('item'),
  name,
  quantity,
  department: categorize(name),
  purchased,
  createdAt: new Date().toISOString(),
});

export const seedShopping = (): ShoppingItem[] => [
  mk('חלב 3% תנובה', 2),
  mk("קוטג' 5%"),
  mk('ביצים L', 1, true),
  mk('עגבניות'),
  mk('לחם אחיד'),
  mk('שניצל עוף'),
];

const inDays = (d: number) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  return date.toISOString();
};
const atTime = (h: number, m: number) => {
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toISOString();
};

export const seedEvents = (): CalendarEvent[] => [
  { id: uid('ev'), title: 'הסעה לבית הספר', start: atTime(8, 30), location: 'רחוב הרצל 12', source: 'google', color: 'indigo' },
  { id: uid('ev'), title: 'חוג כדורסל - יואב', start: atTime(17, 0), source: 'google', color: 'emerald' },
  { id: uid('ev'), title: 'ערב הורים בזום', start: atTime(20, 30), source: 'local', color: 'amber' },
  { id: uid('ev'), title: 'ביקור רופא שיניים', start: inDays(2), source: 'google', color: 'rose' },
];

export const seedFinance = (): FinancePortfolio => ({
  totalValue: 482300,
  estimatedYieldPct: 8.3,
  clearingHouseSynced: true,
  lastSyncedAt: new Date().toISOString(),
  assets: [
    { id: uid('as'), kind: 'pension', name: 'קרן פנסיה מקיפה', provider: 'מנורה מבטחים', balance: 268400, yieldPct: 8.9 },
    { id: uid('as'), kind: 'gemel', name: 'קופת גמל להשקעה', provider: 'אלטשולר שחם', balance: 124900, yieldPct: 7.4 },
    { id: uid('as'), kind: 'insurance', name: 'ביטוח מנהלים', provider: 'הראל', balance: 71000, yieldPct: 6.1 },
    { id: uid('as'), kind: 'savings', name: 'חיסכון לכל ילד', provider: 'פסגות', balance: 18000, yieldPct: 5.2 },
  ],
});

export const seedDocuments = (): FamilyDocument[] => [
  { id: uid('doc'), type: 'passport', title: 'דרכון - נועה', owner: 'נועה', number: '3****812', expiresAt: inDays(45) },
  { id: uid('doc'), type: 'id_card', title: 'תעודת זהות - דני', owner: 'דני', number: '0****335', expiresAt: inDays(-12) },
  { id: uid('doc'), type: 'drivers_license', title: 'רישיון נהיגה - דני', owner: 'דני', number: 'A***901', expiresAt: inDays(320) },
  { id: uid('doc'), type: 'passport', title: 'דרכון - יואב', owner: 'יואב', number: '2****447', expiresAt: inDays(80) },
];

export const seedPasswords = (): VaultPassword[] => [
  { id: uid('pw'), label: 'חשבון Google משפחתי', username: 'family.cohen@gmail.com', password: 'Sup3r$ecret!', url: 'accounts.google.com' },
  { id: uid('pw'), label: 'נטפליקס', username: 'cohen.family', password: 'Netfl1x#2025', url: 'netflix.com' },
  { id: uid('pw'), label: 'חברת החשמל', username: '0501234567', password: 'Elect!c-7788' },
];

export const seedTasks = (): FamilyTask[] => [
  { id: uid('tk'), title: 'לחדש ביטוח רכב', category: 'סידורים', assignee: 'אבא', done: false, createdAt: new Date().toISOString() },
  { id: uid('tk'), title: 'לקנות מתנה ליום הולדת', category: 'ילדים', assignee: 'אמא', done: false, dueAt: inDays(3), createdAt: new Date().toISOString() },
  { id: uid('tk'), title: 'לתאם איש מקצוע לדוד שמש', category: 'בית', assignee: 'אבא', done: false, createdAt: new Date().toISOString() },
  { id: uid('tk'), title: 'לשלם ארנונה', category: 'סידורים', assignee: 'משותף', done: false, dueAt: inDays(5), createdAt: new Date().toISOString() },
];

export const seedExpenses = (): Expense[] => [
  { id: uid('ex'), title: 'קניות שבועיות', amount: 640, category: 'סופר/מזון', payer: 'אמא', createdAt: inDays(-2) },
  { id: uid('ex'), title: 'חשבון חשמל', amount: 380, category: 'חשבונות', payer: 'משותף', createdAt: inDays(-4) },
  { id: uid('ex'), title: 'חוג כדורסל', amount: 250, category: 'חינוך/חוגים', payer: 'אבא', createdAt: inDays(-6) },
  { id: uid('ex'), title: 'דלק', amount: 300, category: 'רכב/תחבורה', payer: 'אבא', createdAt: inDays(-7) },
  { id: uid('ex'), title: 'מסעדה', amount: 220, category: 'פנאי', payer: 'משותף', createdAt: inDays(-9) },
];

export const seedKids = (): KidWallet[] => {
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  return [
    {
      id: uid('kid'), name: 'יואב', avatarColor: 'from-cyan-400 to-blue-500', balance: 120, monthlyAllowance: 50,
      lastAllowanceAt: firstOfMonth,
      transactions: [
        { id: uid('ktx'), type: 'deposit', amount: 50, label: 'דמי כיס חודשיים', category: 'allowance', createdAt: inDays(-20) },
        { id: uid('ktx'), type: 'spend', amount: 15, label: 'גלידה', category: 'food', createdAt: inDays(-5) },
        { id: uid('ktx'), type: 'spend', amount: 30, label: 'משחק במחשב', category: 'games', createdAt: inDays(-2) },
      ],
    },
    {
      id: uid('kid'), name: 'נועה', avatarColor: 'from-pink-400 to-purple-500', balance: 85, monthlyAllowance: 50,
      lastAllowanceAt: firstOfMonth,
      transactions: [
        { id: uid('ktx'), type: 'deposit', amount: 50, label: 'דמי כיס חודשיים', category: 'allowance', createdAt: inDays(-20) },
        { id: uid('ktx'), type: 'spend', amount: 25, label: 'כרטיס לסרט', category: 'movie', createdAt: inDays(-8) },
      ],
    },
  ];
};
