// scripts/tts/test_example_audio.js
//
// docs/js/audio.js 의 재생 겹침 회귀 검사.
//
//   node scripts/tts/test_example_audio.js [docs 경로]
//
// 0.1.17에서 폰에 리버브처럼 겹쳐 울리던 원인은 재생마다 new Audio를 만들고,
// 이전 재생의 늦은 play() 거부(AbortError)가 **새 재생의 손잡이**를 지운 뒤
// 그 위에 TTS를 얹은 것이었다. 손잡이가 사라지면 이후 stop()이 무력해져
// 클릭마다 한 겹씩 쌓였다. 이 검사가 보는 것은 그 세 가지다.
//
//   1. Audio 인스턴스가 몇 개 만들어지는가 (1이어야 한다)
//   2. 두 번째 play() 전에 pause()가 불렸는가
//   3. 늦게 도착한 이전 재생의 거부가 현재 재생을 건드리지 않는가

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const DOCS = process.argv[2] || 'docs';

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : ''))); };

// ---- Audio 스텁. 실제 요소가 하는 일 중 이 검사가 보는 것만 흉내 낸다 ----
function makeCtx() {
  const state = {
    made: 0,          // new Audio 횟수
    calls: [],        // 'pause' | 'play' | 'src=...' | 'time=0'
    rejectors: [],    // 보류 중인 play() 거부 함수들
    listeners: {},    // 요소에 붙은 리스너
    warns: [], logs: [],
  };

  function Audio() {
    state.made++;
    const self = {
      preload: '', _src: '', _t: 0,
      set src(v) { self._src = v; state.calls.push('src=' + v); },
      get src() { return self._src; },
      set currentTime(v) { self._t = v; state.calls.push('time=' + v); },
      get currentTime() { return self._t; },
      pause() { state.calls.push('pause'); },
      play() {
        state.calls.push('play');
        return { catch(fn) { state.rejectors.push(fn); return this; } };
      },
      addEventListener(ev, fn) { (state.listeners[ev] = state.listeners[ev] || []).push(fn); },
    };
    return self;
  }

  const store = new Map();
  const ctx = {
    console: {
      log: (...a) => state.logs.push(a.join(' ')),
      warn: (...a) => state.warns.push(a.join(' ')),
      error: () => {},
    },
    window: {},                      // Capacitor 없음, speechSynthesis 없음
    navigator: { userAgent: 'node' },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    fetch: () => Promise.resolve({ ok: true, json: () => ['f/aaaaaaaa.mp3', 'f/bbbbbbbb.mp3'] }),
    setTimeout: () => {},
    Audio,
    state,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOCS, 'js/audio.js'), 'utf8')
    + '\n;globalThis.__T={Example,audioRel,audioName};', ctx);
  return ctx;
}

const H = () => ({ onstart() {}, onend() {}, onerror() {} });
const S1 = { k: '처음 뵙겠습니다.', t: 'statement' };
const S2 = { k: '어디 가세요?', t: 'question' };

// ---------------------------------------------------------------- 1
console.log('1. 단일 Audio 인스턴스');
{
  const ctx = makeCtx();
  const { Example } = ctx.__T;
  Example.play(S1, H());
  Example.play(S2, H());
  Example.play(S1, H());
  ok('play() 3회에 Audio 인스턴스는 1개', ctx.state.made === 1, 'made=' + ctx.state.made);
  ok('_state().elements 가 1', Example._state().elements === 1);
}

// ---------------------------------------------------------------- 2
console.log('\n2. 두 번째 play() 전에 pause + 되감기');
{
  const ctx = makeCtx();
  const { Example } = ctx.__T;
  Example.play(S1, H());
  const firstPlay = ctx.state.calls.indexOf('play');
  ctx.state.calls.length = 0;          // 여기서부터 두 번째 호출만 본다
  Example.play(S2, H());
  const c = ctx.state.calls;
  const iPause = c.indexOf('pause'), iTime = c.indexOf('time=0');
  const iSrc = c.findIndex(x => x.startsWith('src=')), iPlay = c.indexOf('play');
  ok('첫 play()가 있었다', firstPlay >= 0);
  ok('두 번째 호출에 pause가 있다', iPause >= 0, c.join(' → '));
  ok('pause 다음에 currentTime=0', iTime > iPause, c.join(' → '));
  ok('그다음 src 교체', iSrc > iTime, c.join(' → '));
  ok('마지막에 play', iPlay > iSrc, c.join(' → '));
}

// ---------------------------------------------------------------- 3
console.log('\n3. 늦게 도착한 이전 재생의 거부가 현재를 건드리지 않는다');
{
  const ctx = makeCtx();
  const { Example } = ctx.__T;
  Example.play(S1, H());
  Example.play(S2, H());
  ok('두 번째 재생이 살아 있다', Example._state().playing === 'file', String(Example._state().playing));

  // 첫 번째 play()의 거부(AbortError)가 이제야 도착한다
  ctx.state.rejectors[0]({ name: 'AbortError' });
  ok('여전히 두 번째 재생이 살아 있다', Example._state().playing === 'file',
    String(Example._state().playing));
  ok('TTS 폴백이 끼어들지 않았다',
    !ctx.state.warns.some(w => w.includes('play() rejected')), ctx.state.warns.join(' | '));

  // 그 상태에서 stop()이 실제로 먹는가 — 0.1.17에서는 손잡이가 지워져 무력했다
  ctx.state.calls.length = 0;
  Example.stop();
  ok('stop()이 pause를 부른다', ctx.state.calls.includes('pause'), ctx.state.calls.join(' → '));
  ok('stop() 뒤 재생 주체가 없다', Example._state().playing === null);
}

// ---------------------------------------------------------------- 4
console.log('\n4. 현재 재생의 거부는 폴백으로 간다');
{
  const ctx = makeCtx();
  const { Example } = ctx.__T;
  let fellBack = false;
  Example.play(S1, { onstart() {}, onend() {}, onerror() { fellBack = true; } });
  ctx.state.rejectors[0]({ name: 'NotAllowedError' });
  ok('경고가 찍힌다', ctx.state.warns.some(w => w.includes('play() rejected')),
    ctx.state.warns.join(' | '));
  // 이 환경에는 native TTS도 speechSynthesis도 없으므로 onerror로 떨어진다
  ok('폴백이 실행됐다 (여기선 재생 불가 → onerror)', fellBack);
}

// ---------------------------------------------------------------- 5
console.log('\n5. 로그');
{
  const ctx = makeCtx();
  const { Example } = ctx.__T;
  Example.play(S1, H());
  Example.stop();
  const l = ctx.state.logs.join(' | ');
  ok('[example] play <hash> 가 찍힌다', /\[example\] play f\/[0-9a-f]{8}\.mp3/.test(l), l);
  ok('[example] stop 이 찍힌다', /\[example\] stop/.test(l), l);
  // ended 는 요소 이벤트라 스텁에서 직접 부른다
  const ctx2 = makeCtx();
  ctx2.__T.Example.play(S1, H());
  (ctx2.state.listeners.ended || []).forEach(fn => fn());
  ok('[example] ended 가 찍힌다', /\[example\] ended/.test(ctx2.state.logs.join(' | ')),
    ctx2.state.logs.join(' | '));
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
