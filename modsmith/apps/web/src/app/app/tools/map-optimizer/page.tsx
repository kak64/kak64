import type { Metadata } from "next";
import { OptimizerEditor } from "@/components/tools/optimizer/editor";

export const metadata: Metadata = {
  title: "Map / MLO Optimizer",
  description: "Find oversized textures, unused assets and LOD issues in MLO and map resources.",
};

export default function Page() {
  return <OptimizerEditor slug="map-optimizer" kind="map" title="Map / MLO Optimizer" />;
}
