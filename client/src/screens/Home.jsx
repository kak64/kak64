import { useEffect } from 'react';
import { api } from '../api.js';
import { usePoll } from '../lib/usePoll.js';
import Icon from '../lib/icons.jsx';
import Avatar, { AvatarStack } from '../components/Avatar.jsx';
import { relativeTime, todayLabel, greeting } from '../lib/util.js';

const ACTION_TEXT = {
  added: 'הוספה',
  completed: 'השלמה',
  removed: 'הסרה',
  reopened: 'החזרה',
};
const KIND_TEXT = { shopping: 'רשימת קניות', task: 'רשימת משימות' };

function FeedRow({ a }) {
  const completed = a.action === 'completed';
  const isTask = a.kind === 'task';
  return (
    <div className="feed-row">
      <div className="time">{relativeTime(a.createdAt)}</div>
      <div className="body">
        <div className="line1"><b>{ACTION_TEXT[a.action] || a.action}</b> {a.text}</div>
        <div className="line2">{KIND_TEXT[a.kind] || a.kind}{a.user ? ` · ${a.user.name}` : ''}</div>
      </div>
      {completed ? (
        <div className="feed-icon" style={{ background: isTask ? '#d8ecff' : '#fbe3cd', color: isTask ? '#5b8def' : '#ec7e34' }}>
          <Icon name="check" size={18} />
        </div>
      ) : a.user ? (
        <Avatar user={a.user} size={38} />
      ) : (
        <div className="feed-icon" style={{ background: '#fbe3cd', color: '#ec7e34' }}><Icon name="plus" size={18} /></div>
      )}
    </div>
  );
}

export default function Home({ user, home, onOpenTab, onOpenSettings, onHome }) {
  const feed = usePoll(() => api(`/homes/${home.id}/activity?limit=25`), [home.id]);
  const summary = usePoll(() => api(`/homes/${home.id}`), [home.id]);

  const h = summary.data?.home || home;
  // keep the parent's home object (name / members / counts) in sync
  useEffect(() => {
    if (summary.data?.home) onHome?.(summary.data.home);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.data]);
  const g = greeting();

  return (
    <div className="screen with-tabs">
      <div className="topbar">
        <button className="icon-btn" onClick={onOpenSettings} aria-label="הגדרות"><Icon name="gear" size={20} /></button>
        <div className="spacer" />
        <h1>{h.name}</h1>
        <div style={{ width: 42 }} />
      </div>

      <div className="hero">
        <AvatarStack members={h.members} size={40} />
        <div className="hero-text">
          <div className="small">{g.text} {g.emoji}</div>
          <div className="name">{user.name}</div>
          <div className="date">{todayLabel()}</div>
        </div>
        <div className="hero-house">🏠</div>
      </div>

      <div className="stats">
        <button className="stat" onClick={() => onOpenTab('tasks')}>
          <div className="bubble blue"><Icon name="tasks" size={22} /></div>
          <div className="num">{h.openTasks}</div>
          <div className="label">משימות</div>
        </button>
        <button className="stat" onClick={() => onOpenTab('shopping')}>
          <div className="bubble orange"><Icon name="cart" size={22} /></div>
          <div className="num">{h.openShopping}</div>
          <div className="label">קניות</div>
        </button>
      </div>

      <div className="section-title">עדכונים אחרונים</div>
      <div className="card feed">
        {feed.loading && !feed.data ? (
          <div className="spinner" />
        ) : feed.data?.activity?.length ? (
          feed.data.activity.map((a) => <FeedRow key={a.id} a={a} />)
        ) : (
          <div className="empty">
            <div className="big">✨</div>
            עדיין אין פעילות. הוסיפו פריט לרשימה או משימה חדשה!
          </div>
        )}
      </div>
    </div>
  );
}
