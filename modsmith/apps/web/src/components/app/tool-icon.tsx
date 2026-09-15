import { Box, Sparkles, Car, Wrench, Palette, Layers, Shirt, Crosshair, Feather, ScanFace, Link as LinkIcon, Server, Gauge, CarFront, Map as MapIcon, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { Box, Sparkles, Car, Wrench, Palette, Layers, Shirt, Crosshair, Feather, ScanFace, Link: LinkIcon, Server, Gauge, CarFront, Map: MapIcon };

/** Renders a tool's lucide icon by name (falls back to a box). Safe in server and client components. */
export function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Box;
  return <Icon className={className} aria-hidden />;
}
