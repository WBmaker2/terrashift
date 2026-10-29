import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('public/icons');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const globeR = size * 0.285;
  const orbitRx = size * 0.405;
  const orbitRy = size * 0.155;
  const rotation = -0.42;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const dotX = cx + Math.cos(rotation) * orbitRx * 0.97;
  const dotY = cy + Math.sin(rotation) * orbitRx * 0.97;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const nx = (x - cx) / size;
      const ny = (y - cy) / size;
      const dist = Math.hypot(x - cx, y - cy);
      let r = 4;
      let g = 16;
      let b = 22;
      let a = 255;
      const edge = Math.hypot(nx, ny) * 2;
      const bg = Math.max(0, 1 - edge * 0.8);
      r = 4 + bg * 7;
      g = 16 + bg * 17;
      b = 22 + bg * 22;
      if (dist < globeR) {
        const t = dist / globeR;
        const light = 1 - t * 0.55;
        const angle = Math.atan2(ny, nx);
        r = Math.round((18 + 26 * light + 8 * Math.sin(angle * 3)) * light);
        g = Math.round((82 + 78 * light + 10 * Math.cos(angle * 2)) * light);
        b = Math.round((112 + 80 * light + 8 * Math.sin(angle * 2)) * light);
        if (t > 0.93) {
          r = 150;
          g = 226;
          b = 238;
        }
      }
      const ox = x - cx;
      const oy = y - cy;
      const rx = ox * cosR - oy * sinR;
      const ry = ox * sinR + oy * cosR;
      const ellipse = (rx * rx) / (orbitRx * orbitRx) + (ry * ry) / (orbitRy * orbitRy);
      const ring = Math.abs(ellipse - 1) < 0.018;
      if (ring && dist > globeR * 0.82) {
        r = 241;
        g = 196;
        b = 122;
      }
      if (Math.hypot(x - dotX, y - dotY) < size * 0.035) {
        r = 255;
        g = 226;
        b = 168;
      }
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = a;
    }
  }
  return pixels;
}

for (const size of [192, 512]) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), png(size, drawIcon(size)));
}
