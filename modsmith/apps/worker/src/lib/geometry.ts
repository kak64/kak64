import { computeNormals, type MeshData } from "./mesh";

/** Procedural geometry used by the chain (accessory) creator. */

export interface TorusOptions {
  radius: number;
  tube: number;
  radialSegments?: number;
  tubularSegments?: number;
}

type Vec3 = [number, number, number];

interface Builder {
  positions: number[];
  uvs: number[];
  indices: number[];
}

function newBuilder(): Builder {
  return { positions: [], uvs: [], indices: [] };
}

function pushVertex(b: Builder, p: Vec3, uv: [number, number]): number {
  b.positions.push(p[0], p[1], p[2]);
  b.uvs.push(uv[0], uv[1]);
  return b.positions.length / 3 - 1;
}

function toMesh(b: Builder, name: string, material: string): MeshData {
  const mesh: MeshData = {
    name,
    material,
    positions: new Float32Array(b.positions),
    uvs: new Float32Array(b.uvs),
    indices: new Uint32Array(b.indices),
  };
  return { ...mesh, normals: computeNormals(mesh) };
}

function transformPoint(p: Vec3, rotX: number, rotZ: number, offset: Vec3): Vec3 {
  // rotate around X then Z, then translate
  let [x, y, z] = p;
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  const cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x + offset[0], y + offset[1], z + offset[2]];
}

/** A torus (chain link) placed at `offset`, rotated about X then Z. */
export function torus(opts: TorusOptions & { offset?: Vec3; rotX?: number; rotZ?: number; b?: Builder }): Builder {
  const b = opts.b ?? newBuilder();
  const radial = opts.radialSegments ?? 8;
  const tubular = opts.tubularSegments ?? 12;
  const base = b.positions.length / 3;
  for (let j = 0; j <= tubular; j++) {
    const v = (j / tubular) * Math.PI * 2;
    for (let i = 0; i <= radial; i++) {
      const u = (i / radial) * Math.PI * 2;
      const x = (opts.radius + opts.tube * Math.cos(u)) * Math.cos(v);
      const y = (opts.radius + opts.tube * Math.cos(u)) * Math.sin(v);
      const z = opts.tube * Math.sin(u);
      const p = transformPoint([x, y, z], opts.rotX ?? 0, opts.rotZ ?? 0, opts.offset ?? [0, 0, 0]);
      pushVertex(b, p, [j / tubular, i / radial]);
    }
  }
  const stride = radial + 1;
  for (let j = 0; j < tubular; j++) {
    for (let i = 0; i < radial; i++) {
      const a = base + j * stride + i;
      const c = base + (j + 1) * stride + i;
      b.indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  return b;
}

/** An axis-aligned box from min/max corners. */
export function box(min: Vec3, max: Vec3, b: Builder = newBuilder()): Builder {
  const base = b.positions.length / 3;
  const corners: Vec3[] = [
    [min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]],
    [min[0], min[1], max[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]],
  ];
  const uvs: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < corners.length; i++) pushVertex(b, corners[i]!, uvs[i]!);
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];
  for (const f of faces) b.indices.push(base + f[0]!, base + f[1]!, base + f[2]!);
  return b;
}

/** A capsule-free cylinder along Z (pendant bail, rope segments). */
export function cylinder(radius: number, height: number, segments = 12, offset: Vec3 = [0, 0, 0], b: Builder = newBuilder()): Builder {
  const base = b.positions.length / 3;
  for (let ring = 0; ring < 2; ring++) {
    const z = offset[2] + (ring === 0 ? -height / 2 : height / 2);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pushVertex(b, [offset[0] + Math.cos(a) * radius, offset[1] + Math.sin(a) * radius, z], [i / segments, ring]);
    }
  }
  const stride = segments + 1;
  for (let i = 0; i < segments; i++) {
    const a = base + i;
    const c = base + stride + i;
    b.indices.push(a, c, a + 1, a + 1, c, c + 1);
  }
  // Caps
  const centreBottom = pushVertex(b, [offset[0], offset[1], offset[2] - height / 2], [0.5, 0.5]);
  const centreTop = pushVertex(b, [offset[0], offset[1], offset[2] + height / 2], [0.5, 0.5]);
  for (let i = 0; i < segments; i++) {
    b.indices.push(centreBottom, base + i + 1, base + i);
    b.indices.push(centreTop, base + stride + i, base + stride + i + 1);
  }
  return b;
}

/** Catenary curve points between (-halfWidth, 0) and (halfWidth, 0) sagging by `sag`. */
export function catenaryPoints(halfWidth: number, sag: number, count: number): Vec3[] {
  const a = Math.max(0.01, (halfWidth * halfWidth) / (2 * Math.max(sag, 0.001)));
  const points: Vec3[] = [];
  const y0 = a * Math.cosh(halfWidth / a);
  for (let i = 0; i < count; i++) {
    const t = -halfWidth + (i / (count - 1)) * halfWidth * 2;
    const y = a * Math.cosh(t / a) - y0;
    points.push([t, y, 0]);
  }
  return points;
}

/** 5×7 block font used for extruded lettering (A–Z, 0–9, space). */
export const BLOCK_FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "11110", "10001", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
  F: ["11111", "10000", "11110", "10000", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "11111", "10001", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "11100", "10100", "10010", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
  Y: ["10001", "01010", "00100", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00010", "00100", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
};

export interface LetteringOptions {
  text: string;
  /** Height of a glyph in metres. */
  height?: number;
  depth?: number;
  spacing?: number;
}

/** Extruded block lettering (one box per lit cell, merged rows to keep the triangle count sane). */
export function lettering(opts: LetteringOptions): MeshData {
  const height = opts.height ?? 0.04;
  const depth = opts.depth ?? 0.008;
  const cell = height / 7;
  const spacing = opts.spacing ?? cell;
  const text = opts.text.toUpperCase().slice(0, 12);
  const b = newBuilder();
  let cursor = 0;
  for (const ch of text) {
    const glyph = BLOCK_FONT[ch] ?? BLOCK_FONT[" "]!;
    for (let row = 0; row < glyph.length; row++) {
      const line = glyph[row]!;
      let run = 0;
      for (let col = 0; col <= line.length; col++) {
        const lit = line[col] === "1";
        if (lit) {
          run++;
          continue;
        }
        if (run > 0) {
          const startCol = col - run;
          const x0 = cursor + startCol * cell;
          const x1 = cursor + col * cell;
          const y1 = height - row * cell;
          const y0 = y1 - cell;
          box([x0, y0, -depth / 2], [x1, y1, depth / 2], b);
          run = 0;
        }
      }
    }
    cursor += 5 * cell + spacing;
  }
  // Centre horizontally around the origin.
  const width = Math.max(0.0001, cursor - spacing);
  for (let i = 0; i < b.positions.length; i += 3) {
    b.positions[i] = b.positions[i]! - width / 2;
    b.positions[i + 1] = b.positions[i + 1]! - height / 2;
  }
  return toMesh(b, "lettering", "chain_metal");
}

export interface ChainOptions {
  style: "cuban-chain" | "rope-chain" | "tennis-chain";
  /** Half-width of the chain span in metres. */
  halfWidth?: number;
  sag?: number;
  links?: number;
  linkRadius?: number;
  tube?: number;
  material?: string;
}

/** Build a chain of interlocking links following a catenary curve. */
export function chainMesh(opts: ChainOptions): MeshData {
  const halfWidth = opts.halfWidth ?? 0.09;
  const sag = opts.sag ?? 0.06;
  const links = opts.links ?? (opts.style === "tennis-chain" ? 44 : 34);
  const linkRadius = opts.linkRadius ?? (opts.style === "cuban-chain" ? 0.0075 : 0.006);
  const tube = opts.tube ?? (opts.style === "cuban-chain" ? 0.0028 : 0.0018);
  const points = catenaryPoints(halfWidth, sag, links);
  const b = newBuilder();
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const next = points[Math.min(i + 1, points.length - 1)]!;
    const prev = points[Math.max(i - 1, 0)]!;
    const angle = Math.atan2(next[1] - prev[1], next[0] - prev[0]);
    if (opts.style === "tennis-chain") {
      // Alternating small links and "stone" settings.
      torus({ radius: linkRadius * 0.8, tube, radialSegments: 6, tubularSegments: 10, offset: p, rotX: Math.PI / 2, rotZ: angle, b });
      if (i % 2 === 0) box([p[0] - tube, p[1] - tube, -tube], [p[0] + tube, p[1] + tube, tube], b);
    } else if (opts.style === "rope-chain") {
      torus({ radius: linkRadius, tube, radialSegments: 6, tubularSegments: 10, offset: p, rotX: (i % 2 === 0 ? 1 : -1) * (Math.PI / 3), rotZ: angle, b });
    } else {
      // Cuban: flattened links alternating 90°.
      torus({ radius: linkRadius, tube, radialSegments: 6, tubularSegments: 12, offset: p, rotX: i % 2 === 0 ? Math.PI / 2 : 0, rotZ: angle, b });
    }
  }
  return toMesh(b, `${opts.style}`, opts.material ?? "chain_metal");
}

/** Pendant plate or disc hanging at the lowest point of the chain. */
export function pendant(kind: "round" | "plate", size: number, position: Vec3, material = "chain_metal"): MeshData {
  const b = newBuilder();
  if (kind === "round") {
    cylinder(size / 2, size * 0.18, 20, position, b);
  } else {
    box([position[0] - size / 2, position[1] - size * 0.7, position[2] - size * 0.09], [position[0] + size / 2, position[1] + size * 0.7, position[2] + size * 0.09], b);
  }
  // Bail (the loop that connects the pendant to the chain)
  torus({ radius: size * 0.16, tube: size * 0.05, radialSegments: 6, tubularSegments: 10, offset: [position[0], position[1] + size * (kind === "round" ? 0.55 : 0.8), position[2]], rotX: Math.PI / 2, b });
  return toMesh(b, `pendant_${kind}`, material);
}

export const MATERIAL_COLORS: Record<string, { color: string; metallic: number; roughness: number }> = {
  gold: { color: "#d4af37", metallic: 1, roughness: 0.22 },
  silver: { color: "#c0c5ce", metallic: 1, roughness: 0.18 },
  "rose-gold": { color: "#b76e79", metallic: 1, roughness: 0.24 },
  black: { color: "#1c1c1f", metallic: 0.9, roughness: 0.38 },
};
