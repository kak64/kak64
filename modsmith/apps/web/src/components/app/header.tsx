"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Coins, ChevronRight, LogOut, User, Settings, CreditCard } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatCredits } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-me";
import { NotificationsBell } from "./notifications-bell";
import { breadcrumbFor } from "./nav";
import type { ShellUser } from "./shell";

export function AppHeader({ user, onMenu }: { user: ShellUser; onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { me, loading } = useMe();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const crumbs = breadcrumbFor(pathname);

  const logout = async () => {
    setLoggingOut(true);
    try { await api("/api/v1/auth/logout", { method: "POST" }); router.push("/"); router.refresh(); }
    catch { toast({ title: "Could not log out", variant: "danger" }); setLoggingOut(false); }
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu /></Button>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <li key={i} className="flex items-center gap-1 truncate">
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" aria-hidden /> : null}
              <span className={i === crumbs.length - 1 ? "font-medium text-fg" : "text-fg-muted"}>{c}</span>
            </li>
          ))}
        </ol>
      </nav>
      <Link href="/app/credits" className="hidden items-center gap-2 rounded-full border border-border bg-bg-elevated py-1 pl-2.5 pr-1 text-sm hover:border-accent/50 sm:flex" aria-label="Credit balance">
        <Coins className="h-4 w-4 text-accent" aria-hidden />
        {loading && !me ? <Skeleton className="h-4 w-10" /> : <span className="font-semibold tabular-nums">{formatCredits(me?.credits)}</span>}
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">Buy</span>
      </Link>
      <NotificationsBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Account menu"><UserAvatar username={user.username} src={user.avatarUrl} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-fg"><div className="truncate font-semibold">{user.username}</div><div className="truncate text-xs font-normal text-fg-muted">{user.email}</div></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="sm:hidden" asChild><Link href="/app/credits"><Coins /> {formatCredits(me?.credits)} credits</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/app/profile"><User /> Profile</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/app/settings"><Settings /> Settings</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/app/billing"><CreditCard /> Billing</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); logout(); }} disabled={loggingOut}><LogOut /> {loggingOut ? "Logging out…" : "Log out"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
