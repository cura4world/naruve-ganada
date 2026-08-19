// scripts/test_consent_onboarding.js
//
//   node scripts/test_consent_onboarding.js [docs 경로]
//
// 동의 2층은 법적 약속이라 조용히 틀리면 안 된다. 지키는 것 셋.
//   1. 기본값이 "동의 안 함"이다. 저장된 것이 없으면 base 로 나간다 —
//      동의를 못 받은 녹음이 5년 보관 쪽(ext/)에 들어가지 않는다.
//   2. 선택 동의를 켜고 끄는 것이 consentTier() 에 그대로 반영된다.
//   3. 온보딩 자가 신고 둘은 건너뛸 수 있고, 그때 값은 null 이다 (16.4).
//
// 온보딩·설정 UI 자체는 app.js 가 DOM 에 묶여 있어 코드로 확인한다.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const DOCS = process.argv[2] || 'docs';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : ''))); };

function boot(seed) {
  const store = new Map(Object.entries(seed || {}));
  const calls = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    window: { AbortController: null, crypto: { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } },
    location: { hostname: 'naruve.app' },
    navigator: { userAgent: 'node' },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null),
                    setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout: () => {},
    fetch: (url, init) => { calls.push({ url, headers: (init && init.headers) || {} });
      return Promise.resolve({ ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify({ credits: 9, tier: 'base',
          azure: { pronScore: 90, words: [] } })) }); },
    Pitch: { track: () => ({ f0: [], hopMs: 10, frames: 0 }), finalContour: () => null },
  };
  ctx.crypto = ctx.window.crypto; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/identity.js', 'js/api.js', 'js/score.js'])
    vm.runInContext(fs.readFileSync(path.join(DOCS, f), 'utf8'), ctx);
  vm.runInContext(';globalThis.__T={Identity,Score};', ctx);
  return { ...ctx.__T, store, calls };
}

// ---------------------------------------------------------------- 1
console.log('1. 기본값은 "동의 안 함"');
{
  const { Identity } = boot();
  const c = Identity.consent();
  ok('base false', c.base === false);
  ok('extended false', c.extended === false);
  ok('consentTier() === base', Identity.consentTier() === 'base', Identity.consentTier());
  ok('온보딩 안 함', Identity.onboarded() === false);
  ok('l1·level 은 null', Identity.l1() === null && Identity.level() === null);
  ok('아직 후속 제안 안 함', Identity.consentAsked() === false);
}
{
  // 저장값이 깨져 있어도 5년 쪽으로 새지 않는다
  const { Identity } = boot({ 'naruve.consent': '{{broken' });
  ok('깨진 값이면 base 로 떨어진다', Identity.consentTier() === 'base');
  ok('extended false', Identity.consent().extended === false);
}

// ---------------------------------------------------------------- 2
console.log('\n2. 동의를 켜고 끈다');
{
  const { Identity, store } = boot();
  Identity.setConsent(true, false);
  ok('필수만 동의 → base', Identity.consentTier() === 'base');
  ok('at 이 ISO 로 남는다', /^\d{4}-\d{2}-\d{2}T/.test(Identity.consent().at), Identity.consent().at);

  Identity.setConsent(true, true);
  ok('선택 동의 → extended', Identity.consentTier() === 'extended');
  ok('저장값에도 extended', JSON.parse(store.get('naruve.consent')).extended === true);

  Identity.setConsent(true, false);
  ok('철회하면 다시 base', Identity.consentTier() === 'base');
}

// ---------------------------------------------------------------- 3
console.log('\n3. /score 에 동의 헤더가 실린다');
{
  const { Identity, Score, calls } = boot();
  Identity.setConsent(true, false);
  Score.evaluate({ k: '반갑습니다.', t: 'statement' }, {
    pcm: new Float32Array(160).fill(0.02), sampleRate: 16000, ms: 1000, rawMs: 1200,
    speechMs: 900, keptMs: 900, trimmedMs: 300, peak: 0.5, wav: { size: 1644 } }, () => {});
  await new Promise(r => setTimeout(r, 8));
  ok('호출이 나갔다', calls.length === 1);
  ok("헤더가 base", calls[0].headers['X-Naruve-Consent'] === 'base',
    calls[0].headers['X-Naruve-Consent']);
}
{
  const { Identity, Score, calls } = boot();
  Identity.setConsent(true, true);
  Score.evaluate({ k: '처음 뵙겠습니다.', t: 'statement' }, {
    pcm: new Float32Array(160).fill(0.03), sampleRate: 16000, ms: 1000, rawMs: 1200,
    speechMs: 901, keptMs: 900, trimmedMs: 300, peak: 0.5, wav: { size: 1644 } }, () => {});
  await new Promise(r => setTimeout(r, 8));
  ok("헤더가 extended", calls[0].headers['X-Naruve-Consent'] === 'extended',
    calls[0].headers['X-Naruve-Consent']);
}

// ---------------------------------------------------------------- 4
console.log('\n4. 온보딩 (16.4 — 자가 신고 둘은 건너뛸 수 있다)');
{
  const { Identity } = boot();
  Identity.finishOnboarding('id', 'beginner');
  ok('온보딩 완료', Identity.onboarded() === true);
  ok('l1 저장', Identity.l1() === 'id', String(Identity.l1()));
  ok('level 저장', Identity.level() === 'beginner', String(Identity.level()));
}
{
  const { Identity } = boot();
  Identity.finishOnboarding(null, null);
  ok('건너뛰어도 완료로 친다', Identity.onboarded() === true);
  ok('미신고는 null 로 남는다', Identity.l1() === null && Identity.level() === null);
}
{
  const { Identity } = boot({ 'naruve.onboarded': '1' });
  ok('이미 마쳤으면 다시 묻지 않는다', Identity.onboarded() === true);
}

// ---------------------------------------------------------------- 5
console.log('\n5. 후속 제안은 한 번만');
{
  const { Identity } = boot();
  ok('처음엔 안 물어봤다', Identity.consentAsked() === false);
  Identity.markConsentAsked();
  ok('물어본 뒤로는 표시가 남는다', Identity.consentAsked() === true);
}

// ---------------------------------------------------------------- 6
console.log('\n6. 16.1 이벤트');
{
  const { Identity } = boot();
  Identity.event('consent_onboarding', { extended: true });
  Identity.event('consent_prompt', { accepted: false, from: 'result' });
  Identity.event('consent_revoke', { from: 'settings' });
  const e = Identity.events();
  ok('세 건이 쌓였다', e.length === 3, String(e.length));
  const one = e[0];
  ok('16.1 모양 — id·at·kind·session·payload',
    ['id', 'at', 'kind', 'session', 'payload'].every(k => k in one), Object.keys(one).join(','));
  ok('consent_onboarding payload', one.kind === 'consent_onboarding' && one.payload.extended === true);
  ok('consent_prompt payload', e[1].kind === 'consent_prompt' && e[1].payload.accepted === false);
  ok('consent_revoke', e[2].kind === 'consent_revoke');
  ok('id 는 익명 UUID', /^[0-9a-f-]{36}$/i.test(one.id), one.id);
}

// ---------------------------------------------------------------- 7
console.log('\n7. UI (코드 확인)');
{
  const app = fs.readFileSync(path.join(DOCS, 'js/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(DOCS, 'css/app.css'), 'utf8');

  ok('온보딩 오버레이가 있다', /id="onboard"/.test(html));
  ok('세 문항이 있다', /id="obL1"/.test(html) && /id="obLevel"/.test(html) && /id="obVoice"/.test(html));
  ok('목소리 미리듣기 버튼', /class="ob-play"/.test(html));
  ok('동의 두 줄이 같은 크기·행 전체가 탭 영역',
    (html.match(/class="ob-consent"/g) || []).length === 2 && /\.ob-consent\{[^}]*cursor:pointer/.test(css));
  ok('선택 동의는 기본 미체크 (checked 없음)',
    !/id="obExt"[^>]*checked/.test(html));
  ok('필수 미체크면 시작 못 한다', /obStart'\)\.disabled = !ok/.test(app));
  ok('첫 실행에만 뜬다', /if\(!Identity\.onboarded\(\)\) openOnboarding\(\)/.test(app));
  ok('건너뛰기 버튼은 자가 신고에만', (html.match(/class="ob-opt ob-skip"/g) || []).length === 2);

  ok('설정 화면이 있다', /id="settings"/.test(html));
  ok('식별자 표시·복사·메일', /id="myUuid"/.test(html) && /id="uuidCopy"/.test(html)
    && /mailto:support@naruve\.app/.test(app));
  ok('서버 삭제 API 를 부르지 않는다', !/delete-request/.test(app));
  ok('방침 링크가 언어를 따라간다', /\.\/privacy\/en\//.test(app));
  ok('dev 항목은 네이티브에서만', /setDevRow'\)\.hidden = !isNativeShell\(\)/.test(app));
  ok('voicebar 잔재가 없다', !/voiceBar|paintVoiceBar/.test(app) && !/id="voiceBar"/.test(html));

  ok('후속 제안은 85점 이상에서', /ASK_MIN = 85/.test(app));
  ok('한 번 물으면 표시를 남긴다', /markConsentAsked\(\)/.test(app));
  ok('이벤트 3종을 낸다', /'consent_onboarding'/.test(app) && /'consent_prompt'/.test(app)
    && /'consent_revoke'/.test(app));
  ok('내 기록은 클라이언트에만 (naruve.best)', /naruve\.best/.test(app));
  ok('미참여자에게는 잠금 안내', /setBestLocked/.test(app));
  ok('소진 문구는 빨강이 아니다', /classList\.toggle\('calm'/.test(app) && /\.audio-note\.calm\{color:var\(--ink-soft\)\}/.test(css));
}

// ---------------------------------------------------------------- 8
console.log('\n8. 서버 접두어');
{
  const w = fs.readFileSync(path.join(path.dirname(DOCS), 'worker/src/index.js'), 'utf8');
  ok('X-Naruve-Consent 를 읽는다', /X-Naruve-Consent/.test(w));
  ok('헤더가 없으면 base', /v === "extended" \? "ext" : "base"/.test(w));
  ok('층이 키의 맨 앞이다', /\$\{tier\}\/\$\{uuid\}\/\$\{today\(\)\}/.test(w));
  ok('CORS 에 헤더가 열려 있다', /Allow-Headers[\s\S]{0,200}X-Naruve-Consent/.test(w));
  ok('customMetadata 에도 남는다', /consent: tier === "ext"/.test(w));
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
