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
// Toolbar sizes (16-64) keep the mark to ~60% of the canvas: Safari and
// Chrome draw toolbar icons inside generous containers, and system glyphs
// (compare Share) occupy roughly that fraction of theirs. The earlier ~85%
// renders read as oversized; a first pass at ~70% still did. The 128 stays
// full-bleed — it lives on listing/management surfaces that pad themselves.
const SIZES = [
  { size: 16, pattern: PATTERN_3, first: 4, pitch: 4, d: 2 },
  { size: 32, pattern: PATTERN_4, first: 8.5, pitch: 5, d: 3 },
  { size: 48, pattern: PATTERN_4, first: 12, pitch: 8, d: 6 },
  { size: 64, pattern: PATTERN_4, first: 17, pitch: 10, d: 8 },
  { size: 128, pattern: PATTERN_6, first: 24, pitch: 16, d: 10 },
];

for (const spec of SIZES) {
  const png = encodePng(spec.size, renderDots(spec));
  const name = `icon-${spec.size}.png`;
  writeFileSync(join(ROOT, 'extension/icons', name), png);
  console.log(`wrote extension/icons/${name} (d=${spec.d}, pitch=${spec.pitch}, first=${spec.first})`);
}

// Dev icons — the Safari Debug build swaps these in (see the 'Safari manifest
// name' build phase) so the local extension is unmistakable next to the App
// Store copy in Safari's Extensions list. Deliberately WILD, nothing like the
// mark: the full grid (no missing corner dots) in a blue/pink checkerboard —
// reads as a loud test-pattern swatch at every size, never as Intake.
const B = [0x0a, 0x84, 0xff]; // dev blue
const P = [0xff, 0x2d, 0x55]; // dev pink
mkdirSync(join(ROOT, 'extension/icons-dev'), { recursive: true });
for (const spec of SIZES) {
  const devPattern = spec.pattern.map((row, y) => row.map((_, x) => ((x + y) % 2 ? P : B)));
  const name = `icon-${spec.size}.png`;
  writeFileSync(join(ROOT, 'extension/icons-dev', name), encodePng(spec.size, renderDots({ ...spec, pattern: devPattern })));
  console.log(`wrote extension/icons-dev/${name} (dev checkerboard)`);
}

// The Chrome Web Store LISTING icon (a dashboard upload, not part of the package)
// is a brand surface: the mark keeps its black ink there, unlike the in-package
// icons above, whose gray survives dark-mode toolbars and chrome://extensions.
const store = SIZES.find((s) => s.size === 128);
const storePattern = store.pattern.map((row) => row.map((c) => (c === G ? D : c)));
writeFileSync(
  join(ROOT, 'launch/chrome-store-icon-128.png'),
  encodePng(128, renderDots({ ...store, pattern: storePattern }))
);
console.log('wrote launch/chrome-store-icon-128.png (black ink, store listing)');
