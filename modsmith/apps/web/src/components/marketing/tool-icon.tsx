import { Box, BookOpen, Car, CarFront, Crosshair, Feather, FileBox, Gauge, Layers, LifeBuoy, Link as LinkIcon, Map as MapIcon, Palette, ScanFace, Server, Shirt, Sparkles, Wrench, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Box, BookOpen, Car, CarFront, Crosshair, Feather, FileBox, Gauge, Layers, LifeBuoy, Link: LinkIcon, Map: MapIcon, Palette, ScanFace, Server, Shirt, Sparkles, Wrench,
};

export function iconFor(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Box;
}

export function ToolIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = iconFor(name);
  return <Icon className={className} aria-hidden />;
}
