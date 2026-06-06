export default function ProgressRing({ value = 0, size = 92, stroke = 9, track = 'rgba(255,255,255,.28)', color = '#fff', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div className="pct" style={{ fontSize: size * 0.26, color }}>
        {children ?? `${Math.round(value)}%`}
      </div>
    </div>
  );
}
