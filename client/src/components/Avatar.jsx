import { initials } from '../lib/util.js';

export default function Avatar({ user, size = 38, ring }) {
  const name = user?.name || '';
  const bg = user?.color || '#ef8e4a';
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.4,
        boxShadow: ring ? `0 0 0 2.5px ${ring}` : undefined,
      }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}

export function AvatarStack({ members = [], size = 34, max = 3, ringColor = '#f3934a' }) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="stack-avatars">
      {extra > 0 && (
        <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: '#cbbfb2', boxShadow: `0 0 0 2.5px ${ringColor}` }}>
          +{extra}
        </div>
      )}
      {shown.map((m) => (
        <Avatar key={m.id} user={m} size={size} ring={ringColor} />
      ))}
    </div>
  );
}
