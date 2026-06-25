import { useMemo } from 'react';
import { ListTodo, CalendarClock, Briefcase, Baby, Home as HomeIcon, CheckCircle2 } from 'lucide-react';
import type { FamilyMember, FamilyTask, TaskCategory } from '../types';

interface Props {
  tasks: FamilyTask[];
  onToggle: (id: string) => void;
}

const CATEGORY_META: Record<TaskCategory, { icon: typeof Briefcase; color: string }> = {
  'סידורים': { icon: Briefcase, color: 'text-indigo-400' },
  'ילדים': { icon: Baby, color: 'text-pink-400' },
  'בית': { icon: HomeIcon, color: 'text-emerald-400' },
};

const MEMBER_COLORS: Record<FamilyMember, string> = {
  'אבא': 'bg-blue-500/15 text-blue-300',
  'אמא': 'bg-pink-500/15 text-pink-300',
  'משותף': 'bg-purple-500/15 text-purple-300',
  'נועה': 'bg-fuchsia-500/15 text-fuchsia-300',
  'יואב': 'bg-cyan-500/15 text-cyan-300',
};

const CATEGORIES: TaskCategory[] = ['סידורים', 'ילדים', 'בית'];

function dueLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `היום ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `מחר ${time}`;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) + ` ${time}`;
}

export default function TasksScreen({ tasks, onToggle }: Props) {
  const byCategory = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      category: cat,
      items: tasks.filter((t) => t.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [tasks]);

  const openCount = tasks.filter((t) => !t.done).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <ListTodo size={20} className="text-indigo-400" /> משימות משפחתיות
        </h2>
        <span className="text-xs text-slate-400">{openCount} פתוחות</span>
      </div>

      {byCategory.map(({ category, items }) => {
        const Icon = CATEGORY_META[category].icon;
        return (
          <div key={category} className="glass rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Icon size={16} className={CATEGORY_META[category].color} />
              <span className="text-sm font-bold text-white">{category}</span>
              <span className="text-xs text-slate-500 mr-auto">{items.filter((i) => !i.done).length}</span>
            </div>
            <div className="space-y-2.5">
              {items.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 ${task.done ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => onToggle(task.id)}
                    className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 w-4 h-4 shrink-0"
                  />
                  <div className="flex-1 text-right">
                    <p className={`text-sm ${task.done ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                      {task.title}
                    </p>
                    {task.dueAt && (
                      <p className="text-[11px] text-amber-400/80 flex items-center justify-end gap-1 mt-0.5">
                        {dueLabel(task.dueAt)} <CalendarClock size={11} />
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${MEMBER_COLORS[task.assignee]}`}>
                    {task.assignee}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-10 flex flex-col items-center gap-2">
          <CheckCircle2 size={32} className="text-slate-700" />
          אין משימות — הוסיפו אחת עם כפתור ה-+
        </div>
      )}
    </div>
  );
}
