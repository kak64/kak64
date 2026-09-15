import * as React from "react";
import { Container } from "./section";
import { DocsSidebar } from "./docs";
import { formatDate } from "@/lib/utils";

export function LegalLayout({ title, description, updated, toc, children }: { title: string; description: string; updated: Date; toc: { id: string; label: string }[]; children: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-border bg-bg-elevated/40">
        <Container className="py-12 sm:py-16">
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-fg-muted">{description}</p>
          <p className="mt-4 text-xs text-fg-subtle">Last updated <time dateTime={updated.toISOString()}>{formatDate(updated)}</time></p>
        </Container>
      </div>
      <Container className="grid gap-10 py-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="order-last lg:order-none"><DocsSidebar items={toc} title="Sections" /></aside>
        <article className="min-w-0 max-w-3xl">{children}</article>
      </Container>
    </>
  );
}

export function Clause({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-24 first:mt-0">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight text-fg">
        <span className="mr-2 font-mono text-sm text-accent">{n}.</span>{title}
      </h2>
      <div className="mt-3 space-y-4 text-sm leading-7 text-fg-muted [&_strong]:font-semibold [&_strong]:text-fg [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-fg">
        {children}
      </div>
    </section>
  );
}
