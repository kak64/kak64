"use client";
import * as React from "react";
import { EyeOff, Globe, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublishDialog, UnpublishDialog } from "../creations/creation-dialogs";
import type { CreationRow } from "../creations/types";

/** Edit / unpublish / re-publish controls for one showcase item. */
export function ShowcaseItemActions({ creation }: { creation: CreationRow }) {
  const [dialog, setDialog] = React.useState<"edit" | "unpublish" | null>(null);
  const published = creation.showcase?.status === "PUBLISHED";
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setDialog("edit")}><Pencil /> Edit listing</Button>
      {published
        ? <Button variant="ghost" size="sm" onClick={() => setDialog("unpublish")}><EyeOff /> Unpublish</Button>
        : <Button variant="ghost" size="sm" onClick={() => setDialog("edit")}><Globe /> Publish again</Button>}
      <PublishDialog key={`${creation.id}-${creation.showcase?.status ?? "none"}`} creation={creation} open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} />
      <UnpublishDialog creation={creation} open={dialog === "unpublish"} onOpenChange={(o) => setDialog(o ? "unpublish" : null)} />
    </div>
  );
}
