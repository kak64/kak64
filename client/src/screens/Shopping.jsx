import { useState } from 'react';
import { api } from '../api.js';
import { usePoll } from '../lib/usePoll.js';
import Icon from '../lib/icons.jsx';
import Sheet from '../components/Sheet.jsx';
import VoiceModal from '../components/VoiceModal.jsx';
import { useToast } from '../components/Toast.jsx';
import { CATEGORIES, guessCategory } from '../lib/util.js';

export default function Shopping({ home, onBack }) {
  const { data, refresh, setData } = usePoll(() => api(`/homes/${home.id}/shopping`), [home.id]);
  const items = data?.items || [];
  const [adding, setAdding] = useState(false);
  const [voice, setVoice] = useState(false);
  const [menu, setMenu] = useState(false);
  const toast = useToast();

  const open = items.filter((i) => !i.checked).length;
  const done = items.length - open;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const toggle = async (item) => {
    // optimistic
    setData((d) => ({ items: d.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)) }));
    try { await api(`/homes/${home.id}/shopping/${item.id}`, { method: 'PATCH', body: { checked: !item.checked } }); }
    catch (e) { toast(e.message, 'err'); refresh(); }
  };

  const remove = async (item) => {
    setData((d) => ({ items: d.items.filter((i) => i.id !== item.id) }));
    try { await api(`/homes/${home.id}/shopping/${item.id}`, { method: 'DELETE' }); }
    catch (e) { toast(e.message, 'err'); refresh(); }
  };

  const addNames = async (names, category) => {
    try {
      await api(`/homes/${home.id}/shopping`, { method: 'POST', body: { names, category } });
      refresh();
      toast(names.length > 1 ? `נוספו ${names.length} פריטים` : 'נוסף לרשימה ✓');
    } catch (e) { toast(e.message, 'err'); }
  };

  const clearChecked = async () => {
    setMenu(false);
    setData((d) => ({ items: d.items.filter((i) => !i.checked) }));
    try { await api(`/homes/${home.id}/shopping/clear-checked`, { method: 'POST' }); }
    catch (e) { toast(e.message, 'err'); refresh(); }
  };

  // group by category, open items grouped, checked items last
  const openItems = items.filter((i) => !i.checked);
  const checkedItems = items.filter((i) => i.checked);
  const groups = {};
  for (const it of openItems) (groups[it.category] ||= []).push(it);
  const orderedCats = CATEGORIES.filter((c) => groups[c]);

  return (
    <div className="screen with-tabs">
      <div className="topbar">
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="תפריט">···</button>
        <div className="spacer" />
        <button className="icon-btn" onClick={onBack} aria-label="חזרה"><Icon name="chevronL" size={20} /></button>
      </div>

      <div className="list-head">
        <h1>רשימת קניות</h1>
        <div className="sub">{open} פתוחים · {done} הושלמו</div>
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
      </div>

      {items.length === 0 ? (
        <div className="empty"><div className="big">🛒</div>הרשימה ריקה. הוסיפו פריט עם + או בהקלטה קולית 🎤</div>
      ) : (
        <>
          {orderedCats.map((cat) => (
            <div key={cat}>
              {orderedCats.length > 1 && <div className="cat-label">{cat}</div>}
              {groups[cat].map((it) => (
                <ItemRow key={it.id} item={it} onToggle={toggle} onRemove={remove} />
              ))}
            </div>
          ))}
          {checkedItems.length > 0 && <div className="cat-label">הושלמו</div>}
          {checkedItems.map((it) => (
            <ItemRow key={it.id} item={it} onToggle={toggle} onRemove={remove} />
          ))}
        </>
      )}

      <button className="fab" onClick={() => setAdding(true)} aria-label="הוספה"><Icon name="plus" size={28} /></button>
      <button className="fab mic" onClick={() => setVoice(true)} aria-label="הקלטה"><Icon name="mic" size={24} /></button>

      <AddItemSheet open={adding} onClose={() => setAdding(false)} onAdd={addNames} />
      <VoiceModal open={voice} title="רשימת קניות" onClose={() => setVoice(false)} onAdd={(names) => addNames(names)} />

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <h2>אפשרויות</h2>
        <button className="btn ghost" onClick={clearChecked} disabled={!done} style={{ marginBottom: 10 }}>
          מחיקת הפריטים שהושלמו ({done})
        </button>
        <button className="btn ghost" onClick={() => setMenu(false)}>סגירה</button>
      </Sheet>
    </div>
  );
}

function ItemRow({ item, onToggle, onRemove }) {
  return (
    <div className={`row ${item.checked ? 'checked' : ''}`}>
      <button className="check" onClick={() => onToggle(item)} aria-label="סימון">
        <Icon name="check" size={15} />
      </button>
      <div className="row-main">
        <div className="row-name">{item.name}</div>
        {item.category && item.category !== 'אחר' && <div className="row-meta">{item.category}</div>}
      </div>
      <button className="del" onClick={() => onRemove(item)} aria-label="מחיקה"><Icon name="trash" size={18} /></button>
    </div>
  );
}

function AddItemSheet({ open, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('אחר');
  const [touchedCat, setTouchedCat] = useState(false);

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onAdd([n], touchedCat ? cat : guessCategory(n));
    setName(''); setCat('אחר'); setTouchedCat(false);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <h2>הוספת פריט</h2>
      <input
        className="input" autoFocus value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="מה צריך לקנות?"
        style={{ marginBottom: 14 }}
      />
      <div className="chips" style={{ marginBottom: 18 }}>
        {CATEGORIES.map((c) => (
          <span key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => { setCat(c); setTouchedCat(true); }}>{c}</span>
        ))}
      </div>
      <button className="btn" onClick={submit} disabled={!name.trim()}>הוספה</button>
    </Sheet>
  );
}
