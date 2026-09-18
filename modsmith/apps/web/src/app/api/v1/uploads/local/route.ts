import { NextResponse, type NextRequest } from "next/server";
import { LocalProvider, env, storage } from "@modsmith/services";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Local storage provider endpoint (dev/test only). Serves HMAC-signed GET/PUT/part URLs. */
function provider() {
  if (env().STORAGE_PROVIDER !== "local") return null;
  return storage() as LocalProvider;
}

export async function GET(req: NextRequest) {
  const p = provider();
  if (!p) return new NextResponse("Not found", { status: 404 });
  const q = req.nextUrl.searchParams;
  const key = q.get("key") ?? "";
  const exp = Number(q.get("exp"));
  const sig = q.get("sig") ?? "";
  if (!p.verify(key, exp, sig, "get")) return new NextResponse("Forbidden", { status: 403 });
  const buf = await p.getObject(key);
  if (!buf) return new NextResponse("Not found", { status: 404 });
  const head = await p.headObject(key);
  const headers: Record<string, string> = { "Content-Type": head?.mime ?? "application/octet-stream", "Content-Length": String(buf.length), "Cache-Control": "private, max-age=60" };
  const dl = q.get("dl");
  if (dl) headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(dl)}"`;
  return new NextResponse(new Uint8Array(buf), { headers });
}

export async function PUT(req: NextRequest) {
  const p = provider();
  if (!p) return new NextResponse("Not found", { status: 404 });
  const q = req.nextUrl.searchParams;
  const key = q.get("key") ?? "";
  const exp = Number(q.get("exp"));
  const sig = q.get("sig") ?? "";
  const uploadId = q.get("uploadId");
  const partNumber = q.get("partNumber");
  const body = Buffer.from(await req.arrayBuffer());
  if (uploadId && partNumber) {
    if (!p.verify(key, exp, sig, `part:${uploadId}:${partNumber}`)) return new NextResponse("Forbidden", { status: 403 });
    const dir = path.join(p.root, `${key}.parts-${uploadId}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, partNumber), body);
    return new NextResponse(null, { status: 200, headers: { ETag: `"part-${partNumber}"` } });
  }
  if (!p.verify(key, exp, sig, "put")) return new NextResponse("Forbidden", { status: 403 });
  await p.putObject(key, body, req.headers.get("content-type") ?? "application/octet-stream");
  return new NextResponse(null, { status: 200, headers: { ETag: '"local"' } });
}
