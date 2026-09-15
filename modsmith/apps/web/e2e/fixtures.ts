import { deflateSync } from "node:zlib";

/**
 * Fixture builders. These produce genuinely valid files (real geometry, a real PNG) so that a
 * successful end-to-end export proves the pipeline did actual work rather than passing a stub through.
 */

/** Minimal PNG encoder (RGBA, no filtering) — avoids pulling an image library into the test suite. */
export function encodePng(width: number, height: number, rgba: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = rgba(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A 64×64 checkerboard used as the cube's base colour texture. */
export function checkerTexture(): Buffer {
  return encodePng(64, 64, (x, y) => (((x >> 3) + (y >> 3)) % 2 === 0 ? [232, 120, 40, 255] : [40, 44, 56, 255]));
}

/**
 * A complete, valid GLB containing a 1 m textured cube: 24 vertices (per-face normals and UVs),
 * 36 indices, one PBR material with an embedded PNG base-colour texture.
 */
export function cubeGlb(): Buffer {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const faces: { n: [number, number, number]; c: [number, number, number][] }[] = [
    { n: [0, 0, 1], c: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], c: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { n: [1, 0, 0], c: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { n: [-1, 0, 0], c: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, 1, 0], c: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], c: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  ];
  const uvQuad: [number, number][] = [[0, 1], [1, 1], [1, 0], [0, 0]];
  for (const [f, face] of faces.entries()) {
    const base = f * 4;
    for (const [i, corner] of face.c.entries()) {
      positions.push(...corner);
      normals.push(...face.n);
      uvs.push(...uvQuad[i]!);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const posBuf = Buffer.from(new Float32Array(positions).buffer);
  const nrmBuf = Buffer.from(new Float32Array(normals).buffer);
  const uvBuf = Buffer.from(new Float32Array(uvs).buffer);
  const idxBuf = Buffer.from(new Uint16Array(indices).buffer);
  const png = checkerTexture();

  const pad4 = (b: Buffer) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]));
  const parts = [posBuf, nrmBuf, uvBuf, idxBuf, png].map(pad4);
  const offsets: number[] = [];
  let cursor = 0;
  for (const p of parts) { offsets.push(cursor); cursor += p.length; }
  const bin = Buffer.concat(parts);

  const min = [-0.5, -0.5, -0.5];
  const max = [0.5, 0.5, 0.5];
  const gltf = {
    asset: { version: "2.0", generator: "modsmith-e2e-fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Cube" }],
    meshes: [{ name: "Cube", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
    materials: [{ name: "CubeMaterial", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.1, roughnessFactor: 0.8 } }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [{ bufferView: 4, mimeType: "image/png", name: "checker" }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: nrmBuf.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: uvBuf.length, target: 34962 },
      { buffer: 0, byteOffset: offsets[3], byteLength: idxBuf.length, target: 34963 },
      { buffer: 0, byteOffset: offsets[4], byteLength: png.length },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonChunk = json.length % 4 === 0 ? json : Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.write("JSON", 4, "ascii");
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.write("BIN\0", 4, "ascii");
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin]);
}

/**
 * A structurally valid GLB describing an empty scene. It passes upload validation (correct magic
 * bytes and JSON chunk) but carries no geometry, so the prop processor must reject it rather than
 * report a successful build.
 */
export function emptyGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0", generator: "modsmith-e2e-fixture" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [] }), "utf8");
  const chunk = json.length % 4 === 0 ? json : Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + chunk.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(chunk.length, 0);
  chunkHeader.write("JSON", 4, "ascii");
  return Buffer.concat([header, chunkHeader, chunk]);
}

/** A ZIP containing a loose oversized PNG — enough for the optimizer to report a real finding. */
export function resourceZip(): Buffer {
  const png = encodePng(512, 512, (x, y) => [x & 255, y & 255, 128, 255]);
  const files: { name: string; data: Buffer }[] = [
    { name: "my_resource/fxmanifest.lua", data: Buffer.from("fx_version 'cerulean'\ngame 'gta5'\n\nfiles { 'stream/big.png' }\n") },
    { name: "my_resource/stream/big.png", data: png },
  ];
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const comp = deflateSync(f.data).subarray(2, -4); // raw deflate
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + comp.length;
  }
  const centralSize = centrals.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
