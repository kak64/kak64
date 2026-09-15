import type { Metadata } from "next";
import { WeaponSkinsEditor } from "@/components/tools/weapon-skins/editor";

export const metadata: Metadata = {
  title: "Weapon Skins",
  description: "Design camo skins for vanilla weapons with UV guides and batch export.",
};

export default function Page() {
  return <WeaponSkinsEditor />;
}
