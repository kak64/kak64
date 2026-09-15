import type { Metadata } from "next";
import { FaceSkinCreatorEditor } from "@/components/tools/face-skin-creator/editor";

export const metadata: Metadata = {
  title: "Face Skin Creator",
  description: "Turn a headshot into a FiveM-compatible face texture with alignment and skin controls.",
};

export default function Page() {
  return <FaceSkinCreatorEditor />;
}
