/* Naruve — replace the adaptive icon background layer with an image.

   Run:  node scripts/icon-bg-image.mjs <background.png>
         normally via  npm run icons:2g  (DECISIONS 19.7)

   Order — step 3 of 3:
     1. node scripts/icon-layers.mjs        full baseline set (XML, splash, every density)
     2. node scripts/icon-fg-image.mjs      foreground layer + legacy icons
     3. node scripts/icon-bg-image.mjs      background layer   <- this file
   then  npm run icons:verify.

   Why icon-layers.mjs alone is not enough
   ---------------------------------------
   The icon background is a gradient image. capacitor-assets 3.0.5 takes the
   adaptive background only as a colour string (--iconBackgroundColor) on the
   logo path, which is the only path that emits correct 108..432px layers.
   Its image path (assets/icon-background.png) runs the LEGACY templates and
   the layers come out at 192px — a tool bug, see icon-layers.mjs and CLAUDE.md
   "아이콘". So capacitor-assets lays down every file with a flat colour first
   and this script overwrites the background layers afterwards. Delete this
   structure only if the tool learns to take a background image on the logo
   path, or the icon goes back to a flat background.

   Touches ic_launcher_background.png in each mipmap-* density and nothing
   else. The foreground layer, ic_launcher.png, ic_launcher_round.png and the
   mipmap-anydpi-v26 XML are left as the earlier steps wrote them.

   Each layer is resized to the pixel size the existing file already has, so
   the density table lives in one place (capacitor-assets' templates).      */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const INPUT = process.argv[2];
const RES = 'android/app/src/main/res';
const LAYER = 'ic_launcher_background.png';   // name written by capacitor-assets

if (!INPUT) { console.error('usage: node scripts/icon-bg-image.mjs <background.png>'); process.exit(1); }
if (!fs.existsSync(INPUT)) { console.error(`not found: ${INPUT}`); process.exit(1); }

const meta = await sharp(INPUT).metadata();
if (meta.width !== meta.height) {
  console.error(`background must be square, got ${meta.width}x${meta.height}`);
  process.exit(1);
}
console.log(`background    ${INPUT}  ${meta.width}x${meta.height}  channels ${meta.channels}${meta.hasAlpha ? ' (alpha)' : ''}\n`);

const dirs = fs.readdirSync(RES)
  .filter((d) => d.startsWith('mipmap-') && fs.existsSync(path.join(RES, d, LAYER)))
  .sort();
if (dirs.length === 0) {
  console.error(`no ${LAYER} under ${RES}/mipmap-* — run node scripts/icon-layers.mjs first`);
  process.exit(1);
}

for (const dir of dirs) {
  const p = path.join(RES, dir, LAYER);
  const old = await sharp(p).metadata();
  if (old.width !== old.height) {
    console.error(`${p} is ${old.width}x${old.height}, expected a square layer — stopping`);
    process.exit(1);
  }
  const buf = await sharp(INPUT).resize(old.width, old.height, { fit: 'fill' }).png().toBuffer();
  fs.writeFileSync(p, buf);
  console.log(`wrote ${dir.padEnd(15)} ${LAYER}  ${old.width}x${old.height}`);
}

console.log(`\n${dirs.length} background layer(s) replaced`);
