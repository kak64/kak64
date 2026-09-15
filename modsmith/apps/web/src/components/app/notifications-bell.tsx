"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-me";

export interface NotificationItem { id: string; type: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string }

export function NotificationsBell() {
  const { me } = useMe();
  const router = useRouter();
  const { toast } = useToast();
  const [unread, setUnread] = React.useState<number | null>(null);
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const count = unread ?? me?.unreadNotifications ?? 0;

  // Live updates: bump the badge + toast on new notifications.
  React.useEffect(() => {
    if (!me?.user) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es = new EventSource("/api/v1/notifications/stream");
      es.onmessage = (m) => {
        try {
          const n = JSON.parse(m.data) as { id: string; title: string; href?: string | null };
          setUnread((u) => (u ?? me.unreadNotifications ?? 0) + 1);
          setItems(null);
          toast({ title: n.title, description: n.href ? "Open the bell to view it." : undefined });
          router.refresh();
        } catch { /* ignore */ }
      };
      es.onerror = () => { es?.close(); retry = setTimeout(connect, 15000); };
    };
    connect();
    return () => { es?.close(); if (retry) clearTimeout(retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user?.id]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ notifications: NotificationItem[]; unread: number }>("/api/v1/notifications?pageSize=10");
      setItems(r.notifications);
      const unreadIds = r.notifications.filter((n) => !n.readAt).map((n) => n.id);
      if (unreadIds.length) {
        const res = await api<{ unread: number }>("/api/v1/notifications/read", { json: { ids: unreadIds } });
        setUnread(res.unread);
      } else setUnread(r.unread);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  const markAll = async () => {
    try { const r = await api<{ unread: number }>("/api/v1/notifications/read", { json: { all: true } }); setUnread(r.unread); setItems((p) => p?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null); } catch { /* ignore */ }
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <Popover.Trigger asChild>
        <button type="button" className="relative rounded-md p-2 text-fg-muted hover:bg-bg-subtle hover:text-fg" aria-label={count ? `Notifications, ${count} unread` : "Notifications"}>
          <Bell className="h-5 w-5" aria-hidden />
          {count > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg" aria-hidden>{count > 99 ? "99+" : count}</span> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-border bg-bg-elevated shadow-xl focus:outline-none">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <Button variant="ghost" size="sm" onClick={markAll} disabled={count === 0}><CheckCheck /> Mark all read</Button>
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto scrollbar-thin" aria-live="polite">
            {loading && !items ? <li className="flex items-center gap-2 px-3 py-6 text-sm text-fg-muted"><Spinner /> Loading…</li> : null}
            {items && items.length === 0 ? <li className="px-3 py-8 text-center text-sm text-fg-muted">You're all caught up.</li> : null}
            {items?.map((n) => {
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("text-sm", !n.readAt ? "font-semibold text-fg" : "text-fg")}>{n.title}</span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">{timeAgo(n.createdAt)}</span>
                  </div>
                  {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{n.body}</p> : null}
                </>
              );
              return (
                <li key={n.id} className={cn(!n.readAt && "bg-accent-soft/40")}>
                  {n.href ? <Link href={n.href} onClick={() => setOpen(false)} className="block px-3 py-2.5 hover:bg-bg-subtle">{inner}</Link> : <div className="px-3 py-2.5">{inner}</div>}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border px-3 py-2 text-center">
            <Link href="/app/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-accent hover:underline">View all notifications</Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
