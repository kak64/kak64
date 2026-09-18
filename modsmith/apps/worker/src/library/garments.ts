/**
 * Garment library metadata for the Clothing Textures tool.
 *
 * Important: base-game garment meshes are NOT redistributable, so this library only
 * describes the component slots, UV sizes and the drawable naming the exporter needs.
 * When a user picks a library garment, the worker builds the texture side of the
 * add-on (the .ytd variants + metadata) and the README tells them which .ydd to copy
 * from their own game files. Uploading a .ydd produces a fully self-contained resource.
 */
export interface GarmentEntry {
  id: string;
  label: string;
  /** FiveM/GTA component slot. */
  component: "berd" | "hair" | "torso" | "legs" | "feet" | "teef" | "accs" | "task" | "decl" | "jbib";
  componentId: number;
  gender: "male" | "female" | "both";
  /** Texture size the UV template is authored at. */
  textureSize: 1024 | 2048;
  /** Drawable name pattern inside the add-on resource. */
  drawablePattern: string;
  /** Base-game drawable the user must supply (we never ship game assets). */
  sourceHint: string;
  tags: string[];
}

const g = (
  id: string,
  label: string,
  component: GarmentEntry["component"],
  componentId: number,
  gender: GarmentEntry["gender"],
  sourceHint: string,
  tags: string[],
  textureSize: 1024 | 2048 = 1024,
): GarmentEntry => ({
  id,
  label,
  component,
  componentId,
  gender,
  textureSize,
  drawablePattern: `${component}_000_<variant>`,
  sourceHint,
  tags,
});

export const GARMENTS: GarmentEntry[] = [
  g("tshirt_basic", "Basic T-shirt", "jbib", 11, "both", "mp_m_freemode_01 / jbib_000 (undershirt uppr_000)", ["top", "casual"]),
  g("tshirt_vneck", "V-neck T-shirt", "jbib", 11, "both", "mp_m_freemode_01 / jbib_015", ["top", "casual"]),
  g("hoodie", "Pullover hoodie", "jbib", 11, "both", "mp_m_freemode_01 / jbib_035", ["top", "streetwear"], 2048),
  g("zip_hoodie", "Zip hoodie", "jbib", 11, "both", "mp_m_freemode_01 / jbib_052", ["top", "streetwear"], 2048),
  g("bomber_jacket", "Bomber jacket", "jbib", 11, "both", "mp_m_freemode_01 / jbib_026", ["outerwear"], 2048),
  g("varsity_jacket", "Varsity jacket", "jbib", 11, "both", "mp_m_freemode_01 / jbib_042", ["outerwear"], 2048),
  g("tank_top", "Tank top", "jbib", 11, "both", "mp_m_freemode_01 / jbib_007", ["top", "summer"]),
  g("polo", "Polo shirt", "jbib", 11, "both", "mp_m_freemode_01 / jbib_011", ["top", "smart"]),
  g("button_shirt", "Button-up shirt", "jbib", 11, "both", "mp_m_freemode_01 / jbib_019", ["top", "smart"], 2048),
  g("suit_jacket", "Suit jacket", "jbib", 11, "both", "mp_m_freemode_01 / jbib_004", ["formal"], 2048),
  g("work_vest", "Hi-vis work vest", "jbib", 11, "both", "mp_m_freemode_01 / jbib_061", ["work", "uniform"]),
  g("jeans", "Jeans", "legs", 4, "both", "mp_m_freemode_01 / lowr_000", ["bottom", "casual"]),
  g("cargo_pants", "Cargo pants", "legs", 4, "both", "mp_m_freemode_01 / lowr_010", ["bottom", "tactical"]),
  g("joggers", "Joggers", "legs", 4, "both", "mp_m_freemode_01 / lowr_023", ["bottom", "streetwear"]),
  g("shorts", "Shorts", "legs", 4, "both", "mp_m_freemode_01 / lowr_014", ["bottom", "summer"]),
  g("suit_trousers", "Suit trousers", "legs", 4, "both", "mp_m_freemode_01 / lowr_004", ["formal"]),
  g("sneakers", "Sneakers", "feet", 6, "both", "mp_m_freemode_01 / feet_002", ["shoes"]),
  g("boots", "Work boots", "feet", 6, "both", "mp_m_freemode_01 / feet_012", ["shoes", "work"]),
  g("dress_shoes", "Dress shoes", "feet", 6, "both", "mp_m_freemode_01 / feet_007", ["shoes", "formal"]),
  g("cap", "Baseball cap", "berd", 1, "both", "mp_m_freemode_01_p / p_head_000", ["hat", "prop"]),
  g("beanie", "Beanie", "berd", 1, "both", "mp_m_freemode_01_p / p_head_015", ["hat", "prop"]),
  g("backpack", "Backpack", "task", 5, "both", "mp_m_freemode_01 / teef/task_000", ["bag"]),
  g("gloves", "Gloves", "accs", 3, "both", "mp_m_freemode_01 / hand_000", ["accessory"]),
  g("chain_accessory", "Neck chain", "decl", 8, "both", "mp_m_freemode_01 / accs_000", ["accessory"]),
];

export const GARMENTS_BY_ID: Record<string, GarmentEntry> = Object.fromEntries(GARMENTS.map((x) => [x.id, x]));

export function findGarment(id: string): GarmentEntry | undefined {
  return GARMENTS_BY_ID[id];
}

/** Component slot → the three-letter drawable prefix FiveM expects in an add-on clothing resource. */
export const COMPONENT_PREFIX: Record<GarmentEntry["component"], string> = {
  berd: "berd",
  hair: "hair",
  torso: "uppr",
  legs: "lowr",
  feet: "feet",
  teef: "teef",
  accs: "accs",
  task: "task",
  decl: "decl",
  jbib: "jbib",
};

export function componentPrefix(component: string): string {
  return COMPONENT_PREFIX[component as GarmentEntry["component"]] ?? component.toLowerCase().slice(0, 4);
}
