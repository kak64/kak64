import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { prisma } from "@modsmith/db";
import { getCurrentUser } from "@/server/session";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { MarkAllReadButton, MarkReadButton } from "@/components/app/notifications/notification-actions";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const TYPE_VARIANT: Record<string, "default" | "success" | "danger" | "warning" | "accent" | "info"> = {
  JOB_COMPLETED: "success", JOB_FAILED: "danger", CREDITS_PURCHASED: "accent", SUBSCRIPTION_RENEWED: "success",
  SUBSCRIPTION_PAYMENT_FAILED: "danger", SUBSCRIPTION_CANCELED: "warning", DISCORD_LINKED: "info",
  REFERRAL_REWARD: "accent", SYSTEM_ANNOUNCEMENT: "info", ACCOUNT: "default",
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const where = { userId: user.id };
  const [total, unread, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);

  return (
    <div>
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You're all caught up."} actions={<MarkAllReadButton disabled={unread === 0} />} />
      {notifications.length ? (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border bg-bg-elevated">
            {notifications.map((n) => {
              const unreadItem = !n.readAt;
              return (
                <li key={n.id} className={cn("flex flex-wrap items-start gap-3 p-4", unreadItem && "bg-accent-soft/30")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={TYPE_VARIANT[n.type] ?? "default"}>{n.type.replace(/_/g, " ").toLowerCase()}</Badge>
                      {unreadItem ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="Unread" /> : null}
                      <h2 className={cn("text-sm", unreadItem ? "font-semibold" : "font-medium")}>{n.href ? <Link href={n.href} className="hover:text-accent">{n.title}</Link> : n.title}</h2>
                    </div>
                    {n.body ? <p className="mt-1 text-sm text-fg-muted">{n.body}</p> : null}
                    <p className="mt-1 text-xs text-fg-subtle"><time dateTime={n.createdAt.toISOString()} title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</time></p>
                  </div>
                  <div className="flex items-center gap-1">
                    {n.href ? <Link href={n.href} className="text-sm text-accent hover:underline">Open</Link> : null}
                    {unreadItem ? <MarkReadButton id={n.id} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => (p > 1 ? `/app/notifications?page=${p}` : "/app/notifications")} />
        </>
      ) : <EmptyState icon={Bell} title="No notifications yet" description="Build results, credit purchases and referral rewards land here." action={{ label: "Browse tools", href: "/app/tools" }} />}
    </div>
  );
}
