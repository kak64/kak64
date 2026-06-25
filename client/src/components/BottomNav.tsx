import { Home, ShoppingCart, Wallet, Calendar, ShieldCheck } from 'lucide-react';
import type { TabKey } from '../types';

interface Props {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const ITEMS: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: 'home', label: 'בית', icon: Home },
  { key: 'shop', label: 'קניות', icon: ShoppingCart },
  { key: 'finance', label: 'פיננסים', icon: Wallet },
  { key: 'calendar', label: 'יומן', icon: Calendar },
  { key: 'vault', label: 'כספת', icon: ShieldCheck },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bg-surface border-t border-slate-800/80 px-2 py-2 flex justify-around items-center">
      {ITEMS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          aria-current={active === key}
          className={`flex flex-col items-center gap-1 p-2 transition-colors ${
            active === key ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-400'
          }`}
        >
          <Icon size={20} />
          <span className="text-[10px] font-bold">{label}</span>
        </button>
      ))}
    </nav>
  );
}
