import { useState } from 'react';
import {
  FileText, BookUser, IdCard, Car, AlertTriangle, Eye, EyeOff, Copy, Lock, KeyRound,
} from 'lucide-react';
import type { DocumentType, FamilyDocument, VaultPassword } from '../types';
import { daysUntil, expiryStatus, formatHebrewDate } from '../lib/expiry';

interface Props {
  documents: FamilyDocument[];
  passwords: VaultPassword[];
  highlightDocHint?: string | null;
}

const DOC_ICON: Record<DocumentType, typeof FileText> = {
  passport: BookUser,
  id_card: IdCard,
  drivers_license: Car,
  other: FileText,
};

const STATUS_STYLES = {
  valid: { wrap: 'border-slate-800', badge: 'bg-slate-700/40 text-slate-400', label: 'בתוקף' },
  soon: { wrap: 'border-amber-500/40 bg-amber-500/5', badge: 'bg-amber-500/20 text-amber-300', label: 'מתקרב לתפוגה' },
  expired: { wrap: 'border-red-500/50 bg-red-500/5', badge: 'bg-red-500/20 text-red-300', label: 'פג תוקף!' },
} as const;

function DocumentCard({ doc, highlight }: { doc: FamilyDocument; highlight: boolean }) {
  const status = expiryStatus(doc.expiresAt);
  const styles = STATUS_STYLES[status];
  const Icon = DOC_ICON[doc.type];
  const days = daysUntil(doc.expiresAt);

  return (
    <div className={`rounded-xl p-4 border ${styles.wrap} ${highlight ? 'ring-2 ring-indigo-500 neon-glow' : ''} transition-all`}>
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-slate-800/60 rounded-xl text-indigo-400">
          <Icon size={20} />
        </div>
        <div className="flex-1 text-right">
          <h3 className="text-sm font-bold text-white">{doc.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {doc.number && <span className="font-mono">{doc.number} • </span>}
            תוקף: {formatHebrewDate(doc.expiresAt)}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${styles.badge}`}>{styles.label}</span>
      </div>
      {status !== 'valid' && (
        <div className={`mt-3 flex items-center gap-2 text-xs ${status === 'expired' ? 'text-red-300' : 'text-amber-300'}`}>
          <AlertTriangle size={14} />
          <span>
            {status === 'expired'
              ? `המסמך פג לפני ${Math.abs(days)} ימים — נדרש חידוש דחוף`
              : `פג בעוד ${days} ימים — מומלץ לחדש בקרוב`}
          </span>
        </div>
      )}
    </div>
  );
}

function PasswordCard({ pw }: { pw: VaultPassword }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pw.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard לא זמין */
    }
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-slate-800/60 rounded-xl text-purple-400">
          <KeyRound size={20} />
        </div>
        <div className="flex-1 text-right">
          <h3 className="text-sm font-bold text-white">{pw.label}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{pw.username}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 bg-base/60 rounded-lg px-3 py-2">
        <button onClick={() => setShow((s) => !s)} className="text-slate-400 hover:text-indigo-400" aria-label={show ? 'הסתר סיסמה' : 'הצג סיסמה'}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button onClick={copy} className="text-slate-400 hover:text-indigo-400" aria-label="העתק סיסמה">
          <Copy size={15} />
        </button>
        <span className="flex-1 text-right font-mono text-sm text-slate-200 select-all">
          {show ? pw.password : '•'.repeat(Math.min(pw.password.length, 12))}
        </span>
        {copied && <span className="text-[10px] text-emerald-400">הועתק!</span>}
      </div>
    </div>
  );
}

export default function VaultScreen({ documents, passwords, highlightDocHint }: Props) {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* כספת מסמכים */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <FileText size={20} className="text-indigo-400" /> כספת מסמכים
        </h2>
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            highlight={!!highlightDocHint && doc.title.includes(highlightDocHint)}
          />
        ))}
      </section>

      {/* כספת סיסמאות */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Lock size={20} className="text-purple-400" /> סיסמאות מוצפנות
        </h2>
        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <Lock size={12} /> מאוחסן בהצפנת AES-256 מקצה לקצה
        </p>
        {passwords.map((pw) => (
          <PasswordCard key={pw.id} pw={pw} />
        ))}
      </section>
    </div>
  );
}
