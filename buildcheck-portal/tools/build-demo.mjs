// Bundle the portal into self-contained single-file demos:
//   dist/demo-artifact.html — content-only (for the Artifact wrapper)
//   dist/demo-local.html    — full HTML document (for local/e2e use)
// Core modules + app.js are concatenated with import/export statements
// stripped; the stylesheet is inlined. No external requests remain.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CORE_ORDER = ['util.js', 'directory.js', 'logo.js', 'auth.js', 'tasks.js', 'store.js'];

function strip(src) {
  return src
    .replace(/^import[^;]+;[ \t]*\r?\n/gm, '')
    .replace(/^export\s+/gm, '');
}

let core = '';
for (const name of CORE_ORDER) {
  core += `// ===== core/${name} =====\n${strip(await readFile(path.join(ROOT, 'src', 'core', name), 'utf8'))}\n`;
}
const appSrc = strip(await readFile(path.join(ROOT, 'public', 'app.js'), 'utf8'));
const css = await readFile(path.join(ROOT, 'public', 'style.css'), 'utf8');

const bundle = `${core}\n// ===== app.js =====\n${appSrc}`;
const leftovers = bundle.split('\n').filter((l) => /^\s*(import|export)\b/.test(l));
if (leftovers.length) throw new Error('leftover import/export lines:\n' + leftovers.join('\n'));

const head = `<title>BuildCheck Portal — ניהול עבודות שטח</title>\n<style>\n${css}\n</style>`;
const body = `<div id="app"></div>\n<script type="module">\ndocument.documentElement.lang = 'he';\ndocument.documentElement.dir = 'rtl';\n${bundle}\n</script>`;

await mkdir(path.join(ROOT, 'dist'), { recursive: true });
await writeFile(path.join(ROOT, 'dist', 'demo-artifact.html'), `${head}\n${body}`);
await writeFile(path.join(ROOT, 'dist', 'demo-local.html'),
  `<!DOCTYPE html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>`);

console.log('built dist/demo-artifact.html + dist/demo-local.html');
