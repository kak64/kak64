# @modsmith/rage

Reading and writing GTA V RAGE resource files (`.ytd`, `.ydr`, `.ydd`, `.yft`, `.ybn`) in
TypeScript, for the Modsmith worker. No runtime dependencies — only `node:zlib`.

```ts
import { readYtd, writeYtd, drawableToGlb, CAPABILITIES } from "@modsmith/rage";
```

## Confidence levels — read this first

The formats here are not equally well understood, and this package is explicit about which
is which. `CAPABILITIES` encodes it so the worker can branch at runtime and record
`encoder` in the job manifest:

```ts
export const CAPABILITIES = {
  rsc7: "native",
  ytd:  "native",
  dds:  "native",
  ydr:  "xml-only",
  ybn:  "xml-only",
  ydd:  "read-only",
  yft:  "read-only",
  glb:  "native",
  xml:  "native",
};
```

| Level | Meaning |
| --- | --- |
| `native` | Read **and** write the binary format; the writer round-trips through the reader over details that are themselves verified. Safe to ship as a game asset. |
| `xml-only` | A native writer exists and round-trips through our own reader, but the binary layout it emits is **reconstructed from public format documentation and never checked against retail game files**. Export through the CodeWalker XML emitter instead. |
| `read-only` | Best-effort reader, no writer intended for shipping. |

`encoderFor(kind)` maps a capability to the manifest's `encoder` value
(`"native"` or `"codewalker-xml"`).

### What is verified vs. derived from spec

**Verified** (exercised end to end by the test suite, and correct by construction):

- The RSC7 page-flag size encoding. The documented examples decode exactly
  (`0x08000004` → `0x2000`, `0x01000004` → `0x10000`), and `sizeToFlags`/`flagsToSize`
  round-trip across a wide size range with less than one base page of padding.
- The RSC7 container: header, raw-DEFLATE payload, system/graphics segment split, rewrite
  producing identical flags and payload.
- joaat hashing, against published test vectors (`""` → 0, `"a"` → `0xCA2E9442`,
  the pangram → `0x519E91F5`).
- The DDS container: `DDS_HEADER` field offsets, FourCC and DX10 paths, mip-chain sizing,
  and `encodeDds → decodeDds` round trips (exact for uncompressed formats).
- BC1/BC2/BC3 decoding, against hand-assembled blocks with known expected output, covering
  the 4-colour, 3-colour punch-through, BC2 explicit-alpha, and both BC3 alpha modes.
- BC1/BC3 encoding, by PSNR on gradients (> 30 dB BC1, > 28 dB BC3) and exactness on flat
  blocks and constant alpha.
- Texture dictionaries: `writeYtd → readYtd` preserves names, dimensions, format, mip
  counts, strides, dictionary ordering and every mip's bytes, and survives a second cycle.
  The reader walks the file purely by following pointers, so the `TextureDictionary` /
  `TextureBase` / `Texture` offsets are exercised in both directions.
- The PNG encoder: signature, chunk order, per-chunk CRC-32, and IDAT that inflates to
  correctly-sized filtered scanlines.
- GLB output: header, chunk types and 4-byte alignment, buffer-view/accessor arithmetic
  against the source geometry, and the glTF JSON shape.
- The XML emitters: every document is parsed and validated for well-formedness, and its
  element/attribute content is asserted against the source data.

**Derived from spec** (implemented from public documentation of the RAGE resource
structures, self-consistent and round-tripping, but **not** confirmed against retail game
files):

- Every offset in `src/layout.ts` — `gtaDrawable`, `rmcDrawableModel`, `grmGeometry`,
  `grcVertexBuffer`, `grcIndexBuffer`, `grcVertexDeclaration`, `grmShaderGroup`,
  `grmShader`, `crSkeletonData`, `crBoneData` — and everything built on them:
  `readYdr`, `readYdd`, `readYft`, `writeYdr`, `writeYdd`.
- Every offset in `src/bounds.ts` — `phBound`, `phBoundComposite`, `phBoundGeometry` —
  and `readYbn` / `writeYbn`.
- The fragment field offsets inside `readYft`.
- The assumption that a decompressed segment is addressed as one contiguous byte range, so
  a resource pointer's offset is a plain offset into the segment. The writer lays blocks
  out contiguously and does not keep structures from straddling a page boundary.
- The VFT words. The game's resource loader patches these on load; `writeYtd` emits 0
  unless the caller supplies values, and `readYtd` preserves whatever a real file had so a
  rewrite can put them back.

## API

### Container and binary primitives

```ts
parseRsc7(buf): { version, systemSize, graphicsSize, systemFlags, graphicsFlags,
                  payload, systemData, graphicsData, isRsc7 }
writeRsc7({ version, system, graphics?, systemMinBaseSize?, graphicsMinBaseSize? }): Buffer
isRsc7(buf): boolean
flagsToSize(flags) / sizeToFlags(size, { minBaseSize? }) / decodeFlags(flags)
RESOURCE_VERSIONS  // { ytd: 13, ydr: 165, ydd: 165, yft: 162, ybn: 43, … }

makePointer(segment, offset) / decodePointer(ptr)
class ResourceReader   // bounds-checked u8…u64, f32, vec3/vec4, cstring, pointer
class ResourceBuilder  // alloc/system/graphics/string + build(); 16-byte alignment,
class Block            // sequential writers + pointer() fixups resolved after layout
```

### Hashing

```ts
joaat(value, caseSensitive?): number
shaderNameFromHash(hash) / paramNameFromHash(hash)  // → name, or "hash_xxxxxxxx"
SHADER_NAMES / SHADER_PARAM_NAMES / SHADER_HASHES / SHADER_PARAM_HASHES
isUnknownHashName(name)
```

### Textures

```ts
readYtd(buf): RageTexture[]
readYtdDictionary(buf): { textures, vft, version }
writeYtd(textures: { name, dds, vft? }[], { dictionaryVft?, textureVft? }?): Buffer

// RageTexture
{ name, nameHash, width, height, depth, stride, format, mipLevels,
  dataOffset, dataSize, vft,
  levelData(level): Buffer,
  dds(): Buffer,
  rgba(level = 0): { width, height, data } | null }

decodeDds(buf): { width, height, depth, format, mips, data,
                  levelData(level), levelSize(level), rgba(level?) }
encodeDds(rgba, width, height, { format: "DXT1"|"DXT5"|"A8R8G8B8"|"L8"|"A8",
                                 mips?: boolean | number, punchThroughAlpha? }): Buffer
assembleDds(format, width, height, mipData[], { dx10? }): Buffer
buildDdsHeader(opts) / surfaceSize / rowPitch / mipChainSize / fullMipCount
buildMipChain(rgba, w, h, maxLevels?) / downsampleRgba(rgba, w, h)
surfaceToRgba(format, data, w, h, bgra?)
formatFromD3d(code) / d3dFromFormat(format) / formatFromDxgi / dxgiFromFormat

encodeBc1 / encodeBc3 / decodeBc1 / decodeBc2 / decodeBc3     // whole surfaces
encodeBc1Block / encodeBc3AlphaBlock / decodeBc1Block / …     // single blocks
```

### Drawables and bounds

```ts
readYdr(buf): RageDrawable
readYdd(buf): { name, drawable }[]
readYft(buf): { name, drawable, children: { name, drawable, boneIndex }[] }
readYbn(buf): RageBound

writeYdr(input: DrawableInput): Buffer                    // unverified layout
writeYdd(entries: { name?, drawable }[]): Buffer          // unverified layout
writeYbn(input: BoundInput): Buffer                       // unverified layout
buildDrawable(builder, input): Block                      // embed a drawable elsewhere

readDrawableStruct / readVertexBuffer / readIndexBuffer / readVertexDeclaration
boundsFromPositions / mergeBounds / emptyBounds / LOD_LEVELS
```

`RageDrawable` is `{ name, lods: { high, med, low, vlow }: RageMesh[][], lodDistances,
shaders: RageShader[], bounds, skeleton?, embeddedTextures? }`; each `RageMesh` carries
`positions`, `normals?`, `tangents?`, `uvs[]`, `colors?`, `indices`, `shaderIndex`,
`vertexCount`, `vertexComponents`, `bounds?`.

### Export

```ts
ydrXml(drawable, { name?, embeddedTextures?, declaration? }): string
ytdXml(textures, { fileNamePrefix?, declaration? }): string
ytypXml({ name, archetypes: [{ name, txdName, lodDist, bbMin, bbMax,
                               bsCenter, bsRadius, flags?, assetType?, … }] }): string
ybnXml(bound, { declaration? }): string

drawableToGlb(drawable, textures?, { lods?, embedTextures?, zUpToYUp? }): Buffer
parseGlb(buf): { version, json, bin }
encodePng(rgba, width, height): Buffer
```

## Known limitations

**Textures**

- BC7, BC5 and BC4 are read, sized, re-packed and re-exported as DDS losslessly, but
  `rgba()` returns `null` for them — there is no BC7/BC4/BC5 decoder, so they cannot be
  previewed as PNG or re-encoded. Callers should surface "preview unavailable" rather
  than treating `null` as an error.
- `encodeDds` writes DXT1, DXT5, A8R8G8B8, L8 and A8 only. There is no BC7 encoder.
- The BC1/BC3 encoder is a range fit with least-squares refinement. It is good but not
  best-in-class; expect a fraction of a dB below a dedicated compressor on hard blocks.
- Cubemaps, texture arrays and volume textures are not handled; only 2D surfaces.
- `writeYtd` emits VFT 0 unless told otherwise (see "derived from spec" above).
- Mip generation is a plain box filter with no gamma correction or alpha weighting.

**Drawables**

- `readYdr` / `readYdd` / `readYft` implement one structure variant. Anything that does
  not validate throws `RageFormatError` with a specific message — they never return
  partially-decoded geometry. Expect real game files to fail until the layout is
  confirmed against them.
- Vertex decoding covers Float/Float2/Float3/Float4, Half2/Half4, Colour, UByte4 and
  Dec3N. Other element types throw `RageUnsupportedError`.
- Only `TexCoord0` and `TexCoord1` are extracted; further UV sets are ignored.
- Skinning is read (bone names, parents, local transforms) but blend weights/indices are
  not extracted into `RageMesh`, and `writeYdr` writes static drawables only.
- `writeYdr` supports shaders `default`, `normal`, `spec`, `normal_spec`; anything else
  throws. Shader parameters must be a multiple of 4 floats.
- Index buffers are 16-bit, so a single geometry is capped at 65535 vertices.
- `writeYdr` emits no embedded texture dictionary; textures are referenced by name and
  must live in a separate `.ytd`.
- Fragment reading covers the main drawable and physics children; cloth, glass windows,
  vehicle lights, damage models and articulated joints are not decoded. Child names are
  synthesised (`<fragment>_child_<n>`) rather than read from the fragment's group table.

**Bounds**

- Only `Composite`, `Box`, `Geometry` and `BVH` are handled; spheres, capsules, cylinders
  and discs parse their common header but carry no shape data.
- BVH vertices are 16-bit quantised (as the format specifies), so positions round-trip to
  within one quantum (~1/65000 of the bound's largest extent).
- Only triangle polygons are supported; any other polygon kind throws.
- No BVH acceleration structure is generated — the node tree the game builds at load is
  absent, which is one more reason `ybn: "xml-only"`.

**Export**

- `drawableToGlb` exports the highest populated LOD by default, adds a root node rotation
  for Z-up → Y-up, and embeds only textures it can decode. Materials are PBR
  approximations of RAGE shaders, not faithful reproductions.
- The XML emitters follow CodeWalker's schemas. `ydrXml` writes the LOD flag values and
  `RenderMask` as constants rather than preserving per-model masks, and skips the
  `Joints` block.

## Development

```sh
pnpm --filter @modsmith/rage typecheck
pnpm --filter @modsmith/rage test
```

Tests build synthetic resources with this package's own writers and read them back, plus
hand-assembled block/header fixtures where an external ground truth exists. No game files
are required or included.
