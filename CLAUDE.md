# Naruve 발음앱 — Claude Code 작업 지침

모든 작업 전에 DECISIONS.md를 읽을 것.
여기 기록된 결정과 어긋나는 제안은 하지 않는다.
새 결정이 생기면 수정안을 제시하고 승인을 받는다.
DECISIONS.md는 사용자 승인 없이 수정하지 않는다.

## 프로젝트
한국어 학습자용 발음·억양 점수 앱. PWA로 만들고 나중에 Capacitor로 Android 앱화.
회사: Naruve Studio / 도메인: naruve.app (GitHub Pages에 연결. docs/CNAME이 지정한다)

## 절대 규칙
- 로컬 작업 시작 전 항상 `git fetch` 후 origin/main과의 차이를 확인한다.
  뒤처져 있으면 `git pull --ff-only`로 먼저 맞춘다.
  이 저장소는 폰(클라우드 세션)과 PC(로컬) 양쪽에서 작업되며
  auto-merge가 원격에서 직접 병합하므로 로컬이 조용히 뒤처진다.
- 경로는 반드시 상대경로(./)로 쓴다. 나중에 도메인 루트로 옮길 때 깨진다.
- main에 직접 푸시하지 않는다. 작업이 끝나면 항상 브랜치를 만들고 PR을 연다.
- **docs/에는 앱에 실릴 것만 둔다.** DECISIONS.md 12절 참조.
- docs/ 안 파일을 고쳤으면 커밋 전에 반드시 빌드번호를 올린다. 아래 "빌드번호" 항목 참조.
- 레이아웃을 고칠 때, 기존 safe-area 관련 코드를 제거하거나 옮기기 전에
  반드시 `git log -S`로 그 코드가 왜 생겼는지 먼저 확인한다. 아래 "레이아웃과 safe-area" 참조.
- 파일 수정은 부분 패치가 아니라 해당 파일 전체를 다시 써서 교체한다.
- 근거 없는 수치를 쓰지 않는다. 추정이면 추정이라고 밝힌다.
- DECISIONS.md·CLAUDE.md에서 저장소 밖 문서(COMPANY.md, 전략서, playbook)를 참조할 때는
  '저장소 밖'을 명시한다.
- **이 파일의 "현재 상태"는 코드가 바뀌면 같은 커밋에서 고친다.** 낡은 상태표는
  없느니만 못하다. 다음 세션이 그걸 읽고 이미 끝난 일을 다시 하거나,
  이미 실측인 값을 가짜로 오해한다. 실제로 한 번 그랬다.

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
(이 바는 boot.js가 새 서비스워커를 감지했을 때만 DOM에 넣는다.)

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

## 문구와 언어
UI 문구는 전부 docs/js/ui.js의 표에 있다. HTML에 영어를 직접 쓰지 않는다.
바뀌지 않는 문구는 `data-i18n="키"`를 달고 applyLang()이 채운다.
JS에서 만드는 문구는 `t('키')`로 꺼낸다.

**한국어가 마스터본이다.** 새 문구는 ko를 먼저 쓰고 나머지 언어로 옮긴다.
영어를 먼저 쓰고 한국어로 옮기면 번역투가 남는다.

빠진 키는 en으로 폴백한다. 그래서 언어를 부분만 채워도 화면이 비지 않는다.
`LANGS = ['en','id','ko']`이고 en·ko는 전 키가 차 있다. id는 억양 피드백 6키만
채워져 있고 나머지는 en으로 떨어진다 — 의도된 중간 상태다. 억양 판정은
학습자가 바로 고쳐야 하는 지시라서 모국어로 먼저 옮겼다.
인도네시아어 UI를 마저 채울 때는 ui.js의 `id` 열에 키를 더하기만 하면 된다.

컬렉션 이름·설명(`col`)은 en·ko 두 열뿐이다. id를 채울 때 같이 채운다.

점수 판정 문구는 사람이 아니라 이번 발음을 말한다.
"Native-level"처럼 사용자의 실력을 규정하는 표현으로 되돌리지 않는다.
구간은 90 / 75 / 60이고 `NATURAL` 상수 하나로 묶여 있다.
이 값은 결과 상자(만점대 문구)와 음소 설명 노출 여부에도 같이 쓰인다.

## 개발 모드
SIMULATE 컨트롤은 기본으로 숨어 있다. 헤더의 말 인장을 3초 누르면 나온다.
상태는 body.dev 클래스뿐이라 새로고침하면 사라진다. 저장하지 않는다.

출시할 때는 app.js의 `DEV_UNLOCK`을 false로 바꾼다. 코드도 DOM도 지우지 않는다.
잠금 제스처만 연결되지 않으므로 나중에 되돌릴 것이 없다.

`.sim` 행 자체는 절대 숨기지 않는다. 빌드번호가 그 안에 있고,
그게 폰에서 배포를 확인하는 유일한 수단이다. 숨기는 것은 .sim-label과 .sim-btn뿐이다.

dev 모드에서만 보이는 것이 하나 더 있다. `.micdev` 패널이다.
- 녹음 중에는 입력 레벨 막대와 rms를 실시간으로 보여준다. 마이크가 정말로
  소리를 받고 있는지 폰에서 확인하는 유일한 수단이다.
- 채점 뒤에는 통합 점수를 억양 × 비율 + 발음 × 비율로 분해해 찍고,
  ΔF0·시작/끝 Hz·voiced 프레임 수·적용된 임계값까지 같이 보여준다.
- **패널을 탭하면 `Score.dump()` 전체가 클립보드로 복사된다.** 두 사람이
  폰 화면의 숫자를 읽어 스프레드시트에 옮겨 적는 방식으로는 캘리브레이션이
  끝나지 않는다. 임계값을 실측하는 세션은 이 버튼 위에서 돈다.

## 녹음과 채점
녹음은 docs/js/mic.js의 `Mic.record()`, 채점은 docs/js/score.js의
`Score.evaluate(문장, 캡처, 콜백)` 하나로만 들어간다. app.js는 버튼 상태만 다룬다.

**녹음에 네이티브 플러그인은 필요 없다.** Capacitor의 BridgeWebChromeClient가
WebView의 AUDIO_CAPTURE 요청을 받아 RECORD_AUDIO 런타임 권한을 대신 요청한다.
그래서 `getUserMedia()`를 부르는 것만으로 APK에서 권한 팝업이 정상적으로 뜬다.
페이지가 https라 보안 컨텍스트 조건도 충족한다.

원가 방어는 처음부터 mic.js 안에 있다. 나중에 붙이면 잊는다.
- 한 번의 녹음은 10초를 넘지 않는다 (`MIC.maxMs`)
- 말이 끝나고 약 0.9초 조용하면 스스로 멈춘다 (`MIC.silenceMs`)
- 앞뒤 무음은 기기에서 잘라낸 뒤 내보낸다. 업로드에는 발화만 담긴다
- 소리가 없는 take는 채점기까지 가지 않고 크레딧도 차감하지 않는다
- 같은 오디오를 다시 제출하면 캐시가 답한다. 다시 말하면 새 take다

채점은 두 층이다.

**1층 억양 — 실측이다.** docs/js/pitch.js가 자기상관으로 F0를 뽑고,
문말 320ms 구간의 log2(F0) 기울기를 잰다. 로그로 재는 이유는 사람이
음높이를 비율로 듣기 때문이다. 120→160Hz와 180→240Hz는 같은 몸짓이므로
같은 점수가 나와야 한다. 판정 기준은 문장 자신의 `t:` 태그다 —
화면에 뜨는 "Rising — Lift it" 지시와 결과가 이걸로 일치한다.

문말만 본다. 문중 강세나 미묘한 뉘앙스는 범위 밖이다. 배우는 사람이
듣고 고칠 수 있는 것만 지적한다.

자기상관에는 함정이 둘 있고 pitch.js가 둘 다 막는다. 옥타브 오류는
배수 lag만 검사해서 막는다(짧은 lag을 전부 훑으면 잡음 피크에 끌려간다 —
150Hz가 160Hz로 나왔다). 정수 lag 격자 양자화는 포물선 보간으로 막는다.

유성음 프레임이 `INTO.minFrames`(5)에 못 미치면 억양은 판정하지 않는다.
이때 `ok:null`이 되어 총점은 발음 층만으로 나가고, 화면에는 억양 문구가
아예 뜨지 않는다. "데이터 부족" 같은 안내를 채워 넣지 않는다.

**2층 발음 — 실측이다 (2026-08-18).** Math.random은 없어졌다.
`docs/js/api.js`가 우리 Worker(`naruve-ganada-score`)로 WAV를 보내고 Worker가
Azure를 부른다. 앱에 Azure 키가 들어가지 않고, 무료 30회를 서버가 센다
(DECISIONS 17.1). 응답은 문장 점수 넷과 단어 배열이고, 음소 배열은 응답에
싣지 않는다 — 원본은 R2의 `.azure.json`에 있다.

**큰 숫자는 Azure PronScore 하나다.** 두 층을 섞지 않는다 —
DECISIONS 15.10이 억양을 총점 안이 아니라 자기 줄에 두기로 했다.
`SCORE_MIX`(30:70) 상수는 기록으로 남아 있고 **적용되지 않는다.**
되살리려면 DECISIONS를 같이 고친다. 개발 모드에는 두 층이 따로 찍힌다.

억양 임계값(`INTO`)은 아직 아무도 실측하지 않은 잠정값이다.
개발 모드 표시를 탭하면 캘리브레이션 로그 전체가 클립보드로 복사된다.

**억양은 원가 0이라 소진 상태에서도 돈다.** 무료 30회를 다 쓰면 총점과 타일은
멈추고 억양 줄만 남는다(18절). 서버가 402를 주거나 캐시된 잔여가 0이면
아예 호출하지 않는다.

엔진 도착 순서: placeholder → intonation(완료) → Azure via Worker(완료)
→ 자체 모델(15절, 옆에 붙는다). 교체는 score.js 안에서만 일어난다.

## 발음 엔진 프로브
2층 발음 엔진을 고르기 전에 후보들을 같은 자로 재는 하네스가 저장소에 있다.
실행 순서는 **PROBE.md**(루트)에, 무엇을 왜 재는지는 DECISIONS.md 8.5절에 있다.

- `data/probe_set.json`  DECISIONS.md 8.5 표 그대로. 임의로 문장을 더하지 않는다
- `scripts/tts_gen.py`   프로브용 오류 샘플 생성 (표기를 비틀어 TTS에 넣는다)
- `scripts/prep_audio.sh` mp3 → 16kHz/16bit/mono wav
- `scripts/pa_probe.py`  어댑터를 통해 엔진 호출. 원본 응답을 out/raw/에 그대로 저장
- `scripts/pa_report.py` 표 다섯 개 (A 표기형판별 / B 스키마 / C 판별력 / D 벤더편향 / E 눈금)
- `scripts/adapters/`    엔진별 구현. azure만 구현됐고 etri·ondevice는 골격

엔진을 하나 더 붙이는 비용이 파일 하나여야 DECISIONS.md 8.4의 "세 개를 같은
자로 재고 나서 고른다"가 실제로 지켜진다. 그래서 처음부터 어댑터 구조다.

**out/ 는 .gitignore에 있다.** 생성물(mp3·wav·응답 JSON)은 커밋하지 않는다.
`.env`도 마찬가지다 — 키가 들어간다.

`scripts/adapters/azure.py`의 REST 규격은 아직 실호출로 검증되지 않았다.
400이 오면 코드보다 Speech Studio를 먼저 본다. PROBE.md 1-b 참조.

## 평가 산출물 (2026-08-16)

평가 스크립트는 집계값과 함께 **파일별·구간별 예측 원자료**(확률 또는 점수, 파일 ID 포함)를 항상 저장한다.
집계만 남는 평가는 재현 불가로 본다.
근거: 2026-08-15 실행에서 입력과 모델은 남고 예측 출력만 소실돼 부트스트랩을 위해 91분 재학습이 필요해졌다.

- 예측 원자료와 함께 **실행 스크립트 원본과 설정 전체**를 같은 위치에 남긴다.
  하이퍼파라미터 표기만으로는 복원되지 않는다 (2026-08-17 실증: 3회 시도, 0.4178~0.4274 산포).
- 재현이 안 될 때 하이퍼파라미터를 바꿔가며 기록값에 맞추지 않는다. 문서에 근거 있는 변수만 시험하고,
  다 소진되면 '복원 불가'로 판정하고 새 기준선을 명시한다.

## 예시 음성
재생 요청은 docs/js/audio.js의 `Example.play()` 하나로만 들어간다.
app.js는 버튼 상태만 관리하고 무엇이 소리를 내는지는 모른다. 순서는 이렇다.

1. 녹음 파일   `AUDIO.base` + <해시>.mp3
2. 네이티브 TTS  Capacitor TextToSpeech (APK, 오프라인)
3. Web Speech   SpeechSynthesis ko-KR (브라우저·PWA)
4. 재생 불가 → 호출자가 안내 문구 표시

**Android WebView에는 Web Speech 합성이 없다.** Capacitor가 그 WebView를 쓴다.
그래서 2번이 존재한다. "Web Speech가 없다"를 "이 뷰어가 소리를 막았다,
크롬에서 열어라"로 번역하면 안 된다 — 설치된 앱 안에는 열 크롬이 없다.
안내는 셋으로 갈린다: 인앱 브라우저(카톡 등)에만 브라우저로 열라고 하고,
그 외 재생 불가에는 중립 문구를, 재생 실패에는 음량 확인을 안내한다.

파일명은 한국어 문장의 해시다. 문장이 바뀌면 파일명이 바뀌고,
그건 녹음도 낡았다는 뜻이므로 맞는 동작이다.

**유료 TTS 파일을 넣을 때 코드는 고치지 않는다.** docs/audio/에 mp3를 넣고
같은 폴더에 index.json으로 파일명 목록을 두면, 파일이 있는 문장만 1번이
이기고 나머지는 그대로 2번으로 떨어진다. 플러그인은 그대로 둔다.
지금 docs/audio/ 폴더 자체가 없다. 그래서 모든 문장이 항상 2번 또는 3번이다.

외부 스토리지로 옮길 때는 audio.js의 `AUDIO.base` 한 줄만 바꾼다.

서비스워커는 오디오를 `naruve-audio-v1` 캐시에 cache-first로 담고,
이 캐시는 activate에서 쓸지 않는다(KEEP 배열). 빌드번호가 올라갈 때마다
받은 음성을 다시 내려받게 하면 인도네시아 데이터 요금이 나간다.

플러그인을 추가·제거했으면 `npm run apk`로 다시 빌드해야 폰에 반영된다.

## 보류 항목
지금 구현하지 않는다. 착수할 때 이 목록에서 지운다.
DECISIONS.md 13절의 착수 금지 목록이 이 목록보다 우선한다.

- ~~발음 측정 엔진~~ — 붙었다 (2026-08-18). Worker → Azure.
  다음은 자체 모델(15절)이고 그것은 Azure를 대체하지 않고 옆에 붙는다.
- **로마자 표기·뜻 가리기 토글** — 상급자용. 레벨이 올라가면 노출.
  로마자 표기의 현재 위치는 유지한다. 발음 앱이므로 발음 표기가
  눈에 잘 보이는 것이 맞다는 판단이다.
- **통합 비율 정리** — 총점이 PronScore 하나가 되면서 `SCORE_MIX`는 적용되지
  않는다(15.10). 상수를 지울지, 다른 용도로 되살릴지는 DECISIONS에 기록한 뒤
  정한다. 지금 코드에는 "적용 안 함"이라고 적혀 있다.
- **억양 임계값 캘리브레이션** — `INTO`의 clearSt·targetSt·tailMs는
  잠정값이다. 원어민과 학습자 발화를 모아 로그를 뽑은 뒤 정한다.
  수집 수단은 이미 있다 — 개발 모드 패널 탭 → 클립보드.
- **레벨 배지**(Native / Advanced / Intermediate / Beginner) — 채점
  캘리브레이션 실측을 끝낸 뒤에 도입한다. 원어민이 78점을 받은 사례가 있어
  지금 배지를 붙이면 근거 없는 단정이 된다.
- **결과 카드 공유** — app.js의 share 버튼은 지금 `alert()` 자리표시자다.
  이미지 생성이 여기 들어간다.
- **음성 파일 외부 스토리지 전환** — 문장 1000개 규모에 도달하면.
  audio.js의 `AUDIO.base` 한 줄이다.
- **Sounds 컬렉션 BROWSE에서 숨기기** — 진단 기능을 구현한 뒤.
  app.js의 `SHOW_SOUNDS_IN_BROWSE`를 false로 바꾸면 된다.
- **문장 확장** — 200개 → 500개 → 1000개 단계적으로.
- **유료 TTS로 음성 생성** — ElevenLabs 등에서 만들어 docs/audio/에 배치.
  무료 플랜 생성물은 상업 사용이 불가하므로 반드시 결제 후 생성한 파일만 쓴다.
- **인도네시아어 UI 완성** — ui.js의 `id` 열에 억양 6키 말고 나머지를 채운다.
  컬렉션 이름·설명(`col`)의 id 열도 같이 채운다.

## 배포 경로
이 저장소는 GitHub Pages로 배포된다. 소스는 main 브랜치의 /docs 폴더다.
따라서 main에 들어간 docs/ 내용이 곧 폰에서 보이는 화면이다. 빌드 단계가 따로 없다.
docs/ 밖의 파일(worker/, scripts/, android/, data/, .github/, 루트의 .md들)은
배포물에 포함되지 않는다.

뒤집어 말하면 docs/ 안의 파일은 전부 공개 URL로 접근된다.
무엇을 docs/에 두고 무엇을 루트에 두는지는 DECISIONS.md 12절 참조.

도메인은 naruve.app이고 docs/CNAME이 지정한다. **Settings > Pages의 custom
domain 칸은 쓰지 않는다** — 거기에 입력하면 GitHub이 docs/CNAME을 main에 직접
커밋해 브랜치와 PR을 건너뛴다. 도메인을 바꿀 때는 docs/CNAME을 PR로 고친다.
그 칸 말고 나머지 Pages 설정(Enforce HTTPS 등)은 파일을 건드리지 않으므로
`gh api`로 켜고 꺼도 된다.

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

## 두 개의 버전 번호 — 섞지 않는다
성격이 완전히 다른 숫자가 둘 있고, 서로 다른 스크립트가 관리한다.
한 스크립트로 합치지 않는다. 문서 한 줄 고치고 앱 버전이 오르면 안 된다.

| 숫자 | 어디 | 언제 오르나 | 올리는 것 |
|---|---|---|---|
| 빌드번호 0.1.x | docs/version.json + docs/sw.js | docs/를 고칠 때마다 | `npm run bump` |
| versionCode | android/app/build.gradle | APK를 만들 때마다 | `npm run bump:apk` |

versionName("1.0")은 사용자에게 보이는 제품 버전이라 자동으로 올리지 않는다.
필요하면 `node scripts/bump-apk.mjs --name 1.1`처럼 명시한다.

### 빌드번호 (캐시 무효화)
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

**docs/js/에 파일을 새로 만들었으면 두 곳에 등록한다.** 등록하지 않으면
브라우저에서는 되는데 오프라인·APK에서만 조용히 없는 파일이 된다.
- docs/index.html 의 script 태그 (로드 순서: ui → audio → mic → pitch →
  score → data → phonemes → app → boot. app.js는 다른 전역을 다 쓰므로 뒤에 온다)
- docs/sw.js 의 `PRECACHE` 배열

작업 순서:
1. docs/ 안 파일 수정
2. `npm run bump`
3. `git add -A` — 수정한 파일 + docs/version.json + docs/sw.js를 한 커밋에 함께 넣는다
4. 푸시하고 PR을 연다

예외: docs/ 밖만 고친 경우(scripts/, android/, data/, .github/, capacitor.config.json,
README, 루트의 CLAUDE.md·DECISIONS.md·PROBE.md 등)는 올리지 않는다.
폰에 배포되는 내용이 아니라 캐시와 무관하다.

### versionCode (Play 업로드)
`npm run apk`가 빌드 **앞에서** `scripts/bump-apk.mjs`를 돌린다. 손으로 올릴 일이 없다.
비공개 테스트에서 수정본을 여러 번 올릴 때 한 번이라도 잊으면 Play가 업로드를
거부하는데, 그 실수를 아예 못 하게 만드는 것이 목적이다.

```
npm run apk          # versionCode +1 → cap sync → assembleDebug
npm run bump:apk     # 번호만 올린다
npm run apk:nobump   # 번호를 안 올리고 빌드한다 (로컬 실험용)
node scripts/bump-apk.mjs --dry-run   # 무엇이 바뀔지만 본다
```

Play는 versionCode가 **단조 증가**하기만 하면 되므로, 빌드가 실패해서 번호가
하나 건너뛰어도 문제가 없다. 그래서 빌드 앞에 두는 것이 안전하다.
바뀐 build.gradle은 커밋에 같이 넣는다.

## 파일 담당
- DECISIONS.md        결정 기록. 단일 출처. 승인 없이 고치지 않는다
- PROBE.md            발음평가 프로브 실행 순서 (루트다. docs/에 두지 않는다)
- worker/             Cloudflare Workers 코드. Secret(AZURE_SPEECH_KEY)은 코드·toml·커밋
                      어디에도 넣지 않는다. 배포는 npx wrangler deploy
- docs/index.html      화면 뼈대. 문구는 data-i18n으로만 넣는다
- docs/js/ui.js        UI 문구 표 (한국어가 마스터본, 언어 추가는 열 하나 추가)
- docs/js/identity.js  익명 UUID·세션 ID·크레딧 캐시 (localStorage naruve.*)
- docs/js/api.js       채점 서버 호출 한 곳. 엔드포인트 상수가 여기 하나뿐이다
- docs/js/audio.js     예시 음성 재생 (파일 → 네이티브 TTS → Web Speech 순)
- docs/js/mic.js       마이크 녹음·무음 절단·상한 (Mic.record)
- docs/js/pitch.js     F0 추출·문말 기울기 (Pitch.track / Pitch.finalContour)
- docs/js/score.js     채점 경계 (Score.evaluate, 엔진 교체 지점)
- docs/js/data.js      문장 라이브러리 (여기만 열어서 문장 추가)
- docs/js/phonemes.js  모국어 설명 표 (음소 기준, 언어 추가는 열 하나 추가)
- docs/js/app.js       화면 제어·채점·언어 전환
- docs/js/boot.js      서비스워커 등록, 빌드 번호 표시, 업데이트 바
- docs/css/app.css     색·글꼴·여백. safe-area는 :root와 .phone에만 있다
- docs/sw.js           캐시 전략 (PRECACHE 배열만 손댄다. BUILD 줄은 bump.mjs가 고친다)
- docs/version.json    빌드번호·날짜 (bump.mjs가 고친다. 손으로 고치지 않는다)
- data/probe_set.json     프로브 문장 (DECISIONS.md 8.5 표. 임의로 더하지 않는다)
- scripts/bump.mjs        빌드번호(서비스워커 캐시) 올리는 스크립트
- scripts/bump-apk.mjs    versionCode 올리는 스크립트. bump.mjs와 섞지 않는다
- scripts/icon-layers.mjs 원본 1장에서 아이콘 전체를 다시 만든다
- scripts/icon-verify.mjs 생성 결과 검사 (크기·배경색·아트 출처)
- scripts/tts_gen.py      프로브 오류 샘플 생성
- scripts/prep_audio.sh   mp3 → 16kHz/16bit/mono wav
- scripts/pa_probe.py     엔진 호출. 원본 응답을 out/raw/에 그대로 저장
- scripts/pa_report.py    표 다섯 개 생성
- scripts/adapters/       엔진 어댑터 (azure 구현 / etri·ondevice 골격)
- .env.example            프로브 키 서식. 실제 .env는 커밋되지 않는다
- .github/workflows/auto-merge.yml  PR 자동 병합
- android/app/src/main/java/app/naruve/ganada/MainActivity.java  시스템 바 인셋 처리
- android/app/build.gradle  versionCode·versionName (bump-apk.mjs가 고친다)

## 설계 원칙
- 학습앱이 아니라 점수앱. 첫 화면이 곧 기능이다. 로그인·온보딩·레벨테스트를 앞에 두지 않는다.
  (온보딩은 모국어·학습 단계 자가 신고 2문항까지 허용 — DECISIONS.md 16.4)
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
셋 다 지금은 개발값이 맞다. 출시 직전에 한 번에 바꾼다.

- **capacitor.config.json의 server 블록 제거.** 원격 URL만 띄우는 앱은 플레이
  심사에서 반려될 수 있다. 제거 후에는 docs/ 내용이 APK에 번들되며,
  그때부터 웹 수정마다 APK 재빌드가 필요하다.
- **app.js의 `DEV_UNLOCK`을 false로.** 코드도 DOM도 지우지 않는다.
- **app.js의 `SHOW_SOUNDS_IN_BROWSE`를 false로.** 단, 진단 기능이 생긴 뒤다.
  진단이 없는데 숨기면 Sounds 8개에 아예 도달할 수 없다.

바꾼 뒤 `npm run apk`로 다시 빌드해야 폰에 반영된다.
versionCode는 그 빌드에서 자동으로 오른다. versionName은 손으로 정한다.

## 현재 상태
빌드 0.1.15 기준.

**문장** 50개 (Standard 15 / Everyday 15 / Drama 12 / Sounds 8).
50개 전부 `t:` 억양 태그와 `w:` 약점 음절이 채워져 있어 채점 경로에 구멍은 없다.

**마이크** 실제로 켜진다. getUserMedia로 녹음하고, 무음 절단·10초 상한·
무음 take 무과금이 모두 동작한다.

**채점 1층(억양)** 실측이다. pitch.js가 F0를 뽑고 문말 기울기를 문장의
`t:` 태그와 대조한다. 임계값 `INTO`는 아직 실측 전 잠정값이다.

**채점 2층(발음)** 실측이다. Worker(`naruve-ganada-score`) → Azure.
큰 숫자는 PronScore 하나이고 타일은 어절 단위다. 무료 30회는 서버가 센다.
Worker의 CORS 허용 origin이 `https://naruve.app` 하나뿐이라
로컬(`npm run serve`)에서는 채점만 막힌다 — 화면·녹음·억양은 확인된다.

**엔진 프로브** 하네스는 준비됐고 아직 한 번도 돌지 않았다. 키와 egress가
없어서다. Azure 어댑터의 REST 규격은 미검증. PROBE.md 참조.

**예시 음성** docs/audio/ 폴더가 없어 항상 폰 내장 TTS(APK는 네이티브 플러그인,
브라우저는 Web Speech)로 재생된다. 유료 TTS 파일을 넣으면 코드 수정 없이
그 문장만 파일 재생으로 바뀐다.

**언어** en·ko 완전, id는 억양 피드백 6키만.

**결과 공유** `alert()` 자리표시자.

**versionCode** 1. 첫 `npm run apk`에서 2가 된다.
