import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { SPACE_TYPES, STARTERS } from '../lib/util.js';

export default function Onboarding({ user, onReady }) {
  const [tab, setTab] = useState('create');
  const [type, setType] = useState(SPACE_TYPES[0]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { space } = await api('/spaces', {
        method: 'POST',
        body: { name: name.trim(), type: type.type, emoji: type.emoji, starterLists: STARTERS[type.type] || [] },
      });
      onReady(space);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { space } = await api('/spaces/join', { method: 'POST', body: { code: code.trim() } });
      onReady(space);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="brand">
        <img className="logo" src="/icon.svg" alt="יחד" />
        <h1>נתחיל ✨</h1>
        <p>צרו מרחב משותף משלכם, או הצטרפו לאחד קיים.</p>
      </div>

      <div className="chips" style={{ justifyContent: 'center', marginBottom: 22 }}>
        <span className={`chip ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>מרחב חדש</span>
        <span className={`chip ${tab === 'join' ? 'active' : ''}`} onClick={() => setTab('join')}>הצטרפות בקוד</span>
      </div>

      {tab === 'create' ? (
        <>
          <div className="field"><label>איזה מרחב?</label>
            <div className="type-grid">
              {SPACE_TYPES.map((t) => (
                <button key={t.type} className={`type-card ${type.type === t.type ? 'active' : ''}`} onClick={() => setType(t)}>
                  <span className="e">{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field"><label>שם המרחב</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type.type === 'home' ? 'משפחת כהן' : type.type === 'roommates' ? 'דירת רוטשילד' : 'תנו שם...'} />
          </div>
          <button className="btn" onClick={create} disabled={busy || !name.trim()}>צרו מרחב {type.emoji}</button>
        </>
      ) : (
        <>
          <div className="field"><label>קוד הצטרפות</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" dir="ltr" style={{ textAlign: 'center', letterSpacing: 4, fontWeight: 800 }} maxLength={6} />
          </div>
          <button className="btn" onClick={join} disabled={busy || !code.trim()}>הצטרפות</button>
        </>
      )}
    </div>
  );
}
