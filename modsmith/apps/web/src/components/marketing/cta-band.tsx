import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CREDITS } from "@modsmith/core";
import { Button } from "@/components/ui/button";
import { Container } from "./section";

export function CtaBand({ loggedIn = false, title = "Ship your next asset today.", description }: { loggedIn?: boolean; title?: string; description?: string }) {
  return (
    <section className="border-t border-border">
      <Container className="py-16 sm:py-20">
        <div className="grid-bg relative overflow-hidden rounded-xl border border-border bg-bg-elevated px-6 py-12 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-accent/15 blur-3xl" aria-hidden />
          <h2 className="relative text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm leading-6 text-fg-muted sm:text-base">
            {description ?? `Sign up in under a minute, get ${CREDITS.SIGNUP_BONUS} free credits and export your first resource without installing anything.`}
          </p>
          <div className="relative mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {loggedIn ? (
              <Button asChild size="lg"><Link href="/app">Open workshop <ArrowRight /></Link></Button>
            ) : (
              <>
                <Button asChild size="lg"><Link href="/register">Create free account <ArrowRight /></Link></Button>
                <Button asChild size="lg" variant="outline"><Link href="/pricing">See pricing</Link></Button>
              </>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
