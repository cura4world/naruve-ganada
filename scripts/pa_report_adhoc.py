#!/usr/bin/env python3
"""단발 모드(out/adhoc) 결과 표 — pa_report.py와 섞지 않는다.

  PYTHONIOENCODING=utf-8 python scripts/pa_report_adhoc.py
  PYTHONIOENCODING=utf-8 python scripts/pa_report_adhoc.py -o out/adhoc_report.md

**왜 별도 스크립트인가.** pa_report.py의 (C)(D)(E) 표는 `data/probe_set.json`의
쌍 구조(s1_ok / s1_batchim)와 TTS 벤더를 전제로 짜여 있다. 단발 모드로 재는
것은 사람이 실제로 낸 발음이라 전제가 다르다 — TTS 벤더가 없고, 쌍은 파일이
아니라 참조 텍스트로 갈린다. 억지로 한 스크립트에 끼우면 둘 다 망가진다.

**쌍을 묶는 규칙은 label이다.** 접미사 두 벌을 안다.

  `<그룹>_ok`  / `<그룹>_err`   오류 가설용. gap = 정상 참조 − 오류 참조
  `<그룹>_a`   / `<그룹>_b`     그 밖의 대조용. gap = a − b

gap은 **항상 앞의 것에서 뒤의 것을 뺀다.** 표에 두 참조 텍스트를 같이
찍으므로 무엇에서 무엇을 뺐는지는 줄만 봐도 갈린다.

같은 EnableMiscue 값끼리만 뺀다. 값이 다른 것끼리 빼면 채점 방식이 다른
두 수를 빼는 것이라 의미가 없다.

응답 스키마는 두 형태를 다 받는다. Speech Studio는 점수를
`PronunciationAssessment` 아래에 중첩해 주고, REST는 평평하게 준다
(2026-08-10 실측). 어느 쪽으로 와도 같은 표가 나와야 한다.
"""

import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_common import OUT  # noqa: E402

OUT_ADHOC = os.path.join(OUT, "adhoc")
MISSING = "—"


def pick(node, *names):
    if not isinstance(node, dict):
        return None
    for n in names:
        if n in node:
            return node[n]
    return None


def pa_block(node):
    """점수가 중첩된 경우와 평평한 경우 둘 다."""
    inner = pick(node, "PronunciationAssessment", "pronunciationAssessment")
    return inner if isinstance(inner, dict) else node


def nbest(resp):
    if isinstance(resp, list):
        resp = resp[0] if resp else {}
    nb = pick(resp, "NBest", "nBest", "nbest")
    if isinstance(nb, list) and nb:
        return nb[0]
    return resp if isinstance(resp, dict) else {}


def num(v):
    return v if isinstance(v, (int, float)) else None


def fmt(v):
    if v is None:
        return MISSING
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return "%.1f" % v if isinstance(v, float) else str(v)


def fmt_gap(v):
    if v is None:
        return MISSING
    s = "%+.1f" % v
    return s.rstrip("0").rstrip(".") if "." in s else s


def load(paths):
    recs = []
    for path in sorted(paths):
        with open(path, "r", encoding="utf-8") as fh:
            try:
                r = json.load(fh)
            except json.JSONDecodeError:
                print("건너뜀(JSON 아님): %s" % os.path.basename(path), file=sys.stderr)
                continue
        r["_file"] = os.path.basename(path)
        recs.append(r)
    return recs


def summarize(r):
    """한 응답에서 표에 쓸 값만 뽑는다. 없으면 None — 추정치를 만들지 않는다."""
    nb = nbest(r.get("response"))
    pa = pa_block(nb)
    words = pick(nb, "Words", "words") or []
    errs = []
    for w in words:
        wpa = pa_block(w)
        et = pick(wpa, "ErrorType", "errorType")
        if et:
            errs.append("%s:%s" % (pick(w, "Word", "word") or "?", et))
    return {
        "label": r.get("id"),
        "audio": r.get("audio_file"),
        "ref": r.get("ref_text"),
        "miscue": r.get("enable_miscue"),
        "pron": num(pick(pa, "PronScore", "pronScore")),
        "acc": num(pick(pa, "AccuracyScore", "accuracyScore")),
        "flu": num(pick(pa, "FluencyScore", "fluencyScore")),
        "comp": num(pick(pa, "CompletenessScore", "completenessScore")),
        "words": len(words),
        "errtypes": ", ".join(errs) if errs else MISSING,
        "display": pick(r.get("response") if isinstance(r.get("response"), dict) else {},
                        "DisplayText", "displayText") or MISSING,
    }


# 앞의 것에서 뒤의 것을 뺀다.
PAIR_SUFFIXES = (("_ok", "_err"), ("_a", "_b"))


def group_of(label):
    """d15_ok → ('d15','ok'), c13_b → ('c13','b'). 쌍이 아니면 kind가 None."""
    for first, second in PAIR_SUFFIXES:
        for suffix in (first, second):
            if str(label).endswith(suffix):
                return str(label)[: -len(suffix)], suffix[1:]
    return str(label), None


def main():
    ap = argparse.ArgumentParser(description="단발 모드 결과 표")
    ap.add_argument("-o", "--out", default=None, help="파일로 저장 (기본은 표준출력)")
    ap.add_argument("--prefix", default=None, help="label이 이 문자열로 시작하는 것만")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    recs = load(glob.glob(os.path.join(OUT_ADHOC, "*.json")))
    rows = [summarize(r) for r in recs]
    if args.prefix:
        rows = [x for x in rows if str(x["label"]).startswith(args.prefix)]
    if not rows:
        print("out/adhoc/ 에 결과가 없다. pa_probe.py --audio ... 를 먼저 돌린다.")
        return 0

    out = []
    out.append("# 단발 모드 결과")
    out.append("")
    out.append("- 응답 %d건" % len(rows))
    out.append("- 사람 녹음이다. TTS 벤더 편향(DECISIONS.md 8.5)은 이 표에 없다.")
    out.append("")
    out.append("값이 %s 인 칸은 응답에서 그 필드를 찾지 못한 것이다. 추정치를 넣지 않았다." % MISSING)
    out.append("")

    head = ("| 문장 | 참조텍스트 | EnableMiscue | PronScore | Accuracy | Fluency "
            "| Completeness | Words | ErrorType |")
    sep = "|---|---|---|---|---|---|---|---|---|"

    for miscue in (False, True):
        sub = [x for x in rows if x["miscue"] is miscue]
        if not sub:
            continue
        out.append("## EnableMiscue = %s" % str(miscue).lower())
        out.append("")
        out.append(head)
        out.append(sep)
        for x in sorted(sub, key=lambda y: str(y["label"])):
            out.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
                x["audio"] or MISSING, x["ref"] or MISSING, str(miscue).lower(),
                fmt(x["pron"]), fmt(x["acc"]), fmt(x["flu"]), fmt(x["comp"]),
                x["words"], x["errtypes"]))
        out.append("")

    # gap = 정상 참조 − 오류 참조. 같은 EnableMiscue 값끼리만.
    pairs = {}
    for x in rows:
        g, kind = group_of(x["label"])
        if kind:
            pairs.setdefault((g, x["miscue"]), {})[kind] = x

    if pairs:
        out.append("## gap (앞 참조 − 뒤 참조)")
        out.append("")
        out.append("같은 오디오에 참조 텍스트만 바꿔 부른 두 값의 차다.")
        out.append("무엇에서 무엇을 뺐는지는 같은 줄의 두 참조 텍스트가 말한다.")
        out.append("")
        out.append("| 그룹 | EnableMiscue | 앞 참조 | 점수 | 뒤 참조 | 점수 | gap |")
        out.append("|---|---|---|---|---|---|---|")
        for (g, miscue) in sorted(pairs, key=lambda k: (str(k[0]), str(k[1]))):
            p = pairs[(g, miscue)]
            first = p.get("ok") or p.get("a")
            second = p.get("err") or p.get("b")
            if not (first and second):
                continue
            gap = None
            if first["pron"] is not None and second["pron"] is not None:
                gap = first["pron"] - second["pron"]
            out.append("| %s | %s | %s | %s | %s | %s | %s |" % (
                g, str(miscue).lower(), first["ref"], fmt(first["pron"]),
                second["ref"], fmt(second["pron"]), fmt_gap(gap)))
        out.append("")

    text = "\n".join(out)
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        print("저장: %s" % args.out)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
