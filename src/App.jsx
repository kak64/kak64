import React, { useState } from 'react';
import {
  Calendar, ShoppingCart, Wallet, ShieldAlert,
  Lock, Mic, ChevronRight, CheckCircle2, Home, Clock, MapPin
} from 'lucide-react';

// קומפוננטת כרטיס פיצ'ר לדף הבית
const FeatureCard = ({ icon: Icon, title, description, onClick }) => (
  <div
    onClick={onClick}
    className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:border-indigo-500 transition-all active:scale-95"
  >
    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white">
      <Icon size={22} />
    </div>
    <div className="flex-1 text-right">
      <h3 className="font-bold text-white text-base">{title}</h3>
      <p className="text-slate-400 text-xs mt-0.5">{description}</p>
    </div>
    <ChevronRight className="text-slate-500" size={18} />
  </div>
);

export default function FamilyPlusApp() {
  const [activeTab, setActiveTab] = useState('home');
  const [aiListening, setAiListening] = useState(false);

  return (
    <div className="min-h-screen bg-[#0b0c16] text-slate-100 font-sans antialiased flex justify-center items-center p-0 sm:p-4" dir="rtl">

      {/* מעטפת מכשיר מובייל (סימולטור) */}
      <div className="w-full max-w-md h-[100vh] sm:h-[850px] bg-[#0f1123] sm:rounded-[40px] sm:border-8 sm:border-slate-800 flex flex-col justify-between overflow-hidden shadow-2xl relative">

        {/* בר עליון / Header */}
        <header className="bg-[#13162c] px-6 pt-6 pb-4 border-b border-slate-800/60 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-indigo-500 rounded-lg flex items-center justify-center font-black text-white text-sm">
              +f
            </div>
            <span className="font-black text-lg tracking-wide bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">family+</span>
          </div>

          {/* חיווי AI קולי מהיר */}
          <button
            onClick={() => setAiListening(!aiListening)}
            className={`p-2.5 rounded-full transition-all ${aiListening ? 'bg-red-500 animate-pulse text-white' : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'}`}
          >
            <Mic size={18} />
          </button>
        </header>

        {/* תוכן האפליקציה משתנה לפי הטאב */}
        <main className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">

          {aiListening && (
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3 text-center text-xs text-indigo-300 animate-fade-in">
              קשוב לך... "תוסיף חלב לרשימת הקניות"
            </div>
          )}

          {activeTab === 'home' && (
            <>
              {/* כרטיס סטטוס מהיר */}
              <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 rounded-2xl p-4 text-right">
                <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full font-medium">עדכון משפחתי</span>
                <h2 className="text-lg font-bold mt-2 text-white">הציון הפיננסי שלכם בעלייה!</h2>
                <p className="text-slate-400 text-xs mt-1">תיק מאוחד: <span className="text-emerald-400 font-mono">₪482,300</span> (תשואה משוערת 8.3%)</p>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase pr-1">פיצ'רים מרכזיים</h4>

                <FeatureCard
                  icon={Calendar}
                  title="יומן ומשימות"
                  description="מסונכרן מלא ל-Google Calendar"
                  onClick={() => setActiveTab('calendar')}
                />
                <FeatureCard
                  icon={Wallet}
                  title="תיק פיננסי מאוחד"
                  description="סטטוס פנסיה, ביטוחים ופוליסות"
                  onClick={() => setActiveTab('finance')}
                />
                <FeatureCard
                  icon={ShoppingCart}
                  title="רשימת קניות חכמה"
                  description="מוצרים מסודרים אוטומטית לפי מחלקה"
                  onClick={() => setActiveTab('shop')}
                />
                <FeatureCard
                  icon={ShieldAlert}
                  title="כספת מסמכים"
                  description={'התראות לפני פג תוקף (ת"ז, דרכון)'}
                />
                <FeatureCard
                  icon={Lock}
                  title="סיסמאות מוצפנות"
                  description="כספת משפחתית מאובטחת מקצה לקצה"
                />
              </div>
            </>
          )}

          {/* טאב יומן */}
          {activeTab === 'calendar' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-white">יומן ומשימות</h2>
                <span className="text-xs text-slate-400">היום • יום רביעי</span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center text-indigo-400 min-w-[44px]">
                    <Clock size={16} />
                    <span className="text-xs font-mono mt-1">08:30</span>
                  </div>
                  <div className="flex-1 text-right border-r border-slate-800 pr-3">
                    <p className="text-sm font-bold text-white">הסעה לבית הספר</p>
                    <p className="text-xs text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                      רחוב הרצל 12 <MapPin size={12} />
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center text-emerald-400 min-w-[44px]">
                    <Clock size={16} />
                    <span className="text-xs font-mono mt-1">17:00</span>
                  </div>
                  <div className="flex-1 text-right border-r border-slate-800 pr-3">
                    <p className="text-sm font-bold text-white">חוג כדורסל - יואב</p>
                    <p className="text-xs text-slate-500 mt-0.5">מסונכרן ל-Google Calendar</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center text-amber-400 min-w-[44px]">
                    <Clock size={16} />
                    <span className="text-xs font-mono mt-1">20:30</span>
                  </div>
                  <div className="flex-1 text-right border-r border-slate-800 pr-3">
                    <p className="text-sm font-bold text-white">ערב הורים בזום</p>
                    <p className="text-xs text-slate-500 mt-0.5">תזכורת 30 דקות לפני</p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>3 אירועים סונכרנו מ-Google Calendar</span>
              </div>

              <button
                onClick={() => setActiveTab('home')}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-colors text-center block"
              >
                חזרה למסך הבית
              </button>
            </div>
          )}

          {/* טאב קניות לדוגמה */}
          {activeTab === 'shop' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-white">רשימת קניות חכמה</h2>
                <span className="text-xs text-slate-400">12 מוצרים • 4 מחלקות</span>
              </div>

              {/* קטגוריה לדוגמה מהעיצוב שלך */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-md font-bold">חלב, ביצים וסלטים</span>
                  <span className="text-xs text-slate-500">3 מוצרים</span>
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center gap-3 text-slate-300">
                    <input type="checkbox" className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 w-4 h-4" />
                    <span className="flex-1 text-right">חלב 3% תנובה <span className="text-xs text-slate-500">(x2)</span></span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-300">
                    <input type="checkbox" className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 w-4 h-4" />
                    <span className="flex-1 text-right">קוטג' 5%</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500 line-through">
                    <input type="checkbox" defaultChecked className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 w-4 h-4" />
                    <span className="flex-1 text-right">ביצים L</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('home')}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-colors text-center block"
              >
                חזרה למסך הבית
              </button>
            </div>
          )}

          {/* טאב פיננסי לדוגמה */}
          {activeTab === 'finance' && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-xl font-black text-white">ריכוז פיננסי משפחתי</h2>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wider">שווי נכסים משוער</p>
                <p className="text-3xl font-mono font-bold text-white mt-1">₪482,300</p>
              </div>
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>הנתונים נמשכו בהצלחה מהמסלקה הפנסיונית</span>
              </div>
              <button onClick={() => setActiveTab('home')} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold text-sm text-center">חזרה</button>
            </div>
          )}

        </main>

        {/* בר ניווט תחתון קבוע / Navigation Bar */}
        <nav className="bg-[#13162c] border-t border-slate-800/80 px-4 py-2 flex justify-around items-center">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'home' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <Home size={20} />
            <span className="text-[10px] font-bold">בית</span>
          </button>
          <button
            onClick={() => setActiveTab('shop')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'shop' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <ShoppingCart size={20} />
            <span className="text-[10px] font-bold">קניות</span>
          </button>
          <button
            onClick={() => setActiveTab('finance')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'finance' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <Wallet size={20} />
            <span className="text-[10px] font-bold">פיננסים</span>
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'calendar' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <Calendar size={20} />
            <span className="text-[10px] font-bold">יומן</span>
          </button>
        </nav>

      </div>
    </div>
  );
}
