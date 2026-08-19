#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
손질 회차(fix*) 비교표 만들기.

typecast_gen.py의 index.html은 **열이 보이스**다. 손질 회차는 보이스가 이미
정해져 있고 비교해야 하는 것이 **변형**이라 축이 다르다. 그래서 표를 따로 짠다.
메모·별점·내보내기 JS와 CSS는 typecast_gen.py 것을 그대로 가져다 쓴다 —
같은 것을 두 벌 두면 한쪽만 고쳐진다.

    python scripts/tts/fix_index.py --fix "D:/aihub_work/tts_typecast_v1_20260819/fix1"

행 = (보이스, 문장), 열 = 변형. 첫 열은 원본 v1이고 비교 기준이다.
원본은 상위 폴더에서 `{문장id}_v1.mp3`로 **복사해 온다.** 상대경로로 `../`를
가리키면 zip을 풀었을 때 끊긴다.

생성은 하지 않는다. 크레딧이 나가지 않는다.
"""

import argparse
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
    INDEX_CSS, INDEX_JS, MEMO_KEY_PREFIX, voice_dir_name, measure_seconds,
)

# 열 순서. 없는 변형은 빈 칸으로 남는다.
COLUMNS = [
    ("v1",    "원본 v1",      "비교 기준 · 본작업 그대로"),
    ("s1",    "seed 1",       "원문"),
    ("s2",    "seed 2",       "원문"),
    ("s3",    "seed 3",       "원문"),
    ("txt",   "텍스트 손질",   "표기만 바꿈"),
    ("emo",   "감정 프리셋",   "prompt preset"),
    ("s1chk", "seed 1 재현",  "s1과 같은 입력·같은 seed"),
]


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def dur_of(p):
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(p)],
            capture_output=True, text=True, timeout=30)
        return round(float(r.stdout.strip()), 2)
    except Exception:  # noqa: BLE001
        return None


def main():
    ap = argparse.ArgumentParser(description="손질 회차 비교표")
    ap.add_argument("--fix", required=True, help="fix 폴더 (variants.json이 있는 곳)")
    ap.add_argument("--v1", default=None, help="원본 폴더 (기본: fix의 상위)")
    ap.add_argument("--zip", default=None)
    ap.add_argument("--no-zip", action="store_true")
    args = ap.parse_args()

    fix = Path(args.fix)
    v1 = Path(args.v1) if args.v1 else fix.parent
    spec = json.loads((fix / "variants.json").read_text(encoding="utf-8"))
    variants = spec["variants"]
    tag = fix.name  # fix1

    voices = {v["voice"]: None for v in variants}
    vdirs = {}
    for vv in json.loads((v1 / "voices.json").read_text(encoding="utf-8"))["voices"]:
        if vv["name"] in voices:
            vdirs[vv["name"]] = voice_dir_name(vv)
    missing_voice = [n for n in voices if n not in vdirs]
    if missing_voice:
        sys.exit(f"원본 voices.json에서 못 찾은 보이스: {missing_voice}")

    # 행 = (보이스, 문장). variants에 나온 순서를 지킨다.
    rows, seen = [], set()
    for v in variants:
        key = (v["voice"], v["src_id"])
        if key not in seen:
            seen.add(key)
            rows.append({"voice": v["voice"], "src_id": v["src_id"],
                         "k": v["k"], "type": v["type"], "collection": v["collection"]})

    # 변형을 (보이스, 문장, 열) 로 흩어놓는다. 감정 변형은 이름이 제각각이라 emo 열로 모은다.
    cell = {}
    for v in variants:
        col = v["variant"]
        if col.startswith("emo"):
            col = "emo"
        cell[(v["voice"], v["src_id"], col)] = v

    # 원본 v1 복사 — zip을 풀어도 첫 열이 살아 있어야 한다
    copied, absent = 0, []
    for r in rows:
        src = v1 / vdirs[r["voice"]] / f"{r['src_id']}.mp3"
        dst = fix / vdirs[r["voice"]] / f"{r['src_id']}_v1.mp3"
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not src.exists():
            absent.append(str(src))
            continue
        if not dst.exists() or dst.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dst)
        copied += 1
        cell[(r["voice"], r["src_id"], "v1")] = {
            "voice": r["voice"], "src_id": r["src_id"], "id": f"{r['src_id']}_v1",
            "variant": "v1", "kind": "원본", "seed": None, "params": {},
            "tts": r["k"], "k": r["k"], "why": "본작업 v1 그대로 복사",
        }
    if absent:
        sys.exit("원본을 못 찾았다:\n  " + "\n  ".join(absent))

    # ---- 파일별 기록 (manifest)
    records, missing = [], []
    for r in rows:
        for col, _lab, _sub in COLUMNS:
            v = cell.get((r["voice"], r["src_id"], col))
            if not v:
                continue
            rel = f"{vdirs[r['voice']]}/{v['id']}.mp3"
            p = fix / rel
            if not p.exists() or p.stat().st_size == 0:
                missing.append(rel)
                continue
            records.append({
                "file": rel, "voice": r["voice"], "src_id": r["src_id"],
                "column": col, "variant": v["variant"], "kind": v["kind"],
                "text_screen": r["k"], "text_tts": v["tts"],
                "text_changed": v["tts"] != r["k"],
                "tweak_note": v.get("tweak_note"),
                "seed": v.get("seed"), "params": v.get("params") or {},
                "bytes": p.stat().st_size, "seconds": dur_of(p),
            })

    # ---- 표
    heads = "".join(
        f'<th><div class="vn">{esc(lab)}</div><div class="vg">{esc(sub)}</div>'
        f'<div class="stars" role="radiogroup" aria-label="{esc(lab)} 별점" data-vid="{esc(col)}">'
        + "".join(f'<button type="button" class="st" role="radio" aria-checked="false" '
                  f'data-v="{n}" title="{n}점">\u2606</button>' for n in range(1, 6))
        + '<button type="button" class="stclr" title="별점 지움">\u00d7</button></div>'
        f'<textarea class="vmemo" rows="3" data-vid="{esc(col)}" '
        f'placeholder="{esc(lab)} 전체 인상"></textarea></th>'
        for col, lab, sub in COLUMNS
    )

    by_file = {r["file"]: r for r in records}
    trs = []
    for r in rows:
        rid = f"{r['voice']}_{r['src_id']}"
        tds = []
        for col, _lab, _sub in COLUMNS:
            v = cell.get((r["voice"], r["src_id"], col))
            rel = f"{vdirs[r['voice']]}/{v['id']}.mp3" if v else None
            if not v or rel not in by_file:
                tds.append('<td class="none">—</td>')
                continue
            rec = by_file[rel]
            extra = ""
            if rec["text_changed"]:
                extra = f'<div class="cnote">입력: {esc(rec["text_tts"])}</div>'
            elif rec["params"].get("emotion"):
                e = rec["params"]["emotion"]
                extra = f'<div class="cnote">{esc(e["preset"])} {esc(e["intensity"])}</div>'
            tds.append(
                "<td>"
                f'<audio controls preload="none" src="{esc(rel)}"></audio>'
                f'{extra}'
                f'<div class="cdur">{rec["seconds"]}s'
                + (f' · seed {rec["seed"]}' if rec["seed"] is not None else "")
                + "</div>"
                f'<input class="smemo" type="text" data-vid="{esc(col)}" '
                f'data-sid="{esc(rid)}" placeholder="한 줄 메모">'
                "</td>"
            )
        trs.append(
            '<tr><th class="sent">'
            f'<div class="sid">{esc(r["voice"])} · {esc(r["src_id"])} · {esc(r["type"])}</div>'
            f'<div class="stx">{esc(r["k"])}</div>'
            "</th>" + "".join(tds) + "</tr>"
        )

    memo_key = MEMO_KEY_PREFIX + datetime.now().strftime("%Y%m%d") + "." + tag

    def jdump(o):
        return json.dumps(o, ensure_ascii=False).replace("</", "<\\/")

    data_js = (
        "const KEY=" + jdump(memo_key) + ";\n"
        "const VOICES=" + jdump([{"id": c, "label": lab, "name": lab}
                                 for c, lab, _ in COLUMNS]) + ";\n"
        "const SENTS=" + jdump([{"id": f"{r['voice']}_{r['src_id']}"} for r in rows]) + ";\n"
    )

    n_tweak = sum(1 for r in records if r["text_changed"])
    n_emo = sum(1 for r in records if r["params"].get("emotion"))

    html = f"""<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Typecast 손질 비교 — {esc(tag)}</title>
<style>{INDEX_CSS}
th.sent {{ --sent:230px; }}
.cnote {{ font-size:11px; color:var(--seal); line-height:1.35; margin-top:3px; }}
.cdur {{ font-size:10px; color:#8b939a; font-family:ui-monospace,monospace; margin-top:2px; }}
td.none {{ color:#c9c4b8; text-align:center; vertical-align:middle; }}
@media (max-width:560px) {{ th.sent {{ --sent:132px; }} }}
</style>

<h1>손질 비교 {esc(tag)} — {len(rows)}줄 × 변형 {len(COLUMNS)}열</h1>
<p class="meta">
왼쪽 첫 열이 <b>원본 v1</b>이고 나머지가 손질 변형이다. 같은 줄에서 가로로 비교한다.<br>
파일 {len(records)}개 · 텍스트 손질 {n_tweak} · 감정 프리셋 {n_emo} ·
seed는 각 칸에 적혀 있다<br>
가로로 밀면 열이 더 있다. 왼쪽 문장 칸은 고정된다.
</p>
<p class="warn">
<b>seed는 재현을 보장하지 않는다.</b> 같은 seed·같은 텍스트로 두 번 만든
`seed 1`과 `seed 1 재현` 열을 비교해 보면 다르다. 그러므로 마음에 드는 take는
그 파일이 유일본이다 — 다시 만들 수 없다.<br>
메모와 별점은 이 기기의 이 브라우저에만 저장된다(키 <code>{esc(memo_key)}</code>).
옮기려면 <b>메모 내보내기</b> → 반대쪽에서 <b>메모 불러오기</b>.
</p>
<div class="bar">
  <button type="button" id="exp">메모 내보내기</button>
  <button type="button" id="imp">메모 불러오기</button>
  <button type="button" id="clr" class="danger">메모 전체 삭제</button>
  <span id="stat"></span>
</div>
<div id="imppanel" hidden>
  <p>내보내기로 만든 텍스트를 그대로 붙여넣고 <b>채우기</b>를 누른다.
  형식이 맞지 않으면 아무것도 바꾸지 않는다.</p>
  <textarea id="imptext" placeholder="# TTS 후보 청취 메모 (...)&#10;## seed 1 ★★★★☆&#10;전체: ...&#10;- 우성_std09: ..."></textarea>
  <div class="bar" style="margin-top:8px">
    <button type="button" id="impok">채우기</button>
    <button type="button" id="impcancel">취소</button>
  </div>
</div>

<div class="wrap"><table>
<thead><tr><th class="sent">보이스 · 문장</th>{heads}</tr></thead>
<tbody>{''.join(trs)}</tbody>
</table></div>

<script>
{data_js}{INDEX_JS}
</script>
</html>
"""
    (fix / "index.html").write_text(html, encoding="utf-8")

    secs = measure_seconds(fix, "mp3")
    meta = {
        "generated": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "kind": "손질 회차 (fix)",
        "built_by": "scripts/tts/fix_index.py",
        "source_run": v1.name,
        "memo_key": memo_key,
        "voices": vdirs,
        "columns": [{"key": c, "label": l, "sub": s} for c, l, s in COLUMNS],
        "rows": len(rows),
        "files": len(records),
        "copied_from_v1": copied,
        "missing": missing,
        "audio_seconds": secs,
        "seed_note": ("seed를 요청에 실어도 같은 결과가 나오지 않는다. "
                      "std09_s1 과 std09_s1chk 이 같은 seed·같은 텍스트인데 바이트가 다르다."),
        "seeds_used": spec.get("seeds"),
        "records": records,
    }
    (fix / "manifest.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    zp = None
    if not args.no_zip:
        zp = Path(args.zip or v1.parent / f"{v1.name}_{tag}.zip")
        if zp.exists():
            zp.unlink()
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for p in sorted(fix.rglob("*")):
                if p.is_file() and p.suffix != ".part" and p.resolve() != zp.resolve():
                    z.write(p, p.relative_to(fix).as_posix())

    # 재현을 위해 이 스크립트 사본을 산출물 옆에 둔다 (CLAUDE.md '평가 산출물')
    shutil.copy2(__file__, fix / "fix_index.py")

    print(f"행 {len(rows)} · 열 {len(COLUMNS)} · 파일 {len(records)} "
          f"(원본 복사 {copied}) · 총 {secs}초")
    if missing:
        print(f"빠진 칸 {len(missing)}: {missing[:5]}")
    print(f"메모 키 {memo_key}")
    if zp:
        print(f"zip {zp} ({zp.stat().st_size/1e6:.2f} MB)")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
