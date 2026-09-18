"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, ExternalLink, Pencil, Download, Copy, RefreshCw, Globe, EyeOff, Trash2 } from "lucide-react";
import { TOOL_BY_SLUG } from "@modsmith/core";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApiAction } from "../hooks";
import { DeleteDialog, PublishDialog, ReexportDialog, RenameDialog, UnpublishDialog } from "./creation-dialogs";
import { ACTIVE_JOB_STATUSES, type CreationRow } from "./types";

type Which = "rename" | "reexport" | "publish" | "unpublish" | "delete" | null;

/** Actions menu for a creation (used on cards, rows and the detail page). */
export function CreationActions({ creation, afterDelete, showOpen = true, triggerVariant = "ghost" }: { creation: CreationRow; afterDelete?: () => void; showOpen?: boolean; triggerVariant?: "ghost" | "outline" }) {
  const router = useRouter();
  const { run, isBusy } = useApiAction();
  const [dialog, setDialog] = React.useState<Which>(null);
  const tool = TOOL_BY_SLUG[creation.toolSlug];
  const jobRunning = !!creation.currentJob && ACTIVE_JOB_STATUSES.includes(creation.currentJob.status);
  const canDownload = !!creation.currentVersion;
  const published = creation.showcase?.status === "PUBLISHED";

  const download = () => run("download", async () => { const r = await api<{ url: string }>(`/api/v1/creations/${creation.id}/download`); window.location.href = r.url; });
  const duplicate = () => run("duplicate", async () => { const r = await api<{ id: string }>(`/api/v1/creations/${creation.id}/duplicate`, { method: "POST" }); router.push(`/app/creations/${r.id}`); }, { success: "Duplicated" });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant={triggerVariant} size="icon-sm" aria-label={`Actions for ${creation.name}`} loading={isBusy("download") || isBusy("duplicate")}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {showOpen ? <DropdownMenuItem asChild><Link href={`/app/creations/${creation.id}`}><ExternalLink /> Open</Link></DropdownMenuItem> : null}
          {tool ? <DropdownMenuItem asChild><Link href={`${tool.href}?creation=${creation.id}`}><Pencil /> Open in editor</Link></DropdownMenuItem> : null}
          <DropdownMenuItem onSelect={() => setDialog("rename")}><Pencil /> Rename</DropdownMenuItem>
          <DropdownMenuItem disabled={!canDownload} onSelect={download}><Download /> Download</DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicate}><Copy /> Duplicate</DropdownMenuItem>
          <DropdownMenuItem disabled={jobRunning} onSelect={() => setDialog("reexport")}><RefreshCw /> Re-export</DropdownMenuItem>
          <DropdownMenuSeparator />
          {published ? <DropdownMenuItem onSelect={() => setDialog("unpublish")}><EyeOff /> Unpublish</DropdownMenuItem> : <DropdownMenuItem disabled={creation.status !== "READY"} onSelect={() => setDialog("publish")}><Globe /> Publish to showcase</DropdownMenuItem>}
          {published ? <DropdownMenuItem onSelect={() => setDialog("publish")}><Pencil /> Edit listing</DropdownMenuItem> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setDialog("delete")}><Trash2 /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog creation={creation} open={dialog === "rename"} onOpenChange={(o) => setDialog(o ? "rename" : null)} />
      <ReexportDialog creation={creation} open={dialog === "reexport"} onOpenChange={(o) => setDialog(o ? "reexport" : null)} />
      <PublishDialog key={`${creation.id}-${creation.showcase?.status ?? "none"}`} creation={creation} open={dialog === "publish"} onOpenChange={(o) => setDialog(o ? "publish" : null)} />
      <UnpublishDialog creation={creation} open={dialog === "unpublish"} onOpenChange={(o) => setDialog(o ? "unpublish" : null)} />
      <DeleteDialog creation={creation} open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)} afterDelete={afterDelete} />
    </>
  );
}
