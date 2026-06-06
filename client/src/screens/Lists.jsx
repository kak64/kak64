import { useState } from 'react';
import { api } from '../api.js';
import { usePoll } from '../lib/usePoll.js';
import Icon from '../lib/icons.jsx';
import Sheet from '../components/Sheet.jsx';
import { useToast } from '../components/Toast.jsx';
import { LIST_EMOJIS, COLORS } from '../lib/util.js';

export default function Lists({ space, onOpenList }) {
  const { data, refresh } = usePoll(() => api(`/spaces/${space.id}/lists`), [space.id]);
  const lists = data?.lists || [];
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const create = async (payload) => {
    try {
      const { list } = await api(`/spaces/${space.id}/lists`, { method: 'POST', body: payload });
      refresh();
      toast('הרשימה נוצרה ✓');
      onOpenList(list.id);
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="screen with-tabs">
      <div className="topbar">
        <div className="spacer" />
        <h1>הרשימות שלכם</h1>
        <div style={{ width: 42 }} />
      </div>

      <div className="grid">
        {lists.map((l) => {
          const pct = l.total ? Math.round((l.done / l.total) * 100) : 0;
          return (
            <button key={l.id} className="list-card" onClick={() => onOpenList(l.id)}>
              <div className="lc-emoji" style={{ background: l.color + '22' }}>{l.emoji}</div>
              <div className="lc-title">{l.title}</div>
              <div className="lc-sub">{l.total ? `${l.done}/${l.total} הושלמו` : 'רשימה ריקה'}</div>
              <div className="lc-bar"><span style={{ width: `${pct}%`, background: l.color }} /></div>
            </button>
          );
        })}
        <button className="list-card add-card" onClick={() => setCreating(true)}>
          <div className="plus"><Icon name="plus" size={24} /></div>
          רשימה חדשה
        </button>
      </div>

      <CreateListSheet open={creating} onClose={() => setCreating(false)} onCreate={create} />
    </div>
  );
}

function CreateListSheet({ open, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState(LIST_EMOJIS[0]);
  const [color, setColor] = useState(COLORS[0]);

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), emoji, color });
    setTitle(''); setEmoji(LIST_EMOJIS[0]); setColor(COLORS[0]);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <h2>רשימה חדשה</h2>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 14 }}>
        <div className="lc-emoji" style={{ width: 64, height: 64, fontSize: 32, background: color + '22' }}>{emoji}</div>
      </div>
      <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="שם הרשימה (למשל: קניות, מטלות, רעיונות)" style={{ marginBottom: 16 }} />
      <div className="field"><label>אייקון</label>
        <div className="emoji-grid">
          {LIST_EMOJIS.map((e) => (
            <button key={e} className={emoji === e ? 'active' : ''} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>
      </div>
      <div className="field"><label>צבע</label>
        <div className="color-row">
          {COLORS.map((c) => (
            <span key={c} className="swatch" onClick={() => setColor(c)} style={{ background: c, boxShadow: color === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : 'var(--shadow-sm)' }} />
          ))}
        </div>
      </div>
      <button className="btn" style={{ marginTop: 8 }} onClick={submit} disabled={!title.trim()}>יצירה</button>
    </Sheet>
  );
}
