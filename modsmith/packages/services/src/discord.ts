import { prisma } from "@modsmith/db";
import { env } from "./env";
import { decrypt, encrypt } from "./crypto";
import { logger } from "./logger";

const API = "https://discord.com/api/v10";

export function discordConfigured() {
  const e = env();
  return !!(e.DISCORD_CLIENT_ID && e.DISCORD_CLIENT_SECRET);
}

export function discordAuthorizeUrl(state: string) {
  const e = env();
  const q = new URLSearchParams({
    client_id: e.DISCORD_CLIENT_ID ?? "",
    redirect_uri: `${e.APP_URL}/api/v1/auth/discord/callback`,
    response_type: "code",
    scope: "identify",
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

export async function exchangeDiscordCode(code: string) {
  const e = env();
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e.DISCORD_CLIENT_ID ?? "", client_secret: e.DISCORD_CLIENT_SECRET ?? "", grant_type: "authorization_code", code, redirect_uri: `${e.APP_URL}/api/v1/auth/discord/callback` }),
  });
  if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
  const tok = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const me = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!me.ok) throw new Error(`Discord profile fetch failed: ${me.status}`);
  const profile = (await me.json()) as { id: string; username: string; global_name?: string | null; avatar?: string | null };
  return { tok, profile };
}

export async function upsertDiscordConnection(userId: string, data: { tok: { access_token: string; refresh_token: string; expires_in: number }; profile: { id: string; username: string; global_name?: string | null; avatar?: string | null } }) {
  return prisma.discordConnection.upsert({
    where: { userId },
    create: {
      userId,
      discordId: data.profile.id,
      username: data.profile.username,
      globalName: data.profile.global_name ?? null,
      avatarHash: data.profile.avatar ?? null,
      accessTokenEnc: encrypt(data.tok.access_token),
      refreshTokenEnc: encrypt(data.tok.refresh_token),
      tokenExpiresAt: new Date(Date.now() + data.tok.expires_in * 1000),
    },
    update: {
      discordId: data.profile.id,
      username: data.profile.username,
      globalName: data.profile.global_name ?? null,
      avatarHash: data.profile.avatar ?? null,
      accessTokenEnc: encrypt(data.tok.access_token),
      refreshTokenEnc: encrypt(data.tok.refresh_token),
      tokenExpiresAt: new Date(Date.now() + data.tok.expires_in * 1000),
    },
  });
}

export function discordAvatarUrl(discordId: string, hash: string | null) {
  if (!hash) return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordId) >> 22n) % 6}.png`;
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=128`;
}

/** Send a direct message via the bot (requires DISCORD_BOT_TOKEN and the user sharing a guild with the bot). */
export async function sendDiscordDm(userId: string, content: { title: string; description: string; url?: string; color?: number }) {
  const e = env();
  if (!e.DISCORD_BOT_TOKEN) return false;
  const conn = await prisma.discordConnection.findUnique({ where: { userId } });
  if (!conn) return false;
  try {
    let channelId = conn.dmChannelId;
    if (!channelId) {
      const res = await fetch(`${API}/users/@me/channels`, { method: "POST", headers: { Authorization: `Bot ${e.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ recipient_id: conn.discordId }) });
      if (!res.ok) throw new Error(`open DM failed ${res.status}`);
      channelId = ((await res.json()) as { id: string }).id;
      await prisma.discordConnection.update({ where: { id: conn.id }, data: { dmChannelId: channelId } });
    }
    const res = await fetch(`${API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${e.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title: content.title, description: content.description, url: content.url, color: content.color ?? 0xf97316, footer: { text: e.APP_NAME } }] }),
    });
    if (!res.ok) throw new Error(`send DM failed ${res.status}`);
    return true;
  } catch (err) {
    logger.warn({ err, userId }, "discord dm failed");
    return false;
  }
}

/** Post to a configured webhook for important account/system events. */
export async function postDiscordWebhook(content: { title: string; description: string; color?: number }) {
  const url = env().DISCORD_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [{ ...content, color: content.color ?? 0x5865f2 }] }) });
    return res.ok;
  } catch { return false; }
}

export function decryptDiscordToken(enc: string | null) {
  return enc ? decrypt(enc) : null;
}
