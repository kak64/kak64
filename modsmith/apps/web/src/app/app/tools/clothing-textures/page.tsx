import type { Metadata } from "next";
import { ClothingTexturesEditor } from "@/components/tools/clothing-textures/editor";

export const metadata: Metadata = {
  title: "Clothing Textures",
  description: "Paint directly onto 3D garments from your own files or the built-in garment library.",
};

export default function Page() {
  return <ClothingTexturesEditor />;
}
