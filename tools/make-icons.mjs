// Genera los íconos PNG de la PWA sin dependencias (node tools/make-icons.mjs).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const ACCENT = [0x5b, 0x3d, 0xf5];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Dibujo en coordenadas de 72×72 (igual que icons/icon.svg).
function drawer(size, { rounded, inset }) {
  const s = size / 72;
  const steps = [[14, 56], [24, 56], [24, 46], [36, 46], [36, 38], [46, 38], [46, 30]];
  return (x, y) => {
    let u = x / s; let v = y / s;
    // Para la versión "maskable" se reduce el dibujo al 80 % central.
    if (inset) { u = (u - 36) / 0.8 + 36; v = (v - 36) / 0.8 + 36; }
    if (rounded) {
      const r = 20; const cx = Math.min(Math.max(x / s, r), 72 - r); const cy = Math.min(Math.max(y / s, r), 72 - r);
      if (Math.hypot(x / s - cx, y / s - cy) > r) return [0, 0, 0, 0];
    }
    let white = 0;
    // Diagonal punteada.
    const dDiag = segDist(u, v, 14, 56, 58, 18);
    const along = Math.hypot(u - 14, v - 56);
    if (dDiag < 1.5 && along % 9 < 4.5) white = Math.max(white, 0.45);
    // Línea escalonada.
    for (let i = 0; i < steps.length - 1; i++) {
      if (segDist(u, v, ...steps[i], ...steps[i + 1]) < 2.5) white = 1;
    }
    if (Math.hypot(u - 46, v - 30) < 5) white = 1;
    const mix = (c) => Math.round(c + (255 - c) * white);
    return [mix(ACCENT[0]), mix(ACCENT[1]), mix(ACCENT[2]), 255];
  };
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
writeFileSync(new URL('../icons/icon-192.png', import.meta.url), png(192, drawer(192, { rounded: true })));
writeFileSync(new URL('../icons/icon-512.png', import.meta.url), png(512, drawer(512, { rounded: true })));
writeFileSync(new URL('../icons/maskable-512.png', import.meta.url), png(512, drawer(512, { inset: true })));
console.log('Íconos generados en icons/');
