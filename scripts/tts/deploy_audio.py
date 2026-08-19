#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
확정본을 앱에 넣는다 — final 폴더 → docs/audio/{m,f}/{hash}.mp3 + index.json.

    python scripts/tts/deploy_audio.py --final "D:/aihub_work/tts_typecast_final_20260819"

`docs/audio/`는 GitHub Pages로 그대로 배포되는 자리다. 파일명은 문장 해시이고
`docs/js/audio.js`의 `audioName()`이 같은 값을 계산한다. 한쪽만 바뀌면 앱이
파일을 못 찾아 조용히 기기 TTS로 떨어진다 — 그래서 여기서 해시를 다시 계산해
대조하고, 어긋나면 멈춘다.

보이스 폴더는 성별 한 글자다. male → m, female → f. 앱의 `naruve.voice`가
그 값을 그대로 쓴다.

`index.json`은 "이 문장은 파일이 있다"를 앱에 알려 주는 목록이다. 없으면
앱이 매번 없는 파일을 요청하게 된다. 여기서 같이 만든다.

기존 파일은 지우고 다시 깐다 — 문장이 바뀌면 해시가 바뀌어 옛 파일이 남는데,
그것은 아무도 참조하지 않는 죽은 용량이다.
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

GENDER_DIR = {"male": "m", "female": "f"}


def audio_hash(k):
    """docs/js/audio.js audioName() 과 같은 계산."""
    h = 0x811c9dc5
    for ch in k:
        h ^= ord(ch)
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) & 0xFFFFFFFF
    return f"{h:08x}"


def main():
    ap = argparse.ArgumentParser(description="확정본을 docs/audio/ 로 배치")
    ap.add_argument("--final", required=True)
    ap.add_argument("--docs", default=str(REPO / "docs"))
    ap.add_argument("--keep-old", action="store_true",
                    help="기존 mp3를 지우지 않는다 (기본은 지우고 다시 깐다)")
    args = ap.parse_args()

    final = Path(args.final)
    docs = Path(args.docs)
    adir = docs / "audio"
    meta = json.loads((final / "manifest.json").read_text(encoding="utf-8"))
    records = meta["records"]
    voices = {v["name"]: v for v in meta["voices"]}

    # 성별 → 한 글자. voices.json의 gender_ko(남/여)로 되짚는다.
    vdir = {}
    for name, v in voices.items():
        g = {"남": "m", "여": "f"}.get(v.get("gender_ko"))
        if not g:
            sys.exit(f"{name}: gender_ko가 남/여가 아니다 — {v.get('gender_ko')!r}")
        vdir[name] = g
    if len(set(vdir.values())) != len(vdir):
        sys.exit(f"보이스 폴더가 겹친다: {vdir}")

    # 해시 재계산 대조. 여기서 걸러야 앱에서 조용히 실패하지 않는다.
    bad = [r for r in records if audio_hash(r["text_screen"]) != r["hash"]]
    if bad:
        for r in bad[:5]:
            print(f"  해시 불일치 {r['sentence_id']}: 기록 {r['hash']} / 재계산 {audio_hash(r['text_screen'])}")
        sys.exit("멈춘다 — docs/js/audio.js audioName()과 파일명이 어긋난다.")

    if adir.exists() and not args.keep_old:
        old = list(adir.rglob("*.mp3"))
        for p in old:
            p.unlink()
        print(f"기존 mp3 {len(old)}개 정리")

    listed, total = [], 0
    for r in records:
        g = vdir[r["voice"]]
        src = final / r["file"]
        if not src.exists() or src.stat().st_size == 0:
            sys.exit(f"원본이 없거나 비었다: {src}")
        dst = adir / g / f"{r['hash']}.mp3"
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        rel = f"{g}/{r['hash']}.mp3"
        listed.append(rel)
        total += dst.stat().st_size

    if len(set(listed)) != len(listed):
        sys.exit("같은 경로가 두 번 나온다 — 해시 충돌이다.")

    (adir / "index.json").write_text(
        json.dumps(sorted(listed), ensure_ascii=False, indent=0), encoding="utf-8")

    on_disk = sorted(p.relative_to(adir).as_posix() for p in adir.rglob("*.mp3"))
    if on_disk != sorted(listed):
        sys.exit(f"폴더와 목록이 다르다: 폴더 {len(on_disk)} / 목록 {len(listed)}")

    per = {}
    for rel in listed:
        per[rel.split("/")[0]] = per.get(rel.split("/")[0], 0) + 1

    print(f"mp3 {len(listed)}개 배치 · {total/1e6:.2f} MB")
    print(f"  보이스별: {per}")
    print(f"  index.json {len(listed)}줄 · "
          f"{(adir/'index.json').stat().st_size/1024:.1f} KB")
    print(f"  docs/audio 총 {sum(p.stat().st_size for p in adir.rglob('*') if p.is_file())/1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
