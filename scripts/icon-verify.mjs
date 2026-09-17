/* Naruve — check what the icon pipeline actually wrote.

   Run:  npm run icons:verify
         (or: node scripts/icon-verify.mjs [foreground.png background.png full.png])
   With no arguments it checks against the adopted 2G set (DECISIONS 19.7):
     assets/icon-2g-foreground.png · icon-2g-background.png · icon-2g-full.png

   Run it after  npm run icons:2g  (icon-layers.mjs -> icon-fg-image.mjs ->
   icon-bg-image.mjs). Exits non-zero if any check fails.

   Checks
     1. adaptive foreground and background layers are 81/108/162/216/324/432
        — they silently drop to 192px on capacitor-assets' legacy path
     2. legacy ic_launcher.png / ic_launcher_round.png are 36/48/72/96/144/192
        and every corner is alpha 0 (padded square / circle, not a flat tile)
     3. each foreground layer is the foreground original resized to that size
     4. each background layer is the background original resized to that size,
        and has at least 2 colours — a gradient that collapsed to one colour
        means a flat fill got through
     5. ic_launcher.xml and ic_launcher_round.xml still inset both layers 16.7%

   Removed with 19.7 (2026-09-17) and why
     · background layer == the master's corner colour — the background is a
       gradient image now; there is no single field colour to compare against.
     · foreground came from assets/logo.png, not the raw master — logo.png is
       still written by icon-layers.mjs from the old master, but the layer is
       then overwritten from icon-2g-foreground.png; check 3 replaces this.
     · inked extent inside the 66dp safe circle — that measured the padding
       icon-layers.mjs applies. The 2G foreground is supplied already laid out,
       and whether the 16.7% XML inset double-applies to it is an open item in
       DECISIONS 19.7, not something this script should settle.            */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [FG, BG, FULL] = process.argv.length > 2
  ? process.argv.slice(2, 5)
  : ['assets/icon-2g-foreground.png', 'assets/icon-2g-background.png', 'assets/icon-2g-full.png'];
const RES = 'android/app/src/main/res';
const MAD_LIMIT = 2;   // mean abs difference per channel, /255

const EXPECT = {
  'mipmap-ldpi': { layer: 81, legacy: 36 },
  'mipmap-mdpi': { layer: 108, legacy: 48 },
  'mipmap-hdpi': { layer: 162, legacy: 72 },
  'mipmap-xhdpi': { layer: 216, legacy: 96 },
  'mipmap-xxhdpi': { layer: 324, legacy: 144 },
  'mipmap-xxxhdpi': { layer: 432, legacy: 192 },
};

let failed = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failed++; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log(`foreground    ${FG}`);
console.log(`background    ${BG}`);
console.log(`full          ${FULL}\n`);
for (const f of [FG, BG, FULL]) {
  if (!f || !fs.existsSync(f)) { console.log(`  FAIL  original not found: ${f}`); process.exit(1); }
}

const rgba = async (f, w) => {
  const pipe = sharp(f);
  if (w) pipe.resize(w, w, { fit: 'fill' });
  return pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
};
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

/* ---- 1. adaptive layer sizes ---- */
console.log('1. adaptive layer sizes');
for (const [dir, exp] of Object.entries(EXPECT)) {
  for (const f of ['ic_launcher_foreground.png', 'ic_launcher_background.png']) {
    const p = path.join(RES, dir, f);
    if (!fs.existsSync(p)) { fail(`${dir}/${f} missing`); continue; }
    const m = await sharp(p).metadata();
    if (m.width !== exp.layer || m.height !== exp.layer) fail(`${dir}/${f} is ${m.width}x${m.height}, want ${exp.layer}`);
    else pass(`${dir.padEnd(15)} ${f.padEnd(27)} ${exp.layer}`);
  }
}

/* ---- 2. legacy icons: size and transparent corners ---- */
console.log('\n2. legacy icons');
for (const [dir, exp] of Object.entries(EXPECT)) {
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png']) {
    const p = path.join(RES, dir, f);
    if (!fs.existsSync(p)) { fail(`${dir}/${f} missing`); continue; }
    const { data, info } = await rgba(p);
    if (info.width !== exp.legacy || info.height !== exp.legacy) { fail(`${dir}/${f} is ${info.width}x${info.height}, want ${exp.legacy}`); continue; }
    const W = info.width;
    const A = (x, y) => data[(y * W + x) * 4 + 3];
    const corners = [A(0, 0), A(W - 1, 0), A(0, W - 1), A(W - 1, W - 1)];
    if (corners.some((a) => a !== 0)) fail(`${dir}/${f} corner alpha ${corners}, want 0`);
    else pass(`${dir.padEnd(15)} ${f.padEnd(27)} ${exp.legacy}  corners transparent`);
  }
}

/* ---- 3. foreground layers derive from the foreground original ---- */
console.log('\n3. foreground provenance');
for (const [dir, exp] of Object.entries(EXPECT)) {
  const p = path.join(RES, dir, 'ic_launcher_foreground.png');
  if (!fs.existsSync(p)) continue;
  const gen = await rgba(p);
  if (gen.info.width !== exp.layer) continue;
  const d = mad((await rgba(FG, exp.layer)).data, gen.data);
  if (d > MAD_LIMIT) fail(`${dir} foreground differs from ${FG} (mean abs diff ${d.toFixed(3)})`);
  else pass(`${dir.padEnd(15)} matches ${FG}  (${d.toFixed(3)})`);
}

/* ---- 4. background layers derive from the background original, not flat ---- */
console.log('\n4. background provenance');
for (const [dir, exp] of Object.entries(EXPECT)) {
  const p = path.join(RES, dir, 'ic_launcher_background.png');
  if (!fs.existsSync(p)) continue;
  const gen = await rgba(p);
  if (gen.info.width !== exp.layer) continue;
  const d = mad((await rgba(BG, exp.layer)).data, gen.data);
  const seen = new Set();
  for (let i = 0; i < gen.data.length; i += 4) seen.add(`${gen.data[i]},${gen.data[i + 1]},${gen.data[i + 2]}`);
  if (d > MAD_LIMIT) fail(`${dir} background differs from ${BG} (mean abs diff ${d.toFixed(3)})`);
  else if (seen.size < 2) fail(`${dir} background has ${seen.size} colour — the gradient collapsed to a flat fill`);
  else pass(`${dir.padEnd(15)} matches ${BG}  (${d.toFixed(3)}, ${seen.size} colours)`);
}

/* ---- 5. the XML must still be the inset flavour ---- */
console.log('\n5. adaptive icon XML');
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const p = path.join(RES, 'mipmap-anydpi-v26', f);
  if (!fs.existsSync(p)) { fail(`${f} missing`); continue; }
  const xml = fs.readFileSync(p, 'utf8');
  const insets = xml.match(/android:inset="[^"]*"/g) ?? [];
  if (insets.length !== 2 || insets.some((s) => s !== 'android:inset="16.7%"')) fail(`${f} insets ${insets.join(' ') || 'none'}, want 16.7% on both layers`);
  else pass(`${f.padEnd(27)} inset 16.7% on both layers`);
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
