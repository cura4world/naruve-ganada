# Naruve — Korean Pronunciation

한국어 발음·억양 점수 앱. 웹앱(PWA)으로 만들고, 나중에 Capacitor로 감싸 Android 앱으로 낸다.

---

## 처음 한 번만 — 배포 준비

### 1. GitHub 저장소 만들기

```bash
cd naruve-pronunciation
git init
git add -A
git commit -m "first"
git branch -M main
git remote add origin https://github.com/<아이디>/naruve-pronunciation.git
git push -u origin main
```

### 2. GitHub Pages 켜기

저장소 → **Settings** → **Pages**

- Source: `Deploy from a branch`
- Branch: `main` / 폴더: **`/docs`**
- Save

1~2분 뒤 주소가 나온다:

```
https://<아이디>.github.io/naruve-pronunciation/
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
    app.js                화면 제어·채점
    boot.js               서비스워커 등록, 빌드 표시
  icons/
  audio/                  원어민 녹음 (예정)
scripts/bump.mjs          빌드 번호 올리기
```

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
지금은 `github.io/naruve-pronunciation/` 하위에 있지만 나중에 `app.naruve.app` 루트로 옮긴다. 절대경로로 쓰면 그때 전부 깨진다.

**푸시 전에 항상 `npm run ship`을 쓴다.**
그냥 `git push`만 하면 캐시 이름이 안 바뀌어서 폰이 옛 파일을 계속 붙들고 있는다. PWA에서 가장 흔한 사고다.

---

## 지금 상태

- 문장 50개 (Standard 15 · Everyday 15 · Drama 12 · Sounds 8)
- 채점은 아직 가짜 값. 마이크를 켜지 않는다
- 예시 음성은 폰 내장 TTS. 나중에 직접 녹음한 파일로 교체
- 모국어 설명은 영어 · 인도네시아어

## 다음 할 일

1. 온디바이스 음성인식 한국어 정확도 실측 (샘플 20개)
2. F0 추출로 억양 채점 구현 (Web Audio API, 원가 0원)
3. 실제 마이크 녹음 연결 (MediaRecorder)
4. 원어민 음성 직접 녹음 → `docs/audio/`
5. 결과 카드 이미지 생성
