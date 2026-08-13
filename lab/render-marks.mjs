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

import { writeFileSync } from 'node:fs';
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
// Toolbar sizes (16-64) keep the mark to ~70% of the canvas: Safari and
// Chrome draw toolbar icons inside generous containers (compare the share
// icon), and the earlier ~85% renders read as oversized next to system
// glyphs. The 128 stays full-bleed — it lives on listing/management
// surfaces that pad themselves.
const SIZES = [
  { size: 16, pattern: PATTERN_3, first: 3.5, pitch: 4, d: 3 },
  { size: 32, pattern: PATTERN_4, first: 7, pitch: 6, d: 4 },
  { size: 48, pattern: PATTERN_4, first: 10.5, pitch: 9, d: 7 },
  { size: 64, pattern: PATTERN_4, first: 14, pitch: 12, d: 8 },
  { size: 128, pattern: PATTERN_6, first: 24, pitch: 16, d: 10 },
];

for (const spec of SIZES) {
  const png = encodePng(spec.size, renderDots(spec));
  const name = `icon-${spec.size}.png`;
  writeFileSync(join(ROOT, 'extension/icons', name), png);
  console.log(`wrote extension/icons/${name} (d=${spec.d}, pitch=${spec.pitch}, first=${spec.first})`);
}

// Safari's toolbar icon: an adaptive SVG (Safari supports SVG action icons;
// Chrome does not). Black ink in light mode, toolbar-gray in dark — the PNGs
// above stay gray-only for Chrome, whose manifest has no theme-aware icons.
// Geometry mirrors the 32 spec so the padding matches the rasters.
const t = SIZES.find((s) => s.size === 32);
const circles = [];
t.pattern.forEach((row, ry) => row.forEach((c, cx) => {
  if (c === null) return;
  const x = t.first + cx * t.pitch;
  const y = t.first + ry * t.pitch;
  circles.push(`<circle class="${c === R ? 'r' : 'i'}" cx="${x}" cy="${y}" r="${t.d / 2}"/>`);
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<style>.i{fill:#17191b}.r{fill:#e50000}@media(prefers-color-scheme:dark){.i{fill:#7d8288}}</style>` +
  circles.join('') + `</svg>\n`;
writeFileSync(join(ROOT, 'extension/icons/toolbar.svg'), svg);
console.log('wrote extension/icons/toolbar.svg (adaptive: black light / gray dark, Safari only)');

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
