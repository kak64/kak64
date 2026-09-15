/**
 * Jenkins one-at-a-time hashing ("joaat") as used throughout RAGE for name
 * hashes, plus lookup tables for the shader and shader-parameter names that
 * appear in GTA V drawables.
 *
 * RAGE lowercases names before hashing; the tables here are built by hashing
 * the known name strings at module load, so they cannot drift from the
 * algorithm.
 *
 * @packageDocumentation
 */

/**
 * Jenkins one-at-a-time hash over the UTF-8/ASCII bytes of `value`.
 *
 * @param value - Name to hash.
 * @param caseSensitive - When `false` (the default, and what RAGE does for
 *   resource name hashes) the string is lowercased first.
 * @returns Unsigned 32-bit hash.
 *
 * Verified: matches the published joaat test vectors (`""` → 0,
 * `"a"` → 0xCA2E9442) in the unit tests.
 */
export function joaat(value: string, caseSensitive = false): number {
  const s = caseSensitive ? value : value.toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h >>> 0;
}

/** Shader (`.sps` / `ShaderFX`) names commonly found in GTA V drawables. */
export const SHADER_NAMES: readonly string[] = [
  "default",
  "default_um",
  "default_detail",
  "default_spec",
  "default_terrain_wet",
  "normal",
  "normal_um",
  "normal_spec",
  "normal_spec_detail",
  "normal_spec_detail_dpm",
  "normal_spec_dpm",
  "normal_spec_reflect",
  "normal_spec_reflect_decal",
  "normal_spec_emissive",
  "normal_detail",
  "normal_decal",
  "normal_reflect",
  "normal_cubemap_reflect",
  "spec",
  "spec_decal",
  "spec_reflect",
  "spec_const",
  "spec_screendooralpha",
  "emissive",
  "emissive_additive_alpha",
  "emissive_additive_uv_alpha",
  "emissive_alpha",
  "emissive_clip",
  "emissivenight",
  "emissivenight_geomnightonly",
  "emissivestrong",
  "emissivestrong_alpha",
  "decal",
  "decal_dirt",
  "decal_glue",
  "decal_normal_only",
  "decal_spec_only",
  "decal_tnt",
  "cutout",
  "cutout_fence",
  "cutout_fence_normal",
  "cutout_hard",
  "glass",
  "glass_breakable",
  "glass_emissive",
  "glass_emissivenight",
  "glass_normal_spec_reflect",
  "glass_reflect",
  "glass_spec",
  "water",
  "water_river",
  "water_shallow",
  "terrain_cb_4lyr",
  "terrain_cb_4lyr_2tex",
  "terrain_cb_w_4lyr",
  "trees",
  "trees_lod",
  "trees_normal",
  "trees_normal_diffspec",
  "trees_normal_spec",
  "grass",
  "grass_batch",
  "vehicle_paint1",
  "vehicle_paint1_enveff",
  "vehicle_paint2",
  "vehicle_paint3",
  "vehicle_paint4",
  "vehicle_paint4_enveff",
  "vehicle_paint5_enveff",
  "vehicle_paint6",
  "vehicle_paint7",
  "vehicle_paint8",
  "vehicle_paint9",
  "vehicle_mesh",
  "vehicle_mesh_enveff",
  "vehicle_mesh2_enveff",
  "vehicle_vehglass",
  "vehicle_vehglass_inner",
  "vehicle_badges",
  "vehicle_tire",
  "vehicle_licenseplate",
  "vehicle_lightsemissive",
  "vehicle_interior",
  "vehicle_interior2",
  "vehicle_shuts",
  "vehicle_track",
  "vehicle_track2",
  "vehicle_cloth",
  "vehicle_cloth2",
  "vehicle_decal",
  "vehicle_detail",
  "vehicle_detail2",
  "vehicle_generic",
  "vehicle_blurredrotor",
  "vehicle_blurredrotor_emissive",
  "vehicle_dash_emissive",
  "vehicle_dash_emissive_opaque",
  "ped",
  "ped_default",
  "ped_alpha",
  "ped_cloth",
  "ped_cloth_enveff",
  "ped_decal",
  "ped_decal_decoration",
  "ped_decal_expensive",
  "ped_decal_nodiff",
  "ped_default_cloth",
  "ped_default_enveff",
  "ped_default_mp",
  "ped_default_palette",
  "ped_emissive",
  "ped_enveff",
  "ped_fur",
  "ped_hair_cutout_alpha",
  "ped_hair_spiked",
  "ped_nopeddamagedecals",
  "ped_palette",
  "ped_wrinkle",
  "ped_wrinkle_cloth",
  "ped_wrinkle_cloth_enveff",
  "ped_wrinkle_cs",
  "ped_wrinkle_enveff",
  "cloth_default",
  "cloth_normal_spec",
  "cloth_normal_spec_alpha",
  "cloth_normal_spec_cutout",
  "cloth_normal_spec_tnt",
  "cloth_spec_alpha",
  "weapon_normal_spec",
  "weapon_normal_spec_alpha",
  "weapon_normal_spec_cutout_palette",
  "weapon_normal_spec_detail_palette",
  "weapon_normal_spec_detail_tnt",
  "weapon_normal_spec_palette",
  "weapon_normal_spec_tnt",
  "weapon_emissive_tnt",
  "minimap",
  "mirror_default",
  "mirror_crack",
  "radar",
  "gta_default",
  "alpha",
  "cpv_only",
  "distance_map",
  "parallax",
  "parallax_specmap",
  "reflect",
  "reflect_alpha",
  "reflect_decal",
];

/** Shader parameter names (texture samplers and numeric parameters). */
export const SHADER_PARAM_NAMES: readonly string[] = [
  // Texture samplers
  "DiffuseSampler",
  "DiffuseSampler2",
  "DiffuseSampler3",
  "DiffuseExtraSampler",
  "BumpSampler",
  "BumpSampler2",
  "BumpSampler3",
  "SpecSampler",
  "SpecularSampler",
  "DetailSampler",
  "TintPaletteSampler",
  "EnvironmentSampler",
  "HeightSampler",
  "PlateBgSampler",
  "PlateBgBumpSampler",
  "FontSampler",
  "FontNormalSampler",
  "DirtSampler",
  "DirtBumpSampler",
  "SnowSampler",
  "SnowSampler0",
  "DamageSampler",
  "DistanceMapSampler",
  "StippleSampler",
  "TextureSampler_layer0",
  "TextureSampler_layer1",
  "TextureSampler_layer2",
  "TextureSampler_layer3",
  "BumpSampler_layer0",
  "BumpSampler_layer1",
  "BumpSampler_layer2",
  "BumpSampler_layer3",
  "lookupSampler",
  "WrinkleMaskSampler_0",
  "WrinkleMaskSampler_1",
  "WrinkleMaskSampler_2",
  "WrinkleMaskSampler_3",
  "WrinkleSampler_0",
  "WrinkleSampler_1",
  "AnisoNoiseSpecSampler",
  "FlowSampler",
  "FogSampler",
  "comboHeightSamplerFvB",
  // Numeric / vector parameters
  "bumpiness",
  "specularIntensityMult",
  "specularFalloffMult",
  "specularFresnel",
  "specMapIntMask",
  "detailSettings",
  "globalAnisoMultiplier",
  "matMaterialColorScale",
  "matDiffuseColor",
  "matDiffuseColor2",
  "emissiveMultiplier",
  "emissiveHDRMultiplier",
  "alphaScale",
  "hardAlphaBlend",
  "useTessellation",
  "wetnessMultiplier",
  "envEffThickness",
  "envEffScale",
  "envEffTexTileUV",
  "dirtLevelMod",
  "dirtDecalMask",
  "parallaxSelfShadowAmount",
  "heightScale",
  "heightBias",
  "reflectivePower",
  "windGlobalParams",
  "umGlobalParams",
  "umGlobalOverrideParams",
  "TintPaletteSelector",
  "bumpSelfShadowAmount",
  "DiffuseTexTileUV",
  "BumpTexTileUV",
  "SpecTexTileUV",
  "gDeferredLightMixer",
  "gLodFadeTileScale",
  "usetessellation",
  "TextureSamplerDiffPal",
];

function buildTable(names: readonly string[]): ReadonlyMap<number, string> {
  const m = new Map<number, string>();
  for (const n of names) {
    m.set(joaat(n), n);
    // Names are also seen hashed case-sensitively in some tooling; register
    // that form too when it differs, without clobbering the canonical entry.
    const cs = joaat(n, true);
    if (!m.has(cs)) m.set(cs, n);
  }
  return m;
}

/** joaat(lowercased shader name) → canonical shader name. */
export const SHADER_HASHES: ReadonlyMap<number, string> = buildTable(SHADER_NAMES);

/** joaat(shader parameter name) → canonical parameter name (original casing). */
export const SHADER_PARAM_HASHES: ReadonlyMap<number, string> = buildTable(SHADER_PARAM_NAMES);

/**
 * Resolve a shader name hash.
 *
 * @returns The known name, or `hash_XXXXXXXX` when unknown.
 */
export function shaderNameFromHash(hash: number): string {
  return SHADER_HASHES.get(hash >>> 0) ?? `hash_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Resolve a shader parameter name hash.
 *
 * @returns The known name, or `hash_XXXXXXXX` when unknown.
 */
export function paramNameFromHash(hash: number): string {
  return SHADER_PARAM_HASHES.get(hash >>> 0) ?? `hash_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** True when `name` came from {@link shaderNameFromHash} as an unknown hash. */
export function isUnknownHashName(name: string): boolean {
  return /^hash_[0-9a-f]{8}$/.test(name);
}
