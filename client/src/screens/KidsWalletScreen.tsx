import { useState } from 'react';
import {
  Coins, TrendingDown, PlusCircle, Film, UtensilsCrossed, Gamepad2, ToyBrick, Gift, Wallet,
} from 'lucide-react';
import type { KidTxCategory, KidWallet } from '../types';
import { guessKidCategory } from '../lib/quickParse';

interface Props {
  kids: KidWallet[];
  onSpend: (kidId: string, label: string, amount: number, category: KidTxCategory) => void;
}

const TX_ICON: Record<KidTxCategory, typeof Coins> = {
  food: UtensilsCrossed,
  movie: Film,
  games: Gamepad2,
  toys: ToyBrick,
  allowance: Gift,
  other: Coins,
};

function relDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return 'היום';
  if (diff === 1) return 'אתמול';
  return `לפני ${diff} ימים`;
}

function KidCard({ kid, onSpend }: { kid: KidWallet; onSpend: Props['onSpend'] }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');

  const submit = () => {
    const value = parseFloat(amount);
    if (!label.trim() || !Number.isFinite(value) || value <= 0) return;
    onSpend(kid.id, label.trim(), value, guessKidCategory(label));
    setLabel('');
    setAmount('');
  };

  return (
    <div className="space-y-3">
      {/* כרטיס יתרה דינמי */}
      <div className={`rounded-2xl p-5 bg-gradient-to-br ${kid.avatarColor} relative overflow-hidden neon-glow-soft`}>
        <div className="absolute -left-6 -bottom-6 opacity-20">
          <Wallet size={110} className="text-white" />
        </div>
        <div className="relative text-right text-white">
          <div className="flex items-center justify-between">
            <span className="bg-white/20 rounded-full px-2.5 py-1 text-xs font-bold">דמי הכיס שלי</span>
            <span className="font-black text-lg">{kid.name}</span>
          </div>
          <p className="text-4xl font-black font-mono mt-3">₪{kid.balance}</p>
          <p className="text-xs text-white/80 mt-1 flex items-center justify-end gap-1">
            <Gift size={12} /> ₪{kid.monthlyAllowance} דמי כיס כל 1 בחודש
          </p>
        </div>
      </div>

      {/* הזנת הוצאה ע"י הילד */}
      <div className="glass rounded-xl p-3 flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="על מה הוצאת? (גלידה)"
          className="flex-1 bg-base/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-right text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 min-w-0"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          inputMode="numeric"
          placeholder="₪"
          className="w-16 bg-base/60 border border-slate-800 rounded-lg px-2 py-2 text-sm text-center text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={submit}
          className="bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg px-3 hover:bg-rose-500/30 transition-colors"
          aria-label="רישום הוצאה"
        >
          <TrendingDown size={18} />
        </button>
      </div>

      {/* היסטוריית פעולות */}
      <div className="space-y-2">
        {kid.transactions
          .slice()
          .reverse()
          .map((tx) => {
            const Icon = TX_ICON[tx.category];
            const isDeposit = tx.type === 'deposit';
            return (
              <div key={tx.id} className="flex items-center gap-3 bg-surface/60 rounded-xl p-3">
                <div
                  className={`p-2 rounded-lg ${
                    isDeposit ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/40 text-slate-300'
                  }`}
                >
                  {isDeposit ? <PlusCircle size={18} /> : <Icon size={18} />}
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm text-white">{tx.label}</p>
                  <p className="text-[11px] text-slate-500">{relDay(tx.createdAt)}</p>
                </div>
                <span
                  className={`text-sm font-mono font-bold ${isDeposit ? 'text-emerald-400' : 'text-rose-400'}`}
                >
                  {isDeposit ? '+' : '−'}₪{tx.amount}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default function KidsWalletScreen({ kids, onSpend }: Props) {
  const [active, setActive] = useState(0);
  const kid = kids[active];

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-black text-white flex items-center gap-2">
        <Coins size={20} className="text-amber-400" /> ארנק הילדים
      </h2>

      {/* בורר ילד */}
      {kids.length > 1 && (
        <div className="flex gap-2">
          {kids.map((k, i) => (
            <button
              key={k.id}
              onClick={() => setActive(i)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all border ${
                i === active
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                  : 'bg-base/40 border-slate-800 text-slate-400'
              }`}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}

      {kid && <KidCard kid={kid} onSpend={onSpend} />}
    </div>
  );
}
