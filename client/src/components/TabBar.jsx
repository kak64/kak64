import Icon from '../lib/icons.jsx';

const TABS = [
  { id: 'tasks', icon: 'tasks' },
  { id: 'shopping', icon: 'cart' },
  { id: 'home', icon: 'home' },
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
            aria-label={t.id}
          >
            <Icon name={t.icon} size={24} />
          </button>
        ))}
      </div>
    </nav>
  );
}
