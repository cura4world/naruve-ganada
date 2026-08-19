# worker — 채점 프록시 (Cloudflare Workers)

DECISIONS.md 17절의 서버 프록시다. 앱이 음성을 여기로 보내고, 여기서 Azure를 부르고,
음성과 Azure 응답 원본은 R2에, 크레딧은 KV에 남는다.

**P4 현재 상태 — Azure를 실제로 부른다.** 클라이언트(`docs/js/score.js`·`mic.js`)
연결은 아직이다.

`docs/` 아래에 두지 않는다. `docs/`는 GitHub Pages 공개 배포 경로라
거기 있는 파일은 전부 공개 URL로 접근된다.

---

## 1. 배포

```
cd worker
npx wrangler deploy
```

배포 주소는 `https://naruve-ganada-score.cura4world.workers.dev`다.
커스텀 도메인은 첫 버전에서 붙이지 않는다.

`wrangler.toml`이 이름·바인딩의 단일 출처다. **대시보드에서 Worker를 만들지 않는다** —
만들면 이름과 바인딩이 두 곳에서 정해진다.

로그인이 풀렸으면 `npx wrangler login`(브라우저 인증)을 먼저 한다.

**배포 직후 몇 초는 옛 버전이 응답할 수 있다.** 새 버전이 전 엣지에 퍼지는 데
시간이 걸린다. 배포하자마자 잰 값이 이상하면 잠시 뒤 다시 잰다.

## 2. Secret 등록

Azure 구독키는 **코드·`wrangler.toml`·커밋 어디에도 넣지 않는다.**
`AZURE_SPEECH_KEY` 이름의 Secret으로만 들어간다. 값은 `Naruve Pronunciation\.env`의
`SPEECH_KEY`다(저장소 밖. `.gitignore` 대상).

**방법 A — 대시보드**

1. Cloudflare 대시보드 → Workers & Pages → `naruve-ganada-score`
2. Settings → Variables and Secrets → Add
3. Type **Secret**, Name **`AZURE_SPEECH_KEY`**, Value 붙여넣기 → Save

**방법 B — CLI**

```
cd worker
npx wrangler secret put AZURE_SPEECH_KEY
```

프롬프트에 붙여넣는다. **명령줄 인자로 넘기지 않는다** — 셸 히스토리에 남는다.

등록 확인:

```
curl https://naruve-ganada-score.cura4world.workers.dev/health
```

`hasKey`가 `true`면 등록된 것이다. **키 값 자체는 어떤 응답에도 실리지 않는다.**

### 2-1. DEV_UUIDS — 개발자·테스터 무제한 (2026-08-19)

무료 30회는 설치당 총량이라(18절) 테스터가 하루에 소진한다. 그렇다고 총량을
늘리면 실제 사용자의 원가 상한이 사라진다. 그래서 **특정 UUID만 세지 않는다.**

`DEV_UUIDS`는 콤마로 구분한 UUID 목록이고 **Secret이다.** `wrangler.toml`의
`[vars]`에 넣지 않는다 — 값 자체는 익명 식별자라 비밀이 아니지만, 이 목록에
오르는 것은 "과금 없이 무제한"이라는 권한이라 저장소에 남기지 않는다.

목록에 있는 UUID는 이렇게 처리된다.

| | 목록에 있을 때 | 없을 때 |
|---|---|---|
| KV 읽기·차감 | **하지 않는다** | 한다 |
| 402 credits_exhausted | **없다** | 0이면 반환 |
| 응답 `credits` | **`-1`** (클라이언트가 `∞`로 표시) | 남은 수 |
| R2 저장 (.wav / .azure.json) | **그대로 한다** | 한다 |

테스터 음성도 데이터다. 16.1이 채점결과 페이로드를 남기라고 한 대상에서
빠질 이유가 없으므로 저장과 로그는 건드리지 않는다.

**등록 절차 (사람)**

1. 테스터 폰에서 그 사람의 UUID를 얻는다.
   설정 화면(16.6 "내 식별자 보기")이 생기면 거기서 복사한다. 그 전에는
   브라우저 콘솔에서 `Identity.uuid()` 또는 localStorage `naruve.uuid`.
2. 기존 목록에 **덧붙여서** 통째로 다시 넣는다. Secret은 덮어쓰기라
   한 명만 넣으면 나머지가 지워진다.

```
cd worker
printf 'uuid-1,uuid-2,uuid-3' | npx wrangler secret put DEV_UUIDS
```

3. 확인 — `/health`의 `devUuids`가 등록된 개수다. **값은 응답에 실리지 않는다.**

```
curl https://naruve-ganada-score.cura4world.workers.dev/health
{"ok":true,"region":"koreacentral","hasKey":true,"devUuids":1}
```

지금 등록된 사람: 1명 (2026-08-19, 30회를 소진한 테스터).
빼려면 그 UUID를 뺀 목록으로 다시 `secret put` 한다. 전부 없애려면
`npx wrangler secret delete DEV_UUIDS`.

**KV는 그대로 둔다.** 예외 대상은 KV를 읽지 않으므로 값이 무엇이든 상관없지만,
나중에 목록에서 빼면 그 값부터 다시 세기 시작한다. 그래서 표시용으로 30을
돌려놓았다.

## 3. 엔드포인트

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/health` | `{ ok, region, hasKey }` |
| POST | `/score` | 아래 참조 |
| OPTIONS | 아무 경로 | CORS preflight. 204 |
| — | 그 외 | 404 |

### POST /score

**요청 헤더 5개 + WAV 본문**

| 항목 | 값 |
|---|---|
| `Content-Type` | `audio/wav` (파라미터 붙어도 됨) |
| 본문 | 16kHz/16bit/mono WAV. **400KB 이하** (10초 = 약 320KB) |
| `X-Naruve-UUID` | 익명 UUID (17.3). 8-4-4-4-12 hex |
| `X-Naruve-Session` | 세션 ID (16.1 — 같은 문장 연속 시도 묶음). `[A-Za-z0-9_-]{1,64}` |
| `X-Naruve-Recording` | 녹음 ID. 같은 형식 |
| `X-Naruve-Ref` | **참조 텍스트. URL-encoded UTF-8.** 최대 120자(디코딩 기준) |

**참조 텍스트를 서버가 손대지 않는다.** 띄어쓰기는 채점 파라미터라(8.8 — 같은 발화가
66 ↔ 97.6점) trim·정규화를 하면 클라이언트가 의도한 점수가 안 나온다.
120자 상한은 `data.js` 최장 문장(19자)의 6배이고, R2 customMetadata 한도(약 2KB)를
넘지 않게 하는 값이기도 하다.

**처리 순서**

1. 헤더 5개 검사 → 2. Content-Type·크기 검사 → 3. KV `{UUID}:credits` 확인(없으면 30) →
4. **Azure 호출** → 5. 성공했을 때만 R2 저장 + KV 차감 → 6. 응답

**Azure가 실패하면 저장도 차감도 하지 않는다.** 실패한 시도는 무료 30회를 깎지 않는다.

**Azure 요청 규격** — `scripts/adapters/azure.py`(2026-08-10 실호출로 확정)와 같다.

```
POST https://{AZURE_REGION}.stt.speech.microsoft.com
     /speech/recognition/conversation/cognitiveservices/v1?language=ko-KR&format=detailed
Ocp-Apim-Subscription-Key: <Secret>
Content-Type: audio/wav; codecs=audio/pcm; samplerate=16000
Pronunciation-Assessment: base64({ ReferenceText, GradingSystem:"HundredMark",
                                   Granularity:"Phoneme", Dimension:"Comprehensive",
                                   EnableMiscue:true, NBestPhonemeCount:5 })
본문: 클라이언트가 보낸 WAV 바이트 그대로 (17.2 — 디코딩·변환 없음)
```

PA 설정 다섯 줄의 뜻:

| 키 | 값 | 왜 |
|---|---|---|
| `GradingSystem` | `HundredMark` | 100점 만점 |
| `Granularity` | `Phoneme` | 음절·음소까지 받는다. 화면은 단어만 쓰지만 원본은 남긴다 |
| `Dimension` | `Comprehensive` | Accuracy·Fluency·Completeness·Pron 전부 |
| `EnableMiscue` | `true` | 삽입·누락 감지. 참조와 어절이 일대일이면 false와 표면 점수가 같다(8.10, 32건 실측) |
| `NBestPhonemeCount` | `5` | 8.7의 2순위 음소 점수. **요청해야 온다.** 이름은 빈 문자열이지만 Score에는 값이 있다 |

`ProsodyScore`는 켜지 않는다 — ko-KR 응답에 오지 않는다(8절 실측). 타임아웃 8초.

**저장물** (16.6 — UUID가 앞)

| 키 | 내용 |
|---|---|
| `{UUID}/{YYYY-MM-DD}/{세션}/{녹음}.wav` | 받은 WAV 그대로 |
| `{UUID}/{YYYY-MM-DD}/{세션}/{녹음}.azure.json` | **Azure 응답 전체** (음절·음소 점수 포함). 16.1 |

날짜는 UTC. 두 객체 모두 `customMetadata`에 `{ ref, sessionId, recordingId }`가 붙는다.
`ref`는 URL-encoded로 들어간다 — 꺼낼 때 `decodeURIComponent` 하면 원문이다.

**응답**

| 상태 | 본문 |
|---|---|
| 200 | `{ credits, r2Key, azure: { pronScore, accuracyScore, fluencyScore, completenessScore, words: [{ word, accuracyScore, errorType, offset, duration }] } }` |
| 400 | `{ error: "bad_uuid" \| "bad_session" \| "bad_recording" \| "bad_ref" \| "ref_too_long" \| "empty_body" }` |
| 402 | `{ reason: "credits_exhausted", credits: 0 }` — 무료 30회 소진 (18절) |
| 422 | `{ reason: "nothing_recognized" }` — 한 단어도 못 알아들음. **저장·차감 없음** |
| 413 | `{ error: "too_large", max, got }` |
| 415 | `{ error: "bad_content_type", got }` |
| 405 | `{ error: "method_not_allowed" }` — 경로는 맞고 메서드가 다름 |
| 502 | `{ reason: "azure_failed", status }` |
| 500 | `{ error: "storage_failed" }` — Azure는 성공했으나 R2 저장이 실패. 차감 안 함 |

`words`의 `offset`·`duration`은 Azure의 **100ns 단위 그대로**다. 변환은 클라이언트가 한다.
**음소·음절 배열은 응답에 넣지 않는다** — 응답을 작게 유지한다. 원본은 `.azure.json`에 있다.

502의 `status`는 경우에 따라 다르다.

| 값 | 언제 |
|---|---|
| 숫자 (401·400·429 …) | Azure가 비200으로 답함 |
| `"timeout"` | 8초 초과 |
| `"network_error"` | fetch 자체가 실패 |
| `"bad_json"` | 200인데 본문이 JSON이 아님 |
| `"NoMatch"` 등 | HTTP 200인데 `RecognitionStatus`가 `Success`가 아님 |

## 4. CORS

`Access-Control-Allow-Origin`은 첫 버전에 `https://naruve.app` 하나뿐이다.
Capacitor 앱의 origin(`capacitor://localhost`, `http://localhost`)은 **APK로 실측한 뒤**
추가한다. 지금 추측으로 넣지 않는다.

## 5. 알고 있는 한계

- **무음·잡음도 Azure는 Success로 준다.** 무음 WAV와 무작위 바이트 둘 다 HTTP 200 /
  `RecognitionStatus: Success` / 점수 0 / `ErrorType: Omission`으로 왔다.
  **상태 코드로는 갈리지 않으므로 `Words`를 직접 본다** — Omission이 아닌 단어가
  하나도 없으면 422다(2026-08-18 추가). 크레딧은 그대로다.
  무음 take를 애초에 안 보내는 것은 여전히 `mic.js`의 몫이다
- **KV는 트랜잭션이 아니다.** 같은 UUID가 동시에 여러 번 부르면 차감이 하나로 합쳐질 수
  있다. 첫 버전은 감수한다 — 16.3이 "첫 버전은 KV로 시작해도 됨"이다.
  문제가 되면 Durable Object로 옮긴다
- **KV는 최종 일관성이다.** 차감 직후의 읽기가 옛 값을 볼 수 있다
- 이벤트 로그(16.1)는 아직 안 쌓는다. 남는 것은 음성·Azure 응답·크레딧 카운터뿐이다
- 동의(16.1) 분기 없음. 저장 여부를 요청이 정하지 못한다

## 6. 건드리지 않는 것

- `docs/` 아래에는 아무것도 만들지 않는다. 이 폴더는 배포물에 포함되지 않으므로
  빌드번호(`npm run bump`)도 올리지 않는다
- 클라이언트(`docs/js/score.js`·`mic.js`)는 P5에서 연결한다
