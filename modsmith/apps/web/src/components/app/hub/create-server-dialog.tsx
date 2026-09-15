"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api, ApiClientError, fieldErrors } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Field } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ApiErrorAlert } from "../api-error-alert";

const FRAMEWORKS = [{ v: "standalone", l: "Standalone" }, { v: "esx", l: "ESX" }, { v: "qbcore", l: "QBCore" }, { v: "qbox", l: "Qbox" }];

export function CreateServerDialog({ label = "Create server", variant = "default" }: { label?: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", description: "", framework: "standalone" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<unknown>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setErrors({});
    try {
      const r = await api<{ id: string }>("/api/v1/server-hub/projects", { json: { name: form.name.trim(), description: form.description.trim() || undefined, framework: form.framework } });
      toast({ title: "Server created", description: "Generate a token to start sending logs.", variant: "success" });
      setOpen(false); setForm({ name: "", description: "", framework: "standalone" });
      router.push(`/app/hub/servers/${r.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) { router.push("/login"); return; }
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setError(err);
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><Plus /> {label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader><DialogTitle>Create a server</DialogTitle><DialogDescription>Each server gets its own tokens, logs and media storage.</DialogDescription></DialogHeader>
            <Field label="Name" htmlFor="srv-name" error={errors.name}><Input id="srv-name" value={form.name} minLength={2} maxLength={48} required autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Los Santos RP" /></Field>
            <Field label="Description" htmlFor="srv-desc" hint="Optional." error={errors.description}><Textarea id="srv-desc" value={form.description} maxLength={300} rows={3} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Framework" htmlFor="srv-fw" error={errors.framework}><NativeSelect id="srv-fw" value={form.framework} onChange={(e) => setForm({ ...form, framework: e.target.value })}>{FRAMEWORKS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}</NativeSelect></Field>
            <ApiErrorAlert error={error} />
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={form.name.trim().length < 2}>Create server</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
