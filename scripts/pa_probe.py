#!/usr/bin/env python3
"""프로브 실행 — 음성을 엔진에 넣고 원본 응답을 저장한다.

세트 모드 — data/probe_set.json 전체를 돈다.

  PYTHONIOENCODING=utf-8 python scripts/pa_probe.py \
      --engine azure --vendor azure --enable-miscue false --dry-run

단발 모드 — 임의 오디오 하나. 규격 검증과 재측정에 쓴다.

  PYTHONIOENCODING=utf-8 python scripts/pa_probe.py --engine azure \
      --audio "C:/어딘가/17 싸요.m4a" --ref "싸요" --enable-miscue false

**Windows에서는 PYTHONIOENCODING=utf-8을 붙인다.** 콘솔이 cp949라
붙이지 않으면 한글 출력이 전부 깨진다. 파일 출력은 항상 utf-8이다.

출력
  세트 모드  out/raw/<engine>__<id>__<vendor>.json
  단발 모드  out/adhoc/<engine>__<id>__miscue-<값>.json

단발 모드 결과를 out/raw/에 섞지 않는다. pa_report.py의 (C)(D)(E) 표는
probe_set의 쌍 구조와 TTS 벤더를 전제로 짜여 있어서, 사람 녹음이 같은
폴더에 들어가면 쌍이 아닌 것을 쌍으로 묶는다. 폴더로 갈라 둔다.


## EnableMiscue는 필수 인자다. 기본값이 없다.

false면 강제 정렬(forced alignment)이다 — Microsoft Learn FAQ: "단일 샷
모드에서 EnableMiscue가 false로 설정되면 시스템은 인식된 텍스트가 참조
텍스트와 강제적으로 맞추게 합니다." 참조 텍스트가 바뀌면 정렬 목표가
바뀌므로 같은 오디오라도 점수가 달라진다.

DECISIONS.md 8.8·8.9 D군은 전부 Speech Studio 기본값(false)에서 나온
값이고, 이 하네스는 반대로 true가 박혀 있었다. 값을 모르는 채로 도는
일이 없도록 미지정 시 에러로 끝낸다. **실제로 보낸 설정은 응답과 함께
결과 JSON에 남긴다.**

30초를 넘으면 연속 모드가 되어 EnableMiscue를 쓸 수 없다. 길이를 미리
재고 넘으면 그 항목을 부르지 않는다.


## 응답은 가공 없이 저장한다.

요약본만 남기면 안 된다. 프로브의 목적이 스키마를 알아내는 것이라,
지금 필요 없어 보이는 필드가 나중에 답이 된다. 표를 만드는 것은
pa_report.py의 일이다.

audio_from이 있는 항목은 자기 오디오가 없다. 지목한 항목의 음성을
그대로 쓰고 참조 텍스트만 바꿔 부른다 — 4.1 오류 가설 재채점이 같은
구조다.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adapters  # noqa: E402
from adapters.base import NotConfigured  # noqa: E402
from probe_common import (  # noqa: E402
    OUT,
    OUT_RAW,
    OUT_WAV,
    ensure_dirs,
    items_by_id,
    load_env,
    load_probe_set,
)

OUT_ADHOC = os.path.join(OUT, "adhoc")

# 30초를 넘으면 단일 샷이 아니라 연속 모드가 되고 EnableMiscue가 무의미해진다.
MAX_SECONDS = 30.0


def parse_bool(v):
    s = str(v).strip().lower()
    if s in ("true", "1", "yes", "y", "on"):
        return True
    if s in ("false", "0", "no", "n", "off"):
        return False
    raise argparse.ArgumentTypeError("true 또는 false로 준다 (받은 값: %r)" % v)


def audio_seconds(path):
    """ffprobe로 길이(초). 못 재면 None — 추측값을 만들지 않는다."""
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=nw=1:nk=1", path,
            ],
            capture_output=True, text=True, timeout=30,
        )
        return float(out.stdout.strip())
    except (ValueError, OSError, subprocess.SubprocessError):
        return None


def check_duration(path):
    """(ok, 초, 메시지). 못 쟀으면 막지 않되 그렇다고 말한다."""
    sec = audio_seconds(path)
    if sec is None:
        return True, None, "길이를 재지 못했다(ffprobe 없음). 30초 이하인지 직접 확인한다."
    if sec > MAX_SECONDS:
        return False, sec, (
            "%.2f초 — %.0f초를 넘으면 연속 모드가 되어 EnableMiscue가 적용되지 않는다."
            % (sec, MAX_SECONDS)
        )
    return True, sec, None


def to_wav16k(src, dst_dir):
    """16kHz/16bit/mono PCM wav로 변환. 산출물은 저장소 밖 임시 폴더에 둔다."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg이 없다. PROBE.md 0단계 참조.")
    dst = os.path.join(dst_dir, "input.wav")
    res = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", src,
         "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", dst],
        capture_output=True, text=True,
    )
    if res.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError("ffmpeg 변환 실패: %s" % (res.stderr or "")[:400])
    return dst


def slug(text):
    """파일명에 쓸 조각. 한글은 남기고 공백·구분자만 정리한다."""
    s = re.sub(r"\s+", "_", str(text).strip())
    return re.sub(r"[\\/:*?\"<>|]", "", s) or "adhoc"


def audio_for(item, by_id, vendor):
    """이 항목을 평가할 때 쓸 wav 경로. 없으면 None."""
    src_id = item.get("audio_from") or item["id"]
    if src_id != item["id"] and src_id not in by_id:
        return None
    path = os.path.join(OUT_WAV, "%s__%s.wav" % (src_id, vendor))
    return path if os.path.exists(path) else None


def save_record(out_path, record):
    ensure_dirs(os.path.dirname(out_path))
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=1)


def run_adhoc(engine, engine_name, args):
    """오디오 하나에 참조 텍스트 하나. 요청 규격 검증과 재측정용."""
    src = args.audio
    if not os.path.exists(src):
        print("오디오가 없다: %s" % src)
        return 1

    ok, sec, msg = check_duration(src)
    print("오디오: %s" % os.path.basename(src))
    print("  길이: %s" % ("%.2f초" % sec if sec is not None else "미측정"))
    if msg:
        print("  %s" % msg)
    if not ok:
        return 1

    print("  참조 텍스트: %s" % args.ref)
    print("  EnableMiscue: %s" % str(args.enable_miscue).lower())
    print()

    if args.dry_run:
        print("계획만 출력했다. 호출은 나가지 않았다.")
        return 0

    if not engine.available():
        print("필요한 값이 아직 없다: " + ", ".join(engine.required_keys))
        for line in engine.setup_hint:
            print("  " + line)
        return 1

    tmp = tempfile.mkdtemp(prefix="naruve-probe-")
    try:
        wav = to_wav16k(src, tmp)
        print("변환: %s (임시 폴더, 저장소 밖)" % tmp)
        try:
            raw = engine.assess(wav, args.ref, args.enable_miscue)
        except NotConfigured as e:
            print("설정 없음: %s" % e)
            return 1
        except Exception as e:  # 원인을 그대로 보여준다. 삼키지 않는다.
            print("실패: %s" % e)
            return 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    item_id = args.label or slug(os.path.splitext(os.path.basename(src))[0])
    out_path = os.path.join(
        OUT_ADHOC,
        "%s__%s__miscue-%s.json" % (engine_name, item_id, str(args.enable_miscue).lower()),
    )
    record = {
        "engine": engine_name,
        "mode": "adhoc",
        "id": item_id,
        "ref_text": args.ref,
        "enable_miscue": bool(args.enable_miscue),
        "engine_config": engine.last_config,
        "audio_file": os.path.basename(src),
        "audio_seconds": sec,
        "response": raw,
    }
    save_record(out_path, record)
    print("저장: %s" % out_path)
    return 0


def run_set(engine, engine_name, args, vendor):
    items = load_probe_set()
    by_id = items_by_id(items)

    print("엔진: %s   음성 벤더: %s   EnableMiscue: %s"
          % (engine_name, vendor, str(args.enable_miscue).lower()))

    plan = []
    missing = []
    toolong = []
    for it in items:
        path = audio_for(it, by_id, vendor)
        if path is None:
            missing.append(it["id"])
            continue
        ok, sec, msg = check_duration(path)
        if not ok:
            toolong.append((it["id"], msg))
            continue
        plan.append((it, path))

    for it, path in plan:
        tag = " (오디오 재사용: %s)" % it["audio_from"] if it.get("audio_from") else ""
        print("  %-12s ref=%-16s %s%s" % (it["id"], it["ref_text"], os.path.basename(path), tag))
    if missing:
        print()
        print("음성이 없어 건너뛸 항목: " + ", ".join(missing))
        print("  scripts/tts_gen.py → scripts/prep_audio.sh 를 먼저 돌린다.")
    for item_id, msg in toolong:
        print()
        print("길이 초과로 건너뜀 %s: %s" % (item_id, msg))
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
    ok_count = 0
    for it, path in plan:
        out_path = os.path.join(OUT_RAW, "%s__%s__%s.json" % (engine_name, it["id"], vendor))
        if os.path.exists(out_path) and not args.force:
            print("  건너뜀(이미 있음): %s" % os.path.basename(out_path))
            continue
        try:
            raw = engine.assess(path, it["ref_text"], args.enable_miscue)
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
            "mode": "set",
            "id": it["id"],
            "tts_vendor": vendor,
            "ref_text": it["ref_text"],
            "tts_text": it.get("tts_text"),
            "error_type": it["error_type"],
            "target_word": it.get("target_word"),
            "enable_miscue": bool(args.enable_miscue),
            "engine_config": engine.last_config,
            "audio_file": os.path.basename(path),
            "response": raw,
        }
        save_record(out_path, record)
        ok_count += 1
        print("  저장 %s" % os.path.basename(out_path))

    print()
    print("%d건 저장. out/raw/" % ok_count)
    print("표는 scripts/pa_report.py 가 만든다.")
    return 0


def main():
    ap = argparse.ArgumentParser(description="발음평가 프로브 실행")
    ap.add_argument("--engine", default=None, help="기본값 azure. " + " / ".join(adapters.names()))
    ap.add_argument("--vendor", default=None, help="평가할 음성을 만든 TTS 벤더. 기본값은 .env의 TTS_VENDOR")
    ap.add_argument("--enable-miscue", required=True, type=parse_bool, metavar="true|false",
                    help="필수. false면 강제 정렬 모드다 — 기본값을 두지 않는다")
    ap.add_argument("--audio", default=None, help="단발 모드: 평가할 오디오 경로 (m4a/wav 등)")
    ap.add_argument("--ref", default=None, help="단발 모드: 참조 텍스트")
    ap.add_argument("--label", default=None, help="단발 모드: 결과 파일에 쓸 이름 (기본은 파일명)")
    ap.add_argument("--dry-run", action="store_true", help="호출 계획만 출력")
    ap.add_argument("--force", action="store_true", help="이미 있는 결과도 다시 부른다")
    args = ap.parse_args()

    load_env()
    engine_name = args.engine or os.environ.get("PROBE_ENGINE", "azure")

    try:
        engine = adapters.get(engine_name)
    except KeyError as e:
        print(str(e))
        return 0

    if getattr(engine, "is_stub", False):
        print("엔진: %s" % engine_name)
        print()
        print("이 어댑터는 아직 골격이다. 호출하지 않는다.")
        for line in engine.setup_hint:
            print("  " + line)
        print()
        print("  scripts/adapters/%s.py 의 TODO를 먼저 해결한다." % engine_name)
        return 0

    if args.audio or args.ref:
        if not (args.audio and args.ref):
            print("단발 모드는 --audio와 --ref를 함께 준다.")
            return 1
        return run_adhoc(engine, engine_name, args)

    vendor = args.vendor or os.environ.get("TTS_VENDOR")
    if not vendor:
        print("어느 TTS로 만든 음성인지 알아야 파일을 찾는다.")
        print("  --vendor elevenlabs  또는 .env의 TTS_VENDOR를 채운다.")
        return 0
    return run_set(engine, engine_name, args, vendor)


if __name__ == "__main__":
    sys.exit(main())
