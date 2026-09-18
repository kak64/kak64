import type { Metadata } from "next";
import { TattooCreatorEditor } from "@/components/tools/tattoo-creator/editor";

export const metadata: Metadata = {
  title: "Tattoo Creator",
  description: "Place tattoos on a 3D ped and export a pack with configs for your framework.",
};

export default function Page() {
  return <TattooCreatorEditor />;
}
