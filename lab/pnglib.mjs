// Shared helpers for the icon re-render scripts: an analytic dot-grid
// renderer (supersampled circle coverage) and a minimal RGBA8 PNG encoder.

import { deflateSync } from 'node:zlib';

const SS = 16; // supersamples per axis per pixel

// pattern: array of rows, each an array of [r,g,b] or null.
// Dot centers sit at first + pitch*i on both axes; d is the dot diameter.
export function renderDots({ size, pattern, first, pitch, d }) {
  const rgba = new Uint8Array(size * size * 4);
  const r = d / 2;

  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      const color = pattern[row][col];
      if (!color) continue;
      const cx = first + pitch * col;
      const cy = first + pitch * row;

      for (let y = Math.floor(cy - r); y < Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x < Math.ceil(cx + r); x++) {
          let inside = 0;
          for (let sy = 0; sy < SS; sy++) {
            for (let sx = 0; sx < SS; sx++) {
              const dx = x + (sx + 0.5) / SS - cx;
              const dy = y + (sy + 0.5) / SS - cy;
              if (dx * dx + dy * dy <= r * r) inside++;
            }
          }
          const alpha = Math.round((inside / (SS * SS)) * 255);
          if (alpha === 0) continue;
          rgba.set([...color, alpha], (y * size + x) * 4);
        }
      }
    }
  }
  return rgba;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
