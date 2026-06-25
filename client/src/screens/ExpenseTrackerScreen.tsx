import { useMemo, useState } from 'react';
import {
  Wallet, ShoppingBasket, Receipt, GraduationCap, Sparkles, Car, TrendingDown,
} from 'lucide-react';
import type { Expense, ExpenseCategory, Payer } from '../types';
import { EXPENSE_BUDGET } from '../data/mock';

interface Props {
  expenses: Expense[];
}

const CAT_META: Record<ExpenseCategory, { icon: typeof Wallet; color: string; bar: string }> = {
  'סופר/מזון': { icon: ShoppingBasket, color: 'text-emerald-400', bar: 'bg-emerald-500' },
  'חשבונות': { icon: Receipt, color: 'text-amber-400', bar: 'bg-amber-500' },
  'חינוך/חוגים': { icon: GraduationCap, color: 'text-indigo-400', bar: 'bg-indigo-500' },
  'פנאי': { icon: Sparkles, color: 'text-pink-400', bar: 'bg-pink-500' },
  'רכב/תחבורה': { icon: Car, color: 'text-cyan-400', bar: 'bg-cyan-500' },
};

const CATEGORIES = Object.keys(CAT_META) as ExpenseCategory[];
const PAYER_FILTERS: (Payer | 'הכל')[] = ['הכל', 'אבא', 'אמא', 'משותף'];
const PAYER_BADGE: Record<Payer, string> = {
  'אבא': 'bg-blue-500/15 text-blue-300',
  'אמא': 'bg-pink-500/15 text-pink-300',
  'משותף': 'bg-purple-500/15 text-purple-300',
};

const fmt = (n: number) => `₪${n.toLocaleString('he-IL')}`;

export default function ExpenseTrackerScreen({ expenses }: Props) {
  const [filter, setFilter] = useState<Payer | 'הכל'>('הכל');

  const filtered = useMemo(
    () => (filter === 'הכל' ? expenses : expenses.filter((e) => e.payer === filter)),
    [expenses, filter],
  );

  const totals = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of filtered) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return map;
  }, [filtered]);

  const totalSpent = filtered.reduce((s, e) => s + e.amount, 0);
  const totalBudget = CATEGORIES.reduce((s, c) => s + EXPENSE_BUDGET[c], 0);
  const overallPct = Math.min(100, Math.round((totalSpent / totalBudget) * 100));

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-black text-white flex items-center gap-2">
        <TrendingDown size={20} className="text-rose-400" /> מעקב הוצאות
      </h2>

      {/* סיכום חודשי */}
      <div className="glass rounded-2xl p-4 neon-glow-soft">
        <div className="flex justify-between items-end">
          <span className="text-xs text-slate-400">סה״כ הוצאות החודש</span>
          <span className="text-2xl font-black font-mono text-white">{fmt(totalSpent)}</span>
        </div>
        <div className="h-2.5 bg-base/60 rounded-full mt-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overallPct > 85 ? 'bg-rose-500' : 'bg-indigo-500'}`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5 text-left">
          {overallPct}% מתקציב חודשי של {fmt(totalBudget)}
        </p>
      </div>

      {/* סינון לפי בן משפחה */}
      <div className="flex gap-2">
        {PAYER_FILTERS.map((p) => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              filter === p
                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                : 'bg-base/40 border-slate-800 text-slate-400'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* פרוגרס-בר לכל קטגוריה */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const spent = totals.get(cat) ?? 0;
          const budget = EXPENSE_BUDGET[cat];
          const pct = Math.min(100, Math.round((spent / budget) * 100));
          const over = spent > budget;
          const meta = CAT_META[cat];
          const Icon = meta.icon;
          return (
            <div key={cat} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon size={16} className={meta.color} />
                  <span className="text-sm font-bold text-white">{cat}</span>
                </div>
                <span className={`text-xs font-mono ${over ? 'text-rose-400' : 'text-slate-400'}`}>
                  {fmt(spent)} / {fmt(budget)}
                </span>
              </div>
              <div className="h-2 bg-base/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${over ? 'bg-rose-500' : meta.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* רשימת הוצאות אחרונות */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase pr-1">תנועות אחרונות</h4>
        {filtered
          .slice()
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
          .map((e) => {
            const Icon = CAT_META[e.category].icon;
            return (
              <div key={e.id} className="flex items-center gap-3 bg-surface/60 rounded-xl p-3">
                <div className={`p-2 rounded-lg bg-slate-800/60 ${CAT_META[e.category].color}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm text-white">{e.title}</p>
                  <p className="text-[11px] text-slate-500">{e.category}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PAYER_BADGE[e.payer]}`}>
                  {e.payer}
                </span>
                <span className="text-sm font-mono font-bold text-rose-400">−{fmt(e.amount)}</span>
              </div>
            );
          })}
        {filtered.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-6">אין הוצאות לתצוגה</p>
        )}
      </div>
    </div>
  );
}
