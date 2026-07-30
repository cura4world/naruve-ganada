/* Naruve — check what capacitor-assets actually wrote.

   Run:  npm run icons:verify   (or: node scripts/icon-verify.mjs [master.png])

   Three things go wrong with launcher icons in this project, so all three are
   checked and the script exits non-zero if any fails:

     1. adaptive layers silently drop to legacy sizes (see scripts/icon-layers.mjs)
     2. the generated layer is auto-derived from the square master instead of
        the padded artwork that was prepared
     3. the flat background layer drifts from the master's red                */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const MASTER = process.argv[2] ?? 'assets/GANADA고딕_icon.v5.png';
const RES = 'android/app/src/main/res';
/* ic_launcher.xml insets each layer by 16.7%, so a layer image is painted
   into the centre 72dp of the 108dp icon. Content filling 66/72 of the image
   therefore lands exactly on the 66dp safe circle. */
const SAFE = 66 / 72;
const XML_INSET_DP = 72;

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

/* ---- 1. sizes ---- */
console.log('1. mipmap pixel sizes');
for (const [dir, exp] of Object.entries(EXPECT)) {
  for (const [f, want] of [
    ['ic_launcher_foreground.png', exp.layer],
    ['ic_launcher_background.png', exp.layer],
    ['ic_launcher.png', exp.legacy],
    ['ic_launcher_round.png', exp.legacy],
  ]) {
    const p = path.join(RES, dir, f);
    if (!fs.existsSync(p)) { fail(`${dir}/${f} missing`); continue; }
    const m = await sharp(p).metadata();
    if (m.width !== want || m.height !== want) fail(`${dir}/${f} is ${m.width}x${m.height}, want ${want}`);
    else pass(`${dir.padEnd(15)} ${f.padEnd(27)} ${want}`);
  }
}

/* ---- 2. background layer colour == master's field colour ---- */
console.log('\n2. background layer colour');
const mrgb = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mc = [mrgb.data[(3 * mrgb.info.width + 3) * 4], mrgb.data[(3 * mrgb.info.width + 3) * 4 + 1], mrgb.data[(3 * mrgb.info.width + 3) * 4 + 2]];
const hex = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('');
console.log(`  master field colour ${hex(mc)} rgb(${mc})`);
for (const dir of Object.keys(EXPECT)) {
  const p = path.join(RES, dir, 'ic_launcher_background.png');
  if (!fs.existsSync(p)) continue;
  const b = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Set();
  for (let i = 0; i < b.data.length; i += 4) seen.add(`${b.data[i]},${b.data[i + 1]},${b.data[i + 2]}`);
  const only = [...seen];
  if (only.length !== 1) fail(`${dir} background has ${only.length} colours, want 1 (${only.slice(0, 3)})`);
  else if (only[0] !== mc.join(',')) fail(`${dir} background is rgb(${only[0]}), want rgb(${mc})`);
  else pass(`${dir.padEnd(15)} flat ${hex(mc)}`);
}

/* ---- 3. foreground layer came from assets/logo.png, not from the master ---- */
console.log('\n3. foreground provenance');
const size = 432;
const raw = async (f) => sharp(f).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const genPath = path.join(RES, 'mipmap-xxxhdpi', 'ic_launcher_foreground.png');
const dLogo = mad(await raw('assets/logo.png'), await raw(genPath));
const dMaster = mad(await raw(MASTER), await raw(genPath));
console.log(`  mean abs diff vs assets/logo.png : ${dLogo.toFixed(3)} /255`);
console.log(`  mean abs diff vs master          : ${dMaster.toFixed(3)} /255`);
if (dLogo > 2) fail(`generated layer does not match assets/logo.png (${dLogo.toFixed(3)})`);
else pass('generated layer matches the prepared artwork');
if (!(dMaster > dLogo * 3)) fail('generated layer looks like the raw master, not the padded logo');
else pass('generated layer is not the raw master');

const g = await sharp(genPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const A = (x, y) => g.data[(y * g.info.width + x) * 4 + 3];
const corners = [A(0, 0), A(size - 1, 0), A(0, size - 1), A(size - 1, size - 1)];
if (corners.some((a) => a !== 0)) fail(`layer corners are not transparent: ${corners}`);
else pass('layer corners transparent');

let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  if (A(x, y) > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
}
const extent = Math.max(x1 - x0 + 1, y1 - y0 + 1) / size;
const renderedDp = extent * XML_INSET_DP;
console.log(`  inked extent ${(extent * 100).toFixed(1)}% of the layer -> ${renderedDp.toFixed(1)}dp of 108 once the XML inset is applied`);
if (renderedDp > 66.5) fail(`content renders at ${renderedDp.toFixed(1)}dp, past the 66dp safe circle`);
else if (renderedDp < 55) fail(`content renders at only ${renderedDp.toFixed(1)}dp — safe circle is 66dp, mark will look small`);
else pass(`content renders at ${renderedDp.toFixed(1)}dp, inside the 66dp safe circle`);

/* the XML must still be the inset flavour this maths assumes */
const xml = fs.readFileSync(path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'utf8');
if (!xml.includes('android:inset="16.7%"')) fail('ic_launcher.xml no longer insets 16.7% — SAFE in icon-layers.mjs must change');
else pass('ic_launcher.xml still insets 16.7%');

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
