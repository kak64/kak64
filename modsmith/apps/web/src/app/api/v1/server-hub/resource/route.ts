import { NextResponse } from "next/server";
import { buildHubResourceZip } from "@/server/hub-resource";
import { getSession } from "@/server/session";

/** Downloads the FiveM `msmhub` resource as a ZIP (client + server Lua + manifest + README). */
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const zip = await buildHubResourceZip();
  return new NextResponse(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="msmhub.zip"', "Cache-Control": "private, max-age=300" } });
}
