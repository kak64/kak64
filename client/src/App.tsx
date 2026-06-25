import { useEffect, useState } from 'react';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import VoiceAssistant from './components/VoiceAssistant';
import HomeScreen from './screens/HomeScreen';
import ShoppingScreen from './screens/ShoppingScreen';
import CalendarScreen from './screens/CalendarScreen';
import FinanceScreen from './screens/FinanceScreen';
import VaultScreen from './screens/VaultScreen';
import { api } from './api/client';
import { categorize } from './lib/categorize';
import { uid } from './data/mock';
import type {
  AiResponse,
  CalendarEvent,
  FamilyDocument,
  FinancePortfolio,
  ShoppingItem,
  TabKey,
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

  // טעינת נתונים ראשונית (מהשרת, עם נפילה חיננית לנתוני דמה)
  useEffect(() => {
    api.getShoppingList().then(setShopping);
    api.getEvents().then(setEvents);
    api.getFinance().then(setFinance);
    api.getDocuments().then(setDocuments);
    api.getPasswords().then(setPasswords);
  }, []);

  // טיפול בתשובת עוזר ה-AI — הפעלת הפעולה שזוהתה
  const handleAi = async (text: string): Promise<AiResponse> => {
    const res = await api.askAi(text);
    const action = res.action;

    if (action.type === 'add_shopping_item') {
      const item: ShoppingItem = {
        id: uid('item'),
        name: action.name,
        quantity: action.quantity,
        department: action.department ?? categorize(action.name),
        purchased: false,
        createdAt: new Date().toISOString(),
      };
      setShopping((prev) => [item, ...prev]);
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
          {listening && (
            <VoiceAssistant onClose={() => setListening(false)} onSubmit={handleAi} />
          )}

          {activeTab === 'home' && <HomeScreen finance={finance} onNavigate={setActiveTab} />}
          {activeTab === 'shop' && <ShoppingScreen items={shopping} setItems={setShopping} />}
          {activeTab === 'calendar' && <CalendarScreen events={events} />}
          {activeTab === 'finance' && <FinanceScreen finance={finance} />}
          {activeTab === 'vault' && (
            <VaultScreen documents={documents} passwords={passwords} highlightDocHint={highlightDocHint} />
          )}
        </main>

        <BottomNav active={activeTab} onChange={setActiveTab} />
      </div>
    </div>
  );
}
