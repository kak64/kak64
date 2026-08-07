import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { listZipEntries, extractDocxText, extractPdfText, docxXmlToText, readabilityScore } from '../src/core/docparse.js';
import { reviewDocument } from '../src/core/docreview.js';

const inflateRaw = async (b) => new Uint8Array(zlib.inflateRawSync(b));
const inflate = async (b) => new Uint8Array(zlib.inflateSync(b));
const enc = (s) => new TextEncoder().encode(s);

// --- Build a minimal ZIP (one entry, raw-deflated) with a real central dir ---
function buildZip(name, contentBytes) {
  const nameB = enc(name);
  const comp = zlib.deflateRawSync(Buffer.from(contentBytes));
  const crc = zlib.crc32 ? zlib.crc32(Buffer.from(contentBytes)) : 0;
  const parts = [];
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8); // deflate
  localHeader.writeUInt32LE(crc >>> 0, 14);
  localHeader.writeUInt32LE(comp.length, 18);
  localHeader.writeUInt32LE(contentBytes.length, 22);
  localHeader.writeUInt16LE(nameB.length, 26);
  localHeader.writeUInt16LE(0, 28);
  const localOffset = 0;
  parts.push(localHeader, Buffer.from(nameB), comp);

  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt16LE(20, 6);
  cdh.writeUInt16LE(8, 10);
  cdh.writeUInt32LE(crc >>> 0, 16);
  cdh.writeUInt32LE(comp.length, 20);
  cdh.writeUInt32LE(contentBytes.length, 24);
  cdh.writeUInt16LE(nameB.length, 28);
  cdh.writeUInt32LE(localOffset, 42);
  const cdStart = localHeader.length + nameB.length + comp.length;
  parts.push(cdh, Buffer.from(nameB));

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdh.length + nameB.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  parts.push(eocd);
  return new Uint8Array(Buffer.concat(parts));
}

const DOC_XML = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>בניין A קומה 3 דירה 12</w:t></w:r></w:p>
<w:p><w:r><w:t>מטבח: נקודות מים בגובה 60 ס"מ</w:t></w:r><w:r><w:t xml:space="preserve"> ואינטרפוץ 42 ס"מ</w:t></w:r></w:p>
<w:p><w:r><w:t>ממ"ד לפי ת"י 4422</w:t></w:r></w:p>
</w:body></w:document>`;

test('docxXmlToText: paragraphs and runs joined, entities decoded', () => {
  const t = docxXmlToText('<w:p><w:r><w:t>a</w:t></w:r><w:r><w:t>b &amp; c</w:t></w:r></w:p><w:p><w:r><w:t>line2</w:t></w:r></w:p>');
  assert.equal(t, 'ab & c\nline2');
});

test('extractDocxText: reads word/document.xml from a real zip', async () => {
  const zip = buildZip('word/document.xml', enc(DOC_XML));
  assert.ok(listZipEntries(zip).some((e) => e.name === 'word/document.xml'));
  const text = await extractDocxText(zip, { inflateRaw });
  assert.match(text, /בניין A קומה 3 דירה 12/);
  assert.match(text, /אינטרפוץ 42 ס"מ/);
});

test('extractDocxText: throws for a non-docx zip', async () => {
  const zip = buildZip('readme.txt', enc('hello'));
  await assert.rejects(() => extractDocxText(zip, { inflateRaw }), /document\.xml/);
});

// --- PDF: build a tiny PDF with one uncompressed + one flate content stream ---
function buildPdf() {
  const flateContent = zlib.deflateSync(Buffer.from('BT (Building B) Tj ET'));
  const parts = [];
  parts.push('%PDF-1.4\n');
  parts.push('1 0 obj\n<< /Length 40 >>\nstream\n');
  parts.push('BT (קומה 2 מטבח 60) Tj ET\n');
  parts.push('endstream\nendobj\n');
  parts.push('2 0 obj\n<< /Length ' + flateContent.length + ' /Filter /FlateDecode >>\nstream\n');
  const head = Buffer.from(parts.join(''), 'utf-8'); // Hebrew stored as UTF-8 bytes
  const tail = Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1');
  return new Uint8Array(Buffer.concat([head, flateContent, tail]));
}

test('extractPdfText: pulls text from raw and flate streams', async () => {
  const pdf = buildPdf();
  const text = await extractPdfText(pdf, { inflate });
  assert.match(text, /קומה 2 מטבח 60/);
  assert.match(text, /Building B/);
});

test('readabilityScore: high for prose, low for binary garble', () => {
  assert.ok(readabilityScore('בניין A קומה 3 דירה 12') > 0.7);
  assert.ok(readabilityScore('\x01\x02\x7f\x80\x81\x82\x99') < 0.3);
});

// --- reviewDocument over the extracted docx text ---
test('reviewDocument: extracts building/floor/apartment/rooms/dims/standards', async () => {
  const zip = buildZip('word/document.xml', enc(DOC_XML));
  const text = await extractDocxText(zip, { inflateRaw });
  const r = reviewDocument({ text, kind: 'docx', filename: 'נופי_הים.docx' });
  assert.equal(r.readable, true);
  assert.equal(r.fields.building, 'A');
  assert.equal(r.fields.maxFloor, 3);
  assert.equal(r.fields.maxApartment, 12);
  assert.ok(r.fields.rooms.some((x) => x.name === 'מטבח'));
  assert.ok(r.fields.rooms.some((x) => x.name === 'ממ"ד'));
  assert.ok(r.fields.dimensions.length >= 2);
  assert.ok(r.fields.standards.includes('ת"י 4422'));
  assert.ok(r.fields.categoryIds.includes('plumbing'));
  assert.ok(r.confidence > 40);
  assert.equal(r.profile.hasMamad, true);
  assert.ok(r.mustVerify.length >= 3);
});

test('reviewDocument: unreadable text yields honest low-confidence warning', () => {
  const r = reviewDocument({ text: '\x01\x02\x03 \x99\x80', kind: 'pdf', filename: 'scan.pdf' });
  assert.equal(r.readable, false);
  assert.ok(r.confidence <= 40);
  assert.ok(r.warnings.some((w) => /סרוק|מקודד|קריא/.test(w)));
  assert.ok(r.mustVerify.length >= 3);
});

test('reviewDocument: category detection maps disciplines', () => {
  const r = reviewDocument({ text: 'עבודות חשמל: לוח חשמל וממסר פחת. מיזוג אוויר VRF. איטום גג ביריעות.', kind: 'docx' });
  assert.ok(r.fields.categoryIds.includes('electric'));
  assert.ok(r.fields.categoryIds.includes('hvac'));
  assert.ok(r.fields.categoryIds.includes('sealing'));
});
