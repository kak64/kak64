import { LayoutDashboard, Wrench, FolderOpen, ListChecks, Coins, CreditCard, Server, Images, Gift, User, Settings, Shield, type LucideIcon } from "lucide-react";

export interface NavItem { label: string; href: string; icon: LucideIcon; exact?: boolean }

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard, exact: true },
  { label: "Tools", href: "/app/tools", icon: Wrench },
  { label: "My Creations", href: "/app/creations", icon: FolderOpen },
  { label: "Jobs", href: "/app/jobs", icon: ListChecks },
  { label: "Credits", href: "/app/credits", icon: Coins },
  { label: "Billing", href: "/app/billing", icon: CreditCard },
  { label: "Server Hub", href: "/app/hub", icon: Server },
  { label: "Showcase", href: "/app/showcase", icon: Images },
  { label: "Referrals", href: "/app/referrals", icon: Gift },
  { label: "Profile", href: "/app/profile", icon: User },
  { label: "Settings", href: "/app/settings", icon: Settings },
];

export const ADMIN_ITEM: NavItem = { label: "Admin", href: "/admin", icon: Shield };

const EXTRA_TITLES: Record<string, string> = { "/app/notifications": "Notifications", "/app/reviews/new": "Write a review", "/app/hub/logs": "Logs", "/app/hub/media": "Media", "/app/hub/settings": "Hub settings", "/app/hub/servers": "Server" };

export function isActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Breadcrumb for the header: e.g. ["Server Hub", "Logs"] or ["My Creations", "Details"]. */
export function breadcrumbFor(pathname: string): string[] {
  const item = NAV_ITEMS.filter((i) => isActive(i, pathname)).sort((a, b) => b.href.length - a.href.length)[0];
  if (!item) return [EXTRA_TITLES[pathname] ?? "Workshop"];
  if (pathname === item.href) return [item.label];
  const extra = Object.entries(EXTRA_TITLES).find(([k]) => pathname === k || pathname.startsWith(k + "/"))?.[1];
  return [item.label, extra ?? "Details"];
}
