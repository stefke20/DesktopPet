'use strict';
// Minimal PNG encoder (RGBA, 8-bit) so we can make tray / mock icons without assets.
const zlib = require('node:zlib');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A cute ginger cat face, drawn procedurally. */
function catIcon(size = 32) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, r, g, b, a = 255) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const o = (y * size + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a; };
  const s = size / 32;
  const inTri = (px_, py_, a, b, c) => { const sg = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]); const d1 = sg([px_, py_], a, b), d2 = sg([px_, py_], b, c), d3 = sg([px_, py_], c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const X = x / s, Y = y / s;
    const head = ((X - 16) / 12.5) ** 2 + ((Y - 19) / 10.5) ** 2 <= 1;
    const earL = inTri(X, Y, [4, 14], [6, 2], [14, 9]), earR = inTri(X, Y, [28, 14], [26, 2], [18, 9]);
    const edgeHead = head && ((X - 16) / 11.3) ** 2 + ((Y - 19) / 9.4) ** 2 > 1;
    if (head || earL || earR) {
      if (edgeHead || (!head && !(inTri(X, Y, [6.5, 12], [7.2, 5], [12.5, 9.5]) || inTri(X, Y, [25.5, 12], [24.8, 5], [19.5, 9.5])))) put(x, y, 74, 34, 16);
      else if (!head) put(x, y, 255, 170, 160);
      else put(x, y, 242, 160, 74);
    }
    // eyes
    for (const ex of [11.5, 20.5]) if (((X - ex) / 2.3) ** 2 + ((Y - 19) / 3.1) ** 2 <= 1) put(x, y, 60, 190, 90);
    for (const ex of [11.5, 20.5]) if (((X - ex) / 0.9) ** 2 + ((Y - 19) / 2.5) ** 2 <= 1) put(x, y, 20, 12, 18);
    if (((X - 16) / 1.6) ** 2 + ((Y - 23) / 1.1) ** 2 <= 1) put(x, y, 255, 120, 140);
  }
  return encodePng(size, size, px);
}
module.exports = { encodePng, catIcon };
