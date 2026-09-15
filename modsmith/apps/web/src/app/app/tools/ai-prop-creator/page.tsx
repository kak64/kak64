import type { Metadata } from "next";
import { AiPropCreatorEditor } from "@/components/tools/ai-prop-creator/editor";

export const metadata: Metadata = {
  title: "AI Prop Creator",
  description: "Generate a textured 3D prop from a single image, then finish it in the Prop Creator.",
};

export default function Page() {
  return <AiPropCreatorEditor />;
}
