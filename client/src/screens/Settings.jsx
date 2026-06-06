import { useState } from 'react';
import { api, auth } from '../api.js';
import { usePoll } from '../lib/usePoll.js';
import Icon from '../lib/icons.jsx';
import Avatar from '../components/Avatar.jsx';
import Sheet from '../components/Sheet.jsx';
import { useToast } from '../components/Toast.jsx';

const COLORS = ['#ef8e4a', '#5b8def', '#34c759', '#ff9f0a', '#af52de', '#ff375f', '#30b0c7', '#ffcc00'];

export default function Settings({ user, home, onClose, onUser, onLogout, onHomeGone, onHomeChanged }) {
  const summary = usePoll(() => api(`/homes/${home.id}`), [home.id], 6000);
  const h = summary.data?.home || home;
  const toast = useToast();

  const [sheet, setSheet] = useState(null); // 'profile' | 'rename' | 'invite' | null
  const [confirm, setConfirm] = useState(null); // { title, body, danger, action, label }

  const removeMember = (m) =>
    setConfirm({
      title: 'הסרת חבר',
      body: `להסיר את ${m.name} מהבית?`,
      label: 'הסרה',
      action: async () => {
        try { await api(`/homes/${home.id}/members/${m.id}`, { method: 'DELETE' }); summary.refresh(); toast('החבר הוסר'); }
        catch (e) { toast(e.message, 'err'); }
      },
    });

  const leaveHome = () =>
    setConfirm({
      title: 'עזיבת הבית',
      body: `לעזוב את "${h.name}"? תאבד גישה לרשימות המשותפות.`,
      label: 'עזיבה',
      action: async () => {
        try { await api(`/homes/${home.id}/leave`, { method: 'POST' }); onHomeGone(); }
        catch (e) { toast(e.message, 'err'); }
      },
    });

  const deleteHome = () =>
    setConfirm({
      title: 'מחיקת הבית',
      body: `פעולה בלתי הפיכה! כל הרשימות, המשימות והחברים של "${h.name}" יימחקו לצמיתות.`,
      danger: true, label: 'מחיקה לצמיתות',
      action: async () => {
        try { await api(`/homes/${home.id}`, { method: 'DELETE' }); onHomeGone(); }
        catch (e) { toast(e.message, 'err'); }
      },
    });

  const deleteAccount = () =>
    setConfirm({
      title: 'מחיקת חשבון',
      body: 'פעולה בלתי הפיכה! החשבון שלך והבתים שבבעלותך יימחקו.',
      danger: true, label: 'מחיקת חשבון',
      action: async () => {
        try { await api('/auth/me', { method: 'DELETE' }); auth.clear(); onLogout(); }
        catch (e) { toast(e.message, 'err'); }
      },
    });

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn small ghost" style={{ width: 'auto' }} onClick={onClose}>סגור</button>
        <div className="spacer" />
        <h1>הגדרות</h1>
        <div style={{ width: 56 }} />
      </div>

      {/* profile */}
      <div className="settings-group">
        <div className="glabel">פרופיל</div>
        <div className="settings-card">
          <button className="srow" onClick={() => setSheet('profile')}>
            <Avatar user={user} size={44} />
            <div className="srow-main">
              <div className="srow-title">{user.name}</div>
              <div className="srow-sub" dir="ltr" style={{ textAlign: 'right' }}>@{user.username}</div>
            </div>
            <Icon name="chevron" className="chev" size={18} />
          </button>
        </div>
      </div>

      {/* home */}
      <div className="settings-group">
        <div className="glabel">בית — {h.name}</div>
        <div className="settings-card">
          {h.isOwner && (
            <button className="srow" onClick={() => setSheet('rename')}>
              <div className="lead" style={{ background: '#fbe3cd', color: '#ec7e34' }}><Icon name="home" size={18} /></div>
              <div className="srow-main"><div className="srow-title">הגדרות בית</div></div>
              <Icon name="chevron" className="chev" size={18} />
            </button>
          )}
          {h.members.map((m) => (
            <div className="srow" key={m.id}>
              {h.isOwner && m.role !== 'owner' ? (
                <button className="minus" onClick={() => removeMember(m)} aria-label="הסרה"><Icon name="minus" size={16} /></button>
              ) : (
                <Avatar user={m} size={34} />
              )}
              <div className="srow-main">
                <div className="srow-title">{m.name}</div>
                <div className="srow-sub">{m.role === 'owner' ? 'בעל הבית' : 'חבר'}</div>
              </div>
              {h.isOwner && m.role !== 'owner' && <Avatar user={m} size={34} />}
            </div>
          ))}
          <button className="srow" onClick={() => setSheet('invite')}>
            <div className="lead" style={{ background: '#e7f0ff', color: '#5b8def' }}><Icon name="userPlus" size={18} /></div>
            <div className="srow-main"><div className="srow-title">הזמנת חברים</div></div>
            <Icon name="chevron" className="chev" size={18} />
          </button>
        </div>
      </div>

      {/* account */}
      <div className="settings-group">
        <div className="glabel">חשבון</div>
        <div className="settings-card">
          <button className="srow" onClick={() => { auth.clear(); onLogout(); }}>
            <div className="lead" style={{ background: '#f0ece6', color: '#7a6f64' }}><Icon name="logout" size={18} /></div>
            <div className="srow-main"><div className="srow-title">התנתקות</div></div>
          </button>
          {!h.isOwner && (
            <button className="srow danger" onClick={leaveHome}>
              <div className="lead" style={{ background: '#fdecea', color: '#ff3b30' }}><Icon name="userX" size={18} /></div>
              <div className="srow-main"><div className="srow-title">עזיבת הבית</div></div>
            </button>
          )}
          <button className="srow danger" onClick={deleteAccount}>
            <div className="lead" style={{ background: '#fdecea', color: '#ff3b30' }}><Icon name="userX" size={18} /></div>
            <div className="srow-main"><div className="srow-title">מחיקת חשבון</div></div>
          </button>
        </div>
      </div>

      {/* danger */}
      {h.isOwner && (
        <div className="settings-group">
          <div className="glabel">פעולות בלתי הפיכות</div>
          <div className="settings-card">
            <button className="srow danger" onClick={deleteHome}>
              <div className="lead" style={{ background: '#fdecea', color: '#ff3b30' }}><Icon name="trash" size={18} /></div>
              <div className="srow-main"><div className="srow-title">מחיקת הבית</div></div>
            </button>
          </div>
        </div>
      )}

      <ProfileSheet open={sheet === 'profile'} user={user} onClose={() => setSheet(null)} onSaved={onUser} />
      <RenameSheet open={sheet === 'rename'} home={h} onClose={() => setSheet(null)} onSaved={(hh) => { onHomeChanged?.(hh); summary.refresh(); }} />
      <InviteSheet open={sheet === 'invite'} home={h} onClose={() => setSheet(null)} onRegenerated={() => summary.refresh()} />

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} dialog>
        <h2>{confirm?.title}</h2>
        <p className="note">{confirm?.body}</p>
        <button className={`btn ${confirm?.danger ? 'danger' : ''}`} style={confirm?.danger ? { background: '#ff3b30', color: '#fff', boxShadow: 'none' } : {}}
          onClick={async () => { const c = confirm; setConfirm(null); await c.action(); }}>
          {confirm?.label}
        </button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setConfirm(null)}>ביטול</button>
      </Sheet>
    </div>
  );
}

function ProfileSheet({ open, user, onClose, onSaved }) {
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color);
  const toast = useToast();
  const save = async () => {
    try {
      const { user: u } = await api('/auth/me', { method: 'PATCH', body: { name: name.trim(), color } });
      onSaved(u); onClose(); toast('הפרופיל עודכן ✓');
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <h2>הפרופיל שלי</h2>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}>
        <Avatar user={{ name, color }} size={72} />
      </div>
      <div className="field"><label>שם</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field"><label>צבע</label>
        <div className="chips">
          {COLORS.map((c) => (
            <span key={c} onClick={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: '50%', background: c, boxShadow: color === c ? '0 0 0 3px #fff, 0 0 0 5px ' + c : 'var(--shadow-sm)', cursor: 'pointer' }} />
          ))}
        </div>
      </div>
      <button className="btn" style={{ marginTop: 10 }} onClick={save} disabled={!name.trim()}>שמירה</button>
    </Sheet>
  );
}

function RenameSheet({ open, home, onClose, onSaved }) {
  const [name, setName] = useState(home.name);
  const toast = useToast();
  const save = async () => {
    try { const { home: hh } = await api(`/homes/${home.id}`, { method: 'PATCH', body: { name: name.trim() } }); onSaved(hh); onClose(); toast('עודכן ✓'); }
    catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <h2>הגדרות בית</h2>
      <div className="field"><label>שם הבית</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <button className="btn" onClick={save} disabled={!name.trim()}>שמירה</button>
    </Sheet>
  );
}

function InviteSheet({ open, home, onClose, onRegenerated }) {
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(home.inviteCode); toast('הקוד הועתק ✓'); }
    catch { toast('לא ניתן להעתיק', 'err'); }
  };
  const share = async () => {
    const text = `הצטרפו לבית "${home.name}" באפליקציית Homly עם הקוד: ${home.inviteCode}`;
    if (navigator.share) { try { await navigator.share({ title: 'Homly', text }); } catch {} }
    else copy();
  };
  const regen = async () => {
    try { await api(`/homes/${home.id}/invite/regenerate`, { method: 'POST' }); onRegenerated(); toast('נוצר קוד חדש'); }
    catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <h2>הזמנת חברים</h2>
      <p className="note">שתפו את הקוד עם בני הבית — הם יזינו אותו במסך ההצטרפות.</p>
      <div className="code-box" onClick={copy}>{home.inviteCode}</div>
      <button className="btn" style={{ marginTop: 16 }} onClick={share}>שיתוף ההזמנה</button>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={copy}>העתקת הקוד</button>
      {home.isOwner && <button className="btn ghost" style={{ marginTop: 10 }} onClick={regen}>יצירת קוד חדש</button>}
    </Sheet>
  );
}
