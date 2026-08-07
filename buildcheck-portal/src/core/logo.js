// BuildCheck Portal — deterministic company logo generator.
// Every company gets a unique geometric SVG mark derived from a numeric seed;
// the app admin can re-roll the seed at any time (🎲) to give the client
// company a fresh identity. Same seed + name -> identical logo, always.

import { createRng } from './util.js';

const PALETTES = [
  { bg: '#1e56a0', fg: '#eaf1fa' }, // blueprint blue
  { bg: '#0e7c6b', fg: '#e7f6f2' }, // teal
  { bg: '#b3731f', fg: '#fdf3e3' }, // amber
  { bg: '#3f4a5a', fg: '#eceff3' }, // slate
  { bg: '#8a2f3c', fg: '#faeaec' }, // bordeaux
  { bg: '#2f7d46', fg: '#e9f5ec' }, // green
  { bg: '#5b3f8a', fg: '#f0ebfa' }, // violet
  { bg: '#9a4b1f', fg: '#fbeee6' }, // terracotta
];

const MOTIFS = ['beams', 'hex', 'grid', 'rings'];

/** Hebrew (or any) initials: first letter of up to two words. */
export function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((w) => w[0]).join('');
}

export function randomLogoSeed(rng = Math.random) {
  return Math.floor(rng() * 1e9);
}

/** Deterministic SVG logo for a company. size in px (square). */
export function generateLogo(seed, name, size = 64) {
  const rng = createRng(seed >>> 0);
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
  const motif = MOTIFS[Math.floor(rng() * MOTIFS.length)];
  const rot = Math.floor(rng() * 4) * 90;
  const initials = initialsOf(name);
  const fontSize = initials.length > 1 ? 34 : 42;

  let decor = '';
  if (motif === 'beams') {
    decor = `<g opacity="0.22" transform="rotate(${rot} 48 48)">
      <rect x="-20" y="14" width="136" height="10" fill="${palette.fg}"/>
      <rect x="-20" y="36" width="136" height="6" fill="${palette.fg}"/>
      <rect x="-20" y="72" width="136" height="12" fill="${palette.fg}"/>
    </g>`;
  } else if (motif === 'hex') {
    decor = `<g opacity="0.2" transform="rotate(${rot} 48 48)">
      <polygon points="48,6 84,27 84,69 48,90 12,69 12,27" fill="none" stroke="${palette.fg}" stroke-width="7"/>
    </g>`;
  } else if (motif === 'grid') {
    decor = `<g opacity="0.18" stroke="${palette.fg}" stroke-width="2.5">
      <path d="M24 0V96 M48 0V96 M72 0V96 M0 24H96 M0 48H96 M0 72H96"/>
    </g>`;
  } else {
    decor = `<g opacity="0.2" fill="none" stroke="${palette.fg}" stroke-width="7">
      <circle cx="${rot >= 180 ? 76 : 20}" cy="20" r="26"/>
      <circle cx="${rot >= 180 ? 20 : 76}" cy="76" r="38"/>
    </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96" role="img" aria-label="${escapeXml(name ?? '')}">
  <rect width="96" height="96" rx="20" fill="${palette.bg}"/>
  ${decor}
  <text x="48" y="48" dy="0.36em" text-anchor="middle" font-family="'Segoe UI','Noto Sans Hebrew',Arial,sans-serif" font-weight="700" font-size="${fontSize}" fill="${palette.fg}">${escapeXml(initials)}</text>
</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
