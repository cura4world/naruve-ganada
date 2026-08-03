#!/usr/bin/env python3
"""프로브 실행 — out/wav의 음성을 엔진에 넣고 원본 응답을 저장한다.

  python3 scripts/pa_probe.py                      # .env 기준, azure
  python3 scripts/pa_probe.py --engine azure
  python3 scripts/pa_probe.py --vendor elevenlabs  # 어느 TTS로 만든 음성인지
  python3 scripts/pa_probe.py --dry-run            # 무엇을 부를지만 출력

출력: out/raw/<engine>__<id>__<vendor>.json

**응답은 가공 없이 저장한다.** 요약본만 남기면 안 된다. 프로브의 목적이
스키마를 알아내는 것이라, 지금 필요 없어 보이는 필드가 나중에 답이 된다.
표를 만드는 것은 pa_report.py의 일이다.

audio_from이 있는 항목(s2_alt_ref)은 자기 오디오가 없다. 지목한 항목의
음성을 그대로 쓰고 참조 텍스트만 바꿔 부른다 — DECISIONS.md 8.5의
표기형/표준발음형 판별이 이 한 번의 재호출로 끝난다.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adapters  # noqa: E402
from adapters.base import NotConfigured  # noqa: E402
from probe_common import (  # noqa: E402
    OUT_RAW,
    OUT_WAV,
    ensure_dirs,
    items_by_id,
    load_env,
    load_probe_set,
)


def audio_for(item, by_id, vendor):
    """이 항목을 평가할 때 쓸 wav 경로. 없으면 None."""
    src_id = item.get("audio_from") or item["id"]
    if src_id != item["id"] and src_id not in by_id:
        return None
    path = os.path.join(OUT_WAV, "%s__%s.wav" % (src_id, vendor))
    return path if os.path.exists(path) else None


def main():
    ap = argparse.ArgumentParser(description="발음평가 프로브 실행")
    ap.add_argument("--engine", default=None, help="기본값 azure. " + " / ".join(adapters.names()))
    ap.add_argument("--vendor", default=None, help="평가할 음성을 만든 TTS 벤더. 기본값은 .env의 TTS_VENDOR")
    ap.add_argument("--dry-run", action="store_true", help="호출 계획만 출력")
    ap.add_argument("--force", action="store_true", help="이미 있는 결과도 다시 부른다")
    args = ap.parse_args()

    load_env()
    engine_name = args.engine or os.environ.get("PROBE_ENGINE", "azure")
    vendor = args.vendor or os.environ.get("TTS_VENDOR")
    if not vendor:
        print("어느 TTS로 만든 음성인지 알아야 파일을 찾는다.")
        print("  --vendor elevenlabs  또는 .env의 TTS_VENDOR를 채운다.")
        return 0

    try:
        engine = adapters.get(engine_name)
    except KeyError as e:
        print(str(e))
        return 0

    items = load_probe_set()
    by_id = items_by_id(items)

    print("엔진: %s   음성 벤더: %s" % (engine_name, vendor))
    if getattr(engine, "is_stub", False):
        print()
        print("이 어댑터는 아직 골격이다. 호출하지 않는다.")
        for line in engine.setup_hint:
            print("  " + line)
        print()
        print("  scripts/adapters/%s.py 의 TODO를 먼저 해결한다." % engine_name)
        return 0

    plan = []
    missing = []
    for it in items:
        path = audio_for(it, by_id, vendor)
        if path is None:
            missing.append(it["id"])
        else:
            plan.append((it, path))

    for it, path in plan:
        tag = " (오디오 재사용: %s)" % it["audio_from"] if it.get("audio_from") else ""
        print("  %-12s ref=%-16s %s%s" % (it["id"], it["ref_text"], os.path.basename(path), tag))
    if missing:
        print()
        print("음성이 없어 건너뛸 항목: " + ", ".join(missing))
        print("  scripts/tts_gen.py → scripts/prep_audio.sh 를 먼저 돌린다.")
    print()

    if args.dry_run:
        return 0
    if not plan:
        print("부를 것이 없다.")
        return 0

    if not engine.available():
        print("필요한 값이 아직 없다: " + ", ".join(engine.required_keys))
        print()
        for line in engine.setup_hint:
            print("  " + line)
        print()
        print("  .env.example을 .env로 복사해 채운다. .env는 .gitignore에 있다.")
        return 0

    ensure_dirs(OUT_RAW)
    ok = 0
    for it, path in plan:
        out_path = os.path.join(OUT_RAW, "%s__%s__%s.json" % (engine_name, it["id"], vendor))
        if os.path.exists(out_path) and not args.force:
            print("  건너뜀(이미 있음): %s" % os.path.basename(out_path))
            continue
        try:
            raw = engine.assess(path, it["ref_text"])
        except NotConfigured as e:
            print("  설정 없음: %s" % e)
            return 0
        except NotImplementedError as e:
            print("  미구현: %s" % e)
            return 0
        except Exception as e:  # 원인을 그대로 보여준다. 삼키지 않는다.
            print("  실패 %s: %s" % (it["id"], e))
            continue

        # 어느 요청이 이 응답을 냈는지 같이 남긴다. 나중에 raw만 보고
        # 재구성할 수 있어야 한다. 엔진 응답 자체는 response 아래에
        # 손대지 않은 채로 둔다.
        record = {
            "engine": engine_name,
            "id": it["id"],
            "tts_vendor": vendor,
            "ref_text": it["ref_text"],
            "tts_text": it.get("tts_text"),
            "error_type": it["error_type"],
            "target_word": it.get("target_word"),
            "audio_file": os.path.basename(path),
            "response": raw,
        }
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(record, fh, ensure_ascii=False, indent=1)
        ok += 1
        print("  저장 %s" % os.path.basename(out_path))

    print()
    print("%d건 저장. out/raw/" % ok)
    print("표는 scripts/pa_report.py 가 만든다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
