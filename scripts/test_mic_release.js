// scripts/test_mic_release.js
//
//   node scripts/test_mic_release.js [docs 경로]
//
// 2026-08-19 — 녹음이 끝나면 마이크를 놓는다.
//
// 2026-08-18에는 반대로 했다. 카카오톡 인앱 브라우저가 문장을 바꿀 때마다
// 권한 다이얼로그를 띄워서 스트림을 take 사이에 유지했는데, 그 상태에서
// **예시 음성이 먹먹하고 작게 들렸다**(크롬·APK 양쪽). 마이크가 열려 있는 동안
// 안드로이드가 오디오 경로를 통신 모드로 돌리는 것으로 본다.
//
// 그래서 이 검사가 지키는 것은 셋이다.
//   1. take가 끝나면 트랙이 stop 된다 (readyState → ended, 스트림 버림)
//   2. 다음 take는 getUserMedia 를 **다시** 부른다
//   3. 예시 재생 직전에 마이크가 열려 있으면 audio.js 가 닫는다
//
// 되돌림이 인앱 브라우저의 다이얼로그를 되살릴 수 있다. 그건 실기로만 확인된다.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const DOCS = process.argv[2] || 'docs';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n))
                            : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : ''))); };

function boot() {
  const S = { gum: 0, madeTracks: [], ctxClosed: 0, warns: [], logs: [] };

  function track() {
    const t = { kind: 'audio', readyState: 'live', stop() { t.readyState = 'ended'; } };
    S.madeTracks.push(t);
    return t;
  }
  function stream() {
    const ts = [track()];
    return { getAudioTracks: () => ts, getTracks: () => ts };
  }

  class MediaRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; if (this.onstop) this.onstop(); }
  }

  function AudioContext() {
    return {
      state: 'running', resume() {},
      close() { S.ctxClosed++; },
      createAnalyser: () => ({ fftSize: 1024, getFloatTimeDomainData(b) { b.fill(0); } }),
      createMediaStreamSource: () => ({ connect() {} }),
      // build() 는 여기서 끝난다. 이 검사는 트랙 정리만 본다.
      decodeAudioData: () => Promise.reject(new Error('stub')),
    };
  }

  const ctx = {
    console: { log: (...a) => S.logs.push(a.join(' ')),
               warn: (...a) => S.warns.push(a.join(' ')), error() {} },
    navigator: {
      userAgent: 'node',
      mediaDevices: { getUserMedia: () => { S.gum++; return Promise.resolve(stream()); } },
    },
    MediaRecorder, AudioContext,
    // audio.js 의 단일 <audio> 요소
    Audio: function () {
      return { preload: '', src: '', currentTime: 0,
               pause() {}, play: () => ({ catch() {} }), addEventListener() {} };
    },
    Blob: class { constructor() { this.size = 10; } arrayBuffer() { return Promise.reject(new Error('stub')); } },
    setInterval: () => 1, clearInterval() {}, setTimeout: (f) => 0, clearTimeout() {},
    Date, Math, Float32Array, Promise,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: () => Promise.resolve({ ok: true, json: () => [] }),
    document: { addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {} }) },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOCS, 'js/mic.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(DOCS, 'js/audio.js'), 'utf8'), ctx);
  vm.runInContext(';globalThis.__T={Mic,Example};', ctx);
  return { ...ctx.__T, S, ctx };
}

const H = () => ({ onstart() {}, onlevel() {}, ondone() {}, onerror() {} });
const wait = () => new Promise(r => setTimeout(r, 5));

// ---------------------------------------------------------------- 1
console.log('1. take가 끝나면 트랙을 놓는다');
{
  const { Mic, S } = boot();
  Mic.record(H());
  await wait();
  ok('getUserMedia 1회', S.gum === 1, String(S.gum));
  ok('녹음 중에는 트랙이 live', Mic.diag().states === 'live', Mic.diag().states);
  ok('held true', Mic.diag().held === true);

  Mic.stop();
  await wait();
  ok('take 뒤 트랙이 ended', S.madeTracks.every(t => t.readyState === 'ended'),
    S.madeTracks.map(t => t.readyState).join(','));
  ok('스트림을 버렸다 (tracks 0)', Mic.diag().tracks === 0, String(Mic.diag().tracks));
  ok('held false', Mic.diag().held === false);
  ok('AudioContext 도 닫았다', S.ctxClosed >= 1, String(S.ctxClosed));
}

// ---------------------------------------------------------------- 2
console.log('\n2. 다음 take 는 getUserMedia 를 다시 부른다');
{
  const { Mic, S } = boot();
  Mic.record(H()); await wait(); Mic.stop(); await wait();
  ok('1회차 후 gum 1', S.gum === 1, String(S.gum));
  Mic.record(H()); await wait();
  ok('2회차에 다시 부른다', S.gum === 2, String(S.gum));
  ok('새 트랙이 열렸다', Mic.diag().states === 'live', Mic.diag().states);
  Mic.stop(); await wait();
  ok('2회차도 놓는다', S.madeTracks.every(t => t.readyState === 'ended'),
    S.madeTracks.map(t => t.readyState).join(','));
  ok('트랙을 두 번 만들었다 (재사용 아님)', S.madeTracks.length === 2, String(S.madeTracks.length));
}

// ---------------------------------------------------------------- 3
console.log('\n3. 예시 재생 직전에 열린 마이크를 닫는다');
{
  const { Mic, Example, S } = boot();
  Mic.record(H());
  await wait();
  ok('열린 상태를 만들었다', Mic.diag().held === true);

  // 재생 중 녹음은 없는 흐름이지만, 어떤 경로로든 열려 있으면 닫아야 한다.
  // recording 중에는 건드리지 않는다 — 그건 진행 중인 take를 죽이는 짓이다.
  Example.play({ k: '반갑습니다.', t: 'statement' }, { onstart() {}, onend() {}, onerror() {} });
  ok('녹음 중에는 닫지 않는다', Mic.diag().held === true, Mic.diag().states);

  Mic.stop(); await wait();
  ok('정상 경로에서는 열린 채 남지 않는다', Mic.diag().held === false);
}
{
  /* "놓지 못한 길"을 실제로 만들어 본다. Mic 을 통째로 갈아끼워
     held && !recording 상태를 흉내내고, Example.play 가 그것을 닫는지 본다.
     audio.js 는 전역 Mic 을 호출 시점에 읽으므로 교체가 먹는다. */
  const { Example, ctx, S } = boot();
  let released = 0;
  ctx.Mic = {
    diag: () => ({ tracks: 1, states: 'live', held: released === 0, ctx: 'running', recording: false }),
    release: () => { released++; },
  };
  Example.play({ k: '반갑습니다.', t: 'statement' }, { onstart() {}, onend() {}, onerror() {} });
  ok('열린 마이크를 닫았다', released === 1, String(released));
  ok('경고를 남겼다', S.warns.some(w => w.includes('mic still open at playback')),
    S.warns.join(' | '));
  ok('로그에도 남는다', S.logs.some(l => l.includes('mic-close')), S.logs.join(' | '));

  // 녹음 중이면 건드리지 않는다
  const b2 = boot();
  let released2 = 0;
  b2.ctx.Mic = {
    diag: () => ({ tracks: 1, states: 'live', held: true, ctx: 'running', recording: true }),
    release: () => { released2++; },
  };
  b2.Example.play({ k: '반갑습니다.', t: 'statement' }, { onstart() {}, onend() {}, onerror() {} });
  ok('녹음 중에는 닫지 않는다 (진행 중인 take를 죽이지 않는다)', released2 === 0, String(released2));
}

// ---------------------------------------------------------------- 4
console.log('\n4. 코드에서 확인');
{
  const mic = fs.readFileSync(path.join(DOCS, 'js/mic.js'), 'utf8');
  const audio = fs.readFileSync(path.join(DOCS, 'js/audio.js'), 'utf8');
  ok('teardown 이 release 를 부른다', /function teardown\(\)[\s\S]{0,320}release\(\);/.test(mic));
  ok('idle 타이머가 없다', !/idleTimer|armIdleRelease|MIC_IDLE_RELEASE_MS/.test(mic));
  // 머리말이 "visibilitychange 해제는 지웠다"라고 적고 있으므로 낱말이 아니라
  // 리스너 등록을 본다
  ok('visibilitychange 리스너가 없다', !/addEventListener\('visibilitychange'/.test(mic));
  ok('pagehide 리스너가 없다', !/addEventListener\('pagehide'/.test(mic));
  ok('스트림 재사용 분기가 없다', !/streamAlive\(\)\s*\?\s*Promise\.resolve/.test(mic));
  ok('audio.js 가 재생 전에 마이크를 닫는다', /closeMicIfOpen\(\)/.test(audio));
  ok('닫을 때 경고를 남긴다', /mic still open at playback/.test(audio));
  ok('녹음 중에는 닫지 않는다', /d\.held\s*&&\s*!d\.recording/.test(audio));
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
