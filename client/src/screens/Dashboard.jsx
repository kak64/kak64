import { useEffect } from 'react';
import { api } from '../api.js';
import { usePoll } from '../lib/usePoll.js';
import Icon from '../lib/icons.jsx';
import Avatar, { AvatarStack } from '../components/Avatar.jsx';
import ProgressRing from '../components/ProgressRing.jsx';
import { relativeTime, greeting, todayLabel, ACTION_LABEL } from '../lib/util.js';

function FeedRow({ a }) {
  return (
    <div className="feed-row">
      <div className="time">{relativeTime(a.createdAt)}</div>
      <div className="body">
        <div className="l1">{a.user ? <b>{a.user.name.split(' ')[0]} </b> : null}{ACTION_LABEL[a.action] || a.action} {a.text}</div>
        <div className="l2">{a.emoji}</div>
      </div>
      {a.user ? <Avatar user={a.user} size={38} /> : <div className="feed-icon">{a.emoji || '•'}</div>}
    </div>
  );
}

export default function Dashboard({ user, space, onOpenSettings, onOpenList, onOpenLists, onSpace }) {
  const { data, loading } = usePoll(() => api(`/spaces/${space.id}/dashboard`), [space.id]);

  useEffect(() => {
    if (data?.space) onSpace?.(data.space);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.space]);

  const s = data?.space || space;
  const stats = data?.stats || { open: s.open, done: s.done, total: s.total, completion: 0, doneThisWeek: 0 };
  const lists = data?.lists || [];
  const contributions = (data?.contributions || []).filter((c) => c.done > 0);
  const activity = data?.activity || [];
  const maxContrib = Math.max(1, ...contributions.map((c) => c.done));

  return (
    <div className="screen with-tabs">
      <div className="topbar">
        <button className="icon-btn" onClick={onOpenSettings} aria-label="הגדרות"><Icon name="gear" size={20} /></button>
        <div className="spacer" />
        <h1>{s.name}</h1>
        <div style={{ width: 42 }} />
      </div>

      {/* hero with completion ring */}
      <div className="hero">
        <div className="hero-top">
          <div className="hero-emoji">{s.emoji}</div>
          <div className="t">
            <div className="small">{greeting()}, {user.name.split(' ')[0]} 👋</div>
            <div className="name">{todayLabel()}</div>
            <div className="small" style={{ marginTop: 4 }}><AvatarStack members={s.members} size={26} ringColor="#8b6cf0" /></div>
          </div>
          <div className="hero-ring">
            <ProgressRing value={stats.completion} size={86} stroke={9}>
              <span style={{ fontSize: 20 }}>{stats.completion}%</span>
            </ProgressRing>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="v">{stats.open}</div><div className="l">פתוחים</div></div>
          <div className="hero-stat"><div className="v">{stats.done}</div><div className="l">הושלמו</div></div>
          <div className="hero-stat"><div className="v">{stats.doneThisWeek}</div><div className="l">השבוע 🔥</div></div>
        </div>
      </div>

      {loading && !data ? (
        <div className="spinner" />
      ) : (
        <>
          {/* lists progress */}
          <div className="section-head">
            <h2>הרשימות שלכם</h2>
            <button className="more" onClick={onOpenLists}>לכל הרשימות ›</button>
          </div>
          {lists.length === 0 ? (
            <div className="card empty" style={{ padding: 28 }}><div className="big">🗂️</div>עדיין אין רשימות. צרו אחת במסך הרשימות!</div>
          ) : (
            <div className="card">
              {lists.slice(0, 5).map((l) => {
                const pct = l.total ? Math.round((l.done / l.total) * 100) : 0;
                return (
                  <div key={l.id} className="contrib-row" onClick={() => onOpenList(l.id)} style={{ cursor: 'pointer' }}>
                    <div className="feed-icon" style={{ background: l.color + '22', fontSize: 18 }}>{l.emoji}</div>
                    <div className="cname">{l.title}<div className="l2" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{l.done}/{l.total} הושלמו</div></div>
                    <div className="cbar"><span style={{ width: `${pct}%`, background: l.color }} /></div>
                  </div>
                );
              })}
            </div>
          )}

          {/* contributions */}
          {contributions.length > 0 && (
            <>
              <div className="section-head"><h2>מי הכי תורם 🏆</h2></div>
              <div className="card">
                {contributions.map((c) => (
                  <div key={c.id} className="contrib-row">
                    <Avatar user={c} size={34} />
                    <div className="cname">{c.name}</div>
                    <div className="cbar"><span style={{ width: `${(c.done / maxContrib) * 100}%` }} /></div>
                    <div className="cval">{c.done}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* recent activity */}
          <div className="section-head"><h2>פעילות אחרונה</h2></div>
          <div className="card feed">
            {activity.length ? (
              activity.map((a) => <FeedRow key={a.id} a={a} />)
            ) : (
              <div className="empty"><div className="big">✨</div>אין פעילות עדיין.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
