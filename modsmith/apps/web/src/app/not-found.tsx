import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { BRAND } from "@modsmith/core";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

const links = [
  { href: "/", label: "Home" },
  { href: "/#tools", label: "Tools" },
  { href: "/showcase", label: "Showcase" },
  { href: "/guides", label: "Guides" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs/server-hub", label: "Server Hub docs" },
];

export default function NotFound() {
  return (
    <main id="main" className="grid-bg flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
      <Link href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg">M</span>
        {BRAND.name}
      </Link>
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">This page does not exist</h1>
      <p className="mt-3 max-w-md text-sm text-fg-muted">
        The link may be out of date, or the creation you are looking for is private. Everything published to the showcase stays public; private work is only visible to its creator.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild><Link href="/">Back to home</Link></Button>
        <Button asChild variant="outline"><Link href="/app">Open the workshop</Link></Button>
      </div>
      <nav aria-label="Popular pages" className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-fg-muted">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-fg">{l.label}</Link>
        ))}
      </nav>
    </main>
  );
}
