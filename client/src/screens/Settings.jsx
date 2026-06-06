import { useState } from 'react';
import { api, auth } from '../api.js';
import { usePoll } from '../lib/usePoll.js';
import Icon from '../lib/icons.jsx';
import Avatar from '../components/Avatar.jsx';
import Sheet from '../components/Sheet.jsx';
import { useToast } from '../components/Toast.jsx';
import { COLORS, SPACE_TYPES } from '../lib/util.js';

export default function Settings({ user, space, onClose, onUser, onLogout, onSpaceGone, onSpaceChanged }) {
  const summary = usePoll(() => api(`/spaces/${space.id}`), [space.id], 6000);
  const s = summary.data?.space || space;
  const toast = useToast();

  const [sheet, setSheet] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const removeMember = (m) => setConfirm({
    title: 'הסרת חבר', body: `להסיר את ${m.name} מהמרחב?`, label: 'הסרה',
    action: async () => { try { await api(`/spaces/${space.id}/members/${m.id}`, { method: 'DELETE' }); summary.refresh(); toast('החבר הוסר'); } catch (e) { toast(e.message, 'err'); } },
  });
  const leave = () => setConfirm({
    title: 'עזיבת המרחב', body: `לעזוב את "${s.name}"? תאבד גישה לרשימות המשותפות.`, label: 'עזיבה',
    action: async () => { try { await api(`/spaces/${space.id}/leave`, { method: 'POST' }); onSpaceGone(); } catch (e) { toast(e.message, 'err'); } },
  });
  const del = () => setConfirm({
    title: 'מחיקת המרחב', body: `פעולה בלתי הפיכה! כל הרשימות והחברים של "${s.name}" יימחקו לצמיתות.`, danger: true, label: 'מחיקה לצמיתות',
    action: async () => { try { await api(`/spaces/${space.id}`, { method: 'DELETE' }); onSpaceGone(); } catch (e) { toast(e.message, 'err'); } },
  });
  const delAccount = () => setConfirm({
    title: 'מחיקת חשבון', body: 'פעולה בלתי הפיכה! החשבון שלך והמרחבים שבבעלותך יימחקו.', danger: true, label: 'מחיקת חשבון',
    action: async () => { try { await api('/auth/me', { method: 'DELETE' }); auth.clear(); onLogout(); } catch (e) { toast(e.message, 'err'); } },
  });

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn small ghost" style={{ width: 'auto' }} onClick={onClose}>סגור</button>
        <div className="spacer" />
        <h1>הגדרות</h1>
        <div style={{ width: 56 }} />
      </div>

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

      <div className="settings-group">
        <div className="glabel">מרחב — {s.emoji} {s.name}</div>
        <div className="settings-card">
          {s.isOwner && (
            <button className="srow" onClick={() => setSheet('rename')}>
              <div className="lead" style={{ background: 'var(--soft)', color: 'var(--primary)' }}><Icon name="edit" size={18} /></div>
              <div className="srow-main"><div className="srow-title">עריכת המרחב</div></div>
              <Icon name="chevron" className="chev" size={18} />
            </button>
          )}
          {s.members.map((m) => (
            <div className="srow" key={m.id}>
              {s.isOwner && m.role !== 'owner'
                ? <button className="minus" onClick={() => removeMember(m)} aria-label="הסרה"><Icon name="minus" size={16} /></button>
                : <Avatar user={m} size={34} />}
              <div className="srow-main">
                <div className="srow-title">{m.name}</div>
                <div className="srow-sub">{m.role === 'owner' ? 'בעל המרחב' : 'חבר'}</div>
              </div>
              {s.isOwner && m.role !== 'owner' && <Avatar user={m} size={34} />}
            </div>
          ))}
          <button className="srow" onClick={() => setSheet('invite')}>
            <div className="lead" style={{ background: 'var(--soft-teal)', color: 'var(--teal)' }}><Icon name="userPlus" size={18} /></div>
            <div className="srow-main"><div className="srow-title">הזמנת חברים</div></div>
            <Icon name="chevron" className="chev" size={18} />
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="glabel">חשבון</div>
        <div className="settings-card">
          <button className="srow" onClick={() => { auth.clear(); onLogout(); }}>
            <div className="lead" style={{ background: '#eee', color: '#777' }}><Icon name="logout" size={18} /></div>
            <div className="srow-main"><div className="srow-title">התנתקות</div></div>
          </button>
          {!s.isOwner && (
            <button className="srow danger" onClick={leave}>
              <div className="lead" style={{ background: '#ffe8ec', color: 'var(--red)' }}><Icon name="userX" size={18} /></div>
              <div className="srow-main"><div className="srow-title">עזיבת המרחב</div></div>
            </button>
          )}
          <button className="srow danger" onClick={delAccount}>
            <div className="lead" style={{ background: '#ffe8ec', color: 'var(--red)' }}><Icon name="userX" size={18} /></div>
            <div className="srow-main"><div className="srow-title">מחיקת חשבון</div></div>
          </button>
        </div>
      </div>

      {s.isOwner && (
        <div className="settings-group">
          <div className="glabel">פעולות בלתי הפיכות</div>
          <div className="settings-card">
            <button className="srow danger" onClick={del}>
              <div className="lead" style={{ background: '#ffe8ec', color: 'var(--red)' }}><Icon name="trash" size={18} /></div>
              <div className="srow-main"><div className="srow-title">מחיקת המרחב</div></div>
            </button>
          </div>
        </div>
      )}

      <ProfileSheet open={sheet === 'profile'} user={user} onClose={() => setSheet(null)} onSaved={onUser} />
      <EditSpaceSheet open={sheet === 'rename'} space={s} onClose={() => setSheet(null)} onSaved={(sp) => { onSpaceChanged?.(sp); summary.refresh(); }} />
      <InviteSheet open={sheet === 'invite'} space={s} onClose={() => setSheet(null)} onRegenerated={() => summary.refresh()} />

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} dialog>
        <h2>{confirm?.title}</h2>
        <p className="note">{confirm?.body}</p>
        <button className="btn" style={confirm?.danger ? { background: 'var(--red)', boxShadow: 'none' } : {}}
          onClick={async () => { const c = confirm; setConfirm(null); await c.action(); }}>{confirm?.label}</button>
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
    try { const { user: u } = await api('/auth/me', { method: 'PATCH', body: { name: name.trim(), color } }); onSaved(u); onClose(); toast('הפרופיל עודכן ✓'); }
    catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <h2>הפרופיל שלי</h2>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }}><Avatar user={{ name, color }} size={72} /></div>
      <div className="field"><label>שם</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>צבע</label>
        <div className="color-row">
          {COLORS.map((c) => <span key={c} className="swatch" onClick={() => setColor(c)} style={{ background: c, boxShadow: color === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : 'var(--shadow-sm)' }} />)}
        </div>
      </div>
      <button className="btn" style={{ marginTop: 10 }} onClick={save} disabled={!name.trim()}>שמירה</button>
    </Sheet>
  );
}

function EditSpaceSheet({ open, space, onClose, onSaved }) {
  const [name, setName] = useState(space.name);
  const [emoji, setEmoji] = useState(space.emoji);
  const toast = useToast();
  const save = async () => {
    try { const { space: sp } = await api(`/spaces/${space.id}`, { method: 'PATCH', body: { name: name.trim(), emoji } }); onSaved(sp); onClose(); toast('עודכן ✓'); }
    catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <h2>עריכת המרחב</h2>
      <div className="field"><label>אייקון</label>
        <div className="chips">
          {SPACE_TYPES.map((t) => <span key={t.emoji} className={`chip ${emoji === t.emoji ? 'active' : ''}`} onClick={() => setEmoji(t.emoji)} style={{ fontSize: 20 }}>{t.emoji}</span>)}
        </div>
      </div>
      <div className="field"><label>שם המרחב</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <button className="btn" onClick={save} disabled={!name.trim()}>שמירה</button>
    </Sheet>
  );
}

function InviteSheet({ open, space, onClose, onRegenerated }) {
  const toast = useToast();
  const copy = async () => { try { await navigator.clipboard.writeText(space.inviteCode); toast('הקוד הועתק ✓'); } catch { toast('לא ניתן להעתיק', 'err'); } };
  const share = async () => {
    const text = `הצטרפו למרחב "${space.name}" באפליקציית יחד עם הקוד: ${space.inviteCode}`;
    if (navigator.share) { try { await navigator.share({ title: 'יחד', text }); } catch {} } else copy();
  };
  const regen = async () => { try { await api(`/spaces/${space.id}/invite/regenerate`, { method: 'POST' }); onRegenerated(); toast('נוצר קוד חדש'); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Sheet open={open} onClose={onClose}>
      <h2>הזמנת חברים</h2>
      <p className="note">שתפו את הקוד — הם יזינו אותו במסך ההצטרפות.</p>
      <div className="code-box" onClick={copy}>{space.inviteCode}</div>
      <button className="btn" style={{ marginTop: 16 }} onClick={share}>שיתוף ההזמנה</button>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={copy}>העתקת הקוד</button>
      {space.isOwner && <button className="btn ghost" style={{ marginTop: 10 }} onClick={regen}>יצירת קוד חדש</button>}
    </Sheet>
  );
}
