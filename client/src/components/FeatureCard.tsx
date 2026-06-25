import { ChevronRight, type LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick?: () => void;
}

export default function FeatureCard({ icon: Icon, title, description, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="glass rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:border-indigo-500 hover:neon-glow-soft transition-all active:scale-95"
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
}
