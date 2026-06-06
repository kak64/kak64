import { useState } from 'react';
import { api } from '../api.js';
import { usePoll } from '../lib/usePoll.js';
import Icon from '../lib/icons.jsx';
import Sheet from '../components/Sheet.jsx';
import VoiceModal from '../components/VoiceModal.jsx';
import { useToast } from '../components/Toast.jsx';

function dueLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `היום ${time}`;
  if (diff === 1) return `מחר ${time}`;
  if (diff === -1) return `אתמול ${time}`;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }) + ` ${time}`;
}

export default function Tasks({ home, onBack }) {
  const { data, refresh, setData } = usePoll(() => api(`/homes/${home.id}/tasks`), [home.id]);
  const tasks = data?.tasks || [];
  const [adding, setAdding] = useState(false);
  const [voice, setVoice] = useState(false);
  const toast = useToast();

  const open = tasks.filter((t) => !t.done).length;
  const done = tasks.length - open;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const toggle = async (t) => {
    setData((d) => ({ tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }));
    try { await api(`/homes/${home.id}/tasks/${t.id}`, { method: 'PATCH', body: { done: !t.done } }); }
    catch (e) { toast(e.message, 'err'); refresh(); }
  };
  const remove = async (t) => {
    setData((d) => ({ tasks: d.tasks.filter((x) => x.id !== t.id) }));
    try { await api(`/homes/${home.id}/tasks/${t.id}`, { method: 'DELETE' }); }
    catch (e) { toast(e.message, 'err'); refresh(); }
  };
  const add = async (title, dueAt) => {
    try {
      await api(`/homes/${home.id}/tasks`, { method: 'POST', body: { title, dueAt } });
      refresh(); toast('המשימה נוספה ✓');
    } catch (e) { toast(e.message, 'err'); }
  };
  const addMany = async (titles) => {
    for (const t of titles) await api(`/homes/${home.id}/tasks`, { method: 'POST', body: { title: t } }).catch(() => {});
    refresh(); toast(titles.length > 1 ? `נוספו ${titles.length} משימות` : 'המשימה נוספה ✓');
  };

  return (
    <div className="screen with-tabs">
      <div className="topbar">
        <div style={{ width: 42 }} />
        <div className="spacer" />
        <button className="icon-btn" onClick={onBack} aria-label="חזרה"><Icon name="chevronL" size={20} /></button>
      </div>

      <div className="list-head">
        <h1>רשימת משימות</h1>
        <div className="sub">{open} פתוחות · {done} הושלמו</div>
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty"><div className="big">✅</div>אין משימות פתוחות. נוסיף אחת עם +?</div>
      ) : (
        tasks.map((t) => (
          <div key={t.id} className={`row ${t.done ? 'checked' : ''}`}>
            <button className="check" onClick={() => toggle(t)} aria-label="סימון"><Icon name="check" size={15} /></button>
            <div className="row-main">
              <div className="row-name">{t.title}</div>
              {t.dueAt && <div className="row-meta"><Icon name="bell" size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> {dueLabel(t.dueAt)}</div>}
            </div>
            <button className="del" onClick={() => remove(t)} aria-label="מחיקה"><Icon name="trash" size={18} /></button>
          </div>
        ))
      )}

      <button className="fab" onClick={() => setAdding(true)} aria-label="הוספה"><Icon name="plus" size={28} /></button>
      <button className="fab mic" onClick={() => setVoice(true)} aria-label="הקלטה"><Icon name="mic" size={24} /></button>

      <AddTaskSheet open={adding} onClose={() => setAdding(false)} onAdd={add} />
      <VoiceModal open={voice} title="רשימת משימות" onClose={() => setVoice(false)} onAdd={addMany} />
    </div>
  );
}

function AddTaskSheet({ open, onClose, onAdd }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), due ? new Date(due).toISOString() : null);
    setTitle(''); setDue('');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <h2>משימה חדשה</h2>
      <input
        className="input" autoFocus value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="למשל: לשלם ארנונה"
        style={{ marginBottom: 14 }}
      />
      <div className="field" style={{ marginBottom: 18 }}>
        <label>תזכורת (לא חובה)</label>
        <input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} dir="ltr" />
      </div>
      <button className="btn" onClick={submit} disabled={!title.trim()}>הוספה</button>
    </Sheet>
  );
}
