// BuildCheck AI — zero-dependency static server for the web chat UI.
// The inspection engine is isomorphic ES modules, served straight to the
// browser from src/core (mapped to /core/*). No build step, no npm deps.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3030;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolvePath(urlPath) {
  const clean = path.posix.normalize(urlPath.split('?')[0]);
  if (clean.includes('..')) return null;
  if (clean === '/' || clean === '/index.html') return path.join(ROOT, 'public', 'index.html');
  if (clean.startsWith('/core/')) return path.join(ROOT, 'src', 'core', clean.slice('/core/'.length));
  if (clean.startsWith('/samples/')) return path.join(ROOT, 'samples', clean.slice('/samples/'.length));
  return path.join(ROOT, 'public', clean.slice(1));
}

const server = http.createServer(async (req, res) => {
  const filePath = resolvePath(req.url ?? '/');
  if (!filePath) {
    res.writeHead(400).end('Bad request');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — לא נמצא');
  }
});

server.listen(PORT, () => {
  console.log(`BuildCheck AI פועל: http://localhost:${PORT}`);
});
