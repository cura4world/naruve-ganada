# HANDOFF — Naruve 가나다

세션을 넘길 때 읽는 짧은 요약이다. **정본이 아니다.** 결정은 DECISIONS.md,
작업 규칙과 현재 상태 상세는 CLAUDE.md가 정본이고, 여기는 그쪽을 가리키기만 한다.
이 저장소는 공개라서 **보안 상세는 여기에 쓰지 않는다** (로컬 전용 파일에서 관리).

최종 갱신: 2026-10-30 (빌드 0.1.34 기준)

## 정본 위치

| 무엇 | 어디 |
|---|---|
| 결정 · 기각한 선택지 | DECISIONS.md (승인 없이 수정하지 않는다) |
| 작업 규칙 · 현재 상태 | CLAUDE.md "절대 규칙" · "현재 상태" |
| 출시 직전 되돌릴 개발값 | CLAUDE.md "출시 전 반드시 할 일" |
| 스토어 등록 결정 | DECISIONS.md 19절 |
| Worker 배포·Secret 절차 | worker/README.md |
| 엔진 프로브 | PROBE.md |

## 지금 어디까지

- **웹(PWA)**: 빌드 0.1.34가 naruve.app(GitHub Pages, main의 /docs)에 라이브. 문장 200개
  (Standard 60 / Everyday 60 / Drama 50 / Sounds 30), 예시 음성 mp3 400개, UI 언어 en·ko.
- **채점**: 억양(단말 F0, 원가 0)과 발음(Worker → Azure) 둘 다 실측. 무료 30회는 서버가 센다.
  억양 임계값은 잠정값이다.
- **화면**: 디자인 B안 "카드", 나 화면, 온보딩(동의 2층 포함), 설정 시트까지 들어갔다.
- **Android**: Capacitor 껍데기(dev 빌드, `server.url`로 naruve.app을 띄움). 폰 설치본
  versionCode 12, 웹은 0.1.28 때 실기 확인했다. **0.1.34는 실기 확인 전이다.**
- **Play Console**: 앱이 만들어져 있다. 2026-09-17 "앱 만들기"에서 패키지명
  `app.naruve.ganada`를 고정했다 (DECISIONS 19.2, 변경 이력 2026-09-17). 플레이 계정은
  조직 계정, 표시명 Naruve Studio (DECISIONS 1절). **AAB를 올린 기록은 이 저장소에 없다.**
- **결과 카드 공유**는 `alert()` 자리표시자다.

## 다음 할 일

1. 0.1.34를 실기에서 핵심 경로(녹음 → 채점 → 결과 · 문장 이동 · 설정)로 확인한다.
2. 결과 카드(공유)와 출시 콘텐츠 최소선을 정한다. 배치 2 시점도 같이 — 사용자 결정 사항.
3. 출시 보안 증거를 쌓는다 (번들 · 음성 · 비용 방어). 상세는 로컬 전용 파일에 있다.
4. 아래 "출시까지 남은 것"을 위에서부터 닫는다.

## 출시까지 남은 것 (Google Play 기준)

코드·설정 (CLAUDE.md "출시 전 반드시 할 일"과 같은 목록, 출시 직전 한 번에):
- `capacitor.config.json`의 `server` 블록 제거 → docs/가 APK에 번들된다 (이후 웹 수정마다 APK 재빌드)
- `appName`을 정식 명칭으로 (DECISIONS 19.4). `appId`는 바꾸지 않는다
- `app.js`의 `DEV_UNLOCK` → false
- `SHOW_SOUNDS_IN_BROWSE` → false (진단 기능이 생긴 뒤에만)
- release 키로 서명한 AAB 빌드 (README "출시할 때")

계정·스토어:
- support@naruve.app 발신 설정 (지메일 "다른 주소에서 메일 보내기") — 저장소 밖
- Play Console 등록정보 입력 (이름·짧은 설명은 DECISIONS 19.4에 확정) 후 AAB 업로드
- **비공개 테스트 요건 확인 필요.** 이번 지시는 "조직 계정이라 요건 없음, 단 Play Console에서
  한 번 확인"이다. 그런데 DECISIONS가 비공개 테스트를 전제로 일정을 적고 있다 —
  17절의 Azure S0 전환 시점(2034·2133행 부근)과 18절 2191행("Play 비공개 테스트 14일 +
  수익화 4~6주 뒤"). Play Console에서 확인한 뒤 요건이 없으면 DECISIONS 수정안을 올린다
  (승인 전에는 고치지 않는다).

운영:
- Azure F0 → S0 전환 (DECISIONS 17절 표) — DECISIONS는 "비공개 테스트 시작 하루 전"으로 적었다 (위 요건 확인에 따라 기준 시점이 바뀔 수 있다)
- 결과 카드 · 출시 콘텐츠 최소선 결정 (위 "다음 할 일" 2)

## 알려진 함정

- 이 저장소는 폰(클라우드)과 PC 양쪽에서 작업된다. 시작할 때 `git fetch` 후 뒤처졌으면 `git pull --ff-only`.
- docs/를 고치면 `npm run bump`. docs/ 밖만 고치면 올리지 않는다.
- 로컬 전용 파일(LAB_STATUS.md · LAB_INBOX.md · security/ · security-evidence/)은 .gitignore 대상이다. 커밋하지 않는다.
