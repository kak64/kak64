import { describe, expect, it } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ybnXml, ydrXml, ytdXml, ytypXml, xmlEscape, xmlFormatName, num } from "./xml.js";
import { readYdr } from "./drawable.js";
import { writeYdr, type DrawableInput } from "./writer.js";
import { readYbn, writeYbn } from "./bounds.js";
import { readYtd, writeYtd } from "./ytd.js";
import { encodeDds } from "./dds.js";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

/** Every emitter must produce well-formed XML. */
function parse(xml: string): Record<string, any> {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`invalid XML: ${JSON.stringify(validation)}`);
  return parser.parse(xml) as Record<string, any>;
}

const drawableInput: DrawableInput = {
  name: "prop_xml_test",
  shaders: [
    {
      name: "normal_spec",
      textures: { DiffuseSampler: "tex_d", BumpSampler: "tex_n", SpecSampler: "tex_s" },
      params: { bumpiness: [1.5, 0, 0, 0], detailSettings: [1, 2, 3, 4, 5, 6, 7, 8] },
    },
    { name: "default", textures: { DiffuseSampler: "tex_lod" } },
  ],
  lods: [
    {
      distance: 50,
      meshes: [
        {
          positions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          uvs: [[0, 0, 1, 0, 1, 1]],
          colors: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
          indices: [0, 1, 2],
          shaderIndex: 0,
        },
      ],
    },
    { distance: 120, meshes: [{ positions: [0, 0, 0, 2, 0, 0, 2, 2, 0], indices: [0, 1, 2], shaderIndex: 1 }] },
  ],
};

describe("helpers", () => {
  it("escapes XML special characters", () => {
    expect(xmlEscape(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
  });
  it("formats floats without exponent drift and normalises -0", () => {
    expect(num(1.5)).toBe("1.5");
    expect(num(-0)).toBe("0");
    expect(num(NaN)).toBe("0");
    expect(num(Infinity)).toBe("0");
  });
  it("maps formats to CodeWalker's D3DFMT names", () => {
    expect(xmlFormatName("DXT5")).toBe("D3DFMT_DXT5");
    expect(xmlFormatName("BC7")).toBe("D3DFMT_BC7");
    expect(xmlFormatName("BC5")).toBe("D3DFMT_ATI2");
  });
});

describe("ydrXml", () => {
  const drawable = readYdr(writeYdr(drawableInput));
  const xml = ydrXml(drawable);
  const doc = parse(xml);

  it("starts with the XML declaration and a Drawable root", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(doc.Drawable).toBeDefined();
  });

  it("writes the name, bounds and LOD distances", () => {
    expect(doc.Drawable.Name).toBe("prop_xml_test");
    expect(doc.Drawable.LodDistHigh["@value"]).toBe("50");
    expect(doc.Drawable.LodDistMed["@value"]).toBe("120");
    expect(doc.Drawable.BoundingBoxMax["@x"]).toBe("2");
    expect(doc.Drawable.BoundingSphereRadius["@value"]).toBeDefined();
  });

  it("writes shaders with texture and vector parameters", () => {
    const shaders = doc.Drawable.ShaderGroup.Shaders.Item;
    expect(shaders).toHaveLength(2);
    expect(shaders[0].Name).toBe("normal_spec");
    expect(shaders[0].FileName).toBe("normal_spec.sps");
    const params = shaders[0].Parameters.Item;
    const diffuse = params.find((p: any) => p["@name"] === "DiffuseSampler");
    expect(diffuse["@type"]).toBe("Texture");
    expect(diffuse.Name).toBe("tex_d");
    const bumpiness = params.find((p: any) => p["@name"] === "bumpiness");
    expect(bumpiness["@type"]).toBe("Vector");
    expect(bumpiness["@x"]).toBe("1.5");
    const detail = params.find((p: any) => p["@name"] === "detailSettings");
    expect(detail["@type"]).toBe("Array");
    expect(detail.Value).toHaveLength(2);
  });

  it("writes one DrawableModels element per LOD with geometry data", () => {
    const high = doc.Drawable.DrawableModelsHigh.Item;
    expect(high.ShaderIndex).toBeUndefined();
    const geometry = high.Geometries.Item;
    expect(geometry.ShaderIndex["@value"]).toBe("0");
    const layout = geometry.VertexBuffer.Layout;
    expect(layout["@type"]).toBe("GTAV1");
    expect(layout).toHaveProperty("Position");
    expect(layout).toHaveProperty("Normal");
    expect(layout).toHaveProperty("Colour0");
    expect(layout).toHaveProperty("TexCoord0");
    expect(String(geometry.VertexBuffer.Data)).toContain("255 0 0 255");
    expect(String(geometry.IndexBuffer.Data).trim()).toBe("0 1 2");
    expect(doc.Drawable.DrawableModelsMedium.Item.Geometries.Item.ShaderIndex["@value"]).toBe("1");
    expect(doc.Drawable.DrawableModelsLow).toBe("");
    expect(doc.Drawable.DrawableModelsVeryLow).toBe("");
  });

  it("writes one vertex line per vertex with each component group separated", () => {
    const lines = xml
      .split("\n")
      .filter((l) => /^\s+-?\d/.test(l) && l.includes("   "));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]!.trim().split("   ")).toHaveLength(4); // P / N / C / UV
  });

  it("emits an empty TextureDictionary by default and items when given textures", () => {
    expect(xml).toContain("<TextureDictionary />");
    const textures = readYtd(
      writeYtd([
        { name: "tex_d", dds: encodeDds(new Uint8Array(8 * 8 * 4).fill(200), 8, 8, { format: "DXT5", mips: true }) },
      ]),
    );
    const withTextures = parse(ydrXml(drawable, { embeddedTextures: textures }));
    const item = withTextures.Drawable.ShaderGroup.TextureDictionary.Item;
    expect(item.Name).toBe("tex_d");
    expect(item.Format).toBe("D3DFMT_DXT5");
    expect(item.FileName).toBe("tex_d.dds");
  });
});

describe("ytdXml", () => {
  const textures = readYtd(
    writeYtd([
      { name: "body_d", dds: encodeDds(new Uint8Array(32 * 32 * 4).fill(180), 32, 32, { format: "DXT5", mips: true }) },
      { name: "body_n", dds: encodeDds(new Uint8Array(16 * 16 * 4).fill(90), 16, 16, { format: "DXT1" }) },
    ]),
  );

  it("writes one Item per texture with dimensions, mips, format and a DDS file name", () => {
    const doc = parse(ytdXml(textures));
    const items = doc.TextureDictionary.Item;
    expect(items).toHaveLength(2);
    const body = items.find((i: any) => i.Name === "body_d");
    expect(body.Width["@value"]).toBe("32");
    expect(body.Height["@value"]).toBe("32");
    expect(body.MipLevels["@value"]).toBe("6");
    expect(body.Format).toBe("D3DFMT_DXT5");
    expect(body.FileName).toBe("body_d.dds");
  });

  it("supports a file name prefix and an empty dictionary", () => {
    expect(ytdXml(textures, { fileNamePrefix: "textures/" })).toContain(
      "<FileName>textures/body_d.dds</FileName>",
    );
    expect(parse(ytdXml([]))).toHaveProperty("TextureDictionary");
  });
});

describe("ytypXml", () => {
  const xml = ytypXml({
    name: "prop_pack",
    archetypes: [
      {
        name: "prop_xml_test",
        txdName: "prop_pack",
        lodDist: 120,
        bbMin: [-1, -1, 0],
        bbMax: [1, 1, 2],
        bsCenter: [0, 0, 1],
        bsRadius: 1.8,
        flags: 32,
        assetType: "ASSET_TYPE_DRAWABLE",
      },
    ],
  });
  const doc = parse(xml);

  it("writes a CMapTypes document with a CBaseArchetypeDef item", () => {
    const item = doc.CMapTypes.archetypes.Item;
    expect(item["@type"]).toBe("CBaseArchetypeDef");
    expect(item.name).toBe("prop_xml_test");
    expect(item.textureDictionary).toBe("prop_pack");
    expect(item.physicsDictionary).toBe("prop_xml_test");
    expect(item.assetType).toBe("ASSET_TYPE_DRAWABLE");
    expect(item.assetName).toBe("prop_xml_test");
    expect(item.lodDist["@value"]).toBe("120");
    expect(item.flags["@value"]).toBe("32");
    expect(item.bbMax["@z"]).toBe("2");
    expect(item.bsRadius["@value"]).toBe("1.8");
  });

  it("names the archive and emits the trailing empty sections", () => {
    expect(doc.CMapTypes.name).toBe("prop_pack");
    expect(doc.CMapTypes).toHaveProperty("dependencies");
    expect(doc.CMapTypes).toHaveProperty("compositeEntityTypes");
  });

  it("handles an archetype-free file and rejects a missing name", () => {
    expect(parse(ytypXml({ name: "empty", archetypes: [] }))).toHaveProperty("CMapTypes");
    expect(() => ytypXml({ name: "", archetypes: [] })).toThrow(/needs a name/);
  });
});

describe("ybnXml", () => {
  const bound = readYbn(
    writeYbn({
      children: [
        { type: "box", min: [-1, -1, -1], max: [1, 1, 1], materialIndex: 1 },
        {
          type: "bvh",
          positions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
          indices: [0, 1, 2],
          materialIndex: 2,
        },
      ],
      materials: [0x10, 0x20, 0x30],
    }),
  );
  const doc = parse(ybnXml(bound));

  it("writes a BoundsFile with a Composite root", () => {
    expect(doc.BoundsFile.Bounds["@type"]).toBe("Composite");
    expect(doc.BoundsFile.Bounds.BoxMin["@x"]).toBeDefined();
    expect(doc.BoundsFile.Bounds.SphereRadius["@value"]).toBeDefined();
  });

  it("writes children with their types, materials and polygons", () => {
    const children = doc.BoundsFile.Bounds.Children.Item;
    expect(children).toHaveLength(2);
    expect(children[0]["@type"]).toBe("Box");
    expect(children[0].MaterialIndex["@value"]).toBe("1");
    expect(children[1]["@type"]).toBe("BVH");
    expect(children[1].Polygons.Triangle["@v1"]).toBe("0");
    expect(children[1].Polygons.Triangle["@material"]).toBe("2");
    expect(children[1].Materials.Item).toHaveLength(3);
    expect(String(children[1].Vertices)).toContain(",");
  });

  it("writes an identity transform per child", () => {
    expect(doc.BoundsFile.Bounds.ChildTransforms.Item).toHaveLength(2);
  });
});
