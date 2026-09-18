"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiAction } from "../hooks";

export function DeleteServerDialog({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const { run, isBusy } = useApiAction();
  const del = async () => {
    const r = await run("delete", () => api(`/api/v1/server-hub/projects/${projectId}`, { method: "DELETE" }), { success: "Server deleted" });
    if (r !== undefined) { setOpen(false); router.push("/app/hub"); router.refresh(); }
  };
  return (
    <>
      <Button variant="outline" size="sm" className="text-danger" onClick={() => setOpen(true)}><Trash2 /> Delete server</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Delete "{name}"?</DialogTitle><DialogDescription>All logs, media and tokens for this server are permanently deleted and the storage is freed. This cannot be undone.</DialogDescription></DialogHeader>
          <Field label={`Type the server name to confirm`} htmlFor="del-confirm"><Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} autoComplete="off" /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" disabled={confirm !== name} loading={isBusy("delete")} onClick={del}>Delete permanently</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
