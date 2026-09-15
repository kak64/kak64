import { prisma } from "@modsmith/db";
import { getSetting } from "@modsmith/services";
import { PageHeader, Alert } from "@/components/ui/misc";
import { SettingsTable, type AdminSetting } from "@/components/admin/settings-table";
import { requireAdmin } from "@/components/admin/guard";

export const dynamic = "force-dynamic";

const KNOWN: { key: string; description: string; kind: AdminSetting["kind"] }[] = [
  { key: "credits.signupBonus", description: "Credits granted once when a new account is created.", kind: "number" },
  { key: "credits.emailVerifyBonus", description: "Credits granted once when an account verifies its email address.", kind: "number" },
  { key: "credits.discordBonus", description: "Credits granted once when a Discord account is linked.", kind: "number" },
  { key: "credits.referralReward", description: "Credits paid to the referrer when a referral qualifies.", kind: "number" },
  { key: "credits.reexportWindowDays", description: "Days after an export during which re-exporting the same source and config is free.", kind: "number" },
  { key: "hub.freeStorageBytes", description: "Server Hub media storage included on the free tier, in bytes.", kind: "number" },
  { key: "hub.defaultRetentionDays", description: "Default number of days hub logs and media are retained.", kind: "number" },
  { key: "hub.freeMaxServers", description: "How many Server Hub projects a free account may create.", kind: "number" },
  { key: "uploads.ttlHours", description: "Hours an unused upload stays before cleanup removes it.", kind: "number" },
];

export default async function AdminSettingsPage() {
  await requireAdmin();
  const rows = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));

  const known: AdminSetting[] = await Promise.all(KNOWN.map(async (k) => ({
    key: k.key,
    description: k.description,
    kind: k.kind,
    stored: stored.has(k.key),
    value: (await getSetting<string | number | boolean>(k.key)) ?? "",
  })));

  const extras: AdminSetting[] = rows
    .filter((r) => !KNOWN.some((k) => k.key === r.key))
    .map((r) => {
      const v = r.value as unknown;
      const kind: AdminSetting["kind"] = typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string";
      return { key: r.key, description: undefined, kind, stored: true, value: (typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean)) };
    });

  return (
    <div className="space-y-4">
      <PageHeader title="System settings" description="Values read through getSetting(). Keys with no stored row fall back to the code default." />
      <Alert variant="info" title="Careful — these apply immediately">Settings are cached for 30 seconds and then take effect across web and worker processes. Every change is written to the audit log.</Alert>
      <SettingsTable settings={[...known, ...extras]} />
    </div>
  );
}
