import { LayoutDashboard, Users, Coins, ListChecks, FolderOpen, Wrench, Tag, CreditCard, Landmark, Server, Images, Sparkles, Star, BookOpen, History, Handshake, Flag, ToggleLeft, Settings, ScrollText, Activity, type LucideIcon } from "lucide-react";

export type AdminRole = "ADMIN" | "MODERATOR";
export interface AdminNavItem { label: string; href: string; icon: LucideIcon; exact?: boolean; roles: AdminRole[]; group: string }

const ALL: AdminRole[] = ["ADMIN", "MODERATOR"];
const ADMIN_ONLY: AdminRole[] = ["ADMIN"];

export const ADMIN_NAV: AdminNavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, exact: true, roles: ADMIN_ONLY, group: "General" },
  { label: "Health", href: "/admin/health", icon: Activity, roles: ADMIN_ONLY, group: "General" },
  { label: "Users", href: "/admin/users", icon: Users, roles: ALL, group: "Accounts" },
  { label: "Credits", href: "/admin/credits", icon: Coins, roles: ADMIN_ONLY, group: "Accounts" },
  { label: "Subscriptions", href: "/admin/subscriptions", icon: CreditCard, roles: ADMIN_ONLY, group: "Accounts" },
  { label: "Jobs", href: "/admin/jobs", icon: ListChecks, roles: ALL, group: "Workshop" },
  { label: "Creations", href: "/admin/creations", icon: FolderOpen, roles: ALL, group: "Workshop" },
  { label: "Tools", href: "/admin/tools", icon: Wrench, roles: ADMIN_ONLY, group: "Workshop" },
  { label: "Pricing", href: "/admin/pricing", icon: Tag, roles: ADMIN_ONLY, group: "Billing" },
  { label: "Stripe", href: "/admin/stripe", icon: Landmark, roles: ADMIN_ONLY, group: "Billing" },
  { label: "Server Hub", href: "/admin/hub", icon: Server, roles: ADMIN_ONLY, group: "Server Hub" },
  { label: "Media", href: "/admin/media", icon: Images, roles: ADMIN_ONLY, group: "Server Hub" },
  { label: "Showcase", href: "/admin/showcase", icon: Sparkles, roles: ALL, group: "Community" },
  { label: "Reviews", href: "/admin/reviews", icon: Star, roles: ALL, group: "Community" },
  { label: "Reports", href: "/admin/reports", icon: Flag, roles: ALL, group: "Community" },
  { label: "Guides", href: "/admin/guides", icon: BookOpen, roles: ALL, group: "Content" },
  { label: "Changelog", href: "/admin/changelog", icon: History, roles: ALL, group: "Content" },
  { label: "Partners", href: "/admin/partners", icon: Handshake, roles: ADMIN_ONLY, group: "Content" },
  { label: "Feature flags", href: "/admin/flags", icon: ToggleLeft, roles: ADMIN_ONLY, group: "System" },
  { label: "Settings", href: "/admin/settings", icon: Settings, roles: ADMIN_ONLY, group: "System" },
  { label: "Audit log", href: "/admin/audit", icon: ScrollText, roles: ADMIN_ONLY, group: "System" },
];

export function navForRole(role: AdminRole) {
  return ADMIN_NAV.filter((i) => i.roles.includes(role));
}

export function isAdminNavActive(item: AdminNavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

export function adminTitleFor(pathname: string) {
  const item = ADMIN_NAV.filter((i) => isAdminNavActive(i, pathname)).sort((a, b) => b.href.length - a.href.length)[0];
  return item?.label ?? "Admin";
}
