import { useState } from 'react';
import { api, auth } from '../api.js';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const { token, user } = await api(path, { method: 'POST', body: form });
      auth.set(token);
      onAuth(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="brand">
        <img className="logo" src="/icon.svg" alt="Homly" />
        <h1>Homly</h1>
        <p>כל הבית במקום אחד</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={submit}>
        {mode === 'register' && (
          <div className="field">
            <label>שם מלא</label>
            <input className="input" value={form.name} onChange={set('name')} placeholder="ישראל ישראלי" autoComplete="name" />
          </div>
        )}
        <div className="field">
          <label>שם משתמש</label>
          <input className="input" value={form.username} onChange={set('username')} placeholder="israelisraeli" dir="ltr" style={{ textAlign: 'left' }} autoComplete="username" />
        </div>
        {mode === 'register' && (
          <div className="field">
            <label>אימייל (לא חובה)</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" dir="ltr" style={{ textAlign: 'left' }} autoComplete="email" />
          </div>
        )}
        <div className="field">
          <label>סיסמה</label>
          <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>

        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 8 }}>
          {busy ? 'רגע...' : mode === 'login' ? 'התחברות' : 'יצירת חשבון'}
        </button>
      </form>

      <div className="switch">
        {mode === 'login' ? (
          <>אין לך חשבון? <b onClick={() => { setMode('register'); setError(''); }}>הרשמה</b></>
        ) : (
          <>כבר יש לך חשבון? <b onClick={() => { setMode('login'); setError(''); }}>התחברות</b></>
        )}
      </div>
    </div>
  );
}
