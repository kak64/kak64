# Known limitations

This file states plainly what is production-ready, what is best-effort and what is not implemented, so nobody has to discover it from a failed export. It is kept honest on purpose: the platform never reports a job as completed unless a real artifact was produced, and where an output needs a manual step that is said here, in the export README and in the job manifest (`manifest.encoder` and `manifest.warnings`).

## RAGE binary formats (`packages/rage`)

| Format | Read | Write | Confidence |
| --- | --- | --- | --- |
| RSC7 container | yes | yes | **Verified.** Page-flag arithmetic matches published examples; containers rewrite byte-identically. |
| `.ytd` texture dictionary | yes | yes | **Verified.** Write→read round-trips preserve names, dimensions, format, mip count, stride and every mip byte. |
| DDS / BC1 / BC2 / BC3 | yes | yes (BC1, BC3, uncompressed) | **Verified.** Decoders checked against hand-assembled blocks; encoders hold >28 dB PSNR. |
| `.ydr` drawable | yes | XML only | **Derived from public format documentation.** A native writer exists and round-trips through our own reader, but the byte layout has never been checked against a retail file. |
| `.ybn` bound | yes | XML only | Same, plus no BVH acceleration tree is generated. |
| `.yft` fragment, `.ydd` dictionary | yes | read-only | Best-effort. Real game files may throw `RageFormatError`; the worker degrades to a warning instead of failing the job. |
| BC7 / BC5 / BC4 textures | header only | passthrough | No decoder, so no PNG preview and no re-encode. They are copied through losslessly. |

**What this means for exports.** Texture-only work (retexture, livery, clothing, weapon skins, tattoos, faces, optimizer) is produced as real binary `.ytd` files and streams as-is. Exports that need a new drawable or collision (Prop Creator, Chain & Accessory Creator) ship CodeWalker-compatible `.ydr.xml` / `.ybn.xml` / `.ytyp.xml` alongside the real `.ytd`, plus a README explaining the one-time conversion. Set `CODEWALKER_CLI` on the worker to a CodeWalker-compatible XML→binary converter and the worker produces the binary files directly; the job manifest records which path was taken (`encoder: "native" | "codewalker-xml"`).

Validating the drawable layout against retail files is the single highest-value piece of remaining work. Until then the platform tells users the truth rather than shipping a `.ydr` that may not load.

## Asset libraries
- **Weapons**: 111 vanilla weapons (105 unique texture dictionaries) with verified spawn names and prefixes, not the ~190 comparable products advertise. The list was not padded with guessed model names. The editor's own picker carries a few more entries than the worker library; treat 111 as the number that will actually build.
- **Clothing**: the garment library lists component slots and drawable ids. Base-game meshes are not redistributable, so library entries reference files the user supplies; uploading your own `.ydd`/`.ytd` is the fully supported path.
- **Tattoos** place artwork on a per-zone UV canvas rather than by true decal projection, which is what the export format carries anyway.
- **Face skins** align the photo manually against an oval guide. There is no face-detection model; the alignment controls are explicit and the preview is a stylised head, not the real ped head UV.

## External services
- **AI image-to-3D** defaults to `mock`, which builds genuine relief geometry from the image so the pipeline can be exercised offline. Tripo and Meshy adapters are implemented but unverified against live accounts.
- **Sketchfab** import needs `SKETCHFAB_API_TOKEN`; without it search works and download does not.
- **Add-on Car Importer** fetches only allow-listed hosts. Pages that gate downloads behind JavaScript or a consent flow fail with `SOURCE_UNSUPPORTED` and ask for the archive instead. RAR and 7z need `7z`/`unrar` on the worker image (both are installed in `docker/worker.Dockerfile`); encrypted RPF archives are refused.
- **Vehicle Editor** never rewrites a `.yft`, because no verified fragment writer exists. Part removal is applied through a generated client script and texture/LOD work through the `.ytd`; the manifest says which. Escrowed (`.fxap`) resources are rejected outright.
- **Stripe, Discord, Resend/Postmark, ClamAV** are all implemented against their documented APIs but exercised here only against test keys and mocks.

## Operational
- Rate limiting fails open if Redis is unreachable, so an outage degrades protection rather than locking everyone out. This is a deliberate trade-off and is logged.
- Uploads above 256 MiB are hashed by a worker job; the upload cannot be used until it finishes.
- `STORAGE_PROVIDER=local` serves objects through the app with HMAC-signed URLs. It exists for development and tests only — use S3/R2 in production.
- The end-to-end suite skips the real-export and optimizer tests unless a worker heartbeat is present, and skips Stripe checkout unless a test key is configured. A green run without those is not a full verification; the run log says which were skipped.
