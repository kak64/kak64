import { ApiFailure, ErrorCodes, LIMITS, getTool } from "@modsmith/core";

export const EXT_MIME: Record<string, string[]> = {
  ".obj": ["text/plain", "application/octet-stream", "model/obj"],
  ".mtl": ["text/plain", "application/octet-stream"],
  ".fbx": ["application/octet-stream"],
  ".gltf": ["model/gltf+json", "application/json", "text/plain"],
  ".glb": ["model/gltf-binary", "application/octet-stream"],
  ".dae": ["model/vnd.collada+xml", "application/xml", "text/xml", "text/plain"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".dds": ["image/vnd-ms.dds", "application/octet-stream"],
  ".svg": ["image/svg+xml"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".rar": ["application/vnd.rar", "application/x-rar-compressed"],
  ".7z": ["application/x-7z-compressed"],
  ".oiv": ["application/zip", "application/octet-stream"],
  ".yft": ["application/octet-stream"],
  ".ydr": ["application/octet-stream"],
  ".ydd": ["application/octet-stream"],
  ".ytd": ["application/octet-stream"],
  ".ytyp": ["application/octet-stream"],
  ".ybn": ["application/octet-stream"],
};

const DANGEROUS_EXT = new Set([".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".js", ".vbs", ".scr", ".msi", ".com", ".jar", ".lnk", ".hta"]);

export function extOf(name: string) {
  const m = /(\.[A-Za-z0-9]+)$/.exec(name.toLowerCase());
  return m ? m[1]! : "";
}

export function validateUploadRequest(toolSlug: string, fileName: string, sizeBytes: number) {
  const tool = getTool(toolSlug);
  if (!tool) throw new ApiFailure(ErrorCodes.NOT_FOUND, "Unknown tool", 404);
  const ext = extOf(fileName);
  if (!ext || DANGEROUS_EXT.has(ext)) throw new ApiFailure(ErrorCodes.INVALID_FILE, "This file type is not allowed", 400);
  const allowed = tool.accepts.filter((a) => a.startsWith("."));
  if (allowed.length && !allowed.includes(ext)) throw new ApiFailure(ErrorCodes.INVALID_FILE, `${ext} files are not accepted by ${tool.name}. Accepted: ${allowed.join(", ")}`, 400);
  if (sizeBytes <= 0 || sizeBytes > LIMITS.UPLOAD_MAX_BYTES) throw new ApiFailure(ErrorCodes.FILE_TOO_LARGE, "File exceeds the maximum upload size", 413);
  if (fileName.length > 255 || /[\\/]/.test(fileName) || fileName.includes("..")) throw new ApiFailure(ErrorCodes.INVALID_FILE, "Invalid file name", 400);
  return { ext, tool };
}

/** Detect the real content type from the first bytes. Returns null if unknown/binary. */
export function sniffMime(head: Buffer): string | null {
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 12 && head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (head.length >= 4 && head.subarray(0, 4).toString("ascii") === "DDS ") return "image/vnd-ms.dds";
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)) return "application/zip";
  if (head.length >= 7 && head.subarray(0, 7).toString("ascii") === "Rar!\x1a\x07\x00") return "application/vnd.rar";
  if (head.length >= 6 && head.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) return "application/x-7z-compressed";
  if (head.length >= 4 && head.subarray(0, 4).toString("ascii") === "glTF") return "model/gltf-binary";
  if (head.length >= 18 && head.subarray(0, 18).toString("ascii") === "Kaydara FBX Binary") return "application/octet-stream";
  if (head.length >= 2 && (head[0] === 0x4d && head[1] === 0x5a)) return "application/x-msdownload"; // PE executable
  if (head.length >= 4 && head.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return "application/x-elf";
  if (head.length >= 4 && head.subarray(0, 4).toString("ascii") === "RSC7") return "application/octet-stream"; // RAGE resource
  const text = head.subarray(0, 512).toString("utf8");
  if (/^\s*\{/.test(text) && /"asset"/.test(text)) return "model/gltf+json";
  if (/^\s*<\?xml/.test(text) || /<COLLADA/.test(text)) return "application/xml";
  if (/^(#|v |vn |vt |f |o |g |mtllib |usemtl |newmtl )/m.test(text)) return "text/plain";
  // ASCII FBX
  if (/FBXHeaderExtension/.test(text)) return "application/octet-stream";
  return null;
}

/** Cross-check declared extension against sniffed bytes. Throws on spoofing. */
export function verifyContent(fileName: string, head: Buffer) {
  const ext = extOf(fileName);
  const sniffed = sniffMime(head);
  if (sniffed === "application/x-msdownload" || sniffed === "application/x-elf") throw new ApiFailure(ErrorCodes.INVALID_FILE, "Executable content detected", 400);
  const allowed = EXT_MIME[ext];
  if (!allowed) throw new ApiFailure(ErrorCodes.INVALID_FILE, "Unsupported file type", 400);
  if (sniffed && !allowed.includes(sniffed)) {
    // binary formats: accept octet-stream where the sniffer found nothing specific
    throw new ApiFailure(ErrorCodes.INVALID_FILE, `File content does not match its ${ext} extension`, 400);
  }
  if (!sniffed && [".png", ".jpg", ".jpeg", ".webp", ".zip", ".glb", ".dds"].includes(ext)) {
    throw new ApiFailure(ErrorCodes.INVALID_FILE, `File does not look like a valid ${ext.slice(1).toUpperCase()} file`, 400);
  }
  return sniffed ?? "application/octet-stream";
}
