// 왜 있는가 — 08-26 #76·#77에서 코드가 바뀌었는데 CLAUDE.md·STATUS.md가 닷새 뒤처졌다.
// 사람이 아니라 이 스크립트가 잡는다. DECISIONS 12절 · playbook 6절 편집 3층(저장소 밖)
//
// 사용법:
//   node scripts/check_docs.mjs           검사만. 하나라도 FAIL이면 exit 1
//   node scripts/check_docs.mjs --fix     DECISIONS.md 지문 줄만 실측값으로 고쳐 쓴다
//
// --fix가 고치는 것은 지문 줄 하나뿐이다. 다른 검사는 --fix로도 손대지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = process.argv.includes('--fix');
const rel = (...p) => path.join(ROOT, ...p);
const read = (...p) => fs.readFileSync(rel(...p), 'utf8');

const rows = [];
let failed = false;
function row(item, docv, realv, ok, note) {
  rows.push({ item, docv: String(docv), realv: String(realv), ok, note: note || '' });
  if (!ok) failed = true;
}

// wc -l 과 같은 정의 — 개행 문자 수
const countLines = (s) => (s.match(/\n/g) || []).length;

/* ---------- 검사 1 — DECISIONS.md 지문 ---------- */
const DEC_PATH = rel('DECISIONS.md');
let dec = read('DECISIONS.md');

const FP_RE = /^문서 지문: 총 (\d+)행 \/ 변경 이력 (\d+)건$/m;
const fp = dec.match(FP_RE);

if (!fp) {
  row('DECISIONS 지문 줄', '패턴 없음', '-', false, '"문서 지문: 총 N행 / 변경 이력 M건" 줄을 못 찾았다');
} else {
  const realLines = countLines(dec);

  // 변경 이력 건수는 "## 변경 이력" 헤딩 이후 구간에서만 센다
  const hIdx = dec.search(/^## 변경 이력\s*$/m);
  let realHist = 0;
  if (hIdx === -1) {
    row('DECISIONS 변경 이력 헤딩', '없음', '-', false, '"## 변경 이력" 헤딩을 못 찾았다');
  } else {
    realHist = (dec.slice(hIdx).match(/^- \d{4}-\d{2}-\d{2}/gm) || []).length;
  }

  const docLines = Number(fp[1]);
  const docHist = Number(fp[2]);
  const lineOk = docLines === realLines;
  const histOk = docHist === realHist;

  if (FIX && (!lineOk || !histOk)) {
    // 지문 줄만 고친다. 줄 안의 숫자만 바뀌므로 행 수는 변하지 않는다.
    dec = dec.replace(FP_RE, `문서 지문: 총 ${realLines}행 / 변경 이력 ${realHist}건`);
    fs.writeFileSync(DEC_PATH, dec);
    row('DECISIONS 지문 행 수', docLines, realLines, true, 'FIXED');
    row('DECISIONS 지문 이력 건수', docHist, realHist, true, 'FIXED');
    if (countLines(dec) !== realLines) {
      row('DECISIONS --fix 후 행 수', realLines, countLines(dec), false, '지문 수정이 행 수를 바꿨다');
    }
  } else {
    row('DECISIONS 지문 행 수', docLines, realLines, lineOk, lineOk ? '' : '--fix 로 고친다');
    row('DECISIONS 지문 이력 건수', docHist, realHist, histOk, histOk ? '' : '--fix 로 고친다');
  }
}

/* ---------- 검사 2 — CLAUDE.md "## 현재 상태" ↔ 코드 ---------- */
const claude = read('CLAUDE.md');

// "## 현재 상태" 절만 잘라낸다 — 같은 숫자가 다른 절에도 있어서 절을 좁힌다
const stIdx = claude.search(/^## 현재 상태\s*$/m);
let state = '';
if (stIdx === -1) {
  row('CLAUDE "## 현재 상태" 절', '없음', '-', false, '헤딩을 못 찾았다');
} else {
  const after = claude.slice(stIdx + 1);
  const next = after.search(/^## /m);
  state = next === -1 ? after : after.slice(0, next);
}

// 문서에서 값을 뽑는다. 매칭 안 되면 "패턴 없음"으로 실패시킨다 — 조용히 통과시키지 않는다.
function pick(label, re, src) {
  const m = src.match(re);
  if (!m) {
    row(label, '패턴 없음', '-', false, String(re));
    return null;
  }
  return m;
}

if (state) {
  // 빌드
  const mBuild = pick('빌드', /^빌드 (\S+) 기준\./m, state);
  if (mBuild) {
    const real = JSON.parse(read('docs', 'version.json')).build;
    row('빌드', mBuild[1], real, mBuild[1] === real);
  }

  // 문장 총수 · 컬렉션별 — G0 계산법을 그대로 옮긴다
  const mSent = pick(
    '문장 수',
    /\*\*문장\*\* (\d+)개 \(Standard (\d+) \/ Everyday (\d+) \/ Drama (\d+) \/ Sounds (\d+)\)/,
    state
  );
  if (mSent) {
    const src = read('docs', 'js', 'data.js');
    const sb = {};
    new Function('with(this){' + src + '}; this.__S = S; this.__C = COLLECTIONS;').call(sb);
    const S = sb.__S;
    const byId = (id) => S.filter((x) => x.c === id).length;
    const real = [S.length, byId('standard'), byId('everyday'), byId('drama'), byId('sounds')];
    const doc = mSent.slice(1, 6).map(Number);
    const labels = ['문장 총수', 'Standard', 'Everyday', 'Drama', 'Sounds'];
    labels.forEach((L, i) => row(L, doc[i], real[i], doc[i] === real[i]));
  }

  // mp3 수 — 현재 상태 절 안 첫 매칭
  const mMp3 = pick('mp3 수', /mp3 (\d+)개\(/, state);
  if (mMp3) {
    const n = (d) => fs.readdirSync(rel('docs', 'audio', d)).filter((f) => f.endsWith('.mp3')).length;
    const real = n('m') + n('f');
    row('mp3 수', mMp3[1], real, Number(mMp3[1]) === real);
  }

  // versionCode
  const mVc = pick('versionCode', /\*\*versionCode\*\* (\d+)/, state);
  if (mVc) {
    const g = read('android', 'app', 'build.gradle').match(/versionCode\s+(\d+)/);
    if (!g) {
      row('versionCode', mVc[1], '패턴 없음', false, 'build.gradle에서 versionCode를 못 찾았다');
    } else {
      row('versionCode', mVc[1], g[1], mVc[1] === g[1]);
    }
  }
}

// audio/index.json ↔ 실제 mp3 — 9.4의 "고아 참조 0"을 지키는 검사.
// index.json은 "m/<해시>.mp3" 꼴 문자열의 평면 배열이다(2026-08-31 확인).
// CLAUDE.md 패턴에 기대지 않으므로 "## 현재 상태" 절이 없어도 돈다.
{
  const idx = JSON.parse(read('docs', 'audio', 'index.json'));
  if (!Array.isArray(idx) || idx.some((x) => typeof x !== 'string')) {
    row('audio index 구조', '문자열 배열', Array.isArray(idx) ? '원소 타입 불일치' : typeof idx, false);
  } else {
    const onDisk = new Set();
    for (const d of ['m', 'f']) {
      for (const f of fs.readdirSync(rel('docs', 'audio', d))) {
        if (f.endsWith('.mp3')) onDisk.add(`${d}/${f}`);
      }
    }
    const inIndex = new Set(idx);
    const orphan = [...inIndex].filter((k) => !onDisk.has(k));   // index엔 있는데 파일이 없다
    const unlisted = [...onDisk].filter((k) => !inIndex.has(k)); // 파일은 있는데 index에 없다
    const show = (a) => a.slice(0, 10).join(' ') + (a.length > 10 ? ` … 외 ${a.length - 10}개` : '');
    row('audio 고아 참조', 0, orphan.length, orphan.length === 0, orphan.length ? show(orphan) : '');
    row('audio 미등록', 0, unlisted.length, unlisted.length === 0, unlisted.length ? show(unlisted) : '');
  }
}

/* ---------- 검사 3 — 제어문자 ---------- */
const CTRL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
for (const f of ['DECISIONS.md', 'CLAUDE.md']) {
  const lines = read(f).split('\n');
  const hits = [];
  lines.forEach((l, i) => { if (CTRL.test(l)) hits.push(`${f}:${i + 1}`); });
  row(`제어문자 ${f}`, '없어야 함', hits.length ? hits.join(' ') : '없음', hits.length === 0);
}

/* ---------- 출력 ---------- */
const W = (a) => Math.max(...a.map((s) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));
const w1 = W([...rows.map((r) => r.item), '항목']);
const w2 = W([...rows.map((r) => r.docv), '문서값']);
const w3 = W([...rows.map((r) => r.realv), '실측값']);

console.log('');
console.log(`${pad('항목', w1)}  ${pad('문서값', w2)}  ${pad('실측값', w3)}  결과`);
console.log('-'.repeat(w1 + w2 + w3 + 12));
for (const r of rows) {
  const mark = r.note === 'FIXED' ? 'FIXED' : r.ok ? 'OK' : 'FAIL';
  console.log(`${pad(r.item, w1)}  ${pad(r.docv, w2)}  ${pad(r.realv, w3)}  ${mark}${r.note && r.note !== 'FIXED' ? '  — ' + r.note : ''}`);
}
console.log('');

if (failed) {
  console.error('FAIL — 문서와 코드가 어긋난다. 위 표의 실측값이 정본이다.');
  process.exit(1);
}
console.log(FIX ? 'OK (--fix 적용)' : 'OK');
