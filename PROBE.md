# 발음평가 프로브 — 실행 순서

PC 앞에서 위에서 아래로 그대로 따라가는 문서다.
무엇을 왜 재는지는 `DECISIONS.md` 8.5절에 있다.

**전제** — Azure 키는 방금 발급받았다. ETRI 키는 없어도 된다.
**ETRI 없이 Azure만으로 끝까지 간다.** 아래 어느 단계도 ETRI를 기다리지 않는다.

---

## 오늘 얻는 것과 못 얻는 것

프로브가 답해야 할 것은 `DECISIONS.md` 0절의 관문 세 개다.

| 관문 | 오늘 답이 나오나 |
|---|---|
| 음절 타일이냐 어절 타일이냐 | **나온다** — (B)의 Phoneme 필드 |
| 오류 가설 재채점이 작동하나 | **나온다** — (C)의 gap과 감점 위치 |
| 무료 모드가 발음 채점을 할 수 있나 | 안 나온다. 온디바이스는 이 하네스 밖이다 |

### ElevenLabs 키가 없으면 (D)는 비어 있다 — 그리고 그냥 빈칸이 아니다

Azure TTS로 만든 음성을 Azure 발음평가에 넣는 것은 `DECISIONS.md` 8.5가
경고한 **바로 그 조합**이다. 같은 회사 음향 특성이라 점수가 부풀 수 있다.

Azure만으로 돌리면:

- (A) (B) (C) 는 그대로 유효하다. 스키마와 gap은 편향의 영향을 거의 안 받는다
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

`learn.microsoft.com`은 API 호출용이 아니라 **응답 스키마 확인용**이다 (1-b).

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

ffmpeg이 없으면:

```
winget install Gyan.FFmpeg          # Windows
brew install ffmpeg                 # macOS
sudo apt install ffmpeg             # Ubuntu/Debian
```

> Windows에서 `.sh`를 돌릴 때는 Git Bash를 쓴다.
> PowerShell에서는 `bash scripts/prep_audio.sh`가 돌지 않는다.

---

## 1. 설정 · 규격 확인 — 예상 25~45분

### 1-a. .env  (5분)

```
cp .env.example .env
```

열어서 `SPEECH_KEY`와 `SPEECH_REGION`을 채운다.
ElevenLabs 키가 없으면 `TTS_VENDOR=azure`로 바꾼다.

`.env`는 `.gitignore`에 있다. 커밋되지 않는다.

### 1-b. Azure REST 규격 확인 — 건너뛰지 말 것  (20~40분)

`scripts/adapters/azure.py`의 REST 규격은 **실호출로 검증되지 않았다.**
작성 시점에 `learn.microsoft.com`이 egress에 막혀 공식 문서를 못 읽었다.

**순서가 중요하다. 코드부터 디버깅하지 않는다.**

#### 먼저 Speech Studio로 정상 응답의 실제 모양을 본다

브라우저에서 발음평가 도구를 연다. 우리 코드를 한 줄도 거치지 않으므로
여기서 나온 JSON이 **정답지**다.

1. https://speech.microsoft.com → 발음 평가(Pronunciation assessment) 도구
2. 언어를 **ko-KR**로 맞춘다
3. 참조 텍스트에 `만나서 반갑습니다`를 넣는다
4. 오디오를 하나 올리거나 그 자리에서 녹음한다
5. **JSON 탭을 열어 응답 전체를 복사해 둔다**

이 JSON에서 확인할 것 넷. 어댑터를 여기에 맞추면 된다.

- `NBest[0].Words[]` 가 있는가, 어절이 띄어쓰기대로 끊겼는가
- `Words[].Phonemes[].Phoneme` 이 **이름인가 빈 문자열인가** ← 오늘의 핵심
- `Offset` / `Duration` 이 어디에 붙어 있는가
- `ProsodyScore` 가 있는가 (ko-KR에는 없을 것으로 본다)

이걸 먼저 보면 4단계에서 응답이 이상해도 **우리 코드 탓인지 Azure의
ko-KR 동작 탓인지 바로 갈린다.** 그 구분이 안 되면 몇 시간이 샌다.

#### 그다음 코드를 맞춘다

`scripts/adapters/azure.py`에서 확인할 곳:

- 엔드포인트 경로와 쿼리 (`language=ko-KR`, `format=detailed`)
- `Pronunciation-Assessment` 헤더 이름과 base64 인코딩
- PA 설정 JSON 키 (`ReferenceText` / `GradingSystem` / `Granularity` / `Dimension` / `EnableMiscue`)
- `Content-Type`의 codec·samplerate 표기

**401이 아니라 400이 오면 규격 문제다.** 401은 키 문제다.
어댑터가 응답 본문을 그대로 찍으므로 무엇이 틀렸는지는 화면에 나온다.

---

## 2. 음성 만들기 — 예상 15분

```
python scripts/tts_gen.py --list
```

무엇을 만들지 먼저 본다. 7개가 나와야 한다 (`s2_alt_ref`는 오디오를
새로 만들지 않으므로 건너뛴다고 표시된다).

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

---

## 4. 프로브 실행 — 예상 10분

먼저 계획만 본다. 호출은 나가지 않는다.

```
python scripts/pa_probe.py --engine azure --vendor azure --dry-run
```

8개 항목이 나와야 한다. `s2_alt_ref`에 `(오디오 재사용: s2_ok)`가 붙는다.
3단계를 건너뛰었으면 8개가 전부 "음성이 없어 건너뛸 항목"으로 나온다 —
그건 오류가 아니라 wav가 아직 없다는 뜻이다.

### 첫 호출에서 규격부터 확인한다

```
python scripts/pa_probe.py --engine azure --vendor azure
```

첫 줄에서 400이 뜨면 **여기서 멈추고 1-b로 돌아간다.** 나머지를 계속
돌려봐야 같은 오류가 8번 날 뿐이다. Speech Studio JSON과 대조하면 바로 맞는다.

### 통과하면 ElevenLabs 음성도

```
python scripts/pa_probe.py --engine azure --vendor elevenlabs
```

### 음소 알파벳 두 번 돌리기

음소 이름이 빈 문자열로 오는지가 (B)의 핵심 질문인데, 알파벳을
지정하면 결과가 달라질 수 있다. `.env`의 `AZURE_PHONEME_ALPHABET`을
비운 채 한 번, `IPA`로 한 번 돌린다.

```
# .env 에서 AZURE_PHONEME_ALPHABET=IPA 주석을 푼 뒤
python scripts/pa_probe.py --engine azure --vendor azure --force
```

→ `out/raw/<engine>__<id>__<vendor>.json` — **가공 없는 원본**

---

## 5. 표 보기 — 예상 30분

```
python scripts/pa_report.py
python scripts/pa_report.py -o out/report.md
```

| 표 | 무엇을 답하나 |
|---|---|
| (A) | 표기형 기준인가 표준발음형 기준인가 |
| (B) | 어절 분절 · **음소 이름** · Offset/Duration · ProsodyScore |
| (C) | **gap과 감점 위치** — 핵심 |
| (D) | 벤더 편향 (Azure만 돌렸으면 빔) |
| (E) | 눈금. 상한 참고치일 뿐 |

### 읽는 법

**(C)가 전부다.** 절대 점수가 아니라 정상↔오류 **gap**을 본다.
그리고 감점이 실제로 오류가 있는 어절에 떨어졌는지 O/X를 본다.
**X면 gap이 커도 실패다.** 엉뚱한 어절을 지적하면 사용자는 그것이
틀렸다는 것을 알 수 없고, 잘못된 지적을 신뢰하게 만드는 것이 가장
나쁜 실패다 (`DECISIONS.md` 8.6).

**(B)의 Phoneme이 빈 문자열이면** 음절 타일은 그대로 못 간다.
이름표 없이 순서로만 정렬해야 하는데 음운 변동 때문에 한 칸만 밀려도
엉뚱한 음절에 잉크가 찬다. 그때는 어절 타일이 답이다 — 8.6의 v1 결정이
이 경우를 위해 미리 적혀 있다.

**(E)는 결론내지 않는다.** 들어간 것이 사람이 아니라 TTS 음성이라
사람보다 균일하다. 90 미만이 나오면 사람은 더 낮다는 뜻이라 눈금을
의심할 근거가 되지만, 95가 나와도 원어민이 95라는 뜻은 아니다.
Azure TTS만 썼다면 편향까지 얹혀 있다. 진짜 눈금은 원어민 녹음으로만 잰다.

---

## 막혔을 때 — 어디서 멈추고 무엇을 보고하나

**공통: `DECISIONS.md` 12절 — egress에 막히면 우회하지 않고 보고만 한다.**

| 증상 | 멈출 지점 | 보고할 것 |
|---|---|---|
| `CONNECT tunnel failed` / 403 | 그 자리 | 막힌 **호스트 이름**. egress 목록 추가가 필요하다 |
| 401 Unauthorized | 그 자리 | 키와 지역을 다시 확인. 그래도 나면 리소스 종류(Speech가 맞는지) |
| **400 Bad Request** | **4단계 첫 호출** | 응답 본문 전체. 1-b의 Speech Studio JSON을 같이 보내면 바로 맞출 수 있다 |
| TTS가 비튼 표기를 교정해 읽음 | 2단계 | 어느 샘플인지. 그 쌍은 (C)에서 빼고 읽는다 |
| `Phonemes` 배열이 통째로 없음 | 5단계 | (B) 표와 `out/raw/` 파일 하나. 8.6 결정이 앞당겨진다 |
| 표는 나왔는데 (C)가 전부 X | 5단계 | `out/report.md` 전체. 엔진 판단이 달라진다 |

`out/raw/`의 JSON은 **지우지 말 것.** 원본이 있으면 다시 호출하지 않고
표를 다시 만들 수 있다. 표만 남기면 다음 질문이 생겼을 때 처음부터다.

---

## 소요시간 요약 (추정)

| 단계 | Azure만 | +ElevenLabs |
|---|---|---|
| 0 준비 확인 | 5분 | 5분 |
| 1-a `.env` | 5분 | 5분 |
| **1-b 규격 확인 (Speech Studio 포함)** | **20~40분** | 20~40분 |
| 2 TTS 생성 | 3분 | 5분 |
| 2 귀로 확인 | 10분 | 15분 |
| 3 변환 | 1분 | 1분 |
| 4 프로브 | 8분 | 12분 |
| 5 표 읽고 판단 | 30분 | 35분 |
| **합계** | **1시간 20분 ~ 1시간 40분** | 1시간 40분 ~ 2시간 |

1-b에서 400이 계속 나면 여기가 늘어난다. 그래서 Speech Studio를 먼저 본다.

원가는 무시할 수준이다. 발음평가 8초 약 4원 추정 기준으로 32호출이면
150원 안쪽, TTS는 14문장이라 어느 벤더든 무료 한도 근처다.

---

## 아직 안 되는 것

| 항목 | 상태 |
|---|---|
| ETRI 어댑터 | 골격만. **상업 이용 약관 확인이 엔드포인트보다 먼저다** |
| 온디바이스 어댑터 | 자리만. 이 파이썬 하네스에서 돌지 않는다 |
| ProsodyScore | ko-KR에는 없을 것으로 본다. 억양 층은 `pitch.js`가 계속 맡는다 |

ETRI는 `DECISIONS.md` 8.2에서 **외국인의 한국어 발음평가를 명시적 용도로
표방하는 유일한 후보**다. Azure가 영어 우선 설계의 한국어 이식인 것과
대비되므로 후보에서 빼지 않는다. 규격이 확정되면 `assess()`만 채우면
되고 호출부는 손대지 않는다. 오늘 저녁 일정에는 넣지 않는다.
