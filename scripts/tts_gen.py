#!/usr/bin/env python3
"""probe_set.json의 tts_text를 음성으로 만든다.

  python3 scripts/tts_gen.py                # .env의 TTS_VENDOR
  python3 scripts/tts_gen.py --vendor azure
  python3 scripts/tts_gen.py --vendor elevenlabs
  python3 scripts/tts_gen.py --list         # 무엇을 만들지만 보여준다

출력: out/tts/<id>__<vendor>.mp3

벤더 이름이 파일명에 들어가는 이유는 DECISIONS.md 8.5의 벤더 편향
측정 때문이다. Azure TTS로 만든 음성을 Azure 발음평가에 넣으면 같은
회사 음향 특성이라 점수가 부풀 수 있다. 같은 문장을 두 벤더로 뽑아
점수 차를 봐야 그 크기를 안다. 그래서 한 벤더가 다른 벤더를
덮어쓰면 안 된다.

audio_from이 있는 항목은 건너뛴다. 그건 오디오를 새로 만드는 항목이
아니라 같은 오디오에 참조 텍스트만 바꿔 재호출하는 항목이다.
지금은 그런 항목이 없다 — 표기형/표준발음형 판별용이던 s2_alt_ref는
2026-08-07 실측으로 답이 나와 제거됐다. 오류 가설 재채점을 프로브로
재볼 때 같은 방식으로 다시 쓴다.

DECISIONS.md 9절 5번: 표기를 비튼 입력을 교정하지 않고 쓰인 대로
읽는 벤더여야 한다. 반가씀니다를 반갑습니다로 되돌려 읽어버리면
오류 샘플이 만들어지지 않는다. 생성 후 반드시 귀로 확인한다.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_common import (  # noqa: E402
    OUT_TTS,
    ensure_dirs,
    load_env,
    load_probe_set,
    need_keys,
)

VENDORS = ("elevenlabs", "azure")

# ko-KR 다화자 음성. 바꾸려면 .env에서 덮어쓴다.
ELEVEN_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"
AZURE_DEFAULT_VOICE = "ko-KR-SunHiNeural"


def post(url, data, headers, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def synth_elevenlabs(text, out_path):
    key = os.environ["ELEVENLABS_API_KEY"]
    voice = os.environ.get("ELEVENLABS_VOICE_ID", ELEVEN_DEFAULT_VOICE)
    model = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
    url = "https://api.elevenlabs.io/v1/text-to-speech/" + voice
    body = json.dumps({"text": text, "model_id": model}).encode("utf-8")
    audio = post(
        url,
        body,
        {
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    with open(out_path, "wb") as fh:
        fh.write(audio)


def synth_azure(text, out_path):
    """Azure TTS. SSML로 보낸다.

    주의: <phoneme>이나 lexicon을 쓰지 않는다. 표기를 비튼 문자열을
    그대로 넘겨 벤더가 어떻게 읽는지를 봐야 하기 때문이다. 여기서
    발음을 명시해 버리면 9절 5번 검사가 무의미해진다.
    """
    key = os.environ["SPEECH_KEY"]
    region = os.environ["SPEECH_REGION"]
    voice = os.environ.get("AZURE_TTS_VOICE", AZURE_DEFAULT_VOICE)
    url = "https://%s.tts.speech.microsoft.com/cognitiveservices/v1" % region
    ssml = (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        'xml:lang="ko-KR"><voice name="%s">%s</voice></speak>' % (voice, _xml_escape(text))
    )
    audio = post(
        url,
        ssml.encode("utf-8"),
        {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "naruve-probe",
        },
    )
    with open(out_path, "wb") as fh:
        fh.write(audio)


def _xml_escape(s):
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


REQUIREMENTS = {
    "elevenlabs": (
        ["ELEVENLABS_API_KEY"],
        [
            "ElevenLabs 대시보드 → Profile → API Key",
            "유료 플랜에서 생성한 것이어야 한다. DECISIONS.md 9절 —",
            "무료 플랜 출력물은 상업 이용이 불가하다.",
            "음성을 바꾸려면 ELEVENLABS_VOICE_ID도 넣는다.",
        ],
    ),
    "azure": (
        ["SPEECH_KEY", "SPEECH_REGION"],
        [
            "Azure Portal → Speech 리소스 → Keys and Endpoint",
            "SPEECH_REGION은 koreacentral 같은 지역 코드다.",
            "음성을 바꾸려면 AZURE_TTS_VOICE도 넣는다.",
        ],
    ),
}

SYNTH = {"elevenlabs": synth_elevenlabs, "azure": synth_azure}


def main():
    ap = argparse.ArgumentParser(description="프로브 세트 TTS 생성")
    ap.add_argument("--vendor", choices=VENDORS, help="기본값은 .env의 TTS_VENDOR")
    ap.add_argument("--list", action="store_true", help="생성 계획만 출력")
    ap.add_argument("--force", action="store_true", help="이미 있는 파일도 다시 만든다")
    args = ap.parse_args()

    load_env()
    vendor = args.vendor or os.environ.get("TTS_VENDOR")
    if not vendor:
        print("벤더가 정해지지 않았다. --vendor 로 주거나 .env의 TTS_VENDOR를 채운다.")
        print("  가능한 값: " + " / ".join(VENDORS))
        return 0
    if vendor not in VENDORS:
        print("모르는 벤더: %s  (가능한 값: %s)" % (vendor, " / ".join(VENDORS)))
        return 0

    items = [it for it in load_probe_set() if it.get("tts_text")]
    skipped = [it["id"] for it in load_probe_set() if not it.get("tts_text")]

    print("벤더: %s" % vendor)
    print("만들 항목: %d개" % len(items))
    for it in items:
        print("  %-12s %s" % (it["id"], it["tts_text"]))
    if skipped:
        print("건너뜀(오디오를 새로 만들지 않는 항목): " + ", ".join(skipped))
    print()

    if args.list:
        return 0

    required, how = REQUIREMENTS[vendor]
    if need_keys(required, how):
        return 0

    ensure_dirs(OUT_TTS)
    made = 0
    for it in items:
        out_path = os.path.join(OUT_TTS, "%s__%s.mp3" % (it["id"], vendor))
        if os.path.exists(out_path) and not args.force:
            print("  건너뜀(이미 있음): %s" % os.path.basename(out_path))
            continue
        try:
            SYNTH[vendor](it["tts_text"], out_path)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:400]
            print("  실패 %s: HTTP %s %s" % (it["id"], e.code, body))
            continue
        except urllib.error.URLError as e:
            print("  실패 %s: %s" % (it["id"], e.reason))
            print("  egress 정책에 막힌 것일 수 있다. PROBE.md의 도메인 목록을 확인한다.")
            return 0
        made += 1
        print("  생성 %s  (%d bytes)" % (os.path.basename(out_path), os.path.getsize(out_path)))

    print()
    print("%d개 생성. out/tts/" % made)
    print("반드시 귀로 확인한다 — 비튼 표기를 벤더가 교정해 읽었으면 그 오류 샘플은 못 쓴다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
