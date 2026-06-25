import { Mic } from 'lucide-react';

interface Props {
  listening: boolean;
  onToggleListening: () => void;
}

export default function Header({ listening, onToggleListening }: Props) {
  return (
    <header className="bg-surface px-6 pt-6 pb-4 border-b border-slate-800/60 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-indigo-500 rounded-lg flex items-center justify-center font-black text-white text-sm neon-glow-soft">
          +f
        </div>
        <span className="font-black text-lg tracking-wide text-glow">family+</span>
      </div>

      {/* כפתור מיקרופון צף — עוזר AI קולי */}
      <button
        onClick={onToggleListening}
        aria-pressed={listening}
        aria-label="עוזר קולי"
        className={`p-2.5 rounded-full transition-all ${
          listening
            ? 'bg-red-500 animate-pulse text-white neon-glow'
            : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30'
        }`}
      >
        <Mic size={18} />
      </button>
    </header>
  );
}
