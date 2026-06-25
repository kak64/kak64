import { Calendar, Wallet, ShoppingCart, ShieldAlert, Lock, ListTodo, Coins, TrendingDown } from 'lucide-react';
import FeatureCard from '../components/FeatureCard';
import type { FinancePortfolio, TabKey } from '../types';

interface Props {
  finance: FinancePortfolio | null;
  onNavigate: (tab: TabKey) => void;
}

const fmt = (n: number) => `₪${n.toLocaleString('he-IL')}`;

export default function HomeScreen({ finance, onNavigate }: Props) {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* כרטיס סטטוס מהיר */}
      <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 rounded-2xl p-4 text-right neon-glow-soft">
        <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full font-medium">
          עדכון משפחתי
        </span>
        <h2 className="text-lg font-bold mt-2 text-white">הציון הפיננסי שלכם בעלייה!</h2>
        <p className="text-slate-400 text-xs mt-1">
          תיק מאוחד:{' '}
          <span className="text-emerald-400 font-mono">{fmt(finance?.totalValue ?? 482300)}</span>{' '}
          (תשואה משוערת {finance?.estimatedYieldPct ?? 8.3}%)
        </p>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase pr-1">פיצ'רים מרכזיים</h4>

        <FeatureCard
          icon={Calendar}
          title="יומן ומשימות"
          description="מסונכרן מלא ל-Google Calendar"
          onClick={() => onNavigate('calendar')}
        />
        <FeatureCard
          icon={Wallet}
          title="תיק פיננסי מאוחד"
          description="סטטוס פנסיה, ביטוחים ופוליסות"
          onClick={() => onNavigate('finance')}
        />
        <FeatureCard
          icon={ShoppingCart}
          title="רשימת קניות חכמה"
          description="מוצרים מסודרים אוטומטית לפי מחלקה"
          onClick={() => onNavigate('shop')}
        />
        <FeatureCard
          icon={ListTodo}
          title="משימות משפחתיות"
          description="סידורים, ילדים ובית — לפי בן משפחה"
          onClick={() => onNavigate('tasks')}
        />
        <FeatureCard
          icon={TrendingDown}
          title="מעקב הוצאות"
          description="תקציב חודשי לפי קטגוריות ובני משפחה"
          onClick={() => onNavigate('expenses')}
        />
        <FeatureCard
          icon={Coins}
          title="ארנק הילדים"
          description="דמי כיס, הפקדות והוצאות לכל ילד"
          onClick={() => onNavigate('kids')}
        />
        <FeatureCard
          icon={ShieldAlert}
          title="כספת מסמכים"
          description={'התראות לפני פג תוקף (ת"ז, דרכון)'}
          onClick={() => onNavigate('vault')}
        />
        <FeatureCard
          icon={Lock}
          title="סיסמאות מוצפנות"
          description="כספת משפחתית מאובטחת מקצה לקצה"
          onClick={() => onNavigate('vault')}
        />
      </div>
    </div>
  );
}
