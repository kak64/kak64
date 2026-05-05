const db = require('./db');

// Cached FiveM server status. Endpoint should be the public IP:PORT (e.g. "1.2.3.4:30120")
// or a full URL. We hit /info.json and /players.json.
let cache = { at: 0, data: null };
const TTL_MS = 30 * 1000;

async function getStatus() {
  if (Date.now() - cache.at < TTL_MS && cache.data) return cache.data;
  const ep = db.getSetting('fivem_endpoint');
  const fallbackName = db.getSetting('fivem_server_name') || 'Infinity IL Roleplay';
  if (!ep) {
    cache = { at: Date.now(), data: { online: null, players: null, max: null, name: fallbackName, configured: false } };
    return cache.data;
  }
  const base = ep.startsWith('http') ? ep.replace(/\/$/, '') : `http://${ep}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const [info, players] = await Promise.all([
      fetch(`${base}/info.json`, { signal: ctrl.signal }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${base}/players.json`, { signal: ctrl.signal }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    clearTimeout(t);
    const data = {
      online: !!info || !!players,
      players: Array.isArray(players) ? players.length : null,
      max: info && info.vars && info.vars.sv_maxClients ? Number(info.vars.sv_maxClients) : null,
      name: (info && info.vars && info.vars.sv_projectName) || fallbackName,
      hostname: info && info.vars && info.vars.sv_hostname,
      configured: true
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    cache = { at: Date.now(), data: { online: false, players: null, max: null, name: fallbackName, configured: true, error: String(e.message || e) } };
    return cache.data;
  }
}

module.exports = { getStatus };
