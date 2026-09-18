import type { Metadata } from "next";
import { RetextureEditor } from "@/components/tools/retexture/editor";

export const metadata: Metadata = {
  title: "Retexture",
  description: "Click any surface of a prop, MLO or vehicle and swap its texture.",
};

export default function Page() {
  return <RetextureEditor />;
}
