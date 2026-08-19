# scripts/tts — Typecast 청취 샘플 생성

DECISIONS.md 9절(음성 자산)의 TTS 벤더 선정을 위해, 후보 보이스에 같은 문장을
읽히고 나란히 듣게 만드는 하네스다. **품질 판단은 사람이 한다.** 이 스크립트는
같은 조건으로 파일을 만들고 무엇을 얼마에 만들었는지 기록만 남긴다.

`docs/`·`worker/`와 무관하다. 앱에 실리지 않으므로 빌드번호를 올리지 않는다.

## 파일

| 파일 | 역할 |
|---|---|
| `typecast_gen.py` | 생성기. 문장 × 보이스를 돌며 `{폴더}/{sentence_id}.mp3`를 만든다 |
| `config.json` | 모델·언어·포맷·동시성·운율 파라미터. **언어와 모델이 코드에 박혀 있지 않다** |
| `voices.json` | 보이스 목록 |
| `sentences.json` | 문장. `docs/js/data.js`에서 뽑은 것 |
| `fix_index.py` | 손질 회차(fix*)의 비교표. **열이 변형**이라 축이 달라 따로 짠다 |
| `test_index_html.js` | 생성된 `index.html`의 메모 기능 회귀 검사 |

파이썬 파일에 한국어도 특정 보이스도 없다. 다른 언어로 갈 때는 `config.json`의
`language`를 바꾸고 `voices.json`·`sentences.json`을 갈아끼우면 된다.

## 준비

```
python -m pip install --upgrade typecast-python
```

공식 Python SDK다. 문서 권고에 따라 REST를 직접 짜지 않았다.
`ffprobe`가 PATH에 있으면 총 재생 길이를 잰다. 없으면 그 줄만 빈다.

키는 저장소 루트 `.env`의 `TYPECAST_KEY`다. 찾는 순서는 환경변수 `TYPECAST_KEY`
→ `TYPECAST_API_KEY` → 루트 `.env`. 어느 경로로도 키를 찍거나 산출물에 남기지
않는다. `.env`는 `.gitignore:8`에 있다. 확인: `git check-ignore -v .env`

## 실행

```
# 계획만 본다. 호출하지 않는다
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_typecast_v1_20260819" --dry-run

# 실제 생성
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_typecast_v1_20260819"

# 호출 없이 index.html·README.md·zip만 다시 만든다
python scripts/tts/typecast_gen.py --out "..." --reindex

# index.html 템플릿을 고쳤으면 반드시 이것을 돌린다 (46개 검사)
node scripts/tts/test_index_html.js "D:/aihub_work/tts_typecast_v1_20260819/index.html"
```

`--jobs N` 동시 호출 수 · `--sentences`/`--voices`/`--config` 입력 경로 ·
`--no-index` `--no-zip` · `--zip <경로>` zip 위치 지정.

## 회귀 검사

`test_index_html.js`는 브라우저를 띄우지 않는다. 생성된 HTML에서 `<script>`를
그대로 꺼내 node `vm` 위에서 돌리고, localStorage·document를 최소한으로 흉내 낸다.
검사하는 것: 저장 키가 하나이고 JSON인가 / 내보내기 문자열이 정해진 형식인가 /
내보낸 것을 불러오면 그대로 복원되는가(여러 줄 메모·콜론 포함 값·별점 0과 5 포함) /
형식이 틀린 입력 다섯 가지가 전부 거부되고 상태를 안 바꾸는가 / 전체 삭제 /
외부 리소스 0·상대경로·요소 개수.

두 번째 인자로 기대하는 localStorage 키를 주면 그것까지 확인한다.

```
node scripts/tts/test_index_html.js <index.html> [기대키]
```

## 문장 — k와 tts를 나눈다

`sentences.json`의 한 항목은 이렇게 생겼다.

```json
{ "id": "evd12", "collection": "everyday", "type": "question",
  "k": "여보세요? 과장님 계세요?", "tts": "여보세요? 과장님 계세요?",
  "hash": "…", "why": "On the phone · haeyo" }
```

- `k` — 앱 화면에 뜨는 원문. `docs/js/data.js`의 `k`와 같아야 한다
- `tts` — TTS에 넣는 텍스트. **억양이 이상해서 표기를 손질할 때 여기만 바꾼다**
- `hash` — `docs/js/audio.js`의 `audioName()`과 같은 FNV-1a 8자리.
  P7-3에서 `docs/audio/<hash>.mp3` 로 넣을 이름이다. `k`가 바뀌면 이 값도 바뀐다

생성기는 `tts` → `text` → `k` 순으로 읽는다. `tts`를 먼저 보는 이유는,
`tts`만 고친 사람이 아무 일도 일어나지 않는 것을 보는 사고를 막기 위해서다.

**`data.js`에는 문장별 `id`가 없다.** (`id:`는 `COLLECTIONS` 4개뿐이다.)
그래서 id는 컬렉션 약칭 + 배열 순서 두 자리로 만들었다(`std01`…`snd08`).
data.js의 문장 순서가 바뀌면 id도 바뀐다. 순서에 의존하지 않는 식별자가 필요하면
`hash`를 쓴다.

## 크레딧 계산법 — 글자당 1

**과금은 입력 텍스트의 글자당 1크레딧이다.** 공백과 문장부호를 포함해 그대로 센다.
2026-08-19에 여섯 번 확인했고 매번 정확히 일치했다.

| 실행 | 입력 글자 × 보이스 | 실제 차감 |
|---|---|---|
| 후보 12개 | 168 × 12 = 2,016 | 2,016 |
| v1 본작업 | 542 × 3 = 1,626 | 1,626 |
| knobs base | 117 × 2 = 234 | 234 |
| knobs tempo | 14 × 2 = 28 | 28 |
| knobs pitch | 6 × 2 = 12 | 12 |
| knobs emotion | 14 × 2 = 28 | 28 |

오디오 길이는 단가와 **무관하다**. 그래도 재는 이유는 보이스별 읽는 속도 비교와,
`audio_tempo` 같은 손잡이가 실제로 먹었는지 확인할 유일한 수치이기 때문이다.

### 주의 — used_credits는 바로 오르지 않는다

생성이 끝나자마자 구독을 조회하면 **아직 반영 중인 값**이 나온다.
2026-08-19에 156칸을 만든 직후 값은 970이었고, 20초쯤 뒤 2,016으로 확정됐다.
그 970을 그대로 적어 "과금이 오디오 길이 기준(초당 3)"이라는 **틀린 결론**을
기록한 적이 있다. 지금은 `settle_credits()`가 값이 멈출 때까지 기다렸다가 적는다
(10초 간격, 3회 연속 동일, 최대 180초). 실측 정착 시간은 40~62초였다.

문장 1000개를 보이스 하나로 읽히면, 이 50문장의 평균 10.8자 기준
약 10,800 크레딧이다. 라이트 플랜 200,000 안에 넉넉히 들어간다.

## 운율 손잡이 — API에 있는 것과 없는 것

`ssfm-v30`에서 요청에 넣을 수 있는 것은 이것뿐이다.

| 필드 | 범위 | 비고 |
|---|---|---|
| `output.audio_pitch` | -12 ~ +12 정수 | |
| `output.audio_tempo` | 0.5 ~ 2.0 | |
| `output.volume` | 0 ~ 200 | `target_lufs`와 함께 못 쓴다 |
| `output.target_lufs` | -70 ~ 0 | |
| `prompt` (PresetPrompt) | normal/happy/sad/angry/whisper/toneup/tonedown, intensity 0~2 | |
| `prompt` (SmartPrompt) | 앞뒤 문맥 문장 | 생성기는 아직 preset만 넣는다 |
| `seed` | 정수 | 안 주면 매번 다르게 나온다 |

**`pause`·`prosody`·`speed`·SSML에 해당하는 필드는 없다.** 문말 억양을 직접
지정하는 수단도 없다. 손질할 수 있는 것은 입력 표기(`tts`)와 위 파라미터뿐이다.

`config.json`에서 위 값들을 주면 요청에 실린다. `null`이면 요청에서 아예 뺀다.
2026-08-19 라이트 플랜에서 `audio_pitch`·`audio_tempo`·`prompt(preset)` 모두
200으로 통과했다 — 플랜 때문에 막히는 파라미터는 확인된 것이 없다.

## seed는 재현을 보장하지 않는다 — 확정본은 파일이 유일본이다

`TTSRequest`에 `seed` 필드가 있고 요청에 실제로 실린다. 그런데 **같은 seed에
같은 텍스트를 넣어도 결과가 다르다.** 2026-08-19 실측:

```
std09_s1     106,622B  sha256 d25cf13f…  2.60초   seed 1
std09_s1chk  102,443B  sha256 c1be97d0…  2.50초   seed 1   ← 같은 입력, 같은 seed
```

두 요청 모두 `{"seed": 1, "text": "외국인등록증을 발급받으려고 합니다.", …}`로
나갔다(`runs/woo_s1.json`·`runs/woo_seedchk.json`의 `config.seed`가 둘 다 1).

따라서 **마음에 드는 take는 그 mp3 파일이 유일본이다.** 지우면 되살릴 수 없고
seed를 적어두는 것으로는 복원되지 않는다. 라이선스 조건(구독 기간 안에 다운로드)과
겹쳐서, 받아둔 폴더를 지우는 것이 곧 자산을 잃는 것이다.

seed를 그래도 기록하는 이유는 무엇으로 만들었는지 남기기 위해서다. 재현용이 아니다.

## 손질 회차 (fix*)

억양이 이상한 문장만 골라 변형을 만들어 원본과 나란히 듣는 회차다.
생성은 `typecast_gen.py`로 하고(변형마다 config·sentences를 나눠 여러 번 돌린다),
표만 `fix_index.py`로 만든다.

```
python scripts/tts/fix_index.py --fix "D:/aihub_work/tts_typecast_v1_20260819/fix1"
```

- 입력은 그 폴더의 `variants.json` 하나다. 파일마다 보이스·문장·변형·seed·입력
  텍스트·파라미터가 한 줄씩 들어 있고, 그대로 `manifest.json`의 `records`가 된다
- 행 = (보이스, 문장), 열 = 변형. **첫 열은 원본을 상위 폴더에서 복사해 온다.**
  `../`를 상대경로로 가리키면 zip을 풀었을 때 첫 열만 끊긴다
- 변형이 없는 칸은 비워 둔다. 그래서 표가 성글고, 회귀 검사도
  "칸을 다 채웠나"가 아니라 "오디오가 있는 칸마다 메모가 있나"를 본다
- 메모 키는 `naruve.tts.memo.<날짜>.fix1`. 본작업과 섞이지 않는다
- 생성하지 않으므로 크레딧이 나가지 않는다. 몇 번을 돌려도 된다

## 같은 폴더 안의 곁실험

하위 폴더가 자기 `manifest.json`을 가지면 **별도 실행**으로 보고 본작업의 길이
측정과 zip에서 제외한다. `tts_typecast_v1_20260819/knobs/` 가 그 경우다.
빼지 않으면 본작업 수치에 곁실험 오디오가 섞여 조용히 틀린다.

곁실험의 `index.html`이 본작업과 같은 localStorage 키를 쓰면 메모가 섞이므로,
그 실행의 config에만 `"memo_key_suffix": "knobs"` 를 준다.
키는 `naruve.tts.memo.<날짜>[.접미어]` 가 된다.

## 안전장치

- **재실행 안전.** 이미 있고 크기가 0이 아닌 파일은 건너뛴다. 다시 돌려도 크레딧이 안 나간다
- 받는 중에는 `.part`로 쓰고 다 받으면 rename 한다. 중간에 끊겨도 반쪽 파일이 남지 않는다
- **동시 호출은 5를 넘지 않는다.** config, 구독 응답의 `concurrency_limit`, 코드 상수 셋으로 조인다
- 429·5xx는 지수 백오프로 재시도한다. 402와 그 밖의 4xx는 즉시 멈춘다
- 시작 전에 잔량이 예상보다 적으면 아예 시작하지 않는다
- 시작 전에 보이스 ID가 그 모델 카탈로그에 있는지 확인한다
- 보이스 폴더명이나 문장 id가 겹치면 시작하지 않는다 (덮어쓰기 방지)

## 주의 — 구독 기간 안에 다운로드를 마쳐야 한다

라이트 플랜 출력물은 상업 이용이 가능하다. **단 구독 기간 안에 다운로드를 끝내야
그 권리가 남는다** (Typecast 고객센터 회신 2026-08-19).

그래서 이 스크립트는 스트리밍하지 않고 생성 즉시 로컬 파일로 떨어뜨린다.
받아둔 폴더를 지우면 다시 만들어야 하고, 구독이 끝난 뒤에는 다시 만들 수 없다.

## 앱에 넣을 때 (P7-3)

여기서 만든 파일은 아직 앱에 들어가지 않는다. 보이스가 정해지면
`docs/audio/`에 `<hash>.mp3` 로 넣고 같은 폴더 `index.json`에 파일명 목록을 둔다.
`hash`는 `sentences.json`에 이미 들어 있다. `audio.js`는 고치지 않는다 —
파일이 있는 문장만 1번 경로가 이기고 나머지는 그대로 TTS로 떨어진다.
