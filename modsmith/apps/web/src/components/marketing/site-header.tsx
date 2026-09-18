import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav-links";
import { Container } from "./section";

export function SiteHeader({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Button asChild size="sm" className="hidden md:inline-flex"><Link href="/app">Open workshop</Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex"><Link href="/login">Log in</Link></Button>
              <Button asChild size="sm" className="hidden md:inline-flex"><Link href="/register">Get started</Link></Button>
            </>
          )}
          <MobileNav loggedIn={loggedIn} />
        </div>
      </Container>
    </header>
  );
}
