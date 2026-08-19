# Naruve — Korean Pronunciation

한국어 발음·억양 점수 앱. 웹앱(PWA)으로 만들고, 나중에 Capacitor로 감싸 Android 앱으로 낸다.

---

## 처음 한 번만 — 배포 준비

### 1. GitHub 저장소 만들기

```bash
cd naruve-ganada
git init
git add -A
git commit -m "first"
git branch -M main
git remote add origin https://github.com/<아이디>/naruve-ganada.git
git push -u origin main
```

### 2. GitHub Pages 켜기

저장소 → **Settings** → **Pages**

- Source: `Deploy from a branch`
- Branch: `main` / 폴더: **`/docs`**
- Save

1~2분 뒤 주소가 나온다:

```
https://<아이디>.github.io/naruve-ganada/
```

### 3. 폰에 설치

Android Chrome으로 위 주소를 열고 → 메뉴 ⋮ → **홈 화면에 추가**

이제 홈 화면 아이콘으로 앱처럼 열린다.

---

## 매일 쓰는 흐름

```bash
# 1. Claude Code로 파일 수정
# 2. 배포
npm run ship
```

`ship` 한 줄이 이렇게 동작한다:

1. 빌드 번호를 올린다 (`0.1.1` → `0.1.2`)
2. 서비스워커의 캐시 이름을 바꾼다 ← **이게 핵심**
3. 커밋하고 푸시한다

30초~1분 뒤 폰에서 앱을 열면 새 버전이 적용된다.

### 적용됐는지 확인하는 법

화면 **왼쪽 아래에 빌드 번호**가 작게 떠 있다.

```
v0.1.2 · 2026-07-29
```

푸시한 번호와 같으면 최신이다. 다르면 아직 옛 버전을 보고 있는 것이다.

앱을 켜둔 채로 푸시하면, 잠시 뒤 화면 아래에 **"New build ready — tap to load"** 버튼이 뜬다. 누르면 바로 새 버전으로 바뀐다.

---

## 로컬에서 보기

```bash
npm run serve
# → http://localhost:5173
```

---

## 개발용 Android 앱 (껍데기 APK)

APK는 **껍데기**다. 안에 웹이 들어 있지 않고 WebView가 `https://naruve.app/` 를
그대로 띄운다. 그래서 흐름이 이렇게 갈린다.

| 무엇을 고쳤나 | 폰에 반영하는 법 |
|---|---|
| `docs/` (웹) | push → Pages 배포 → **앱에서 새로고침하거나 앱을 껐다 켠다.** APK 재빌드 없음 |
| `android/`, `capacitor.config.json`, 플러그인 | **APK를 다시 만들어 설치한다** |

설정 탭(⚙)의 임시 바에 **새로고침** 버튼이 있다 — 네이티브에서만 보인다.

### 설치 (사람이 한다)

1. `D:ihub_workpk
aruve-ganada-dev-0.1.21.apk` 를 폰으로 옮긴다
   (USB, 카카오톡 나에게 보내기, 구글 드라이브 아무거나)
2. 파일을 누르면 "출처를 알 수 없는 앱" 경고가 뜬다 →
   **설정 → 이 출처 허용** → 뒤로 → 다시 설치
3. 첫 실행에서 **마이크 권한**을 한 번 묻는다. 허용한다.
   한 번 허용하면 웹 쪽 `getUserMedia`는 다시 묻지 않는다

앱 이름은 **Naruve 가나다 (dev)** 다. 출시본과 구분하려고 붙였다.
디버그 서명이라 Play에 올릴 수 없다 — 그럴 물건이 아니다.

SHA256 `90ed79d8413b422e626651d8f35f6463517408e03bdfcfc75c6118884408e498`

### 다시 만들기

```
npm run apk
```

`versionCode`를 올리고 `cap sync` 후 `assembleDebug` 까지 한다.
산출물은 `android/app/build/outputs/apk/debug/app-debug.apk`.

### 마이크 권한이 되는 이유

네이티브 플러그인이 없다. Capacitor의 `BridgeWebChromeClient.onPermissionRequest`
(`node_modules/@capacitor/android/.../BridgeWebChromeClient.java:102`)가 WebView의
`AUDIO_CAPTURE` 요청을 받아 `RECORD_AUDIO`·`MODIFY_AUDIO_SETTINGS` 런타임 권한을
대신 요청한다. Manifest에 셋 다 선언돼 있고, 페이지가 https라 보안 컨텍스트
조건도 충족한다. **`MainActivity`에 손댈 것이 없다.**

### 출시할 때 (지금은 하지 않는다)

개발용은 remote, 출시용은 bundled로 **이원화**한다.

1. `capacitor.config.json`의 `server` 블록 제거
2. `npx cap copy` — 그때부터 `docs/`가 APK 안에 번들된다
3. release 키로 서명, AAB로 출력
4. `appName`에서 `(dev)` 제거

원격 URL만 띄우는 앱은 심사에서 반려될 수 있다. 번들로 바꾸면 그때부터
웹 수정마다 APK 재빌드가 필요하다. DECISIONS 17절에 "개발용 remote /
출시용 bundled 이원화"를 적을 때 이 문단을 근거로 쓴다.

### 실험 — "먹먹한 소리"의 원인 가르기 (사람이 한다)

예시 음성이 어떨 때는 가깝고 어떨 때는 멀고 작게 들린다. 한 번 시작되면
지속되고 새로고침과 무관하다. **가설: 마이크 스트림이 살아 있는 동안
안드로이드가 오디오 경로를 통신 모드로 바꿔 스피커 출력이 작고 대역이 좁아진다.**
`mic.js`는 녹음이 끝나도 트랙을 놓지 않는다(다음 take에서 권한을 다시 묻지
않으려고. 2026-08-18 카카오 인앱에서 실측된 문제였다). 놓는 것은 백그라운드
전환과 5분 미사용뿐이다 — 증상의 조건과 겹친다.

설정 탭의 **로그 보기**를 누르면 최근 20줄이 뜬다. 각 재생마다
`[example] play <파일> mic=<트랙상태> ctx=<AudioContext 상태>` 가 남는다.
**먹먹할 때와 깨끗할 때 이 줄을 비교한다.**

크롬과 APK에서 각각 같은 순서로:

| # | 하는 일 | 예상 |
|---|---|---|
| 1 | 녹음 한 번 → 곧바로 예시 재생 | 먹먹? `mic=live` |
| 2 | 앱을 백그라운드로 5초 → 복귀 → 재생 | 깨끗? `mic=ended` |
| 3 | 5분 그대로 두고 → 재생 | 깨끗? `mic=ended` |

1이 먹먹하고 2·3이 깨끗하면 가설이 맞는다. 크롬과 APK가 다르면 그 차이가
곧 답이다(APK는 네이티브 권한이라 트랙을 놓아도 다시 묻지 않는다).

**가설이 맞을 때의 수정안** (이번에 넣지 않았다. 결과를 보고 정한다):
녹음이 끝나면 트랙을 stop하고 다음 녹음에서 다시 요청한다. 크롬은 같은
오리진의 권한을 기억하므로 다이얼로그가 다시 뜨지 않을 가능성이 높고,
APK는 네이티브 권한이라 무관하다. **카카오 인앱은 실측해야 한다** —
트랙 유지를 넣은 이유가 바로 그 브라우저였다.

## 폴더 구조

```
docs/                     ← GitHub Pages가 서빙하는 폴더
  index.html
  manifest.webmanifest    PWA 설정 (앱 이름, 아이콘)
  sw.js                   서비스워커 (캐시 전략)
  version.json            빌드 번호
  css/app.css
  js/
    data.js               문장 라이브러리      ← 문장 추가는 여기만
    phonemes.js           모국어 설명 표       ← 설명 수정은 여기만
    identity.js           익명 UUID·세션·크레딧 캐시
    api.js                채점 서버 호출 한 곳
    mic.js                마이크 녹음·무음 절단
    pitch.js              F0 추출 (억양)
    score.js              채점 경계 (억양 + 서버)
    app.js                화면 제어
    boot.js               서비스워커 등록, 빌드 표시
  icons/
  audio/{m,f}/            예시 음성 mp3 100개 (문장 50 × 목소리 2)
scripts/bump.mjs          빌드 번호 올리기
worker/                   Cloudflare Workers 채점 프록시 (배포물 아님)
```

### 서버 의존성

**정밀 채점은 우리 Worker를 거친다.** `docs/js/api.js`가
`https://naruve-ganada-score.cura4world.workers.dev`로 WAV를 보내고,
Worker가 Azure를 부른 뒤 단어 점수를 돌려준다. 자세한 규격은 `worker/README.md`.

**Worker의 CORS 허용 origin은 `https://naruve.app` 하나뿐이다.**
그래서 `npm run serve`(localhost)에서는 채점 호출이 CORS로 막힌다 —
화면·녹음·억양(F0)까지는 로컬에서 확인되고 점수만 안 나온다. 의도된 상태이고
로컬용 우회를 넣지 않는다. 실제 채점 확인은 배포된 https://naruve.app 에서 한다.

억양(F0)은 단말에서 계산하므로 서버 없이도 동작한다.

### 파일별 담당

| 하려는 일 | 열 파일 |
|---|---|
| 문장 추가·수정 | `docs/js/data.js` |
| 모국어 설명 추가 (일본어 등) | `docs/js/phonemes.js` |
| 화면 배치·동작 | `docs/js/app.js` |
| 색·글꼴·여백 | `docs/css/app.css` |

---

## 규칙

**경로는 반드시 상대경로(`./`)로 쓴다.**
지금은 `github.io/naruve-ganada/` 하위에 있지만 나중에 `app.naruve.app` 루트로 옮긴다. 절대경로로 쓰면 그때 전부 깨진다.

**푸시 전에 항상 `npm run ship`을 쓴다.**
그냥 `git push`만 하면 캐시 이름이 안 바뀌어서 폰이 옛 파일을 계속 붙들고 있는다. PWA에서 가장 흔한 사고다.

---

## 지금 상태

- 문장 50개 (Standard 15 · Everyday 15 · Drama 12 · Sounds 8)
- 마이크 녹음 동작. 무음 절단·10초 상한·무음 take 무과금
- **채점 두 층 다 실측이다** — 억양은 단말 F0, 발음은 Worker를 거친 Azure
- 타일은 어절 단위. 총점은 Azure PronScore
- 무료 30회는 서버가 센다. 소진하면 듣기·녹음·억양만 남는다
- **예시 음성은 파일이다** — 타입캐스트 API(라이트 플랜, `ssfm-v30`), 2026-08-19 생성,
  목소리 우성(남)·이현(여). 파일이 없거나 로드에 실패하면 폰 내장 TTS로 떨어진다
- 모국어 설명은 영어 · 인도네시아어

## 다음 할 일

1. 설정 화면 — 내 식별자 보기·삭제 요청 (DECISIONS 16.6)
2. 온보딩 — 모국어·학습 단계 자가 신고, 저장 동의 (16.4)
3. 이벤트 로그 저장 (16.1)
4. 결과 카드 이미지 생성
