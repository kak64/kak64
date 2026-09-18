import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@modsmith/db";
import { createJob, failJob, retryJob } from "./jobs";
import { getBalance } from "./credits";
import { createUpload, createUser, resetDb } from "./test/helpers";
import { getQueue, QUEUE_NAMES } from "./queue";

vi.mock("./notifications", () => ({ notify: vi.fn(async () => undefined) }));

describe("job retry", () => {
  beforeEach(async () => {
    await resetDb();
    await getQueue(QUEUE_NAMES.processing).obliterate({ force: true }).catch(() => {});
  });

  it("re-holds the refunded credits and re-queues the job", async () => {
    const u = await createUser({ credits: 100 });
    const up = await createUpload(u.id);
    const job = await createJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up.id], config: {} });
    await failJob(job.id, { code: "WORKER_CRASH", message: "boom", infrastructure: true });
    expect(await getBalance(u.id)).toBe(100); // refunded

    await retryJob(job.id, null);
    const retried = await prisma.processingJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(retried.status).toBe("QUEUED");
    expect(retried.attempts).toBe(1);
    expect(retried.errorCode).toBeNull();
    expect(await getBalance(u.id)).toBe(60); // held again

    // A second failure refunds again, and the retry counter keeps climbing.
    await failJob(job.id, { code: "WORKER_CRASH", message: "boom again", infrastructure: true });
    expect(await getBalance(u.id)).toBe(100);
    await retryJob(job.id, null);
    expect((await prisma.processingJob.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(2);
    expect(await getBalance(u.id)).toBe(60);
  });

  it("refuses to retry a job that did not fail", async () => {
    const u = await createUser({ credits: 100 });
    const up = await createUpload(u.id);
    const job = await createJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up.id], config: {} });
    await expect(retryJob(job.id, null)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("records an audit entry naming the admin who retried", async () => {
    const u = await createUser({ credits: 100 });
    const admin = await createUser({ username: "adminuser" });
    const up = await createUpload(u.id);
    const job = await createJob({ userId: u.id, emailVerified: true, toolSlug: "prop-creator", uploadIds: [up.id], config: {} });
    await failJob(job.id, { code: "X", message: "x", infrastructure: true });
    await retryJob(job.id, admin.id);
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: "job.retry", targetId: job.id } });
    expect(entry.actorId).toBe(admin.id);
    expect(entry.actorType).toBe("admin");
  });
});
