import { useEffect, useState } from 'react';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import VoiceAssistant from './components/VoiceAssistant';
import QuickAdd from './components/QuickAdd';
import HomeScreen from './screens/HomeScreen';
import ShoppingScreen from './screens/ShoppingScreen';
import CalendarScreen from './screens/CalendarScreen';
import FinanceScreen from './screens/FinanceScreen';
import VaultScreen from './screens/VaultScreen';
import TasksScreen from './screens/TasksScreen';
import KidsWalletScreen from './screens/KidsWalletScreen';
import ExpenseTrackerScreen from './screens/ExpenseTrackerScreen';
import { api } from './api/client';
import { categorize } from './lib/categorize';
import { applyMonthlyAllowance } from './lib/allowance';
import { uid } from './data/mock';
import type {
  AiResponse,
  CalendarEvent,
  Expense,
  ExpenseCategory,
  FamilyDocument,
  FamilyMember,
  FamilyTask,
  FinancePortfolio,
  KidTxCategory,
  KidWallet,
  Payer,
  ShoppingItem,
  TabKey,
  TaskCategory,
  VaultPassword,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [listening, setListening] = useState(false);

  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [finance, setFinance] = useState<FinancePortfolio | null>(null);
  const [documents, setDocuments] = useState<FamilyDocument[]>([]);
  const [passwords, setPasswords] = useState<VaultPassword[]>([]);
  const [highlightDocHint, setHighlightDocHint] = useState<string | null>(null);

  const [tasks, setTasks] = useState<FamilyTask[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [kids, setKids] = useState<KidWallet[]>([]);

  // טעינת נתונים ראשונית (מהשרת, עם נפילה חיננית לנתוני דמה)
  useEffect(() => {
    api.getShoppingList().then(setShopping);
    api.getEvents().then(setEvents);
    api.getFinance().then(setFinance);
    api.getDocuments().then(setDocuments);
    api.getPasswords().then(setPasswords);
    api.getTasks().then(setTasks);
    api.getExpenses().then(setExpenses);
    // אוטומציה: הפקדת דמי כיס חודשיים אם הגיע 1 בחודש
    api.getKids().then((loaded) => setKids(loaded.map((k) => applyMonthlyAllowance(k))));
  }, []);

  // ----- פעולות הוספה (משותפות ל-QuickAdd ולעוזר ה-AI) -----
  const addShoppingItem = (name: string) => {
    if (!name.trim()) return;
    const item: ShoppingItem = {
      id: uid('item'),
      name: name.trim(),
      quantity: 1,
      department: categorize(name),
      purchased: false,
      createdAt: new Date().toISOString(),
    };
    setShopping((prev) => [item, ...prev]);
    void api.addShoppingItem(name.trim());
  };

  const addTask = (t: { title: string; category: TaskCategory; assignee: FamilyMember; dueAt?: string }) => {
    const task: FamilyTask = {
      id: uid('tk'),
      title: t.title,
      category: t.category,
      assignee: t.assignee,
      done: false,
      dueAt: t.dueAt,
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [task, ...prev]);
    void api.addTask({ title: t.title, category: t.category, assignee: t.assignee, dueAt: t.dueAt });

    // אם יש מועד יעד — נוצרת גם תזכורת ביומן
    if (t.dueAt) {
      const ev: CalendarEvent = {
        id: uid('ev'),
        title: t.title,
        start: t.dueAt,
        source: 'local',
        color: 'amber',
      };
      setEvents((prev) => [...prev, ev]);
    }
  };

  const addExpense = (e: { title: string; amount: number; category: ExpenseCategory; payer: Payer }) => {
    const expense: Expense = { id: uid('ex'), createdAt: new Date().toISOString(), ...e };
    setExpenses((prev) => [expense, ...prev]);
    void api.addExpense(e);
  };

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    void api.toggleTask(id);
  };

  const kidSpend = (kidId: string, label: string, amount: number, category: KidTxCategory) => {
    setKids((prev) =>
      prev.map((k) =>
        k.id === kidId
          ? {
              ...k,
              balance: Math.max(0, k.balance - amount),
              transactions: [
                ...k.transactions,
                { id: uid('ktx'), type: 'spend', amount, label, category, createdAt: new Date().toISOString() },
              ],
            }
          : k,
      ),
    );
    void api.addKidSpend(kidId, label, amount, category);
  };

  // טיפול בתשובת עוזר ה-AI
  const handleAi = async (text: string): Promise<AiResponse> => {
    const res = await api.askAi(text);
    const action = res.action;
    if (action.type === 'add_shopping_item') {
      addShoppingItem(action.name);
      setActiveTab('shop');
    } else if (action.type === 'query_document_expiry') {
      setHighlightDocHint(action.documentHint);
      setActiveTab('vault');
    } else if (action.type === 'query_finance') {
      setActiveTab('finance');
    }
    return res;
  };

  return (
    <div className="min-h-screen bg-base text-slate-100 font-sans antialiased flex justify-center items-center p-0 sm:p-4" dir="rtl">
      {/* מעטפת מכשיר מובייל (סימולטור) */}
      <div className="w-full max-w-md h-[100dvh] sm:h-[850px] bg-[#0f1123] sm:rounded-[40px] sm:border-8 sm:border-slate-800 flex flex-col justify-between overflow-hidden shadow-2xl relative">
        <Header listening={listening} onToggleListening={() => setListening((v) => !v)} />

        <main className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {listening && <VoiceAssistant onClose={() => setListening(false)} onSubmit={handleAi} />}

          {activeTab === 'home' && <HomeScreen finance={finance} onNavigate={setActiveTab} />}
          {activeTab === 'shop' && <ShoppingScreen items={shopping} setItems={setShopping} />}
          {activeTab === 'calendar' && <CalendarScreen events={events} />}
          {activeTab === 'finance' && <FinanceScreen finance={finance} />}
          {activeTab === 'vault' && (
            <VaultScreen documents={documents} passwords={passwords} highlightDocHint={highlightDocHint} />
          )}
          {activeTab === 'tasks' && <TasksScreen tasks={tasks} onToggle={toggleTask} />}
          {activeTab === 'kids' && <KidsWalletScreen kids={kids} onSpend={kidSpend} />}
          {activeTab === 'expenses' && <ExpenseTrackerScreen expenses={expenses} />}
        </main>

        {/* כפתור הוספה מהיר צף — זמין מכל מסך */}
        <QuickAdd onAddShopping={addShoppingItem} onAddTask={addTask} onAddExpense={addExpense} />

        <BottomNav active={activeTab} onChange={setActiveTab} />
      </div>
    </div>
  );
}
