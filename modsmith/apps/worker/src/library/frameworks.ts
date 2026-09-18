import type { FivemFramework } from "@modsmith/core";

export interface TattooDefinition {
  id: string;
  name: string;
  /** Collection (resource) name. */
  collection: string;
  /** Overlay hash name, e.g. MODSMITH_TAT_001. */
  overlay: string;
  zone: string; // ZONE_TORSO, ZONE_HEAD, …
  gender: "male" | "female" | "both";
  price?: number;
}

/** Framework-specific config files generated next to a tattoo pack. */
export interface FrameworkFile {
  path: string;
  content: string;
}

const ZONE_TO_ESX: Record<string, string> = {
  ZONE_HEAD: "head",
  ZONE_TORSO: "torso",
  ZONE_LEFT_ARM: "leftArm",
  ZONE_RIGHT_ARM: "rightArm",
  ZONE_LEFT_LEG: "leftLeg",
  ZONE_RIGHT_LEG: "rightLeg",
};

const ZONE_TO_QB: Record<string, string> = {
  ZONE_HEAD: "ZONE_HEAD",
  ZONE_TORSO: "ZONE_TORSO",
  ZONE_LEFT_ARM: "ZONE_LEFT_ARM",
  ZONE_RIGHT_ARM: "ZONE_RIGHT_ARM",
  ZONE_LEFT_LEG: "ZONE_LEFT_LEG",
  ZONE_RIGHT_LEG: "ZONE_RIGHT_LEG",
};

const luaStr = (s: string) => `'${s.replace(/'/g, "\\'")}'`;

/** Files a server owner drops into their framework so the pack shows up in the tattoo shop. */
export function frameworkFiles(framework: FivemFramework, pack: string, tattoos: TattooDefinition[]): FrameworkFile[] {
  switch (framework) {
    case "standalone":
      return [
        {
          path: `configs/standalone/${pack}.json`,
          content: `${JSON.stringify(
            {
              collection: pack,
              tattoos: tattoos.map((t) => ({ id: t.id, label: t.name, collection: t.collection, hashName: t.overlay, zone: t.zone, gender: t.gender, price: t.price ?? 0 })),
            },
            null,
            2,
          )}\n`,
        },
      ];

    case "esx":
      return [
        {
          path: `configs/esx/${pack}.lua`,
          content: [
            `-- ESX tattoo shop entries for ${pack}`,
            "-- Merge these rows into Config.Tattoos of your tattoo shop resource (esx_tattooshop or similar).",
            "Config = Config or {}",
            "Config.Tattoos = Config.Tattoos or {}",
            "",
            ...Object.entries(ZONE_TO_ESX).flatMap(([zone, key]) => {
              const rows = tattoos.filter((t) => t.zone === zone);
              if (!rows.length) return [];
              return [
                `Config.Tattoos[${luaStr(key)}] = Config.Tattoos[${luaStr(key)}] or {}`,
                ...rows.map(
                  (t) =>
                    `table.insert(Config.Tattoos[${luaStr(key)}], { label = ${luaStr(t.name)}, collection = ${luaStr(t.collection)}, name = ${luaStr(t.overlay)}, price = ${t.price ?? 0}, gender = ${luaStr(t.gender)} })`,
                ),
                "",
              ];
            }),
          ].join("\n"),
        },
      ];

    case "qbcore":
    case "qbox":
      return [
        {
          path: `configs/${framework}/${pack}.lua`,
          content: [
            `-- ${framework === "qbox" ? "Qbox" : "QBCore"} tattoo config for ${pack}`,
            "-- Append these entries to Config.Tattoos in qb-tattooshop / ox_appearance.",
            "Config = Config or {}",
            "Config.Tattoos = Config.Tattoos or {}",
            "",
            ...Object.entries(ZONE_TO_QB).flatMap(([zone, key]) => {
              const rows = tattoos.filter((t) => t.zone === zone);
              if (!rows.length) return [];
              return [
                `Config.Tattoos[${luaStr(key)}] = Config.Tattoos[${luaStr(key)}] or {}`,
                ...rows.map(
                  (t) =>
                    `table.insert(Config.Tattoos[${luaStr(key)}], { name = ${luaStr(t.name)}, hashMale = ${luaStr(t.overlay)}, hashFemale = ${luaStr(t.overlay)}, collection = ${luaStr(t.collection)}, price = ${t.price ?? 0} })`,
                ),
                "",
              ];
            }),
          ].join("\n"),
        },
      ];

    case "illenium-appearance":
      return [
        {
          path: `configs/illenium-appearance/tattoos.lua`,
          content: [
            `-- illenium-appearance: add this block to client/tattoos.lua (or Config.Tattoos).`,
            `Tattoos = Tattoos or {}`,
            ...Object.entries(ZONE_TO_QB).flatMap(([zone]) => {
              const rows = tattoos.filter((t) => t.zone === zone);
              if (!rows.length) return [];
              return [
                `Tattoos[${luaStr(zone)}] = Tattoos[${luaStr(zone)}] or {}`,
                ...rows.map(
                  (t) =>
                    `table.insert(Tattoos[${luaStr(zone)}], { Name = ${luaStr(t.name)}, HashNameMale = ${luaStr(t.overlay)}, HashNameFemale = ${luaStr(t.overlay)}, Collection = ${luaStr(t.collection)}, Price = ${t.price ?? 0}, ZoneID = ${luaStr(zone)} })`,
                ),
                "",
              ];
            }),
          ].join("\n"),
        },
      ];

    case "rcore":
      return [
        {
          path: `configs/rcore_tattoos/${pack}.lua`,
          content: [
            `-- rcore_tattoos: place in rcore_tattoos/configs/ and add to Config.CustomTattoos`,
            `Config = Config or {}`,
            `Config.CustomTattoos = Config.CustomTattoos or {}`,
            `Config.CustomTattoos[${luaStr(pack)}] = {`,
            ...tattoos.map(
              (t) =>
                `    { id = ${luaStr(t.id)}, label = ${luaStr(t.name)}, collection = ${luaStr(t.collection)}, hash = ${luaStr(t.overlay)}, zone = ${luaStr(t.zone)}, gender = ${luaStr(t.gender)}, price = ${t.price ?? 0} },`,
            ),
            "}",
            "",
          ].join("\n"),
        },
      ];

    default:
      return [];
  }
}

export function frameworkInstallNotes(framework: FivemFramework, pack: string): string[] {
  switch (framework) {
    case "standalone":
      return [`\`configs/standalone/${pack}.json\` lists every overlay with its collection and hash name for your own menu.`];
    case "esx":
      return [`Merge \`configs/esx/${pack}.lua\` into your tattoo shop's \`Config.Tattoos\` table.`];
    case "qbcore":
      return [`Append \`configs/qbcore/${pack}.lua\` to \`qb-tattooshop/config.lua\`.`];
    case "qbox":
      return [`Append \`configs/qbox/${pack}.lua\` to your Qbox appearance config.`];
    case "illenium-appearance":
      return [`Copy the block from \`configs/illenium-appearance/tattoos.lua\` into illenium-appearance's tattoo list.`];
    case "rcore":
      return [`Drop \`configs/rcore_tattoos/${pack}.lua\` into \`rcore_tattoos/configs/\` and restart the resource.`];
    default:
      return [];
  }
}
