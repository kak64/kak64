import { useMemo, useState } from 'react';
import { Plus, ShoppingCart, ListTodo, Coins, X, Sparkles, CalendarClock } from 'lucide-react';
import type {
  ExpenseCategory,
  FamilyMember,
  Payer,
  QuickAddKind,
  TaskCategory,
} from '../types';
import { parseQuickAdd, guessExpenseCategory } from '../lib/quickParse';

interface Props {
  onAddShopping: (name: string) => void;
  onAddTask: (t: { title: string; category: TaskCategory; assignee: FamilyMember; dueAt?: string }) => void;
  onAddExpense: (e: { title: string; amount: number; category: ExpenseCategory; payer: Payer }) => void;
}

const KINDS: { key: QuickAddKind; label: string; icon: typeof ShoppingCart }[] = [
  { key: 'shopping', label: 'קניות', icon: ShoppingCart },
  { key: 'task', label: 'משימה', icon: ListTodo },
  { key: 'expense', label: 'הוצאה', icon: Coins },
];

const TASK_CATEGORIES: TaskCategory[] = ['סידורים', 'ילדים', 'בית'];
const MEMBERS: FamilyMember[] = ['אבא', 'אמא', 'משותף'];
const PAYERS: Payer[] = ['אבא', 'אמא', 'משותף'];

export default function QuickAdd({ onAddShopping, onAddTask, onAddExpense }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<QuickAddKind>('shopping');
  const [text, setText] = useState('');

  // שדות נוספים
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('סידורים');
  const [assignee, setAssignee] = useState<FamilyMember>('אבא');
  const [payer, setPayer] = useState<Payer>('משותף');

  // ניתוח חי לתצוגה מקדימה
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, kind) : null), [text, kind]);
  const expenseCategory: ExpenseCategory = useMemo(
    () => (text.trim() ? guessExpenseCategory(text) : 'פנאי'),
    [text],
  );

  const reset = () => {
    setText('');
    setKind('shopping');
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = () => {
    if (!text.trim() || !parsed) return;

    if (kind === 'shopping') {
      if (parsed.shoppingName) onAddShopping(parsed.shoppingName);
      // פיצול חכם: אם זוהה מועד -> נוצרת גם תזכורת ביומן/משימה
      if (parsed.dueAt && parsed.taskTitle) {
        onAddTask({ title: parsed.taskTitle, category: 'סידורים', assignee, dueAt: parsed.dueAt });
      }
    } else if (kind === 'task') {
      onAddTask({
        title: parsed.taskTitle || text.trim(),
        category: taskCategory,
        assignee,
        dueAt: parsed.dueAt,
      });
    } else {
      onAddExpense({
        title: parsed.expenseTitle || text.trim(),
        amount: parsed.amount ?? 0,
        category: expenseCategory,
        payer,
      });
    }
    close();
  };

  const placeholder =
    kind === 'shopping'
      ? 'למשל: לקנות חלב למחר בבוקר'
      : kind === 'task'
        ? 'למשל: לתאם רופא שיניים ביום ראשון'
        : 'למשל: קניות בסופר ב-250';

  return (
    <>
      {/* כפתור צף (+) */}
      <button
        onClick={() => setOpen(true)}
        aria-label="הוספה מהירה"
        className="absolute bottom-24 left-5 z-20 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg neon-glow hover:scale-105 active:scale-95 transition-transform"
      >
        <Plus size={28} />
      </button>

      {/* Bottom Sheet */}
      {open && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end" onClick={close}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-surface border-t border-slate-700/80 rounded-t-3xl p-5 space-y-4 animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Sparkles size={18} className="text-indigo-400" /> הוספה מהירה
              </h3>
              <button onClick={close} className="text-slate-500 hover:text-slate-300" aria-label="סגור">
                <X size={20} />
              </button>
            </div>

            {/* בחירת סוג */}
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setKind(key)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all ${
                    kind === key
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 neon-glow-soft'
                      : 'bg-base/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Icon size={22} />
                  <span className="text-xs font-bold">{label}</span>
                </button>
              ))}
            </div>

            {/* קלט חופשי בעברית */}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={placeholder}
              autoFocus
              className="w-full bg-base/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-right text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />

            {/* תצוגה מקדימה חכמה */}
            {parsed && (kind === 'shopping' || kind === 'task') && (
              <div className="text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-3 space-y-1 text-right">
                {kind === 'shopping' && parsed.shoppingName && (
                  <p>🛒 מוצר: <span className="font-bold">{parsed.shoppingName}</span></p>
                )}
                {kind === 'task' && parsed.taskTitle && (
                  <p>✅ משימה: <span className="font-bold">{parsed.taskTitle}</span></p>
                )}
                {parsed.dueLabel && (
                  <p className="flex items-center justify-end gap-1.5">
                    תזכורת ביומן: <span className="font-bold">{parsed.dueLabel}</span>
                    <CalendarClock size={13} />
                  </p>
                )}
              </div>
            )}
            {parsed && kind === 'expense' && (
              <div className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 text-right">
                💳 {parsed.expenseTitle || 'הוצאה'} • <span className="font-bold font-mono">₪{parsed.amount ?? 0}</span> • {expenseCategory}
              </div>
            )}

            {/* שדות נוספים לפי סוג */}
            {kind === 'task' && (
              <div className="grid grid-cols-2 gap-2">
                <Select label="קטגוריה" value={taskCategory} options={TASK_CATEGORIES} onChange={(v) => setTaskCategory(v as TaskCategory)} />
                <Select label="אחראי/ת" value={assignee} options={MEMBERS} onChange={(v) => setAssignee(v as FamilyMember)} />
              </div>
            )}
            {kind === 'shopping' && parsed?.dueAt && (
              <Select label="תזכורת עבור" value={assignee} options={MEMBERS} onChange={(v) => setAssignee(v as FamilyMember)} />
            )}
            {kind === 'expense' && (
              <Select label="שולם ע״י" value={payer} options={PAYERS} onChange={(v) => setPayer(v as Payer)} />
            )}

            <button
              onClick={submit}
              disabled={!text.trim()}
              className="w-full py-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl font-bold text-sm disabled:opacity-40 hover:neon-glow transition-all"
            >
              הוספה
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-right">
      <span className="text-[11px] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-base/60 border border-slate-800 rounded-xl px-3 py-2 text-sm text-right text-white focus:outline-none focus:border-indigo-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
