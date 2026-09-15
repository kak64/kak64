import type { PrismaClient } from "@prisma/client";

const categories = [
  { slug: "props", name: "Props", description: "Turning models into streamable FiveM props.", icon: "Box", sortOrder: 0 },
  { slug: "vehicles", name: "Vehicles", description: "Add-on vehicles, metadata and audio.", icon: "Car", sortOrder: 1 },
  { slug: "liveries", name: "Liveries", description: "UV-accurate livery design.", icon: "Palette", sortOrder: 2 },
  { slug: "clothing", name: "Clothing", description: "Garment textures and add-on clothing.", icon: "Shirt", sortOrder: 3 },
  { slug: "weapons", name: "Weapons", description: "Weapon skins and camos.", icon: "Crosshair", sortOrder: 4 },
  { slug: "tattoos", name: "Tattoos", description: "Tattoo packs and framework configs.", icon: "Feather", sortOrder: 5 },
  { slug: "optimization", name: "Optimization", description: "VRAM, textures and LODs.", icon: "Gauge", sortOrder: 6 },
  { slug: "file-formats", name: "File formats", description: "What every RAGE file actually is.", icon: "FileBox", sortOrder: 7 },
  { slug: "troubleshooting", name: "Troubleshooting", description: "When it does not stream, load or look right.", icon: "LifeBuoy", sortOrder: 8 },
];

type GuideSeed = {
  slug: string; category: string; title: string; intro: string; toolSlug?: string | null; seoTitle?: string; seoDescription?: string;
  faqs: { question: string; answer: string }[]; related: string[]; content: string;
};

const guides: GuideSeed[] = [
  {
    slug: "create-a-fivem-prop-from-any-3d-model",
    category: "props",
    title: "Create a FiveM prop from any 3D model",
    intro: "From an OBJ, FBX, glTF or DAE file to a streaming prop with collision and LODs, without installing Blender.",
    toolSlug: "prop-creator",
    seoTitle: "How to create a FiveM prop from a 3D model (no Blender)",
    seoDescription: "Step-by-step guide to converting OBJ, FBX, glTF or DAE models into FiveM props with collision, LODs and a spawn script using the Prop Creator.",
    faqs: [
      { question: "Which formats can I upload?", answer: "OBJ (with MTL), FBX, glTF, GLB and DAE plus PNG/JPG/DDS textures. A ZIP containing the model and its textures is the most reliable option." },
      { question: "Why is my prop huge or tiny in game?", answer: "Different exporters use different units. Use the 1.83m ped reference in the viewport and the uniform-scale control to match real-world size before exporting." },
      { question: "Do I need a collision?", answer: "Only if players should be able to walk on or bump into the object. A box collision is cheap and good for most furniture; mesh collision is precise but heavier." },
    ],
    related: ["prop-collision-and-lods-explained", "ydr-ytyp-ytd-what-they-are"],
    content: `## What you need

- A 3D model in OBJ, FBX, glTF/GLB or DAE format
- Its textures (PNG, JPG or DDS). If your model uses an MTL file, include it
- A Modsmith account with credits (new accounts start with free credits)

## 1. Upload

Open the **Prop Creator** and drag your files onto the upload zone. You can drop a ZIP containing the model and every texture; Modsmith detects textures by filename (\`_n\`, \`_normal\`, \`_spec\`, \`_rough\`, \`_metal\` suffixes are recognised automatically).

Uploads are validated on the server: extension, real MIME type (magic bytes), size and archive safety. Files that fail validation never reach a worker.

## 2. Position against the ped reference

The viewport shows a 1.83 m human reference. Use the transform panel or gizmos to move, rotate and scale the model until it looks correct next to the reference. Uniform scale keeps proportions intact.

## 3. Choose collision

| Option | When to use it |
| --- | --- |
| None | Decorations players never touch |
| Box | Furniture, crates, signs — cheap and reliable |
| Mesh | Ramps, stairs, complex shapes |

## 4. Configure LODs

Leave automatic LOD generation on unless you have a reason not to. The worker generates High, Medium, Low and Very Low variants using the ratios you set and assigns the LOD distances from the panel.

## 5. Export

Press **Export**. The job is queued and processed by a worker; you can close the tab. When it finishes you will find a ZIP in **My Creations** containing:

\`\`\`
my_prop/
  fxmanifest.lua
  stream/
    my_prop.ydr
    my_prop.ytyp
    my_prop.ytd
  client/spawn.lua
\`\`\`

## 6. Install on your server

Copy the folder into \`resources/\`, add \`ensure my_prop\` to your server.cfg and restart. Spawn it with the included command or reference it from your own scripts by name.

> Credits are charged only when the build succeeds. If a worker fails for an infrastructure reason your credits are refunded automatically.`,
  },
  {
    slug: "prop-collision-and-lods-explained",
    category: "props",
    title: "Collision and LODs, explained",
    intro: "Why props need level-of-detail models, what each LOD distance means and how collision types affect performance.",
    toolSlug: "prop-creator",
    faqs: [
      { question: "What is a reasonable triangle count?", answer: "Small props: under 5k triangles. Furniture: under 20k. Anything above 100k should be decimated before export." },
      { question: "Can I skip LODs?", answer: "You can, but every player within streaming range then renders the full mesh. Automatic LODs are cheap insurance." },
    ],
    related: ["create-a-fivem-prop-from-any-3d-model", "why-zip-size-is-not-vram"],
    content: `## Levels of detail

RAGE draws a different mesh depending on the camera distance. A prop with four LODs might use 100% of its triangles up to 50 m, 50% up to 100 m, 25% up to 200 m and 10% beyond that. The Prop Creator generates these with mesh simplification and writes the distances into the drawable.

## Collision types

- **None** — no physics bounds. Cheapest.
- **Box** — an oriented bounding box. Cheap and stable for anything roughly rectangular.
- **Mesh** — a simplified triangle mesh. Needed for ramps and shapes with holes. The worker decimates the collision mesh separately from the visual mesh.

## Decimation

The **mesh detail** slider decimates the source model before LOD generation. Use it when a model was made for renders rather than games.`,
  },
  {
    slug: "import-an-addon-car-from-gta5-mods",
    category: "vehicles",
    title: "Import an add-on car from GTA5-Mods",
    intro: "Paste a mod link, confirm you have the rights to use it, and get a complete add-on resource with audio and metadata.",
    toolSlug: "car-importer",
    faqs: [
      { question: "The mod is a replace mod. Will it overwrite a vanilla car?", answer: "No. The importer detects replace mods and asks whether to convert them into a standalone add-on with a new spawn name, so nothing vanilla is overwritten." },
      { question: "Why do I have to confirm rights?", answer: "You are responsible for having permission to use the files you import. Modsmith records your confirmation and does not distribute the mod itself." },
    ],
    related: ["vehicle-optimizer-textures-without-touching-geometry", "yft-ytd-and-vehicle-meta-files"],
    content: `## Steps

1. Copy the mod page URL from GTA5-Mods.
2. Paste it into the **Add-on Car Importer**. Only allow-listed hosts are fetched, and the fetch happens on a worker with SSRF protection.
3. Confirm you have the right to use the files.
4. The worker inspects the archive, detects the DLC structure, finds \`vehicles.meta\`, \`handling.meta\`, \`carcols.meta\`, \`carvariations.meta\` and audio files.
5. If the mod replaces a vanilla vehicle you are asked whether to convert it to an add-on. A new spawn name is generated and every metadata reference is rewritten.
6. Download the ZIP from **My Creations** and \`ensure\` it on your server.

## What is preserved

- Engine and exhaust audio (\`.awc\`, \`.dat151.rel\`, \`.dat54.rel\`)
- Handling, car colours and variations
- Tuning parts and modkits when present`,
  },
  {
    slug: "design-a-livery-on-real-uvs",
    category: "liveries",
    title: "Design a livery on the car's real UV layout",
    intro: "The Livery Mapper reads the vehicle's actual UV map so what you draw in 2D lands exactly where you expect in 3D.",
    toolSlug: "livery-mapper",
    faqs: [
      { question: "Do I need a vehicle with a livery slot?", answer: "No. The design is baked into the vehicle's body texture, so any unlocked add-on works." },
      { question: "Why are escrow vehicles rejected?", answer: "Escrowed resources (.fxap) are encrypted and cannot be read or modified. Use an unlocked vehicle." },
    ],
    related: ["import-an-addon-car-from-gta5-mods"],
    content: `## Workflow

1. Upload the vehicle \`.yft\` + \`.ytd\` or a resource ZIP.
2. Modsmith extracts the UV layout and shows it as a template under the 2D canvas.
3. Add layers: images, logos, text, shapes. Each has opacity, rotation, scale, position and ordering.
4. The 3D preview updates live as you edit.
5. Export a patched vehicle with the baked texture and a manifest.

## Tips

- Work at 2048 for most cars; use 4096 only for hero vehicles.
- Keep logos as PNG with transparency.
- Use the undo history freely — it is unlimited within a session and saved projects persist across sessions.`,
  },
  {
    slug: "paint-on-3d-garments",
    category: "clothing",
    title: "Paint on 3D garments",
    intro: "Paint on the actual garment mesh, manage texture variants and export a complete add-on clothing resource.",
    toolSlug: "clothing-textures",
    faqs: [
      { question: "Can I use my own .ydd?", answer: "Yes. Upload a .ydd with its .ytd, or a ZIP. Or pick a garment from the built-in library." },
      { question: "How many variants can I export?", answer: "Up to 26 texture variants per garment (a through z), matching the game's variant convention." },
    ],
    related: ["ydd-ytd-and-clothing-variants"],
    content: `## The editor

Left: the 3D garment on a ped. Right: the 2D texture editor with the UV wireframe overlay. Painting on either side updates the other.

Tools include brush, eraser, image placement, text, shapes, opacity and transform, with unlimited undo/redo.

## Export

Each variant becomes a texture in the \`.ytd\`; the worker writes the \`.ydd\`, \`.ymt\`, \`.meta\` and \`fxmanifest.lua\` so the resource streams as an add-on garment.`,
  },
  {
    slug: "weapon-skins-for-vanilla-weapons",
    category: "weapons",
    title: "Weapon skins for vanilla weapons",
    intro: "Pick any of 190+ vanilla weapons, design camos on UV guides and batch-export them into one resource.",
    toolSlug: "weapon-skins",
    faqs: [
      { question: "Can I put several skins in one resource?", answer: "Yes — select multiple designs and export once. The resource contains all selected skins." },
    ],
    related: [],
    content: `## Steps

1. Choose a weapon from the library.
2. Design on the UV template with layers, logos, text and colours.
3. Preview in 3D.
4. Add more camo designs, then **Export selected**.

The exported resource replaces the weapon's texture dictionary per skin and includes a manifest.`,
  },
  {
    slug: "tattoo-packs-for-every-framework",
    category: "tattoos",
    title: "Tattoo packs for every framework",
    intro: "Place tattoos on a 3D ped and export a pack with configuration for standalone, ESX, QBCore, Qbox, illenium-appearance and rcore.",
    toolSlug: "tattoo-creator",
    faqs: [
      { question: "What resolution should my artwork be?", answer: "PNG with transparency, 1024 px or larger on the long edge. The worker downsamples to the body region's texture size." },
    ],
    related: [],
    content: `## Framework configs

The Tattoo Creator generates the overlay definitions and, for each framework you tick, a config snippet:

- **standalone** — \`tattoos.json\` and a small loader
- **ESX / QBCore / Qbox** — framework-specific tattoo shop entries
- **illenium-appearance** — \`tattoos.lua\` block
- **rcore** — rcore_tattoos config

Everything ships in one ZIP with an \`INSTALL.md\`.`,
  },
  {
    slug: "why-zip-size-is-not-vram",
    category: "optimization",
    title: "Why ZIP size is not VRAM",
    intro: "A 40 MB resource can cost 600 MB of graphics memory. Here is why, and how the optimizer measures the real number.",
    toolSlug: "resource-optimizer",
    faqs: [
      { question: "What is the biggest win?", answer: "Down-sizing 4K textures that never appear larger than a few hundred pixels on screen, and generating mipmaps where they are missing." },
      { question: "Does optimization change my geometry?", answer: "No. The vehicle and map optimizers only touch textures and LOD flags." },
    ],
    related: ["prop-collision-and-lods-explained", "vehicle-optimizer-textures-without-touching-geometry"],
    content: `## Compressed on disk, expanded in memory

A DXT5 4096×4096 texture is about 21 MB on disk and roughly 21 MB in VRAM, but an uncompressed RGBA 4096×4096 texture is 64 MB in VRAM with mipmaps adding a third again. ZIP compression hides both. The optimizer expands every texture header, reads its format, dimensions and mip count, and sums the actual GPU cost.

## What the report shows

- Total resource size vs. **estimated VRAM**
- Every texture over 2048 px
- Textures without mipmaps
- Models missing LODs
- Severity, recommended action and before/after estimates

## Fixing it

Choose **Optimize** to have the worker down-size, generate mipmaps and re-compress textures within the limits you set, then download the optimized resource.`,
  },
  {
    slug: "vehicle-optimizer-textures-without-touching-geometry",
    category: "optimization",
    title: "Vehicle optimizer: fix textures without touching geometry",
    intro: "Safe texture optimization for vehicle resources: 4K clean-up, mipmaps and LOD checks.",
    toolSlug: "vehicle-optimizer",
    faqs: [],
    related: ["why-zip-size-is-not-vram"],
    content: `The vehicle optimizer analyses \`.ytd\` dictionaries and \`.yft\` drawables, flags unnecessary 4K textures, unused texture detail and missing or poor LODs, and applies texture changes only. Handling, skeleton and glass are never modified.`,
  },
  {
    slug: "ydr-ytyp-ytd-what-they-are",
    category: "file-formats",
    title: ".ydr, .ytyp and .ytd — what they are",
    intro: "The three files behind every streamed prop, and how the manifest ties them together.",
    faqs: [
      { question: "What is a .ytyp?", answer: "The archetype definition: name, bounding box, LOD distance, flags and the texture dictionary a drawable uses." },
    ],
    related: ["yft-ytd-and-vehicle-meta-files", "ydd-ytd-and-clothing-variants"],
    content: `| File | Contents |
| --- | --- |
| \`.ydr\` | Drawable: meshes, LODs, materials, bounds |
| \`.ytd\` | Texture dictionary |
| \`.ytyp\` | Archetype definitions referencing drawables |
| \`fxmanifest.lua\` | Declares \`data_file 'DLC_ITYP_REQUEST' 'stream/x.ytyp'\` and the stream folder |`,
  },
  {
    slug: "yft-ytd-and-vehicle-meta-files",
    category: "file-formats",
    title: ".yft, .ytd and vehicle meta files",
    intro: "Fragment drawables, texture dictionaries and the meta files an add-on vehicle needs.",
    faqs: [],
    related: ["ydr-ytyp-ytd-what-they-are"],
    content: `An add-on vehicle streams \`name.yft\`, \`name_hi.yft\` and \`name.ytd\`, and declares \`vehicles.meta\`, \`handling.meta\`, \`carcols.meta\` and \`carvariations.meta\` as data files in the manifest. Audio adds \`.awc\` and \`.rel\` files under \`audioconfig\` and \`sfx\`.`,
  },
  {
    slug: "ydd-ytd-and-clothing-variants",
    category: "file-formats",
    title: ".ydd, .ytd and clothing variants",
    intro: "How add-on clothing is named, streamed and given multiple texture variants.",
    faqs: [],
    related: ["paint-on-3d-garments"],
    content: `Garments stream as \`ped_component_XXX_u.ydd\` with textures named \`ped_diff_XXX_a_uni.ytd\`, \`_b_uni\`, and so on. The variant letter becomes the texture index in game.`,
  },
  {
    slug: "prop-does-not-appear-in-game",
    category: "troubleshooting",
    title: "My prop does not appear in game",
    intro: "A checklist for props that stream but never show, or crash on spawn.",
    faqs: [
      { question: "The prop spawns but is invisible.", answer: "Usually a missing or misnamed texture dictionary. Check that the .ytyp's txdName matches the .ytd filename." },
    ],
    related: ["create-a-fivem-prop-from-any-3d-model"],
    content: `1. Is the resource \`ensure\`d and does the console show it starting?
2. Does the manifest declare the ytyp with \`data_file\`?
3. Is the model name in your spawn command exactly the archetype name (lower-case)?
4. Is the LOD distance larger than the distance you are spawning from?
5. Check the F8 console for texture dictionary errors.`,
  },
];

export async function seedGuides(prisma: PrismaClient) {
  const catIds: Record<string, string> = {};
  for (const c of categories) {
    const cat = await prisma.guideCategory.upsert({ where: { slug: c.slug }, create: c, update: { name: c.name, description: c.description, icon: c.icon, sortOrder: c.sortOrder } });
    catIds[c.slug] = cat.id;
  }
  for (const g of guides) {
    await prisma.guide.upsert({
      where: { slug: g.slug },
      create: {
        slug: g.slug,
        categoryId: catIds[g.category]!,
        title: g.title,
        intro: g.intro,
        content: g.content,
        seoTitle: g.seoTitle ?? null,
        seoDescription: g.seoDescription ?? null,
        faqs: g.faqs,
        relatedSlugs: g.related,
        toolSlug: g.toolSlug ?? null,
        state: "PUBLISHED",
        publishedAt: new Date(),
      },
      update: {},
    });
  }
}
