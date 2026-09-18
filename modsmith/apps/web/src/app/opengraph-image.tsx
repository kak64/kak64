import { ImageResponse } from "next/og";

export const alt = "Modsmith — build FiveM assets in your browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Generated Open Graph card, so no binary asset needs to live in the repo. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0a0c10", padding: 72, fontFamily: "sans-serif", color: "#e7eaf0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#10131a" />
            <path d="M14 44 L32 14 L50 44 Z" fill="none" stroke="#f97316" strokeWidth="5" strokeLinejoin="round" />
            <path d="M22 44 L32 28 L42 44" fill="none" stroke="#e7eaf0" strokeWidth="4" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 40, fontWeight: 700 }}>Modsmith</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5 }}>Build FiveM assets in your browser</span>
          <span style={{ fontSize: 30, color: "#98a2b3", lineHeight: 1.35 }}>Props, vehicles, liveries, clothing, weapon skins and tattoos. No Blender, no CodeWalker, no Windows.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24, color: "#f97316" }}>
          <span style={{ borderTop: "2px solid #232935", paddingTop: 20, width: "100%" }}>Upload · Configure · Preview · Export</span>
        </div>
      </div>
    ),
    size,
  );
}
