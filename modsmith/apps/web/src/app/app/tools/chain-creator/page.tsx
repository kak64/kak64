import type { Metadata } from "next";
import { ChainCreatorEditor } from "@/components/tools/chain-creator/editor";

export const metadata: Metadata = {
  title: "Chain & Accessory Creator",
  description: "Build chains, pendants, 3D lettering and accessories in a live 3D preview.",
};

export default function Page() {
  return <ChainCreatorEditor />;
}
