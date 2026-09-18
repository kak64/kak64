import { beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { hashObject, storage } from "./storage";

describe("storage provider", () => {
  const key = `test/storage/${Date.now()}.bin`;
  const body = randomBytes(300_000);
  beforeEach(async () => { await storage().putObject(key, body, "application/octet-stream"); });

  it("reports size and mime", async () => {
    const head = await storage().headObject(key);
    expect(head?.size).toBe(body.length);
    expect(head?.mime).toBe("application/octet-stream");
    expect(await storage().headObject("test/does-not-exist")).toBeNull();
  });

  it("reads a byte range without fetching the whole object", async () => {
    const range = await storage().getRange(key, 0, 15);
    expect(range?.length).toBe(16);
    expect(range!.equals(body.subarray(0, 16))).toBe(true);
    const tail = await storage().getRange(key, body.length - 4, body.length - 1);
    expect(tail!.equals(body.subarray(-4))).toBe(true);
  });

  it("hashes by streaming and matches a direct digest", async () => {
    const result = await hashObject(key);
    expect(result?.size).toBe(body.length);
    expect(result?.sha256).toBe(createHash("sha256").update(body).digest("hex"));
    expect(await hashObject("test/missing")).toBeNull();
  });

  it("signs short-lived download URLs and refuses tampered ones", async () => {
    const url = await storage().signedGetUrl(key, { ttl: 60 });
    expect(url).toMatch(/^https?:\/\//);
    expect(url).not.toContain(process.env.S3_SECRET_ACCESS_KEY ?? "no-secret-here");
  });

  it("deletes objects", async () => {
    await storage().deleteObject(key);
    expect(await storage().headObject(key)).toBeNull();
  });
});
