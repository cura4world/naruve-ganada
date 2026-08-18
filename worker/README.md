# worker — 채점 프록시 (Cloudflare Workers)

DECISIONS.md 17절의 서버 프록시다. 앱이 음성을 여기로 보내고, 여기서 Azure를 부르고,
음성은 R2에, 크레딧은 KV에 남는다.

**P3 현재 상태 — Azure는 아직 부르지 않는다.** `/score`는 검사·저장·차감까지만 하고
`{ stub: true }`를 돌려준다. Azure 호출은 P4에서 그 자리에 들어간다.

`docs/` 아래에 두지 않는다. `docs/`는 GitHub Pages 공개 배포 경로라
거기 있는 파일은 전부 공개 URL로 접근된다.

---

## 1. 배포

```
cd worker
npx wrangler deploy
```

배포 주소는 `https://naruve-ganada-score.<subdomain>.workers.dev`다.
커스텀 도메인은 첫 버전에서 붙이지 않는다.

`wrangler.toml`이 이름·바인딩의 단일 출처다. **대시보드에서 Worker를 만들지 않는다** —
만들면 이름과 바인딩이 두 곳에서 정해진다.

로그인이 풀렸으면 `npx wrangler login`(브라우저 인증)을 먼저 한다.

## 2. Secret 등록 — 사람이 한다

Azure 구독키는 **코드·`wrangler.toml`·커밋 어디에도 넣지 않는다.**
Worker가 한 번 배포된 뒤에야 넣을 자리가 생기므로 순서가 배포 → 등록이다.

값은 `Naruve Pronunciation\.env`의 `SPEECH_KEY`다(저장소 밖. `.gitignore` 대상).

**방법 A — 대시보드**

1. Cloudflare 대시보드 → Workers & Pages → `naruve-ganada-score`
2. Settings → Variables and Secrets → Add
3. Type **Secret**, Name **`AZURE_SPEECH_KEY`**, Value에 `.env`의 `SPEECH_KEY` 붙여넣기
4. Save

**방법 B — CLI**

```
cd worker
npx wrangler secret put AZURE_SPEECH_KEY
```

프롬프트가 뜨면 거기에 붙여넣는다.
**명령줄 인자로 넘기지 않는다** — 셸 히스토리에 남는다.

## 3. 등록 확인

```
curl https://naruve-ganada-score.<subdomain>.workers.dev/health
```

`hasKey`가 `true`면 등록된 것이다. 등록 전에는 `false`가 정상이다.
**키 값 자체는 어떤 응답에도 실리지 않는다.** 꽂혔는지만 boolean으로 나간다.

## 4. 엔드포인트

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/health` | `{ ok, region, hasKey }`. Secret 등록 여부 확인용 |
| POST | `/score` | 아래 참조 |
| OPTIONS | 아무 경로 | CORS preflight. 204 |
| — | 그 외 | 404 |

### POST /score

요청

| 항목 | 값 |
|---|---|
| `Content-Type` | `audio/wav` (파라미터 붙어도 됨) |
| 본문 | 16kHz/16bit/mono WAV. **400KB 이하** (10초 = 약 320KB) |
| `X-Naruve-UUID` | 익명 UUID (17.3). 8-4-4-4-12 hex |
| `X-Naruve-Session` | 세션 ID (16.1 — 같은 문장 연속 시도 묶음). `[A-Za-z0-9_-]{1,64}` |
| `X-Naruve-Recording` | 녹음 ID. 같은 형식 |

하는 일 — 헤더·형식·크기 검사 → KV에서 `{UUID}:credits` 확인(없으면 30으로 시작) →
R2에 `{UUID}/{YYYY-MM-DD}/{세션}/{녹음}.wav` 저장 → 크레딧 1 차감 → 응답.
날짜는 UTC 기준이다.

응답

| 상태 | 본문 | 언제 |
|---|---|---|
| 200 | `{ stub: true, credits, r2Key }` | 정상. `stub`은 P4에서 Azure 결과로 대체 |
| 400 | `{ error: "bad_uuid" \| "bad_session" \| "bad_recording" \| "empty_body" }` | 헤더 없음·형식 불일치·빈 본문 |
| 402 | `{ reason: "credits_exhausted", credits: 0 }` | 무료 30회 소진 (18절) |
| 413 | `{ error: "too_large", max, got }` | 400KB 초과 |
| 415 | `{ error: "bad_content_type", got }` | `audio/wav`가 아님 |
| 405 | `{ error: "method_not_allowed" }` | 경로는 맞고 메서드가 다름 |

**저장이 먼저, 차감이 나중이다.** R2 저장이 실패하면 크레딧을 깎지 않는다.

## 5. CORS

`Access-Control-Allow-Origin`은 첫 버전에 `https://naruve.app` 하나뿐이다.
Capacitor 앱의 origin(`capacitor://localhost`, `http://localhost`)은 **P4에서 APK로
실측한 뒤** 추가한다. 지금 추측으로 넣지 않는다.

## 6. 알고 있는 한계 (P4 이후)

- **KV는 트랜잭션이 아니다.** 같은 UUID가 동시에 여러 번 부르면 크레딧 차감이
  하나로 합쳐질 수 있다. 첫 버전은 감수한다 — 16.3이 "첫 버전은 KV로 시작해도 됨"이다.
  실제로 문제가 되면 Durable Object로 옮긴다
- **KV는 최종 일관성이다.** 차감 직후의 읽기가 옛 값을 볼 수 있다
- 이벤트 로그(16.1)는 아직 안 쌓는다. 지금 남는 것은 음성 파일과 크레딧 카운터뿐이다
- 동의(16.1) 분기 없음. 저장 여부를 요청이 정하지 못한다
- Azure 호출 없음. `/score`는 stub이다

## 7. 건드리지 않는 것

- `docs/` 아래에는 아무것도 만들지 않는다. 이 폴더는 배포물에 포함되지 않으므로
  빌드번호(`npm run bump`)도 올리지 않는다
- 클라이언트(`docs/js/score.js`·`mic.js`)는 P4에서 연결한다
