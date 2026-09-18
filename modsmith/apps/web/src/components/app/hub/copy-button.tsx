"use client";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { copyText } from "../hooks";

export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", size = "sm", variant = "outline", className, iconOnly, toastTitle }: { value: string; label?: string; copiedLabel?: string; size?: ButtonProps["size"]; variant?: ButtonProps["variant"]; className?: string; iconOnly?: boolean; toastTitle?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t); }, [copied]);
  return (
    <Button type="button" size={iconOnly ? "icon-sm" : size} variant={variant} className={className} aria-label={iconOnly ? label : undefined}
      onClick={async () => { const ok = await copyText(value); setCopied(ok); toast(ok ? { title: toastTitle ?? copiedLabel, variant: "success" } : { title: "Could not copy", description: "Copy it manually instead.", variant: "danger" }); }}>
      {copied ? <Check /> : <Copy />}{iconOnly ? null : copied ? copiedLabel : label}
    </Button>
  );
}
