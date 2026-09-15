import type { Metadata } from "next";
import { CarImporterEditor } from "@/components/tools/car-importer/editor";

export const metadata: Metadata = {
  title: "Add-on Car Importer",
  description: "Paste a GTA5-Mods link and receive a ready-to-stream add-on vehicle resource.",
};

export default function Page() {
  return <CarImporterEditor />;
}
