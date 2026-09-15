import dns from "node:dns/promises";
import net from "node:net";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { workerEnv } from "./env";
import { ProcessingError } from "./errors";

export const MAX_REDIRECTS = 3;
export const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;

/** RFC1918 / loopback / link-local / CGNAT / multicast / reserved ranges. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number) as [number, number, number, number];
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("ff")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateIp(mapped[1]!);
    return false;
  }
  return true;
}

export function hostAllowed(host: string, allowlist: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return allowlist.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

/** Validate a single URL hop: https only, allowlisted host, public IP. */
export async function assertSafeUrl(rawUrl: string, allowlist = workerEnv().importAllowlist): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProcessingError("INVALID_URL", `"${rawUrl}" is not a valid URL`);
  }
  if (url.protocol !== "https:") throw new ProcessingError("INVALID_URL", "Only https:// URLs can be imported");
  if (url.username || url.password) throw new ProcessingError("INVALID_URL", "URLs with credentials are not allowed");
  if (!hostAllowed(url.hostname, allowlist)) {
    throw new ProcessingError("HOST_NOT_ALLOWED", `${url.hostname} is not an allowed import source. Allowed: ${allowlist.join(", ")}`);
  }
  const literal = net.isIP(url.hostname) ? [url.hostname] : [];
  const addresses = literal.length ? literal : (await dns.lookup(url.hostname, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new ProcessingError("HOST_UNRESOLVABLE", `Could not resolve ${url.hostname}`);
  for (const ip of addresses) {
    if (isPrivateIp(ip)) throw new ProcessingError("HOST_NOT_ALLOWED", `${url.hostname} resolves to a private address and cannot be fetched`);
  }
  return url;
}

export interface SafeFetchResult {
  buffer: Buffer;
  contentType: string | null;
  finalUrl: string;
  status: number;
}

async function followed(url: string, init: RequestInit, maxBytes: number): Promise<{ res: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = await assertSafeUrl(current);
    const res = await fetch(safe.toString(), { ...init, redirect: "manual", headers: { "user-agent": "Modsmith/1.0 (+https://modsmith.app)", accept: "*/*", ...(init.headers as Record<string, string> | undefined) } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new ProcessingError("FETCH_FAILED", `Redirect without a location header from ${safe.hostname}`);
      current = new URL(loc, safe).toString();
      await res.body?.cancel().catch(() => {});
      continue;
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared && declared > maxBytes) {
      await res.body?.cancel().catch(() => {});
      throw new ProcessingError("FILE_TOO_LARGE", `The remote file is ${Math.round(declared / 1024 / 1024)} MB, over the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
    }
    return { res, finalUrl: safe.toString() };
  }
  throw new ProcessingError("TOO_MANY_REDIRECTS", "The source redirected too many times");
}

/** SSRF-safe fetch into memory. Every redirect hop is re-validated. */
export async function safeFetch(url: string, opts: { maxBytes?: number; headers?: Record<string, string>; method?: string; body?: string } = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const { res, finalUrl } = await followed(url, { method: opts.method ?? "GET", headers: opts.headers, body: opts.body }, maxBytes);
  if (!res.ok) throw new ProcessingError("FETCH_FAILED", `The source returned HTTP ${res.status}`, { retryable: res.status >= 500 });
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ProcessingError("FILE_TOO_LARGE", `The remote file exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
      }
      chunks.push(Buffer.from(value));
    }
  }
  return { buffer: Buffer.concat(chunks), contentType: res.headers.get("content-type"), finalUrl, status: res.status };
}

/** SSRF-safe download straight to disk (for large mod archives). */
export async function safeDownload(url: string, destFile: string, opts: { maxBytes?: number; headers?: Record<string, string> } = {}): Promise<{ bytes: number; contentType: string | null; finalUrl: string }> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const { res, finalUrl } = await followed(url, { method: "GET", headers: opts.headers }, maxBytes);
  if (!res.ok || !res.body) throw new ProcessingError("FETCH_FAILED", `The source returned HTTP ${res.status}`, { retryable: res.status >= 500 });
  await mkdir(path.dirname(destFile), { recursive: true });
  let bytes = 0;
  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > maxBytes) source.destroy(new ProcessingError("FILE_TOO_LARGE", `The remote file exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`));
  });
  await pipeline(source, createWriteStream(destFile));
  return { bytes, contentType: res.headers.get("content-type"), finalUrl };
}

/** Extract candidate download links from an HTML page, restricted to the same host. */
export function findDownloadLinks(html: string, pageUrl: string, pattern = /\/download\//i): string[] {
  const base = new URL(pageUrl);
  const out = new Set<string>();
  const re = /(?:href|data-href|content)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]!;
    if (raw.startsWith("#") || raw.startsWith("javascript:") || raw.startsWith("mailto:")) continue;
    let abs: URL;
    try {
      abs = new URL(raw, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "https:") continue;
    if (abs.hostname !== base.hostname && !abs.hostname.endsWith(base.hostname.replace(/^www\./, ""))) continue;
    if (!pattern.test(abs.pathname)) continue;
    out.add(abs.toString());
  }
  return [...out];
}
