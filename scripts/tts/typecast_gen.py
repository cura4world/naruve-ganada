#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Typecast 청취 샘플 생성기 — DECISIONS.md 9절 TTS 벤더 선정용.

문장 목록 × 보이스 목록을 돌면서 {폴더}/{sentence_id}.{ext} 를 만든다.
언어·모델·포맷은 config.json, 보이스는 voices.json, 문장은 sentences.json에 있다.
이 파일에는 한국어도 특정 보이스도 박혀 있지 않다 — 다른 언어로 갈 때 설정만 바꾼다.

    python scripts/tts/typecast_gen.py --out "D:/aihub_work/tts_typecast_candidates_20260819"
    python scripts/tts/typecast_gen.py --out "..." --dry-run    # 호출 없이 계획만
    python scripts/tts/typecast_gen.py --out "..." --reindex    # 호출 없이 문서만 다시 만든다

키는 환경변수 TYPECAST_KEY(없으면 TYPECAST_API_KEY)에서 읽는다.
둘 다 없으면 저장소 루트의 .env에서 읽어 프로세스 환경에만 넣는다.
어느 경로로도 키를 찍거나 산출물에 남기지 않는다.

재실행 안전: 이미 있고 크기가 0이 아닌 파일은 건너뛴다.
부분 파일이 완성본으로 오해되지 않도록 .part로 받아서 rename 한다.
"""

import argparse
import json
import os
import random
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

# 라이트 플랜의 concurrency_limit이 5다. 설정이 더 큰 값을 줘도 여기서 막는다.
HARD_CONCURRENCY_CAP = 5


# ---------------------------------------------------------------- 키

def load_api_key():
    """환경변수 우선, 없으면 .env를 프로세스 환경에 올린다. 값은 반환만 하고 찍지 않는다."""
    for name in ("TYPECAST_KEY", "TYPECAST_API_KEY"):
        v = os.environ.get(name)
        if v and v.strip():
            return v.strip(), f"env:{name}"

    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k in ("TYPECAST_KEY", "TYPECAST_API_KEY") and v:
                os.environ.setdefault(k, v)
                return v, f".env:{k}"

    sys.exit(
        "TYPECAST_KEY를 찾을 수 없다.\n"
        "  환경변수로 넣거나, 저장소 루트 .env에 TYPECAST_KEY=... 한 줄을 둔다.\n"
        "  .env는 .gitignore에 있어야 한다."
    )


# ---------------------------------------------------------------- 설정

def load_json(path, label):
    p = Path(path)
    if not p.exists():
        sys.exit(f"{label} 파일이 없다: {p}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"{label} 파일 JSON 오류: {p}\n  {e}")


def slug(s):
    """폴더명에 못 쓰는 문자만 걷어낸다. 한글은 그대로 둔다 — 폰에서 이름을 보고 고르려는 것이므로."""
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", s).strip().rstrip(".")


def voice_dir_name(v):
    return f"{slug(v.get('gender_ko') or v['gender'])}_{slug(v['name'])}_{v['voice_id'][-6:]}"


def build_request(models, cfg, voice_id, text):
    """config의 null 항목은 요청에서 아예 뺀다. 기본 톤을 받기 위함이다."""
    out_kwargs = {}
    if cfg.get("audio_format"):
        out_kwargs["audio_format"] = cfg["audio_format"]
    for key in ("volume", "target_lufs", "audio_pitch", "audio_tempo"):
        if cfg.get(key) is not None:
            out_kwargs[key] = cfg[key]

    req_kwargs = {"text": text, "model": cfg["model"], "voice_id": voice_id}
    if cfg.get("language"):
        req_kwargs["language"] = cfg["language"]
    if cfg.get("seed") is not None:
        req_kwargs["seed"] = cfg["seed"]
    if out_kwargs:
        req_kwargs["output"] = models.Output(**out_kwargs)

    emotion = cfg.get("emotion")
    if emotion:
        req_kwargs["prompt"] = models.PresetPrompt(
            emotion_type="preset",
            emotion_preset=emotion.get("preset", "normal"),
            emotion_intensity=emotion.get("intensity", 1.0),
        )

    return models.TTSRequest(**req_kwargs)


# ---------------------------------------------------------------- 호출

_print_lock = threading.Lock()


def say(*a):
    with _print_lock:
        print(*a, flush=True)


def status_of(exc):
    code = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if isinstance(code, int):
        return code
    m = re.search(r"\b(4\d\d|5\d\d)\b", str(exc))
    return int(m.group(1)) if m else None


def synth_one(client, models, cfg, voice, sentence, out_root, ext):
    """한 칸을 만든다. (ok, skipped, note, duration)을 돌려준다."""
    vdir = out_root / voice_dir_name(voice)
    vdir.mkdir(parents=True, exist_ok=True)
    final = vdir / f"{sentence['id']}.{ext}"

    if final.exists() and final.stat().st_size > 0:
        return True, True, "skip", None

    part = final.with_suffix(final.suffix + ".part")
    last = None

    for attempt in range(1, int(cfg.get("max_retries", 4)) + 1):
        try:
            resp = client.text_to_speech(
                build_request(models, cfg, voice["voice_id"], sentence["text"])
            )
            data = resp.audio_data
            if not data:
                raise RuntimeError("빈 audio_data")
            part.write_bytes(data)
            part.replace(final)
            return True, False, f"{len(data)}B", getattr(resp, "duration", None)

        except Exception as e:  # noqa: BLE001 — 벤더 예외 종류에 기대지 않는다
            last = e
            code = status_of(e)
            if code == 402:
                say(f"  [402] 크레딧 부족 — 중단: {voice['name']}/{sentence['id']}")
                break
            if code is not None and 400 <= code < 500 and code != 429:
                break  # 요청 자체가 틀렸다. 재시도해도 같다
            if attempt < int(cfg.get("max_retries", 4)):
                delay = float(cfg.get("retry_base_sec", 2.0)) * (2 ** (attempt - 1))
                delay += random.uniform(0, 0.5)
                say(f"  [{code or 'err'}] 재시도 {attempt} — {voice['name']}/{sentence['id']} ({delay:.1f}s)")
                time.sleep(delay)

    if part.exists():
        part.unlink(missing_ok=True)
    return False, False, f"{status_of(last) or 'err'}: {last}", None


# ---------------------------------------------------------------- 길이 실측

def measure_seconds(out_root, ext):
    """ffprobe로 총 재생 길이를 잰다. 과금이 길이 기준이므로 단가 산출의 근거가 된다.
    ffprobe가 없으면 None을 돌려주고, 문서에서는 그 줄을 비운다 — 추정치를 쓰지 않는다."""
    if not shutil.which("ffprobe"):
        return None
    total = 0.0
    for f in sorted(out_root.rglob(f"*.{ext}")):
        try:
            r = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(f)],
                capture_output=True, text=True, timeout=30,
            )
            total += float(r.stdout.strip())
        except Exception:  # noqa: BLE001
            return None
    return round(total, 2)


# ---------------------------------------------------------------- 산출물

def write_index_html(out_root, sentences, voices, ext, cfg, meta):
    """행=문장, 열=보이스. 외부 리소스 없이 상대경로만 쓴다."""
    esc = lambda s: (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

    head = "".join(
        f'<th><div class="vn">{esc(v["name"])}</div>'
        f'<div class="vg">{esc(v.get("gender_ko") or v["gender"])}</div>'
        f'<div class="vid">{esc(v["voice_id"][-6:])}</div></th>'
        for v in voices
    )

    rows = []
    for s in sentences:
        cells = []
        for v in voices:
            src = f'{voice_dir_name(v)}/{s["id"]}.{ext}'
            cells.append(f'<td><audio controls preload="none" src="{esc(src)}"></audio></td>')
        rows.append(
            '<tr><th class="sent">'
            f'<div class="sid">{esc(s["id"])} · {esc(s.get("type",""))}</div>'
            f'<div class="stx">{esc(s["text"])}</div>'
            f'<div class="swy">{esc(s.get("why",""))}</div>'
            "</th>" + "".join(cells) + "</tr>"
        )

    html = f"""<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Typecast 후보 보이스 청취 — {esc(meta['generated'][:10])}</title>
<style>
:root {{ --ink:#111A22; --paper:#FBFAF6; --seal:#C0392F; --line:#dcd8cd; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; padding:12px; background:var(--paper); color:var(--ink);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }}
h1 {{ font-size:17px; margin:0 0 4px; }}
p.meta {{ font-size:12px; color:#5b6670; margin:0 0 12px; line-height:1.6; }}
.wrap {{ overflow-x:auto; -webkit-overflow-scrolling:touch;
  border:1px solid var(--line); border-radius:8px; background:#fff; }}
table {{ border-collapse:separate; border-spacing:0; }}
th,td {{ border-bottom:1px solid var(--line); border-right:1px solid var(--line);
  padding:8px; vertical-align:middle; }}
thead th {{ position:sticky; top:0; z-index:3; background:#f3f0e8; text-align:center;
  min-width:150px; }}
th.sent {{ position:sticky; left:0; z-index:2; background:#fff; text-align:left;
  min-width:210px; max-width:210px; }}
thead th:first-child {{ z-index:4; background:#f3f0e8; }}
.vn {{ font-weight:700; font-size:14px; }}
.vg {{ font-size:11px; color:var(--seal); }}
.vid {{ font-size:10px; color:#8b939a; font-family:ui-monospace,monospace; }}
.sid {{ font-size:10px; color:#8b939a; font-family:ui-monospace,monospace; }}
.stx {{ font-size:14px; font-weight:600; margin:2px 0; line-height:1.45; }}
.swy {{ font-size:11px; color:#5b6670; line-height:1.4; }}
audio {{ width:145px; height:34px; }}
tbody tr:nth-child(even) th.sent, tbody tr:nth-child(even) td {{ background:#faf8f3; }}
</style>
<h1>Typecast 후보 보이스 {len(voices)}개 × 문장 {len(sentences)}개</h1>
<p class="meta">
모델 {esc(cfg['model'])} · 언어 {esc(cfg.get('language') or 'auto')} · {esc(ext)} ·
감정/속도 기본값(요청에 넣지 않음)<br>
생성 {esc(meta['generated'])} · 사용 크레딧 {esc(meta.get('credits_used', '?'))}<br>
가로로 밀면 보이스가 더 있다. 왼쪽 문장 칸은 고정된다.
</p>
<div class="wrap"><table>
<thead><tr><th class="sent">문장</th>{head}</tr></thead>
<tbody>{''.join(rows)}</tbody>
</table></div>
</html>
"""
    (out_root / "index.html").write_text(html, encoding="utf-8")


def write_out_readme(out_root, sentences, voices, ext, cfg, meta):
    failures = meta.get("failures") or []
    rows = "\n".join(
        f"| {v.get('gender_ko') or v['gender']} | {v['name']} | `{v['voice_id']}` | `{voice_dir_name(v)}` |"
        for v in voices
    )
    srows = "\n".join(
        f"| `{s['id']}` | {s.get('collection','')} | {s.get('type','')} | {len(s['text'])} | {s['text']} |"
        for s in sentences
    )
    fail_block = (
        f"실패 없음. {meta.get('cells','?')}칸 전부 생성됐다."
        if not failures
        else "\n".join(f"- `{f['voice']}` / `{f['sentence']}` — {f['note']}" for f in failures)
    )

    secs = meta.get("audio_seconds")
    used = meta.get("credits_used")
    chars = sum(len(s["text"]) for s in sentences)

    if secs and isinstance(used, int) and used > 0:
        per_sec = used / secs
        per_char = used / (chars * len(voices))
        rate_block = f"""실행 전후 구독 조회로 잰 실제 차감은 **{used}**이고,
ffprobe로 잰 총 재생 길이는 **{secs}초**다. 나누면 **초당 {per_sec:.2f} 크레딧**이다.

글자수 기준으로 보면 {chars}자 × {len(voices)}보이스 = {chars*len(voices)}자에 {used}이므로
**글자당 약 {per_char:.2f}**다. 즉 "글자당 1"은 실제보다 두 배 넘게 비싸게 잡는 값이다.

**과금 기준은 글자수가 아니라 오디오 길이다.** 근거: 12개 보이스에 넣은 텍스트가
완전히 같은데도 총 차감이 12로 나눠떨어지지 않는다({used} ÷ 12 = {used/len(voices):.2f}).
텍스트 기반이라면 보이스마다 값이 같아야 하므로 나눠떨어져야 한다.
길이 × 3으로 계산하면 {secs} × 3 = {secs*3:.1f}이고, 실제와 {abs(secs*3-used)/used*100:.1f}% 차이다.

이 규칙은 Typecast 문서에 적혀 있지 않다. 이 실행 한 번에서 얻은 실측이다.
`config.json`의 `credits_per_char`는 실행 전 잔량 확인용 상한이라 1로 둔다 —
넉넉하게 잡아야 중간에 402로 끊기지 않는다."""
        avg = secs / len(voices) / len(sentences)
        proj = f"""
## 문장 1000개로 갈 때 (DECISIONS 9절 기준 4 — 단가)

이 {len(sentences)}문장의 평균 길이는 보이스 평균 {avg:.2f}초다.
문장 1000개를 보이스 하나로 읽히면 약 {avg*1000:.0f}초이고,
초당 {per_sec:.2f}를 곱하면 **약 {avg*1000*per_sec:,.0f} 크레딧**이다.
이번 실행 뒤 남은 {meta.get('credits_after_remaining',0):,} 안에 들어간다.

단, 이 평균은 `s08`(38자)이 섞인 값이라 실제 문장 분포와 다를 수 있다. 추정이다."""
    else:
        rate_block = ("길이를 재지 못해(ffprobe 없음) 초당 단가를 내지 않았다. "
                      f"실제 차감은 {used}다.")
        proj = ""

    md = f"""# Typecast 후보 보이스 청취 샘플 ({meta['generated'][:10]})

DECISIONS.md 9절 TTS 벤더 선정용. 사람이 듣고 2개를 고르기 위한 자료다.
**여기서는 품질 판단을 하지 않는다.**

## 어떻게 듣나

`index.html`을 브라우저로 연다. 행이 문장, 열이 보이스이고 칸마다 재생 버튼이 있다.
외부 리소스를 쓰지 않으므로 zip을 풀어 그대로 열면 된다.
가로로 밀면 보이스가 더 나오고, 왼쪽 문장 칸은 고정된다.

## 생성 조건

| 항목 | 값 |
|---|---|
| 엔진 | Typecast API (공식 Python SDK `typecast-python` {meta.get('sdk_version','?')}) |
| 모델 | `{cfg['model']}` |
| 언어 | `{cfg.get('language') or '(자동 판별)'}` (ISO 639-3) |
| 포맷 | {ext} {meta.get('format_note','')} |
| 감정·속도 | 넣지 않음 — 표준 톤 확인이 목적 |
| 플랜 | {meta.get('plan','?')} |
| 동시 호출 | {meta.get('concurrency','?')} |
| 칸 | {len(sentences)} × {len(voices)} = {meta.get('cells','?')} |
| 소요 | {meta.get('elapsed_sec','?')}초 |
| 총 재생 길이 | {secs if secs else '(측정 못 함)'}초 |

## 크레딧 — 실측

| 항목 | 값 |
|---|---|
| 실행 전 잔량 | {meta.get('credits_before_remaining','?'):,} |
| 실행 후 잔량 | {meta.get('credits_after_remaining','?'):,} |
| **실제 차감** | **{used}** |
| 글자당 1로 잡은 사전 추정 | {meta.get('credits_estimate','?'):,} |

{rate_block}
{proj}

## 라이선스

**라이트 플랜 출력물은 상업 이용 가능하다. 단 구독 기간 안에 다운로드를 마쳐야 한다**
(Typecast 고객센터 회신 2026-08-19). 이 폴더가 그 다운로드본이다. 지우지 않는다.

## 보이스 {len(voices)}

| 성별 | 이름 | voice_id | 폴더 |
|---|---|---|---|
{rows}

## 문장 {len(sentences)}

10개는 저장소 `docs/js/data.js`에서 골랐고, `s01`·`s03`·`s08`은 2026-08-18 Azure
비교와 맞추기 위한 대조용이다. `s08`은 data.js에 없는 문장이다.

고른 기준은 4컬렉션 골고루 / 의문·감탄·평서·15자 이상이 각 2개 이상이다.
감탄은 data.js 전체에 `대박!`과 `말도 안 돼!` 둘뿐이고 후자가 `s03`이라,
10개 안에서는 1개이고 {len(sentences)}개 전체에서 2개다.

| id | 컬렉션 | 유형 | 자수 | 문장 |
|---|---|---|---:|---|
{srows}

## 실패

{fail_block}

검증: 파일 없음 {len(meta.get('missing',[]))}건 / 크기 0 {len(meta.get('empty',[]))}건.

## 재현

```
python scripts/tts/typecast_gen.py --out "{out_root.as_posix()}"
```

저장소 `scripts/tts/`의 `config.json`·`voices.json`·`sentences.json`이 입력이고,
같은 사본이 이 폴더의 `manifest.json`·`sentences.json`·`voices.json`에 있다.
이미 있는 파일은 건너뛰므로 다시 돌려도 크레딧이 나가지 않는다.
문서만 다시 만들려면 `--reindex`를 붙인다.
"""
    (out_root / "README.md").write_text(md, encoding="utf-8")


def write_input_copies(out_root, sentences, voices):
    """입력 사본을 산출물 옆에 남긴다. 저장소의 파일이 나중에 바뀌어도 이 폴더가 무엇으로
    만들어졌는지 남아 있어야 한다 (CLAUDE.md '평가 산출물' — 설정 전체를 같은 위치에)."""
    (out_root / "sentences.json").write_text(
        json.dumps({"sentences": sentences}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_root / "voices.json").write_text(
        json.dumps({"voices": voices}, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def make_zip(out_root, zip_path):
    zip_path = Path(zip_path)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out_root.rglob("*")):
            if p.is_file() and p.suffix != ".part" and p.resolve() != zip_path.resolve():
                z.write(p, p.relative_to(out_root).as_posix())
    return zip_path


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Typecast 청취 샘플 생성")
    ap.add_argument("--out", required=True, help="출력 폴더")
    ap.add_argument("--sentences", default=str(HERE / "sentences.json"))
    ap.add_argument("--voices", default=str(HERE / "voices.json"))
    ap.add_argument("--config", default=str(HERE / "config.json"))
    ap.add_argument("--jobs", type=int, default=None, help="동시 호출 수 (config를 덮어쓴다)")
    ap.add_argument("--dry-run", action="store_true", help="호출하지 않고 계획만 본다")
    ap.add_argument("--reindex", action="store_true",
                    help="호출 없이 manifest.json으로 index.html·README.md·zip만 다시 만든다")
    ap.add_argument("--no-index", action="store_true", help="index.html·README.md를 만들지 않는다")
    ap.add_argument("--zip", default=None, help="zip 경로 (기본: 출력 폴더 옆 <이름>.zip)")
    ap.add_argument("--no-zip", action="store_true")
    args = ap.parse_args()

    cfg = load_json(args.config, "config")
    voices = load_json(args.voices, "voices")["voices"]
    sentences = load_json(args.sentences, "sentences")["sentences"]
    ext = cfg.get("audio_format", "wav")

    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)

    total_chars = sum(len(s["text"]) for s in sentences)
    cells = len(sentences) * len(voices)
    est = total_chars * len(voices) * int(cfg.get("credits_per_char", 1))

    # 폴더명이 겹치면 파일을 덮어쓰게 된다. 시작 전에 막는다.
    names = [voice_dir_name(v) for v in voices]
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        sys.exit(f"보이스 폴더명이 겹친다: {sorted(dup)}")

    # ---- reindex: 호출 없이 문서만
    if args.reindex:
        mpath = out_root / "manifest.json"
        if not mpath.exists():
            sys.exit(f"manifest.json이 없다: {mpath}. 먼저 한 번 생성해야 한다.")
        meta = json.loads(mpath.read_text(encoding="utf-8"))
        secs = measure_seconds(out_root, ext)
        if secs:
            meta["audio_seconds"] = secs
        meta["reindexed"] = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
        mpath.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        write_input_copies(out_root, sentences, voices)
        write_index_html(out_root, sentences, voices, ext, cfg, meta)
        write_out_readme(out_root, sentences, voices, ext, cfg, meta)
        zp = None if args.no_zip else make_zip(out_root, args.zip or out_root.parent / f"{out_root.name}.zip")
        print(f"reindex 완료 · 총 길이 {secs}초 · 문서 다시 씀")
        if zp:
            print(f"zip {zp} ({zp.stat().st_size/1e6:.2f} MB)")
        return 0

    print(f"보이스 {len(voices)} × 문장 {len(sentences)} = {cells}칸")
    print(f"문장 총 글자수 {total_chars} → 예상 크레딧 상한 {est} (글자당 {cfg.get('credits_per_char',1)})")
    print(f"모델 {cfg['model']} · 언어 {cfg.get('language') or '(자동)'} · {ext}")
    print(f"출력 {out_root}")

    if args.dry_run:
        print("\n--dry-run — 호출하지 않는다.")
        for v in voices:
            todo = sum(1 for s in sentences
                       if not (out_root / voice_dir_name(v) / f"{s['id']}.{ext}").exists())
            print(f"  {voice_dir_name(v):28} 남은 칸 {todo}/{len(sentences)}")
        return 0

    api_key, key_src = load_api_key()
    print(f"키 출처 {key_src} (값은 찍지 않는다)")

    try:
        from typecast import Typecast
        from typecast import models as tc_models
    except ImportError:
        sys.exit("SDK가 없다: python -m pip install --upgrade typecast-python")

    try:
        from importlib.metadata import version as _v
        sdk_version = _v("typecast-python")
    except Exception:  # noqa: BLE001
        sdk_version = "?"

    client = Typecast(api_key=api_key)

    sub_before = client.get_my_subscription()
    plan = str(sub_before.plan)
    before_used = sub_before.credits.used_credits
    before_remaining = sub_before.credits.plan_credits - before_used
    limit = getattr(sub_before.limits, "concurrency_limit", HARD_CONCURRENCY_CAP)
    print(f"플랜 {plan} · 잔량 {before_remaining} · 동시 한도 {limit}")

    if before_remaining < est:
        sys.exit(f"크레딧이 모자란다: 잔량 {before_remaining} < 상한 추정 {est}. 중단한다.")

    # 보이스 ID가 이 모델에서 실제로 쓸 수 있는지 먼저 확인한다. 156칸을 돌다가 400을 맞지 않기 위함.
    try:
        catalog = client.voices_v2(tc_models.VoicesV2Filter(model=cfg["model"]))
        known = {v.voice_id for v in catalog}
        unknown = [v["name"] for v in voices if v["voice_id"] not in known]
        if unknown:
            sys.exit(f"{cfg['model']}에서 못 찾은 보이스: {unknown}. voices.json을 확인한다.")
        print(f"보이스 {len(voices)}개 전부 {cfg['model']} 카탈로그에 있다.")
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — 카탈로그 조회 실패가 생성을 막을 이유는 없다
        print(f"보이스 사전 확인 건너뜀 ({e})")

    jobs = args.jobs or int(cfg.get("concurrency", 4))
    jobs = max(1, min(jobs, int(limit or HARD_CONCURRENCY_CAP), HARD_CONCURRENCY_CAP))
    print(f"동시 {jobs}로 시작\n")

    tasks = [(v, s) for v in voices for s in sentences]
    ok = skipped = 0
    failures = []
    api_durations = {}
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=jobs) as ex:
        futs = {
            ex.submit(synth_one, client, tc_models, cfg, v, s, out_root, ext): (v, s)
            for v, s in tasks
        }
        done = 0
        for fut in as_completed(futs):
            v, s = futs[fut]
            done += 1
            good, was_skip, note, dur = fut.result()
            if dur is not None:
                api_durations[f"{voice_dir_name(v)}/{s['id']}"] = dur
            if good and was_skip:
                skipped += 1
            elif good:
                ok += 1
            else:
                failures.append({"voice": voice_dir_name(v), "sentence": s["id"], "note": note})
                say(f"  실패 {voice_dir_name(v)}/{s['id']} — {note}")
            if done % 20 == 0 or done == len(tasks):
                say(f"  {done}/{len(tasks)}  (생성 {ok} / 건너뜀 {skipped} / 실패 {len(failures)})")

    elapsed = round(time.time() - t0, 1)

    sub_after = client.get_my_subscription()
    after_used = sub_after.credits.used_credits
    after_remaining = sub_after.credits.plan_credits - after_used
    credits_used = after_used - before_used

    # 검증 — 파일이 실제로 있고 크기가 0이 아닌가
    missing, empty = [], []
    for v in voices:
        for s in sentences:
            f = out_root / voice_dir_name(v) / f"{s['id']}.{ext}"
            if not f.exists():
                missing.append(f"{voice_dir_name(v)}/{s['id']}")
            elif f.stat().st_size == 0:
                empty.append(f"{voice_dir_name(v)}/{s['id']}")

    audio_seconds = measure_seconds(out_root, ext)

    meta = {
        "generated": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sdk": "typecast-python",
        "sdk_version": sdk_version,
        "plan": plan,
        "model": cfg["model"],
        "language": cfg.get("language"),
        "format": ext,
        "format_note": "(320kbps / 44100Hz)" if ext == "mp3" else "(16bit mono PCM / 44100Hz)",
        "concurrency": jobs,
        "elapsed_sec": elapsed,
        "cells": cells,
        "generated_count": ok,
        "skipped_count": skipped,
        "failed_count": len(failures),
        "failures": failures,
        "missing": missing,
        "empty": empty,
        "total_chars": total_chars,
        "credits_estimate": est,
        "credits_used": credits_used,
        "credits_plan_total": sub_after.credits.plan_credits,
        "credits_before_remaining": before_remaining,
        "credits_after_remaining": after_remaining,
        "audio_seconds": audio_seconds,
        "api_durations": api_durations,
        "config": {k: v for k, v in cfg.items() if not k.startswith("_")},
    }
    (out_root / "manifest.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_input_copies(out_root, sentences, voices)

    if not args.no_index:
        write_index_html(out_root, sentences, voices, ext, cfg, meta)
        write_out_readme(out_root, sentences, voices, ext, cfg, meta)

    zip_path = None
    if not args.no_zip:
        zip_path = make_zip(out_root, args.zip or out_root.parent / f"{out_root.name}.zip")

    print(f"\n생성 {ok} / 건너뜀 {skipped} / 실패 {len(failures)}  — {elapsed}초")
    print(f"크레딧 사용 {credits_used} (상한 추정 {est}) · 남은 {after_remaining}")
    if audio_seconds:
        print(f"총 재생 {audio_seconds}초 → 초당 {credits_used/audio_seconds:.2f} 크레딧")
    print(f"검증: 없음 {len(missing)} / 빈 파일 {len(empty)}")
    if zip_path:
        print(f"zip {zip_path} ({zip_path.stat().st_size/1e6:.2f} MB)")

    return 1 if (failures or missing or empty) else 0


if __name__ == "__main__":
    sys.exit(main())
