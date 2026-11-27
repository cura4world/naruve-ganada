# HANDOFF — Naruve 가나다

세션을 넘길 때 읽는 짧은 요약이다. **정본이 아니다.** 결정은 DECISIONS.md,
작업 규칙과 현재 상태 상세는 CLAUDE.md가 정본이고, 여기는 그쪽을 가리키기만 한다.
이 저장소는 공개라서 **보안 상세는 여기에 쓰지 않는다** (로컬 전용 파일에서 관리).

최종 갱신: 2026-11-28 (빌드 0.1.43 기준 — ganada.naruve.app 전환 완료, 개발판 APK versionCode 13)

**정책 페이지 중복 정리 (HQ 2026-11-17 알림 · decisions/2026-11-16-katakata-report-telegram.md 4항, 저장소 밖)**:
`docs/privacy/{,en/}index.html`에 `<link rel="canonical">`(naruve.app/privacy/ · /privacy/en/)을 넣었다(빌드 0.1.42).
바이트가 바뀌었으므로 naruve-studio-site에서 sync-legal 재실행이 필요하다(HQ가 지시).
`docs/apps/kata-kata/`는 Arga 승인(2026-11-18)으로 삭제했다(빌드 0.1.43). DECISIONS 12절의 2026-11-13 예외 줄은 취소선 처리하고
"다른 앱 정책 페이지는 이 저장소에 두지 않는다"로 대체했다(2026-11-18, Arga 승인).

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

- **웹(PWA)**: 빌드 0.1.43이 **ganada.naruve.app**(GitHub Pages, main의 /docs)에 라이브 (서브도메인 전환은 2026-11-16, PR #113). 문장 200개
  (Standard 60 / Everyday 60 / Drama 50 / Sounds 30), 예시 음성 mp3 400개, UI 언어 en·ko.
- **채점**: 억양(단말 F0, 원가 0)과 발음(Worker → Azure) 둘 다 실측. 무료 30회는 서버가 센다.
  억양 임계값은 잠정값이다.
- **화면**: 디자인 B안 "카드", 나 화면, 온보딩(동의 2층 포함), 설정 시트까지 들어갔다.
- **Android**: Capacitor 껍데기(dev 빌드, `server.url`로 ganada.naruve.app을 띄움). 폰(S21)
  설치본 versionCode 13 (2026-11-16 23:13 빌드·설치, 실행 시 Capacitor가 ganada.naruve.app을 로드하는 것까지 logcat으로 확인).
  **핵심 경로(녹음 → 채점 → 결과)의 실기 확인은 아직이다** — 0.1.28 이후 한 번도 안 했다.
- **Play Console**: 앱이 만들어져 있다. 2026-09-17 "앱 만들기"에서 패키지명
  `app.naruve.ganada`를 고정했다 (DECISIONS 19.2, 변경 이력 2026-09-17). 플레이 계정은
  조직 계정, 표시명 Naruve Studio (DECISIONS 1절). **AAB를 올린 기록은 이 저장소에 없다.**
- **결과 카드 공유**는 `alert()` 자리표시자다.
- **Kata kata 정책 페이지는 이 저장소에서 내렸다** (2026-11-18, 빌드 0.1.43, Arga 승인). 2026-11-13(0.1.36)에 임시 게시했던
  `docs/apps/kata-kata/{privacy,terms,delete}/` 세 경로를 삭제했다. 정본은 idkr-buddy, 게시는 naruve-studio-site다
  (HQ decisions/2026-11-16-katakata-report-telegram.md 4항 · 저장소 밖). 이 저장소에는 대체 안내 페이지를 두지 않았다.
  옛 내용의 이력은 git log(빌드 0.1.36~0.1.39)에 있다.
- **ganada.naruve.app 전환 완료** (2026-11-16, PR #113 병합 `7c5dfe0`, HQ decisions/2026-11-15-site-go-live.md · 저장소 밖).
  Pages 사용자 지정 도메인 ganada.naruve.app, 인증서 approved(2027-02-14 만료), Enforce HTTPS 켬.
  version.json 0.1.41 · 서비스워커 활성 · Worker CORS가 이 origin을 허용하는 것을 확인했다. 개발판 APK는
  새 `server.url`로 재빌드해 폰에 설치했다(versionCode 13). **남은 것**: ① (처리됨 — kata-kata 사본은 삭제, 위 항목)
  ② naruve.app에 남은 옛 서비스워커 정리는 Studio 홈페이지 쪽 ③ **localStorage는 origin별이라 기존 naruve.app
  사용자와 이 폰의 기존 테스트 기록은 UUID·동의·기록이 새로 시작된다.** 무료 30회는 서버가 UUID로 세므로 UUID가
  바뀌면 새로 30회가 열리고, `DEV_UUIDS`에 올린 테스터 UUID는 새 UUID로 다시 올려야 한다(worker/README.md 2-1).

## 다음 할 일

출시 기준 · 고칠 것 목록 · 비공개 테스트 · 출시 셸은 DECISIONS 23절이 정본이다(2026-11-28 v2). 여기에 목록을 복제하지 않는다.
출시 시점은 Arga가 정하고 날짜는 미리 정하지 않는다(23절 머리).

1. 개발판(폰 S21, versionCode 13)으로 핵심 경로 실기 — 23.2 M13 1차. 0.1.28 이후 한 번도 안 했다
2. 비공개 테스트 시작 조건 닫기 — 23.3
3. 존댓말 레벨 체커 설계 논의(23.2 M15) · 배치 2 문장 300개(M16) — 테스트와 나란히
4. Kata kata 첫 심사 결과가 나오면 출시 셸을 정한다 — 23.5

## 알려진 함정

- 이 저장소는 폰(클라우드)과 PC 양쪽에서 작업된다. 시작할 때 `git fetch` 후 뒤처졌으면 `git pull --ff-only`.
- docs/를 고치면 `npm run bump`. docs/ 밖만 고치면 올리지 않는다.
- 로컬 전용 파일(LAB_STATUS.md · LAB_INBOX.md · security/ · security-evidence/)은 .gitignore 대상이다. 커밋하지 않는다.
