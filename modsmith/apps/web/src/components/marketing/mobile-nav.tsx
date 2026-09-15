"use client";
import * as React from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "./logo";
import { NAV_LINKS } from "./nav-links";

export function MobileNav({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,90vw)] flex-col border-l border-border bg-bg-elevated p-5 shadow-xl focus:outline-none md:hidden" aria-describedby={undefined}>
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="flex items-center gap-2 font-semibold">
              <LogoMark className="h-6 w-6" /> Menu
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="Mobile" className="mt-6 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-5">
            {loggedIn ? (
              <Button asChild><Link href="/app" onClick={() => setOpen(false)}>Open workshop</Link></Button>
            ) : (
              <>
                <Button asChild variant="outline"><Link href="/login" onClick={() => setOpen(false)}>Log in</Link></Button>
                <Button asChild><Link href="/register" onClick={() => setOpen(false)}>Get started</Link></Button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
