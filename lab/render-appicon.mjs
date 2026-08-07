// Re-renders the mac app icon dots on the pixel grid and regenerates the
// AppIcon set. Requires ImageMagick (`magick`) for decoding/resizing; the
// dot layers themselves come from lab/pnglib.mjs.
//
// The app icon is an 8x8 dot grid on an opaque white squircle. The original
// dots were ~44.6px on a 71px pitch — fractional edges (fuzzy at 1:1) and an
// odd pitch, so the 512pt@1x half-scale render landed on half-pixels too.
// Snapped geometry: d=44, pitch=72, first center 260 — all even, so the
// 1024 (512pt@2x) AND its 512 half-scale are both exactly on the grid.
// 256 and 128 get their own snapped dot renders (the geometry divides
// cleanly: 256 -> pitch 18/first 65/d 12, 128 -> pitch 9/first 32.5/d 5);
// 64 and below are box-filter downscales — an 8x8 grid has no crisp
// rendering at those sizes.
//
// The white squircle + shadow background is preserved from the existing
// artwork: the old dots are painted out with white and the new dot layer is
// composited on top.
//
// Usage: node lab/render-appicon.mjs

import { execSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderDots, encodePng } from './pnglib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPICONSET = join(ROOT, 'safari/Intake for Obsidian/Intake for Obsidian/Assets.xcassets/AppIcon.appiconset');
const SOURCE = join(ROOT, 'lab/assets/before/appicon-1024.png'); // original artwork (for the background layer)

const D = [0x17, 0x19, 0x1b]; // dark (opaque white background, so no dark-mode concern)
const R = [0xe5, 0x00, 0x00]; // red
const _ = null;

const PATTERN_8 = [
  [D, D, D, D, D, D, D, D],
  [D, D, D, R, R, R, R, _],
  [R, R, R, R, R, R, R, R],
  [R, R, R, R, D, D, _, _],
  [D, D, D, D, D, D, D, D],
  [D, D, D, D, D, D, D, _],
  [D, D, D, D, D, D, D, D],
  [D, D, D, D, D, _, _, _],
];

// Per-size snapped dot geometry. `erase` is the white rectangle painted over
// the old dots before compositing (verified all-white in the original).
const DOT_SIZES = [
  { size: 1024, first: 260, pitch: 72, d: 44, erase: [230, 794] },
  { size: 256, first: 65, pitch: 18, d: 12, erase: [57, 199] },
  { size: 128, first: 32.5, pitch: 9, d: 5, erase: [28, 100] },
];

const tmp = mkdtempSync(join(tmpdir(), 'intake-appicon-'));
const sh = (cmd) => execSync(cmd, { stdio: 'pipe' });
const q = (p) => `'${p}'`;

function compose(size, spec) {
  const dots = join(tmp, `dots-${size}.png`);
  writeFileSync(dots, encodePng(size, renderDots({ ...spec, pattern: PATTERN_8 })));
  const bg = size === 1024
    ? `${q(SOURCE)} -depth 8`
    : `${q(SOURCE)} -depth 8 -filter box -resize ${size}x${size}`;
  const out = join(tmp, `appicon-${size}.png`);
  const [e0, e1] = spec.erase;
  sh(`magick ${bg} -fill white -draw "rectangle ${e0},${e0} ${e1},${e1}" ${q(dots)} -compose over -composite ${q(out)}`);
  return out;
}

const built = {};
for (const spec of DOT_SIZES) built[spec.size] = compose(spec.size, spec);

// Plain box-filter downscales of the fixed 1024 for sizes with no crisp grid.
for (const size of [512, 64, 32, 16]) {
  const out = join(tmp, `appicon-${size}.png`);
  sh(`magick ${q(built[1024])} -filter box -resize ${size}x${size} ${q(out)}`);
  built[size] = out;
}

const TARGETS = [
  [1024, join(ROOT, 'launch/appicon-1024.png')],
  [1024, join(APPICONSET, 'mac-icon-512@2x.png')],
  [512, join(APPICONSET, 'mac-icon-512@1x.png')],
  [512, join(APPICONSET, 'mac-icon-256@2x.png')],
  [256, join(APPICONSET, 'mac-icon-256@1x.png')],
  [256, join(APPICONSET, 'mac-icon-128@2x.png')],
  [256, join(ROOT, 'safari/Intake for Obsidian/Intake for Obsidian/Resources/Icon.png')],
  [128, join(APPICONSET, 'mac-icon-128@1x.png')],
  [64, join(APPICONSET, 'mac-icon-32@2x.png')],
  [32, join(APPICONSET, 'mac-icon-32@1x.png')],
  [32, join(APPICONSET, 'mac-icon-16@2x.png')],
  [16, join(APPICONSET, 'mac-icon-16@1x.png')],
];

for (const [size, dest] of TARGETS) {
  sh(`cp ${q(built[size])} ${q(dest)}`);
  console.log(`wrote ${dest.replace(ROOT + '/', '')} (${size}px)`);
}

rmSync(tmp, { recursive: true, force: true });
