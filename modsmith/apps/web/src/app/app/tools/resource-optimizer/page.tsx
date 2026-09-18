import type { Metadata } from "next";
import { OptimizerEditor } from "@/components/tools/optimizer/editor";

export const metadata: Metadata = {
  title: "Resource Optimizer",
  description: "Analyze any resource for VRAM cost, oversized textures and missing LODs — then fix it.",
};

export default function Page() {
  return <OptimizerEditor slug="resource-optimizer" kind="general" title="Resource Optimizer" />;
}
