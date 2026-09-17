/* Naruve — write the adaptive foreground layer, the legacy icons and the store icon.

   Run:  node scripts/icon-fg-image.mjs <foreground.png> <background.png> [--scale s]
         normally via  npm run icons:2g  (DECISIONS 19.7) — the scale value lives
         there and only there

   Order — step 2 of 3:
     1. node scripts/icon-layers.mjs        full baseline set (XML, splash, every density)
     2. node scripts/icon-fg-image.mjs      foreground layer + legacy + store   <- this file
     3. node scripts/icon-bg-image.mjs      background layer
   then  npm run icons:verify.

   Why icon-layers.mjs alone is not enough
   ---------------------------------------
   The icon background is a gradient image. capacitor-assets 3.0.5 takes the
   adaptive background only as a colour string (--iconBackgroundColor) on the
   logo path, which is the only path that emits correct 108..432px layers.
   Its image path (assets/icon-background.png) runs the LEGACY templates and
   the layers come out at 192px — a tool bug, see icon-layers.mjs and CLAUDE.md
   "아이콘". icon-layers.mjs also derives the foreground from one square master
   by sampling a flat field around the mark, which a gradient original does not
   have. So the originals are two prepared images (foreground, background) and
   capacitor-assets only lays down the file set that these scripts then
   overwrite. Delete this structure only if the tool learns to take a
   background image on the logo path, or the icon goes back to one flat master.

   Sources, built once on a 1024 canvas:
     mark        <foreground.png> resized to round(1024*s), centred on a
                 transparent 1024 canvas (s = --scale, default 1, (0, 1] only)
     composite   <background.png> resized to 1024 with the mark on top

   Writes:
     mipmap-<density>/ic_launcher_foreground.png   <- mark
     mipmap-<density>/ic_launcher.png              <- composite, legacy square icon
     mipmap-<density>/ic_launcher_round.png        <- composite, legacy round icon
     assets/play-store-512.png             <- composite resized to 512
   The background layer and the mipmap-anydpi-v26 XML are left as they are.

   Legacy and store icons are built from the same foreground and background
   as the adaptive icon, so all of them show the mark at the same scale. They
   used to come from a separate full-image original; shrinking that one left
   a visible seam where its own gradient edge met the background (2026-09-17),
   and it was dropped.

   play-store-512.png is written here and not earlier on purpose: step 1
   (icon-layers.mjs) writes it from the old master before it runs
   capacitor-assets, and capacitor-assets does not read that file name, so
   nothing touches it after step 1. Overwriting it in step 2 is the first
   point where the result sticks.

   Legacy icon shapes copy what capacitor-assets 3.0.5 wrote, measured from
   the files it produced (generateLegacyLauncherIcon / generateRoundLauncherIcon):
     ic_launcher.png        composite shrunk to (w-16)x(w-16), 8px transparent
                            border on every side, square corners — no rounding
     ic_launcher_round.png  composite at w x w, circle mask r = w/2
   Both therefore have alpha 0 in the corners, which icon-verify.mjs checks.

   Each mipmap file is resized to the pixel size the existing file already has,
   so the density table lives in one place (capacitor-assets' templates).

   icon-verify.mjs rebuilds these sources the same way to check provenance —
   change both together.                                                    */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let SCALE = 1;
let scaleArg = '1';
const si = args.indexOf('--scale');
if (si !== -1) {
  scaleArg = args[si + 1];
  SCALE = Number(scaleArg);
  args.splice(si, 2);
}
const [FG, BG] = args;
const RES = 'android/app/src/main/res';
const FOREGROUND = 'ic_launcher_foreground.png';   // names written by capacitor-assets
const SQUARE = 'ic_launcher.png';
const ROUND = 'ic_launcher_round.png';
const LEGACY_PAD = 8;                              // px, as capacitor-assets pads ic_launcher.png
const STORE = 'assets/play-store-512.png';
const STORE_SIZE = 512;
const CANVAS = 1024;

if (!FG || !BG) { console.error('usage: node scripts/icon-fg-image.mjs <foreground.png> <background.png> [--scale s]'); process.exit(1); }
if (!(SCALE > 0 && SCALE <= 1)) { console.error(`--scale must be in (0, 1], got ${scaleArg}`); process.exit(1); }
for (const f of [FG, BG]) if (!fs.existsSync(f)) { console.error(`not found: ${f}`); process.exit(1); }

const fgMeta = await sharp(FG).metadata();
const bgMeta = await sharp(BG).metadata();
for (const [f, m] of [[FG, fgMeta], [BG, bgMeta]]) {
  if (m.width !== m.height) {
    console.error(`${f} must be square, got ${m.width}x${m.height}`);
    process.exit(1);
  }
}
if (!fgMeta.hasAlpha) {
  console.error(`${FG} has no alpha channel — a foreground layer must be transparent around the mark`);
  process.exit(1);
}
console.log(`foreground    ${FG}  ${fgMeta.width}x${fgMeta.height}  channels ${fgMeta.channels} (alpha)`);
console.log(`background    ${BG}  ${bgMeta.width}x${bgMeta.height}  channels ${bgMeta.channels}${bgMeta.hasAlpha ? ' (alpha)' : ''}`);

/* ---- sources on a 1024 canvas: the scaled mark, and the mark over the background ---- */
const size = Math.round(CANVAS * SCALE);
const off = Math.round((CANVAS - size) / 2);
const markSrc = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: await sharp(FG).resize(size, size, { fit: 'fill' }).png().toBuffer(), left: off, top: off }])
  .png()
  .toBuffer();
const compSrc = await sharp(await sharp(BG).resize(CANVAS, CANVAS, { fit: 'fill' }).ensureAlpha().png().toBuffer())
  .composite([{ input: markSrc }])
  .png()
  .toBuffer();
console.log(`scale         ${SCALE}  mark ${size}x${size} of ${CANVAS}, offset ${off}\n`);

const dirs = fs.readdirSync(RES)
  .filter((d) => d.startsWith('mipmap-') && fs.existsSync(path.join(RES, d, FOREGROUND)))
  .sort();
if (dirs.length === 0) {
  console.error(`no ${FOREGROUND} under ${RES}/mipmap-* — run node scripts/icon-layers.mjs first`);
  process.exit(1);
}

const sizeOf = async (p) => {
  if (!fs.existsSync(p)) { console.error(`${p} missing — stopping`); process.exit(1); }
  const m = await sharp(p).metadata();
  if (m.width !== m.height) {
    console.error(`${p} is ${m.width}x${m.height}, expected a square icon — stopping`);
    process.exit(1);
  }
  return m.width;
};

const render = {
  [FOREGROUND]: async (w) =>
    sharp(markSrc).resize(w, w, { fit: 'fill' }).png().toBuffer(),

  [SQUARE]: async (w) => {
    const inner = Math.max(0, w - LEGACY_PAD * 2);
    const resized = await sharp(compSrc).resize(inner, inner, { fit: 'fill' }).ensureAlpha().toBuffer();
    return sharp(resized)
      .extend({ top: LEGACY_PAD, bottom: LEGACY_PAD, left: LEGACY_PAD, right: LEGACY_PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  },

  [ROUND]: async (w) => {
    const circle = Buffer.from(`<svg width="${w}" height="${w}"><circle cx="${w / 2}" cy="${w / 2}" r="${w / 2}" fill="#ffffff"/></svg>`);
    const resized = await sharp(compSrc).resize(w, w, { fit: 'fill' }).ensureAlpha().toBuffer();
    return sharp(resized).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  },
};

const note = { [FOREGROUND]: 'mark', [SQUARE]: `composite  pad ${LEGACY_PAD}px`, [ROUND]: 'composite  circle r=w/2' };

let count = 0;
for (const dir of dirs) {
  for (const name of [FOREGROUND, SQUARE, ROUND]) {
    const p = path.join(RES, dir, name);
    const w = await sizeOf(p);
    fs.writeFileSync(p, await render[name](w));
    console.log(`wrote ${dir.padEnd(15)} ${name.padEnd(27)} ${w}x${w}  <- ${note[name]}`);
    count++;
  }
}

fs.writeFileSync(STORE, await sharp(compSrc).resize(STORE_SIZE, STORE_SIZE, { fit: 'fill' }).png().toBuffer());
console.log(`wrote ${STORE.padEnd(43)} ${STORE_SIZE}x${STORE_SIZE}  <- composite`);
count++;

console.log(`\n${count} file(s) replaced`);
