// scripts/test_navigation_session.js
//
//   node scripts/test_navigation_session.js [docs 경로]
//
// PR A 의 넷을 지킨다.
//   A-3 좌우 이동 — 컬렉션 끝에서 멈추고, 스와이프는 자동 재생하지 않는다
//   A-4 마지막 자리 복원 — 문장 본문으로 찾고 인덱스는 폴백
//   A-5 세션 단위 402 건너뛰기 — 메모리에만, 새로고침이면 다시 묻는다
//   A-6 개발 셸 UUID 고정 — 네이티브 + 원격 오리진일 때만
//
// A-5·A-6 은 실제로 돌려서 본다. A-3·A-4 는 app.js 가 DOM 에 깊이 묶여 있어
// 코드로 확인한다 — 무엇을 어떻게 확인했는지 이름에 적어 둔다.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const DOCS = process.argv[2] || 'docs';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : ''))); };

// ---------------------------------------------------------------- A-5
console.log('A-5. 세션 단위 402 건너뛰기');

function bootScore(status) {
  const store = new Map([['naruve.credits', '30'],
                         ['naruve.uuid', '11111111-2222-4333-8444-555555555555']]);
  const calls = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    window: { AbortController: null, crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' } },
    navigator: { userAgent: 'node' },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null),
                    setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout: () => {},
    fetch: (url) => { calls.push(url); return Promise.resolve({
      ok: status === 200, status,
      text: () => Promise.resolve(JSON.stringify(
        status === 402 ? { reason: 'credits_exhausted', credits: 0 }
                       : { credits: 7, azure: { pronScore: 80, words: [] } })),
    }); },
    Pitch: { track: () => ({ f0: [], hopMs: 10, frames: 0 }), finalContour: () => null },
  };
  ctx.crypto = ctx.window.crypto; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/identity.js', 'js/api.js', 'js/score.js'])
    vm.runInContext(fs.readFileSync(path.join(DOCS, f), 'utf8'), ctx);
  vm.runInContext(';globalThis.__T={Score};', ctx);
  return { Score: ctx.__T.Score, calls };
}

let seq = 0;
const cap = () => ({ pcm: new Float32Array(160).fill(0.01 * ++seq), sampleRate: 16000,
  ms: 1000, rawMs: 1200, speechMs: 900 + seq, keptMs: 900, trimmedMs: 300,
  peak: 0.5, wav: { size: 1644 } });
const SENT = { k: '반갑습니다.', t: 'statement' };
const wait = () => new Promise(r => setTimeout(r, 8));

{
  const { Score, calls } = bootScore(402);
  let r1 = null; Score.evaluate(SENT, cap(), r => { r1 = r; }); await wait();
  ok('첫 녹음은 서버에 묻는다', calls.length === 1, String(calls.length));
  ok("402 → error 'exhausted'", r1 && r1.error === 'exhausted', r1 && String(r1.error));
  ok('세션 소진 표시가 섰다', Score.exhausted() === true);

  let r2 = null; Score.evaluate(SENT, cap(), r => { r2 = r; }); await wait();
  ok('두 번째 녹음은 서버를 부르지 않는다', calls.length === 1, String(calls.length));
  ok('그래도 소진 안내는 나간다', r2 && r2.error === 'exhausted');
  ok('억양 줄은 살아 있다 (측정만 못 했을 뿐)', r2 && 'intonation' in r2);
}
{
  const { Score, calls } = bootScore(402);   // 새 실행 = 새 모듈
  ok('새 세션은 다시 묻는다 (표시가 안 서 있다)', Score.exhausted() === false);
  Score.evaluate(SENT, cap(), () => {}); await wait();
  ok('새 세션에서 fetch 1회', calls.length === 1, String(calls.length));
}
{
  const { Score, calls } = bootScore(200);
  Score.evaluate(SENT, cap(), () => {}); await wait();
  ok('200 이면 표시가 서지 않는다', Score.exhausted() === false);
  ok('두 번째도 묻는다', (Score.evaluate(SENT, cap(), () => {}), true));
  await wait();
  ok('fetch 2회', calls.length === 2, String(calls.length));
}
{
  const src = fs.readFileSync(path.join(DOCS, 'js/score.js'), 'utf8');
  ok('localStorage 가 아니라 메모리다', !/localStorage[\s\S]{0,80}exhausted/.test(src));
  ok('200 응답이 표시를 푼다', /exhausted\s*=\s*false;/.test(src));
}

// ---------------------------------------------------------------- A-6
console.log('\nA-6. 개발 셸 UUID 고정');

function bootIdentity({ native, host }) {
  const store = new Map();
  let made = 0;
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    window: {
      crypto: { randomUUID: () => { made++; return 'aaaaaaaa-bbbb-4ccc-8ddd-' + String(made).padStart(12, '0'); } },
      Capacitor: native ? { isNativePlatform: () => true } : undefined,
    },
    location: { hostname: host },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null),
                    setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  };
  ctx.crypto = ctx.window.crypto;
  ctx.Capacitor = ctx.window.Capacitor;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOCS, 'js/identity.js'), 'utf8'), ctx);
  vm.runInContext(';globalThis.__T={Identity};', ctx);
  return { Identity: ctx.__T.Identity, store };
}

const FIXED = '00000000-0000-4000-8000-000000000001';
{
  const a = bootIdentity({ native: true, host: 'naruve.app' });
  ok('개발 셸이면 고정 UUID', a.Identity.uuid() === FIXED, a.Identity.uuid());
  const b = bootIdentity({ native: true, host: 'naruve.app' });
  ok('다시 깔아도 같다', b.Identity.uuid() === FIXED, b.Identity.uuid());
  ok('저장소에도 그 값이 남는다', a.store.get('naruve.uuid') === FIXED, a.store.get('naruve.uuid'));
}
{
  const w = bootIdentity({ native: false, host: 'naruve.app' });
  ok('브라우저는 영향 없음 (무작위)', w.Identity.uuid() !== FIXED, w.Identity.uuid());
  ok('UUID 꼴은 지킨다', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(w.Identity.uuid()), w.Identity.uuid());
}
{
  const r = bootIdentity({ native: true, host: 'localhost' });
  ok('출시본(번들·localhost)은 고정하지 않는다', r.Identity.uuid() !== FIXED, r.Identity.uuid());
}
{
  const src = fs.readFileSync(path.join(DOCS, 'js/identity.js'), 'utf8');
  // 주석이 'dev-apk-' 를 왜 안 쓰는지 설명하고 있으므로 낱말이 아니라 값을 본다
  const m = src.match(/DEV_SHELL_UUID\s*=\s*'([^']+)'/);
  ok('고정 UUID 가 서버 UUID_RE 를 통과하는 꼴이다',
    !!m && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m[1]),
    m ? m[1] : '(못 찾음)');
}

// ---------------------------------------------------------------- A-3 / A-4
console.log('\nA-3 · A-4. 좌우 이동과 자리 복원 (코드 확인)');
{
  const app = fs.readFileSync(path.join(DOCS, 'js/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  ok('화살표 버튼이 있다', /id="prevSent"/.test(html) && /id="nextSent"/.test(html));
  ok('끝에서 멈춘다 (범위를 벗어나면 false)', /if\(n<0 \|\| n>=pool\.length\) return false;/.test(app));
  ok('poolOf 가 같은 컬렉션만 모은다', /x\.c===cur/.test(app));
  ok('화살표는 자동 재생한다', /prevSent[\s\S]{0,120}moveBy\(-1, true\)/.test(app)
    && /nextSent[\s\S]{0,120}moveBy\(1, true\)/.test(app));
  ok('스와이프는 자동 재생하지 않는다', /moveBy\(dx<0 \? 1 : -1, false\)/.test(app));
  ok('세로 스크롤과 다투지 않는다', /Math\.abs\(dx\) < Math\.abs\(dy\)\*1\.6/.test(app));
  ok('Next 버튼은 그대로 순환한다', /pool\[\(p\+1\)%pool\.length\]/.test(app));

  ok('자리를 저장한다', /naruve\.pos/.test(app) && /function savePos/.test(app));
  ok('paint 마다 저장한다', /paintNav\(\);\s*\n\s*savePos\(\);/.test(app));
  ok('복원은 문장 본문을 먼저 찾는다', /S\[pool\[j\]\]\.k === p\.k/.test(app));
  ok('인덱스는 폴백', /typeof p\.i === 'number'/.test(app));
  ok('저장된 것이 없으면 Drama 로 연다', /if\(!restorePos\(\)\)/.test(app));
  ok('결과는 복원하지 않는다 (lastRes 를 되살리지 않는다)', !/lastRes\s*=\s*JSON\.parse/.test(app));
}

// ---------------------------------------------------------------- A-7
console.log('\nA-7. 탭 라벨');
{
  const ui = fs.readFileSync(path.join(DOCS, 'js/ui.js'), 'utf8');
  ok("en 이 'Polite'", /tabHonorifics:'Polite'/.test(ui));
  ok("ko 는 그대로 '높임말'", /tabHonorifics:'높임말'/.test(ui));
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
