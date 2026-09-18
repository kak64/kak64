"use client";
import * as React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowRight, Box, Download, FileArchive, SlidersHorizontal, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = { id: string; label: string; title: string; copy: string; icon: React.ComponentType<{ className?: string }>; art: React.ReactNode };

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-bg">
      <div className="flex items-center gap-1.5 border-b border-border bg-bg-elevated px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" /><span className="h-2.5 w-2.5 rounded-full bg-border-strong" /><span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="ml-2 font-mono text-[11px] text-fg-subtle">{label}</span>
      </div>
      <div className="grid-bg aspect-[16/10] w-full">{children}</div>
    </div>
  );
}

const UploadArt = (
  <Frame label="prop-creator / upload">
    <svg viewBox="0 0 480 300" className="h-full w-full" role="img" aria-label="Files being dropped onto an upload zone">
      <rect x="60" y="50" width="360" height="200" rx="12" fill="var(--color-bg-elevated)" stroke="var(--color-accent)" strokeDasharray="8 6" strokeWidth="2" />
      <g fill="var(--color-bg-subtle)" stroke="var(--color-border-strong)">
        <rect x="150" y="100" width="56" height="70" rx="6" /><rect x="212" y="90" width="56" height="70" rx="6" /><rect x="274" y="100" width="56" height="70" rx="6" />
      </g>
      <g fontFamily="ui-monospace, monospace" fontSize="11" fill="var(--color-fg-muted)" textAnchor="middle">
        <text x="178" y="190">chair.fbx</text><text x="240" y="180">chair_d.png</text><text x="302" y="190">chair_n.png</text>
      </g>
      <path d="M240 210 v28 M228 226 l12 12 12-12" stroke="var(--color-accent)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 240 224)" />
      <text x="240" y="70" textAnchor="middle" fontSize="12" fill="var(--color-fg)">Drop model + textures (or a ZIP)</text>
    </svg>
  </Frame>
);

const PreviewArt = (
  <Frame label="prop-creator / viewport">
    <svg viewBox="0 0 480 300" className="h-full w-full" role="img" aria-label="3D viewport with a model next to a ped reference">
      <ellipse cx="240" cy="235" rx="180" ry="18" fill="var(--color-bg-subtle)" />
      <g stroke="var(--color-fg-subtle)" strokeWidth="2" fill="none" strokeLinecap="round">
        <circle cx="130" cy="95" r="12" /><path d="M130 107 v60 M130 125 l-22 30 M130 125 l22 30 M130 167 l-16 50 M130 167 l16 50" />
      </g>
      <text x="130" y="245" textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fill="var(--color-fg-subtle)">1.83 m</text>
      <g strokeLinejoin="round" strokeWidth="2">
        <path d="M250 110 l70 -30 l70 30 l-70 30 z" fill="var(--color-bg-elevated)" stroke="var(--color-accent)" />
        <path d="M250 110 v80 l70 30 v-80 z" fill="var(--color-bg-muted)" stroke="var(--color-accent)" />
        <path d="M320 140 v80 l70 -30 v-80 z" fill="var(--color-bg-subtle)" stroke="var(--color-accent)" />
      </g>
      <g strokeWidth="3" strokeLinecap="round">
        <path d="M320 140 h50" stroke="var(--color-danger)" /><path d="M320 140 v-50" stroke="var(--color-success)" /><path d="M320 140 l-35 20" stroke="var(--color-info)" />
      </g>
      <rect x="18" y="18" width="110" height="22" rx="4" fill="var(--color-bg-elevated)" stroke="var(--color-border)" />
      <text x="28" y="33" fontSize="10" fontFamily="ui-monospace, monospace" fill="var(--color-fg-muted)">scale 1.00 · 2,418 tris</text>
    </svg>
  </Frame>
);

const EditArt = (
  <Frame label="prop-creator / settings">
    <svg viewBox="0 0 480 300" className="h-full w-full" role="img" aria-label="Collision, LOD and texture settings panel">
      <rect x="40" y="30" width="400" height="240" rx="10" fill="var(--color-bg-elevated)" stroke="var(--color-border)" />
      <g fontSize="11" fill="var(--color-fg-muted)">
        <text x="60" y="62">Collision</text><text x="60" y="118">LOD distances</text><text x="60" y="174">Textures</text><text x="60" y="230">Spawn script</text>
      </g>
      <g>
        <rect x="200" y="48" width="64" height="22" rx="4" fill="var(--color-bg-subtle)" stroke="var(--color-border-strong)" /><text x="232" y="63" fontSize="10" textAnchor="middle" fill="var(--color-fg-muted)">None</text>
        <rect x="270" y="48" width="64" height="22" rx="4" fill="var(--color-accent-soft)" stroke="var(--color-accent)" /><text x="302" y="63" fontSize="10" textAnchor="middle" fill="var(--color-accent)">Box</text>
        <rect x="340" y="48" width="64" height="22" rx="4" fill="var(--color-bg-subtle)" stroke="var(--color-border-strong)" /><text x="372" y="63" fontSize="10" textAnchor="middle" fill="var(--color-fg-muted)">Mesh</text>
      </g>
      <g strokeLinecap="round" strokeWidth="4">
        <path d="M200 114 h204" stroke="var(--color-border-strong)" /><path d="M200 114 h120" stroke="var(--color-accent)" />
        <circle cx="320" cy="114" r="7" fill="var(--color-accent)" />
      </g>
      <g fontSize="10" fontFamily="ui-monospace, monospace" fill="var(--color-fg-subtle)"><text x="200" y="134">high 100m</text><text x="330" y="134">low 500m</text></g>
      <g>
        <rect x="200" y="158" width="44" height="30" rx="4" fill="#7c4a2a" /><rect x="250" y="158" width="44" height="30" rx="4" fill="#5c6bb8" /><rect x="300" y="158" width="44" height="30" rx="4" fill="#6b6b6b" />
        <g fontSize="9" fill="var(--color-fg-subtle)" fontFamily="ui-monospace, monospace"><text x="200" y="200">diffuse</text><text x="250" y="200">normal</text><text x="300" y="200">specular</text></g>
      </g>
      <rect x="200" y="218" width="34" height="18" rx="9" fill="var(--color-accent)" /><circle cx="225" cy="227" r="7" fill="white" />
      <text x="244" y="231" fontSize="10" fill="var(--color-fg-muted)">included</text>
    </svg>
  </Frame>
);

const ExportArt = (
  <Frame label="job / progress">
    <svg viewBox="0 0 480 300" className="h-full w-full" role="img" aria-label="Job progress through validation, conversion, collision, LODs and packaging">
      <rect x="40" y="40" width="400" height="220" rx="10" fill="var(--color-bg-elevated)" stroke="var(--color-border)" />
      <g fontSize="11" fill="var(--color-fg)">
        {["Validation", "Converting", "Collision", "LODs", "Packaging"].map((s, i) => (
          <g key={s} transform={`translate(70 ${72 + i * 36})`}>
            <circle cx="0" cy="0" r="7" fill={i < 3 ? "var(--color-success)" : i === 3 ? "var(--color-accent)" : "var(--color-bg-subtle)"} stroke={i > 3 ? "var(--color-border-strong)" : "none"} />
            {i < 3 ? <path d="M-3 0 l2 2 4 -4" stroke="var(--color-bg)" strokeWidth="1.6" fill="none" /> : null}
            <text x="18" y="4" fill={i > 3 ? "var(--color-fg-subtle)" : "var(--color-fg)"}>{s}</text>
            <rect x="150" y="-5" width="220" height="10" rx="5" fill="var(--color-bg-subtle)" />
            <rect x="150" y="-5" width={i < 3 ? 220 : i === 3 ? 140 : 0} height="10" rx="5" fill={i < 3 ? "var(--color-success)" : "var(--color-accent)"} />
          </g>
        ))}
      </g>
      <text x="70" y="248" fontSize="10" fontFamily="ui-monospace, monospace" fill="var(--color-fg-subtle)">40 credits charged only when the build succeeds</text>
    </svg>
  </Frame>
);

const ZipArt = (
  <Frame label="my-creations / chair_v1.zip">
    <svg viewBox="0 0 480 300" className="h-full w-full" role="img" aria-label="Resource ZIP contents: fxmanifest, stream files and a spawn script">
      <rect x="60" y="34" width="360" height="232" rx="10" fill="var(--color-bg-elevated)" stroke="var(--color-border)" />
      <g fontFamily="ui-monospace, monospace" fontSize="12" fill="var(--color-fg-muted)">
        <text x="84" y="66" fill="var(--color-fg)">chair/</text>
        <text x="104" y="92">fxmanifest.lua</text>
        <text x="104" y="118" fill="var(--color-fg)">stream/</text>
        <text x="124" y="144">chair.ydr</text>
        <text x="124" y="170">chair.ytyp</text>
        <text x="124" y="196">chair.ytd</text>
        <text x="104" y="222">client/spawn.lua</text>
      </g>
      <g transform="translate(330 150)">
        <rect x="-44" y="-32" width="88" height="64" rx="8" fill="var(--color-accent)" />
        <path d="M0 -14 v24 M-10 0 l10 10 10 -10" stroke="var(--color-bg)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="330" y="204" textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fill="var(--color-fg-subtle)">ensure chair</text>
    </svg>
  </Frame>
);

const STEPS: Step[] = [
  { id: "upload", label: "Upload", title: "Drop in what you already have", copy: "Models, textures or a whole ZIP. Every file is validated on the server before a worker ever touches it.", icon: Upload, art: UploadArt },
  { id: "preview", label: "3D preview", title: "See it next to a real ped", copy: "A live viewport with a 1.83 m reference so scale, rotation and origin are right before you spend a credit.", icon: Box, art: PreviewArt },
  { id: "edit", label: "Edit", title: "Configure, don't script", copy: "Collision type, LOD distances, texture slots and spawn behaviour are controls, not config files you hand-write.", icon: SlidersHorizontal, art: EditArt },
  { id: "export", label: "Export", title: "Workers do the heavy lifting", copy: "Conversion, collision, LODs and texture packing run in the background. Close the tab; we notify you when it is done.", icon: Download, art: ExportArt },
  { id: "zip", label: "ZIP", title: "A complete resource, not a file", copy: "fxmanifest, stream folder, metadata and a spawn script. Copy it to resources/, add one line to server.cfg and you are done.", icon: FileArchive, art: ZipArt },
];

export function ProductDemo() {
  const [active, setActive] = React.useState(STEPS[0]!.id);
  const index = STEPS.findIndex((s) => s.id === active);
  const next = STEPS[(index + 1) % STEPS.length]!;
  return (
    <Tabs.Root value={active} onValueChange={setActive} orientation="vertical" className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr] lg:gap-10">
      <Tabs.List aria-label="Product walkthrough steps" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <Tabs.Trigger
              key={s.id}
              value={s.id}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-left text-sm transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                "data-[state=active]:border-accent/60 data-[state=active]:bg-accent-soft cursor-pointer",
              )}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-muted font-mono text-[11px] text-fg-muted">{i + 1}</span>
              <span className="flex items-center gap-2 font-medium text-fg"><Icon className="h-4 w-4 text-accent" /> {s.label}</span>
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
      {STEPS.map((s) => (
        <Tabs.Content key={s.id} value={s.id} className="focus-visible:outline-none">
          {s.art}
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-fg">{s.title}</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-fg-muted">{s.copy}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setActive(next.id)} className="shrink-0">
              {index === STEPS.length - 1 ? "Start over" : `Next: ${next.label}`} <ArrowRight />
            </Button>
          </div>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
