/* Naruve — bump the Android versionCode.

   node scripts/bump-apk.mjs              versionCode +1
   node scripts/bump-apk.mjs --dry-run    바꾸지 않고 무엇이 바뀔지만 출력
   node scripts/bump-apk.mjs --name 1.1   versionName도 같이 지정

   scripts/bump.mjs와 **별개의 스크립트**다. 두 숫자는 성격이 다르다.

     docs/version.json + sw.js  서비스워커 캐시 이름. docs/를 고칠 때마다
                                오른다. 하루에 몇 번씩 오를 수 있다.
     android versionCode        Play에 올리는 빌드의 식별자. APK를 만들
                                때만 오른다.

   한 스크립트에 플래그로 합치면, 문서 한 줄 고치고 bump을 돌렸다가
   앱 버전이 같이 오르거나 그 반대가 된다. 지금 이 둘이 분리돼 있다는
   것이 확인된 참이고(패치 #16 이전 조사), 합치는 순간 그 참이 깨진다.

   versionName은 자동으로 올리지 않는다. 사용자에게 보이는 제품 버전은
   기계가 정할 것이 아니다. 필요하면 --name으로 명시한다.

   Play는 versionCode가 **단조 증가**하기만 하면 된다. 빌드가 실패해서
   번호가 하나 건너뛰어도 문제가 없다. 그래서 빌드 앞에 두는 것이 안전하다.  */

import fs from 'node:fs';

const GRADLE = 'android/app/build.gradle';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const nameIdx = args.indexOf('--name');
const newName = nameIdx >= 0 ? args[nameIdx + 1] : null;

if (nameIdx >= 0 && !newName) {
  console.error('--name 뒤에 값이 없다.  예: --name 1.1');
  process.exit(1);
}

let src;
try {
  src = fs.readFileSync(GRADLE, 'utf8');
} catch {
  console.error(`${GRADLE} 을 읽을 수 없다. 저장소 루트에서 실행한다.`);
  process.exit(1);
}

/* 한 군데만 있어야 한다. 여러 개면 어느 것을 고칠지 사람이 정해야 하고,
   없으면 gradle 구조가 바뀐 것이므로 조용히 넘어가면 안 된다. */
const CODE_RE = /^(\s*versionCode\s+)(\d+)\s*$/gm;
const codeHits = [...src.matchAll(CODE_RE)];
if (codeHits.length !== 1) {
  console.error(`${GRADLE} 에서 versionCode 를 ${codeHits.length}개 찾았다. 1개여야 한다.`);
  console.error('gradle 구조가 바뀌었는지 확인한다. 손대지 않고 종료한다.');
  process.exit(1);
}

const curCode = Number(codeHits[0][2]);
const nextCode = curCode + 1;

const NAME_RE = /^(\s*versionName\s+")([^"]*)("\s*)$/gm;
const nameHits = [...src.matchAll(NAME_RE)];
if (nameHits.length !== 1) {
  console.error(`${GRADLE} 에서 versionName 을 ${nameHits.length}개 찾았다. 1개여야 한다.`);
  process.exit(1);
}
const curName = nameHits[0][2];

if (dryRun) {
  console.log(`versionCode  ${curCode} → ${nextCode}`);
  console.log(`versionName  ${curName}${newName ? ` → ${newName}` : '  (그대로)'}`);
  console.log('--dry-run 이므로 파일을 고치지 않았다.');
  process.exit(0);
}

let out = src.replace(CODE_RE, (_m, head) => `${head}${nextCode}`);
if (newName) out = out.replace(NAME_RE, (_m, head, _old, tail) => `${head}${newName}${tail}`);
fs.writeFileSync(GRADLE, out);

console.log(`versionCode  ${curCode} → ${nextCode}`);
if (newName) console.log(`versionName  ${curName} → ${newName}`);
console.log(`${GRADLE} 을 커밋에 같이 넣는다.`);
