import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

export default function Onboarding({ user, onReady }) {
  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [name, setName] = useState(`משפחת ${(user.name || '').split(' ').pop() || ''}`.trim());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { home } = await api('/homes', { method: 'POST', body: { name: name.trim() } });
      onReady(home);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { home } = await api('/homes/join', { method: 'POST', body: { code: code.trim() } });
      onReady(home);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="brand">
        <img className="logo" src="/icon.svg" alt="Homly" />
        <h1>ברוכים הבאים! 🏡</h1>
        <p>בואו ניצור את הבית שלכם, או הצטרפו לאחד קיים.</p>
      </div>

      <div className="chips" style={{ justifyContent: 'center', marginBottom: 22 }}>
        <span className={`chip ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>בית חדש</span>
        <span className={`chip ${tab === 'join' ? 'active' : ''}`} onClick={() => setTab('join')}>הצטרפות בקוד</span>
      </div>

      {tab === 'create' ? (
        <>
          <div className="field">
            <label>שם הבית</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="משפחת ישראלי" />
          </div>
          <button className="btn" onClick={create} disabled={busy || !name.trim()}>צור בית</button>
        </>
      ) : (
        <>
          <div className="field">
            <label>קוד הצטרפות</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" dir="ltr" style={{ textAlign: 'center', letterSpacing: 4, fontWeight: 800 }} maxLength={6} />
          </div>
          <button className="btn" onClick={join} disabled={busy || !code.trim()}>הצטרפות</button>
        </>
      )}
    </div>
  );
}
