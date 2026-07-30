# Naruve 발음앱 — Claude Code 작업 지침

## 프로젝트
한국어 학습자용 발음·억양 점수 앱. PWA로 만들고 나중에 Capacitor로 Android 앱화.
회사: Naruve Studio / 도메인: naruve.app (아직 미연결, 지금은 GitHub Pages 임시 주소)

## 절대 규칙
- 경로는 반드시 상대경로(./)로 쓴다. 나중에 도메인 루트로 옮길 때 깨진다.
- main에 직접 푸시하지 않는다. 작업이 끝나면 항상 브랜치를 만들고 PR을 연다.
- docs/ 안 파일을 고쳤으면 커밋 전에 반드시 빌드번호를 올린다. 아래 "빌드번호" 항목 참조.
- 레이아웃을 고칠 때, 기존 safe-area 관련 코드를 제거하거나 옮기기 전에
  반드시 `git log -S`로 그 코드가 왜 생겼는지 먼저 확인한다. 아래 "레이아웃과 safe-area" 참조.
- 파일 수정은 부분 패치가 아니라 해당 파일 전체를 다시 써서 교체한다.
- 근거 없는 수치를 쓰지 않는다. 추정이면 추정이라고 밝힌다.

## 레이아웃과 safe-area
여백을 주는 곳은 웹과 네이티브에 하나씩, 총 두 군데뿐이다.

**웹 (docs/css/app.css)** — `env(safe-area-inset-*)`는 `:root`의 두 줄에만 존재한다.

```
--safe-top: env(safe-area-inset-top, 0px);
--safe-bottom: env(safe-area-inset-bottom, 0px);
```

실제 여백은 레이아웃 최상위인 `.phone`의 padding 한 곳에서만 준다.
개별 컴포넌트(.topbar, .tabs, .buildtag)에 env()를 다시 넣지 않는다.
흩어놓으면 한쪽을 고칠 때 다른 쪽이 조용히 풀린다. 실제로 두 번 그랬다.

예외는 `.update-bar` 하나다. position:fixed라서 .phone의 padding 밖으로 나가므로
자기 오프셋에 `var(--safe-bottom)`를 더한다. env()를 직접 부르지는 않는다.

**네이티브 (android/.../MainActivity.java)** — APK는 targetSdk 36이라
edge-to-edge가 강제된다. WebView는 `env(safe-area-inset-*)`에 디스플레이 컷아웃만
넘겨주고 시스템 바는 넘겨주지 않는다. 그래서 상단(펀치홀)은 CSS로 잡히지만
하단 내비게이션 바는 CSS로 절대 잡히지 않는다. 탭 글자가 내비게이션 바에 겹친
원인이 이것이었고, CSS를 아무리 고쳐도 APK에서는 해결되지 않는다.

MainActivity의 `setOnApplyWindowInsetsListener`가 systemBars + displayCutout을
WebView 컨테이너 padding으로 넣고 인셋을 소비한다. 그 결과 APK에서는
--safe-top/--safe-bottom이 0으로 떨어지는데, 이미 네이티브에서 밀어놨으므로 맞다.
브라우저와 PWA에서는 이 파일이 관여하지 않고 CSS 경로만 동작한다.

이 리스너를 지우면 하단 겹침이 그대로 돌아온다. 지우기 전에 git log를 본다.

세로 구조는 이렇게 고정한다. 바꾸기 전에 이유를 확인한다.
- `.phone`은 `height:100dvh` (min-height 아님) — 열의 높이를 묶어둔다.
- `.stage`만 스크롤한다 (`flex:1; min-height:0; overflow-y:auto`).
  `min-height:0`이 없으면 overflow가 걸리지 않고 열이 늘어난다.
- `.record-zone` `.sim` `.tabs`는 `flex:none` — 눌리지 않는다.
- min-height를 쓰거나 .stage의 스크롤을 빼면, 문장이 길 때 탭바가
  화면 아래로 밀려나가 시스템 내비게이션 바에 겹친다.

빌드번호 표시(.buildtag)는 .sim 행 안의 일반 흐름에 있다.
position:fixed로 되돌리지 않는다. 고정하면 탭바 높이를 상수로 박아야 하고,
그 상수가 safe-area와 어긋나는 순간 다시 겹친다.

## 아이콘
아이콘은 `npm run icons` 한 번으로 끝난다. capacitor-assets를 손으로 부르지 않는다.
원본은 assets/GANADA고딕_icon.v5.png 하나(1024 정사각)이고 나머지는 전부 파생물이다.

**assets/icon.png, icon-foreground.png, icon-background.png는 존재하면 안 된다.**
스크립트가 발견하면 지운다. 이유가 각각 다르다.

- icon-foreground.png / icon-background.png를 주면 capacitor-assets 3.0.5의
  `generateAdaptiveIconForeground`가 템플릿을 `kind === 'icon'`으로 고른다.
  그건 레거시 템플릿(36~192)이라 어댑티브 레이어가 192px로 나온다. 도구 버그다.
  "adaptive 레이어가 192px로 깨진다"의 진짜 원인이며, 덮어쓰기 문제가 아니다.
- icon.png는 logo 폴백으로 읽혀서(project.js loadLogoInputAsset) 진짜 logo.png를 이긴다.

그래서 쓰는 파일은 이것뿐이다.
- assets/logo.png       패딩된 포그라운드. logo 경로가 432px 어댑티브 템플릿을 쓴다
- assets/icon-only.png  레거시 정사각 아이콘 (ic_launcher, ic_launcher_round)
- assets/splash.png / splash-dark.png

처리 순서가 logo → icon → splash라서, logo가 부수적으로 만든 레거시 아이콘과
스플래시는 뒤따르는 icon-only.png와 splash.png가 덮어쓴다. 의도된 동작이다.

**안전 영역 이중 인셋 주의.** 생성된 ic_launcher.xml이 두 레이어를
`inset="16.7%"`로 감싼다. 즉 레이어 이미지는 108dp 중 중앙 72dp에 그려진다.
그 인셋이 곧 안전영역 패딩이므로, 이미지 기준 목표는 66/72 = 91.7%다.
66/108 = 61.1%로 잡으면 인셋이 두 번 걸려 마크가 42dp로 작아진다.
XML이 inset="0%"로 바뀌면 icon-layers.mjs의 SAFE를 66/108로 바꾼다.

배경색은 원본 모서리에서 뽑아 `--iconBackgroundColor`로 넘긴다. 하드코딩하지 않는다.
현재 값은 #C0392F이고 네 모서리가 일치하는지도 스크립트가 확인한다.

올바른 결과: 레이어 81/108/162/216/324/432, 레거시 36/48/72/96/144/192.
`npm run icons:verify`가 크기, 배경색 일치, 레이어가 실제로 logo.png에서 왔는지를
검사하고 하나라도 어긋나면 non-zero로 끝난다.

assets/icon-round.png와 play-store-512.png는 capacitor-assets가 읽지 않는 파일명이다
(인식 목록: logo, logo-dark, icon-only, icon-foreground, icon-background, splash, splash-dark).
스토어 등록용으로만 쓴다.

아이콘을 바꾸면 APK를 다시 빌드해야 폰에 반영된다. `npm run apk`.

## 배포 경로
이 저장소는 GitHub Pages로 배포된다. 소스는 main 브랜치의 /docs 폴더다.
따라서 main에 들어간 docs/ 내용이 곧 폰에서 보이는 화면이다. 빌드 단계가 따로 없다.
docs/ 밖의 파일(scripts/, android/, .github/ 등)은 배포물에 포함되지 않는다.

android/ 를 고친 경우는 Pages 배포로 반영되지 않는다. `npm run apk`로 APK를
다시 만들어 폰에 설치해야 한다. 지금 capacitor.config.json에 server 블록이 있어
APK는 원격 URL을 띄우는 껍데기다. 즉 웹 수정은 즉시, 네이티브 수정은 재설치.

## 브랜치와 PR
main에 직접 푸시하지 않는다. 작업은 항상 브랜치에서 하고 끝나면 PR을 연다.

```
git checkout -b <작업이름>
# 수정 → npm run bump → git add -A → git commit
git push -u origin <작업이름>
gh pr create --fill
```

.github/workflows/auto-merge.yml이 이 저장소 안에서 만들어진 브랜치의 PR을
열리는 즉시 squash 병합하고 브랜치를 지운다. 그래서 PR을 여는 것으로 배포까지 끝난다.
포크에서 온 PR은 병합하지 않는다.

주의할 점:
- 리뷰도 체크도 없이 바로 main에 들어간다. 잘못 연 PR도 그대로 배포된다.
- 이미 열려 있는 PR은 자동 병합되지 않는다. 워크플로는 opened/synchronize에만 반응하므로
  그 브랜치에 커밋을 하나 더 푸시하거나 `gh pr merge`로 직접 병합해야 한다.

`npm run ship`은 현재 브랜치를 그대로 푸시하는 스크립트다. main에서 실행하면
main 직접 푸시가 되므로 쓰지 않는다. bump는 `npm run bump`로 따로 돌린다.

## 빌드번호 (캐시 무효화)
docs/ 안의 파일을 하나라도 수정했으면, 그 변경을 커밋할 때 빌드번호를 같이 올린다.
빼먹으면 서비스워커 캐시 이름이 그대로라 폰에서 변경이 보이지 않는다.

올리는 방법은 하나뿐이다. 손으로 숫자를 고치지 말고 스크립트를 돌린다.

```
npm run bump      # = node scripts/bump.mjs
```

이 스크립트가 바꾸는 파일 두 개:
- docs/version.json  {"build":"0.1.5","date":"..."} — patch 자리 +1, 날짜 갱신
- docs/sw.js         const BUILD = '0.1.5'  — 같은 값으로 치환, 캐시 이름이 바뀜

docs/js/boot.js에는 번호가 없다. boot.js는 version.json을 fetch해서 화면에 표시만 한다.
따라서 빌드번호를 올리려고 boot.js를 여는 것은 잘못이다.

작업 순서:
1. docs/ 안 파일 수정
2. `npm run bump`
3. `git add -A` — 수정한 파일 + docs/version.json + docs/sw.js를 한 커밋에 함께 넣는다
4. 푸시하고 PR을 연다

예외: docs/ 밖만 고친 경우(scripts/, android/, .github/, capacitor.config.json, README 등)는
올리지 않는다. 폰에 배포되는 내용이 아니라 캐시와 무관하다.

## 파일 담당
- docs/js/data.js      문장 라이브러리 (여기만 열어서 문장 추가)
- docs/js/phonemes.js  모국어 설명 표 (음소 기준, 언어 추가는 열 하나 추가)
- docs/js/app.js       화면 제어·채점
- docs/js/boot.js      서비스워커 등록, 빌드 번호 표시
- docs/css/app.css     색·글꼴·여백. safe-area는 :root와 .phone에만 있다
- docs/sw.js           캐시 전략 (건드릴 일 거의 없음. BUILD 줄은 bump.mjs가 고친다)
- docs/version.json    빌드번호·날짜 (bump.mjs가 고친다. 손으로 고치지 않는다)
- scripts/bump.mjs        빌드번호 올리는 스크립트
- scripts/icon-layers.mjs 원본 1장에서 아이콘 전체를 다시 만든다
- scripts/icon-verify.mjs 생성 결과 검사 (크기·배경색·아트 출처)
- .github/workflows/auto-merge.yml  PR 자동 병합
- android/app/src/main/java/app/naruve/ganada/MainActivity.java  시스템 바 인셋 처리

## 설계 원칙
- 학습앱이 아니라 점수앱. 첫 화면이 곧 기능이다. 로그인·온보딩·레벨테스트를 앞에 두지 않는다.
- 점수 눈금: 원어민 93~99. 기준은 "원어민과 같은가"가 아니라 "한국인이 알아듣는가".
- 억양 채점은 F0 분석으로 단말에서 처리 — 원가 0원이므로 무료 사용자에게도 열어준다.
- 모국어 설명은 결핍만 지적하지 않는다. 이미 가진 것을 찾아 쓴다.
  (예: 인도네시아어에는 불파 종성이 있다 — anak, sebab)
- 색: ink #111A22 / paper #FBFAF6 / seal #C0392F
- 한글은 Noto Serif KR, 라틴은 Archivo

## 저작권 경계
K-드라마·K-팝의 가사, 특정 작품의 긴 대사, 작품명·아티스트명은 절대 쓰지 않는다.
짧은 일상 구어(진짜? 대박 헐)와 드라마풍으로 직접 쓴 대사는 자유롭게 쓴다.

## 출시 전 반드시 할 일
capacitor.config.json의 server 블록을 제거한다.
원격 URL만 띄우는 앱은 플레이 심사에서 반려될 수 있다.
제거 후에는 docs/ 내용이 APK에 번들되며, 웹 수정 시 APK 재빌드가 필요하다.

## 현재 상태
문장 50개 (Standard 15 / Everyday 15 / Drama 12 / Sounds 8)
채점은 아직 가짜 값. 마이크를 켜지 않는다.
예시 음성은 폰 내장 TTS. 나중에 직접 녹음 파일로 교체.
