"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ExternalLink, BookOpen, MessageCircle } from "lucide-react";
import { BRAND } from "@modsmith/core";
import { cn } from "@/lib/utils";
import { ADMIN_ITEM, NAV_ITEMS, isActive } from "./nav";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)} aria-label={`${BRAND.name} home`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg text-sm font-bold">M</span>
      <span>{BRAND.name}</span>
    </Link>
  );
}

function NavList({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
  return (
    <nav aria-label="Workshop" className="flex flex-1 flex-col gap-1 overflow-y-auto scrollbar-thin px-3 py-3">
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-subtle hover:text-fg")}>
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
      <div className="mt-auto border-t border-border pt-3">
        <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Help</p>
        <a href={BRAND.discordInvite} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg"><MessageCircle className="h-4 w-4" aria-hidden />Discord<ExternalLink className="ml-auto h-3 w-3" aria-hidden /></a>
        <Link href="/guides" onClick={onNavigate} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg"><BookOpen className="h-4 w-4" aria-hidden />Guides</Link>
      </div>
    </nav>
  );
}

export function DesktopSidebar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-bg-elevated lg:flex">
      <div className="flex h-14 items-center border-b border-border px-5"><Logo /></div>
      <NavList isAdmin={isAdmin} />
    </aside>
  );
}

/** Mobile navigation drawer (Radix Dialog positioned as a left sheet). */
export function MobileSidebar({ isAdmin, open, onOpenChange }: { isAdmin: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-bg-elevated shadow-xl focus:outline-none lg:hidden" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <Logo />
            <DialogPrimitive.Close className="rounded-md p-1.5 text-fg-muted hover:bg-bg-subtle hover:text-fg" aria-label="Close menu"><X className="h-5 w-5" /></DialogPrimitive.Close>
          </div>
          <NavList isAdmin={isAdmin} onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
