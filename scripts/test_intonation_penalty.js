// scripts/test_intonation_penalty.js
//
//   node scripts/test_intonation_penalty.js [docs 경로]
//
// 15.10 변경(2026-08-19) — 억양 방향을 틀리면 총점에서 깎는다.
//
// 지켜야 하는 것 셋:
//   1. 깎는 조건이 좁다. **측정됐고, 틀렸고, 의문/평서일 때만.**
//      감탄은 intonation()이 '하강 기대'로 싸잡지만 감점 대상이 아니다.
//   2. 깎인 값은 화면에만 있다. Azure 응답(res.azure.words, pronScore)과
//      로그의 pron 은 원값 그대로여야 한다 — R2에 남는 것이 원본이다(16절).
//   3. 0 아래로 내려가지 않는다.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const DOCS = process.argv[2] || 'docs';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : ''))); };

/** deltaSt 를 원하는 값으로 주는 Pitch 스텁으로 앱을 올린다. null 이면 못 잼. */
function boot(deltaSt, pron) {
  const store = new Map([['naruve.credits', '30'],
                         ['naruve.uuid', '11111111-2222-4333-8444-555555555555']]);
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    window: { AbortController: null, crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' } },
    navigator: { userAgent: 'node' },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    setTimeout: () => 0, clearTimeout: () => {},
    fetch: () => Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({
        credits: 20, r2Key: 'k',
        azure: {
          pronScore: pron, accuracyScore: pron, fluencyScore: 90, completenessScore: 100,
          words: [
            { word: '어디',   accuracyScore: 95, errorType: 'None' },
            { word: '가세요?', accuracyScore: 88, errorType: 'None' },
          ],
        },
      })),
    }),
    Pitch: {
      track: () => ({ f0: [120, 130, 140], hopMs: 10, frames: 3 }),
      finalContour: () => (deltaSt === null ? null : {
        deltaSt, slopeSt: deltaSt / 3, startHz: 150, endHz: 180,
        windowMs: 320, frames: 12, hz: [150, 165, 180],
      }),
    },
  };
  ctx.crypto = ctx.window.crypto;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/identity.js', 'js/api.js', 'js/score.js']) {
    vm.runInContext(fs.readFileSync(path.join(DOCS, f), 'utf8'), ctx);
  }
  vm.runInContext(';globalThis.__T={Score,INTONATION_PENALTY};', ctx);
  return ctx.__T;
}

let seq = 0;
const capture = () => ({
  pcm: new Float32Array(160).fill(0.01 * ++seq), sampleRate: 16000,
  ms: 1000, rawMs: 1200, speechMs: 900 + seq, keptMs: 900, trimmedMs: 300,
  peak: 0.5, wav: { size: 1644 },
});

async function run(sentence, deltaSt, pron) {
  const { Score } = boot(deltaSt, pron);
  let got = null;
  Score.evaluate(sentence, capture(), r => { got = r; });
  await new Promise(r => setTimeout(r, 10));
  return { res: got, log: Score.log() };
}

const Q = { k: '어디 가세요?', t: 'question' };
const S = { k: '보고 싶었어.', t: 'statement' };
const E = { k: '대박!',        t: 'exclam' };

const P = boot(null, 90).INTONATION_PENALTY;
console.log('INTONATION_PENALTY =', P);
ok('상수가 15다', P === 15, String(P));

// ---------------------------------------------------------------- 1
console.log('\n1. 의문문인데 끝을 내렸다 → 깎는다 (B-5)');
{
  const { res, log } = await run(Q, -3, 97.6);
  ok('억양 판정이 불일치', res.intonation.ok === false && res.intonation.got === 'fall',
    JSON.stringify({ ok: res.intonation.ok, got: res.intonation.got }));
  ok('penalty 15', res.penalty === 15, String(res.penalty));
  ok('rawTotal 97.6 (원값)', res.rawTotal === 97.6, String(res.rawTotal));
  ok('total 82.6 (표시값)', Math.abs(res.total - 82.6) < 1e-9, String(res.total));
  ok('azure.pronScore 는 원값 그대로', res.azure.pronScore === 97.6, String(res.azure.pronScore));
  ok('로그의 pron 도 원값', log[0].pron === 97.6, String(log[0].pron));
  ok('로그가 rawTotal 과 penalty 를 남긴다',
    log[0].rawTotal === 97.6 && log[0].penalty === 15,
    JSON.stringify({ rawTotal: log[0].rawTotal, penalty: log[0].penalty }));
  ok('words 의 accuracyScore 는 손대지 않았다',
    res.azure.words.map(w => w.accuracyScore).join(',') === '95,88',
    res.azure.words.map(w => w.accuracyScore).join(','));
}

// ---------------------------------------------------------------- 2
console.log('\n2. 방향이 맞으면 그대로');
{
  const { res } = await run(Q, 5, 97.6);
  ok('억양 일치', res.intonation.ok === true);
  ok('penalty 0', res.penalty === 0, String(res.penalty));
  ok('total 97.6', res.total === 97.6, String(res.total));
}

// ---------------------------------------------------------------- 3
console.log('\n3. 못 쟀으면 그대로');
{
  const { res } = await run(Q, null, 97.6);
  ok('ok === null', res.intonation.ok === null, String(res.intonation.ok));
  ok('penalty 0', res.penalty === 0, String(res.penalty));
  ok('total 97.6', res.total === 97.6, String(res.total));
  ok('feedback 줄도 없다', res.feedback === null, String(res.feedback));
}

// ---------------------------------------------------------------- 4
console.log('\n4. 평서문 불일치도 깎는다');
{
  const { res } = await run(S, 4, 80);
  ok('기대는 하강, 실제 상승', res.intonation.expect === 'fall' && res.intonation.got === 'rise');
  ok('penalty 15', res.penalty === 15, String(res.penalty));
  ok('total 65', res.total === 65, String(res.total));
}

// ---------------------------------------------------------------- 5
console.log('\n5. 감탄문은 판정만 하고 깎지 않는다 (B-4)');
{
  const { res } = await run(E, 5, 90);
  ok("expect 는 'fall' 로 잡힌다 (현재 pitch 판정 구조)", res.intonation.expect === 'fall',
    res.intonation.expect);
  ok('불일치로는 나온다', res.intonation.ok === false);
  ok('그래도 penalty 0', res.penalty === 0, String(res.penalty));
  ok('total 90 그대로', res.total === 90, String(res.total));
  ok('억양 안내 줄은 그대로 나온다', typeof res.feedback === 'string', String(res.feedback));
}

// ---------------------------------------------------------------- 6
console.log('\n6. 0 아래로 내려가지 않는다');
{
  const { res } = await run(S, 4, 8);
  ok('penalty 15', res.penalty === 15);
  ok('total 0 (음수 아님)', res.total === 0, String(res.total));
}

// ---------------------------------------------------------------- 7
console.log('\n7. app.js 가 마지막 어절 타일에만 감점을 표시한다');
{
  const app = fs.readFileSync(path.join(DOCS, 'js/app.js'), 'utf8');
  ok('점수 매겨진 마지막 어절을 고른다', /lastScored/.test(app));
  ok('Omission 은 후보에서 뺀다', /errorType!=='Insertion'\s*&&\s*w\.errorType!=='Omission'/.test(app));
  ok('res.penalty 를 그 칸에서만 뺀다', /res\.penalty\s*>\s*0\s*&&\s*i\s*===\s*lastScored/.test(app));
  ok('감점 줄을 그린다', /intoPenalty/.test(app));
  // (?!=) 가 없으면 `typeof w.accuracyScore==='number'` 의 == 까지 대입으로 잡힌다
  ok('words 를 제자리에서 고치지 않는다', !/w\.accuracyScore\s*=(?!=)/.test(app));
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
