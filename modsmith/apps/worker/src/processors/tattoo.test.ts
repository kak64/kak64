import { describe, expect, it } from "vitest";
import { parseXml, findAll, findFirst } from "../lib/xml";
import { frameworkFiles } from "../library/frameworks";
import { buildOverlayXml, ZONES, type OverlayEntry } from "./tattoo";

const entries: OverlayEntry[] = [
  {
    id: "skull",
    name: "Skull & Roses",
    collection: "ms_tats",
    overlay: "MS_TATS_SKULL",
    zone: ZONES.torso.zone,
    gender: "both",
    uvPos: [0.5, 0.5],
    scale: 1.25,
    rotation: 15,
    textureDict: "ms_tats_skull",
    textureName: "ms_tats_skull_diff",
  },
  {
    id: "sleeve",
    name: "Sleeve",
    collection: "ms_tats",
    overlay: "MS_TATS_SLEEVE",
    zone: ZONES.left_arm.zone,
    gender: "male",
    uvPos: [0.275, 0.5],
    scale: 1,
    rotation: 0,
    textureDict: "ms_tats_sleeve",
    textureName: "ms_tats_sleeve_diff",
  },
];

describe("buildOverlayXml", () => {
  const xml = buildOverlayXml("ms_tats", entries);
  const doc = parseXml(xml);

  it("emits a well-formed PedDecorationCollection", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(findFirst(doc, "PedDecorationCollection")).toBeDefined();
    expect(findFirst(doc, "presetName")!.text.trim()).toBe("ms_tats");
    expect(findAll(doc, "Item")).toHaveLength(2);
  });

  it("carries collection, hash, texture and zone for each tattoo", () => {
    const items = findAll(doc, "Item");
    const first = items[0]!;
    const value = (tag: string) => first.children.find((c) => c.tag === tag)!.text.trim();
    expect(value("collection")).toBe("ms_tats");
    expect(value("preset")).toBe("MS_TATS_SKULL");
    expect(value("nameHash")).toBe("MS_TATS_SKULL");
    expect(value("txdHash")).toBe("ms_tats_skull");
    expect(value("txtHash")).toBe("ms_tats_skull_diff");
    expect(value("zone")).toBe("ZONE_TORSO");
    expect(value("type")).toBe("TYPE_TATTOO");
  });

  it("maps gender onto the RAGE enum", () => {
    const items = findAll(doc, "Item");
    expect(items[0]!.children.find((c) => c.tag === "gender")!.text.trim()).toBe("GENDER_DONTCARE");
    expect(items[1]!.children.find((c) => c.tag === "gender")!.text.trim()).toBe("GENDER_MALE");
  });

  it("writes uv position, scale and rotation as attributes", () => {
    const item = findAll(doc, "Item")[0]!;
    const uv = item.children.find((c) => c.tag === "uvPos")!;
    expect(Number(uv.attrs.x)).toBeCloseTo(0.5, 4);
    const scale = item.children.find((c) => c.tag === "scale")!;
    expect(Number(scale.attrs.x)).toBeCloseTo(1.25, 4);
    expect(Number(item.children.find((c) => c.tag === "rotation")!.attrs.value)).toBeCloseTo(15, 2);
  });

  it("escapes values that would break the document", () => {
    const xmlEscaped = buildOverlayXml("pack<&>", [{ ...entries[0]!, name: 'a "quoted" name' }]);
    expect(xmlEscaped).toContain("<presetName>pack&lt;&amp;&gt;</presetName>");
    expect(() => parseXml(xmlEscaped)).not.toThrow();
  });
});

describe("zone table", () => {
  it("gives every zone a RAGE name, a texture size and a UV rect", () => {
    for (const [key, spec] of Object.entries(ZONES)) {
      expect(spec.zone.startsWith("ZONE_")).toBe(true);
      expect([512, 1024]).toContain(spec.size);
      expect(spec.uv).toHaveLength(4);
      expect(spec.uv.every((n) => n >= 0 && n <= 1)).toBe(true);
      expect(key.length).toBeGreaterThan(2);
    }
  });
});

describe("framework configs", () => {
  const definitions = entries.map((e) => ({ id: e.id, name: e.name, collection: e.collection, overlay: e.overlay, zone: e.zone, gender: e.gender }));

  it("emits JSON for standalone servers", () => {
    const files = frameworkFiles("standalone", "ms_tats", definitions);
    expect(files).toHaveLength(1);
    const parsed = JSON.parse(files[0]!.content) as { collection: string; tattoos: { hashName: string }[] };
    expect(parsed.collection).toBe("ms_tats");
    expect(parsed.tattoos.map((t) => t.hashName)).toEqual(["MS_TATS_SKULL", "MS_TATS_SLEEVE"]);
  });

  it("emits Lua tables for ESX, QBCore, Qbox, illenium and rcore", () => {
    for (const framework of ["esx", "qbcore", "qbox", "illenium-appearance", "rcore"] as const) {
      const files = frameworkFiles(framework, "ms_tats", definitions);
      expect(files.length).toBeGreaterThan(0);
      const lua = files[0]!.content;
      expect(lua).toContain("MS_TATS_SKULL");
      expect(lua).toContain("ms_tats");
      expect(files[0]!.path.endsWith(".lua")).toBe(true);
    }
  });

  it("groups ESX entries by body zone", () => {
    const lua = frameworkFiles("esx", "ms_tats", definitions)[0]!.content;
    expect(lua).toContain("Config.Tattoos['torso']");
    expect(lua).toContain("Config.Tattoos['leftArm']");
  });
});
