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
