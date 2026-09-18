#!/usr/bin/env node
/**
 * docs/js/data.js → scripts/tts/sentences.json — TTS 생성기 입력 목록을 뽑는다.
 *
 *   node scripts/tts/extract_sentences.mjs --out scripts/tts/sentences.json
 *   node scripts/tts/extract_sentences.mjs --out sub.json --filter 8677ebec,675c3419
 *   node scripts/tts/extract_sentences.mjs --out sub.json --filter hashes.txt
 *   node scripts/tts/extract_sentences.mjs --out - --quiet        # stdout으로
 *
 * 왜 있나 — 배치 1(문장 200)의 입력 목록이 저장소에 남지 않았다. 저장소의
 * sentences.json은 배치 0(50문장) 그대로였고, 그것을 뽑았다는 `scripts/tts/extract`는
 * 존재하지 않는 파일이었다. CLAUDE.md '평가 산출물' — 산출물 옆에 설정 전체를
 * 남긴다 — 를 지키려면 목록을 만드는 코드가 저장소에 있어야 한다. 여기서 닫는다.
 *
 * **hash가 이 스크립트의 존재 이유다.** 앱은 오직 해시 파일명으로만 음성을 찾는다.
 * 한 글자라도 어긋나면 앱은 조용히 기기 TTS로 떨어지고, 아무 오류도 보이지 않는다.
 * 그래서 계산을 여기서 한 번 더 하고, 아래 '세 구현 대조'를 통과하지 못하면 멈춘다.
 *
 * id는 data.js **배열 순서**에 기댄다(std01…snd30). 순서가 바뀌면 id도 바뀐다 —
 * 순서에 의존하지 않는 식별자가 필요하면 hash를 쓴다. --filter도 hash로만 받는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DATA_JS = path.join(REPO, 'docs', 'js', 'data.js');

/* 컬렉션 id → 파일명 약칭. 배치 0이 쓴 것과 같은 표다. 바꾸면 옛 id와 어긋난다. */
const ABBREV = { standard: 'std', everyday: 'evd', drama: 'drm', sounds: 'snd' };

/* ---------------------------------------------------------------- 해시
 *
 * docs/js/audio.js 의 audioName() 과 **같은 값**이어야 한다. 그쪽이 권위다 —
 * 앱이 실제로 파일을 찾을 때 부르는 것이 그 함수다.
 *
 * 세 구현 대조 (2026-09-18):
 *   docs/js/audio.js:59      str.charCodeAt(i)  · h >>> 0          · ('0000000'+hex).slice(-8)
 *   scripts/tts/deploy_audio.py:36  ord(ch)     · h & 0xFFFFFFFF   · f"{h:08x}"
 *   scripts/tts/build_final.py:64   ord(ch)     · h & 0xFFFFFFFF   · f"{h:08x}"
 *
 * 곱셈 상수(1+2^1+2^4+2^7+2^8+2^24 = FNV-1a 32bit prime 16777619)와 초기값
 * 0x811c9dc5는 셋이 같다. 32비트 자르기와 8자리 0채움도 결과가 같다.
 *
 * **다른 곳은 한 군데뿐이다.** JS의 charCodeAt은 UTF-16 코드 **단위**를 주고
 * 파이썬의 ord는 코드 **포인트**를 준다. BMP 밖 문자(이모지 등)가 들어오면
 * JS는 서러게이트 2개로, 파이썬은 1개로 세어 값이 갈린다. 한글·라틴·문장부호는
 * 전부 BMP라 지금까지 문제가 없었다. 아래 fnv1a()는 audio.js 쪽(코드 단위)을
 * 따르고, assertHashAgreement()가 파이썬 쪽 계산도 같이 해서 갈리면 멈춘다.
 * 언젠가 문장에 이모지가 들어오는 날, 조용히 틀리는 대신 여기서 걸린다.
 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {          // charCodeAt = UTF-16 코드 단위
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* 파이썬 두 스크립트가 하는 계산 — 코드 포인트 기준. 대조용으로만 쓴다. */
function fnv1aCodePoints(str) {
  let h = 0x811c9dc5;
  for (const ch of str) {                          // for..of = 코드 포인트
    h ^= ch.codePointAt(0);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

function assertHashAgreement(sentences) {
  const split = sentences.filter((s) => fnv1a(s.k) !== fnv1aCodePoints(s.k));
  if (split.length) {
    console.error('해시 구현이 갈린다 — JS(코드 단위)와 파이썬(코드 포인트)의 값이 다르다.');
    for (const s of split.slice(0, 5)) {
      console.error(`  ${s.id}  ${s.k}`);
      console.error(`    audio.js 계산 ${fnv1a(s.k)} / deploy_audio.py 계산 ${fnv1aCodePoints(s.k)}`);
    }
    console.error('BMP 밖 문자(이모지 등)가 문장에 들어왔다는 뜻이다.');
    console.error('deploy_audio.py·build_final.py의 audio_hash()를 UTF-16 코드 단위로 맞추기 전에는 배포하지 않는다.');
    process.exit(1);
  }
}

/* ---------------------------------------------------------------- data.js 읽기 */

function loadData() {
  if (!fs.existsSync(DATA_JS)) {
    console.error(`data.js가 없다: ${DATA_JS}`);
    process.exit(1);
  }
  const src = fs.readFileSync(DATA_JS, 'utf8');
  const box = {};
  try {
    /* data.js는 전역에 var S / var COLLECTIONS 를 둘 뿐이다. 그대로 실행해 꺼낸다 —
       정규식으로 긁으면 문장 안의 따옴표·백슬래시에서 조용히 틀린다. */
    new Function('__box', `${src}\n__box.S = S; __box.COLLECTIONS = COLLECTIONS;`)(box);
  } catch (e) {
    console.error(`data.js를 평가하지 못했다: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(box.S) || !box.S.length) {
    console.error('data.js에서 S 배열을 찾지 못했다.');
    process.exit(1);
  }
  return box;
}

function buildSentences({ S, COLLECTIONS }) {
  const order = COLLECTIONS.map((c) => c.id);
  const seen = Object.create(null);
  const out = [];

  for (const s of S) {
    const ab = ABBREV[s.c];
    if (!ab) {
      console.error(`모르는 컬렉션 '${s.c}' — ABBREV 표에 없다. 약칭을 정하고 표에 더한다.`);
      process.exit(1);
    }
    seen[s.c] = (seen[s.c] || 0) + 1;
    const n = seen[s.c];
    if (n > 99) {
      console.error(`${s.c} 문장이 99개를 넘었다 — id 두 자리로는 모자란다. 자릿수를 늘려야 한다.`);
      process.exit(1);
    }
    out.push({
      id: ab + String(n).padStart(2, '0'),
      collection: s.c,
      type: s.t || '',
      form: s.f || '',
      level: s.lv ?? null,
      situation: s.s || '',
      k: s.k,
      tts: s.k,                 /* 손질 전이라 같다. 억양을 손보려면 tts만 바꾼다 */
      hash: fnv1a(s.k),
      why: [s.s, s.f].filter(Boolean).join(' · '),
    });
  }

  /* data.js의 컬렉션 순서를 따른다. 표를 눈으로 훑을 때 섞여 있으면 못 읽는다. */
  out.sort((a, b) => {
    const d = order.indexOf(a.collection) - order.indexOf(b.collection);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  return out;
}

/* ---------------------------------------------------------------- 검사 */

function assertUnique(sentences) {
  const byId = Object.create(null);
  const byHash = Object.create(null);
  for (const s of sentences) {
    (byId[s.id] ||= []).push(s.k);
    (byHash[s.hash] ||= []).push(s.id);
  }
  const dupId = Object.entries(byId).filter(([, v]) => v.length > 1);
  if (dupId.length) {
    console.error(`문장 id가 겹친다: ${dupId.map(([k]) => k).join(', ')}`);
    process.exit(1);
  }
  /* 해시가 겹치면 두 문장이 같은 mp3를 가리킨다 — 한쪽이 다른 쪽 소리를 낸다. */
  const dupHash = Object.entries(byHash).filter(([, v]) => v.length > 1);
  if (dupHash.length) {
    console.error('해시 충돌 — 두 문장이 같은 파일을 가리킨다:');
    for (const [h, ids] of dupHash) console.error(`  ${h}  ${ids.join(' ')}`);
    process.exit(1);
  }
}

/* ---------------------------------------------------------------- filter */

function readFilter(value) {
  let raw = value;
  if (fs.existsSync(value)) raw = fs.readFileSync(value, 'utf8');
  const want = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith('#'));

  const bad = want.filter((t) => !/^[0-9a-f]{8}$/.test(t));
  if (bad.length) {
    console.error(`--filter는 8자리 소문자 hash만 받는다. 이건 아니다: ${bad.join(', ')}`);
    console.error('  (id가 아니라 hash다 — id는 data.js 순서가 바뀌면 같이 바뀐다.)');
    process.exit(1);
  }
  const dup = want.filter((t, i) => want.indexOf(t) !== i);
  if (dup.length) {
    console.error(`--filter에 같은 hash가 두 번 있다: ${[...new Set(dup)].join(', ')}`);
    process.exit(1);
  }
  return want;
}

function applyFilter(sentences, want) {
  const have = new Map(sentences.map((s) => [s.hash, s]));
  const missing = want.filter((h) => !have.has(h));
  if (missing.length) {
    console.error(`--filter의 hash가 data.js에 없다: ${missing.join(', ')}`);
    console.error('  문장이 바뀌었으면 해시도 바뀐다. docs/js/data.js를 확인한다.');
    process.exit(1);
  }
  /* --filter에 적은 순서를 지킨다. 청취표의 행 순서가 그대로 그 순서가 된다. */
  return want.map((h) => have.get(h));
}

/* ---------------------------------------------------------------- main */

function parseArgs(argv) {
  const a = { out: null, filter: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--out') a.out = argv[++i];
    else if (t === '--filter') a.filter = argv[++i];
    else if (t === '--quiet') a.quiet = true;
    else if (t === '-h' || t === '--help') { console.log(help()); process.exit(0); }
    else { console.error(`모르는 인자: ${t}`); console.error(help()); process.exit(1); }
  }
  if (!a.out) { console.error('--out이 필요하다 (stdout은 --out -).'); console.error(help()); process.exit(1); }
  return a;
}

function help() {
  return [
    'node scripts/tts/extract_sentences.mjs --out <경로|-> [--filter <hash들|파일>] [--quiet]',
    '',
    '  --out     쓸 경로. -면 stdout',
    '  --filter  8자리 hash 목록(콤마·공백 구분) 또는 그 목록이 든 파일. # 주석 허용',
    '  --quiet   요약을 찍지 않는다',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = loadData();
  let sentences = buildSentences(data);

  assertUnique(sentences);
  assertHashAgreement(sentences);

  const want = args.filter ? readFilter(args.filter) : null;
  if (want) sentences = applyFilter(sentences, want);

  const chars = sentences.reduce((n, s) => n + s.tts.length, 0);

  const doc = {
    _comment: 'docs/js/data.js 문장. scripts/tts/extract_sentences.mjs 로 뽑았다. 손으로 고치지 않는다.',
    _id_note: 'data.js에는 문장별 id가 없다(id:는 COLLECTIONS 4개뿐). 컬렉션 약칭 + data.js 배열 순서 2자리로 만들었다. 순서가 바뀌면 id도 바뀐다.',
    _tts_note: 'k는 화면 텍스트, tts는 TTS 입력. 뽑은 직후에는 같다. 억양 손질은 tts만 바꾼다 — k를 바꾸면 해시가 바뀌어 앱이 파일을 못 찾는다.',
    _hash_note: 'docs/js/audio.js audioName()과 같은 FNV-1a 8자리. docs/audio/{m,f}/<hash>.mp3 가 앱이 찾는 이름이다.',
    _credits_note: `입력 글자당 1크레딧(DECISIONS 9.1). 이 목록의 총 글자수 ${chars}.`,
    _source: 'docs/js/data.js',
    _generated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    _filter: want,
    sentences,
  };

  const json = JSON.stringify(doc, null, 2) + '\n';
  if (args.out === '-') {
    process.stdout.write(json);
  } else {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, json, 'utf8');
  }

  if (!args.quiet) {
    const per = {};
    for (const s of sentences) per[s.collection] = (per[s.collection] || 0) + 1;
    const chPer = {};
    for (const s of sentences) chPer[s.collection] = (chPer[s.collection] || 0) + s.tts.length;
    const where = args.out === '-' ? '(stdout)' : args.out;
    console.error(`문장 ${sentences.length}개 · 총 글자수 ${chars} → ${where}`);
    for (const c of Object.keys(per)) {
      console.error(`  ${c.padEnd(9)} ${String(per[c]).padStart(3)}문장 ${String(chPer[c]).padStart(5)}자`);
    }
    if (want) console.error(`  --filter ${want.length}개 적용`);
  }
  return 0;
}

process.exit(main());
