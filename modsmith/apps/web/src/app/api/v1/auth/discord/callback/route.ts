import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@modsmith/db";
import { audit, exchangeDiscordCode, getSetting, grantOnce, logger, notify, safeEqual, upsertDiscordConnection } from "@modsmith/services";
import { getSession } from "@/server/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("ms_discord_state")?.value;
  jar.set("ms_discord_state", "", { maxAge: 0, path: "/" });
  if (!code || !state || !expected || !safeEqual(state, expected)) return NextResponse.redirect(new URL("/app/settings?discord=invalid_state", req.url));
  try {
    const data = await exchangeDiscordCode(code);
    const taken = await prisma.discordConnection.findUnique({ where: { discordId: data.profile.id } });
    if (taken && taken.userId !== session.user.id) return NextResponse.redirect(new URL("/app/settings?discord=already_linked", req.url));
    const conn = await upsertDiscordConnection(session.user.id, data);
    const bonus = await getSetting<number>("credits.discordBonus");
    const granted = await grantOnce({ userId: session.user.id, grantKey: `discord:${session.user.id}`, source: "discord", type: "DISCORD_BONUS", amount: bonus, reason: "Discord linked bonus", metadata: { discordId: data.profile.id } });
    if (granted) await prisma.discordConnection.update({ where: { id: conn.id }, data: { bonusGrantedAt: new Date() } });
    await audit({ actorId: session.user.id, action: "discord.connect", targetType: "user", targetId: session.user.id, after: { discordId: data.profile.id } });
    await notify({ userId: session.user.id, type: "DISCORD_LINKED", title: "Discord connected", body: granted ? `${bonus} bonus credits added.` : "You will now receive job notifications on Discord.", href: "/app/settings", discord: true });
    return NextResponse.redirect(new URL(`/app/settings?discord=connected${granted ? "&bonus=" + bonus : ""}`, req.url));
  } catch (err) {
    logger.error({ err }, "discord oauth failed");
    return NextResponse.redirect(new URL("/app/settings?discord=error", req.url));
  }
}
