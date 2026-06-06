import { useState } from 'react';
import { api } from '../api.js';
import { usePoll } from '../lib/usePoll.js';
import Icon from '../lib/icons.jsx';
import Sheet from '../components/Sheet.jsx';
import VoiceModal from '../components/VoiceModal.jsx';
import { useToast } from '../components/Toast.jsx';

export default function ListDetail({ space, listId, onBack }) {
  const base = `/spaces/${space.id}/lists/${listId}`;
  const { data, refresh, setData } = usePoll(() => api(base), [listId]);
  const list = data?.list;
  const items = data?.items || [];
  const [adding, setAdding] = useState(false);
  const [voice, setVoice] = useState(false);
  const [menu, setMenu] = useState(false);
  const toast = useToast();

  const open = items.filter((i) => !i.done).length;
  const done = items.length - open;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const color = list?.color || '#6c5ce7';

  const toggle = async (item) => {
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) }));
    try { await api(`${base}/items/${item.id}`, { method: 'PATCH', body: { done: !item.done } }); }
    catch (e) { toast(e.message, 'err'); refresh(); }
  };
  const remove = async (item) => {
    setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }));
    try { await api(`${base}/items/${item.id}`, { method: 'DELETE' }); }
    catch (e) { toast(e.message, 'err'); refresh(); }
  };
  const addTexts = async (texts) => {
    try { await api(`${base}/items`, { method: 'POST', body: { texts } }); refresh(); toast(texts.length > 1 ? `נוספו ${texts.length} פריטים` : 'נוסף ✓'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const clearDone = async () => {
    setMenu(false);
    setData((d) => ({ ...d, items: d.items.filter((i) => !i.done) }));
    try { await api(`${base}/clear-done`, { method: 'POST' }); } catch (e) { toast(e.message, 'err'); refresh(); }
  };
  const deleteList = async () => {
    try { await api(base, { method: 'DELETE' }); onBack(); toast('הרשימה נמחקה'); }
    catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="screen with-tabs">
      <div className="topbar">
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="תפריט">···</button>
        <div className="spacer" />
        <button className="icon-btn" onClick={onBack} aria-label="חזרה"><Icon name="back" size={20} /></button>
      </div>

      <div className="list-head">
        <div className="lh-emoji" style={{ background: color + '22' }}>{list?.emoji || '📝'}</div>
        <div className="lh-text">
          <h1>{list?.title || '...'}</h1>
          <div className="sub">{open} פתוחים · {done} הושלמו</div>
        </div>
      </div>
      <div className="progress"><span style={{ width: `${pct}%`, background: color }} /></div>

      {items.length === 0 ? (
        <div className="empty"><div className="big">📝</div>הרשימה ריקה. הוסיפו פריט עם + או בהקלטה קולית 🎤</div>
      ) : (
        items.map((it) => (
          <div key={it.id} className={`row ${it.done ? 'checked' : ''}`}>
            <button className="check" onClick={() => toggle(it)} aria-label="סימון" style={it.done ? { background: color, borderColor: color } : {}}>
              <Icon name="check" size={15} />
            </button>
            <div className="row-main"><div className="row-name">{it.text}</div></div>
            <button className="del" onClick={() => remove(it)} aria-label="מחיקה"><Icon name="trash" size={18} /></button>
          </div>
        ))
      )}

      <button className="fab" onClick={() => setAdding(true)} aria-label="הוספה"><Icon name="plus" size={28} /></button>
      <button className="fab mic" onClick={() => setVoice(true)} aria-label="הקלטה"><Icon name="mic" size={24} /></button>

      <AddItemSheet open={adding} onClose={() => setAdding(false)} onAdd={(t) => addTexts([t])} />
      <VoiceModal open={voice} title={list?.title || 'הוספה'} onClose={() => setVoice(false)} onAdd={addTexts} />

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <h2>אפשרויות</h2>
        <button className="btn ghost" onClick={clearDone} disabled={!done} style={{ marginBottom: 10 }}>מחיקת הפריטים שהושלמו ({done})</button>
        <button className="btn ghost" style={{ color: 'var(--red)', marginBottom: 10 }} onClick={deleteList}>מחיקת הרשימה</button>
        <button className="btn ghost" onClick={() => setMenu(false)}>סגירה</button>
      </Sheet>
    </div>
  );
}

function AddItemSheet({ open, onClose, onAdd }) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <h2>הוספת פריט</h2>
      <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="מה להוסיף?" style={{ marginBottom: 16 }} />
      <button className="btn" onClick={submit} disabled={!text.trim()}>הוספה</button>
    </Sheet>
  );
}
