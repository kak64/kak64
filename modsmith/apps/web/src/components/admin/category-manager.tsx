"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminAction } from "./use-admin-action";

/** Create a guide category (POST /api/v1/admin/guide-categories). */
export function NewCategoryButton() {
  const { run, isBusy } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState(0);

  const create = async () => {
    const res = await run("category", () => api("/api/v1/admin/guide-categories", {
      json: { slug: slug.trim() || slugify(name), name: name.trim(), description: description.trim() || null, sortOrder },
    }), { success: "Category created" });
    if (res !== undefined) { setOpen(false); setName(""); setSlug(""); setDescription(""); setSortOrder(0); }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus />New category</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>New guide category</DialogTitle>
            <DialogDescription>Categories group guides on the public guides index.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name" htmlFor="cat-name"><Input id="cat-name" value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} /></Field>
            <Field label="Slug" htmlFor="cat-slug" hint="lowercase-with-dashes"><Input id="cat-slug" value={slug} onChange={(e) => setSlug(e.target.value)} /></Field>
            <Field label="Description" htmlFor="cat-desc"><Input id="cat-desc" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field label="Sort order" htmlFor="cat-sort"><Input id="cat-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={isBusy("category")} disabled={!name.trim()} onClick={() => void create()}>Create category</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
