import type { Metadata } from "next";
import { VehicleEditorEditor } from "@/components/tools/vehicle-editor/editor";

export const metadata: Metadata = {
  title: "Vehicle Editor",
  description: "Debadge, detrim, swap wheels, tune stance and re-export unlocked add-on vehicles in 3D.",
};

export default function Page() {
  return <VehicleEditorEditor />;
}
