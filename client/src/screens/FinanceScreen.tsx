import { CheckCircle2, TrendingUp, PiggyBank, Landmark, ShieldCheck, Wallet } from 'lucide-react';
import type { AssetKind, FinancePortfolio } from '../types';

interface Props {
  finance: FinancePortfolio | null;
}

const fmt = (n: number) => `₪${n.toLocaleString('he-IL')}`;

const KIND_META: Record<AssetKind, { label: string; icon: typeof Wallet; color: string }> = {
  pension: { label: 'קרן פנסיה', icon: Landmark, color: 'text-indigo-400' },
  gemel: { label: 'קופת גמל', icon: PiggyBank, color: 'text-purple-400' },
  insurance: { label: 'ביטוח', icon: ShieldCheck, color: 'text-cyan-400' },
  savings: { label: 'חיסכון', icon: Wallet, color: 'text-emerald-400' },
};

export default function FinanceScreen({ finance }: Props) {
  if (!finance) {
    return <p className="text-center text-slate-500 text-sm py-8 animate-fade-in">טוען נתונים פיננסיים...</p>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-black text-white">ריכוז פיננסי משפחתי</h2>

      {/* כרטיס שווי כולל */}
      <div className="glass rounded-2xl p-5 text-center neon-glow-soft">
        <p className="text-xs text-slate-400 uppercase tracking-wider">שווי נכסים משוער</p>
        <p className="text-4xl font-mono font-bold text-white mt-1">{fmt(finance.totalValue)}</p>
        <p className="text-emerald-400 text-sm mt-2 flex items-center justify-center gap-1">
          <TrendingUp size={15} /> תשואה משוערת {finance.estimatedYieldPct}%
        </p>
      </div>

      {/* חיווי משיכה מהמסלקה */}
      {finance.clearingHouseSynced && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>הנתונים נמשכו בהצלחה מהמסלקה הפנסיונית</span>
        </div>
      )}

      {/* פירוט נכסים */}
      <div className="space-y-3">
        {finance.assets.map((asset) => {
          const meta = KIND_META[asset.kind];
          const Icon = meta.icon;
          return (
            <div key={asset.id} className="glass rounded-xl p-4 flex items-center gap-3">
              <div className={`p-2.5 bg-slate-800/60 rounded-xl ${meta.color}`}>
                <Icon size={20} />
              </div>
              <div className="flex-1 text-right">
                <div className="flex items-center justify-end gap-2">
                  <h3 className="text-sm font-bold text-white">{asset.name}</h3>
                  <span className="text-[10px] text-slate-500 bg-slate-800/60 rounded px-1.5 py-0.5">{meta.label}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{asset.provider}</p>
              </div>
              <div className="text-left">
                <p className="text-sm font-mono font-bold text-white">{fmt(asset.balance)}</p>
                {asset.yieldPct !== undefined && (
                  <p className="text-[11px] text-emerald-400 font-mono">+{asset.yieldPct}%</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[10px] text-slate-600 pt-1">
        עודכן לאחרונה: {new Date(finance.lastSyncedAt).toLocaleString('he-IL')}
      </p>
    </div>
  );
}
