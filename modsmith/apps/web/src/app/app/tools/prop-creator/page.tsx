import type { Metadata } from "next";
import { PropCreatorEditor } from "@/components/tools/prop-creator/editor";

export const metadata: Metadata = {
  title: "Prop Creator",
  description: "Turn OBJ, FBX, glTF or DAE models into drag-and-drop FiveM props with collision, LODs and a spawn script.",
};

export default function PropCreatorPage() {
  return <PropCreatorEditor />;
}
