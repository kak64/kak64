/**
 * `@modsmith/rage` — reading and writing GTA V RAGE resource files (`.ytd`,
 * `.ydr`, `.ydd`, `.yft`, `.ybn`) for FiveM asset pipelines.
 *
 * See {@link CAPABILITIES} for what is production-ready versus best-effort, and
 * `README.md` for the full limitation list.
 *
 * @packageDocumentation
 */

export * from "./errors.js";
export * from "./hash.js";
export * from "./binary.js";
export * from "./rsc7.js";
export * from "./bc.js";
export * from "./dds.js";
export * from "./png.js";
export * from "./ytd.js";
export * from "./types.js";
export * from "./layout.js";
export * from "./drawable.js";
export * from "./writer.js";
export * from "./bounds.js";
export * from "./xml.js";
export * from "./glb.js";

/**
 * How well this library supports each resource type, so the worker can choose
 * an encoder at runtime and record it in the job manifest.
 *
 * - `"native"` — this package reads *and* writes the binary format, and the
 *   writer's output is proven correct by round-tripping through the reader over
 *   format details that are themselves verified. Safe to ship as a game asset.
 * - `"xml-only"` — a native writer exists and round-trips through our own
 *   reader, but the binary layout it emits is reconstructed from public format
 *   documentation and has **not** been checked against retail game files.
 *   Export through the matching CodeWalker XML emitter instead.
 * - `"read-only"` — best-effort reader, no writer.
 *
 * Map these to the manifest's `encoder` field as `"native"` → `"native"` and
 * `"xml-only"` → `"codewalker-xml"` (or `"codewalker-cli"` when the CLI is
 * configured to convert the XML).
 */
export const CAPABILITIES = {
  /** RSC7 container: verified page-flag maths, read and write. */
  rsc7: "native",
  /** Texture dictionaries: full native read/write round trip. */
  ytd: "native",
  /** DDS container and BC1/BC3 codecs: native. */
  dds: "native",
  /** Drawables: reader and writer exist but the layout is unverified. */
  ydr: "xml-only",
  /** Static bounds: reader and writer exist but the layout is unverified. */
  ybn: "xml-only",
  /** Drawable dictionaries: best-effort reader only. */
  ydd: "read-only",
  /** Fragments: best-effort reader only. */
  yft: "read-only",
  /** GLB preview export: native. */
  glb: "native",
  /** CodeWalker XML emitters for ydr/ytd/ytyp/ybn. */
  xml: "native",
} as const;

/** Support level of one resource type. */
export type CapabilityLevel = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

/** Resource types {@link CAPABILITIES} describes. */
export type CapabilityKey = keyof typeof CAPABILITIES;

/**
 * The encoder the worker should record in a job manifest for a resource type.
 *
 * @example
 * ```ts
 * manifest.encoder = encoderFor("ydr"); // "codewalker-xml"
 * ```
 */
export function encoderFor(kind: CapabilityKey): "native" | "codewalker-xml" {
  return CAPABILITIES[kind] === "native" ? "native" : "codewalker-xml";
}
