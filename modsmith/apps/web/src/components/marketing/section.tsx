import * as React from "react";
import { cn } from "@/lib/utils";

export function Container({ className, children, as: Comp = "div" }: { className?: string; children: React.ReactNode; as?: "div" | "section" | "header" | "footer" | "nav" | "article" }) {
  return <Comp className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</Comp>;
}

export function Section({ id, className, children, tone = "default" }: { id?: string; className?: string; children: React.ReactNode; tone?: "default" | "elevated" }) {
  return (
    <section id={id} className={cn("scroll-mt-20 py-16 sm:py-20", tone === "elevated" && "border-y border-border bg-bg-elevated/60", className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, description, align = "left", className, action }: { eyebrow?: string; title: string; description?: string; align?: "left" | "center"; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", align === "center" && "text-center sm:flex-col sm:items-center", className)}>
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p> : null}
        <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h2>
        {description ? <p className="mt-3 text-base leading-7 text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-bg-elevated/40">
      <Container className="py-12 sm:py-16">
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p> : null}
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-base leading-7 text-fg-muted">{description}</p> : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </Container>
    </div>
  );
}
