// scripts/test_layout.js
//
//   node scripts/test_layout.js [docs 경로]
//
// 두 가지를 지킨다.
//
// 1. 세로 예산. .phone은 100dvh로 묶여 있고 .stage만 스크롤한다. 마이크 버튼
//    치수를 바꾸면 .stage의 padding-bottom이 따라 움직여 가용 높이가 줄어든다.
//    그 계산을 손으로 하지 않도록 여기서 표로 뽑는다. 값은 css에서 읽으므로
//    css를 고치면 표가 따라 바뀐다.
//
// 2. 타일 색의 글자 반전 임계. 채움 색을 바꾸면 같은 alpha라도 밝기가 달라져
//    임계가 옮겨간다. WCAG 상대휘도로 교차점을 다시 재고 --tile-flip과 맞는지 본다.
//    검정에서 진청으로 바꿀 때 이것을 놓치면 중간 점수 타일의 글자가
//    읽기 어려워진다 — 눈에 잘 안 띄는 방식으로.

import fs from 'node:fs';
import path from 'node:path';

const DOCS = process.argv[2] || 'docs';
const css = fs.readFileSync(path.join(DOCS, 'css/app.css'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : ''))); };

/** :root 변수 하나를 px 숫자로 */
function rootVar(name) {
  const m = css.match(new RegExp('--' + name + '\\s*:\\s*([^;]+);'));
  return m ? m[1].trim() : null;
}
const px = (s) => (s == null ? NaN : parseFloat(s));

/** 규칙 하나에서 선언 하나를 꺼낸다 */
function decl(selector, prop) {
  const i = css.indexOf(selector + '{');
  if (i < 0) return null;
  const body = css.slice(i + selector.length + 1, css.indexOf('}', i));
  const m = body.match(new RegExp('(?:^|;|\\s)' + prop + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : null;
}
const pad = (s) => (s || '').split(/\s+/).map(parseFloat);

// ---------------------------------------------------------------- 1
console.log('1. 마이크 치수 불변식');
const size = px(rootVar('mic-size')), sink = px(rootVar('mic-sink')),
      rise = px(rootVar('mic-rise')), hint = px(rootVar('hint-h'));
console.log(`  --mic-size ${size} · --mic-sink ${sink} · --mic-rise ${rise} · --hint-h ${hint}`);
ok('sink + rise = size', sink + rise === size, `${sink}+${rise} != ${size}`);
ok('sink 가 탭바 안쪽 높이보다 작다', sink < 70, String(sink));

const gapMin = decl('.tab-gap', 'min-width');
const gapExtra = gapMin ? parseFloat((gapMin.match(/\+\s*(\d+)px/) || [])[1]) : NaN;
console.log(`  .tab-gap min-width = ${gapMin}  →  ${size + gapExtra}px`);
// 버튼은 지름 + 종이 링 5px씩
ok('가운데 칸이 버튼 + 링(5px x2)을 담는다', size + gapExtra >= size + 10,
  `여유 ${gapExtra - 10}px`);

// ---------------------------------------------------------------- 2
console.log('\n2. 360x740 세로 예산 (safe-area 0 기준)');
const H = 740;
const tb = pad(decl('.topbar', 'padding'));            // 15 18 13
const st = pad(decl('.strip', 'padding'));             // 11 18
const sm = pad(decl('.sim', 'padding'));               // 6 18 8
const tabs = pad(decl('.tabs', 'padding'));            // 7 0 11
const seal = px(decl('.seal-mark', 'height'));         // 23
const browse = px(decl('.browse-btn', 'min-height'));  // 34
const tabH = px(decl('.tab', 'min-height'));           // 52
const stagePad = pad((decl('.stage', 'padding') || '').replace(/calc\([^)]*\)/, '0'));
const BUILDTAG = 11;   // .buildtag 9px 글꼴의 줄상자. 유일한 어림값이다.

const rows = [
  ['.topbar', tb[0] + seal + tb[2] + 1],
  ['.strip',  st[0] + browse + st[0] + 1],
  ['.sim',    1 + sm[0] + BUILDTAG + sm[2]],
  ['.tabs',   1 + tabs[0] + tabH + tabs[2]],
];
const chrome = rows.reduce((a, r) => a + r[1], 0);
const stageBox = H - chrome;
const padBottom = rise + hint + 14;
const usable = stageBox - stagePad[0] - padBottom;

console.log(`  ${'구성'.padEnd(10)} 높이`);
rows.forEach(r => console.log(`  ${r[0].padEnd(10)} ${String(r[1]).padStart(4)}px`));
console.log(`  ${'합계(크롬)'.padEnd(9)} ${String(chrome).padStart(4)}px`);
console.log(`  ${'.stage 박스'.padEnd(9)} ${String(stageBox).padStart(4)}px`);
console.log(`  ${'  padding-top'.padEnd(11)} ${String(stagePad[0]).padStart(2)}px`);
console.log(`  ${'  padding-bottom'.padEnd(11)} ${String(padBottom).padStart(2)}px  (= rise ${rise} + hint ${hint} + 14)`);
console.log(`  ${'.stage 가용'.padEnd(9)} ${String(usable).padStart(4)}px`);
ok('가용 높이가 400px를 넘는다', usable > 400, `${usable}px`);
ok('.stage padding-bottom 이 rise+hint 로 계산된다',
  /calc\(var\(--mic-rise\)\s*\+\s*var\(--hint-h\)/.test(decl('.stage', 'padding') || ''));

// ---------------------------------------------------------------- 3
console.log('\n3. 타일 색과 글자 반전 임계');
const rgb = (rootVar('tile-rgb') || '').split(',').map(Number);
const flip = px(rootVar('tile-flip'));
console.log(`  --tile-rgb ${rgb.join(',')}  --tile-flip ${flip}`);

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, a, bg) => fg.map((f, i) => a * f + (1 - a) * bg[i]);

const PAPER = [251, 250, 246], INK = [17, 26, 34];
const A0 = 0.12, A1 = 0.84;                      // app.js inkTile 과 같은 식
const bgAt = (sc) => over(rgb, A0 + (sc / 100) * A1, PAPER);

let lo = 0, hi = 100;
for (let i = 0; i < 60; i++) {
  const m = (lo + hi) / 2;
  if (cr(PAPER, bgAt(m)) >= cr(INK, bgAt(m))) hi = m; else lo = m;
}
console.log(`  측정한 교차점 = ${hi.toFixed(1)}`);
console.log(`  ${'점수'.padStart(4)} ${'배경'.padStart(14)} ${'paper'.padStart(6)} ${'ink'.padStart(6)}  글자`);
[0, 30, 52, 60, 66, 70, 80, 100].forEach(sc => {
  const bg = bgAt(sc).map(Math.round);
  const cp = cr(PAPER, bg), ci = cr(INK, bg);
  console.log(`  ${String(sc).padStart(4)} ${('rgb(' + bg.join(',') + ')').padStart(14)} ` +
    `${cp.toFixed(2).padStart(6)} ${ci.toFixed(2).padStart(6)}  ${sc >= flip ? 'paper' : 'ink'}` +
    // 교차점 바로 옆에서는 어느 쪽을 골라도 대비가 같다. 1점 여유를 두어야
    // 반올림 때문에 멀쩡한 임계가 틀린 것처럼 보이지 않는다.
    `${Math.abs(sc - hi) <= 1 || (sc >= flip) === (cp >= ci) ? '' : '   <-- 임계가 어긋난다'}`);
});
ok('--tile-flip 이 측정 교차점의 ±2 안에 있다', Math.abs(flip - hi) <= 2,
  `flip ${flip} vs 교차 ${hi.toFixed(1)}`);
ok('100점 타일에서 paper 글자가 AA(4.5) 이상', cr(PAPER, bgAt(100)) >= 4.5,
  cr(PAPER, bgAt(100)).toFixed(2));
ok('0점 타일이 종이와 구분된다 (1.1 이상)', cr(PAPER, bgAt(0)) >= 1.1,
  cr(PAPER, bgAt(0)).toFixed(2));

// ---------------------------------------------------------------- 4
console.log('\n4. A안 확정 — 변형이 남아 있지 않다');
ok('body.tile-b 규칙이 없다', !/body\.tile-b/.test(css));
ok('.omit 은 손대지 않는다 (점선 유지)', /\.tile\.omit\{border-style:dashed\}/.test(css));
const app = fs.readFileSync(path.join(DOCS, 'js/app.js'), 'utf8');
ok('app.js 가 색을 css 변수에서 읽는다', /--tile-rgb/.test(app) && /--tile-flip/.test(app));
ok('app.js 에 옛 먹물 rgb(17,26,34) 가 남아 있지 않다', !/rgba\(17,26,34/.test(app));
ok('낮은 어절에 low 클래스를 단다 (표시는 안 하지만 자리는 남긴다)',
  /classList\.add\('low'\)/.test(app));
ok('resetTiles 가 low 를 지운다', /classList\.remove\('low'\)/.test(app));
ok('A/B 토글이 남아 있지 않다', !/tileA|tileB|applyTileVariant/.test(app));
const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
ok('index.html 에 A/B 버튼이 없다', !/id="tile[AB]"/.test(html));

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
