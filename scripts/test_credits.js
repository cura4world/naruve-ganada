// scripts/test_credits.js
//
// 소진 게이트 회귀 검사.
//
//   node scripts/test_credits.js [docs 경로]
//
// 0.1.18에서 DEV_UUIDS에 오른 테스터가 계속 0에 묶여 있었다. 원인은 서버가
// 아니라 클라이언트였다 — localStorage에 굳은 credits=0을 보고 score.js가
// /score를 아예 부르지 않아서, 서버가 주는 credits:-1을 받을 길이 없었다.
//
// 그래서 이 검사가 지키는 규칙은 하나다. **소진 판정의 권위는 서버다.**
// 캐시가 0이어도 녹음이 끝나면 반드시 호출이 나가야 한다.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const DOCS = process.argv[2] || 'docs';

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : ''))); };

/** 서버 응답을 흉내 내는 fetch로 앱 세 파일을 올린다. */
function boot(opts) {
  const store = new Map();
  if (opts.cached !== undefined) store.set('naruve.credits', String(opts.cached));
  store.set('naruve.uuid', '11111111-2222-4333-8444-555555555555');

  const calls = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    window: { AbortController: null, crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' } },
    navigator: { userAgent: 'node' },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    setTimeout: (fn) => 0,
    clearTimeout: () => {},
    fetch: (url, init) => {
      calls.push({ url, headers: init && init.headers });
      const r = opts.reply;
      return Promise.resolve({
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        text: () => Promise.resolve(JSON.stringify(r.body)),
      });
    },
    // score.js가 쓰는 억양 층. 여기서는 판정하지 않으므로 최소한만 준다.
    Pitch: { track: () => [], finalContour: () => null },
  };
  ctx.crypto = ctx.window.crypto;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/identity.js', 'js/api.js', 'js/score.js']) {
    vm.runInContext(fs.readFileSync(path.join(DOCS, f), 'utf8'), ctx);
  }
  vm.runInContext(';globalThis.__T={Identity,Api,Score};', ctx);
  return { ctx, calls, store, ...ctx.__T };
}

// 캡처 스텁. fingerprint가 실제로 훑는 필드만 채운다.
let seq = 0;
function capture() {
  seq++;
  return {
    pcm: new Float32Array(160).fill(0.01 * seq), sampleRate: 16000,
    ms: 1000, rawMs: 1200, speechMs: 900 + seq, keptMs: 900, trimmedMs: 300,
    peak: 0.5, wav: { size: 1644 },
  };
}
const SENT = { k: '반갑습니다.', t: 'statement' };

// ---------------------------------------------------------------- 1
console.log('1. 캐시가 0이어도 서버를 부른다  (0.1.18 버그)');
{
  const t = boot({ cached: 0, reply: { status: 200, body: { credits: -1, azure: { pronScore: 88, words: [] } } } });
  ok('시작 상태가 0으로 읽힌다', t.Identity.credits() === 0 && !t.Identity.unlimited());
  let got = null;
  t.Score.evaluate(SENT, capture(), (r) => { got = r; });
  ok('fetch가 나갔다', t.calls.length === 1, 'calls=' + t.calls.length);
  ok('/score 로 갔다', /\/score$/.test(t.calls[0] ? t.calls[0].url : ''), t.calls[0] && t.calls[0].url);
}

// ---------------------------------------------------------------- 2
console.log('\n2. 200 + credits:-1  → 무제한(∞)');
await new Promise(r => setTimeout(r, 0));
{
  const t = boot({ cached: 0, reply: { status: 200, body: { credits: -1, azure: { pronScore: 88, words: [] }, r2Key: 'k' } } });
  let got = null;
  t.Score.evaluate(SENT, capture(), (r) => { got = r; });
  await new Promise(r => setTimeout(r, 10));
  ok('콜백이 왔다', !!got);
  ok('error 없음', got && got.error === null, got && String(got.error));
  ok('총점이 들어왔다', got && got.total === 88, got && String(got.total));
  ok('캐시가 -1로 갱신', t.Identity.credits() === -1, String(t.Identity.credits()));
  ok('unlimited() 참', t.Identity.unlimited());
  ok('저장된 문자열이 "-1"', t.store.get('naruve.credits') === '-1', t.store.get('naruve.credits'));
}

// ---------------------------------------------------------------- 3
console.log('\n3. 402 → 그때 소진');
{
  const t = boot({ cached: 30, reply: { status: 402, body: { reason: 'credits_exhausted', credits: 0 } } });
  let got = null;
  t.Score.evaluate(SENT, capture(), (r) => { got = r; });
  await new Promise(r => setTimeout(r, 10));
  ok('호출은 나갔다', t.calls.length === 1);
  ok("error === 'exhausted'", got && got.error === 'exhausted', got && String(got.error));
  ok('캐시가 0으로 내려갔다', t.Identity.credits() === 0, String(t.Identity.credits()));
  ok('unlimited() 거짓', !t.Identity.unlimited());
  ok('총점은 없다', got && got.total === null);
}

// ---------------------------------------------------------------- 4
console.log('\n4. 200 + 남은 수  → 그 값으로 갱신');
{
  const t = boot({ cached: 0, reply: { status: 200, body: { credits: 7, azure: { pronScore: 71, words: [] } } } });
  let got = null;
  t.Score.evaluate(SENT, capture(), (r) => { got = r; });
  await new Promise(r => setTimeout(r, 10));
  ok('캐시가 7로 갱신', t.Identity.credits() === 7, String(t.Identity.credits()));
  ok('unlimited() 거짓', !t.Identity.unlimited());
  ok('총점 71', got && got.total === 71);
}

// ---------------------------------------------------------------- 5
console.log('\n5. 서버가 못 미더울 때는 캐시를 건드리지 않는다');
{
  const t = boot({ cached: 12, reply: { status: 500, body: { error: 'boom' } } });
  let got = null;
  t.Score.evaluate(SENT, capture(), (r) => { got = r; });
  await new Promise(r => setTimeout(r, 10));
  ok("error === 'server'", got && got.error === 'server', got && String(got.error));
  ok('캐시 12 그대로', t.Identity.credits() === 12, String(t.Identity.credits()));
}
{
  const t = boot({ cached: -1, reply: { status: 422, body: { reason: 'nothing_recognized' } } });
  let got = null;
  t.Score.evaluate(SENT, capture(), (r) => { got = r; });
  await new Promise(r => setTimeout(r, 10));
  ok("422는 error === 'nothing'", got && got.error === 'nothing', got && String(got.error));
  ok('무제한 캐시가 유지된다', t.Identity.unlimited(), String(t.Identity.credits()));
}

// ---------------------------------------------------------------- 6
console.log('\n6. -1 외의 음수는 여전히 0으로 떨어진다');
{
  const t = boot({ cached: 5, reply: { status: 200, body: { credits: -7, azure: { pronScore: 60, words: [] } } } });
  t.Score.evaluate(SENT, capture(), () => {});
  await new Promise(r => setTimeout(r, 10));
  ok('-7 → 0', t.Identity.credits() === 0, String(t.Identity.credits()));
  ok('unlimited() 거짓', !t.Identity.unlimited());
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
