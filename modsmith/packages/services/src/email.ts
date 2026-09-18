import { prisma } from "@modsmith/db";
import { BRAND } from "@modsmith/core";
import { env } from "./env";
import { logger } from "./logger";

export interface EmailMessage { to: string; subject: string; html: string; text: string; template: string }
export interface EmailProvider { name: string; send(msg: EmailMessage): Promise<{ id?: string }> }

class ConsoleProvider implements EmailProvider {
  name = "console";
  async send(msg: EmailMessage) {
    logger.info({ to: msg.to, subject: msg.subject, template: msg.template }, "email (console provider)");
    if (process.env.NODE_ENV !== "production") console.log(`\n──── EMAIL to ${msg.to} [${msg.template}] ────\n${msg.subject}\n\n${msg.text}\n────────────────────────\n`);
    return {};
  }
}
class ResendProvider implements EmailProvider {
  name = "resend";
  async send(msg: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env().RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env().EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { id?: string };
    return { id: data.id };
  }
}
class PostmarkProvider implements EmailProvider {
  name = "postmark";
  async send(msg: EmailMessage) {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "X-Postmark-Server-Token": env().POSTMARK_SERVER_TOKEN ?? "", "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ From: env().EMAIL_FROM, To: msg.to, Subject: msg.subject, HtmlBody: msg.html, TextBody: msg.text, MessageStream: "outbound" }),
    });
    if (!res.ok) throw new Error(`Postmark error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { MessageID?: string };
    return { id: data.MessageID };
  }
}

function provider(): EmailProvider {
  switch (env().EMAIL_PROVIDER) {
    case "resend": return new ResendProvider();
    case "postmark": return new PostmarkProvider();
    default: return new ConsoleProvider();
  }
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#0b0d10;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e6e8eb">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d10;padding:32px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#12151a;border:1px solid #22262e;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;color:#fff;padding-bottom:16px">${BRAND.name}</td></tr>
<tr><td style="font-size:18px;font-weight:600;color:#fff;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#c4c9d1">${bodyHtml}</td></tr>
<tr><td style="font-size:12px;color:#7a828e;padding-top:24px;border-top:1px solid #22262e;margin-top:24px">You are receiving this because you have a ${BRAND.name} account. ${BRAND.supportEmail}</td></tr>
</table></td></tr></table></body></html>`;
}
const btn = (href: string, label: string) => `<p style="margin:24px 0"><a href="${href}" style="background:#f97316;color:#111;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;display:inline-block">${label}</a></p>`;

export const templates = {
  verifyEmail: (p: { username: string; url: string }) => ({
    subject: `Verify your ${BRAND.name} email`,
    html: layout("Confirm your email", `<p>Hi ${p.username}, confirm your email address to unlock your bonus credits and every tool.</p>${btn(p.url, "Verify email")}<p>This link expires in 24 hours.</p>`),
    text: `Hi ${p.username}, verify your email: ${p.url}\n\nThis link expires in 24 hours.`,
  }),
  passwordReset: (p: { username: string; url: string }) => ({
    subject: `Reset your ${BRAND.name} password`,
    html: layout("Reset your password", `<p>Hi ${p.username}, we received a request to reset your password.</p>${btn(p.url, "Choose a new password")}<p>If you did not request this you can ignore this email. The link expires in 60 minutes.</p>`),
    text: `Reset your password: ${p.url}\n\nThe link expires in 60 minutes. If you did not request this, ignore this email.`,
  }),
  welcome: (p: { username: string; credits: number; url: string }) => ({
    subject: `Welcome to ${BRAND.name}`,
    html: layout(`Welcome, ${p.username}`, `<p>Your account is ready with <strong>${p.credits} free credits</strong>. Upload a model, configure it, and export a FiveM resource in minutes.</p>${btn(p.url, "Open the workshop")}`),
    text: `Welcome ${p.username}! You have ${p.credits} free credits. Open the workshop: ${p.url}`,
  }),
  jobCompleted: (p: { username: string; name: string; tool: string; url: string }) => ({
    subject: `${p.name} is ready`,
    html: layout("Your export is ready", `<p>${p.tool} finished building <strong>${p.name}</strong>.</p>${btn(p.url, "Download")}`),
    text: `${p.tool} finished building ${p.name}. Download: ${p.url}`,
  }),
  jobFailed: (p: { username: string; name: string; tool: string; reason: string; refunded: boolean; url: string }) => ({
    subject: `${p.name} failed to build`,
    html: layout("Build failed", `<p>${p.tool} could not build <strong>${p.name}</strong>: ${p.reason}</p>${p.refunded ? "<p>Your credits have been refunded.</p>" : ""}${btn(p.url, "View job")}`),
    text: `${p.tool} could not build ${p.name}: ${p.reason}${p.refunded ? "\nYour credits have been refunded." : ""}\n${p.url}`,
  }),
  paymentReceipt: (p: { username: string; credits: number; amount: string; url: string }) => ({
    subject: `Receipt: ${p.credits} credits`,
    html: layout("Thanks for your purchase", `<p>${p.credits} credits were added to your account (${p.amount}).</p>${btn(p.url, "View billing")}`),
    text: `${p.credits} credits were added (${p.amount}). ${p.url}`,
  }),
  paymentFailed: (p: { username: string; url: string }) => ({
    subject: "Payment failed",
    html: layout("We could not process your payment", `<p>Your latest subscription payment failed. Update your payment method to keep your plan active.</p>${btn(p.url, "Update payment method")}`),
    text: `Your latest subscription payment failed. Update your payment method: ${p.url}`,
  }),
  subscriptionRenewed: (p: { username: string; plan: string; credits: number; url: string }) => ({
    subject: `${p.plan} renewed`,
    html: layout("Subscription renewed", `<p>Your ${p.plan} plan renewed and ${p.credits} credits were added.</p>${btn(p.url, "View billing")}`),
    text: `Your ${p.plan} plan renewed and ${p.credits} credits were added. ${p.url}`,
  }),
  subscriptionCanceled: (p: { username: string; plan: string; endsAt: string; url: string }) => ({
    subject: `${p.plan} cancelled`,
    html: layout("Subscription cancelled", `<p>Your ${p.plan} plan will end on ${p.endsAt}. You keep every credit you already have.</p>${btn(p.url, "Manage billing")}`),
    text: `Your ${p.plan} plan will end on ${p.endsAt}. ${p.url}`,
  }),
  referralReward: (p: { username: string; referred: string; credits: number; url: string }) => ({
    subject: `You earned ${p.credits} credits`,
    html: layout("Referral reward", `<p>${p.referred} built their first asset. ${p.credits} credits were added to your account.</p>${btn(p.url, "View referrals")}`),
    text: `${p.referred} built their first asset. You earned ${p.credits} credits. ${p.url}`,
  }),
};

export type TemplateName = keyof typeof templates;

export async function sendEmail<T extends TemplateName>(to: string, template: T, params: Parameters<(typeof templates)[T]>[0]) {
  const rendered = (templates[template] as (p: unknown) => { subject: string; html: string; text: string })(params);
  const outbox = await prisma.emailOutbox.create({ data: { to, template, subject: rendered.subject, status: "queued" } });
  try {
    const p = provider();
    const res = await p.send({ to, template, ...rendered });
    await prisma.emailOutbox.update({ where: { id: outbox.id }, data: { status: "sent", provider: p.name, providerId: res.id ?? null, sentAt: new Date() } });
  } catch (err) {
    logger.error({ err, template, to }, "email send failed");
    await prisma.emailOutbox.update({ where: { id: outbox.id }, data: { status: "failed", error: String(err).slice(0, 500) } });
  }
}
