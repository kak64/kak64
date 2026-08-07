// BuildCheck Portal — client-side document text extraction.
// Reads a Word (.docx) or text-layer PDF into plain text with NO external
// libraries: .docx is a ZIP (read via the central directory, then inflate
// word/document.xml), PDFs are scanned for content streams whose text
// operators are pulled out. Decompression is injected so the same code runs
// in the browser (DecompressionStream) and in Node tests (zlib).
//
// HONEST LIMITS: streamed/encrypted ZIPs and scanned or CID-font PDFs may
// yield little or garbled text. Callers must treat low readability as
// "could not read" and fall back to manual verification — never as "clean".

const td = (bytes, enc = 'utf-8') => new TextDecoder(enc).decode(bytes);

function u16(dv, o) { return dv.getUint16(o, true); }
function u32(dv, o) { return dv.getUint32(o, true); }

// ---------------------------------------------------------------------------
// ZIP (central-directory based — robust to data descriptors)
// ---------------------------------------------------------------------------

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;

export function listZipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find End Of Central Directory by scanning backwards.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (u32(dv, i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('קובץ ZIP/DOCX לא תקין (חסר EOCD)');
  const count = u16(dv, eocd + 10);
  let p = u32(dv, eocd + 16); // central directory offset
  const entries = [];
  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (u32(dv, p) !== CDH_SIG) break;
    const method = u16(dv, p + 10);
    const compSize = u32(dv, p + 20);
    const nameLen = u16(dv, p + 28);
    const extraLen = u16(dv, p + 30);
    const commentLen = u16(dv, p + 32);
    const localOff = u32(dv, p + 42);
    const name = td(bytes.subarray(p + 46, p + 46 + nameLen));
    // Resolve the local header to find the real data offset.
    const lNameLen = u16(dv, localOff + 26);
    const lExtraLen = u16(dv, localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(dataStart, dataStart + compSize);
    entries.push({ name, method, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Extract readable text from a .docx.
 * @param {Uint8Array} bytes
 * @param {(b:Uint8Array)=>Promise<Uint8Array>} inflateRaw raw-deflate inflater
 */
export async function extractDocxText(bytes, { inflateRaw }) {
  const entries = listZipEntries(bytes);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new Error('לא נמצא word/document.xml — האם זה קובץ Word תקין?');
  const xmlBytes = doc.method === 0 ? doc.data : await inflateRaw(doc.data);
  return docxXmlToText(td(xmlBytes));
}

export function docxXmlToText(xml) {
  const paras = xml.split(/<\/w:p>/);
  const lines = paras.map((p) => {
    const withTabs = p.replace(/<w:tab\b[^>]*\/?>/g, '\t');
    const parts = [...withTabs.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXml(m[1]));
    return parts.join('');
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// PDF (best-effort text layer)
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF's content streams. Decompresses FlateDecode streams
 * (zlib) and pulls text from ( )Tj / [ ]TJ / < >Tj operators. Returns the
 * concatenated text (may be empty for scanned PDFs).
 * @param {(b:Uint8Array)=>Promise<Uint8Array>} inflate zlib inflater
 */
export async function extractPdfText(bytes, { inflate }) {
  const bin = latin1(bytes);
  const chunks = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(bin))) {
    const start = m.index + m[0].length;
    const end = bin.indexOf('endstream', start);
    if (end === -1) continue;
    let raw = bytes.subarray(start, end);
    // Trim a trailing EOL before endstream.
    let slice = bin.slice(start, end);
    let content = slice;
    if (/^[\s\S]*?FlateDecode/.test(bin.slice(Math.max(0, m.index - 400), m.index)) || looksDeflate(raw)) {
      try {
        const out = await inflate(raw);
        content = latin1(out);
      } catch { /* not a flate stream — use raw */ }
    }
    chunks.push(extractTextOps(content));
    re.lastIndex = end + 9;
  }
  const latinText = chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // Text operators may hold UTF-8 bytes (rare) or WinAnsi/Latin. Pick whichever
  // decodes to more readable characters.
  try {
    const raw = Uint8Array.from(latinText, (c) => c.charCodeAt(0) & 0xff);
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(raw);
    return readabilityScore(utf8) > readabilityScore(latinText) ? utf8 : latinText;
  } catch {
    return latinText;
  }
}

function looksDeflate(bytes) {
  // zlib header: CMF/FLG where (CMF*256+FLG) % 31 === 0 and CM===8.
  if (bytes.length < 2) return false;
  const cmf = bytes[0], flg = bytes[1];
  return (cmf & 0x0f) === 8 && ((cmf << 8) + flg) % 31 === 0;
}

function extractTextOps(content) {
  const out = [];
  // ( ... ) Tj  and  [ (..) -x (..) ] TJ
  const reTj = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  const reTJ = /\[((?:[^\][]|\\.)*)\]\s*TJ/g;
  const reHex = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  let m;
  while ((m = reTj.exec(content))) out.push(unescapePdf(m[1]));
  while ((m = reTJ.exec(content))) {
    const inner = [...m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)].map((x) => unescapePdf(x[1]));
    if (inner.length) out.push(inner.join(''));
  }
  while ((m = reHex.exec(content))) {
    const hex = m[1].replace(/\s+/g, '');
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    out.push(s);
  }
  return out.join(' ');
}

function unescapePdf(s) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => {
    switch (e) {
      case 'n': return '\n'; case 'r': return '\r'; case 't': return '\t';
      case 'b': return '\b'; case 'f': return '\f'; case '(': return '('; case ')': return ')'; case '\\': return '\\';
      default: return String.fromCharCode(parseInt(e, 8));
    }
  });
}

function latin1(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return s;
}

// ---------------------------------------------------------------------------
// Readability heuristic — is extracted text actually human-readable?
// ---------------------------------------------------------------------------

/** Ratio of Hebrew/Latin letters + digits + spaces among visible chars. */
export function readabilityScore(text) {
  if (!text) return 0;
  const visible = text.replace(/\s/g, '');
  if (visible.length === 0) return 0;
  const good = (text.match(/[֐-׿A-Za-z0-9]/g) || []).length;
  return good / visible.length;
}
