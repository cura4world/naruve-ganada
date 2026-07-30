/* Naruve — rebuild every launcher icon from one 1024 master.

   Run:  npm run icons          (or: node scripts/icon-layers.mjs [master.png])

   Read this before changing anything here
   ---------------------------------------
   capacitor-assets 3.0.5 has two different code paths for adaptive icons and
   only one of them is usable:

   · assets/icon-foreground.png + icon-background.png
       -> generateAdaptiveIconForeground(), which filters the templates with
          kind === 'icon'. Those are the LEGACY templates, 36..192px. So the
          layers come out at 192px however carefully they were drawn.
          This is the "adaptive layers are 192px" trap.

   · assets/logo.png (or icon.png, which is read as a logo fallback)
       -> _generateAdaptiveIconsFromLogo(), which uses the real 'adaptive-icon'
          templates, 108..432px. Correct sizes, and the foreground is just
          pipe.resize(w, h) of the logo — no cropping, no re-centring.

   So the padded foreground is written as assets/logo.png and the two layer
   files are deleted. assets/icon.png must not exist either: it would be read
   as the logo and beat the real one.

   Processing order inside capacitor-assets is logo -> icon -> splash, so the
   legacy icons and splashes the logo path emits as a side effect are then
   overwritten by icon-only.png and splash.png. That is intended.

   Safe area — mind the double inset
   ---------------------------------
   An adaptive icon is 108dp and only the centre 66dp circle is guaranteed to
   survive the launcher's mask. But the ic_launcher.xml that capacitor-assets
   writes already wraps both layers in <inset android:inset="16.7%" />, so a
   layer image is painted into the centre 72dp, not the full 108dp.

   That inset IS the safe-area padding. Padding the image to 66/108 as well
   would apply it twice and the mark would render at 42dp instead of 66dp.
   So the image is fitted to 66/72 of its own canvas, which lands exactly on
   the 66dp safe circle once the XML inset is applied.

   If that XML ever changes to inset="0%", change SAFE to 66/108 to match.

   The master's glyphs overshoot the cream disc, so the whole inked area is
   fitted, not just the disc — fitting the disc alone still clips 가 and 다. */

import sharp from 'sharp';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const MASTER = process.argv[2] ?? 'assets/GANADA고딕_icon.v5.png';
const CANVAS = 1024;
const SAFE = 66 / 72;      // see "double inset" above — NOT 66/108
const XML_INSET_DP = 72;   // dp the XML paints a layer into, out of 108
const OUT = 'assets';
const PAPER = '#FBFAF6';   // --paper
const INK = '#111A22';     // --ink

const { data, info } = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
if (W !== H) throw new Error(`master must be square, got ${W}x${H}`);
const at = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };

/* the flat field colour, taken from the master itself — this exact value is
   what the background layer gets filled with, so the two can never drift */
const bg = at(3, 3);
const bgHex = '#' + bg.map((v) => v.toString(16).padStart(2, '0')).join('');
const far = (p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);

/* corners must agree, otherwise the field is not flat and sampling one pixel
   would be meaningless */
for (const [x, y] of [[W - 4, 3], [3, H - 4], [W - 4, H - 4]]) {
  if (far(at(x, y)) > 2) throw new Error(`background is not flat: (${x},${y}) = ${at(x, y)} vs ${bg}`);
}

/* cream disc: span of bright pixels across the centre row and column */
const bright = (p) => p[0] > 200 && p[1] > 195 && p[2] > 170;
let l = -1, r = -1, t = -1, b = -1;
for (let x = 0; x < W; x++) if (bright(at(x, H >> 1))) { if (l < 0) l = x; r = x; }
for (let y = 0; y < H; y++) if (bright(at(W >> 1, y))) { if (t < 0) t = y; b = y; }
const cx = (l + r) / 2, cy = (t + b) / 2;
const discR = ((r - l + 1) + (b - t + 1)) / 4;

/* furthest inked pixel, including glyphs that overshoot the disc */
let inkR = discR;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (far(at(x, y)) <= 40) continue;
    const d = Math.hypot(x - cx, y - cy);
    if (d > inkR) inkR = d;
  }
}

console.log(`master        ${MASTER}  ${W}x${H}`);
console.log(`background    ${bgHex}  rgb(${bg})   [sampled, all four corners agree]`);
console.log(`cream disc    centre (${cx}, ${cy})  radius ${discR}`);
console.log(`inked radius  ${inkR.toFixed(1)}  (overshoot ${(inkR - discR).toFixed(1)}px)`);

/* ---- foreground: keep the disc and every inked pixel, drop the flat field.
   What is dropped is exactly the colour the background layer is filled with,
   so soft edges composite invisibly.                                      */
const fg = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = at(x, y);
    const d = Math.hypot(x - cx, y - cy);
    const aDisc = Math.min(1, Math.max(0, (discR + 1 - d) / 2));
    const aInk = Math.min(1, Math.max(0, (far(p) - 18) / 40));
    const o = (y * W + x) * 4;
    fg[o] = p[0]; fg[o + 1] = p[1]; fg[o + 2] = p[2];
    fg[o + 3] = Math.round(255 * Math.max(aDisc, aInk));
  }
}

const box = Math.ceil(inkR) * 2 + 1;
const left = Math.round(cx - (box - 1) / 2);
const top = Math.round(cy - (box - 1) / 2);
const target = Math.round(CANVAS * SAFE);
const offset = Math.round((CANVAS - target) / 2);

const scaled = await sharp(fg, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width: box, height: box })
  .resize(target, target, { fit: 'fill' })
  .png()
  .toBuffer();

await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: scaled, left: offset, top: offset }])
  .png()
  .toFile(`${OUT}/logo.png`);

/* legacy square icon */
await sharp(MASTER).resize(CANVAS, CANVAS).png().toFile(`${OUT}/icon-only.png`);

/* not read by capacitor-assets — store listings and manual use only */
const disc = Buffer.from(
  `<svg width="${CANVAS}" height="${CANVAS}"><circle cx="${CANVAS / 2}" cy="${CANVAS / 2}" r="${CANVAS / 2}" fill="#fff"/></svg>`
);
await sharp(MASTER).resize(CANVAS, CANVAS)
  .composite([{ input: disc, blend: 'dest-in' }])
  .png()
  .toFile(`${OUT}/icon-round.png`);
await sharp(MASTER).resize(512, 512).png().toFile(`${OUT}/play-store-512.png`);

/* these three force the broken path — they must not exist */
for (const stale of ['icon.png', 'icon-foreground.png', 'icon-background.png']) {
  const p = `${OUT}/${stale}`;
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`removed ${p} (would trigger the 192px path)`); }
}

const s = target / box;
const dp = (px) => (px / CANVAS) * XML_INSET_DP;
console.log(`\nwrote logo.png            content scaled ${s.toFixed(4)}x`);
console.log(`  cream disc  ${(discR * s * 2).toFixed(0)}px  ${((discR * s * 2 / CANVAS) * 100).toFixed(1)}% of canvas  -> ${dp(discR * s * 2).toFixed(1)}dp of 108`);
console.log(`  inked area  ${(inkR * s * 2).toFixed(0)}px  ${((inkR * s * 2 / CANVAS) * 100).toFixed(1)}% of canvas  -> ${dp(inkR * s * 2).toFixed(1)}dp of 108   safe circle 66dp`);
console.log('wrote icon-only.png, icon-round.png, play-store-512.png');

console.log(`\nrunning capacitor-assets with --iconBackgroundColor ${bgHex}\n`);
const res = spawnSync('npx', [
  '--yes', '@capacitor/assets', 'generate', '--android',
  '--iconBackgroundColor', bgHex,
  '--iconBackgroundColorDark', bgHex,
  '--splashBackgroundColor', PAPER,
  '--splashBackgroundColorDark', INK,
], { stdio: 'inherit', shell: true });
process.exit(res.status ?? 1);
