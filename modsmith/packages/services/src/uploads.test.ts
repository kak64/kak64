import { describe, expect, it } from "vitest";
import { sniffMime, verifyContent, validateUploadRequest } from "./uploads";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const exe = Buffer.from("MZ\x90\x00\x03\x00", "binary");

describe("upload validation", () => {
  it("sniffs png and zip", () => {
    expect(sniffMime(png)).toBe("image/png");
    expect(sniffMime(zip)).toBe("application/zip");
  });
  it("rejects spoofed MIME (png bytes with .zip name)", () => {
    expect(() => verifyContent("model.zip", png)).toThrow(/does not match/);
  });
  it("rejects executables regardless of name", () => {
    expect(() => verifyContent("texture.png", exe)).toThrow(/Executable/);
  });
  it("rejects invalid extension for a tool", () => {
    expect(() => validateUploadRequest("prop-creator", "virus.exe", 10)).toThrow(/not allowed/);
    expect(() => validateUploadRequest("prop-creator", "sound.mp3", 10)).toThrow(/not accepted/);
  });
  it("rejects oversized files", () => {
    expect(() => validateUploadRequest("prop-creator", "big.glb", 3 * 1024 ** 3)).toThrow(/maximum upload size/);
  });
  it("accepts a valid glb", () => {
    expect(validateUploadRequest("prop-creator", "chair.glb", 1000).ext).toBe(".glb");
    expect(verifyContent("chair.glb", Buffer.from("glTF\x02\x00\x00\x00", "binary"))).toBe("model/gltf-binary");
  });
});
