import type { Metadata } from "next";
import { OptimizerEditor } from "@/components/tools/optimizer/editor";

export const metadata: Metadata = {
  title: "Vehicle Optimizer",
  description: "Cut vehicle VRAM by fixing 4K textures, mipmaps and LODs without touching geometry.",
};

export default function Page() {
  return <OptimizerEditor slug="vehicle-optimizer" kind="vehicle" title="Vehicle Optimizer" />;
}
