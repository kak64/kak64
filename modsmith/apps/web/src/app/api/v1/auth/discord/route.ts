import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { discordAuthorizeUrl, discordConfigured, randomToken, RATE_LIMITS, rateLimit } from "@modsmith/services";
import { getSession, cookieOptions } from "@/server/session";

/** Starts the Discord OAuth flow. State is a random nonce stored in an HttpOnly cookie. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login?next=/app/settings", req.url));
  if (!discordConfigured()) return NextResponse.redirect(new URL("/app/settings?discord=unconfigured", req.url));
  const rl = await rateLimit(RATE_LIMITS.discord, session.user.id);
  if (!rl.allowed) return NextResponse.redirect(new URL("/app/settings?discord=rate_limited", req.url));
  const state = randomToken(24);
  const jar = await cookies();
  jar.set("ms_discord_state", state, { ...cookieOptions(600) });
  return NextResponse.redirect(discordAuthorizeUrl(state));
}
