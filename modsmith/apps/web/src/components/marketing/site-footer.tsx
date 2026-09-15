import Link from "next/link";
import { BRAND } from "@modsmith/core";
import { Logo } from "./logo";
import { Container } from "./section";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Tools", href: "/#tools" },
      { label: "Pricing", href: "/pricing" },
      { label: "Showcase", href: "/showcase" },
      { label: "Reviews", href: "/reviews" },
      { label: "Changelog", href: "/changelog" },
      { label: "Partners", href: "/partners" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Guides", href: "/guides" },
      { label: "Server Hub Docs", href: "/docs/server-hub" },
      { label: "Status", href: "/changelog" },
      { label: "API docs", href: "/docs/server-hub#api" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: `mailto:${BRAND.supportEmail}`, external: true },
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Log in", href: "/login" },
      { label: "Register", href: "/register" },
      { label: "Referrals", href: "/app/referrals" },
      { label: "Discord", href: BRAND.discordInvite, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg-elevated/40">
      <Container className="py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm leading-6 text-fg-muted">{BRAND.tagline} Props, vehicles, liveries, clothing, weapons and more — exported as complete FiveM resources.</p>
            <a href={BRAND.discordInvite} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-fg-muted hover:text-fg">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a13 13 0 0 1 4.5 2.3 15.6 15.6 0 0 0-15.4 0 13 13 0 0 1 4.5-2.3L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 0 13.4.3 17.8a20 20 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4a12.7 12.7 0 0 1-2 1l1.3 2a20 20 0 0 0 6-3c.4-5.1-.7-9.5-3.4-13.4ZM8.5 15.1c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4c1.2 0 2.2 1.1 2.1 2.4 0 1.3-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" /></svg>
              Join the Discord
            </a>
          </div>
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{c.title}</h2>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined} className="text-sm text-fg-muted hover:text-fg">{l.label}</a>
                    ) : (
                      <Link href={l.href} className="text-sm text-fg-muted hover:text-fg">{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          <p className="max-w-xl sm:text-right">{BRAND.name} is not affiliated with Rockstar Games, Take-Two or Cfx.re. GTA V is a trademark of Take-Two Interactive.</p>
        </div>
      </Container>
    </footer>
  );
}
