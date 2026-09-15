import { Suspense } from "react";
import type { Metadata } from "next";
import { prisma } from "@modsmith/db";
import { getCurrentUser } from "@/server/session";
import { PageHeader } from "@/components/ui/misc";
import { SettingsTabs } from "@/components/app/settings/settings-tabs";
import { DiscordStatusToast } from "@/components/app/profile/discord-status";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sessionUser = (await getCurrentUser())!;
  const [user, discord] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id }, select: { notifyEmail: true, notifyDiscord: true, notifyJobComplete: true, notifyMarketing: true, profilePublic: true, showcaseDefaultPublic: true } }),
    prisma.discordConnection.findUnique({ where: { userId: sessionUser.id }, select: { id: true } }),
  ]);
  return (
    <div>
      <Suspense fallback={null}><DiscordStatusToast /></Suspense>
      <PageHeader title="Settings" description="Security, notifications, privacy and account controls." />
      <SettingsTabs
        notifications={{ notifyEmail: user.notifyEmail, notifyDiscord: user.notifyDiscord, notifyJobComplete: user.notifyJobComplete, notifyMarketing: user.notifyMarketing }}
        privacy={{ profilePublic: user.profilePublic, showcaseDefaultPublic: user.showcaseDefaultPublic }}
        discordConnected={!!discord}
      />
    </div>
  );
}
