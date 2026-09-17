/* Naruve — replace the adaptive foreground layer and the legacy icons with images.

   Run:  node scripts/icon-fg-image.mjs <foreground.png> <full.png>
         normally via  npm run icons:2g  (DECISIONS 19.7)

   Order — step 2 of 3:
     1. node scripts/icon-layers.mjs        full baseline set (XML, splash, every density)
     2. node scripts/icon-fg-image.mjs      foreground layer + legacy icons   <- this file
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
   have. So the originals are three prepared images (foreground, background,
   full) and capacitor-assets only lays down the file set that these scripts
   then overwrite. Delete this structure only if the tool learns to take a
   background image on the logo path, or the icon goes back to one flat master.

   Touches, in each mipmap-* density:
     ic_launcher_foreground.png   <- <foreground.png>  (must have alpha)
     ic_launcher.png              <- <full.png>        legacy square icon
     ic_launcher_round.png        <- <full.png>        legacy round icon
   The background layer and the mipmap-anydpi-v26 XML are left as they are.

   Legacy icon shapes copy what capacitor-assets 3.0.5 wrote, measured from
   the files it produced (generateLegacyLauncherIcon / generateRoundLauncherIcon):
     ic_launcher.png        full image shrunk to (w-16)x(w-16), 8px transparent
                            border on every side, square corners — no rounding
     ic_launcher_round.png  full image at w x w, circle mask r = w/2
   Both therefore have alpha 0 in the corners, which icon-verify.mjs checks.

   Each file is resized to the pixel size the existing file already has, so
   the density table lives in one place (capacitor-assets' templates).      */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const FG = process.argv[2];
const FULL = process.argv[3];
const RES = 'android/app/src/main/res';
const FOREGROUND = 'ic_launcher_foreground.png';   // names written by capacitor-assets
const SQUARE = 'ic_launcher.png';
const ROUND = 'ic_launcher_round.png';
const LEGACY_PAD = 8;                              // px, as capacitor-assets pads ic_launcher.png

if (!FG || !FULL) { console.error('usage: node scripts/icon-fg-image.mjs <foreground.png> <full.png>'); process.exit(1); }
for (const f of [FG, FULL]) if (!fs.existsSync(f)) { console.error(`not found: ${f}`); process.exit(1); }

const fgMeta = await sharp(FG).metadata();
const fullMeta = await sharp(FULL).metadata();
for (const [f, m] of [[FG, fgMeta], [FULL, fullMeta]]) {
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
console.log(`full          ${FULL}  ${fullMeta.width}x${fullMeta.height}  channels ${fullMeta.channels}${fullMeta.hasAlpha ? ' (alpha)' : ''}\n`);

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
    sharp(FG).resize(w, w, { fit: 'fill' }).png().toBuffer(),

  [SQUARE]: async (w) => {
    const inner = Math.max(0, w - LEGACY_PAD * 2);
    const resized = await sharp(FULL).resize(inner, inner, { fit: 'fill' }).ensureAlpha().toBuffer();
    return sharp(resized)
      .extend({ top: LEGACY_PAD, bottom: LEGACY_PAD, left: LEGACY_PAD, right: LEGACY_PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  },

  [ROUND]: async (w) => {
    const circle = Buffer.from(`<svg width="${w}" height="${w}"><circle cx="${w / 2}" cy="${w / 2}" r="${w / 2}" fill="#ffffff"/></svg>`);
    const resized = await sharp(FULL).resize(w, w, { fit: 'fill' }).ensureAlpha().toBuffer();
    return sharp(resized).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  },
};

const note = { [FOREGROUND]: FG, [SQUARE]: `${FULL}  pad ${LEGACY_PAD}px`, [ROUND]: `${FULL}  circle r=w/2` };

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

console.log(`\n${count} file(s) replaced`);
