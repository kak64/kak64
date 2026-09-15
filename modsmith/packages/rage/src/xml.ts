/**
 * CodeWalker-compatible XML emitters.
 *
 * These are the **guaranteed-correct export path**: the worker writes these
 * files (plus the DDS files they reference) and either ships them as
 * `.xml` for the user to import, or runs CodeWalker's CLI over them when
 * `CODEWALKER_CLI` is configured. Nothing here depends on the reconstructed
 * binary layouts in {@link ./layout.js}.
 *
 * Element names and nesting follow CodeWalker's XML schemas for `Drawable`,
 * `TextureDictionary`, `CMapTypes` and `BoundsFile`. Floats are written with
 * JavaScript's shortest round-trip representation, which parses identically
 * under .NET's invariant float parser.
 *
 * @packageDocumentation
 */

import { RageFormatError } from "./errors.js";
import type { RageBound } from "./bounds.js";
import { d3dFromFormat, type RageTexture } from "./ytd.js";
import { LOD_LEVELS, type LodLevel, type RageBounds, type RageDrawable, type RageMesh } from "./types.js";

/** Escape text for an XML text node or attribute value. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Format a number the way CodeWalker's invariant float writer does. */
export function num(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Object.is(value, -0)) return "0";
  return String(value);
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function vecTag(name: string, v: ArrayLike<number>, depth: number, withW = false): string {
  const w = withW ? ` w="${num((v[3] as number) ?? 0)}"` : "";
  return `${indent(depth)}<${name} x="${num(v[0] as number)}" y="${num(v[1] as number)}" z="${num(
    (v[2] as number) ?? 0,
  )}"${w} />`;
}

function valueTag(name: string, value: number, depth: number): string {
  return `${indent(depth)}<${name} value="${num(value)}" />`;
}

function textTag(name: string, value: string, depth: number): string {
  return value
    ? `${indent(depth)}<${name}>${xmlEscape(value)}</${name}>`
    : `${indent(depth)}<${name} />`;
}

/** XML declaration CodeWalker writes at the top of every file. */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/* -------------------------------------------------------------------------- */
/*                                  Drawable                                  */
/* -------------------------------------------------------------------------- */

/** Options for {@link ydrXml}. */
export interface YdrXmlOptions {
  /** Overrides the drawable's own name. */
  name?: string;
  /**
   * Texture names to list in the embedded `<TextureDictionary>`, each written
   * as an `<Item>` with a `FileName` pointing at a sibling `.dds`.
   */
  embeddedTextures?: RageTexture[];
  /** Include the XML declaration (default true). */
  declaration?: boolean;
}

/**
 * Vertex layout name CodeWalker uses for a component set.
 *
 * CodeWalker names layouts `GTAV<n>`; the element list inside `<Layout>` is
 * what actually drives its importer, so the name is informational.
 */
function layoutName(components: string[]): string {
  return components.includes("BlendIndices") ? "GTAV2" : "GTAV1";
}

function vertexLine(mesh: RageMesh, i: number, components: string[]): string {
  const parts: string[] = [];
  for (const c of components) {
    switch (c) {
      case "Position":
        parts.push(
          `${num(mesh.positions[i * 3]!)} ${num(mesh.positions[i * 3 + 1]!)} ${num(mesh.positions[i * 3 + 2]!)}`,
        );
        break;
      case "Normal":
        parts.push(
          mesh.normals
            ? `${num(mesh.normals[i * 3]!)} ${num(mesh.normals[i * 3 + 1]!)} ${num(mesh.normals[i * 3 + 2]!)}`
            : "0 0 1",
        );
        break;
      case "Colour0":
        parts.push(
          mesh.colors
            ? `${mesh.colors[i * 4]} ${mesh.colors[i * 4 + 1]} ${mesh.colors[i * 4 + 2]} ${mesh.colors[i * 4 + 3]}`
            : "255 255 255 255",
        );
        break;
      case "Tangent":
        parts.push(
          mesh.tangents
            ? `${num(mesh.tangents[i * 4]!)} ${num(mesh.tangents[i * 4 + 1]!)} ${num(
                mesh.tangents[i * 4 + 2]!,
              )} ${num(mesh.tangents[i * 4 + 3]!)}`
            : "1 0 0 1",
        );
        break;
      default: {
        const set = mesh.uvs[Number(c.slice("TexCoord".length))];
        parts.push(set ? `${num(set[i * 2]!)} ${num(set[i * 2 + 1]!)}` : "0 0");
      }
    }
  }
  return parts.join("   ");
}

/** The component list a mesh's XML vertex buffer should declare. */
function xmlComponents(mesh: RageMesh): string[] {
  const out = ["Position"];
  if (mesh.normals) out.push("Normal");
  out.push("Colour0");
  mesh.uvs.slice(0, 2).forEach((_, i) => out.push(`TexCoord${i}`));
  if (mesh.tangents) out.push("Tangent");
  return out;
}

function geometryXml(mesh: RageMesh, bounds: RageBounds, depth: number): string[] {
  const lines: string[] = [];
  const components = xmlComponents(mesh);
  lines.push(`${indent(depth)}<Item>`);
  lines.push(valueTag("ShaderIndex", mesh.shaderIndex, depth + 1));
  lines.push(vecTag("BoundingBoxMin", bounds.min, depth + 1));
  lines.push(vecTag("BoundingBoxMax", bounds.max, depth + 1));
  lines.push(`${indent(depth + 1)}<VertexBuffer>`);
  lines.push(valueTag("Flags", 0, depth + 2));
  lines.push(`${indent(depth + 2)}<Layout type="${layoutName(components)}">`);
  for (const c of components) lines.push(`${indent(depth + 3)}<${c} />`);
  lines.push(`${indent(depth + 2)}</Layout>`);
  lines.push(`${indent(depth + 2)}<Data>`);
  for (let i = 0; i < mesh.vertexCount; i++) {
    lines.push(`${indent(depth + 3)}${vertexLine(mesh, i, components)}`);
  }
  lines.push(`${indent(depth + 2)}</Data>`);
  lines.push(`${indent(depth + 1)}</VertexBuffer>`);
  lines.push(`${indent(depth + 1)}<IndexBuffer>`);
  lines.push(`${indent(depth + 2)}<Data>`);
  for (let i = 0; i < mesh.indices.length; i += 15) {
    lines.push(`${indent(depth + 3)}${Array.from(mesh.indices.slice(i, i + 15)).join(" ")}`);
  }
  lines.push(`${indent(depth + 2)}</Data>`);
  lines.push(`${indent(depth + 1)}</IndexBuffer>`);
  lines.push(`${indent(depth)}</Item>`);
  return lines;
}

function modelsXml(tag: string, models: RageMesh[][], depth: number): string[] {
  if (models.length === 0) return [`${indent(depth)}<${tag} />`];
  const lines = [`${indent(depth)}<${tag}>`];
  for (const model of models) {
    lines.push(`${indent(depth + 1)}<Item>`);
    lines.push(valueTag("RenderMask", 255, depth + 2));
    lines.push(valueTag("Flags", 0, depth + 2));
    lines.push(valueTag("HasSkin", 0, depth + 2));
    lines.push(valueTag("BoneIndex", 0, depth + 2));
    lines.push(valueTag("Unknown1", 0, depth + 2));
    lines.push(`${indent(depth + 2)}<Geometries>`);
    for (const mesh of model) {
      const bounds = mesh.bounds ?? {
        min: [0, 0, 0] as [number, number, number],
        max: [0, 0, 0] as [number, number, number],
        center: [0, 0, 0] as [number, number, number],
        radius: 0,
      };
      lines.push(...geometryXml(mesh, bounds, depth + 3));
    }
    lines.push(`${indent(depth + 2)}</Geometries>`);
    lines.push(`${indent(depth + 1)}</Item>`);
  }
  lines.push(`${indent(depth)}</${tag}>`);
  return lines;
}

function shaderGroupXml(drawable: RageDrawable, textures: RageTexture[], depth: number): string[] {
  const lines = [`${indent(depth)}<ShaderGroup>`];
  lines.push(valueTag("Unknown30", 0, depth + 1));
  if (textures.length === 0) {
    lines.push(`${indent(depth + 1)}<TextureDictionary />`);
  } else {
    lines.push(`${indent(depth + 1)}<TextureDictionary>`);
    for (const t of textures) lines.push(...textureItemXml(t, depth + 2));
    lines.push(`${indent(depth + 1)}</TextureDictionary>`);
  }
  lines.push(`${indent(depth + 1)}<Shaders>`);
  for (const shader of drawable.shaders) {
    lines.push(`${indent(depth + 2)}<Item>`);
    lines.push(textTag("Name", shader.name, depth + 3));
    lines.push(textTag("FileName", `${shader.name}.sps`, depth + 3));
    lines.push(valueTag("RenderBucket", shader.renderBucket, depth + 3));
    lines.push(`${indent(depth + 3)}<Parameters>`);
    for (const [name, texture] of Object.entries(shader.textures)) {
      lines.push(`${indent(depth + 4)}<Item name="${xmlEscape(name)}" type="Texture">`);
      lines.push(textTag("Name", texture, depth + 5));
      lines.push(`${indent(depth + 4)}</Item>`);
    }
    for (const [name, values] of Object.entries(shader.params)) {
      if (values.length === 4) {
        lines.push(
          `${indent(depth + 4)}<Item name="${xmlEscape(name)}" type="Vector" x="${num(values[0]!)}" y="${num(
            values[1]!,
          )}" z="${num(values[2]!)}" w="${num(values[3]!)}" />`,
        );
      } else {
        lines.push(`${indent(depth + 4)}<Item name="${xmlEscape(name)}" type="Array">`);
        for (let i = 0; i + 3 < values.length; i += 4) {
          lines.push(
            `${indent(depth + 5)}<Value x="${num(values[i]!)}" y="${num(values[i + 1]!)}" z="${num(
              values[i + 2]!,
            )}" w="${num(values[i + 3]!)}" />`,
          );
        }
        lines.push(`${indent(depth + 4)}</Item>`);
      }
    }
    lines.push(`${indent(depth + 3)}</Parameters>`);
    lines.push(`${indent(depth + 2)}</Item>`);
  }
  lines.push(`${indent(depth + 1)}</Shaders>`);
  lines.push(`${indent(depth)}</ShaderGroup>`);
  return lines;
}

/**
 * Emit a CodeWalker `Drawable` XML document for a `.ydr`.
 *
 * @param drawable - Source drawable (from a reader, or assembled by hand).
 */
export function ydrXml(drawable: RageDrawable, options: YdrXmlOptions = {}): string {
  const name = options.name ?? drawable.name;
  const textures = options.embeddedTextures ?? drawable.embeddedTextures ?? [];
  const lines: string[] = [];
  if (options.declaration !== false) lines.push(XML_DECLARATION);
  lines.push("<Drawable>");
  lines.push(textTag("Name", name, 1));
  lines.push(vecTag("BoundingSphereCenter", drawable.bounds.center, 1));
  lines.push(valueTag("BoundingSphereRadius", drawable.bounds.radius, 1));
  lines.push(vecTag("BoundingBoxMin", drawable.bounds.min, 1));
  lines.push(vecTag("BoundingBoxMax", drawable.bounds.max, 1));
  const tags: Array<[LodLevel, string, string]> = [
    ["high", "LodDistHigh", "FlagsHigh"],
    ["med", "LodDistMed", "FlagsMed"],
    ["low", "LodDistLow", "FlagsLow"],
    ["vlow", "LodDistVlow", "FlagsVlow"],
  ];
  tags.forEach(([, distTag], i) => lines.push(valueTag(distTag, drawable.lodDistances[i] ?? 9999, 1)));
  tags.forEach(([level, , flagTag]) =>
    lines.push(valueTag(flagTag, drawable.lods[level].length > 0 ? 255 : 0, 1)),
  );
  lines.push(valueTag("Unknown9A", 0, 1));
  lines.push(...shaderGroupXml(drawable, textures, 1));
  if (drawable.skeleton && drawable.skeleton.bones.length > 0) {
    lines.push("  <Skeleton>");
    lines.push("    <Bones>");
    for (const bone of drawable.skeleton.bones) {
      lines.push("      <Item>");
      lines.push(textTag("Name", bone.name, 4));
      lines.push(valueTag("Tag", bone.nameHash, 4));
      lines.push(valueTag("Index", bone.index, 4));
      lines.push(valueTag("ParentIndex", bone.parentIndex, 4));
      lines.push(vecTag("Rotation", bone.rotation, 4, true));
      lines.push(vecTag("Translation", bone.translation, 4));
      lines.push(vecTag("Scale", bone.scale, 4));
      lines.push("      </Item>");
    }
    lines.push("    </Bones>");
    lines.push("  </Skeleton>");
  } else {
    lines.push("  <Skeleton />");
  }
  lines.push("  <Joints />");
  const modelTags: Array<[LodLevel, string]> = [
    ["high", "DrawableModelsHigh"],
    ["med", "DrawableModelsMedium"],
    ["low", "DrawableModelsLow"],
    ["vlow", "DrawableModelsVeryLow"],
  ];
  for (const [level, tag] of modelTags) lines.push(...modelsXml(tag, drawable.lods[level], 1));
  lines.push("</Drawable>");
  return lines.join("\n") + "\n";
}

/* -------------------------------------------------------------------------- */
/*                              Texture dictionary                            */
/* -------------------------------------------------------------------------- */

/** CodeWalker's `Format` element value for a texture format. */
export function xmlFormatName(format: string): string {
  switch (format) {
    case "DXT1":
    case "DXT3":
    case "DXT5":
    case "A8R8G8B8":
    case "A8":
    case "L8":
      return `D3DFMT_${format}`;
    case "BC4":
      return "D3DFMT_ATI1";
    case "BC5":
      return "D3DFMT_ATI2";
    case "BC7":
      return "D3DFMT_BC7";
    default:
      return `D3DFMT_UNKNOWN_0x${(d3dFromFormat(format) >>> 0).toString(16).padStart(8, "0")}`;
  }
}

/** Options for {@link ytdXml}. */
export interface YtdXmlOptions {
  /** Directory prefix for the `FileName` elements (default none). */
  fileNamePrefix?: string;
  /** Include the XML declaration (default true). */
  declaration?: boolean;
}

function textureItemXml(texture: RageTexture, depth: number, prefix = ""): string[] {
  return [
    `${indent(depth)}<Item>`,
    textTag("Name", texture.name, depth + 1),
    valueTag("Unk32", 128, depth + 1),
    `${indent(depth + 1)}<Usage>DIFFUSE</Usage>`,
    `${indent(depth + 1)}<UsageFlags>NOT_HALF, HD_SPLIT</UsageFlags>`,
    valueTag("ExtraFlags", 0, depth + 1),
    valueTag("Width", texture.width, depth + 1),
    valueTag("Height", texture.height, depth + 1),
    valueTag("MipLevels", texture.mipLevels, depth + 1),
    `${indent(depth + 1)}<Format>${xmlFormatName(texture.format)}</Format>`,
    textTag("FileName", `${prefix}${texture.name}.dds`, depth + 1),
    `${indent(depth)}</Item>`,
  ];
}

/**
 * Emit a CodeWalker `TextureDictionary` XML document for a `.ytd`.
 *
 * Each `<Item>`'s `FileName` points at a sibling `.dds` that the caller must
 * write alongside the XML — that is how CodeWalker's importer picks up pixels.
 */
export function ytdXml(textures: RageTexture[], options: YtdXmlOptions = {}): string {
  const lines: string[] = [];
  if (options.declaration !== false) lines.push(XML_DECLARATION);
  if (textures.length === 0) {
    lines.push("<TextureDictionary />");
    return lines.join("\n") + "\n";
  }
  lines.push("<TextureDictionary>");
  for (const t of textures) lines.push(...textureItemXml(t, 1, options.fileNamePrefix ?? ""));
  lines.push("</TextureDictionary>");
  return lines.join("\n") + "\n";
}

/* -------------------------------------------------------------------------- */
/*                                   ytyp                                     */
/* -------------------------------------------------------------------------- */

/** One archetype in a `.ytyp`. */
export interface YtypArchetype {
  name: string;
  /** Texture dictionary the archetype draws from. */
  txdName: string;
  lodDist: number;
  bbMin: readonly [number, number, number];
  bbMax: readonly [number, number, number];
  bsCenter: readonly [number, number, number];
  bsRadius: number;
  /** Archetype flags bitfield (32 = "static" for ordinary props). */
  flags?: number;
  assetType?: "ASSET_TYPE_DRAWABLE" | "ASSET_TYPE_DRAWABLE_DICTIONARY" | "ASSET_TYPE_FRAGMENT";
  /** Asset name; defaults to `name`. */
  assetName?: string;
  /** Physics dictionary (a `.ybn` archive name); defaults to `name`. */
  physicsDictionary?: string;
  /** Drawable dictionary, for `ASSET_TYPE_DRAWABLE_DICTIONARY`. */
  drawableDictionary?: string;
  specialAttribute?: number;
  hdTextureDist?: number;
}

/** Input to {@link ytypXml}. */
export interface YtypInput {
  /** Name of the `.ytyp` archive (usually the resource/stream name). */
  name: string;
  archetypes: YtypArchetype[];
}

/**
 * Emit a CodeWalker `CMapTypes` XML document for a `.ytyp`.
 *
 * Every prop that appears in the world needs one of these; `lodDist`, the
 * bounding box and the bounding sphere must match the drawable's own values or
 * the prop pops or disappears at range.
 */
export function ytypXml(input: YtypInput, options: { declaration?: boolean } = {}): string {
  if (!input.name) {
    throw new RageFormatError("ytypXml needs a name for the CMapTypes archive", { code: "BAD_INPUT" });
  }
  const lines: string[] = [];
  if (options.declaration !== false) lines.push(XML_DECLARATION);
  lines.push("<CMapTypes>");
  lines.push("  <extensions />");
  if (input.archetypes.length === 0) {
    lines.push("  <archetypes />");
  } else {
    lines.push("  <archetypes>");
    for (const a of input.archetypes) {
      lines.push('    <Item type="CBaseArchetypeDef">');
      lines.push(valueTag("lodDist", a.lodDist, 3));
      lines.push(valueTag("flags", a.flags ?? 32, 3));
      lines.push(valueTag("specialAttribute", a.specialAttribute ?? 0, 3));
      lines.push(vecTag("bbMin", a.bbMin, 3));
      lines.push(vecTag("bbMax", a.bbMax, 3));
      lines.push(vecTag("bsCentre", a.bsCenter, 3));
      lines.push(valueTag("bsRadius", a.bsRadius, 3));
      lines.push(valueTag("hdTextureDist", a.hdTextureDist ?? 5, 3));
      lines.push(textTag("name", a.name, 3));
      lines.push(textTag("textureDictionary", a.txdName, 3));
      lines.push("      <clipDictionary />");
      lines.push(textTag("drawableDictionary", a.drawableDictionary ?? "", 3));
      lines.push(textTag("physicsDictionary", a.physicsDictionary ?? a.name, 3));
      lines.push(`      <assetType>${a.assetType ?? "ASSET_TYPE_DRAWABLE"}</assetType>`);
      lines.push(textTag("assetName", a.assetName ?? a.name, 3));
      lines.push("      <extensions />");
      lines.push("    </Item>");
    }
    lines.push("  </archetypes>");
  }
  lines.push(textTag("name", input.name, 1));
  lines.push("  <dependencies />");
  lines.push("  <compositeEntityTypes />");
  lines.push("</CMapTypes>");
  return lines.join("\n") + "\n";
}

/* -------------------------------------------------------------------------- */
/*                                    ybn                                     */
/* -------------------------------------------------------------------------- */

function boundXml(bound: RageBound, depth: number, tag = "Bounds"): string[] {
  const lines = [`${indent(depth)}<${tag} type="${bound.type}">`];
  lines.push(vecTag("BoxMin", bound.bounds.min, depth + 1));
  lines.push(vecTag("BoxMax", bound.bounds.max, depth + 1));
  lines.push(vecTag("BoxCenter", bound.bounds.center, depth + 1));
  lines.push(vecTag("SphereCenter", bound.bounds.center, depth + 1));
  lines.push(valueTag("SphereRadius", bound.bounds.radius, depth + 1));
  lines.push(valueTag("Margin", bound.margin, depth + 1));
  lines.push(valueTag("MaterialIndex", bound.materialIndex, depth + 1));

  if (bound.materials && bound.materials.length > 0) {
    lines.push(`${indent(depth + 1)}<Materials>`);
    for (const m of bound.materials) {
      lines.push(`${indent(depth + 2)}<Item type="${(m >>> 0) & 0xff}" />`);
    }
    lines.push(`${indent(depth + 1)}</Materials>`);
  }

  if (bound.positions && bound.positions.length > 0) {
    lines.push(`${indent(depth + 1)}<Vertices>`);
    for (let v = 0; v + 2 < bound.positions.length; v += 3) {
      lines.push(
        `${indent(depth + 2)}${num(bound.positions[v]!)}, ${num(bound.positions[v + 1]!)}, ${num(
          bound.positions[v + 2]!,
        )}`,
      );
    }
    lines.push(`${indent(depth + 1)}</Vertices>`);
  }

  if (bound.indices && bound.indices.length > 0) {
    lines.push(`${indent(depth + 1)}<Polygons>`);
    for (let t = 0; t * 3 + 2 < bound.indices.length; t++) {
      const material = bound.polygonMaterials?.[t] ?? 0;
      lines.push(
        `${indent(depth + 2)}<Triangle v1="${bound.indices[t * 3]}" v2="${bound.indices[t * 3 + 1]}" v3="${
          bound.indices[t * 3 + 2]
        }" f1="0" f2="0" f3="0" material="${material}" />`,
      );
    }
    lines.push(`${indent(depth + 1)}</Polygons>`);
  }

  if (bound.children && bound.children.length > 0) {
    lines.push(`${indent(depth + 1)}<Children>`);
    for (const child of bound.children) lines.push(...boundXml(child, depth + 2, "Item"));
    lines.push(`${indent(depth + 1)}</Children>`);
    lines.push(`${indent(depth + 1)}<ChildTransforms>`);
    for (let i = 0; i < bound.children.length; i++) {
      lines.push(`${indent(depth + 2)}<Item>`);
      lines.push(`${indent(depth + 3)}<Item x="1" y="0" z="0" w="0" />`);
      lines.push(`${indent(depth + 3)}<Item x="0" y="1" z="0" w="0" />`);
      lines.push(`${indent(depth + 3)}<Item x="0" y="0" z="1" w="0" />`);
      lines.push(`${indent(depth + 3)}<Item x="0" y="0" z="0" w="1" />`);
      lines.push(`${indent(depth + 2)}</Item>`);
    }
    lines.push(`${indent(depth + 1)}</ChildTransforms>`);
  }

  lines.push(`${indent(depth)}</${tag}>`);
  return lines;
}

/** Emit a CodeWalker `BoundsFile` XML document for a `.ybn`. */
export function ybnXml(bound: RageBound, options: { declaration?: boolean } = {}): string {
  const lines: string[] = [];
  if (options.declaration !== false) lines.push(XML_DECLARATION);
  lines.push("<BoundsFile>");
  lines.push(...boundXml(bound, 1));
  lines.push("</BoundsFile>");
  return lines.join("\n") + "\n";
}

/** Convenience: the LOD slots that carry geometry in `drawable`. */
export function populatedLods(drawable: RageDrawable): LodLevel[] {
  return LOD_LEVELS.filter((l) => drawable.lods[l].some((m) => m.length > 0));
}
