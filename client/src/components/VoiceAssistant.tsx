import { useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import type { AiResponse } from '../types';

interface Props {
  onClose: () => void;
  onSubmit: (text: string) => Promise<AiResponse>;
}

const SUGGESTIONS = ['תוסיף חלב לרשימה', 'מתי פג תוקף הדרכון?', 'מה השווי של התיק?'];

export default function VoiceAssistant({ onClose, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (value: string) => {
    const q = value.trim();
    if (!q || busy) return;
    setBusy(true);
    setReply(null);
    const res = await onSubmit(q);
    setReply(res.reply);
    setText('');
    setBusy(false);
  };

  return (
    <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 animate-fade-in neon-glow-soft">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-indigo-300 text-sm font-bold">
          <Sparkles size={16} className="animate-pulse" />
          {busy ? 'חושב...' : 'קשוב לך...'}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300" aria-label="סגור עוזר">
          <X size={16} />
        </button>
      </div>

      {reply ? (
        <p className="text-sm text-indigo-100 text-right bg-indigo-900/30 rounded-xl p-3 mb-3">{reply}</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3 justify-end">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-[11px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full px-2.5 py-1 hover:bg-indigo-500/20"
            >
              "{s}"
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(text)}
          placeholder="מה תרצו לעשות?"
          autoFocus
          className="flex-1 bg-base/60 border border-indigo-500/20 rounded-xl px-3 py-2 text-sm text-right text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => send(text)}
          disabled={busy}
          className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl px-3 disabled:opacity-50 hover:neon-glow transition-all"
          aria-label="שלח"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
