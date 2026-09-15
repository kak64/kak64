import { prisma, type NotificationType, type Prisma } from "@modsmith/db";
import { redis } from "./redis";
import { sendEmail, type TemplateName } from "./email";
import { sendDiscordDm } from "./discord";
import { env } from "./env";

export async function notify(opts: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  data?: Prisma.InputJsonValue;
  email?: { template: TemplateName; params: Record<string, unknown> } | null;
  discord?: boolean;
}) {
  const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { email: true, username: true, notifyEmail: true, notifyDiscord: true, notifyJobComplete: true, notifyMarketing: true } });
  if (!user) return;
  const n = await prisma.notification.create({ data: { userId: opts.userId, type: opts.type, title: opts.title, body: opts.body, href: opts.href, data: opts.data } });
  try { await redis().publish(`user:${opts.userId}:notifications`, JSON.stringify({ id: n.id, type: n.type, title: n.title, href: n.href })); } catch { /* ignore */ }

  const isJob = opts.type === "JOB_COMPLETED" || opts.type === "JOB_FAILED";
  if (opts.email && user.notifyEmail && (!isJob || user.notifyJobComplete)) {
    await sendEmail(user.email, opts.email.template, { username: user.username, ...opts.email.params } as any);
  }
  if (opts.discord && user.notifyDiscord && (!isJob || user.notifyJobComplete)) {
    await sendDiscordDm(opts.userId, { title: opts.title, description: opts.body ?? "", url: opts.href ? `${env().APP_URL}${opts.href}` : undefined, color: opts.type === "JOB_FAILED" ? 0xef4444 : 0x22c55e });
  }
  return n;
}
