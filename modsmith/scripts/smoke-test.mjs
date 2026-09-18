#!/usr/bin/env node
/**
 * End-to-end acceptance test for a running Modsmith installation.
 *
 *   node scripts/smoke-test.mjs [--url https://your.domain] [--keep]
 *
 * Drives the real HTTP API exactly as a browser would: registers an account, verifies it,
 * uploads a model, runs an export through the worker, downloads the ZIP and inspects it, checks
 * the free re-export window, then exercises the Server Hub ingest and search path.
 *
 * It needs database access only to mint the email-verification token, which is the one step a
 * human normally does by clicking a link in an email.
 */
import { createHmac, createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── environment ──────────────────────────────────────────────────────────────
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const BASE = (flag("url", process.env.APP_URL) ?? "http://localhost:3000").replace(/\/+$/, "");
const KEEP = args.includes("--keep");

// ── tiny test harness ────────────────────────────────────────────────────────
const results = [];
let failed = 0;
const c = { ok: "\x1b[32m", bad: "\x1b[31m", dim: "\x1b[2m", off: "\x1b[0m" };
async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`${c.ok}  PASS${c.off}  ${name}${detail ? ` ${c.dim}${detail}${c.off}` : ""} ${c.dim}${Date.now() - started}ms${c.off}`);
  } catch (err) {
    failed++;
    results.push({ name, ok: false, detail: err.message });
    console.log(`${c.bad}  FAIL${c.off}  ${name}\n        ${err.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (actual, expected, what) => assert(actual === expected, `${what}: expected ${expected}, got ${actual}`);

// ── cookie-aware fetch ───────────────────────────────────────────────────────
const jar = new Map();
function cookieHeader() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); }
function storeCookies(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value === "") jar.delete(name); else jar.set(name, value);
  }
}
async function call(method, path, body, extraHeaders = {}) {
  const headers = { accept: "application/json", origin: BASE, cookie: cookieHeader(), ...extraHeaders };
  if (jar.has("ms_csrf")) headers["x-csrf-token"] = jar.get("ms_csrf");
  let payload = body;
  if (body !== undefined && !(body instanceof Uint8Array)) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, redirect: "manual" });
  storeCookies(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}
async function api(method, path, body) {
  const res = await call(method, path, body);
  if (!res.json?.success) throw new Error(`${method} ${path} -> ${res.status} ${res.json?.error?.code ?? ""} ${res.json?.error?.message ?? res.text.slice(0, 160)}`);
  return res.json.data;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const stamp = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const user = { username: `smoke${stamp}`, email: `smoke${stamp}@modsmith.test`, password: "SmokeTest123!" };

async function prisma() {
  const mod = await import(join(root, "packages/db/generated/client/index.js"));
  return new mod.PrismaClient();
}

/**
 * Reads a ZIP via its central directory rather than the local headers, because streaming writers
 * set the data-descriptor flag and leave the local sizes as zero.
 */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record: the download is not a ZIP");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    if (!name.endsWith("/")) files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ── the test ─────────────────────────────────────────────────────────────────
console.log(`\nModsmith acceptance test against ${c.dim}${BASE}${c.off}\n`);
let db, uploadId, jobId, creationId, projectId, hubToken, cubePath = join(os.tmpdir(), "modsmith-smoke-cube.glb");

await step("the site is reachable and reports healthy dependencies", async () => {
  const res = await call("GET", "/api/health");
  assert(res.status === 200, `health returned ${res.status}; is the web service running and APP_URL correct?`);
  const down = Object.entries(res.json.checks).filter(([, v]) => v === "down").map(([k]) => k);
  assert(!down.includes("database"), "the database is unreachable");
  assert(!down.includes("redis"), "redis is unreachable");
  return down.includes("workers") ? "database ok, redis ok, NO WORKER RUNNING" : "database, redis and worker all up";
});

await step("the public homepage renders", async () => {
  const res = await call("GET", "/");
  eq(res.status, 200, "homepage status");
  assert(/Modsmith/.test(res.text), "homepage did not contain the product name");
  return `${(res.text.length / 1024).toFixed(0)} KB`;
});

await step("a new account can register and receives the signup bonus", async () => {
  await call("GET", "/register");
  const data = await api("POST", "/api/v1/auth/register", { email: user.email, username: user.username, password: user.password, acceptTerms: true });
  eq(data.username, user.username, "registered username");
  const credits = await api("GET", "/api/v1/credits");
  eq(credits.balance, 150, "signup bonus");
  return `${user.username}, 150 credits`;
});

await step("email verification grants the verification bonus", async () => {
  db = await prisma();
  const secret = process.env.APP_SECRET;
  assert(secret, "APP_SECRET is not set, so the verification token cannot be minted");
  const row = await db.user.findFirstOrThrow({ where: { emailNormalized: user.email.toLowerCase() } });
  const raw = `smoke-${randomBytes(24).toString("base64url")}`;
  await db.emailVerificationToken.updateMany({ where: { userId: row.id, usedAt: null }, data: { usedAt: new Date() } });
  await db.emailVerificationToken.create({ data: { userId: row.id, email: row.email, tokenHash: createHmac("sha256", secret).update(raw).digest("hex"), expiresAt: new Date(Date.now() + 3600e3) } });
  await api("POST", "/api/v1/auth/verify", { token: raw });
  const credits = await api("GET", "/api/v1/credits");
  eq(credits.balance, 200, "balance after verification");
  return "200 credits";
});

await step("a model uploads, and its real content type is verified server-side", async () => {
  execFileSync(process.execPath, [join(root, "scripts/make-test-cube.mjs"), cubePath], { stdio: "pipe" });
  const bytes = readFileSync(cubePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const init = await api("POST", "/api/v1/uploads", { toolSlug: "prop-creator", fileName: "smoke-cube.glb", sizeBytes: bytes.length, mime: "model/gltf-binary" });
  const put = await fetch(init.putUrl, { method: "PUT", headers: { "content-type": "model/gltf-binary" }, body: bytes });
  assert(put.ok, `upload PUT failed with ${put.status}; check your reverse proxy body size limit`);
  const done = await api("POST", `/api/v1/uploads/${init.uploadId}/complete`, { sha256 });
  eq(done.status, "UPLOADED", "upload status");
  eq(done.detectedMime, "model/gltf-binary", "detected content type");
  uploadId = init.uploadId;
  return `${bytes.length} bytes, sha256 verified`;
});

await step("a file pretending to be a model is rejected", async () => {
  const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const init = await api("POST", "/api/v1/uploads", { toolSlug: "prop-creator", fileName: "not-really.glb", sizeBytes: fake.length, mime: "model/gltf-binary" });
  await fetch(init.putUrl, { method: "PUT", headers: { "content-type": "model/gltf-binary" }, body: fake });
  const res = await call("POST", `/api/v1/uploads/${init.uploadId}/complete`, {});
  eq(res.status, 400, "completion status for spoofed content");
  eq(res.json.error.code, "INVALID_FILE", "error code");
  return "PNG bytes named .glb were refused";
});

await step("the export is priced correctly and credits are held", async () => {
  const est = await api("POST", "/api/v1/tools/prop-creator/estimate", { uploadIds: [uploadId], config: { propName: "smoke_prop" } });
  eq(est.credits, 40, "quoted price");
  eq(est.freeReexport, false, "first export should not be free");
  const job = await api("POST", "/api/v1/jobs", { toolSlug: "prop-creator", uploadIds: [uploadId], config: { propName: "smoke_prop", collision: "box" }, name: "Smoke test prop" });
  eq(job.chargedCredits, 40, "credits held");
  jobId = job.id; creationId = job.creationId;
  const credits = await api("GET", "/api/v1/credits");
  eq(credits.balance, 160, "balance after the hold");
  return "40 held, 160 remaining";
});

await step("the worker builds the resource", async () => {
  const deadline = Date.now() + 5 * 60_000;
  let job;
  for (;;) {
    job = await api("GET", `/api/v1/jobs/${jobId}`);
    if (["COMPLETED", "FAILED", "CANCELLED", "REFUNDED"].includes(job.status)) break;
    assert(Date.now() < deadline, `job stuck in ${job.status} after 5 minutes; is the worker running?`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  assert(job.status === "COMPLETED", `job ended as ${job.status}: ${job.errorCode ?? ""} ${job.errorMessage ?? ""}`);
  return `${job.resultName}, encoder=${job.resultManifest?.encoder ?? "?"}`;
});

await step("the downloaded ZIP contains a real FiveM resource", async () => {
  const dl = await api("GET", `/api/v1/creations/${creationId}/download`);
  const res = await fetch(dl.url);
  assert(res.ok, `download returned ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  eq(zip.subarray(0, 2).toString("ascii"), "PK", "ZIP magic bytes");
  const files = unzip(zip);
  const names = [...files.keys()];
  assert(names.some((n) => n.endsWith("fxmanifest.lua")), `no fxmanifest.lua in ${names.join(", ")}`);
  const ytd = names.find((n) => n.endsWith(".ytd"));
  assert(ytd, `no .ytd texture dictionary in ${names.join(", ")}`);
  eq(files.get(ytd).subarray(0, 4).toString("ascii"), "RSC7", "the .ytd should be a real RAGE resource");
  if (!KEEP) writeFileSync(join(os.tmpdir(), "modsmith-smoke-resource.zip"), zip);
  return `${names.length} files, ${(zip.length / 1024).toFixed(1)} KB, saved to ${join(os.tmpdir(), "modsmith-smoke-resource.zip")}`;
});

await step("re-exporting the same file with the same settings is free", async () => {
  const bytes = readFileSync(cubePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const init = await api("POST", "/api/v1/uploads", { toolSlug: "prop-creator", fileName: "renamed-cube.glb", sizeBytes: bytes.length, mime: "model/gltf-binary" });
  await fetch(init.putUrl, { method: "PUT", headers: { "content-type": "model/gltf-binary" }, body: bytes });
  await api("POST", `/api/v1/uploads/${init.uploadId}/complete`, { sha256 });
  const est = await api("POST", "/api/v1/tools/prop-creator/estimate", { uploadIds: [init.uploadId], config: { propName: "smoke_prop", collision: "box" } });
  eq(est.freeReexport, true, "free re-export flag (renaming the file must not defeat it)");
  eq(est.credits, 0, "re-export price");
  return `free until ${new Date(est.reexportUntil).toDateString()}`;
});

await step("a Server Hub token ingests logs and they are searchable", async () => {
  const project = await api("POST", "/api/v1/server-hub/projects", { name: `Smoke ${stamp}`, framework: "standalone" });
  projectId = project.id;
  const token = await api("POST", `/api/v1/server-hub/projects/${project.id}/tokens`, { name: "smoke" });
  hubToken = token.token;
  assert(hubToken.startsWith("msh_"), "unexpected token format");
  const ingest = await fetch(`${BASE}/hub-ingest/v1/logs`, {
    method: "POST",
    headers: { authorization: `Bearer ${hubToken}`, "content-type": "application/json" },
    body: JSON.stringify([
      { level: "info", message: "Item moved", resource: "inventory", dataset: "inventory", metadata: { item: "lockpick", count: 2 }, player: { source: 7, name: "SmokeTester" } },
      { level: "error", message: "Smoke failure", resource: "core", metadata: { ip: "10.0.0.1", code: "ETIMEDOUT" } },
    ]),
  });
  eq(ingest.status, 202, "ingest status");
  const found = await api("GET", `/api/v1/server-hub/logs?projectId=${project.id}&q=lockpick`);
  eq(found.logs.length, 1, "search hits for 'lockpick'");
  const errors = await api("GET", `/api/v1/server-hub/logs?projectId=${project.id}&level=error`);
  eq(errors.logs.length, 1, "error-level hits");
  assert(errors.logs[0].metadata.ip === undefined, "player IP addresses must never be stored");
  return "2 events ingested, searchable, IP stripped";
});

await step("the FiveM bridge resource downloads", async () => {
  const res = await call("GET", "/api/v1/server-hub/resource");
  eq(res.status, 200, "resource download status");
  return `${(res.text.length / 1024).toFixed(1)} KB zip`;
});

await step("an anonymous visitor cannot reach the workshop or the admin API", async () => {
  const saved = new Map(jar);
  jar.clear();
  const app = await call("GET", "/app/creations");
  assert([302, 307, 308].includes(app.status) || /\/login/.test(app.headers.get("location") ?? ""), `expected a redirect to login, got ${app.status}`);
  const admin = await call("GET", "/api/v1/admin/overview");
  assert(admin.status === 401 || admin.status === 403, `admin API returned ${admin.status} to an anonymous caller`);
  jar.clear();
  for (const [k, v] of saved) jar.set(k, v);
  return "workshop redirects to login, admin API refuses";
});

// ── cleanup and summary ──────────────────────────────────────────────────────
if (!KEEP && db) {
  try {
    const row = await db.user.findFirst({ where: { emailNormalized: user.email.toLowerCase() } });
    if (row) {
      await db.serverHubLog.deleteMany({ where: { project: { userId: row.id } } });
      await db.user.delete({ where: { id: row.id } });
    }
    unlinkSync(cubePath);
  } catch { /* leave it; not worth failing the run */ }
}
await db?.$disconnect();

const passed = results.length - failed;
console.log(`\n${failed === 0 ? c.ok : c.bad}${passed}/${results.length} checks passed${c.off}`);
if (failed) {
  console.log(`\n${c.bad}Failures:${c.off}`);
  for (const r of results.filter((r) => !r.ok)) console.log(`  - ${r.name}\n      ${r.detail}`);
  console.log(`\nSee modsmith/docs/SELF_HOSTING.md, section "If something does not work".`);
}
if (KEEP) console.log(`${c.dim}--keep: the test account ${user.username} was left in place.${c.off}`);
process.exit(failed ? 1 : 0);
