import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@modsmith/db";
import { createUser, resetDb } from "./test/helpers";

const sendDiscordDm = vi.fn(async () => true);
vi.mock("./discord", async (orig) => ({ ...(await orig<typeof import("./discord")>()), sendDiscordDm }));

const { notify } = await import("./notifications");

describe("notification dispatch", () => {
  beforeEach(async () => { await resetDb(); sendDiscordDm.mockClear(); });

  it("stores an in-app notification and queues the email", async () => {
    const u = await createUser();
    await notify({ userId: u.id, type: "JOB_COMPLETED", title: "Prop is ready", body: "Prop Creator finished.", href: "/app/creations/1", email: { template: "jobCompleted", params: { name: "Prop", tool: "Prop Creator", url: "http://localhost:3000/app/creations/1" } }, discord: true });
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: u.id } });
    expect(n.type).toBe("JOB_COMPLETED");
    expect(n.readAt).toBeNull();
    expect(await prisma.emailOutbox.count({ where: { to: u.email, template: "jobCompleted" } })).toBe(1);
    expect(sendDiscordDm).toHaveBeenCalledOnce();
  });

  it("respects the user's channel preferences", async () => {
    const u = await createUser();
    await prisma.user.update({ where: { id: u.id }, data: { notifyEmail: false, notifyDiscord: false } });
    await notify({ userId: u.id, type: "JOB_FAILED", title: "Build failed", email: { template: "jobFailed", params: { name: "Prop", tool: "Prop Creator", reason: "bad mesh", refunded: true, url: "x" } }, discord: true });
    expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(1); // in-app always
    expect(await prisma.emailOutbox.count({ where: { to: u.email } })).toBe(0);
    expect(sendDiscordDm).not.toHaveBeenCalled();
  });

  it("suppresses job notifications when job alerts are turned off but keeps account ones", async () => {
    const u = await createUser();
    await prisma.user.update({ where: { id: u.id }, data: { notifyJobComplete: false } });
    await notify({ userId: u.id, type: "JOB_COMPLETED", title: "ready", email: { template: "jobCompleted", params: { name: "n", tool: "t", url: "u" } }, discord: true });
    expect(await prisma.emailOutbox.count({ where: { to: u.email } })).toBe(0);
    expect(sendDiscordDm).not.toHaveBeenCalled();
    await notify({ userId: u.id, type: "CREDITS_PURCHASED", title: "credits added", email: { template: "paymentReceipt", params: { credits: 100, amount: "$5.00", url: "u" } } });
    expect(await prisma.emailOutbox.count({ where: { to: u.email } })).toBe(1);
  });

  it("does nothing for a user that no longer exists", async () => {
    await expect(notify({ userId: "missing", type: "ACCOUNT", title: "x" })).resolves.toBeUndefined();
  });
});
