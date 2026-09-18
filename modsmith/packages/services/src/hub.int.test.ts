import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@modsmith/db";
import { authenticateServerToken, createServerToken, ingestLogs, revokeServerToken, createMediaReservation, completeMediaReservation } from "./hub";
import { createUser, resetDb } from "./test/helpers";
import { redis } from "./redis";

const PNG = (() => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(16, 16); b.writeUInt32BE(8, 20); return b; })();

describe("server hub (integration)", () => {
  beforeEach(async () => { await resetDb(); await redis().flushdb(); });

  it("tokens are scoped to their project and revocable", async () => {
    const owner = await createUser();
    const other = await createUser();
    const a = await prisma.serverHubProject.create({ data: { userId: owner.id, name: "A", slug: "a" } });
    const b = await prisma.serverHubProject.create({ data: { userId: other.id, name: "B", slug: "b" } });
    const { token, record } = await createServerToken(a.id, "default", owner.id);
    expect(record.tokenHash).not.toContain(token);
    const auth = await authenticateServerToken(`Bearer ${token}`);
    expect(auth.projectId).toBe(a.id);
    expect(auth.projectId).not.toBe(b.id);
    await ingestLogs(auth.projectId, auth.userId, [{ level: "info", message: "hello", dataset: "inventory", metadata: { item: "lockpick" } }]);
    expect(await prisma.serverHubLog.count({ where: { projectId: a.id } })).toBe(1);
    expect(await prisma.serverHubLog.count({ where: { projectId: b.id } })).toBe(0);
    await revokeServerToken(record.id, owner.id);
    await expect(authenticateServerToken(`Bearer ${token}`)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(authenticateServerToken("Bearer msh_bogus_token_value")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("deduplicates events by id and strips IP metadata", async () => {
    const owner = await createUser();
    const p = await prisma.serverHubProject.create({ data: { userId: owner.id, name: "A", slug: "a" } });
    const r1 = await ingestLogs(p.id, owner.id, [{ id: "e1", level: "warn", message: "x", metadata: { ip: "1.2.3.4", item: "a" } }]);
    const r2 = await ingestLogs(p.id, owner.id, [{ id: "e1", level: "warn", message: "x" }]);
    expect(r1.accepted).toBe(1);
    expect(r2.accepted).toBe(0);
    const log = await prisma.serverHubLog.findFirstOrThrow({ where: { projectId: p.id } });
    expect((log.metadata as any).ip).toBeUndefined();
    expect(log.metadataText).toBe("item=a");
  });

  it("media reservations are single-use, validated by magic bytes and expire", async () => {
    const owner = await createUser();
    const p = await prisma.serverHubProject.create({ data: { userId: owner.id, name: "A", slug: "a" } });
    const { reservation, uploadToken } = await createMediaReservation(p.id, owner.id, { kind: "PHONE_PHOTO", mime: "image/png" });
    await expect(completeMediaReservation(reservation.id, "wrong", PNG)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(completeMediaReservation(reservation.id, uploadToken, Buffer.from("not an image"))).rejects.toMatchObject({ code: "INVALID_FILE" });
    const { reservation: r2, uploadToken: t2 } = await createMediaReservation(p.id, owner.id, { kind: "PHONE_PHOTO", mime: "image/png" });
    const media = await completeMediaReservation(r2.id, t2, PNG);
    expect(media.width).toBe(16);
    await expect(completeMediaReservation(r2.id, t2, PNG)).rejects.toMatchObject({ code: "CONFLICT" });
    const { reservation: r3, uploadToken: t3 } = await createMediaReservation(p.id, owner.id, { kind: "PHONE_PHOTO", mime: "image/png" });
    await prisma.mediaReservation.update({ where: { id: r3.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(completeMediaReservation(r3.id, t3, PNG)).rejects.toMatchObject({ code: "UPLOAD_EXPIRED" });
  });
});
