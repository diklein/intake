// Re-renders the Intake extension icons with geometry snapped to the pixel
// grid, so dot edges land on pixel boundaries instead of fractions (the
// source of the fuzziness in the original renders).
//
// Each size keeps its original simplified dot layout (the small sizes are
// deliberate reduced variants of the full 6x6 mark, not downscales):
//   16        -> 3x3 grid minus the bottom-right dot
//   32/48/64  -> 4x4 grid minus the two bottom-right dots
//   128       -> the full 6x6 mark
// Layouts and dot centers were measured from the original PNGs (frozen in
// lab/assets/before/); only dot diameters are rounded to the integer that
// puts edges on pixel boundaries, and the 48's pitch is regularized (it was
// a 0.75x downscale of the 64, so its centers had drifted to a 10/11/10
// rhythm). Dots are gray (not black) so the mark stays visible on dark-mode
// toolbars; the 128 was recolored to match the smaller sizes.
//
// Usage: node lab/render-marks.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDots, encodePng } from './pnglib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const G = [0x7d, 0x82, 0x88]; // gray — toolbar/UI surfaces that must survive dark mode
const D = [0x17, 0x19, 0x1b]; // dark — brand/marketing surfaces (store listing)
const R = [0xe5, 0x00, 0x00]; // red
const _ = null;

const PATTERN_3 = [
  [G, G, G],
  [R, R, R],
  [G, G, _],
];

const PATTERN_4 = [
  [G, G, G, G],
  [G, R, R, R],
  [R, R, R, G],
  [G, G, _, _],
];

const PATTERN_6 = [
  [G, G, G, G, G, G],
  [G, G, G, R, R, _],
  [R, R, R, R, R, R],
  [R, R, G, G, G, G],
  [G, G, G, G, G, _],
  [G, G, G, G, _, _],
];

// `first` is the center of the top-left dot; centers sit at first + pitch*i.
// In every case first +/- d/2 is an integer, so all dot edges land exactly
// on pixel boundaries.
//
// TWO toolbar proportions, one per browser. Safari draws toolbar icons inside
// generous containers — system glyphs (compare Share) hold to ~60% of the
// canvas, and the earlier ~85% renders read as oversized there. Chrome is the
// opposite: extension icons run near-full-bleed, and the ~60% marks read tiny
// next to neighbors. So extension/icons (the manifest's set — the shared
// manifest stays Chrome-shaped) carries ~85% marks, and extension/icons-safari
// carries the ~60% marks that the Xcode build phase swaps in for Safari.
// The 128 stays full-bleed everywhere — it lives on listing/management
// surfaces that pad themselves.
const CHROME_SIZES = [
  { size: 16, pattern: PATTERN_3, first: 3, pitch: 5, d: 4 },
  { size: 32, pattern: PATTERN_4, first: 5, pitch: 7, d: 6 },
  { size: 48, pattern: PATTERN_4, first: 7, pitch: 11, d: 8 },
  { size: 64, pattern: PATTERN_4, first: 9, pitch: 15, d: 10 },
  { size: 128, pattern: PATTERN_6, first: 24, pitch: 16, d: 10 },
];

const SAFARI_SIZES = [
  { size: 16, pattern: PATTERN_3, first: 4, pitch: 4, d: 2 },
  { size: 32, pattern: PATTERN_4, first: 8.5, pitch: 5, d: 3 },
  { size: 48, pattern: PATTERN_4, first: 12, pitch: 8, d: 6 },
  { size: 64, pattern: PATTERN_4, first: 17, pitch: 10, d: 8 },
  { size: 128, pattern: PATTERN_6, first: 24, pitch: 16, d: 10 },
];

for (const spec of CHROME_SIZES) {
  const png = encodePng(spec.size, renderDots(spec));
  const name = `icon-${spec.size}.png`;
  writeFileSync(join(ROOT, 'extension/icons', name), png);
  console.log(`wrote extension/icons/${name} (chrome ~85%, d=${spec.d}, pitch=${spec.pitch}, first=${spec.first})`);
}

mkdirSync(join(ROOT, 'extension/icons-safari'), { recursive: true });
for (const spec of SAFARI_SIZES) {
  const png = encodePng(spec.size, renderDots(spec));
  const name = `icon-${spec.size}.png`;
  writeFileSync(join(ROOT, 'extension/icons-safari', name), png);
  console.log(`wrote extension/icons-safari/${name} (safari ~60%, d=${spec.d}, pitch=${spec.pitch}, first=${spec.first})`);
}

// Dev icons — the Safari Debug build swaps these in (see the 'Safari manifest
// name' build phase) so the local extension is unmistakable next to the App
// Store copy in Safari's Extensions list. The normal mark on a drafting-paper
// card, after Apple's app-icon grid template: light blue ground, hairline
// guide lines through every dot center, a circle guide, a framed rounded
// rect. Reads as "the icon, on the blueprint" — clearly Intake, clearly not
// the shipping build.
const BLUEPRINT = {
  bg: [0xea, 0xf2, 0xfb],
  guide: [0x0a, 0x84, 0xff],
  gridAlpha: 0.28,
  frameAlpha: 0.5,
};

function renderDevIcon({ size, pattern, first, pitch, d }) {
  const SS = 8;
  const rgba = new Uint8Array(size * size * 4);
  const half = size / 2;
  const corner = size * 0.22; // macOS icon-ish corner radius
  const circleR = first + (pitch * (pattern.length - 1)) / 2 - first + d / 2 + Math.max(1, size / 16);
  const rows = pattern.length;
  const cols = pattern[0].length;
  const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);

  function shade(px, py) {
    // signed distance to the rounded rect; outside -> transparent
    const qx = Math.abs(px - half) - (half - corner);
    const qy = Math.abs(py - half) - (half - corner);
    const dist = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - corner;
    if (dist > 0) return null;
    let col = BLUEPRINT.bg;
    let onGuide = false;
    for (let i = 0; i < cols && !onGuide; i++) if (Math.abs(px - (first + pitch * i)) <= 0.5) onGuide = true;
    for (let i = 0; i < rows && !onGuide; i++) if (Math.abs(py - (first + pitch * i)) <= 0.5) onGuide = true;
    const mid = first + (pitch * (rows - 1)) / 2;
    if (!onGuide && size >= 32 && Math.abs(Math.hypot(px - mid, py - mid) - circleR) <= 0.5) onGuide = true;
    if (onGuide) col = mix(col, BLUEPRINT.guide, BLUEPRINT.gridAlpha);
    if (dist > -1) col = mix(col, BLUEPRINT.guide, BLUEPRINT.frameAlpha); // frame
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols; c++) {
        const color = pattern[row][c];
        if (!color) continue;
        if (Math.hypot(px - (first + pitch * c), py - (first + pitch * row)) <= d / 2) col = color;
      }
    }
    return col;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const col = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          if (!col) continue;
          r += col[0]; g += col[1]; b += col[2]; a++;
        }
      }
      if (!a) continue;
      rgba.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / (SS * SS)) * 255)], (y * size + x) * 4);
    }
  }
  return rgba;
}

mkdirSync(join(ROOT, 'extension/icons-dev'), { recursive: true });
for (const spec of SAFARI_SIZES) {
  const name = `icon-${spec.size}.png`;
  writeFileSync(join(ROOT, 'extension/icons-dev', name), encodePng(spec.size, renderDevIcon(spec)));
  console.log(`wrote extension/icons-dev/${name} (dev blueprint)`);
}

// The Chrome Web Store LISTING icon (a dashboard upload, not part of the package)
// is a brand surface: the mark keeps its black ink there, unlike the in-package
// icons above, whose gray survives dark-mode toolbars and chrome://extensions.
const store = CHROME_SIZES.find((s) => s.size === 128);
const storePattern = store.pattern.map((row) => row.map((c) => (c === G ? D : c)));
writeFileSync(
  join(ROOT, 'launch/chrome-store-icon-128.png'),
  encodePng(128, renderDots({ ...store, pattern: storePattern }))
);
console.log('wrote launch/chrome-store-icon-128.png (black ink, store listing)');
