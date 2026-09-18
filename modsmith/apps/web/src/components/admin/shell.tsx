"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, Menu, Shield, X } from "lucide-react";
import { BRAND } from "@modsmith/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/avatar";
import { adminTitleFor, isAdminNavActive, navForRole, type AdminRole } from "./nav";

export interface AdminShellUser { id: string; username: string; role: AdminRole; avatarUrl: string | null }

function NavList({ role, onNavigate }: { role: AdminRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = navForRole(role);
  const groups = Array.from(new Set(items.map((i) => i.group)));
  return (
    <nav aria-label="Admin" className="flex flex-1 flex-col gap-3 overflow-y-auto scrollbar-thin px-3 py-3">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{g}</p>
          <div className="flex flex-col gap-0.5">
            {items.filter((i) => i.group === g).map((item) => {
              const active = isAdminNavActive(item, pathname);
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-subtle hover:text-fg")}>
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-auto border-t border-border pt-3">
        <Link href="/app" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />Back to workshop</Link>
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight" aria-label={`${BRAND.name} admin`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg"><Shield className="h-4 w-4" aria-hidden /></span>
      <span>{BRAND.name}</span>
      <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">Admin</span>
    </Link>
  );
}

export function AdminShell({ user, children }: { user: AdminShellUser; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => { setOpen(false); }, [pathname]);
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-bg-elevated lg:flex">
        <div className="flex h-14 items-center border-b border-border px-4"><Brand /></div>
        <NavList role={user.role} />
      </aside>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-bg-elevated shadow-xl focus:outline-none lg:hidden" aria-describedby={undefined}>
            <DialogPrimitive.Title className="sr-only">Admin navigation</DialogPrimitive.Title>
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Brand />
              <DialogPrimitive.Close className="rounded-md p-1.5 text-fg-muted hover:bg-bg-subtle hover:text-fg" aria-label="Close menu"><X className="h-5 w-5" /></DialogPrimitive.Close>
            </div>
            <NavList role={user.role} onNavigate={() => setOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-56">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium">{adminTitleFor(pathname)}</div>
          <Badge variant={user.role === "ADMIN" ? "accent" : "info"}>{user.role.toLowerCase()}</Badge>
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex"><Link href="/app"><ArrowLeft />Back to workshop</Link></Button>
          <UserAvatar username={user.username} src={user.avatarUrl} />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
