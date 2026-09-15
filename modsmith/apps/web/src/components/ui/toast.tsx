"use client";
import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; title: string; description?: string; variant?: "default" | "success" | "danger" };
type Ctx = { toast: (t: Omit<ToastItem, "id">) => void };
const ToastContext = React.createContext<Ctx>({ toast: () => {} });

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const toast = React.useCallback((t: Omit<ToastItem, "id">) => setItems((prev) => [...prev, { ...t, id: Date.now() + Math.random() }]), []);
  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitives.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((t) => (
          <ToastPrimitives.Root key={t.id} onOpenChange={(open) => { if (!open) setItems((p) => p.filter((x) => x.id !== t.id)); }} className={cn("group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-md border p-4 shadow-lg bg-bg-elevated", t.variant === "success" && "border-success/40", t.variant === "danger" && "border-danger/40", (!t.variant || t.variant === "default") && "border-border")}>
            <div className="grid gap-1">
              <ToastPrimitives.Title className="text-sm font-semibold">{t.title}</ToastPrimitives.Title>
              {t.description ? <ToastPrimitives.Description className="text-sm text-fg-muted">{t.description}</ToastPrimitives.Description> : null}
            </div>
            <ToastPrimitives.Close className="rounded-md p-1 text-fg-subtle hover:text-fg" aria-label="Dismiss"><X className="h-4 w-4" /></ToastPrimitives.Close>
          </ToastPrimitives.Root>
        ))}
        <ToastPrimitives.Viewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-[380px]" />
      </ToastPrimitives.Provider>
    </ToastContext.Provider>
  );
}
