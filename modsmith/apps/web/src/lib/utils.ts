import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | bigint | null | undefined, digits = 1) {
  const n = Number(bytes ?? 0);
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined) {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(d);
}

export function formatCredits(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("en-US");
}

export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}
