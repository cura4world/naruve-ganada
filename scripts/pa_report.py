#!/usr/bin/env python3
"""out/raw/*.json 을 읽어 마크다운 표 네 개를 찍는다.

  python scripts/pa_report.py
  python scripts/pa_report.py --engine azure
  python scripts/pa_report.py -o out/report.md

(B) 스키마      어절 분절·Syllables·음소 이름·NBestPhonemes·Offset/Duration
(C) 판별력      정상 대비 오류의 gap, 감점 위치가 맞는지
(D) 벤더 편향   같은 문장의 벤더별 점수 차
(E) 눈금 점검   정상 샘플 분포

**(A) 표기형 vs 표준발음형 표는 없앴다.** 2026-08-07 Speech Studio 실측에서
표준발음형으로 확정됐다 — "많이" 어절의 Phonemes가 4개로 왔다(표기형이면 5개).
같은 오디오에 참조 텍스트만 바꿔 두 번 부르는 판별 절차도 함께 기각됐고,
probe_set.json의 s2_alt_ref 항목도 제거했다.

응답 스키마는 azure에 한해 실측으로 확정됐다(scripts/adapters/azure.py의
docstring이 정답지다). 그래도 키를 여러 표기로 찾는 방어 코드는 남긴다.
이 표는 azure 말고 ETRI 응답도 읽어야 하고, 그쪽은 아직 아무것도 모른다.
못 찾으면 값을 지어내지 않고 '—'를 찍는다. 표에 숫자가 있으면 그건 응답에서
나온 것이다.
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


# ---------- 응답 뜯기 ----------

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
    # 최상위가 리스트인 응답도 있다. Speech Studio 실측이 그랬다.
    if isinstance(resp, list):
        resp = resp[0] if resp else {}
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


def has_syllables(w):
    """배열이 통째로 없는 것과 빈 배열로 온 것을 구분한다.

    실측에서 "만나서"는 키 자체가 없었다. 둘을 뭉개면 원인을 못 좁힌다.
    """
    return pick(w, "Syllables", "syllables") is not None


def phoneme_name(p):
    v = pick(p, "Phoneme", "phoneme")
    return v if isinstance(v, str) else None


def syllable_name(s):
    v = pick(s, "Syllable", "syllable")
    return v if isinstance(v, str) else None


def nbest_phonemes(p):
    v = pick(pa_block(p), "NBestPhonemes", "nBestPhonemes", "nbestPhonemes")
    return v if isinstance(v, list) else []


def norm(s):
    """어절 비교용. 문장부호와 공백을 턴다 — 얼마예요? 와 얼마예요 는 같다."""
    return re.sub(r"[\s,.?!？！·]", "", s or "")


def written_syllables(text):
    """표기 음절 수. 한글 음절 글자만 센다 — 문장부호·공백·라틴은 뺀다."""
    return len(re.findall(r"[가-힣]", text or ""))


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


# ---------- (B) 스키마 ----------

def table_b(recs, out):
    out.append("## (B) 스키마")
    out.append("")

    if not recs:
        out.append("응답이 없다. out/raw/ 가 비어 있다.")
        out.append("")
        return out

    _table_b_summary(recs, out)
    _table_b_words(recs, out)
    _table_b_syllables(recs, out)
    return out


def _table_b_summary(recs, out):
    out.append("### B-1 요약")
    out.append("")
    out.append("| 항목 | 결과 | 근거 |")
    out.append("|---|---|---|")

    # 어절 분절이 참조 텍스트의 띄어쓰기를 따르는가 (자세한 것은 B-2)
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
            sample = "%s: ref %s → Words %s" % (r["id"], toks, got)
    if total == 0:
        seg, seg_why = "판정 불가", "Words 배열이 있는 응답이 없다"
    elif hits == total:
        seg = "**예 — 띄어쓰기 기준**"
        seg_why = "%d/%d 응답 일치. 그래도 타일은 Words로 그린다 (B-2)" % (hits, total)
    else:
        seg = "**아니오 — 재구성한다**"
        seg_why = sample or "%d/%d만 일치" % (hits, total)
    out.append("| 어절 분절이 띄어쓰기 기준인가 | %s | %s |" % (seg, seg_why))

    # Phoneme 이름
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
    if named == 0 and empty == 0:
        pv, pw = "판정 불가", "Phonemes 배열에 항목이 없다"
    elif named == 0:
        pv = "**빈 문자열**"
        pw = "이름 0 / 빈값 %d — 실측대로다. 정렬은 순서와 Offset으로만 된다" % empty
    elif empty == 0:
        pv = "**이름이 온다**"
        pw = "예: `%s` (%d개). 실측(빈 문자열)과 다르다 — 요청 조건을 확인한다" % (example, named)
    else:
        pv = "**섞임**"
        pw = "이름 %d / 빈값 %d" % (named, empty)
    out.append("| Phoneme 필드에 이름이 오는가 | %s | %s |" % (pv, pw))

    # Syllable 이름
    s_named = s_empty = 0
    for r in recs:
        for w in words(r["response"]):
            for s in syllables(w):
                nm = syllable_name(s)
                if nm:
                    s_named += 1
                elif nm == "":
                    s_empty += 1
    if s_named == 0 and s_empty == 0:
        sv, sw = "판정 불가", "Syllables 항목이 없다"
    elif s_named == 0:
        sv, sw = "**빈 문자열**", "이름 0 / 빈값 %d — 실측대로다" % s_empty
    else:
        sv, sw = "**이름이 온다**", "이름 %d / 빈값 %d" % (s_named, s_empty)
    out.append("| Syllable 필드에 이름이 오는가 | %s | %s |" % (sv, sw))

    # NBestPhonemes — 이름은 없어도 Score는 온다 (오류 가설의 보조 신호)
    nb_items, nb_scored = 0, 0
    for r in recs:
        for w in words(r["response"]):
            for p in phonemes(w):
                for cand in nbest_phonemes(p):
                    nb_items += 1
                    if isinstance(pick(cand, "Score", "score"), (int, float)):
                        nb_scored += 1
    if nb_items == 0:
        nv = "**아니오**"
        nw = "요청해야 온다. NBestPhonemeCount를 안 보냈거나 엔진이 안 준다"
    else:
        nv = "**예** (%d개 중 %d개에 Score)" % (nb_items, nb_scored)
        nw = "이름은 없어도 2순위 점수는 오류 가설의 보조 신호가 된다"
    out.append("| NBestPhonemes에 Score가 오는가 | %s | %s |" % (nv, nw))

    # Syllables 배열 (자세한 것은 B-3)
    w_total = sum(len(words(r["response"])) for r in recs)
    w_with = sum(1 for r in recs for w in words(r["response"]) if has_syllables(w))
    if w_total == 0:
        yv, yw = "판정 불가", "Words가 없다"
    elif w_with == 0:
        yv, yw = "**아니오**", "어느 어절에도 없다 — 음절 타일은 불가"
    elif w_with == w_total:
        yv, yw = "**예 — 전 어절**", "%d/%d 어절" % (w_with, w_total)
    else:
        yv = "**어절마다 다르다**"
        yw = "%d/%d 어절에만 있다. 없는 어절은 B-3" % (w_with, w_total)
    out.append("| Syllables 배열이 오는가 | %s | %s |" % (yv, yw))

    # Offset / Duration
    def has_od(node):
        return (pick(node, "Offset", "offset") is not None
                and pick(node, "Duration", "duration") is not None)

    w_od = any(has_od(w) for r in recs for w in words(r["response"]))
    s_od = any(has_od(s) for r in recs for w in words(r["response"]) for s in syllables(w))
    p_od = any(has_od(p) for r in recs for w in words(r["response"]) for p in phonemes(w))
    out.append("| 어절에 Offset/Duration | %s | |" % ("**예**" if w_od else "**아니오**"))
    out.append("| 음절에 Offset/Duration | %s | |" % ("**예**" if s_od else "**아니오**"))
    out.append("| 음소에 Offset/Duration | %s | %s |" % (
        "**예**" if p_od else "**아니오**",
        "이름이 없어도 정렬에 쓸 수 있다" if p_od and not named else "",
    ))

    # ProsodyScore — 실측에서 ko-KR에는 오지 않았다
    pros = None
    for r in recs:
        v = pick(pa_block(nbest(r["response"])), "ProsodyScore", "prosodyScore")
        if v is not None:
            pros = v
            break
    if pros is None:
        pv2 = "**아니오 — ko-KR 미제공 확인됨**"
        pw2 = ("2026-08-07 Speech Studio 실측. Prosody assessment를 켜고 불러도 "
               "4/4 샘플에 없었다. 억양 층은 pitch.js가 계속 맡는다 — DECISIONS.md 10절")
    else:
        pv2 = "**예** (%s)" % fmt(pros)
        pw2 = "실측(미제공)과 다르다. 이게 오히려 새 정보다 — 조건을 기록할 것"
    out.append("| ProsodyScore | %s | %s |" % (pv2, pw2))
    out.append("")
    return out


def _table_b_words(recs, out):
    out.append("### B-2 Words 개수 vs 참조 텍스트 어절 개수")
    out.append("")
    out.append("Azure는 참조 텍스트의 띄어쓰기를 그대로 따르지 않고 자체 판단을 섞는다.")
    out.append("실측에서 `저는 한국사람입니다`가 Words 2개로 왔고 `한국사람입니다`가")
    out.append("한 덩어리가 되면서 그 어절 59점 / CompletenessScore 50이 됐다.")
    out.append("**참조 텍스트로 타일을 미리 그려놓고 응답을 끼워넣으면 어긋난다.**")
    out.append("")
    out.append("| id | 벤더 | ref 어절 | Words | 일치 | 응답의 Words |")
    out.append("|---|---|---|---|---|---|")

    bad = []
    for r in sorted(recs, key=lambda x: (x["id"], x.get("tts_vendor") or "")):
        toks = r["ref_text"].split()
        got = [word_text(w) for w in words(r["response"])]
        if not got:
            mark = MISSING
        elif [norm(t) for t in toks] == [norm(g) for g in got]:
            mark = "O"
        else:
            mark = "**X**"
            bad.append("%s / %s — ref %d어절 %s → Words %d개 %s"
                       % (r.get("tts_vendor") or "?", r["id"],
                          len(toks), toks, len(got), got))
        out.append("| %s | %s | %d | %s | %s | %s |" % (
            r["id"], r.get("tts_vendor") or MISSING, len(toks),
            len(got) if got else MISSING, mark, " / ".join(got) or MISSING,
        ))
    out.append("")
    if bad:
        out.append("> **어절이 재구성된 응답이 %d건 있다.**" % len(bad))
        for b in bad:
            out.append("> - " + b)
        out.append("> 타일은 참조 텍스트가 아니라 응답의 Words를 기준으로 그린다.")
        out.append("")
    return out


def _table_b_syllables(recs, out):
    out.append("### B-3 Syllables 유무와 개수")
    out.append("")
    out.append("실측에서 7어절 중 6어절은 표기 음절 수와 정확히 같은 개수로 왔고,")
    out.append("`만나서` 하나만 배열이 통째로 없었다 (받침 ㄴ + 초성 ㄴ 병합 추정).")
    out.append("**개수가 어긋나거나 배열이 없는 어절은 음절 타일을 그리면 안 된다.**")
    out.append("한 칸만 밀려도 엉뚱한 음절에 잉크가 차고, 사용자는 그것이 틀렸다는")
    out.append("것을 알 수 없다 (DECISIONS.md 8.6).")
    out.append("")
    out.append("**정상 샘플과 오류 샘플을 갈라서 읽는다.** 오류 샘플의 표적 어절은")
    out.append("일부러 다른 소리를 넣은 것이라 음절 구성이 달라지는 게 정상일 수 있다")
    out.append("(s1_batchim의 `반가씀니다`는 받침 ㅂ이 빠졌다). 그걸 엔진 결함으로")
    out.append("세면 오탐이다. 그래서 표적 어절의 불일치는 **보류**로 따로 모은다.")
    out.append("표적이 아닌 어절은 오류 샘플에서도 정상 발음이므로 그대로 신호로 센다.")
    out.append("")
    out.append("| id | 샘플 | 벤더 | 어절 | Syllables | 표기 음절 수 | 판정 |")
    out.append("|---|---|---|---|---|---|---|")

    missing_arr, mismatch, held = [], [], []
    for r in sorted(recs, key=lambda x: (x["id"], x.get("tts_vendor") or "")):
        v = r.get("tts_vendor") or MISSING
        is_err = (r.get("error_type") or "none") != "none"
        target = r.get("target_word")
        for w in words(r["response"]):
            text = word_text(w)
            want = written_syllables(text)
            # 이 어절이 일부러 비틀린 자리인가. 오류 샘플이라도 표적이
            # 아닌 어절은 정상 발음이라 판정을 무르게 할 이유가 없다.
            is_target = bool(is_err and target and norm(text) == norm(target))
            kind = ("**오류·표적**" if is_target else "오류") if is_err else "정상"
            where = "%s / %s / %s" % (v, r["id"], text)

            if not has_syllables(w):
                got = MISSING
                if is_target:
                    verdict = "배열 없음 (보류)"
                    held.append(where + " — 배열 없음")
                else:
                    verdict = "**배열 없음**"
                    missing_arr.append(where)
            else:
                n = len(syllables(w))
                got = str(n)
                if want == 0:
                    verdict = MISSING
                elif n == want:
                    verdict = "일치"
                elif is_target:
                    verdict = "불일치 (보류)"
                    held.append(where + " — Syllables %d, 표기 %d" % (n, want))
                else:
                    verdict = "**불일치**"
                    mismatch.append(where + " — Syllables %d, 표기 %d" % (n, want))
            out.append("| %s | %s | %s | %s | %s | %d | %s |"
                       % (r["id"], kind, v, text or MISSING, got, want, verdict))
    out.append("")

    if missing_arr:
        out.append("> **Syllables 배열이 없는 어절 %d건** (정상 발음인 어절만)." % len(missing_arr))
        for m in missing_arr:
            out.append("> - " + m)
        out.append("> 이 어절만 어절 단위 타일로 떨어뜨린다.")
        out.append("")
    if mismatch:
        out.append("> **개수가 표기 음절 수와 어긋난 어절 %d건** (정상 발음인 어절만)." % len(mismatch))
        for m in mismatch:
            out.append("> - " + m)
        out.append("> 정렬을 신뢰할 수 없다. 이 어절도 어절 단위로 내린다.")
        out.append("")
    if held:
        out.append("> **보류 %d건 — 오류 샘플의 표적 어절이다.** 일부러 비튼 자리라" % len(held))
        out.append("> 음절 구성이 달라진 것인지 엔진이 못 쪼갠 것인지 이 표로는 갈리지 않는다.")
        for h in held:
            out.append("> - " + h)
        out.append("> 엔진 결함으로 세지 않는다. 가르려면 같은 어절의 정상 샘플(%s)과"
                   % "*_ok")
        out.append("> 나란히 놓고 본다 — 정상 쪽에서도 어긋나면 그때는 엔진 쪽이다.")
        out.append("")
    if not missing_arr and not mismatch:
        out.append("> 정상 발음인 어절에서는 배열이 다 있고 개수도 맞다. 그래도 표본이 이만큼일 뿐이다.")
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
        out.append("> 어절이 재구성된 응답이면 B-2를 먼저 본다. 엔진이 두 어절을 하나로")
        out.append("> 묶었으면 감점 위치는 애초에 비교 대상이 아니다.")
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
        out.append("    python scripts/tts_gen.py --vendor elevenlabs")
        out.append("    python scripts/tts_gen.py --vendor azure")
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
    out.append(">")
    out.append("> 원어민 실측 참고치(2026-08-07, 폰 녹음 4문장, Speech Studio):")
    out.append("> 감사합니다 100 / 날씨가 많이 더워요 98 / 많이 드세요 95 / 만나서 반갑습니다 91.")
    out.append("> 표본 4개라 확정이 아니다.")
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
    # Windows 콘솔은 기본이 cp949라 '—' 하나에 UnicodeEncodeError로 죽는다.
    # 표를 다 만들어놓고 출력에서 터지는 것이 제일 아깝다. 파일로 저장할
    # 때(-o)는 utf-8로 쓰므로 이 문제가 없다.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

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
    out.append("(A) 표기형/표준발음형 표는 없다. 2026-08-07 실측에서 **표준발음형**으로")
    out.append("확정됐다 — 참조 텍스트에 표기형을 그대로 넣으면 된다. G2P 불필요.")
    out.append("")
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
