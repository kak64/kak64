import type { Metadata } from "next";
import { LiveryMapperEditor } from "@/components/tools/livery-mapper/editor";

export const metadata: Metadata = {
  title: "Livery Mapper",
  description: "Design liveries on the car's real UV layout with a 2D canvas and live 3D preview.",
};

export default function Page() {
  return <LiveryMapperEditor />;
}
