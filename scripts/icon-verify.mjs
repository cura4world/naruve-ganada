/* Naruve — check what the icon pipeline actually wrote.

   Run:  npm run icons:verify
         (or: node scripts/icon-verify.mjs [foreground.png background.png])
   With no arguments it checks against the adopted 2G set (DECISIONS 19.7):
     assets/icon-2g-foreground.png · assets/icon-2g-background.png
   The scale and the dx/dy offset are read from the "icons:2g" script in
   package.json (the one place the values are written), so the check can never
   drift from what was generated.

   Run it after  npm run icons:2g  (icon-layers.mjs -> icon-fg-image.mjs ->
   icon-bg-image.mjs). Exits non-zero if any check fails.

   Checks
     0. package.json "icons:2g" passes the same two originals to icon-fg-image.mjs,
        a readable --scale in (0, 1] (none means 1) and integer --dx/--dy
        (none means 0)
     1. adaptive foreground and background layers are 81/108/162/216/324/432
        — they silently drop to 192px on capacitor-assets' legacy path
     2. legacy ic_launcher.png / ic_launcher_round.png are 36/48/72/96/144/192,
        every corner is alpha 0 (padded square / circle, not a flat tile), and
        each is the moved-and-scaled foreground over the background, shaped as
        icon-fg-image.mjs shapes it
     3. each foreground layer is the foreground original moved by (dx, dy),
        scaled, centred on a transparent canvas, resized to that size
     4. each background layer is the background original resized to that size,
        and has at least 2 colours — a gradient that collapsed to one colour
        means a flat fill got through
     5. ic_launcher.xml and ic_launcher_round.xml still inset both layers 16.7%
     6. assets/play-store-512.png is 512x512 and is the same composite resized —
        icon-layers.mjs rewrites it from the old master in step 1, so if step 2
        did not run (or ran first) the store icon silently goes back to the old art

   The sources are rebuilt here exactly as icon-fg-image.mjs builds them —
   change both together. (A move that would clip the mark is refused by
   icon-fg-image.mjs itself, so it never reaches this script.)

   Removed with 19.7 (2026-09-17) and why
     · background layer == the master's corner colour — the background is a
       gradient image now; there is no single field colour to compare against.
     · foreground came from assets/logo.png, not the raw master — logo.png is
       still written by icon-layers.mjs from the old master, but the layer is
       then overwritten from icon-2g-foreground.png; check 3 replaces this.
     · inked extent inside the 66dp safe circle — that measured the padding
       icon-layers.mjs applies. The 2G foreground is supplied already laid out.
       마크가 의도보다 크게 보인 원인은 인셋이 아니라 전경 안에서 원이 차지하는
       비율이었다. scale 0.90 으로 확정 (DECISIONS 19.7).
     · the full-image original (icon-2g-full.png) — dropped 2026-09-17; legacy
       and store icons are composited from the two originals instead.        */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [FG, BG] = process.argv.length > 2
  ? process.argv.slice(2, 4)
  : ['assets/icon-2g-foreground.png', 'assets/icon-2g-background.png'];
const RES = 'android/app/src/main/res';
const STORE = 'assets/play-store-512.png';
const STORE_SIZE = 512;
const CANVAS = 1024;
const LEGACY_PAD = 8;  // as icon-fg-image.mjs
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
for (const f of [FG, BG]) {
  if (!f || !fs.existsSync(f)) { console.log(`  FAIL  original not found: ${f}`); process.exit(1); }
}

/* ---- 0. scale, offset and originals as package.json generates them ---- */
console.log('\n0. package.json icons:2g');
const script = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts?.['icons:2g'] ?? '';
const fgCall = script.split('&&').map((s) => s.trim()).find((s) => s.includes('icon-fg-image.mjs'));
let SCALE = NaN;
let DX = NaN;
let DY = NaN;
if (!fgCall) fail('icons:2g does not call icon-fg-image.mjs');
else {
  const words = fgCall.split(/\s+/);
  const opt = (flag, fallback) => { const i = words.indexOf(flag); return i === -1 ? fallback : words[i + 1]; };
  const scaleArg = opt('--scale', '1');
  const dxArg = opt('--dx', '0');
  const dyArg = opt('--dy', '0');
  SCALE = Number(scaleArg);
  DX = Number(dxArg);
  DY = Number(dyArg);
  const files = words.slice(words.indexOf('scripts/icon-fg-image.mjs') + 1).filter((w, i, a) => !w.startsWith('--') && !(a[i - 1] ?? '').startsWith('--'));
  if (!(SCALE > 0 && SCALE <= 1)) fail(`icons:2g --scale is ${scaleArg}, want a number in (0, 1]`);
  else pass(`scale ${SCALE}`);
  if (!Number.isInteger(DX) || !Number.isInteger(DY)) fail(`icons:2g --dx ${dxArg} --dy ${dyArg}, want integers`);
  else pass(`offset dx ${DX} dy ${DY}`);
  if (files[0] !== FG || files[1] !== BG) fail(`icons:2g passes ${files.slice(0, 2).join(' ')}, this check uses ${FG} ${BG}`);
  else pass(`originals match icons:2g`);
}
if (!(SCALE > 0 && SCALE <= 1) || !Number.isInteger(DX) || !Number.isInteger(DY)) {
  console.log(`\n${failed} CHECK(S) FAILED`);
  process.exit(1);
}
const XF = `dx ${DX} dy ${DY} x${SCALE}`;

const rgba = async (f, w) => {
  const pipe = sharp(f);
  if (w) pipe.resize(w, w, { fit: 'fill' });
  return pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
};
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

/* sources, built as icon-fg-image.mjs builds them */
let shiftedSrc = FG;
if (DX !== 0 || DY !== 0) {
  const base = await sharp(FG).resize(CANVAS, CANVAS, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  /* two pipelines: within one, sharp runs extract before extend */
  const padded = await sharp(base, { raw: { width: CANVAS, height: CANVAS, channels: 4 } })
    .extend({ left: Math.max(DX, 0), right: Math.max(-DX, 0), top: Math.max(DY, 0), bottom: Math.max(-DY, 0), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  shiftedSrc = await sharp(padded)
    .extract({ left: Math.max(-DX, 0), top: Math.max(-DY, 0), width: CANVAS, height: CANVAS })
    .png()
    .toBuffer();
}
const size = Math.round(CANVAS * SCALE);
const off = Math.round((CANVAS - size) / 2);
const markSrc = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: await sharp(shiftedSrc).resize(size, size, { fit: 'fill' }).png().toBuffer(), left: off, top: off }])
  .png()
  .toBuffer();
const compSrc = await sharp(await sharp(BG).resize(CANVAS, CANVAS, { fit: 'fill' }).ensureAlpha().png().toBuffer())
  .composite([{ input: markSrc }])
  .png()
  .toBuffer();
const expectLegacy = async (name, w) => {
  if (name === 'ic_launcher.png') {
    const inner = Math.max(0, w - LEGACY_PAD * 2);
    const resized = await sharp(compSrc).resize(inner, inner, { fit: 'fill' }).ensureAlpha().toBuffer();
    return sharp(resized)
      .extend({ top: LEGACY_PAD, bottom: LEGACY_PAD, left: LEGACY_PAD, right: LEGACY_PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  }
  const circle = Buffer.from(`<svg width="${w}" height="${w}"><circle cx="${w / 2}" cy="${w / 2}" r="${w / 2}" fill="#ffffff"/></svg>`);
  const resized = await sharp(compSrc).resize(w, w, { fit: 'fill' }).ensureAlpha().toBuffer();
  return sharp(resized).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
};

/* ---- 1. adaptive layer sizes ---- */
console.log('\n1. adaptive layer sizes');
for (const [dir, exp] of Object.entries(EXPECT)) {
  for (const f of ['ic_launcher_foreground.png', 'ic_launcher_background.png']) {
    const p = path.join(RES, dir, f);
    if (!fs.existsSync(p)) { fail(`${dir}/${f} missing`); continue; }
    const m = await sharp(p).metadata();
    if (m.width !== exp.layer || m.height !== exp.layer) fail(`${dir}/${f} is ${m.width}x${m.height}, want ${exp.layer}`);
    else pass(`${dir.padEnd(15)} ${f.padEnd(27)} ${exp.layer}`);
  }
}

/* ---- 2. legacy icons: size, transparent corners, composite provenance ---- */
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
    const d = mad((await rgba(await expectLegacy(f, W))).data, data);
    if (corners.some((a) => a !== 0)) fail(`${dir}/${f} corner alpha ${corners}, want 0`);
    else if (d > MAD_LIMIT) fail(`${dir}/${f} differs from foreground ${XF} over background (mean abs diff ${d.toFixed(3)})`);
    else pass(`${dir.padEnd(15)} ${f.padEnd(27)} ${exp.legacy}  corners transparent, composite ${XF} (${d.toFixed(3)})`);
  }
}

/* ---- 3. foreground layers derive from the foreground original, moved and scaled ---- */
console.log('\n3. foreground provenance');
for (const [dir, exp] of Object.entries(EXPECT)) {
  const p = path.join(RES, dir, 'ic_launcher_foreground.png');
  if (!fs.existsSync(p)) continue;
  const gen = await rgba(p);
  if (gen.info.width !== exp.layer) continue;
  const d = mad((await rgba(markSrc, exp.layer)).data, gen.data);
  if (d > MAD_LIMIT) fail(`${dir} foreground differs from ${FG} ${XF} (mean abs diff ${d.toFixed(3)})`);
  else pass(`${dir.padEnd(15)} matches ${FG} ${XF}  (${d.toFixed(3)})`);
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

/* ---- 6. store listing icon is the same composite ---- */
console.log('\n6. store listing icon');
if (!fs.existsSync(STORE)) fail(`${STORE} missing`);
else {
  const gen = await rgba(STORE);
  if (gen.info.width !== STORE_SIZE || gen.info.height !== STORE_SIZE) fail(`${STORE} is ${gen.info.width}x${gen.info.height}, want ${STORE_SIZE}`);
  else {
    const d = mad((await rgba(compSrc, STORE_SIZE)).data, gen.data);
    if (d > MAD_LIMIT) fail(`${STORE} differs from foreground ${XF} over background (mean abs diff ${d.toFixed(3)}) — old art? run npm run icons:2g`);
    else pass(`${STORE}  ${STORE_SIZE}  composite ${XF}  (${d.toFixed(3)})`);
  }
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
