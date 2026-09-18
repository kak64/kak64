"use client";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useToast } from "@/components/ui/toast";

const MESSAGES: Record<string, { title: string; description?: string; variant?: "default" | "success" | "danger" }> = {
  connected: { title: "Discord connected", description: "You'll get job notifications in your DMs.", variant: "success" },
  already_linked: { title: "That Discord account is already linked", description: "It belongs to another Modsmith account. Disconnect it there first.", variant: "danger" },
  invalid_state: { title: "Discord sign-in expired", description: "Start the connection again.", variant: "danger" },
  error: { title: "Discord connection failed", description: "Something went wrong on Discord's side. Try again in a moment.", variant: "danger" },
  unconfigured: { title: "Discord is not configured", description: "Discord linking is unavailable in this environment.", variant: "danger" },
  rate_limited: { title: "Too many attempts", description: "Wait a few minutes before trying to connect again.", variant: "danger" },
};

/** Turns the ?discord=…&bonus=… redirect query into a toast, then cleans the URL. */
export function DiscordStatusToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const shown = React.useRef(false);
  const status = params.get("discord");
  const bonus = params.get("bonus");

  React.useEffect(() => {
    if (!status || shown.current) return;
    shown.current = true;
    const m = MESSAGES[status];
    if (m) toast({ title: m.title, description: status === "connected" && bonus ? `${bonus} bonus credits added.` : m.description, variant: m.variant });
    const sp = new URLSearchParams(params.toString());
    sp.delete("discord"); sp.delete("bonus");
    const q = sp.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [status, bonus, params, pathname, router, toast]);
  return null;
}
