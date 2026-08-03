#!/usr/bin/env python3
"""out/raw/*.json 을 읽어 마크다운 표 다섯 개를 찍는다.

  python3 scripts/pa_report.py
  python3 scripts/pa_report.py --engine azure
  python3 scripts/pa_report.py -o out/report.md

(A) 표기형 vs 표준발음형   많이 / 마니 의 Phonemes 길이 비교
(B) 스키마                 어절 분절·음소 이름·Offset/Duration·ProsodyScore
(C) 판별력                 정상 대비 오류의 gap, 감점 위치가 맞는지
(D) 벤더 편향              같은 문장의 벤더별 점수 차
(E) 눈금 점검              정상 샘플 분포

응답 스키마가 실호출로 확정되지 않았으므로(DECISIONS.md 14절) 키 이름을
여러 표기로 찾아본다. 못 찾으면 값을 지어내지 않고 '—'를 찍는다.
표에 숫자가 있으면 그건 응답에서 나온 것이다.
"""

import argparse
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_common import OUT_RAW, items_by_id, load_probe_set, pair_key  # noqa: E402

MISSING = "—"
NATIVE_FLOOR = 90  # DECISIONS.md 3.2 목표는 92~100. 90 미만이면 눈금 이상으로 본다.


# ---------- 응답 뜯기 (스키마 미확정이라 방어적으로) ----------

def pick(obj, *names):
    """여러 표기 중 먼저 맞는 것을 준다. 대소문자도 무시하고 한 번 더 본다."""
    if not isinstance(obj, dict):
        return None
    for n in names:
        if n in obj:
            return obj[n]
    low = {k.lower(): v for k, v in obj.items()}
    for n in names:
        if n.lower() in low:
            return low[n.lower()]
    return None


def nbest(resp):
    nb = pick(resp, "NBest", "nBest", "nbest")
    if isinstance(nb, list) and nb:
        return nb[0]
    return resp if isinstance(resp, dict) else {}


def pa_block(node):
    """점수가 PronunciationAssessment 아래 중첩된 경우와 평평한 경우 둘 다."""
    inner = pick(node, "PronunciationAssessment", "pronunciationAssessment")
    return inner if isinstance(inner, dict) else node


def words(resp):
    w = pick(nbest(resp), "Words", "words")
    return w if isinstance(w, list) else []


def word_text(w):
    return pick(w, "Word", "word") or ""


def score_of(node):
    v = pick(pa_block(node), "AccuracyScore", "accuracyScore")
    return v if isinstance(v, (int, float)) else None


def phonemes(w):
    p = pick(w, "Phonemes", "phonemes")
    return p if isinstance(p, list) else []


def syllables(w):
    s = pick(w, "Syllables", "syllables")
    return s if isinstance(s, list) else []


def phoneme_name(p):
    v = pick(p, "Phoneme", "phoneme")
    return v if isinstance(v, str) else None


def norm(s):
    """어절 비교용. 문장부호와 공백을 턴다 — 얼마예요? 와 얼마예요 는 같다."""
    return re.sub(r"[\s,.?!？！·]", "", s or "")


def find_word(resp, text):
    target = norm(text)
    for w in words(resp):
        if norm(word_text(w)) == target:
            return w
    return None


def fmt(v, nd=1):
    if v is None:
        return MISSING
    if isinstance(v, float):
        return ("%%.%df" % nd) % v
    return str(v)


# ---------- 읽기 ----------

def load_raw(engine=None):
    recs = []
    for path in sorted(glob.glob(os.path.join(OUT_RAW, "*.json"))):
        with open(path, "r", encoding="utf-8") as fh:
            try:
                r = json.load(fh)
            except json.JSONDecodeError:
                print("건너뜀(JSON 아님): %s" % os.path.basename(path), file=sys.stderr)
                continue
        if engine and r.get("engine") != engine:
            continue
        r["_file"] = os.path.basename(path)
        recs.append(r)
    return recs


def index(recs):
    """(id, vendor) -> record"""
    return {(r["id"], r.get("tts_vendor")): r for r in recs}


def vendors_in(recs):
    return sorted({r.get("tts_vendor") for r in recs if r.get("tts_vendor")})


# ---------- (A) 표기형 vs 표준발음형 ----------

def table_a(idx, vendors, out):
    out.append("## (A) 표기형 vs 표준발음형")
    out.append("")
    out.append("같은 오디오에 참조 텍스트만 바꿔 부른 뒤 첫 어절의 음소 배열 길이를 비교한다.")
    out.append("길이가 **다르면 표기형** 기준, **같으면 표준발음형** 기준이다.")
    out.append("(DECISIONS.md 8.5 — 음소 개수 역산은 기각됐고 이 방법이 대체안이다)")
    out.append("")
    out.append("| 벤더 | 많이 (s2_ok) | 마니 (s2_alt_ref) | 판정 |")
    out.append("|---|---|---|---|")

    verdicts = []
    for v in vendors or [None]:
        a = idx.get(("s2_ok", v))
        b = idx.get(("s2_alt_ref", v))
        na = nb = None
        if a:
            w = find_word(a["response"], "많이")
            na = len(phonemes(w)) if w else None
        if b:
            w = find_word(b["response"], "마니")
            nb = len(phonemes(w)) if w else None

        if na is None or nb is None:
            verdict = "판정 불가 (응답 없음 또는 Phonemes 없음)"
        elif na == 0 and nb == 0:
            verdict = "판정 불가 (양쪽 Phonemes 배열이 비어 있음)"
        elif na != nb:
            verdict = "**표기형 기준**"
        else:
            verdict = "**표준발음형 기준**"
        verdicts.append(verdict)
        out.append("| %s | %s | %s | %s |" % (v or MISSING, fmt(na), fmt(nb), verdict))

    out.append("")
    if verdicts and len(set(verdicts)) > 1:
        out.append("> 벤더마다 판정이 갈렸다. 오디오가 달라 음소 정렬이 달라진 것이므로,")
        out.append("> 이 판정은 오디오가 아니라 참조 텍스트에 달린 것이어야 한다. 재확인이 필요하다.")
        out.append("")
    return out


# ---------- (B) 스키마 ----------

def table_b(recs, out):
    out.append("## (B) 스키마")
    out.append("")
    out.append("| 항목 | 결과 | 근거 |")
    out.append("|---|---|---|")

    if not recs:
        out.append("| — | 응답 없음 | out/raw/ 가 비어 있다 |")
        out.append("")
        return out

    # 어절 분절이 띄어쓰기 기준인가
    hits, total, sample = 0, 0, ""
    for r in recs:
        toks = [norm(t) for t in r["ref_text"].split()]
        got = [norm(word_text(w)) for w in words(r["response"])]
        if not got:
            continue
        total += 1
        if toks == got:
            hits += 1
        elif not sample:
            sample = "ref %s → Words %s" % (toks, got)
    if total == 0:
        seg = "판정 불가 (Words 배열 없음)"
        seg_why = MISSING
    elif hits == total:
        seg = "**예 — 띄어쓰기 기준**"
        seg_why = "%d/%d 응답에서 Words가 ref 어절과 일치" % (hits, total)
    else:
        seg = "**아니오**"
        seg_why = sample or "%d/%d만 일치" % (hits, total)
    out.append("| 어절 분절이 띄어쓰기 기준인가 | %s | %s |" % (seg, seg_why))

    # Phoneme 필드
    named, empty, absent = 0, 0, 0
    example = ""
    for r in recs:
        for w in words(r["response"]):
            ph = phonemes(w)
            if not ph:
                absent += 1
                continue
            for p in ph:
                nm = phoneme_name(p)
                if nm is None:
                    absent += 1
                elif nm == "":
                    empty += 1
                else:
                    named += 1
                    if not example:
                        example = nm
    if named == 0 and empty == 0 and absent == 0:
        pv, pw = "판정 불가", "Phonemes 배열이 없음"
    elif named == 0 and empty > 0:
        pv = "**빈 문자열**"
        pw = "이름 0 / 빈값 %d — 8.6의 음절 타일 정렬 위험이 현실이 된다" % empty
    elif named > 0 and empty == 0:
        pv = "**이름이 온다**"
        pw = "예: `%s` (%d개)" % (example, named)
    else:
        pv = "**섞임**"
        pw = "이름 %d / 빈값 %d" % (named, empty)
    out.append("| Phoneme 필드에 이름이 오는가 | %s | %s |" % (pv, pw))

    # 음절
    syl = sum(len(syllables(w)) for r in recs for w in words(r["response"]))
    out.append(
        "| Syllables 배열이 오는가 | %s | %s |"
        % ("**예**" if syl else "**아니오**", "총 %d개" % syl if syl else "어느 응답에도 없음")
    )

    # Offset / Duration
    def has_od(node):
        return pick(node, "Offset", "offset") is not None and pick(node, "Duration", "duration") is not None

    w_od = any(has_od(w) for r in recs for w in words(r["response"]))
    p_od = any(has_od(p) for r in recs for w in words(r["response"]) for p in phonemes(w))
    out.append("| 어절에 Offset/Duration | %s | |" % ("**예**" if w_od else "**아니오**"))
    out.append("| 음소에 Offset/Duration | %s | %s |" % (
        "**예**" if p_od else "**아니오**",
        "이름이 없어도 정렬에 쓸 수 있다" if p_od and not named else "",
    ))

    # ProsodyScore
    pros = None
    for r in recs:
        v = pick(pa_block(nbest(r["response"])), "ProsodyScore", "prosodyScore")
        if v is not None:
            pros = v
            break
    out.append("| ProsodyScore | %s | %s |" % (
        "**예** (%s)" % fmt(pros) if pros is not None else "**아니오**",
        "없으면 억양 층은 pitch.js가 계속 맡는다 — DECISIONS.md 10절" if pros is None else "",
    ))

    out.append("")
    return out


# ---------- (C) 판별력 ----------

def table_c(idx, recs, vendors, out):
    out.append("## (C) 판별력 — 핵심 지표")
    out.append("")
    out.append("**gap이 지표다. 절대 점수가 아니다.** 그리고 감점이 엉뚱한 어절에 떨어졌으면")
    out.append("점수가 낮아도 실패다 — 사용자는 틀린 지적을 검증할 수 없다 (DECISIONS.md 8.6).")
    out.append("")
    out.append("| 벤더 | 쌍 | 오류 | 정상 | 오류샘플 | gap | 감점 위치 | 최저 어절 |")
    out.append("|---|---|---|---|---|---|---|---|")

    by_id = items_by_id(load_probe_set())
    pairs = {}
    for it in by_id.values():
        if it["error_type"] != "none":
            pairs.setdefault(pair_key(it["id"]), {})["err"] = it
        elif not it.get("audio_from"):
            pairs.setdefault(pair_key(it["id"]), {})["ok"] = it

    fails = []
    for v in vendors or [None]:
        for key in sorted(pairs):
            p = pairs[key]
            if "err" not in p or "ok" not in p:
                continue
            r_ok = idx.get((p["ok"]["id"], v))
            r_err = idx.get((p["err"]["id"], v))
            if not r_ok or not r_err:
                continue

            s_ok = score_of(pa_block(nbest(r_ok["response"])))
            s_err = score_of(pa_block(nbest(r_err["response"])))
            gap = (s_ok - s_err) if (s_ok is not None and s_err is not None) else None

            # 오류 샘플에서 가장 낮은 어절
            lowest, lowest_score = None, None
            for w in words(r_err["response"]):
                sc = score_of(w)
                if sc is None:
                    continue
                if lowest_score is None or sc < lowest_score:
                    lowest, lowest_score = word_text(w), sc

            target = p["err"].get("target_word")
            if lowest is None or not target:
                mark = MISSING
            elif norm(lowest) == norm(target):
                mark = "O"
            else:
                mark = "**X**"
                fails.append("%s / %s — 감점이 %s 가 아니라 %s 에 떨어졌다"
                             % (v or "?", p["err"]["id"], target, lowest))

            out.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (
                v or MISSING, key, p["err"]["error_type"],
                fmt(s_ok), fmt(s_err), fmt(gap), mark,
                "%s %s" % (lowest, fmt(lowest_score)) if lowest else MISSING,
            ))

    out.append("")
    if fails:
        out.append("> **실패 항목이 있다.** 총점이 떨어져도 위치가 틀리면 쓸 수 없다.")
        for f in fails:
            out.append("> - " + f)
        out.append("")
    return out


# ---------- (D) 벤더 편향 ----------

def table_d(idx, recs, vendors, out):
    out.append("## (D) 벤더 편향")
    out.append("")
    out.append("Azure TTS 음성을 Azure 발음평가에 넣으면 같은 회사 음향 특성이라")
    out.append("점수가 부풀 수 있다 (DECISIONS.md 8.5). 그 크기를 잰다.")
    out.append("")

    if len(vendors) < 2:
        out.append("벤더가 %d개뿐이라 비교할 수 없다. 두 벤더로 같은 문장을 뽑아야 한다."
                   % len(vendors))
        out.append("")
        out.append("    python3 scripts/tts_gen.py --vendor elevenlabs")
        out.append("    python3 scripts/tts_gen.py --vendor azure")
        out.append("")
        return out

    a, b = vendors[0], vendors[1]
    out.append("| id | %s | %s | 차 (%s−%s) |" % (a, b, b, a))
    out.append("|---|---|---|---|")
    diffs = []
    for r in sorted({r["id"] for r in recs}):
        ra, rb = idx.get((r, a)), idx.get((r, b))
        if not ra or not rb:
            continue
        sa = score_of(pa_block(nbest(ra["response"])))
        sb = score_of(pa_block(nbest(rb["response"])))
        d = (sb - sa) if (sa is not None and sb is not None) else None
        if d is not None:
            diffs.append(d)
        out.append("| %s | %s | %s | %s |" % (r, fmt(sa), fmt(sb), fmt(d)))
    out.append("")
    if diffs:
        mean = sum(diffs) / len(diffs)
        out.append("평균 차 **%s점** (%d쌍). 부호가 한쪽으로 쏠려 있으면 편향이다." % (fmt(mean), len(diffs)))
        out.append("")
    return out


# ---------- (E) 눈금 점검 ----------

def table_e(idx, vendors, out):
    out.append("## (E) 눈금 점검")
    out.append("")
    out.append("DECISIONS.md 3.2 목표 분포는 **원어민 92~100**이다.")
    out.append("원어민이 78점을 받으면 엄격한 게 아니라 고장 난 것이다.")
    out.append("")
    out.append("> **이 표는 상한 참고치일 뿐이다.** 여기 들어간 것은 사람이 아니라 TTS 음성이다.")
    out.append("> TTS는 사람보다 균일하므로 실제 원어민 점수는 이보다 낮게 흩어질 수 있다.")
    out.append("> 진짜 눈금 확인은 원어민 녹음으로만 된다.")
    out.append("")
    out.append("| 벤더 | id | AccuracyScore | 판정 |")
    out.append("|---|---|---|---|")

    normals = [it["id"] for it in load_probe_set()
               if it["error_type"] == "none" and not it.get("audio_from")]
    low = 0
    for v in vendors or [None]:
        for sid in normals:
            r = idx.get((sid, v))
            if not r:
                continue
            s = score_of(pa_block(nbest(r["response"])))
            if s is None:
                verdict = MISSING
            elif s < NATIVE_FLOOR:
                verdict = "**눈금 이상 (%d 미만)**" % NATIVE_FLOOR
                low += 1
            else:
                verdict = "정상 범위"
            out.append("| %s | %s | %s | %s |" % (v or MISSING, sid, fmt(s), verdict))
    out.append("")
    if low:
        out.append("> 정상 샘플 %d건이 %d점 미만이다. TTS 음성이 이 점수면" % (low, NATIVE_FLOOR))
        out.append("> 사람은 더 낮게 나온다. 눈금을 의심할 근거다.")
        out.append("")
    return out


# ---------- ----------

def main():
    ap = argparse.ArgumentParser(description="프로브 결과 표")
    ap.add_argument("--engine", default=None, help="한 엔진만 볼 때")
    ap.add_argument("-o", "--out", default=None, help="파일로 저장 (기본은 표준출력)")
    args = ap.parse_args()

    recs = load_raw(args.engine)
    if not recs:
        print("out/raw/ 에 결과가 없다. scripts/pa_probe.py 를 먼저 돌린다.")
        return 0

    idx = index(recs)
    vendors = vendors_in(recs)
    engines = sorted({r.get("engine") for r in recs})

    out = []
    out.append("# 발음평가 프로브 결과")
    out.append("")
    out.append("- 엔진: %s" % ", ".join(engines))
    out.append("- TTS 벤더: %s" % (", ".join(vendors) or MISSING))
    out.append("- 응답 %d건" % len(recs))
    out.append("")
    out.append("값이 %s 인 칸은 응답에서 그 필드를 찾지 못한 것이다. 추정치를 넣지 않았다." % MISSING)
    out.append("")
    out.append("---")
    out.append("")

    table_a(idx, vendors, out)
    out.append("---")
    out.append("")
    table_b(recs, out)
    out.append("---")
    out.append("")
    table_c(idx, recs, vendors, out)
    out.append("---")
    out.append("")
    table_d(idx, recs, vendors, out)
    out.append("---")
    out.append("")
    table_e(idx, vendors, out)

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
