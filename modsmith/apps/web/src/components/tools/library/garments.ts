/**
 * Built-in garment library.
 *
 * Base-game meshes are NOT shipped with Modsmith — picking a library garment gives you a stand-in mesh
 * with the right UV template size so you can lay artwork out, and the component/drawable ids the worker
 * needs to build an add-on clothing resource.
 */
import type { GarmentShape, Gender } from "@/components/three/procedural";

export interface GarmentItem {
  /** Stable id stored in the export config as `garmentId`. */
  id: string;
  name: string;
  drawableId: number;
}

export interface GarmentCategory {
  /** Value used for `config.component` (the DLC component name). */
  component: string;
  componentId: number;
  label: string;
  /** "component" slots live on the ped; "prop" slots are attached props (hats, glasses…). */
  slot: "component" | "prop";
  shape: GarmentShape;
  /** Native texture size for this slot — drives the design canvas resolution. */
  templateSize: number;
  items: Record<Gender, GarmentItem[]>;
}

const item = (id: string, name: string, drawableId: number): GarmentItem => ({ id, name, drawableId });

export const GARMENT_CATEGORIES: GarmentCategory[] = [
  {
    component: "jbib", componentId: 11, label: "Tops & jackets", slot: "component", shape: "top", templateSize: 1024,
    items: {
      male: [
        item("m_jbib_tshirt", "Plain T-shirt", 15), item("m_jbib_vneck", "V-neck tee", 8), item("m_jbib_hoodie", "Hoodie", 30),
        item("m_jbib_bomber", "Bomber jacket", 43), item("m_jbib_leather", "Leather jacket", 48), item("m_jbib_flannel", "Flannel shirt", 22),
        item("m_jbib_polo", "Polo shirt", 4), item("m_jbib_suit", "Suit jacket", 27), item("m_jbib_tanktop", "Tank top", 16),
        item("m_jbib_varsity", "Varsity jacket", 62), item("m_jbib_tracktop", "Track top", 68), item("m_jbib_workshirt", "Work shirt", 35),
      ],
      female: [
        item("f_jbib_tshirt", "Plain T-shirt", 14), item("f_jbib_croptop", "Crop top", 11), item("f_jbib_hoodie", "Hoodie", 31),
        item("f_jbib_bomber", "Bomber jacket", 44), item("f_jbib_leather", "Leather jacket", 49), item("f_jbib_blouse", "Blouse", 20),
        item("f_jbib_polo", "Polo shirt", 5), item("f_jbib_blazer", "Blazer", 28), item("f_jbib_tanktop", "Tank top", 17),
        item("f_jbib_varsity", "Varsity jacket", 63), item("f_jbib_tracktop", "Track top", 69), item("f_jbib_sweater", "Sweater", 36),
      ],
    },
  },
  {
    component: "accs", componentId: 8, label: "Undershirts", slot: "component", shape: "undershirt", templateSize: 1024,
    items: {
      male: [item("m_accs_tee", "Under tee", 15), item("m_accs_vest", "Vest", 2), item("m_accs_longsleeve", "Long sleeve", 31), item("m_accs_none", "None (skin)", 15)],
      female: [item("f_accs_tee", "Under tee", 14), item("f_accs_bra", "Bra top", 3), item("f_accs_longsleeve", "Long sleeve", 30), item("f_accs_none", "None (skin)", 14)],
    },
  },
  {
    component: "uppr", componentId: 3, label: "Torso & arms", slot: "component", shape: "torso", templateSize: 1024,
    items: {
      male: [item("m_uppr_bare", "Bare arms", 15), item("m_uppr_sleeves", "Rolled sleeves", 4), item("m_uppr_long", "Long sleeves", 11), item("m_uppr_gloves", "Gloves", 30)],
      female: [item("f_uppr_bare", "Bare arms", 15), item("f_uppr_sleeves", "Rolled sleeves", 5), item("f_uppr_long", "Long sleeves", 12), item("f_uppr_gloves", "Gloves", 31)],
    },
  },
  {
    component: "lowr", componentId: 4, label: "Legs", slot: "component", shape: "legs", templateSize: 1024,
    items: {
      male: [
        item("m_lowr_jeans", "Jeans", 0), item("m_lowr_cargo", "Cargo pants", 7), item("m_lowr_chinos", "Chinos", 10),
        item("m_lowr_shorts", "Shorts", 14), item("m_lowr_joggers", "Joggers", 21), item("m_lowr_suit", "Suit trousers", 24),
      ],
      female: [
        item("f_lowr_jeans", "Jeans", 1), item("f_lowr_leggings", "Leggings", 8), item("f_lowr_skirt", "Skirt", 11),
        item("f_lowr_shorts", "Shorts", 15), item("f_lowr_joggers", "Joggers", 22), item("f_lowr_suit", "Suit trousers", 25),
      ],
    },
  },
  {
    component: "feet", componentId: 6, label: "Shoes", slot: "component", shape: "shoes", templateSize: 512,
    items: {
      male: [item("m_feet_sneakers", "Sneakers", 1), item("m_feet_boots", "Boots", 8), item("m_feet_dress", "Dress shoes", 10), item("m_feet_hightops", "High tops", 14), item("m_feet_sandals", "Sandals", 19)],
      female: [item("f_feet_sneakers", "Sneakers", 2), item("f_feet_boots", "Boots", 9), item("f_feet_heels", "Heels", 11), item("f_feet_hightops", "High tops", 15), item("f_feet_sandals", "Sandals", 20)],
    },
  },
  {
    component: "berd", componentId: 1, label: "Masks", slot: "component", shape: "mask", templateSize: 512,
    items: {
      male: [item("m_berd_balaclava", "Balaclava", 5), item("m_berd_bandana", "Bandana", 9), item("m_berd_skimask", "Ski mask", 12), item("m_berd_face", "Face mask", 52)],
      female: [item("f_berd_balaclava", "Balaclava", 5), item("f_berd_bandana", "Bandana", 9), item("f_berd_skimask", "Ski mask", 12), item("f_berd_face", "Face mask", 52)],
    },
  },
  {
    component: "hand", componentId: 5, label: "Bags & parachutes", slot: "component", shape: "bag", templateSize: 512,
    items: {
      male: [item("m_hand_backpack", "Backpack", 1), item("m_hand_duffel", "Duffel bag", 4), item("m_hand_parachute", "Parachute", 7)],
      female: [item("f_hand_backpack", "Backpack", 1), item("f_hand_duffel", "Duffel bag", 4), item("f_hand_parachute", "Parachute", 7)],
    },
  },
  {
    component: "task", componentId: 9, label: "Body armour", slot: "component", shape: "torso", templateSize: 512,
    items: {
      male: [item("m_task_vest", "Armour vest", 1), item("m_task_plate", "Plate carrier", 5)],
      female: [item("f_task_vest", "Armour vest", 1), item("f_task_plate", "Plate carrier", 5)],
    },
  },
  {
    component: "decl", componentId: 10, label: "Decals & overlays", slot: "component", shape: "torso", templateSize: 1024,
    items: {
      male: [item("m_decl_chest", "Chest decal", 1), item("m_decl_back", "Back print", 3)],
      female: [item("f_decl_chest", "Chest decal", 1), item("f_decl_back", "Back print", 3)],
    },
  },
  {
    component: "p_head", componentId: 0, label: "Hats & helmets", slot: "prop", shape: "hat", templateSize: 512,
    items: {
      male: [item("m_phead_cap", "Baseball cap", 1), item("m_phead_beanie", "Beanie", 5), item("m_phead_bucket", "Bucket hat", 13), item("m_phead_helmet", "Helmet", 21), item("m_phead_cowboy", "Cowboy hat", 28)],
      female: [item("f_phead_cap", "Baseball cap", 1), item("f_phead_beanie", "Beanie", 5), item("f_phead_bucket", "Bucket hat", 13), item("f_phead_helmet", "Helmet", 21), item("f_phead_cowboy", "Cowboy hat", 28)],
    },
  },
  {
    component: "p_eyes", componentId: 1, label: "Glasses", slot: "prop", shape: "glasses", templateSize: 256,
    items: {
      male: [item("m_peyes_aviators", "Aviators", 4), item("m_peyes_wayfarer", "Wayfarers", 5), item("m_peyes_sports", "Sports glasses", 11)],
      female: [item("f_peyes_aviators", "Aviators", 4), item("f_peyes_wayfarer", "Wayfarers", 5), item("f_peyes_sports", "Sports glasses", 11)],
    },
  },
];

export function garmentCategory(component: string) {
  return GARMENT_CATEGORIES.find((c) => c.component === component) ?? GARMENT_CATEGORIES[0]!;
}

export function findGarment(component: string, gender: Gender, id: string) {
  return garmentCategory(component).items[gender].find((i) => i.id === id) ?? null;
}
