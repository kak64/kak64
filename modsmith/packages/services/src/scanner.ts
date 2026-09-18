import { createConnection } from "node:net";
import { Readable } from "node:stream";
import { env } from "./env";
import { logger } from "./logger";
import { storage } from "./storage";

export type ScanVerdict = { clean: true; scanner: string } | { clean: false; scanner: string; signature: string } | { clean: null; scanner: string; reason: string };

/**
 * Malware scanning behind a provider switch (`MALWARE_SCANNER`). ClamAV is spoken directly over its
 * INSTREAM protocol so no extra dependency is needed. `clean: null` means "not scanned" — callers
 * decide whether that is acceptable (it is in development, it should not be in production).
 */
export async function scanBuffer(buf: Buffer): Promise<ScanVerdict> {
  const e = env();
  if (e.MALWARE_SCANNER !== "clamav") return { clean: null, scanner: "none", reason: "scanning disabled" };
  return clamScan(Readable.from(buf));
}

export async function scanObject(key: string): Promise<ScanVerdict> {
  const e = env();
  if (e.MALWARE_SCANNER !== "clamav") return { clean: null, scanner: "none", reason: "scanning disabled" };
  const stream = await storage().getStream(key);
  if (!stream) return { clean: null, scanner: "clamav", reason: "object not found" };
  return clamScan(stream);
}

/** ClamAV INSTREAM: `zINSTREAM\0` then length-prefixed chunks, terminated by a zero-length chunk. */
function clamScan(source: NodeJS.ReadableStream): Promise<ScanVerdict> {
  const e = env();
  return new Promise((resolve) => {
    const socket = createConnection({ host: e.CLAMAV_HOST, port: e.CLAMAV_PORT });
    let reply = "";
    let settled = false;
    const finish = (verdict: ScanVerdict) => { if (!settled) { settled = true; socket.destroy(); resolve(verdict); } };
    socket.setTimeout(120_000, () => finish({ clean: null, scanner: "clamav", reason: "timeout" }));
    socket.on("error", (err) => { logger.warn({ err }, "clamav connection failed"); finish({ clean: null, scanner: "clamav", reason: err.message }); });
    socket.on("data", (d) => { reply += d.toString("utf8"); });
    socket.on("end", () => {
      const text = reply.trim();
      if (/\bOK$/.test(text)) return finish({ clean: true, scanner: "clamav" });
      const found = /:\s*(.+)\s+FOUND$/.exec(text);
      if (found) return finish({ clean: false, scanner: "clamav", signature: found[1]! });
      finish({ clean: null, scanner: "clamav", reason: text || "empty reply" });
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      source.on("data", (chunk: Buffer | string) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        const len = Buffer.alloc(4);
        len.writeUInt32BE(buf.length, 0);
        socket.write(len);
        socket.write(buf);
      });
      source.on("end", () => socket.write(Buffer.alloc(4))); // zero-length chunk ends the stream
      source.on("error", (err) => finish({ clean: null, scanner: "clamav", reason: String(err) }));
    });
  });
}

export function scannerConfigured() {
  return env().MALWARE_SCANNER === "clamav";
}
