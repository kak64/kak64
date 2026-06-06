import Icon from '../lib/icons.jsx';

const TABS = [
  { id: 'dashboard', icon: 'chart', label: 'סיכום' },
  { id: 'lists', icon: 'grid', label: 'רשימות' },
];

export default function TabBar({ active, onChange }) {
  return (
    <nav className="tabbar">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${active === t.id ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <Icon name={t.icon} size={22} />
            <span className="tl">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
