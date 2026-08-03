"""프로브 스크립트 공용 부분.

세 스크립트(tts_gen / pa_probe / pa_report)가 같은 .env 파서와 같은
경로 규칙을 쓴다. 세 군데에 복사해 두면 한 곳만 고쳤을 때 조용히
어긋난다.

의존 패키지를 쓰지 않는다. python-dotenv도, requests도 없다.
프로브는 PC 앞에 앉아 한 번 돌리는 물건이라, pip install부터 막히면
그 자리에서 흐름이 끊긴다.
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROBE_SET = os.path.join(ROOT, "data", "probe_set.json")
OUT = os.path.join(ROOT, "out")
OUT_TTS = os.path.join(OUT, "tts")
OUT_WAV = os.path.join(OUT, "wav")
OUT_RAW = os.path.join(OUT, "raw")


def load_env(path=None):
    """.env를 읽어 os.environ에 없는 키만 채운다.

    이미 셸에 export된 값이 이긴다. 일회성으로 다른 키를 쓰고 싶을 때
    .env를 고치지 않고 앞에 붙일 수 있어야 한다.
    """
    path = path or os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        return {}
    found = {}
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            found[key] = val
            os.environ.setdefault(key, val)
    return found


def load_probe_set(path=None):
    with open(path or PROBE_SET, "r", encoding="utf-8") as fh:
        return json.load(fh)["items"]


def items_by_id(items):
    return {it["id"]: it for it in items}


def pair_key(item_id):
    """s1_ok / s1_batchim → 's1'. (C) 표에서 쌍을 묶는 기준."""
    return item_id.split("_", 1)[0]


def ensure_dirs(*paths):
    for p in paths:
        os.makedirs(p, exist_ok=True)


def missing_keys(required):
    """required 중 값이 비어 있는 환경변수 이름 목록."""
    return [k for k in required if not os.environ.get(k)]


def need_keys(required, how):
    """키가 없으면 무엇이 필요한지 찍고 True를 준다.

    호출부는 True를 받으면 sys.exit(0)로 정상 종료한다. 키가 없는 것은
    고장이 아니라 아직 준비가 안 된 것이므로 0으로 끝내야 한다 —
    non-zero로 끝내면 셸 스크립트에서 엮을 때 실패로 잡힌다.
    """
    miss = missing_keys(required)
    if not miss:
        return False
    print("필요한 값이 아직 없다: " + ", ".join(miss))
    print()
    for line in how:
        print("  " + line)
    print()
    print("  .env.example을 .env로 복사해 채운다. .env는 .gitignore에 있다.")
    return True


def die(msg):
    print("오류: " + msg, file=sys.stderr)
    sys.exit(1)
