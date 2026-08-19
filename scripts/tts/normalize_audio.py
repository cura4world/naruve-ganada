#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
예시 음성 음량 정규화 — ffmpeg loudnorm 2-pass.

    python scripts/tts/normalize_audio.py --in "D:/aihub_work/tts_typecast_final_20260819"

타입캐스트가 보이스마다 다른 음량으로 내보낸다. 한 문장은 크고 다음 문장은 작으면
학습자가 볼륨을 계속 만지게 되고, 무엇보다 **따라 할 표본의 크기가 흔들린다.**

목표는 I = -16 LUFS, TP = -1.5 dBTP다. -16은 모바일 음성 콘텐츠의 통상값이고,
-1.5 dBTP는 mp3로 다시 인코딩할 때 생기는 인터샘플 피크에 여유를 둔 값이다.
(-1.0으로 잡으면 디코더에 따라 클리핑이 보인다.)

**원본은 건드리지 않는다.** 정규화본은 `<원본>_norm` 폴더에 새로 쓴다.
seed가 재현되지 않아 원본 mp3가 유일본이기 때문이다(DECISIONS 9.3).

1-pass로 하지 않는 이유: loudnorm의 단일 패스는 동적 모드라 파일마다 다른
게인 곡선을 그린다. 측정값을 넣어 선형 게인으로 거는 2-pass여야 문장 사이의
상대 음량이 보존된다.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

TARGET_I = -16.0
TARGET_TP = -1.5
TARGET_LRA = 11.0


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace")


def measure(path):
    """loudnorm 1-pass. stderr 끝의 JSON을 읽는다."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
             "-af", f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json",
             "-f", "null", "-"])
    m = re.search(r"\{[^{}]*\"input_i\"[\s\S]*?\}", r.stderr)
    if not m:
        raise SystemExit(f"loudnorm 측정 실패: {path}\n{r.stderr[-800:]}")
    # 값은 문자열 그대로 둔다. normalization_type 처럼 숫자가 아닌 항목이 섞여 있고,
    # 2-pass 필터에는 어차피 문자열로 다시 넣는다.
    return json.loads(m.group(0))


def num(d, k):
    """표에 쓸 숫자. 무음 파일의 -inf 나 -70 미만은 값으로 치지 않는다."""
    try:
        v = float(d.get(k))
    except (TypeError, ValueError):
        return None
    return v if v > -70 else None


def normalize(src, dst, meas):
    dst.parent.mkdir(parents=True, exist_ok=True)
    f = (f"loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}"
         f":measured_I={meas['input_i']}:measured_TP={meas['input_tp']}"
         f":measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}"
         f":offset={meas['target_offset']}:linear=true:print_format=summary")
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(src),
             "-af", f, "-ar", "44100", "-b:a", "320k", "-map_metadata", "-1", str(dst)])
    if r.returncode != 0 or not dst.exists() or dst.stat().st_size == 0:
        raise SystemExit(f"정규화 실패: {src}\n{r.stderr[-800:]}")


def main():
    ap = argparse.ArgumentParser(description="예시 음성 음량 정규화")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", default=None, help="기본: <in>_norm")
    ap.add_argument("--limit", type=int, default=0, help="시험용으로 앞 N개만")
    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out) if args.out else src.parent / (src.name + "_norm")
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg 이 PATH 에 없다.")

    meta = json.loads((src / "manifest.json").read_text(encoding="utf-8"))
    recs = meta["records"]
    if args.limit:
        recs = recs[:args.limit]

    print(f"원본 {src}\n정규화본 {out}\n대상 {len(recs)}개 · 목표 I={TARGET_I} TP={TARGET_TP}\n")

    rows = []
    for i, r in enumerate(recs, 1):
        s = src / r["file"]
        d = out / r["file"]
        before = measure(s)
        normalize(s, d, before)
        after = measure(d)
        rows.append({
            "file": r["file"], "voice": r["voice"], "sentence_id": r["sentence_id"],
            "before": {"I": num(before, "input_i"), "TP": num(before, "input_tp"),
                       "LRA": num(before, "input_lra")},
            "after": {"I": num(after, "input_i"), "TP": num(after, "input_tp"),
                      "LRA": num(after, "input_lra")},
            "bytes": d.stat().st_size,
        })
        if i % 20 == 0 or i == len(recs):
            print(f"  {i}/{len(recs)}")

    def avg(sel, key):
        v = [x[sel][key] for x in rows if x[sel][key] is not None]
        return round(sum(v) / len(v), 2) if v else None

    voices = sorted({x["voice"] for x in rows})
    print("\n보이스별 평균")
    print(f"  {'보이스':6}{'n':>4}{'I 전':>9}{'I 후':>9}{'TP 전':>9}{'TP 후':>9}{'LRA 전':>9}{'LRA 후':>9}")
    per = {}
    for v in voices:
        sub = [x for x in rows if x["voice"] == v]
        def a(sel, key):
            vals = [x[sel][key] for x in sub if x[sel][key] is not None]
            return round(sum(vals) / len(vals), 2) if vals else None
        per[v] = {"n": len(sub),
                  "before": {"I": a("before", "I"), "TP": a("before", "TP"), "LRA": a("before", "LRA")},
                  "after": {"I": a("after", "I"), "TP": a("after", "TP"), "LRA": a("after", "LRA")}}
        p = per[v]
        print(f"  {v:6}{p['n']:>4}{p['before']['I']:>9}{p['after']['I']:>9}"
              f"{p['before']['TP']:>9}{p['after']['TP']:>9}"
              f"{p['before']['LRA']:>9}{p['after']['LRA']:>9}")
    print(f"  {'전체':6}{len(rows):>4}{avg('before','I'):>9}{avg('after','I'):>9}"
          f"{avg('before','TP'):>9}{avg('after','TP'):>9}"
          f"{avg('before','LRA'):>9}{avg('after','LRA'):>9}")

    spread_b = max(x["before"]["I"] for x in rows if x["before"]["I"] is not None) - \
               min(x["before"]["I"] for x in rows if x["before"]["I"] is not None)
    spread_a = max(x["after"]["I"] for x in rows if x["after"]["I"] is not None) - \
               min(x["after"]["I"] for x in rows if x["after"]["I"] is not None)
    print(f"\n파일 간 I 편차(최대-최소): {spread_b:.2f} dB → {spread_a:.2f} dB")

    # 입력 사본과 기록을 정규화본 옆에 둔다
    for f in ("manifest.json", "sentences.json", "voices.json", "final_picks.json", "README.md"):
        if (src / f).exists():
            shutil.copy2(src / f, out / f)
    (out / "loudness.json").write_text(json.dumps({
        "target": {"I": TARGET_I, "TP": TARGET_TP, "LRA": TARGET_LRA},
        "source": str(src), "files": len(rows),
        "per_voice": per, "spread_I_before": round(spread_b, 2), "spread_I_after": round(spread_a, 2),
        "rows": rows,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n기록 {out / 'loudness.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
