#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
확정본 모으기 — v1 원본과 fix1 손질본에서 골라 앱이 찾는 이름으로 모은다.

    python scripts/tts/build_final.py --out "D:/aihub_work/tts_typecast_final_20260819"

무엇이 어디서 왔는지는 `final_picks.json` 하나에 적혀 있다. 거기 적힌 (보이스, 문장)
쌍만 fix1의 변형을 쓰고 나머지는 v1 원본을 쓴다.

**파일명은 문장 해시다.** `docs/js/audio.js`의 `audioName()`이 한국어 원문 `k`에서
뽑는 FNV-1a 8자리와 같은 값이고, 앱은 그 이름으로만 파일을 찾는다. 문장 id로
두면 앱이 못 찾는다.

**seed는 재현되지 않는다.** 여기 모은 mp3가 유일본이다 — 지우면 되살릴 수 없다.
그래서 이 스크립트는 옮기지 않고 **복사**하고, 원본 폴더를 건드리지 않는다.

생성하지 않으므로 크레딧이 나가지 않는다.
"""

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from typecast_gen import (  # noqa: E402
    INDEX_CSS, INDEX_JS, MEMO_KEY_PREFIX, voice_dir_name,
)


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def sha256_of(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def dur_of(p):
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(p)],
            capture_output=True, text=True, timeout=30)
        return round(float(r.stdout.strip()), 2)
    except Exception:  # noqa: BLE001
        return None


def audio_hash(k):
    """docs/js/audio.js audioName() 과 같은 계산. 한 글자도 달라지면 앱이 파일을 못 찾는다."""
    h = 0x811c9dc5
    for ch in k:
        h ^= ord(ch)
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) & 0xFFFFFFFF
    return f"{h:08x}"


def main():
    ap = argparse.ArgumentParser(description="확정본 100개 모으기")
    ap.add_argument("--out", required=True)
    ap.add_argument("--v1", default="D:/aihub_work/tts_typecast_v1_20260819")
    ap.add_argument("--fix", default=None, help="기본: <v1>/fix1")
    ap.add_argument("--picks", default=str(HERE / "final_picks.json"))
    ap.add_argument("--voices", default=str(HERE / "voices.json"))
    ap.add_argument("--zip", default=None)
    ap.add_argument("--no-zip", action="store_true")
    args = ap.parse_args()

    v1 = Path(args.v1)
    fix = Path(args.fix) if args.fix else v1 / "fix1"
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    sents = json.loads((v1 / "sentences.json").read_text(encoding="utf-8"))["sentences"]
    voices = json.loads(Path(args.voices).read_text(encoding="utf-8"))["voices"]
    picks = json.loads(Path(args.picks).read_text(encoding="utf-8"))["picks"]
    fixspec = json.loads((fix / "variants.json").read_text(encoding="utf-8"))["variants"]
    v1voices = {v["name"]: voice_dir_name(v)
                for v in json.loads((v1 / "voices.json").read_text(encoding="utf-8"))["voices"]}

    # fix1 변형을 (보이스, 문장, 열)로 찾을 수 있게 편다. 감정 변형은 이름이 제각각이라 emo로 모은다.
    fixcell = {}
    for v in fixspec:
        col = "emo" if v["variant"].startswith("emo") else v["variant"]
        fixcell[(v["voice"], v["src_id"], col)] = v

    # 해시가 audio.js와 맞는지 여기서 다시 확인한다. 안 맞으면 앱이 전부 못 찾는다.
    bad = [s["id"] for s in sents if audio_hash(s["k"]) != s.get("hash")]
    if bad:
        sys.exit(f"sentences.json의 hash가 audio.js 계산과 다르다: {bad}")
    seen = {}
    for s in sents:
        seen.setdefault(s["hash"], []).append(s["id"])
    clash = {h: ids for h, ids in seen.items() if len(ids) > 1}
    if clash:
        sys.exit(f"해시 충돌 — 두 문장이 같은 파일을 가리킨다: {clash}")

    records, problems = [], []
    for vo in voices:
        vname = vo["name"]
        vdir = voice_dir_name(vo)
        if vname not in v1voices:
            sys.exit(f"v1에 없는 보이스: {vname}")
        (out / vdir).mkdir(parents=True, exist_ok=True)
        vpicks = picks.get(vname, {})

        unknown = [sid for sid in vpicks if sid not in {s["id"] for s in sents}]
        if unknown:
            sys.exit(f"{vname}: 없는 문장 id를 골랐다: {unknown}")

        for s in sents:
            sid, k, h = s["id"], s["k"], s["hash"]
            col = vpicks.get(sid)
            if col:
                fv = fixcell.get((vname, sid, col))
                if not fv:
                    problems.append(f"{vname}/{sid}: fix1에 '{col}' 변형이 없다")
                    continue
                src = fix / v1voices[vname] / f"{fv['id']}.mp3"
                origin = f"fix1/{fv['variant']}"
                seed = fv.get("seed")
                tts = fv["tts"]
                params = fv.get("params") or {}
                note = fv.get("tweak_note")
            else:
                src = v1 / v1voices[vname] / f"{sid}.mp3"
                origin = "v1"
                seed = None
                tts = s.get("tts") or k
                params = {}
                note = None

            if not src.exists() or src.stat().st_size == 0:
                problems.append(f"{vname}/{sid}: 원본이 없거나 비었다 — {src}")
                continue

            dst = out / vdir / f"{h}.mp3"
            shutil.copy2(src, dst)
            records.append({
                "voice": vname, "voice_dir": vdir,
                "sentence_id": sid, "hash": h, "file": f"{vdir}/{h}.mp3",
                "collection": s["collection"], "type": s["type"],
                "text_screen": k, "text_tts": tts, "text_changed": tts != k,
                "tweak_note": note,
                "origin": origin, "origin_file": str(src),
                "seed": seed, "params": params,
                "bytes": dst.stat().st_size,
                "seconds": dur_of(dst),
                "sha256": sha256_of(dst),
            })

    if problems:
        print("멈춘다 — 해결하지 않고 넘어가지 않는다:")
        for p in problems:
            print("  " + p)
        return 1

    want = len(sents) * len(voices)
    if len(records) != want:
        print(f"파일 수가 안 맞는다: {len(records)} / {want}")
        return 1

    # ---- index.html (행=문장, 열=보이스)
    memo_key = MEMO_KEY_PREFIX + datetime.now().strftime("%Y%m%d") + ".final"
    byv = {(r["voice"], r["sentence_id"]): r for r in records}

    heads = "".join(
        f'<th><div class="vn">{esc(vo["name"])}</div>'
        f'<div class="vg">{esc(vo.get("gender_ko") or vo["gender"])} · {esc(vo["voice_id"][-6:])}</div>'
        f'<div class="stars" role="radiogroup" aria-label="{esc(vo["name"])} 별점" '
        f'data-vid="{esc(vo["voice_id"])}">'
        + "".join(f'<button type="button" class="st" role="radio" aria-checked="false" '
                  f'data-v="{n}" title="{n}점">\u2606</button>' for n in range(1, 6))
        + '<button type="button" class="stclr" title="별점 지움">\u00d7</button></div>'
        f'<textarea class="vmemo" rows="3" data-vid="{esc(vo["voice_id"])}" '
        f'placeholder="{esc(vo["name"])} 전체 인상"></textarea></th>'
        for vo in voices
    )

    trs = []
    for s in sents:
        tds = []
        for vo in voices:
            r = byv[(vo["name"], s["id"])]
            mark = "" if r["origin"] == "v1" else f'<div class="cnote">{esc(r["origin"])}</div>'
            tds.append(
                "<td>"
                f'<audio controls preload="none" src="{esc(r["file"])}"></audio>'
                f'{mark}'
                f'<div class="cdur">{r["seconds"]}s · {esc(r["hash"])}</div>'
                f'<input class="smemo" type="text" data-vid="{esc(vo["voice_id"])}" '
                f'data-sid="{esc(s["id"])}" placeholder="한 줄 메모">'
                "</td>"
            )
        trs.append(
            '<tr><th class="sent">'
            f'<div class="sid">{esc(s["id"])} · {esc(s["type"])} · {esc(s["hash"])}</div>'
            f'<div class="stx">{esc(s["k"])}</div>'
            f'<div class="swy">{esc(s.get("why",""))}</div>'
            "</th>" + "".join(tds) + "</tr>"
        )

    def jdump(o):
        return json.dumps(o, ensure_ascii=False).replace("</", "<\\/")

    data_js = (
        "const KEY=" + jdump(memo_key) + ";\n"
        "const VOICES=" + jdump([{"id": v["voice_id"], "label": f"{v.get('gender_ko') or v['gender']}_{v['name']}",
                                  "name": v["name"]} for v in voices]) + ";\n"
        "const SENTS=" + jdump([{"id": s["id"]} for s in sents]) + ";\n"
    )

    n_fix = sum(1 for r in records if r["origin"] != "v1")
    html = f"""<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Naruve 예시 음성 확정본 — {esc(datetime.now().strftime('%Y-%m-%d'))}</title>
<style>{INDEX_CSS}
.cnote {{ font-size:11px; color:var(--seal); line-height:1.35; margin-top:3px; }}
.cdur {{ font-size:10px; color:#8b939a; font-family:ui-monospace,monospace; margin-top:2px; }}
</style>

<h1>예시 음성 확정본 — 문장 {len(sents)} × 보이스 {len(voices)} = {len(records)}개</h1>
<p class="meta">
파일명은 문장 해시다(`audio.js` audioName과 같은 값). 앱이 그 이름으로 찾는다.<br>
{len(records) - n_fix}개는 v1 원본 그대로, <b>{n_fix}개는 fix1 손질본</b>이고 칸에 어느 변형인지 적혀 있다.
</p>
<p class="warn">
<b>seed는 재현되지 않는다. 이 파일들이 유일본이다.</b> 지우면 되살릴 수 없고,
같은 seed로 다시 만들어도 다른 소리가 난다. 백업 두 곳을 유지한다.
</p>
<div class="bar">
  <button type="button" id="exp">메모 내보내기</button>
  <button type="button" id="imp">메모 불러오기</button>
  <button type="button" id="clr" class="danger">메모 전체 삭제</button>
  <span id="stat"></span>
</div>
<div id="imppanel" hidden>
  <p>내보내기로 만든 텍스트를 그대로 붙여넣고 <b>채우기</b>를 누른다.</p>
  <textarea id="imptext" placeholder="# TTS 후보 청취 메모 (...)"></textarea>
  <div class="bar" style="margin-top:8px">
    <button type="button" id="impok">채우기</button>
    <button type="button" id="impcancel">취소</button>
  </div>
</div>

<div class="wrap"><table>
<thead><tr><th class="sent">문장</th>{heads}</tr></thead>
<tbody>{''.join(trs)}</tbody>
</table></div>

<script>
{data_js}{INDEX_JS}
</script>
</html>
"""
    (out / "index.html").write_text(html, encoding="utf-8")

    total_bytes = sum(r["bytes"] for r in records)
    total_sec = round(sum(r["seconds"] or 0 for r in records), 2)
    meta = {
        "generated": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "built_by": "scripts/tts/build_final.py",
        "sources": {"v1": str(v1), "fix1": str(fix)},
        "picks_file": str(Path(args.picks).name),
        "memo_key": memo_key,
        "voices": [{"name": v["name"], "gender_ko": v.get("gender_ko"),
                    "voice_id": v["voice_id"], "dir": voice_dir_name(v)} for v in voices],
        "sentences": len(sents),
        "files": len(records),
        "from_v1": len(records) - n_fix,
        "from_fix1": n_fix,
        "total_bytes": total_bytes,
        "total_seconds": total_sec,
        "hash_note": ("파일명은 docs/js/audio.js audioName()과 같은 FNV-1a 8자리다. "
                      "화면 텍스트 k가 바뀌면 해시가 바뀌고 앱은 그 문장을 TTS 폴백으로 읽는다."),
        "seed_note": ("seed는 재현되지 않는다(2026-08-19 실측). 이 파일들이 유일본이다. "
                      "지우면 같은 소리를 다시 만들 수 없다."),
        "records": records,
    }
    (out / "manifest.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # sha256 목록 — 백업본과 대조할 때 쓴다
    (out / "SHA256SUMS.txt").write_text(
        "".join(f"{r['sha256']}  {r['file']}\n" for r in sorted(records, key=lambda x: x["file"])),
        encoding="utf-8")

    readme = f"""# Naruve 예시 음성 확정본 ({datetime.now().strftime('%Y-%m-%d')})

문장 {len(sents)}개 × 보이스 {len(voices)}개 = **mp3 {len(records)}개**.
{len(records)-n_fix}개는 v1 원본 그대로, {n_fix}개는 fix1 손질본이다.

## ⚠ seed는 재현되지 않는다 — 이 폴더가 유일본이다

Typecast의 `seed`는 요청에 실리지만 같은 seed·같은 텍스트가 다른 결과를 낸다
(2026-08-19 실측: `std09_s1` 106,622B/2.60초 vs `std09_s1chk` 102,443B/2.50초, 둘 다 seed 1).

**그러므로 이 mp3들을 지우면 같은 소리를 다시 만들 수 없다.** `manifest.json`에
어떤 변형을 골랐는지 적혀 있지만 그것으로 복원되지 않는다. 라이선스 조건
(라이트 플랜 출력물은 상업 이용 가능하되 **구독 기간 안에 다운로드를 마쳐야 한다**,
고객센터 회신 2026-08-19)과 겹쳐서, 이 폴더를 잃는 것이 곧 자산을 잃는 것이다.

백업은 두 곳이다.
1. `C:\\Users\\Paul Park\\Desktop\\Claude Work\\Naruve Data\\tts\\` 의 zip
2. R2 `naruve-ganada-audio` 버킷의 `tts/v1/{{성별_이름}}/{{hash}}.mp3`

## 파일명은 문장 해시다

`docs/js/audio.js`의 `audioName()`이 한국어 원문 `k`에서 뽑는 FNV-1a 8자리와 같다.
앱은 그 이름으로만 찾는다. **화면 문장을 한 글자라도 고치면 해시가 바뀌고**
그 문장은 파일을 못 찾아 기기 TTS로 떨어진다. 그게 맞는 동작이다 — 문장이 바뀌면
녹음도 낡은 것이다.

## 다시 손질해야 할 때 (fix 절차)

1. `scripts/tts/typecast_gen.py`로 변형을 만든다. 변형마다 config(seed·emotion)와
   sentences를 나눠 여러 번 돌린다. 산출은 `<v1>/fixN/`
2. `scripts/tts/fix_index.py --fix <v1>/fixN` 으로 비교표를 만든다 (행=문장, 열=변형)
3. 사람이 듣고 고른다
4. `scripts/tts/final_picks.json`에 (보이스, 문장) → 변형을 적는다
5. `scripts/tts/build_final.py --out <새 final 폴더>` 로 다시 모은다

## 무결성

- `SHA256SUMS.txt` — 파일별 sha256. 백업본과 대조한다
- `manifest.json` — 문장id·hash·화면텍스트·TTS입력텍스트·출처·seed·길이·sha256
- 총 {total_bytes/1e6:.2f} MB · 총 재생 {total_sec}초

## 듣기

`index.html`을 브라우저로 연다. 행이 문장, 열이 보이스다.
손질본인 칸에는 어느 변형에서 왔는지 붉게 적혀 있다.
메모 키는 `{memo_key}`.

## 출처

Typecast API (`ssfm-v30`, 언어 `kor`, mp3 320kbps/44.1kHz), 라이트 플랜, 2026-08-19.
보이스: {' / '.join(v['name'] for v in voices)}.
"""
    (out / "README.md").write_text(readme, encoding="utf-8")
    shutil.copy2(Path(args.picks), out / "final_picks.json")
    shutil.copy2(__file__, out / "build_final.py")

    zp = None
    if not args.no_zip:
        zp = Path(args.zip or out.parent / f"{out.name}.zip")
        if zp.exists():
            zp.unlink()
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for p in sorted(out.rglob("*")):
                if p.is_file() and p.resolve() != zp.resolve():
                    z.write(p, p.relative_to(out).as_posix())

    print(f"파일 {len(records)} (v1 {len(records)-n_fix} / fix1 {n_fix}) · "
          f"{total_bytes/1e6:.2f} MB · {total_sec}초")
    print(f"메모 키 {memo_key}")
    if zp:
        print(f"zip {zp} ({zp.stat().st_size/1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
