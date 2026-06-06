// Lightweight inline SVG icons (Feather-ish), stroke = currentColor.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const paths = {
  home: <path {...P} d="M3 11.5 12 4l9 7.5M5 10v10h14V10" />,
  cart: (
    <g {...P}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M2 3h2.2l2.2 12.2a1.5 1.5 0 0 0 1.5 1.2h8.5a1.5 1.5 0 0 0 1.5-1.2L20 7H5" />
    </g>
  ),
  tasks: (
    <g {...P}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M3 6l1.5 1.5L7 5M3 17l1.5 1.5L7 15" />
    </g>
  ),
  gear: (
    <g {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </g>
  ),
  plus: <path {...P} d="M12 5v14M5 12h14" />,
  minus: <path {...P} d="M5 12h14" />,
  mic: (
    <g {...P}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </g>
  ),
  check: <path {...P} d="M5 12.5 10 17 19 7" />,
  trash: <g {...P}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></g>,
  chevron: <path {...P} d="M14 6l-6 6 6 6" />,
  chevronL: <path {...P} d="M10 6l6 6-6 6" />,
  x: <path {...P} d="M6 6l12 12M18 6 6 18" />,
  logout: <g {...P}><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 16l4-4-4-4M20 12H9" /></g>,
  userPlus: <g {...P}><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0M18 8v6M21 11h-6" /></g>,
  userX: <g {...P}><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0M17 9l4 4M21 9l-4 4" /></g>,
  copy: <g {...P}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></g>,
  edit: <g {...P}><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></g>,
  user: <g {...P}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></g>,
  refresh: <g {...P}><path d="M20 11a8 8 0 1 0-1.5 5M20 5v6h-6" /></g>,
  bell: <g {...P}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21h4" /></g>,
};

export default function Icon({ name, size = 22, color, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ color, display: 'block', ...style }}>
      {paths[name] || null}
    </svg>
  );
}
