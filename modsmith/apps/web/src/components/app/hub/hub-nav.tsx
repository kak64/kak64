"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app/hub", label: "Overview", exact: true },
  { href: "/app/hub/logs", label: "Logs" },
  { href: "/app/hub/media", label: "Media" },
  { href: "/app/hub/settings", label: "Settings" },
];

export function HubNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Server Hub" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors", active ? "border-accent text-accent" : "border-transparent text-fg-muted hover:text-fg")}>{t.label}</Link>;
      })}
    </nav>
  );
}
