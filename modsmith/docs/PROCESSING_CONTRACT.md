# Processing contract (web ⇄ worker ⇄ rage)

## Job purposes
- `purpose: "export"` — builds the FiveM resource ZIP; credits are held at enqueue and refunded on failure. Worker calls `completeJob()` with the ZIP; a `CreationVersion` is created; source uploads are deleted afterwards.
- `purpose: "inspect"` — free, fast job that turns the user's uploads into editor-loadable previews. Worker calls `completeJob()` with a manifest of artifacts; nothing is charged; source uploads are kept; `Creation.projectState.preview = { jobId, manifest, facts }`.

The processor name for inspect jobs is `"inspect"` (queue: `processing`). `job.toolSlug` says which tool asked (vehicle-editor, livery-mapper, retexture, clothing-textures, prop-creator, weapon-skins, tattoo-creator, face-skin-creator, chain-creator, resource-optimizer, vehicle-optimizer, map-optimizer).

## Result manifest (both purposes)
```jsonc
{
  "artifacts": [ { "name": "preview.glb", "key": "results/<userId>/<jobId>/preview.glb", "mime": "model/gltf-binary", "size": 12345 } ],
  "files": [ { "path": "my_prop/stream/my_prop.ydr", "size": 1234 } ],   // export only: ZIP listing
  "stats": { "triangles": 1234, "textures": 3, "vramBytes": 1048576, "lods": 4 },
  "warnings": [ "…" ],
  "encoder": "native" | "codewalker-xml" | "codewalker-cli"
}
```
Web fetches artifacts via `GET /api/v1/jobs/:id/artifacts/:name` (`?redirect=1` → 302 to a signed URL). Editors use this to load `preview.glb`, `textures.json`, `uv-template.png`, `materials.json`, `report.json`.

## Inspect manifests per tool
- **vehicle-editor / livery-mapper / retexture / prop-creator(rage input)**: `preview.glb` (all LOD-high geometry, materials named after RAGE shader/texture names, one primitive per material), `materials.json` (`[{ name, shader, textures: { DiffuseSampler: "vehicle_body" , ... }, primitiveIndices: [..] }]`), `textures.json` (`[{ name, width, height, format, mips, artifact: "tex/<name>.png" }]`) plus each texture as PNG artifact `tex/<name>.png`, `uv-template.png` (2048² UV wireframe of the body/livery material for livery-mapper; per-material for retexture), `components.json` (vehicle-editor: fragment children / model names such as `bodyshell`, `chassis`, `wheel_lf`, `bumper_f`, `badge…`, with primitive indices), `facts` (`{ escrow: false, vehicleName, hasHiLod, textureCount, triangles }`). If the input is an escrow `.fxap`, fail the job with code `ESCROW_PROTECTED` (non-retryable, not infrastructure).
- **clothing-textures**: `preview.glb` of the garment (from `.ydd`), `uv-template.png`, `textures.json` + PNGs, `variants` in facts.
- **optimizers**: `report.json` (see `OptimizerReport` below) — for optimizers the inspect job IS the analysis; export produces the optimized ZIP.
- **face-skin-creator**: `aligned.png` (auto-aligned face crop), `facts.faceBox`.

## OptimizerReport
```jsonc
{ "totalBytes": 0, "estimatedVramBytes": 0, "files": [{ "path": "", "type": "ytd|yft|ydr|ydd|ybn|png|dds|other", "bytes": 0, "vramBytes": 0, "textures": [{ "name": "", "width": 0, "height": 0, "format": "", "mips": 0, "vramBytes": 0 }], "lods": { "high": true, "med": false, "low": false, "vlow": false } }],
  "issues": [{ "severity": "critical|high|medium|low", "code": "OVERSIZED_TEXTURE|NO_MIPMAPS|MISSING_LOD|EXCESSIVE_VRAM|UNUSED_ASSET|RAW_IMAGE|UNCOMPRESSED_TEXTURE", "path": "", "texture": "", "message": "", "recommendation": "", "savingsBytes": 0, "fixable": true }],
  "beforeAfter": { "vramBytes": [0, 0], "diskBytes": [0, 0] } }
```

## @modsmith/rage API (packages/rage) — used by the worker only
```ts
parseRsc7(buf): { version: number; systemSize: number; graphicsSize: number; payload: Buffer; isRsc7: boolean }
readYtd(buf): RageTexture[]            // { name, width, height, format, mipLevels, dds(): Buffer, rgba(level?): { width, height, data: Uint8Array } | null }
readYdr(buf): RageDrawable             // { name, lods: { high, med, low, vlow }: RageMesh[][], lodDistances, shaders: RageShader[], bounds }
readYft(buf): { name; drawable: RageDrawable; children: { name; drawable: RageDrawable; boneIndex }[] }
readYdd(buf): { name; drawable: RageDrawable }[]
writeYtd(textures: { name: string; dds: Buffer }[]): Buffer          // native encoder
writeYdr(input: DrawableInput): Buffer                               // native encoder (minimal subset: static drawable, up to 4 LODs, shaders default/normal/spec/normal_spec, vertex P/N/C/T[/T2])
writeYbn(input: BoundInput): Buffer                                  // native encoder (box + bvh mesh)
ytypXml / ydrXml / ytdXml / ybnXml(...)                              // CodeWalker XML equivalents
drawableToGlb(d, textures): Buffer                                   // preview
encodeDds(rgba, width, height, { format: "DXT1"|"DXT5"|"A8R8G8B8", mips: true }): Buffer
decodeDds(buf): { width, height, format, mips: number, rgba(level): Uint8Array }
```
The worker must degrade gracefully: if the native encoder cannot represent an input, fall back to CodeWalker XML output (+ CLI conversion when `CODEWALKER_CLI` is configured) and record `encoder` in the manifest and a warning.

## Maintenance-queue jobs (worker)
- `finalize-upload` `{ uploadId }` — for uploads larger than 256 MiB the web layer defers hashing. The worker streams the object, computes SHA-256, compares it with `AssetUpload.sizeBytes`, sets `status: "UPLOADED"`, `sha256`, `scanStatus: "pending"` (or `REJECTED` with a `rejectReason` on mismatch) and publishes nothing. Until this runs, `estimateJob`/`createJob` refuse the upload with `INVALID_FILE { finalizing: true }`.
- `maintenance` (repeatable, every 15 min) — expired uploads, expired reservations, log/media retention, orphaned objects, old sessions and outbox rows.

## Tool inputs the editors upload
Editors always upload the user's ORIGINAL file(s) (for the source hash) and, for generic 3D formats (OBJ/FBX/DAE/glTF), an additional browser-normalized `<name>.glb` (Three.js loaders → GLTFExporter) so the worker only needs to parse GLB for those tools. Config for prop-creator carries `materials[]` mapping material names → uploaded texture keys (by upload id) as validated by `propConfigSchema`.
