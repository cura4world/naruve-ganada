# 발음평가 프로브 실행 순서

PC 앞에 앉았을 때 위에서 아래로 그대로 따라가는 문서다.
무엇을 재는지와 왜 그렇게 재는지는 `DECISIONS.md` 8.5절에 있다.

이 프로브가 답해야 하는 질문은 세 개다 — `DECISIONS.md` 0절의 관문이다.

1. 음절 타일 UI를 유지할지, 어절 타일로 내릴지
2. 오류 가설 재채점이 실제로 작동하는지
3. 무료 모드가 발음 채점을 할 수 있는지

세 개가 열리기 전에는 문장 확장·번역·UI 작업을 시작하지 않는다.

---

## 0. 먼저 뚫어야 하는 것

### 키

| 이름 | 어디서 | 없으면 |
|---|---|---|
| `SPEECH_KEY` | Azure Portal → Speech 리소스 → Keys and Endpoint | 발음평가·Azure TTS 둘 다 못 돈다 |
| `SPEECH_REGION` | 같은 화면. `koreacentral` 같은 지역 코드 | 위와 같음 |
| `ELEVENLABS_API_KEY` | ElevenLabs → Profile → API Key | ElevenLabs TTS만 못 돈다 |
| `ETRI_API_KEY` | ETRI 오픈 API 포털 | ETRI 어댑터는 어차피 골격뿐이다 |

ElevenLabs 키는 **유료 플랜에서 생성한 것**이어야 한다.
무료 플랜 출력물은 상업 이용이 불가하다 (`DECISIONS.md` 9절).

### egress 허용 도메인

지금 이 도메인들이 전부 차단돼 있다 (`DECISIONS.md` 14절).
프로브를 돌리는 환경에서 먼저 열어야 한다.

```
*.api.cognitive.microsoft.com
*.cognitiveservices.azure.com
learn.microsoft.com
api.elevenlabs.io
epretx.etri.re.kr
```

`learn.microsoft.com`이 목록에 있는 이유는 API를 부르기 위해서가 아니라
**응답 스키마를 확인하기 위해서**다. 아래 1-b를 본다.

추가로 TTS·STT 실호출은 지역 하위도메인으로 나간다.
`*.api.cognitive.microsoft.com` 와일드카드로 안 잡히면 이것도 같이 연다.

```
<region>.tts.speech.microsoft.com
<region>.stt.speech.microsoft.com
```

### 도구

`ffmpeg`, `python3` (3.8 이상). 파이썬 패키지는 설치할 것이 없다 —
하네스는 표준 라이브러리만 쓴다.

---

## 1. 준비

### 1-a. .env

```
cp .env.example .env
```

열어서 키를 채운다. `.env`는 `.gitignore`에 있으므로 커밋되지 않는다.

### 1-b. Azure REST 규격 확인 — 건너뛰지 말 것

`scripts/adapters/azure.py`의 REST 규격은 **실호출로 검증되지 않았다.**
작성 시점에 `learn.microsoft.com`이 막혀 공식 문서를 직접 읽지 못했다.

확인할 것 넷:

- 엔드포인트 경로와 쿼리 파라미터 (`language`, `format=detailed`)
- `Pronunciation-Assessment` 헤더 이름과 base64 인코딩 방식
- PA 설정 JSON의 키 표기 (`ReferenceText` / `GradingSystem` / `Granularity` / `Dimension` / `EnableMiscue`)
- `Content-Type`의 codec·samplerate 표기

401이 아니라 **400이 오면 여기부터 의심한다.** 어댑터가 응답 본문을
그대로 찍으므로 무엇이 틀렸는지는 화면에 나온다.

---

## 2. 음성 만들기

```
python3 scripts/tts_gen.py --list                  # 무엇을 만들지 먼저 확인
python3 scripts/tts_gen.py --vendor elevenlabs
python3 scripts/tts_gen.py --vendor azure
```

→ `out/tts/<id>__<vendor>.mp3`

두 벤더를 다 돌리는 이유는 (D) 벤더 편향 때문이다. Azure TTS 음성을
Azure 발음평가에 넣으면 같은 회사 음향 특성이라 점수가 부풀 수 있다.
한 벤더만 돌리면 (D) 표가 비고 나머지 표의 신뢰도도 같이 떨어진다.

### 여기서 반드시 귀로 들어본다

오류 샘플 셋을 재생해 **표기를 비튼 대로 읽었는지** 확인한다.

| 파일 | 이렇게 들려야 한다 |
|---|---|
| `s1_batchim` | 반가**씀**니다 — 받침 ㅂ이 없다 |
| `s3_vowel` | **올**마예요 — 얼이 아니라 올 |
| `s4_tense` | **사**요 — 싸가 아니라 사 |

벤더가 교정해서 원래 문장으로 읽어버렸으면 그 샘플은 못 쓴다.
`DECISIONS.md` 9절 TTS 선정 기준 5번이 이것이다. 이 경우 그 벤더를
오류 샘플 생성에서 빼고 다른 벤더로 다시 뽑는다.

---

## 3. 변환

```
bash scripts/prep_audio.sh
```

→ `out/wav/<id>__<vendor>.wav` (16kHz / 16bit / mono PCM)

---

## 4. 프로브 실행

```
python3 scripts/pa_probe.py --engine azure --vendor elevenlabs --dry-run
python3 scripts/pa_probe.py --engine azure --vendor elevenlabs
python3 scripts/pa_probe.py --engine azure --vendor azure
```

→ `out/raw/<engine>__<id>__<vendor>.json`

응답은 **가공 없이** 저장된다. 요약본만 남기면 지금 필요 없어 보이는
필드가 나중에 답이 될 때 다시 부를 수 없다.

`s2_alt_ref`는 자기 오디오가 없다. `s2_ok`의 음성을 그대로 쓰고 참조
텍스트만 `마니 드세요`로 바꿔 부른다. 이 한 번의 재호출이 (A)의 전부다.

### 음소 알파벳 두 번 돌리기

`.env`의 `AZURE_PHONEME_ALPHABET`을 비운 채 한 번, `IPA`로 한 번 돌린다.
음소 이름이 빈 문자열로 오는지가 (B)의 핵심 질문인데, 알파벳을 지정하면
결과가 달라질 수 있다. `--force`를 붙여야 덮어쓴다.

---

## 5. 표 보기

```
python3 scripts/pa_report.py
python3 scripts/pa_report.py -o out/report.md
```

| 표 | 무엇을 답하나 |
|---|---|
| (A) | 표기형 기준인가 표준발음형 기준인가 |
| (B) | 어절 분절·음소 이름·Offset/Duration·ProsodyScore |
| (C) | **gap과 감점 위치** — 핵심 |
| (D) | 벤더 편향 크기 |
| (E) | 눈금이 원어민 92~100에 맞는가 (상한 참고치) |

### 읽는 법

**(C)가 전부다.** 절대 점수가 아니라 정상↔오류 **gap**을 본다.
그리고 감점이 실제로 오류가 있는 어절에 떨어졌는지 O/X를 본다.
**X면 gap이 커도 실패다.** 엉뚱한 어절을 지적하면 사용자는 그것이
틀렸다는 것을 알 수 없고, 잘못된 지적을 신뢰하게 만드는 것이 가장
나쁜 실패다 (`DECISIONS.md` 8.6).

**(B)의 Phoneme 필드가 빈 문자열이면** 음절 타일은 그대로 못 간다.
이름표 없이 순서로만 정렬해야 하는데 음운 변동 때문에 한 칸만 밀려도
엉뚱한 음절에 잉크가 찬다. 그때는 어절 타일이 답이다.

**(E)는 상한 참고치다.** 들어간 것이 사람이 아니라 TTS 음성이라
사람보다 균일하다. 여기서 90 미만이 나오면 사람은 더 낮다는 뜻이므로
눈금을 의심할 근거가 되지만, 여기서 95가 나와도 원어민이 95라는 뜻은
아니다. 진짜 눈금 확인은 원어민 녹음으로만 된다.

---

## 예상 소요시간

키와 egress가 준비된 뒤 기준이다. 추정치다.

| 단계 | 시간 |
|---|---|
| 1-a `.env` 채우기 | 5분 |
| 1-b Azure REST 규격 확인 | **20~40분** (문서를 읽어야 한다) |
| 2 TTS 생성 (7문장 × 2벤더 = 14개) | 5분 |
| 2 귀로 확인 | 10분 |
| 3 변환 | 1분 |
| 4 프로브 (8호출 × 2벤더 × 알파벳 2회) | 5분 |
| 5 표 읽고 판단 | 30분 |

합계 **1.5~2시간**. 1-b에서 400이 계속 나면 여기가 늘어난다.

원가는 무시할 수준이다. 발음평가 8초 약 4원 추정 기준으로 32호출이면
150원 안쪽이고, TTS는 14문장이라 어느 벤더든 무료 한도 근처다.

---

## 아직 안 되는 것

| 항목 | 상태 |
|---|---|
| ETRI 어댑터 | 골격만. 엔드포인트·스키마 미확인. **상업 이용 약관 확인이 먼저다** |
| 온디바이스 어댑터 | 자리만. 이 파이썬 하네스에서 돌지 않는다 |
| ProsodyScore | ko-KR에는 없을 가능성이 높다. 억양 층은 `pitch.js`가 계속 맡는다 |

ETRI는 `DECISIONS.md` 8.2에서 **외국인의 한국어 발음평가를 명시적 용도로
표방하는 유일한 후보**다. Azure가 영어 우선 설계의 한국어 이식인 것과
대비되므로 후보에서 빼지 않는다. 규격이 확정되면 `assess()`만 채우면
되고 호출부는 손대지 않는다.
