// scripts/tts/test_index_html.js
//
// typecast_gen.py 가 만든 index.html 의 메모 기능 회귀 검사.
// 브라우저를 띄우지 않고, 생성된 HTML에서 <script>를 그대로 꺼내
// node vm 위에서 돌린다. 템플릿(INDEX_JS)을 고쳤으면 이것을 돌린다.
//
//   node scripts/tts/test_index_html.js <index.html> [기대하는_localStorage_키]
//
// 키를 주지 않으면 naruve.tts.memo.YYYYMMDD[.접미어] 꼴인지만 본다.
// 실패가 하나라도 있으면 exit 1.

import fs from 'node:fs';
import vm from 'node:vm';

const HTML = process.argv[2];
const WANT_KEY = process.argv[3] || null;

if (!HTML) {
  console.error('사용법: node scripts/tts/test_index_html.js <index.html> [기대키]');
  process.exit(2);
}

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: <script> 블록을 못 찾음'); process.exit(1); }
const code = m[1];

// ---- 최소 스텁. 실제 브라우저 API 중 쓰는 것만 흉내 낸다 ----------------
const store = new Map();
const els = new Map();
function el(id) {
  if (!els.has(id)) {
    els.set(id, { id, textContent: '', value: '', hidden: true,
      addEventListener() {}, focus() {} });
  }
  return els.get(id);
}
let alerts = [];
let confirmAnswer = true;

const ctx = {
  console,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
  document: { querySelectorAll: () => [], getElementById: el, addEventListener() {} },
  alert: msg => alerts.push(msg),
  confirm: () => confirmAnswer,
  navigator: {},
  setTimeout, clearTimeout,
  Date, JSON, Object, String, Number, Array, RegExp, Math,
};
vm.createContext(ctx);
// const 선언은 vm 컨텍스트의 전역 속성이 되지 않는다. 같은 스크립트 안에서
// 렉시컬로 잡아 밖으로 넘긴다. 템플릿 코드 자체는 한 글자도 바꾸지 않는다.
vm.runInContext(code + '\n;globalThis.__T={KEY,VOICES,SENTS};', ctx);

const { KEY, VOICES, SENTS } = ctx.__T;
const { buildText, parseText } = ctx;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); }
};

console.log(HTML);
console.log('보이스', VOICES.length, '· 문장', SENTS.length, '· 키', KEY);
console.log('라벨 예:', VOICES.slice(0, 3).map(v => v.label).join(' / '));
console.log();

if (VOICES.length < 2 || SENTS.length < 2) {
  console.error('보이스와 문장이 각각 2개 이상이어야 검사할 수 있다.');
  process.exit(2);
}
const V0 = VOICES[0], V1 = VOICES[1], V2 = VOICES[2] || null;
const S0 = SENTS[0].id, S1 = SENTS[1].id, S2 = SENTS[2] ? SENTS[2].id : SENTS[1].id;

// ---- 1. 저장은 키 하나에 JSON 하나 -------------------------------------
console.log('1. localStorage');
ctx.ST.voices[V0.id] = { rating: 4, memo: 'ㄱ', s: { [S0]: 'ㄴ' } };
ctx.save();
ok('키가 정확히 하나', store.size === 1, '실제 ' + store.size);
const keyName = [...store.keys()][0];
ok('키 이름이 코드의 KEY와 같다', keyName === KEY, keyName + ' vs ' + KEY);
ok('키 꼴 naruve.tts.memo.YYYYMMDD[.접미어]',
  /^naruve\.tts\.memo\.\d{8}(\.[A-Za-z0-9_-]+)?$/.test(KEY), KEY);
if (WANT_KEY) ok('키가 기대값과 같다', KEY === WANT_KEY, KEY + ' vs ' + WANT_KEY);
let parsedStore = null;
try { parsedStore = JSON.parse(store.get(keyName)); } catch (e) {}
ok('값이 JSON', parsedStore !== null && typeof parsedStore.voices === 'object');

// ---- 2. 내보내기 형식 ---------------------------------------------------
console.log('\n2. 내보내기 형식');
ctx.ST = { v: 1, voices: {} };
ctx.ST.voices[V0.id] = { rating: 4, memo: '차분하고 문말이 안정적',
  s: { [S0]: '물음표 좋음', [S1]: '긴 문장에서 흔들림' } };
ctx.ST.voices[V1.id] = { rating: 3, memo: '', s: {} };
const txt = buildText();
console.log(txt.split('\n').slice(0, 7).map(l => '  | ' + l).join('\n'));

const lines = txt.split('\n');
ok('첫 줄 "# TTS 후보 청취 메모 (…)"',
  /^# TTS 후보 청취 메모 \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\)$/.test(lines[0]), lines[0]);
ok('보이스 줄 "## 라벨 ★★★★☆"', lines[1] === '## ' + V0.label + ' ★★★★☆', lines[1]);
ok('전체 메모 줄 "전체: …"', lines[2] === '전체: 차분하고 문말이 안정적', lines[2]);
ok('문장 메모 줄 "- ' + S0 + ': …"', lines[3] === '- ' + S0 + ': 물음표 좋음', lines[3]);
ok('문장 메모는 SENTS 순서를 따른다', lines[4] === '- ' + S1 + ': 긴 문장에서 흔들림', lines[4]);
ok('별점만 있는 보이스는 헤더만', lines[5] === '## ' + V1.label + ' ★★★☆☆', lines[5]);
if (V2) ok('전부 빈 보이스는 (메모 없음)', txt.includes('## ' + V2.label + '\n(메모 없음)\n'));
ok('모든 보이스가 블록을 가짐', VOICES.every(v => txt.includes('## ' + v.label)));
ok('블록 사이 빈 줄 없음', !/\n\n/.test(txt.replace(/\n$/, '')));

// ---- 3. 라운드트립 ------------------------------------------------------
console.log('\n3. 라운드트립 (내보낸 것을 그대로 불러오기)');
const before = JSON.parse(JSON.stringify(ctx.ST.voices));
const parsed = parseText(txt);
ok('parseText가 null이 아님', parsed !== null);
if (parsed) {
  const after = parsed.res;
  ok('전 보이스 복원', Object.keys(after).length === VOICES.length,
    Object.keys(after).length + '/' + VOICES.length);
  ok('모르는 이름 0', parsed.unknown.length === 0, JSON.stringify(parsed.unknown));
  for (const vid of Object.keys(before)) {
    const b = before[vid], a = after[vid];
    ok('복원 일치 ' + vid.slice(-6),
      a && a.rating === b.rating && (a.memo || '') === (b.memo || '')
        && JSON.stringify(a.s) === JSON.stringify(b.s),
      'want ' + JSON.stringify(b) + '\n        got  ' + JSON.stringify(a));
  }
  ctx.ST = { v: 1, voices: after };
  const txt2 = buildText();
  ok('재내보내기 동일 (헤더 제외)',
    txt2.split('\n').slice(1).join('\n') === txt.split('\n').slice(1).join('\n'));
}

// ---- 4. 여러 줄 메모 ----------------------------------------------------
console.log('\n4. 여러 줄 보이스 메모');
ctx.ST = { v: 1, voices: {} };
ctx.ST.voices[V0.id] = { rating: 5, memo: '첫 줄\n둘째 줄\n셋째 줄', s: { [S2]: '감탄 약함' } };
const t4 = buildText();
const p4 = parseText(t4);
ok('여러 줄 메모 복원', p4 && p4.res[V0.id].memo === '첫 줄\n둘째 줄\n셋째 줄',
  p4 ? JSON.stringify(p4.res[V0.id].memo) : 'null');
ok('여러 줄과 함께 문장 메모도 복원', p4 && p4.res[V0.id].s[S2] === '감탄 약함');
ok('별점 5 복원', p4 && p4.res[V0.id].rating === 5);

// ---- 5. 까다로운 값 -----------------------------------------------------
console.log('\n5. 까다로운 값');
ctx.ST = { v: 1, voices: {} };
ctx.ST.voices[V0.id] = { rating: 0, memo: '', s: { [S0]: '억양: 좋음 — 다만 "끝"이 약함' } };
const t5 = buildText();
const p5 = parseText(t5);
ok('콜론 포함 문장 메모 복원',
  p5 && p5.res[V0.id].s[S0] === '억양: 좋음 — 다만 "끝"이 약함',
  p5 ? JSON.stringify(p5.res[V0.id].s[S0]) : 'null');
ok('별점 0이면 헤더에 별 없음', t5.includes('## ' + V0.label + '\n'), '별이 붙었다');

// ---- 6. 형식 불일치는 null ----------------------------------------------
console.log('\n6. 형식 불일치는 null');
ok('빈 문자열', parseText('') === null);
ok('아무 텍스트', parseText('안녕하세요\n반갑습니다') === null);
ok('헤더는 있으나 보이스 없음', parseText('# TTS 후보 청취 메모 (2026-01-01 00:00)') === null);
ok('모르는 보이스만', parseText('# TTS 후보 청취 메모 (x)\n## 없는_이름 ★★★★★\n전체: 뭐') === null);
ok('JSON을 넣어도 null', parseText('{"voices":{}}') === null);

// ---- 7. 불러오기 실패 시 무변경 -----------------------------------------
console.log('\n7. 불러오기 실패 시 무변경');
ctx.ST = { v: 1, voices: {} };
ctx.ST.voices[V0.id] = { rating: 2, memo: '원래값', s: {} };
const snapshot = JSON.stringify(ctx.ST);
alerts = [];
el('imptext').value = '이건 형식이 아니다';
ctx.doImport();
ok('alert 떴다', alerts.length === 1);
ok('상태 그대로', JSON.stringify(ctx.ST) === snapshot);

// ---- 8. 전체 삭제 -------------------------------------------------------
console.log('\n8. 전체 삭제');
ctx.save();
confirmAnswer = false;
ctx.doClear();
ok('confirm 취소하면 안 지운다', Object.keys(ctx.ST.voices).length === 1);
confirmAnswer = true;
ctx.doClear();
ok('confirm 승인하면 지운다', Object.keys(ctx.ST.voices).length === 0);
ok('localStorage 키도 지운다', !store.has(KEY));

// ---- 9. HTML 자체 제약 --------------------------------------------------
console.log('\n9. HTML 제약');
const ext = (html.match(/(?:https?:)?\/\/[^"' )]+/g) || []).filter(u => !u.startsWith('//'));
ok('외부 리소스 0', ext.length === 0, JSON.stringify(ext.slice(0, 3)));
ok('<link> 없음', !/<link\b/i.test(html));
ok('<img> 없음', !/<img\b/i.test(html));
ok('<script>는 하나', (html.match(/<script/g) || []).length === 1);
ok('script에 src 없음', !/<script[^>]+src=/i.test(html));
const audio = (html.match(/<audio/g) || []).length;
const smemo = (html.match(/class="smemo"/g) || []).length;
const vmemo = (html.match(/class="vmemo"/g) || []).length;
const stars = (html.match(/class="st"/g) || []).length;
ok('audio = 보이스×문장', audio === VOICES.length * SENTS.length,
  audio + ' vs ' + VOICES.length * SENTS.length);
ok('칸 메모 input = audio 수', smemo === audio, smemo + ' vs ' + audio);
ok('보이스 메모 textarea = 보이스 수', vmemo === VOICES.length, vmemo + '');
ok('별 = 보이스×5', stars === VOICES.length * 5, stars + '');
ok('오디오 경로가 전부 상대경로',
  (html.match(/<audio[^>]+src="([^"]*)"/g) || []).every(t => !/src="(\/|[a-z]+:)/i.test(t)));
ok('첫 열 고정 유지', /th\.sent\s*\{[^}]*position:sticky/.test(html));

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
