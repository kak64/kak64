import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, invalid, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "flex h-9 w-full rounded-md border border-border bg-bg-elevated px-3 py-1 text-sm text-fg shadow-sm transition-colors placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium",
      invalid && "border-danger focus-visible:border-danger",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn("flex min-h-[80px] w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg shadow-sm placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none disabled:opacity-50", invalid && "border-danger", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea };
