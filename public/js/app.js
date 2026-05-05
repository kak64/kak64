// Smooth scroll for in-page anchors
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  if (!id) return;
  const t = document.getElementById(id);
  if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});

// Auto-dismiss flash messages
setTimeout(() => {
  document.querySelectorAll('.flash').forEach(f => {
    f.style.transition = 'opacity .4s, transform .4s';
    f.style.opacity = '0';
    f.style.transform = 'translateY(-8px)';
    setTimeout(() => f.remove(), 400);
  });
}, 4500);

// Confirm before destructive forms
document.querySelectorAll('form[data-confirm]').forEach(f => {
  f.addEventListener('submit', e => {
    if (!confirm(f.dataset.confirm)) e.preventDefault();
  });
});

// ---------- Live FiveM server status ----------
async function loadServerStatus() {
  const el = document.getElementById('server-status');
  if (!el) return;
  try {
    const r = await fetch('/api/server-status', { cache: 'no-store' });
    const data = await r.json();
    el.classList.remove('loading');
    if (data.online) {
      el.classList.add('online');
      el.classList.remove('offline');
      const num = el.querySelector('.ss-num');
      const max = el.querySelector('.ss-max');
      if (num) num.textContent = data.players != null ? data.players : '?';
      if (max && data.max) max.textContent = `/ ${data.max}`;
      if (data.name) {
        const n = el.querySelector('.ss-name');
        if (n) n.textContent = data.name;
      }
    } else if (data.configured === false) {
      // Not configured — keep neutral, hide players
      el.classList.add('online');
      const num = el.querySelector('.ss-num');
      if (num) num.textContent = '∞';
    } else {
      el.classList.add('offline');
    }
  } catch (e) {
    el.classList.remove('loading');
    el.classList.add('offline');
  }
}
loadServerStatus();
setInterval(loadServerStatus, 60000);

// ---------- Flash deal countdowns ----------
function formatCountdown(ms) {
  if (ms <= 0) return 'הסתיים';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}ד ${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function tickCountdowns() {
  const now = Date.now();
  document.querySelectorAll('[data-ends]').forEach(el => {
    const endsRaw = el.getAttribute('data-ends');
    if (!endsRaw) return;
    // Parse SQLite-style "YYYY-MM-DD HH:MM:SS" as local
    const safe = endsRaw.includes('T') ? endsRaw : endsRaw.replace(' ', 'T');
    const ends = new Date(safe).getTime();
    if (isNaN(ends)) return;
    const remaining = ends - now;
    const target = el.querySelector('.cd-text');
    if (target) target.textContent = '⏱ ' + formatCountdown(remaining);
    else if (el.classList.contains('flash-badge')) {
      // tooltip on the badge itself
      el.title = 'נגמר בעוד ' + formatCountdown(remaining);
    }
    if (remaining <= 0) {
      el.classList.add('expired');
    }
  });
}
tickCountdowns();
setInterval(tickCountdowns, 1000);
