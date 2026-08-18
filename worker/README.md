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
                                   EnableMiscue:true })
본문: 클라이언트가 보낸 WAV 바이트 그대로 (17.2 — 디코딩·변환 없음)
```

`EnableMiscue`는 **true**다. 삽입·누락을 잡는 설정이고, 참조와 어절이 일대일로 맞으면
false와 표면 점수가 같다(8.10, 32건 실측). 타임아웃 8초.

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

- **무음·잡음도 Success로 온다.** 무음 WAV와 무작위 바이트를 넣어 봤더니 둘 다
  HTTP 200 / `RecognitionStatus: Success`로 오고 점수만 0, `ErrorType: Omission`이었다.
  **즉 502 경로로 걸러지지 않고 크레딧이 깎인다.** 무음 take를 거르는 것은
  `mic.js`의 몫이다(이미 그렇게 되어 있다)
- **`NBestPhonemes`를 요청하지 않는다.** `azure.py`는 `NBestPhonemeCount: 5`를 보내는데
  이 Worker는 보내지 않아 `.azure.json`에 2순위 음소 점수가 없다(8.7의 보조 신호).
  필요해지면 PA 설정에 한 줄 추가한다
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
