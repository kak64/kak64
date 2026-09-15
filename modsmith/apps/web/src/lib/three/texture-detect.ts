/**
 * Texture role detection from file names and fuzzy assignment of texture files to material names.
 * Pure functions — safe on server and client.
 */
export type TextureRole = "baseColor" | "normal" | "roughness" | "metalness" | "unknown";

const ROLE_PATTERNS: { role: TextureRole; re: RegExp }[] = [
  { role: "normal", re: /(?:^|[_\-.\s])(n|nrm|nor|norm|normal|normalmap|normals|bump)(?:$|[_\-.\s\d])/i },
  { role: "roughness", re: /(?:^|[_\-.\s])(r|rough|roughness|rgh|gloss|glossiness|spec|specular|s)(?:$|[_\-.\s\d])/i },
  { role: "metalness", re: /(?:^|[_\-.\s])(m|met|metal|metallic|metalness|metallness)(?:$|[_\-.\s\d])/i },
  { role: "baseColor", re: /(?:^|[_\-.\s])(d|diff|diffuse|col|color|colour|albedo|basecolor|base_color|base|bc|a|dif)(?:$|[_\-.\s\d])/i },
];

export const TEXTURE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".dds", ".tga", ".bmp"];
export const MODEL_EXTENSIONS = [".obj", ".fbx", ".gltf", ".glb", ".dae"];

export function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? `.${m[1]!.toLowerCase()}` : "";
}
export function isTextureFile(name: string) { return TEXTURE_EXTENSIONS.includes(extOf(name)); }
export function isModelFile(name: string) { return MODEL_EXTENSIONS.includes(extOf(name)); }
export function isZipFile(name: string) { return extOf(name) === ".zip"; }

/** Strip directory and extension. */
export function baseName(name: string) {
  const file = name.split(/[\\/]/).pop() ?? name;
  return file.replace(/\.[^.]+$/, "");
}

/** Detect which PBR slot a texture belongs to from its filename suffix (e.g. wood_n.png → normal). */
export function detectTextureRole(fileName: string): TextureRole {
  const base = baseName(fileName).toLowerCase();
  for (const { role, re } of ROLE_PATTERNS) if (re.test(base)) return role;
  return "unknown";
}

/** Remove the role suffix so `crate_normal` and `crate_d` share the stem `crate`. */
export function textureStem(fileName: string) {
  let base = baseName(fileName).toLowerCase();
  base = base.replace(/(?:[_\-.\s])(n|nrm|nor|norm|normal|normalmap|normals|bump|r|rough|roughness|rgh|gloss|glossiness|spec|specular|s|m|met|metal|metallic|metalness|d|diff|diffuse|col|color|colour|albedo|basecolor|base_color|base|bc|a|dif)(?:\d+)?$/i, "");
  return base.replace(/[^a-z0-9]+/g, "");
}

function normalizeName(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, ""); }

/** Similarity in [0,1] based on longest common substring and containment. */
export function nameSimilarity(a: string, b: string) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85 * (Math.min(x.length, y.length) / Math.max(x.length, y.length)) + 0.15;
  // longest common substring (small inputs → O(n*m) is fine)
  let best = 0;
  const prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diag = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j]!;
      if (x[i - 1] === y[j - 1]) { prev[j] = diag + 1; if (prev[j]! > best) best = prev[j]!; } else prev[j] = 0;
      diag = tmp;
    }
  }
  return best / Math.max(x.length, y.length);
}

export type TextureAssignment = Partial<Record<Exclude<TextureRole, "unknown">, string>>;

/**
 * Assign texture files (by name) to materials (by name). Textures whose stem best matches a material name go to it;
 * if there is a single material, every recognised texture goes there. Unknown-role textures become baseColor when the
 * material has none yet.
 */
export function autoAssignTextures(materialNames: string[], textureNames: string[], threshold = 0.35): Record<string, TextureAssignment> {
  const out: Record<string, TextureAssignment> = {};
  for (const m of materialNames) out[m] = {};
  if (!materialNames.length) return out;
  for (const tex of textureNames) {
    const role = detectTextureRole(tex);
    const stem = textureStem(tex);
    let target: string | undefined;
    if (materialNames.length === 1) target = materialNames[0];
    else {
      let bestScore = 0;
      for (const m of materialNames) {
        const score = Math.max(nameSimilarity(stem, m), nameSimilarity(baseName(tex), m));
        if (score > bestScore) { bestScore = score; target = m; }
      }
      if (bestScore < threshold) target = undefined;
    }
    if (!target) continue;
    const slot = out[target]!;
    const key = role === "unknown" ? "baseColor" : role;
    if (!slot[key]) slot[key] = tex;
  }
  return out;
}
