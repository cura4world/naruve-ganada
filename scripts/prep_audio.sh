#!/usr/bin/env bash
# out/tts/*.mp3 → out/wav/*.wav  (16kHz / 16bit / mono PCM)
#
# Azure 발음평가 REST가 받는 형식이 16kHz 16bit mono PCM이다. 여기서
# 한 번 맞춰 두면 어댑터가 형식 변환을 신경 쓰지 않아도 된다.
# 파일명은 그대로 넘긴다 — <id>__<vendor>.wav 로 벤더 구분이 유지된다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/out/tts"
DST="$ROOT/out/wav"

if ! command -v ffmpeg >/dev/null 2>&1; then
  cat <<'EOF'
ffmpeg이 없다. 설치한 뒤 다시 실행한다.

  macOS          brew install ffmpeg
  Ubuntu/Debian  sudo apt install ffmpeg
  Windows        winget install Gyan.FFmpeg
                 (또는 https://ffmpeg.org/download.html)

설치 확인:  ffmpeg -version
EOF
  exit 0
fi

if [[ ! -d "$SRC" ]]; then
  echo "$SRC 가 없다. 먼저 scripts/tts_gen.py 로 음성을 만든다."
  exit 0
fi

shopt -s nullglob
files=("$SRC"/*.mp3)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "$SRC 에 mp3가 없다. 먼저 scripts/tts_gen.py 로 음성을 만든다."
  exit 0
fi

mkdir -p "$DST"
n=0
for f in "${files[@]}"; do
  base="$(basename "$f" .mp3)"
  out="$DST/$base.wav"
  # -y 로 덮어쓴다. 같은 id를 다시 뽑았으면 낡은 wav가 남으면 안 된다.
  ffmpeg -hide_banner -loglevel error -y \
    -i "$f" -ac 1 -ar 16000 -sample_fmt s16 -acodec pcm_s16le "$out"
  n=$((n + 1))
  echo "  $base.mp3 → $base.wav"
done

echo
echo "$n개 변환. $DST"
echo "형식 확인:  ffprobe -hide_banner out/wav/<파일>.wav"
