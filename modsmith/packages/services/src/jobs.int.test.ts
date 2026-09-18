import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@modsmith/db";
import { createJob, estimateJob, completeJob, failJob, cancelJob } from "./jobs";
import { getBalance } from "./credits";
import { createUpload, createUser, resetDb } from "./test/helpers";
import { storage } from "./storage";
import { getQueue, QUEUE_NAMES } from "./queue";

vi.mock("./notifications", () => ({ notify: vi.fn(async () => undefined) }));

describe("job lifecycle (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await getQueue(QUEUE_NAMES.processing).obliterate({ force: true }).catch(() => {});
  });

  it("holds credits on enqueue and charges on success; source upload deleted, version kept", async () => {
    const u = await createUser({ credits: 100 });
    const up = await createUpload(u.id);
    await storage().putObject(up.storageKey, Buffer.from("glTF"), "model/gltf-binary");
    const job = await createJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up.id], config: { propName: "test_prop" } });
    expect(job.status).toBe("QUEUED");
    expect(job.chargedCredits).toBe(40);
    expect(await getBalance(u.id)).toBe(60);
    const key = `results/${u.id}/${job.id}/test_prop.zip`;
    await storage().putObject(key, Buffer.from("PK"), "application/zip");
    await completeJob(job.id, { resultKey: key, resultName: "test_prop.zip", resultSize: 2, sha256: "abc", manifest: { files: [] } });
    const c = await prisma.creation.findUniqueOrThrow({ where: { id: job.creationId! }, include: { currentVersion: true } });
    expect(c.status).toBe("READY");
    expect(c.currentVersion?.resourceKey).toBe(key);
    expect(c.reexportUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await storage().headObject(up.storageKey)).toBeNull(); // source deleted
    expect(await storage().headObject(key)).not.toBeNull(); // result kept
    expect(await getBalance(u.id)).toBe(60);
  });

  it("refunds held credits when the job fails", async () => {
    const u = await createUser({ credits: 100 });
    const up = await createUpload(u.id);
    const job = await createJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up.id], config: {} });
    expect(await getBalance(u.id)).toBe(60);
    const failed = await failJob(job.id, { code: "WORKER_CRASH", message: "boom", infrastructure: true });
    expect(failed.status).toBe("REFUNDED");
    expect(await getBalance(u.id)).toBe(100);
    // second failure call is a no-op (idempotent refund)
    await failJob(job.id, { code: "WORKER_CRASH", message: "boom", infrastructure: true });
    expect(await getBalance(u.id)).toBe(100);
  });

  it("rejects jobs the user cannot afford before holding anything", async () => {
    const u = await createUser({ credits: 10 });
    const up = await createUpload(u.id);
    await expect(createJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up.id], config: {} })).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(await prisma.processingJob.count()).toBe(0);
    expect(await getBalance(u.id)).toBe(10);
  });

  it("makes the same file + same config free within the re-export window, regardless of filename", async () => {
    const u = await createUser({ credits: 100 });
    const up1 = await createUpload(u.id, "prop-creator", "chair.glb");
    const job1 = await createJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up1.id], config: { propName: "chair", collision: "box" } });
    await completeJob(job1.id, { resultKey: "r/1.zip", resultName: "1.zip", resultSize: 1, sha256: "x", manifest: {} });
    // re-upload with a different filename but the same content hash
    const up2 = await prisma.assetUpload.create({ data: { userId: u.id, toolSlug: "prop-creator", originalName: "renamed_chair_v2.glb", storageKey: `uploads/${u.id}/z/renamed.glb`, sizeBytes: BigInt(1000), status: "UPLOADED", sha256: up1.sha256, expiresAt: new Date(Date.now() + 3600_000) } });
    const est = await estimateJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up2.id], config: { propName: "chair", collision: "box", scale: [1.0000001, 1, 1] } });
    expect(est.freeReexport).toBe(true);
    expect(est.credits).toBe(0);
    // different config → paid
    const est2 = await estimateJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up2.id], config: { propName: "chair", collision: "mesh" } });
    expect(est2.freeReexport).toBe(false);
    expect(est2.credits).toBe(40);
  });

  it("cancelling a queued job returns credits", async () => {
    const u = await createUser({ credits: 100 });
    const up = await createUpload(u.id);
    const job = await createJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up.id], config: {} });
    const c = await cancelJob(job.id, u.id);
    expect(c.status).toBe("REFUNDED");
    expect(await getBalance(u.id)).toBe(100);
    await expect(cancelJob(job.id, "someone-else")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gates tools that require email verification", async () => {
    const u = await createUser({ credits: 500, verified: false });
    const up = await createUpload(u.id, "ai-prop-creator", "photo.png");
    await expect(createJob({ userId: u.id, emailVerified: false, toolSlug: "ai-prop-creator", uploadIds: [up.id], config: {} })).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });

  it("inspect jobs are free and keep the source upload", async () => {
    const u = await createUser({ credits: 0 });
    const up = await createUpload(u.id, "vehicle-editor", "car.yft");
    await storage().putObject(up.storageKey, Buffer.from("RSC7"), "application/octet-stream");
    const job = await createJob({ userId: u.id, emailVerified: true, toolSlug: "vehicle-editor", uploadIds: [up.id], config: {}, purpose: "inspect" });
    expect(job.chargedCredits).toBe(0);
    expect(job.processor).toBe("inspect");
    await completeJob(job.id, { resultKey: "r/p.json", resultName: "manifest.json", resultSize: 2, sha256: "y", manifest: { artifacts: [] } });
    expect(await storage().headObject(up.storageKey)).not.toBeNull();
    const c = await prisma.creation.findUniqueOrThrow({ where: { id: job.creationId! } });
    expect(c.status).toBe("DRAFT");
    expect((c.projectState as any).preview.jobId).toBe(job.id);
  });
});
