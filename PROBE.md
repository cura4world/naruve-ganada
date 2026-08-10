# 발음평가 프로브 — 실행 순서

PC 앞에서 위에서 아래로 그대로 따라가는 문서다.
무엇을 왜 재는지는 `DECISIONS.md` 8.5절에 있다.

**전제** — Azure 키는 발급받았다. ETRI 키는 없어도 된다.
**ETRI 없이 Azure만으로 끝까지 간다.** 아래 어느 단계도 ETRI를 기다리지 않는다.

**1-b는 끝났다.** 응답 스키마는 2026-08-07 Speech Studio 실측으로, **요청 규격은
2026-08-10 첫 실호출(HTTP 200)로** 확정됐다. 응답 정답지는
`scripts/adapters/azure.py`의 docstring에 있다.

---

## 오늘 얻는 것과 못 얻는 것

프로브가 답해야 할 것은 `DECISIONS.md` 0절의 관문 세 개다.

| 관문 | 오늘 답이 나오나 |
|---|---|
| 음절 타일이냐 어절 타일이냐 | **절반 나왔다** — 음소 이름은 빈 문자열로 확정. 남은 질문은 (B)의 **Syllables 배열**이 어절마다 오는가와 개수가 맞는가다 |
| 오류 가설 재채점이 작동하나 | **나온다** — (C)의 gap과 감점 위치 |
| 무료 모드가 발음 채점을 할 수 있나 | 안 나온다. 온디바이스는 이 하네스 밖이다 |

### ElevenLabs 키가 없으면 (D)는 비어 있다 — 그리고 그냥 빈칸이 아니다

Azure TTS로 만든 음성을 Azure 발음평가에 넣는 것은 `DECISIONS.md` 8.5가
경고한 **바로 그 조합**이다. 같은 회사 음향 특성이라 점수가 부풀 수 있다.

Azure만으로 돌리면:

- (B) (C) 는 그대로 유효하다. 스키마와 gap은 편향의 영향을 거의 안 받는다
- **(E)는 낙관적으로 읽어야 한다.** 편향이 얼마인지 모르는 채 점수만 본다
- **(D)는 아예 못 만든다**

그래서 (E)로 눈금을 결론내지 않는다. 오늘은 (B)와 (C)까지가 목표다.
ElevenLabs 키가 생기면 2단계부터 다시 돌리면 되고, 15분이면 끝난다.

---

## 0. 준비 확인 — 예상 5분

### 키

| 이름 | 어디서 | 오늘 필요한가 |
|---|---|---|
| `SPEECH_KEY` | Azure Portal → Speech 리소스 → Keys and Endpoint | **필수** |
| `SPEECH_REGION` | 같은 화면. `koreacentral` 같은 지역 코드 | **필수** |
| `ELEVENLABS_API_KEY` | ElevenLabs → Profile → API Key | 없어도 진행. (D)만 빔 |
| `ETRI_API_KEY` | ETRI 오픈 API 포털 | **오늘은 불필요** |

ElevenLabs를 쓴다면 **유료 플랜에서 생성한 키**여야 한다.
무료 플랜 출력물은 상업 이용이 불가하다 (`DECISIONS.md` 9절).

### egress 허용 도메인

```
*.api.cognitive.microsoft.com
*.cognitiveservices.azure.com
learn.microsoft.com
api.elevenlabs.io
epretx.etri.re.kr
```

`learn.microsoft.com`은 API 호출용이 아니라 **요청 규격 확인용**이다 (1-b).

와일드카드가 지역 하위도메인을 안 잡으면 이것도 같이 연다.
실제 호출이 나가는 곳이다.

```
<region>.tts.speech.microsoft.com
<region>.stt.speech.microsoft.com
```

### 도구

`python` (3.8+), `ffmpeg`. **파이썬 패키지는 설치할 것이 없다** — 표준 라이브러리만 쓴다.

> 이 PC에서는 `python3`가 아니라 `python`이다. `python3`는 Windows Store 별칭 스텁이라 아무것도 실행하지 않고 exit 49로 끝난다.

```
python --version
ffmpeg -version
```

### 실행할 때 앞에 붙이는 것 — `PYTHONIOENCODING=utf-8`

**Windows에서는 이걸 빼면 한글 출력이 전부 깨진다.** 콘솔이 cp949고
스크립트 출력은 utf-8이라 `������`로 나온다. 아래 모든 명령에 붙인다.

```
PYTHONIOENCODING=utf-8 python scripts/pa_probe.py ...
```

PowerShell에서는 `$env:PYTHONIOENCODING="utf-8"`을 먼저 한 번 실행한다.
파일로 저장하는 경로(`-o`)는 항상 utf-8이라 이 문제가 없다.

ffmpeg이 없으면:

```
winget install Gyan.FFmpeg          # Windows
brew install ffmpeg                 # macOS
sudo apt install ffmpeg             # Ubuntu/Debian
```

> Windows에서 `.sh`를 돌릴 때는 Git Bash를 쓴다.
> PowerShell에서는 `bash scripts/prep_audio.sh`가 돌지 않는다.

---

## 1. 설정 · 규격 확인 — 예상 10~25분

### 1-a. .env  (5분)

```
cp .env.example .env
```

열어서 `SPEECH_KEY`와 `SPEECH_REGION`을 채운다.
ElevenLabs 키가 없으면 `TTS_VENDOR=azure`로 바꾼다.

`.env`는 `.gitignore`에 있다. 커밋되지 않는다.

### 1-b. Azure 규격 — 응답은 끝났고 요청은 남았다

**응답 스키마: 2026-08-07 확정.** Speech Studio 발음평가 도구(ko-KR,
Prosody assessment 체크)에 폰 녹음 4문장을 넣어 확인했다. 우리 코드를
한 줄도 거치지 않은 응답이라 이것이 정답지다.
전체 구조와 예외는 `scripts/adapters/azure.py`의 docstring에 있다. 요약:

| 확인한 것 | 결과 |
|---|---|
| `NBest[0].Words[]` | 온다. **다만 참조 텍스트의 띄어쓰기를 그대로 따르지 않는다** |
| `Words[].Phonemes[].Phoneme` | **항상 빈 문자열.** `Syllable`도 마찬가지 |
| `NBestPhonemes[].Score` | **값이 온다.** 이름은 없어도 2순위 점수는 신호가 된다 |
| `Syllables[]` | 대부분 오고 개수도 표기 음절 수와 맞지만, **없는 어절이 있다** (`만나서`) |
| `Offset` / `Duration` | 문장·어절·음절·음소 전 층에. 단위 100나노초 |
| `ProsodyScore` | **없다.** Prosody를 켜고 불러도 ko-KR 응답에는 오지 않는다 |
| 표기형이냐 표준발음형이냐 | **표준발음형.** `많이`의 Phonemes가 4개(표기형이면 5개). G2P 불필요 |

**요청 규격도 확정됐다 (2026-08-10).** 첫 실호출이 HTTP 200이었다.
아래 넷이 전부 그대로 통과했다.

- 엔드포인트 경로와 쿼리 (`language=ko-KR`, `format=detailed`)
- `Pronunciation-Assessment` 헤더 이름과 base64 인코딩
- PA 설정 JSON 키 (`ReferenceText` / `GradingSystem` / `Granularity` /
  `Dimension` / `EnableMiscue` / **`NBestPhonemeCount`**)
- `Content-Type`의 codec·samplerate 표기

**응답 스키마는 REST와 Studio가 다르다 (2026-08-10).** Studio는 점수를
`PronunciationAssessment` 아래에 중첩해 주고 **REST는 평평하게 준다.**
최상위도 Studio는 리스트, REST는 dict다. `pa_report.py`와
`pa_report_adhoc.py`는 두 형태를 다 받는다. `DECISIONS.md` 3.2 참조.

같은 오디오·같은 참조 텍스트인데 점수도 조금 다르다(`17 싸요` Studio 89.8 /
REST 88.0). **기준은 REST다.** 앱이 받는 것이 그쪽이다.

아래 400 대응 절차는 다른 엔진·다른 설정에서 다시 필요할 수 있어 남겨둔다.

**401이 아니라 400이 오면 규격 문제다.** 401은 키 문제다.
400이면 `NBestPhonemeCount`가 첫 번째 용의자다 — `.env`에
`AZURE_NBEST_PHONEMES=0`을 넣어 그 키를 빼고 다시 부른 뒤,
그래도 400이면 나머지를 의심한다.
어댑터가 응답 본문을 그대로 찍으므로 무엇이 틀렸는지는 화면에 나온다.

---

## 2. 음성 만들기 — 예상 15분

```
python scripts/tts_gen.py --list
```

무엇을 만들지 먼저 본다. **7개**가 나와야 하고 건너뛰는 항목은 없다.
(표기형/표준발음형 판별용이던 `s2_alt_ref`는 답이 나와 제거됐다.)

`--list`도 벤더를 알아야 목록을 찍는다. 1-a에서 `.env`의 `TTS_VENDOR`를
채웠으면 그대로 나오고, 아직이면 `--vendor azure`를 같이 준다.

### Azure만 있을 때

```
python scripts/tts_gen.py --vendor azure
```

### ElevenLabs 키도 있을 때 — 둘 다 돌린다

```
python scripts/tts_gen.py --vendor elevenlabs
python scripts/tts_gen.py --vendor azure
```

→ `out/tts/<id>__<vendor>.mp3`

### 여기서 반드시 귀로 들어본다  (10분)

오류 샘플 셋을 재생해 **표기를 비튼 대로 읽었는지** 확인한다.

| 파일 | 이렇게 들려야 한다 |
|---|---|
| `s1_batchim__*.mp3` | 반가**씀**니다 — 받침 ㅂ이 없다 |
| `s3_vowel__*.mp3` | **올**마예요 — 얼이 아니라 올 |
| `s4_tense__*.mp3` | **사**요 — 싸가 아니라 사 |

벤더가 교정해서 원래 문장으로 읽어버렸으면 **그 샘플은 못 쓴다.**
`DECISIONS.md` 9절 TTS 선정 기준 5번이 이것이다.
그 경우 (C) 표의 해당 쌍은 무의미하므로, 다른 벤더로 다시 뽑거나
그 쌍을 결과에서 빼고 읽는다.

---

## 3. 변환 — 예상 1분

```
bash scripts/prep_audio.sh
```

→ `out/wav/<id>__<vendor>.wav` (16kHz / 16bit / mono PCM)

> **메모 — m4a를 그대로 보내도 될지 모른다.** 1-b 실측에서 폰으로 녹음한
> m4a를 변환 없이 Speech Studio에 올렸고 그대로 처리됐다. 다만 그건
> Studio가 받아준 것이지 **REST API도 같은지는 확인되지 않았다.** REST는
> `Content-Type`으로 codec을 선언하는 구조라 wav 전제가 깔려 있을 수 있다.
> 그래서 이 변환 단계는 그대로 유지한다. 여유가 있을 때 wav로 한 번 돌려
> 표를 확보해 둔 뒤, 같은 오디오의 m4a를 직접 보내 점수가 같은지 비교하면
> 값어치가 있다 — 되면 사용자 녹음을 앱에서 변환하지 않고 그대로 올릴 수
> 있고, 그건 폰 CPU와 업로드 용량 양쪽에 이득이다.

---

## 4. 프로브 실행 — 예상 10분

### `--enable-miscue`는 필수다 (2026-08-10)

기본값이 없다. 안 주면 에러로 끝난다.

`false`는 **강제 정렬(forced alignment)** 모드다 — Microsoft Learn FAQ:
"단일 샷 모드에서 EnableMiscue가 false로 설정되면 시스템은 인식된 텍스트가
참조 텍스트와 강제적으로 맞추게 합니다." 참조 텍스트가 바뀌면 정렬 목표가
바뀌므로 같은 오디오라도 점수가 달라진다.

`DECISIONS.md` 8.8·8.9 D군은 전부 Speech Studio 기본값(false)에서 나온 값이고,
이 하네스는 반대로 `true`가 박혀 있었다(2026-08-10에 고쳤다). 무엇으로 쟀는지
모르는 결과가 쌓이지 않도록 매번 명시한다. 보낸 값은 결과 JSON의
`enable_miscue`·`engine_config`와 리포트 머리에 함께 남는다.

Speech Studio UI에는 이 설정이 없다. 고급 옵션은 Prosody 하나뿐이다.

30초를 넘는 오디오는 연속 모드가 되어 이 설정이 적용되지 않는다.
스크립트가 ffprobe로 길이를 미리 재고, 넘으면 그 항목을 부르지 않는다.

### 단발 모드 — 오디오 하나로 규격만 확인할 때

세트 전체를 돌리기 전에 요청 규격을 한 번의 호출로 확인할 수 있다.
TTS 생성(2단계)과 변환(3단계)을 건너뛴다. m4a를 그대로 주면 스크립트가
**저장소 밖 임시 폴더**에서 16kHz/mono wav로 바꿔 보내고 끝나면 지운다.

```
PYTHONIOENCODING=utf-8 python scripts/pa_probe.py --engine azure \
    --audio "C:/어딘가/17 싸요.m4a" --ref "싸요" --enable-miscue false
```

→ `out/adhoc/<engine>__<id>__miscue-<값>.json`

`out/raw/`에 섞지 않는다. `pa_report.py`의 (C)(D)(E) 표는 probe_set의 쌍
구조와 TTS 벤더를 전제로 짜여 있어서, 사람 녹음이 같은 폴더에 들어가면
쌍이 아닌 것을 쌍으로 묶는다.

**음성 파일은 저장소로 복사하지 않는다.** 공개 저장소이고 음성 데이터다.
경로는 하드코딩하지 말고 인자로 준다.

### 세트 모드

먼저 계획만 본다. 호출은 나가지 않는다.

```
PYTHONIOENCODING=utf-8 python scripts/pa_probe.py \
    --engine azure --vendor azure --enable-miscue false --dry-run
```

**7개** 항목이 나와야 한다. 3단계를 건너뛰었으면 7개가 전부 "음성이 없어
건너뛸 항목"으로 나온다 — 그건 오류가 아니라 wav가 아직 없다는 뜻이다.

### 첫 호출에서 규격부터 확인한다

```
PYTHONIOENCODING=utf-8 python scripts/pa_probe.py \
    --engine azure --vendor azure --enable-miscue false
```

첫 줄에서 400이 뜨면 **여기서 멈추고 1-b로 돌아간다.** 나머지를 계속
돌려봐야 같은 오류가 7번 날 뿐이다. 응답 본문과 azure.py의 정답지를
대조하면 바로 맞는다.

### 통과하면 ElevenLabs 음성도

```
PYTHONIOENCODING=utf-8 python scripts/pa_probe.py \
    --engine azure --vendor elevenlabs --enable-miscue false
```

### 음소 알파벳 두 번 돌리기

음소 이름이 빈 문자열로 오는 것은 확인됐지만, 그건 알파벳을 지정하지 않은
Studio 조건에서다. 알파벳을 지정하면 이름이 채워지는지는 아직 모른다.
`.env`의 `AZURE_PHONEME_ALPHABET`을 비운 채 한 번, `IPA`로 한 번 돌린다.
**이름이 채워지면 8.6의 음절 타일 판단이 통째로 다시 열린다.**

```
# .env 에서 AZURE_PHONEME_ALPHABET=IPA 주석을 푼 뒤
PYTHONIOENCODING=utf-8 python scripts/pa_probe.py \
    --engine azure --vendor azure --enable-miscue false --force
```

→ `out/raw/<engine>__<id>__<vendor>.json` — **가공 없는 원본**

---

## 5. 표 보기 — 예상 30분

```
python scripts/pa_report.py
python scripts/pa_report.py -o out/report.md
```

콘솔에서 한글이 깨지면 `-o`로 저장해서 읽는다. 파일은 항상 utf-8이다.

| 표 | 무엇을 답하나 |
|---|---|
| (B) | 어절 분절 · **Syllables 유무와 개수** · 음소 이름 · NBestPhonemes · Offset/Duration |
| (C) | **gap과 감점 위치** — 핵심 |
| (D) | 벤더 편향 (Azure만 돌렸으면 빔) |
| (E) | 눈금. 상한 참고치일 뿐 |

(A) 표기형/표준발음형 표는 없어졌다. 1-b에서 표준발음형으로 확정됐다.

### 읽는 법

**(C)가 전부다.** 절대 점수가 아니라 정상↔오류 **gap**을 본다.
그리고 감점이 실제로 오류가 있는 어절에 떨어졌는지 O/X를 본다.
**X면 gap이 커도 실패다.** 엉뚱한 어절을 지적하면 사용자는 그것이
틀렸다는 것을 알 수 없고, 잘못된 지적을 신뢰하게 만드는 것이 가장
나쁜 실패다 (`DECISIONS.md` 8.6).

**(B)의 B-2가 X면 타일 설계가 바뀐다.** 참조 텍스트로 타일을 미리 그려놓고
응답을 끼워넣는 순서로는 어긋난다. 응답의 Words를 받아 타일을 그린다.

**(B)의 B-3이 음절 타일의 관문이다.** 배열이 없거나 개수가 표기 음절 수와
어긋난 어절은 음절 타일을 그리면 안 된다. 이름표가 없어 순서로만 정렬하는데
한 칸만 밀리면 엉뚱한 음절에 잉크가 찬다. 그런 어절만 어절 단위로 내린다.

**(E)는 결론내지 않는다.** 들어간 것이 사람이 아니라 TTS 음성이라
사람보다 균일하다. 90 미만이 나오면 사람은 더 낮다는 뜻이라 눈금을
의심할 근거가 되지만, 95가 나와도 원어민이 95라는 뜻은 아니다.
Azure TTS만 썼다면 편향까지 얹혀 있다. 진짜 눈금은 원어민 녹음으로만 잰다.
참고로 1-b에서 원어민(폰 녹음) 4문장은 91~100이 나왔다. 표본 4개다.

---

## 막혔을 때 — 어디서 멈추고 무엇을 보고하나

**공통: `DECISIONS.md` 12절 — egress에 막히면 우회하지 않고 보고만 한다.**

| 증상 | 멈출 지점 | 보고할 것 |
|---|---|---|
| `CONNECT tunnel failed` / 403 | 그 자리 | 막힌 **호스트 이름**. egress 목록 추가가 필요하다 |
| 401 Unauthorized | 그 자리 | 키와 지역을 다시 확인. 그래도 나면 리소스 종류(Speech가 맞는지) |
| **400 Bad Request** | **4단계 첫 호출** | 응답 본문 전체. `AZURE_NBEST_PHONEMES=0`으로 한 번 더 돌린 결과도 같이 |
| TTS가 비튼 표기를 교정해 읽음 | 2단계 | 어느 샘플인지. 그 쌍은 (C)에서 빼고 읽는다 |
| `Syllables`가 여러 어절에서 없음 | 5단계 | (B) B-3 표. 음절 타일 범위가 좁아진다 |
| Words가 참조 어절과 자주 어긋남 | 5단계 | (B) B-2 표. 타일 생성 순서를 응답 기준으로 바꾼다 |
| 표는 나왔는데 (C)가 전부 X | 5단계 | `out/report.md` 전체. 엔진 판단이 달라진다 |

`out/raw/`의 JSON은 **지우지 말 것.** 원본이 있으면 다시 호출하지 않고
표를 다시 만들 수 있다. 표만 남기면 다음 질문이 생겼을 때 처음부터다.

---

## 소요시간 요약 (추정)

| 단계 | Azure만 | +ElevenLabs |
|---|---|---|
| 0 준비 확인 | 5분 | 5분 |
| 1-a `.env` | 5분 | 5분 |
| 1-b 규격 확인 | **완료** (응답 08-07 / 요청 08-10) | 같음 |
| 2 TTS 생성 | 3분 | 5분 |
| 2 귀로 확인 | 10분 | 15분 |
| 3 변환 | 1분 | 1분 |
| 4 프로브 | 8분 | 12분 |
| 5 표 읽고 판단 | 30분 | 35분 |
| **합계** | **1시간 ~ 1시간 20분** | 1시간 20분 ~ 1시간 40분 |

응답 스키마를 이미 아는 상태로 들어가므로, 응답이 이상해도 우리 코드
탓인지 Azure의 ko-KR 동작 탓인지 바로 갈린다. 1-b가 벌어준 시간이 그것이다.

원가는 무시할 수준이다. 발음평가 8초 약 4원 추정 기준으로 28호출이면
150원 안쪽, TTS는 14문장이라 어느 벤더든 무료 한도 근처다.

---

## 아직 안 되는 것

| 항목 | 상태 |
|---|---|
| ETRI 어댑터 | 골격만. **상업 이용 약관 확인이 엔드포인트보다 먼저다** |
| 온디바이스 어댑터 | 자리만. 이 파이썬 하네스에서 돌지 않는다 |
| ProsodyScore | **ko-KR 미제공 확인됨.** 억양 층은 `pitch.js`가 계속 맡는다 |
| m4a 직접 전송 | REST에서 되는지 미확인. 3단계 메모 참조 |

ETRI는 `DECISIONS.md` 8.2에서 **외국인의 한국어 발음평가를 명시적 용도로
표방하는 유일한 후보**다. Azure가 영어 우선 설계의 한국어 이식인 것과
대비되므로 후보에서 빼지 않는다. 규격이 확정되면 `assess()`만 채우면
되고 호출부는 손대지 않는다.
