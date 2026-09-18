import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck, MailWarning } from "lucide-react";
import { prisma } from "@modsmith/db";
import { CREDITS } from "@modsmith/core";
import { discordAvatarUrl, discordConfigured } from "@modsmith/services";
import { getCurrentUser } from "@/server/session";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "@/components/app/profile/profile-form";
import { DiscordCard } from "@/components/app/profile/discord-card";
import { DiscordStatusToast } from "@/components/app/profile/discord-status";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const sessionUser = (await getCurrentUser())!;
  const [user, discord] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id }, select: { username: true, email: true, bio: true, avatarUrl: true, profilePublic: true, emailVerifiedAt: true, createdAt: true } }),
    prisma.discordConnection.findUnique({ where: { userId: sessionUser.id }, select: { discordId: true, username: true, globalName: true, avatarHash: true, connectedAt: true } }),
  ]);

  return (
    <div>
      <Suspense fallback={null}><DiscordStatusToast /></Suspense>
      <PageHeader title="Profile" description={`Member since ${formatDate(user.createdAt)}.`} actions={user.emailVerifiedAt ? <Badge variant="success"><MailCheck className="h-3 w-3" aria-hidden /> Email verified</Badge> : <Badge variant="warning"><MailWarning className="h-3 w-3" aria-hidden /> Email not verified</Badge>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Public details</CardTitle><CardDescription>How other creators see you across Modsmith.</CardDescription></CardHeader>
          <CardContent>
            <ProfileForm initial={{ username: user.username, email: user.email, bio: user.bio ?? "", avatarUrl: user.avatarUrl ?? "", profilePublic: user.profilePublic }} />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Discord</CardTitle><CardDescription>Link your account for bonus credits and notifications.</CardDescription></CardHeader>
            <CardContent>
              <DiscordCard configured={discordConfigured()} discord={discord ? { username: discord.username, globalName: discord.globalName, avatarUrl: discordAvatarUrl(discord.discordId, discord.avatarHash), connectedAt: discord.connectedAt.toISOString() } : null} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Free credits</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-fg-muted">
                <li>{user.emailVerifiedAt ? "✅" : "•"} Verify your email — +{CREDITS.EMAIL_VERIFY_BONUS} credits</li>
                <li>{discord ? "✅" : "•"} Connect Discord — +{CREDITS.DISCORD_BONUS} credits</li>
                <li>• <Link href="/app/referrals" className="text-accent hover:underline">Invite a creator</Link> — +{CREDITS.REFERRAL_REWARD} credits each</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
