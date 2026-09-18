#!/usr/bin/env node
/**
 * Prepares Modsmith to run on a development machine (Windows, macOS or Linux).
 *
 *   node scripts/setup-local.mjs
 *
 * Checks prerequisites, writes a .env with freshly generated secrets, starts PostgreSQL and Redis
 * with Docker, installs packages, applies migrations and seeds reference data. Safe to re-run: an
 * existing .env keeps its secrets and your data is untouched.
 *
 * Already have PostgreSQL and Redis running? Skip Docker with:
 *   node scripts/setup-local.mjs --no-docker --database-url ... --redis-url ...
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(`--${n}`);

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", o: "\x1b[0m" };
const step = (m) => console.log(`\n${C.g}==>${C.o} ${m}`);
const info = (m) => console.log(`    ${C.d}${m}${C.o}`);
const die = (m, hint) => { console.error(`\n${C.r}error:${C.o} ${m}${hint ? `\n       ${hint}` : ""}`); process.exit(1); };

/** Reads .env so child processes (Prisma especially) see DATABASE_URL and friends. */
function envFile() {
  const p = join(root, ".env");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { cwd: root, stdio: opts.quiet ? "pipe" : "inherit", shell: process.platform === "win32", encoding: "utf8", env: { ...process.env, ...envFile() }, ...opts });
  if (res.error) return { ok: false, out: String(res.error.message) };
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}`, status: res.status };
}
const version = (cmd, cmdArgs = ["--version"]) => { const r = run(cmd, cmdArgs, { quiet: true }); return r.ok ? r.out.trim().split("\n")[0] : null; };

// ── prerequisites ────────────────────────────────────────────────────────────
step("Checking the toolchain");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22) die(`Node ${process.versions.node} is too old; Modsmith needs Node 22 or newer.`, "Install it from https://nodejs.org");
info(`node ${process.version}`);

let pnpm = version("pnpm", ["-v"]);
if (!pnpm) {
  info("pnpm not found, enabling it through corepack");
  run("corepack", ["enable"], { quiet: true });
  run("corepack", ["prepare", "pnpm@10.33.0", "--activate"], { quiet: true });
  pnpm = version("pnpm", ["-v"]);
}
if (!pnpm) die("pnpm is not available.", "Run: npm install -g pnpm@10.33.0");
info(`pnpm ${pnpm}`);

const useDocker = !has("no-docker");
if (useDocker) {
  const docker = version("docker", ["--version"]);
  if (!docker) die("Docker is not installed or not on PATH.", "Install Docker Desktop from https://docker.com, or re-run with --no-docker if you already have PostgreSQL and Redis.");
  if (!run("docker", ["info"], { quiet: true }).ok) die("Docker is installed but not running.", "Start Docker Desktop and try again.");
  info(docker);
}

// ── configuration ────────────────────────────────────────────────────────────
step("Writing configuration");
const envPath = join(root, ".env");
const dbUrl = flag("database-url", "postgresql://modsmith:modsmith@localhost:5432/modsmith?schema=public");
const redisUrl = flag("redis-url", "redis://localhost:6379");
const port = flag("port", "3000");
const storageDir = join(root, ".storage");
mkdirSync(storageDir, { recursive: true });

const envExisted = existsSync(envPath);
const lines = envExisted ? readFileSync(envPath, "utf8").split(/\r?\n/) : readFileSync(join(root, ".env.example"), "utf8").split(/\r?\n/);
const get = (k) => { const l = lines.find((x) => x.startsWith(`${k}=`)); return l ? l.slice(k.length + 1).trim() : ""; };
const set = (k, v) => { const i = lines.findIndex((x) => x.startsWith(`${k}=`)); if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`); };
const placeholder = (v) => !v || v.includes("change-me") || v === "ChangeMe123!";

if (placeholder(get("APP_SECRET"))) set("APP_SECRET", randomBytes(48).toString("base64"));
if (placeholder(get("ENCRYPTION_KEY"))) set("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
// Only mint an admin password on a first run. The seed creates that account once, so rotating the
// value here later would print a password that does not match the one actually stored.
let adminPassword = get("ADMIN_PASSWORD");
if (!envExisted || placeholder(adminPassword)) { adminPassword = `${randomBytes(9).toString("base64url")}Aa1!`; set("ADMIN_PASSWORD", adminPassword); }
set("APP_URL", `http://localhost:${port}`);
set("PORT", port);
set("DATABASE_URL", dbUrl);
set("TEST_DATABASE_URL", dbUrl.replace(/\/modsmith\?/, "/modsmith_test?"));
set("REDIS_URL", redisUrl);
set("STORAGE_PROVIDER", "local");
set("LOCAL_STORAGE_DIR", storageDir);
set("EMAIL_PROVIDER", "console");
set("AI_3D_PROVIDER", "mock");
writeFileSync(envPath, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
info(`.env ready, uploads will be stored in ${storageDir}`);

// ── datastores ───────────────────────────────────────────────────────────────
if (useDocker) {
  step("Starting PostgreSQL and Redis");
  if (!run("docker", ["compose", "up", "-d", "postgres", "redis"]).ok) die("Docker could not start the databases.", "Check: docker compose logs postgres");
  process.stdout.write("    waiting for PostgreSQL");
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = run("docker", ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "modsmith"], { quiet: true }).ok;
    if (!ready) { process.stdout.write("."); await new Promise((r) => setTimeout(r, 2000)); }
  }
  console.log(ready ? " ready" : "");
  if (!ready) die("PostgreSQL did not become ready in two minutes.", "Check: docker compose logs postgres");
} else {
  info("skipping Docker; using the PostgreSQL and Redis you supplied");
}

// ── build ────────────────────────────────────────────────────────────────────
step("Installing packages (a few minutes the first time)");
if (!run("pnpm", ["install"]).ok) die("pnpm install failed.");

step("Creating the database schema");
if (!run("pnpm", ["db:migrate"]).ok) die("Migrations failed.", `Is the database reachable at ${dbUrl}?`);

if (!has("no-seed")) {
  step("Seeding tools, pricing, guides and the admin account");
  if (!run("pnpm", ["db:seed"]).ok) die("Seeding failed.");
}

// ── done ─────────────────────────────────────────────────────────────────────
const adminUser = get("ADMIN_USERNAME") || "admin";
console.log(`
${C.g}Setup complete.${C.o}

Start it with two terminals, both from ${C.d}${root}${C.o}

  ${C.y}Terminal 1${C.o}   pnpm dev:web        ${C.d}# the site on http://localhost:${port}${C.o}
  ${C.y}Terminal 2${C.o}   pnpm dev:worker     ${C.d}# builds exports; without it jobs stay queued${C.o}

Then open  ${C.y}http://localhost:${port}${C.o}

  Admin login     ${adminUser} / ${adminPassword}
  Verify emails   no mail is sent; the link is printed in Terminal 1
  Check it works  node scripts/smoke-test.mjs
${useDocker ? "\nTo stop the databases later:  docker compose down" : ""}
`);
