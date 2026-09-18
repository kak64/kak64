#!/usr/bin/env node
// Writes a valid GLB containing a 1 m textured cube (24 vertices, 12 triangles, embedded PNG).
// Dependency-free so the smoke test can run before anything is installed.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function encodePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const table = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (buf) => { let c = 0xffffffff; for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function cubeGlb() {
  const positions = [], normals = [], uvs = [], indices = [];
  const faces = [
    { n: [0, 0, 1], c: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], c: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { n: [1, 0, 0], c: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { n: [-1, 0, 0], c: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, 1, 0], c: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], c: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  ];
  const quad = [[0, 1], [1, 1], [1, 0], [0, 0]];
  faces.forEach((face, f) => {
    const base = f * 4;
    face.c.forEach((corner, i) => { positions.push(...corner); normals.push(...face.n); uvs.push(...quad[i]); });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const pad4 = (b) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]));
  const png = encodePng(64, 64, (x, y) => (((x >> 3) + (y >> 3)) % 2 === 0 ? [232, 120, 40, 255] : [40, 44, 56, 255]));
  const parts = [Buffer.from(new Float32Array(positions).buffer), Buffer.from(new Float32Array(normals).buffer), Buffer.from(new Float32Array(uvs).buffer), Buffer.from(new Uint16Array(indices).buffer), png].map(pad4);
  const offsets = []; let cursor = 0;
  for (const p of parts) { offsets.push(cursor); cursor += p.length; }
  const bin = Buffer.concat(parts);
  const gltf = {
    asset: { version: "2.0", generator: "modsmith-test-cube" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "Cube" }],
    meshes: [{ name: "Cube", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
    materials: [{ name: "CubeMaterial", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.1, roughnessFactor: 0.8 } }],
    textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [{ bufferView: 4, mimeType: "image/png", name: "checker" }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: parts[0].length, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: parts[1].length, target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: parts[2].length, target: 34962 },
      { buffer: 0, byteOffset: offsets[3], byteLength: parts[3].length, target: 34963 },
      { buffer: 0, byteOffset: offsets[4], byteLength: png.length },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonChunk = json.length % 4 === 0 ? json : Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii"); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.write("JSON", 4, "ascii");
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write("BIN\0", 4, "ascii");
  return Buffer.concat([header, jh, jsonChunk, bh, bin]);
}

const out = process.argv[2] ?? "cube.glb";
writeFileSync(out, cubeGlb());
console.log(`wrote ${out}`);
