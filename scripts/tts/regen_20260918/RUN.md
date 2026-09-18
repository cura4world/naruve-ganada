# 음성 재생성 회차 — 2026-09-18 실행 순서

여성 7문장(감정·속도 3안) · 남성 200문장(속도 2안). 구독 만료일이라 **오늘 안에
생성과 다운로드를 끝내야 한다** — 유료 기간에 받아 둔 파일만 해지 후에도 쓸 수 있고
재생성은 재구독해야 한다 (DECISIONS 9.1 라이선스).

**기존 400개는 이 회차가 건드리지 않는다.** 전부 새 폴더(`D:\aihub_work\tts_regen_20260918\`)에
떨어지고, `docs/audio/`는 청취 후 사람이 고른 것만 손으로 바꾼다.

아래 아홉 줄은 전부 `--dry-run`으로 한 번씩 돌려 확인했다(2026-09-18). 파라미터가
요청에 실제로 실리는 것과 칸 수·글자수·크레딧이 표와 맞는 것을 봤다. dry-run은
API 키를 읽기 전에 끝나므로 호출이 나가지 않는다.

## 왜 회차가 9개인가 — 안은 5개인데

`typecast_gen.py`의 `build_request()`는 **config 하나를 그 회차의 모든 문장에 똑같이**
건다. 문장별 파라미터를 받는 구조가 없다. 안 B와 안 C는 문장마다 프리셋이 다르므로
셋으로 갈라야 한다. 배치 0의 fix1 회차도 같은 이유로 여러 번 돌렸다.

| 안 | 회차 | 문장 |
|---|---|---|
| A | `fem_A_normal` | 7문장 전부 |
| B | `fem_B1_tonedown` / `fem_B2_toneup` / `fem_B3_tempo092` | 2 / 3 / 2 |
| C | `fem_C1_tonedown_i2` / `fem_C2_toneup_i2` / `fem_C3_tempo092_i2` | 2 / 3 / 2 |
| T1 | `male_T1_tempo092` | 200 |
| T2 | `male_T2_tempo088` | 200 |

## 0. 시작 전 확인

```powershell
cd "C:\Users\Paul Park\Desktop\Claude Work\Naruve Pronunciation"
python -c "import typecast; print('SDK ok')"
ffmpeg -version | Select-Object -First 1
```

키는 환경변수 `TYPECAST_KEY`, 없으면 저장소 루트 `.env`의 `TYPECAST_KEY=` 한 줄에서
읽는다. `.env`는 `.gitignore`에 있다. 스크립트는 키를 찍지도 산출물에 남기지도 않는다.

## 1. dry-run — 호출 없이 계획만

아홉 줄을 그대로 붙여 넣는다. 크레딧이 나가지 않는다.

```powershell
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_A_normal"        --config scripts/tts/regen_20260918/cfg_fem_A_normal.json        --sentences scripts/tts/regen_20260918/sent_fem7.json          --voices scripts/tts/regen_20260918/voices_f.json --dry-run
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_B1_tonedown"     --config scripts/tts/regen_20260918/cfg_fem_B1_tonedown.json     --sentences scripts/tts/regen_20260918/sent_fem_tonedown.json  --voices scripts/tts/regen_20260918/voices_f.json --dry-run
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_B2_toneup"       --config scripts/tts/regen_20260918/cfg_fem_B2_toneup.json       --sentences scripts/tts/regen_20260918/sent_fem_toneup.json    --voices scripts/tts/regen_20260918/voices_f.json --dry-run
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_B3_tempo092"     --config scripts/tts/regen_20260918/cfg_fem_B3_tempo092.json     --sentences scripts/tts/regen_20260918/sent_fem_tempo.json     --voices scripts/tts/regen_20260918/voices_f.json --dry-run
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_C1_tonedown_i2"  --config scripts/tts/regen_20260918/cfg_fem_C1_tonedown_i2.json  --sentences scripts/tts/regen_20260918/sent_fem_tonedown.json  --voices scripts/tts/regen_20260918/voices_f.json --dry-run
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_C2_toneup_i2"    --config scripts/tts/regen_20260918/cfg_fem_C2_toneup_i2.json    --sentences scripts/tts/regen_20260918/sent_fem_toneup.json    --voices scripts/tts/regen_20260918/voices_f.json --dry-run
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_C3_tempo092_i2"  --config scripts/tts/regen_20260918/cfg_fem_C3_tempo092_i2.json  --sentences scripts/tts/regen_20260918/sent_fem_tempo.json     --voices scripts/tts/regen_20260918/voices_f.json --dry-run
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/male_T1_tempo092"    --config scripts/tts/regen_20260918/cfg_male_T1_tempo092.json    --sentences scripts/tts/regen_20260918/sent_all200.json        --voices scripts/tts/regen_20260918/voices_m.json --dry-run
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/male_T2_tempo088"    --config scripts/tts/regen_20260918/cfg_male_T2_tempo088.json    --sentences scripts/tts/regen_20260918/sent_all200.json        --voices scripts/tts/regen_20260918/voices_m.json --dry-run
```

각 줄이 이렇게 찍혀야 한다 (`fem_B3_tempo092` 예).

```
보이스 1 × 문장 2 = 2칸
문장 총 글자수 14 → 예상 크레딧 14 (글자당 1)
파라미터 emotion={'preset': 'normal', 'intensity': 1} pitch=None tempo=0.92
```

## 2. 실전 — `--dry-run` 만 뗀다

같은 아홉 줄에서 끝의 `--dry-run`만 지운다.

```powershell
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_A_normal"        --config scripts/tts/regen_20260918/cfg_fem_A_normal.json        --sentences scripts/tts/regen_20260918/sent_fem7.json          --voices scripts/tts/regen_20260918/voices_f.json
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_B1_tonedown"     --config scripts/tts/regen_20260918/cfg_fem_B1_tonedown.json     --sentences scripts/tts/regen_20260918/sent_fem_tonedown.json  --voices scripts/tts/regen_20260918/voices_f.json
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_B2_toneup"       --config scripts/tts/regen_20260918/cfg_fem_B2_toneup.json       --sentences scripts/tts/regen_20260918/sent_fem_toneup.json    --voices scripts/tts/regen_20260918/voices_f.json
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_B3_tempo092"     --config scripts/tts/regen_20260918/cfg_fem_B3_tempo092.json     --sentences scripts/tts/regen_20260918/sent_fem_tempo.json     --voices scripts/tts/regen_20260918/voices_f.json
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_C1_tonedown_i2"  --config scripts/tts/regen_20260918/cfg_fem_C1_tonedown_i2.json  --sentences scripts/tts/regen_20260918/sent_fem_tonedown.json  --voices scripts/tts/regen_20260918/voices_f.json
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_C2_toneup_i2"    --config scripts/tts/regen_20260918/cfg_fem_C2_toneup_i2.json    --sentences scripts/tts/regen_20260918/sent_fem_toneup.json    --voices scripts/tts/regen_20260918/voices_f.json
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/fem_C3_tempo092_i2"  --config scripts/tts/regen_20260918/cfg_fem_C3_tempo092_i2.json  --sentences scripts/tts/regen_20260918/sent_fem_tempo.json     --voices scripts/tts/regen_20260918/voices_f.json
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/male_T1_tempo092"    --config scripts/tts/regen_20260918/cfg_male_T1_tempo092.json    --sentences scripts/tts/regen_20260918/sent_all200.json        --voices scripts/tts/regen_20260918/voices_m.json
python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_regen_20260918/male_T2_tempo088"    --config scripts/tts/regen_20260918/cfg_male_T2_tempo088.json    --sentences scripts/tts/regen_20260918/sent_all200.json        --voices scripts/tts/regen_20260918/voices_m.json
```

### 크레딧

| 회차 | 파라미터 | 칸 | 글자 | 크레딧 |
|---|---|---:|---:|---:|
| `fem_A_normal` | normal 1.0 | 7 | 53 | 53 |
| `fem_B1_tonedown` | tonedown 1.0 | 2 | 16 | 16 |
| `fem_B2_toneup` | toneup 1.0 | 3 | 23 | 23 |
| `fem_B3_tempo092` | normal 1.0 · tempo 0.92 | 2 | 14 | 14 |
| `fem_C1_tonedown_i2` | tonedown 2.0 | 2 | 16 | 16 |
| `fem_C2_toneup_i2` | toneup 2.0 | 3 | 23 | 23 |
| `fem_C3_tempo092_i2` | normal 2.0 · tempo 0.92 | 2 | 14 | 14 |
| **여성 소계** | | **21** | | **159** |
| `male_T1_tempo092` | tempo 0.92 | 200 | 2,297 | 2,297 |
| `male_T2_tempo088` | tempo 0.88 | 200 | 2,297 | 2,297 |
| **남성 소계** | | **400** | | **4,594** |
| **합계** | | **421** | | **4,753** |

배치 1 직후 잔여가 192,067이었으므로 여유는 넉넉하다. 크레딧은 오늘의 제약이 아니다 —
제약은 구독 만료 시각과 사람이 듣고 고르는 시간이다.

**여성 일곱 줄을 먼저 돌리는 편이 낫다.** 159크레딧에 21칸이라 몇 분이면 끝나고,
`fem_B3`에서 `audio_tempo`가 실제로 먹는지를 `manifest.json`의 `audio_seconds`로
확인한 뒤 남성 400칸을 돌릴 수 있다. 순서는 정하기 나름이다.

## 3. 돌 때 알아야 할 것

- **회차마다 끝에서 40~62초 멈춘다.** 구독의 `used_credits`가 바로 오르지 않아
  값이 멈출 때까지 기다렸다 읽는다(`settle_credits`). 멈춘 것이 아니다.
- **재실행이 안전하다.** 이미 있고 크기가 0이 아닌 파일은 건너뛰고 크레딧도 안 나간다.
  끊기면 같은 줄을 다시 돌리면 된다.
- **덮어쓰지 않는다.** 뒤집어 말하면, 같은 폴더에 다시 만들고 싶으면 그 파일을 먼저 지워야 한다.
- 402(크레딧 부족)와 429 아닌 4xx는 즉시 멈춘다. 429·5xx는 지수 백오프로 재시도한다.
- 동시 호출은 4다. 라이트 플랜 한도 5 아래로 잡았다.
- 회차마다 `manifest.json` · `index.html` · `README.md` · 입력 사본(`config.used.json`,
  `sentences.json`, `voices.json`)과 폴더 옆에 zip이 생긴다.

## 4. 청취

각 회차 폴더의 `index.html`을 브라우저로 연다. 별점과 칸별 메모가 localStorage에
담기고 텍스트로 내보낼 수 있다. 회차마다 메모 키가 다르게(`naruve.tts.memo.20260918.femA` 등)
잡혀 있어 아홉 회차의 메모가 섞이지 않는다.

**현행 배포본이 진짜 대조군이다.** 지금 `docs/audio/f/`에 있는 파일은 prompt를 아예
넣지 않고 만든 것이라 안 A(`preset normal`)와 같지 않다. 나란히 들으려면 앱에서
그 문장을 재생하거나 `docs/audio/f/<hash>.mp3`를 직접 연다.

| id | hash | 문장 | 현행 파일 |
|---|---|---|---|
| `drm14` | `8677ebec` | 실화야? | `docs/audio/f/8677ebec.mp3` |
| `drm15` | `675c3419` | 그럴 줄 알았어. | `docs/audio/f/675c3419.mp3` |
| `drm16` | `180a5143` | 어이가 없네. | `docs/audio/f/180a5143.mp3` |
| `drm17` | `2eb4e88a` | 나 소름 돋았어. | `docs/audio/f/2eb4e88a.mp3` |
| `drm18` | `103f1346` | 장난 아니다. | `docs/audio/f/103f1346.mp3` |
| `drm19` | `db5b1db5` | 완전 신기해. | `docs/audio/f/db5b1db5.mp3` |
| `drm20` | `07607708` | 그게 무슨 말이야? | `docs/audio/f/07607708.mp3` |

남성은 회차 폴더 안에서 `id` 이름(`std01.mp3` … `snd30.mp3`)이고, 해시 대응은
`sent_all200.json`에 있다.

## 5. 고른 뒤 — 배치 절차

### 5-1. 정규화는 건너뛸 수 없다

지금 배포된 400개는 전부 ffmpeg loudnorm **2-pass**(I −16 LUFS / TP −1.5 dBTP)를
거친 것이다(0.1.24). 새로 만든 파일을 그냥 넣으면 **그 문장만 음량이 튄다.**
따라 할 표본의 크기가 흔들리는 것이 이 앱에서는 실제 손해다.

**⚠ `normalize_audio.py`를 회차 폴더에 바로 겨눌 수 없다.** 그 스크립트는
`manifest.json`의 **`records` 배열**을 읽는데(`normalize_audio.py:87-88`),
`typecast_gen.py`가 쓰는 `manifest.json`에는 `records`가 없다. `records`를 만드는 것은
`build_final.py`이고 그것은 배치 0 경로(`tts_typecast_v1_20260819`)와
`final_picks.json`의 배치 0 id에 묶여 있어 이 회차에 쓸 수 없다.

즉 **채택본을 모으는 폴더를 만들고 `records`를 손으로 채우는 단계가 하나 필요하다.**
`normalize_audio.py`가 요구하는 최소 모양은 이렇다 (`file`은 폴더 기준 상대경로).

```json
{ "records": [ { "voice": "이현", "file": "여_이현_20b74d/drm14.mp3" } ] }
```

`deploy_audio.py`까지 쓰려면 `hash`와 `text_screen`도 있어야 한다. 이 조립 스크립트는
아직 만들지 않았다 — 이번 지시 범위 밖이다.

정규화본은 `<원본>_norm` 폴더에 새로 쓰이고 원본은 그대로 남는다.

```powershell
python scripts/tts/normalize_audio.py --in "D:/aihub_work/tts_regen_20260918_adopted"
```

끝에 보이스별 I·TP·LRA 전/후 표가 찍힌다. **후 I가 −16 근처로 모여야 한다.**

### 5-2. 교체는 해시 파일만 손으로

`deploy_audio.py`는 쓰지 않는다. 기본 동작이 `docs/audio`의 mp3를 **전부 지우고**
`records` 전량으로 다시 까는 것이라(`deploy_audio.py:85-90`) 부분 교체 경로가 없다.
`--keep-old`를 줘도 마지막에 폴더와 목록이 다르다며 멈춘다.

**문장을 바꾸지 않았으므로 해시도 `index.json`도 그대로다.** 파일만 덮으면 된다.

```powershell
# 예 — 여성 drm14를 fem_B3 채택본으로 교체
Copy-Item "D:/aihub_work/tts_regen_20260918_adopted_norm/여_이현_20b74d/drm14.mp3" `
          "docs/audio/f/8677ebec.mp3" -Force
```

남성 200개를 통째로 바꾼다면 `sent_all200.json`의 `id`→`hash`로 200번 같은 일을 한다.

### 5-3. 바꾼 뒤 확인

```powershell
npm run check:docs                 # audio/index.json ↔ mp3 고아·미등록 대조
node scripts/tts/test_example_audio.js
npm run bump                       # docs/ 를 고쳤으므로 빌드번호를 올린다
```

`npm run bump`를 빠뜨리면 서비스워커 캐시 이름이 그대로라 **폰에서 옛 소리가 계속
난다.** 오디오는 `naruve-audio-v1` 캐시에 cache-first로 담기고 그 캐시는 빌드가
올라가도 지워지지 않으므로, 이미 받아 둔 기기에서는 캐시를 지워야 새 파일을 받는다.
확인할 때 이 점을 먼저 본다.

눈으로도 본다 — 바꾼 파일의 크기가 0이 아니고 이전과 다른가, 앱에서 그 문장이
실제로 새 소리로 나는가, 앞뒤 문장과 음량이 같은가.

### 5-4. 백업 세 곳 (DECISIONS 9.3)

**seed가 재현되지 않으므로 받은 mp3가 유일본이다.** 구독을 끊으면 다시 만들 수 없다.
이번 회차 폴더도 같은 규칙으로 보관한다.

- 로컬 `D:\aihub_work\tts_regen_20260918\` (원본 폴더 · 지우지 않는다)
- 저장소 밖 `Naruve Data\tts\` 의 zip
- R2 `naruve-ganada-audio` 의 `tts/` 접두어

## 6. 이 폴더에 있는 것

| 파일 | 무엇 |
|---|---|
| `cfg_*.json` | 회차별 config 9벌 |
| `sent_all200.json` | 문장 200 전부 (2,297자) |
| `sent_fem7.json` | 여성 대상 7문장 (53자) |
| `sent_fem_tonedown.json` | `drm15` `drm16` (16자) |
| `sent_fem_toneup.json` | `drm17` `drm18` `drm19` (23자) |
| `sent_fem_tempo.json` | `drm14` `drm20` (14자) |
| `voices_m.json` / `voices_f.json` | 보이스 하나씩. 한 회차가 반대 성별까지 만들지 않게 가른다 |

문장 목록은 전부 `node scripts/tts/extract_sentences.mjs`가 `docs/js/data.js`에서
뽑은 것이다. 손으로 고치지 않는다 — 고치려면 data.js를 고치고 다시 뽑는다.
