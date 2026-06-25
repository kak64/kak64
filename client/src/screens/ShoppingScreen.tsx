import { useMemo, useState } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import type { Department, ShoppingItem } from '../types';
import { DEPARTMENT_ORDER, categorize } from '../lib/categorize';
import { uid } from '../data/mock';

interface Props {
  items: ShoppingItem[];
  setItems: React.Dispatch<React.SetStateAction<ShoppingItem[]>>;
}

const DEPT_COLORS: Record<string, string> = {
  'ירקות ופירות': 'bg-emerald-500/10 text-emerald-400',
  'מוצרי חלב': 'bg-purple-500/10 text-purple-400',
  'בשר ודגים': 'bg-rose-500/10 text-rose-400',
  'מאפים ולחם': 'bg-amber-500/10 text-amber-400',
  'שימורים ויבשים': 'bg-orange-500/10 text-orange-400',
  'קפואים': 'bg-cyan-500/10 text-cyan-400',
  'משקאות': 'bg-sky-500/10 text-sky-400',
  'חטיפים ומתוקים': 'bg-pink-500/10 text-pink-400',
  'ניקיון וטואלטיקה': 'bg-teal-500/10 text-teal-400',
  'כללי': 'bg-slate-500/10 text-slate-400',
};

export default function ShoppingScreen({ items, setItems }: Props) {
  const [draft, setDraft] = useState('');

  const addItem = () => {
    const name = draft.trim();
    if (!name) return;
    const item: ShoppingItem = {
      id: uid('item'),
      name,
      quantity: 1,
      department: categorize(name),
      purchased: false,
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => [item, ...prev]);
    setDraft('');
  };

  const toggle = (id: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, purchased: !it.purchased } : it)));

  // מיון: קודם פריטים שטרם נקנו, מקובצים לפי מחלקה לפי סדר קבוע; שנקנו יורדים לתחתית
  const { groups, purchased } = useMemo(() => {
    const active = items.filter((i) => !i.purchased);
    const done = items.filter((i) => i.purchased);
    const byDept = new Map<Department, ShoppingItem[]>();
    for (const it of active) {
      if (!byDept.has(it.department)) byDept.set(it.department, []);
      byDept.get(it.department)!.push(it);
    }
    const ordered = DEPARTMENT_ORDER.filter((d) => byDept.has(d)).map((d) => ({
      department: d,
      list: byDept.get(d)!,
    }));
    return { groups: ordered, purchased: done };
  }, [items]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-white">רשימת קניות חכמה</h2>
        <span className="text-xs text-slate-400">
          {items.filter((i) => !i.purchased).length} מוצרים • {groups.length} מחלקות
        </span>
      </div>

      {/* הוספת מוצר חופשי בעברית */}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder="הוסיפו מוצר... (למשל: עגבניות)"
          className="flex-1 bg-surface border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-right text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={addItem}
          className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl px-4 flex items-center justify-center hover:neon-glow transition-all active:scale-95"
          aria-label="הוסף מוצר"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* קבוצות לפי מחלקה */}
      {groups.map(({ department, list }) => (
        <div key={department} className="glass rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className={`text-xs px-2 py-0.5 rounded-md font-bold ${DEPT_COLORS[department]}`}>
              {department}
            </span>
            <span className="text-xs text-slate-500">{list.length} מוצרים</span>
          </div>
          <div className="space-y-2.5 text-sm">
            {list.map((it) => (
              <label key={it.id} className="flex items-center gap-3 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={it.purchased}
                  onChange={() => toggle(it.id)}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 w-4 h-4"
                />
                <span className="flex-1 text-right">
                  {it.name}
                  {it.quantity > 1 && <span className="text-xs text-slate-500"> (x{it.quantity})</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* פריטים שנקנו — בתחתית עם קו חוצה */}
      {purchased.length > 0 && (
        <div className="glass rounded-xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-500 border-b border-slate-800 pb-2">
            <ShoppingCart size={14} /> נרכשו ({purchased.length})
          </div>
          {purchased.map((it) => (
            <label key={it.id} className="flex items-center gap-3 text-slate-500 line-through cursor-pointer">
              <input
                type="checkbox"
                checked
                onChange={() => toggle(it.id)}
                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 w-4 h-4"
              />
              <span className="flex-1 text-right">{it.name}</span>
            </label>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <p className="text-center text-slate-500 text-sm py-8">הרשימה ריקה — הוסיפו מוצר ראשון 🛒</p>
      )}
    </div>
  );
}
