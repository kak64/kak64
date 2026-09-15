"use client";
/**
 * Procedural stand-in meshes. Base-game assets are not shipped with Modsmith, so library garments,
 * weapons, ped bodies and heads are represented by stylised primitives with sane UVs — enough to
 * place artwork and judge proportions before the real conversion happens on our workers.
 */
import * as THREE from "three";

export type Gender = "male" | "female";

function standard(name: string, color = "#9aa3b2") {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
  m.name = name;
  return m;
}

/** Ped body zones used by the Tattoo Creator. */
export const PED_ZONES = ["head", "torso", "left_arm", "right_arm", "left_leg", "right_leg"] as const;
export type PedZone = (typeof PED_ZONES)[number];

export const PED_ZONE_LABELS: Record<PedZone, string> = {
  head: "Head", torso: "Torso", left_arm: "Left arm", right_arm: "Right arm", left_leg: "Left leg", right_leg: "Right leg",
};

export interface ProceduralBody {
  object: THREE.Group;
  /** Mesh per zone so a zone can be raycast, highlighted and textured independently. */
  zones: Record<PedZone, THREE.Mesh>;
  dispose(): void;
}

/** Stylised 1.83 m humanoid with one named mesh per tattoo zone. */
export function buildPedBody(gender: Gender = "male"): ProceduralBody {
  const group = new THREE.Group();
  group.name = `ped_${gender}`;
  const wide = gender === "male";
  const shoulder = wide ? 0.2 : 0.17;
  const hip = wide ? 0.15 : 0.17;

  const make = (zone: PedZone, geometry: THREE.BufferGeometry, position: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, standard(zone, "#c8a48a"));
    mesh.name = zone;
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  };

  const zones = {
    head: make("head", new THREE.SphereGeometry(0.115, 32, 24), [0, 1.7, 0]),
    torso: make("torso", new THREE.CapsuleGeometry(shoulder, 0.54, 8, 32), [0, 1.22, 0]),
    left_arm: make("left_arm", new THREE.CapsuleGeometry(0.055, 0.56, 6, 20), [-shoulder - 0.08, 1.2, 0]),
    right_arm: make("right_arm", new THREE.CapsuleGeometry(0.055, 0.56, 6, 20), [shoulder + 0.08, 1.2, 0]),
    left_leg: make("left_leg", new THREE.CapsuleGeometry(0.08, 0.7, 6, 20), [-0.1, 0.48, 0]),
    right_leg: make("right_leg", new THREE.CapsuleGeometry(0.08, 0.7, 6, 20), [0.1, 0.48, 0]),
  } satisfies Record<PedZone, THREE.Mesh>;

  // hips: visual only, not a tattoo zone
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(hip, 0.1, 6, 24), standard("hips", "#c8a48a"));
  hips.name = "hips";
  hips.position.set(0, 0.92, 0);
  hips.raycast = () => {};
  group.add(hips);

  return {
    object: group,
    zones,
    dispose() {
      group.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m?.dispose());
      });
    },
  };
}

/** Head-only preview for the Face Skin Creator; the face texture maps onto the front hemisphere. */
export function buildHead(gender: Gender = "male") {
  const group = new THREE.Group();
  group.name = "ped_head";
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 36), standard("head", "#d3b39a"));
  skull.scale.set(0.86, 1.08, 0.94);
  skull.name = "head";
  group.add(skull);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.28, 24), standard("neck", "#c8a48a"));
  neck.position.y = -0.6;
  neck.name = "neck";
  neck.raycast = () => {};
  group.add(neck);
  if (gender === "female") skull.scale.set(0.82, 1.06, 0.9);
  return { object: group, head: skull };
}

// ───────── Garments ─────────

export type GarmentShape = "top" | "undershirt" | "torso" | "legs" | "shoes" | "hat" | "mask" | "glasses" | "accessory" | "bag";

/** Simple garment stand-in with UVs; the material is always named `garment`. */
export function buildGarmentPlaceholder(shape: GarmentShape, gender: Gender = "male"): THREE.Group {
  const group = new THREE.Group();
  group.name = `garment_${shape}`;
  const mat = standard("garment", "#8e97a8");
  const add = (geometry: THREE.BufferGeometry, position: [number, number, number], rotation?: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = "garment";
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh);
  };
  const chest = gender === "male" ? 0.23 : 0.2;
  switch (shape) {
    case "top":
    case "undershirt":
    case "torso":
      add(new THREE.CylinderGeometry(chest, chest * 0.92, 0.66, 32, 1, true), [0, 1.22, 0]);
      add(new THREE.CylinderGeometry(0.075, 0.07, 0.5, 16, 1, true), [-chest - 0.07, 1.22, 0], [0, 0, 0.12]);
      add(new THREE.CylinderGeometry(0.075, 0.07, 0.5, 16, 1, true), [chest + 0.07, 1.22, 0], [0, 0, -0.12]);
      break;
    case "legs":
      add(new THREE.CylinderGeometry(0.105, 0.09, 0.86, 20, 1, true), [-0.1, 0.55, 0]);
      add(new THREE.CylinderGeometry(0.105, 0.09, 0.86, 20, 1, true), [0.1, 0.55, 0]);
      add(new THREE.CylinderGeometry(0.19, 0.17, 0.2, 24, 1, true), [0, 0.98, 0]);
      break;
    case "shoes":
      add(new THREE.BoxGeometry(0.12, 0.1, 0.3), [-0.1, 0.05, 0.04]);
      add(new THREE.BoxGeometry(0.12, 0.1, 0.3), [0.1, 0.05, 0.04]);
      break;
    case "hat":
      add(new THREE.CylinderGeometry(0.135, 0.135, 0.14, 28, 1, true), [0, 1.78, 0]);
      add(new THREE.CircleGeometry(0.21, 28), [0, 1.71, 0.04], [-Math.PI / 2, 0, 0]);
      break;
    case "mask":
      add(new THREE.SphereGeometry(0.13, 24, 18, 0, Math.PI), [0, 1.68, 0], [0, Math.PI, 0]);
      break;
    case "glasses":
      add(new THREE.BoxGeometry(0.26, 0.05, 0.02), [0, 1.72, 0.1]);
      break;
    case "bag":
      add(new THREE.BoxGeometry(0.26, 0.34, 0.14), [0, 1.2, -0.2]);
      break;
    default:
      add(new THREE.BoxGeometry(0.25, 0.25, 0.1), [0, 1.3, 0]);
  }
  return group;
}

// ───────── Weapons ─────────

export type WeaponShape = "pistol" | "smg" | "rifle" | "shotgun" | "sniper" | "heavy" | "melee" | "thrown";

/** Chunky weapon stand-in per category; the material is always named `weapon_skin`. */
export function buildWeaponPlaceholder(shape: WeaponShape): THREE.Group {
  const group = new THREE.Group();
  group.name = `weapon_${shape}`;
  const mat = standard("weapon_skin", "#6d7583");
  const add = (w: number, h: number, d: number, position: [number, number, number], rotation?: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.name = "weapon_skin";
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh);
  };
  switch (shape) {
    case "pistol":
      add(0.22, 0.09, 0.04, [0, 0.06, 0]); add(0.07, 0.16, 0.035, [-0.06, -0.06, 0], [0, 0, 0.22]);
      break;
    case "smg":
      add(0.36, 0.09, 0.05, [0, 0.06, 0]); add(0.07, 0.16, 0.04, [-0.08, -0.06, 0]); add(0.06, 0.2, 0.04, [0.02, -0.08, 0]);
      break;
    case "shotgun":
      add(0.62, 0.08, 0.07, [0.05, 0.06, 0]); add(0.16, 0.12, 0.06, [-0.3, 0.0, 0], [0, 0, 0.2]);
      break;
    case "sniper":
      add(0.9, 0.07, 0.05, [0.1, 0.05, 0]); add(0.2, 0.06, 0.06, [0.05, 0.12, 0]); add(0.18, 0.13, 0.05, [-0.38, -0.01, 0], [0, 0, 0.18]);
      break;
    case "heavy":
      add(0.7, 0.14, 0.14, [0.05, 0.06, 0]); add(0.14, 0.18, 0.1, [-0.28, -0.04, 0]);
      break;
    case "melee":
      add(0.06, 0.5, 0.02, [0, 0.16, 0]); add(0.05, 0.14, 0.05, [0, -0.16, 0]);
      break;
    case "thrown":
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 16), mat));
      group.children[0]!.name = "weapon_skin";
      break;
    case "rifle":
    default:
      add(0.56, 0.09, 0.05, [0.02, 0.06, 0]); add(0.08, 0.17, 0.04, [-0.12, -0.06, 0]); add(0.16, 0.1, 0.045, [-0.3, 0.05, 0]); add(0.05, 0.2, 0.04, [0.04, -0.08, 0]);
  }
  return group;
}

// ───────── Chains & accessories ─────────

export type ChainModel = "cuban-chain" | "rope-chain" | "tennis-chain" | "pendant-round" | "pendant-plate" | "lettering";
export type ChainMaterialKey = "gold" | "silver" | "rose-gold" | "black";

const CHAIN_MATERIALS: Record<ChainMaterialKey, { color: string; metalness: number; roughness: number }> = {
  gold: { color: "#e5b53c", metalness: 1, roughness: 0.22 },
  silver: { color: "#d7dbe2", metalness: 1, roughness: 0.18 },
  "rose-gold": { color: "#e0a08a", metalness: 1, roughness: 0.24 },
  black: { color: "#1e222b", metalness: 0.9, roughness: 0.4 },
};

/** Blocky 3D lettering — one extruded box per glyph, enough to judge width and placement. */
function letteringGroup(text: string, material: THREE.Material) {
  const group = new THREE.Group();
  const chars = text.toUpperCase().slice(0, 12).split("");
  const w = 0.045;
  const gap = 0.012;
  const total = chars.length * (w + gap) - gap;
  chars.forEach((ch, i) => {
    if (ch === " ") return;
    const h = /[QJGPY]/.test(ch) ? 0.075 : 0.065;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.016), material);
    mesh.name = `glyph_${i}`;
    mesh.position.set(-total / 2 + i * (w + gap) + w / 2, 0, 0);
    group.add(mesh);
  });
  return group;
}

export interface ChainOptions {
  baseModel: ChainModel;
  material: ChainMaterialKey;
  text?: string;
  scale?: number;
  position?: [number, number, number];
}

/** Procedural chain/pendant preview: links follow a catenary-ish curve around the neck. */
export function buildChain({ baseModel, material, text = "", scale = 1, position = [0, 0, 0] }: ChainOptions): THREE.Group {
  const spec = CHAIN_MATERIALS[material];
  const mat = new THREE.MeshStandardMaterial({ color: spec.color, metalness: spec.metalness, roughness: spec.roughness });
  mat.name = "accessory";
  const group = new THREE.Group();
  group.name = `accessory_${baseModel}`;

  const needsChain = baseModel !== "lettering";
  if (needsChain) {
    const linkCount = baseModel === "tennis-chain" ? 46 : 30;
    const radius = 0.16;
    for (let i = 0; i <= linkCount; i++) {
      const t = i / linkCount;
      const angle = Math.PI * (0.12 + t * 0.76);
      const x = Math.cos(angle) * radius;
      const drop = Math.sin(Math.PI * t) * 0.1;
      const z = Math.sin(angle) * radius * 0.6;
      let geo: THREE.BufferGeometry;
      if (baseModel === "tennis-chain") geo = new THREE.BoxGeometry(0.012, 0.012, 0.012);
      else if (baseModel === "rope-chain") geo = new THREE.TorusGeometry(0.013, 0.005, 6, 12);
      else geo = new THREE.TorusGeometry(0.016, 0.0065, 6, 14);
      const link = new THREE.Mesh(geo, mat);
      link.name = "accessory";
      link.position.set(x, 1.42 - drop, z + 0.06);
      link.rotation.set(Math.PI / 2, i % 2 === 0 ? 0 : Math.PI / 2, angle);
      group.add(link);
    }
  }

  const pendantY = needsChain ? 1.3 : 1.36;
  if (baseModel === "pendant-round") {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 32), mat);
    p.rotation.x = Math.PI / 2;
    p.position.set(0, pendantY, 0.08);
    p.name = "accessory";
    group.add(p);
  } else if (baseModel === "pendant-plate") {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.012), mat);
    p.position.set(0, pendantY, 0.08);
    p.name = "accessory";
    group.add(p);
    if (text) { const g = letteringGroup(text, mat); g.position.set(0, pendantY, 0.09); g.scale.setScalar(0.7); group.add(g); }
  } else if (baseModel === "lettering" || text) {
    const g = letteringGroup(text || "MODSMITH", mat);
    g.position.set(0, pendantY, 0.085);
    group.add(g);
  }

  group.scale.setScalar(scale);
  group.position.set(...position);
  return group;
}

export function disposeGroup(group: THREE.Object3D) {
  group.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m?.dispose());
  });
}
