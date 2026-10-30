"""앱 글꼴을 만든다 — DECISIONS 21.6 · 21.7 · 21.9.

  python scripts/fonts_subset.py      (npm run fonts)

하는 일
  1. 마루 부리(SemiBold·Bold)에서 앱이 쓰는 글자만 남긴 woff2를 만든다.
     MaruBuri는 네이버의 예약 글꼴 이름(RFN)이라, 잘라 낸 수정본은 이름을
     NaruveSerif로 바꾼다(OFL 3항). 저작권 표시(name ID 0)는 그대로 둔다.
  2. Pretendard(Medium·SemiBold·Bold)에서 같은 글자만 남긴 조작용 고딕을 만든다(DECISIONS 21.9).
     Pretendard는 예약 글꼴 이름(RFN)이라 잘라 낸 수정본은 이름을 NaruveSans로 바꾼다(OFL 3항).
     원본은 npm pretendard(devDependency)의 woff2다. 라틴은 넣지 않는다(Archivo가 그린다).
     ~~학교안심 알림장 B → NaruveGothic (21.7)~~ ← 21.9로 대체. 받아 둔 캐시(scripts/.font-cache)는 더 쓰지 않는다.
  3. Archivo 라틴 네 굵기를 @fontsource/archivo에서 그대로 복사한다.
  4. docs/fonts/LICENSE.txt(세 글꼴의 저작권 + OFL 전문)를 만든다.
  5. docs/fonts/naruve-serif.chars.txt에 서브셋에 넣은 한글을 적는다.
     check_docs.mjs가 이 목록과 앱의 한글을 대조한다. 두 한글 글꼴(NaruveSerif · NaruveSans)은 같은 글자를 담는다.

필요한 것: Python 3 + fonttools + brotli, npm install(devDependencies).
"""
import pathlib
import re
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "fonts"
MB_SRC = ROOT / "node_modules" / "@kfonts" / "maruburi" / "src"
AR_SRC = ROOT / "node_modules" / "@fontsource" / "archivo"
PR_SRC = ROOT / "node_modules" / "pretendard" / "dist"

# CSS 굵기 → 원본 파일. --kr은 500과 700에만 쓰인다(app.css).
SERIF = {500: ("MaruBuri-SemiBold.ttf", "SemiBold"), 700: ("MaruBuri-Bold.ttf", "Bold")}
# CSS 굵기 → 원본 파일. --ui · --hd의 한글. 400 자리는 가장 가까운 500으로 그려진다.
SANS = {500: ("Pretendard-Medium.woff2", "Medium"), 600: ("Pretendard-SemiBold.woff2", "SemiBold"),
        700: ("Pretendard-Bold.woff2", "Bold")}
ARCHIVO = [400, 500, 600, 700]
FAMILY = "NaruveSerif"
SANS_FAMILY = "NaruveSans"
PUNCT = "·×–—…→−‘’“”"
EXTRA = "".join(chr(c) for c in range(0x20, 0x7F)) + PUNCT
# NaruveSans에는 라틴을 넣지 않는다 — 라틴은 어디서나 Archivo가 먼저 그린다(--ui · --hd 순서).
# 넣으면 Pretendard의 라틴 대체 글리프까지 딸려 와 굵기당 약 18KB가 는다(2026-10-30 실측).
HANGUL = re.compile(r"[가-힣ㄱ-ㆎ]")

NAVER_NOTICE = (
    "Copyright (c) 2010, NAVER Corporation (https://www.navercorp.com/) with Reserved Font Name "
    "Nanum, Naver Nanum, NanumGothic, Naver NanumGothic, NanumMyeongjo, Naver NanumMyeongjo, "
    "NanumBrush, Naver NanumBrush, NanumPen, Naver NanumPen, Naver NanumGothicEco, NanumGothicEco, "
    "Naver NanumMyeongjoEco, NanumMyeongjoEco, Naver NanumGothicLight, NanumGothicLight, "
    "NanumBarunGothic, Naver NanumBarunGothic, NanumSquareRound, NanumBarunPen, MaruBuri, NanumSquareNeo"
)

# 주석 속 한글은 화면에 나오지 않는다. check_docs.mjs 검사 4가 **같은 규칙**으로 센다 —
# 한쪽만 바꾸면 검사가 거짓으로 실패하거나 통과한다.
COMMENTS = [re.compile(r"/\*[\s\S]*?\*/"), re.compile(r"^[ \t]*//.*$", re.M), re.compile(r"<!--[\s\S]*?-->")]


def app_hangul():
    """앱 화면에 나올 수 있는 한글 — index.html과 docs/js/*.js에서 주석을 뺀 전부."""
    files = [DOCS / "index.html", *sorted((DOCS / "js").glob("*.js"))]
    found = set()
    for f in files:
        src = f.read_text(encoding="utf-8")
        for c in COMMENTS:
            src = c.sub("", src)
        found.update(HANGUL.findall(src))
    return "".join(sorted(found))


def rename(font, style, family=FAMILY, origin="MaruBuri 2.000 by NAVER", banned=("MaruBuri", "마루")):
    name = font["name"]
    copyright_ = name.getDebugName(0)
    version = name.getDebugName(5)
    name.names = []  # 원본 이름(한국어 포함)을 모두 지우고 새로 쓴다
    full = f"{family} {style}"
    ps = f"{family}-{style}"
    for nid, val in {
        0: copyright_,
        1: family,
        2: "Regular",
        3: f"{version.split(';')[0].replace('Version ', '')};NRVS;{ps}",
        4: full,
        5: version,
        6: ps,
        13: "This Font Software is licensed under the SIL Open Font License, Version 1.1. "
            f"Modified Version (subset, renamed) of {origin}.",
        14: "https://openfontlicense.org",
        16: family,
        17: style,
    }.items():
        name.setName(val, nid, 3, 1, 0x409)
    # 원래 이름이 "사용자에게 보이는 글꼴 이름" 칸에 남으면 안 된다 (OFL 3항 · 상표).
    # 13번(라이선스 설명)에 출처를 밝히는 것은 4항이 허용하는 기여 표시라 검사하지 않는다.
    shown = {1, 3, 4, 6, 16, 17, 18, 21, 22}
    left = [r.toUnicode() for r in name.names
            if r.nameID in shown and any(b in r.toUnicode() for b in banned)]
    if left:
        sys.exit(f"이름이 남았다: {left}")



def subset_to(font, text):
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.flavor = "woff2"
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    return font


def main():
    if not MB_SRC.is_dir() or not AR_SRC.is_dir() or not PR_SRC.is_dir():
        sys.exit("node_modules에 글꼴 원본이 없다 — npm install 먼저")
    OUT.mkdir(parents=True, exist_ok=True)

    hangul = app_hangul()
    text = hangul + EXTRA
    for weight, (src, style) in SERIF.items():
        font = subset_to(TTFont(MB_SRC / src), text)
        rename(font, style)
        font.flavor = "woff2"
        dst = OUT / f"naruve-serif-{weight}.woff2"
        font.save(dst)
        print(f"{dst.relative_to(ROOT)}  {dst.stat().st_size // 1024}KB")

    for weight, (src, style) in SANS.items():
        font = subset_to(TTFont(PR_SRC / "web" / "static" / "woff2" / src), hangul + PUNCT)
        rename(font, style, family=SANS_FAMILY, origin="Pretendard 1.3.9 by Kil Hyung-jin",
               banned=("Pretendard", "프리텐다드"))
        font.flavor = "woff2"
        dst = OUT / f"naruve-sans-{weight}.woff2"
        font.save(dst)
        print(f"{dst.relative_to(ROOT)}  {dst.stat().st_size // 1024}KB")

    (OUT / "naruve-serif.chars.txt").write_text(hangul + "\n", encoding="utf-8")
    print(f"한글 {len(hangul)}자")

    for w in ARCHIVO:
        src = AR_SRC / "files" / f"archivo-latin-{w}-normal.woff2"
        dst = OUT / f"archivo-{w}.woff2"
        shutil.copyfile(src, dst)
        print(f"{dst.relative_to(ROOT)}  {dst.stat().st_size // 1024}KB")

    ar_license = (AR_SRC / "LICENSE").read_text(encoding="utf-8").replace("\r\n", "\n")
    cut = ar_license.index("-----------------------------------------------------------\nSIL OPEN FONT LICENSE")
    ofl_body = ar_license[cut:]
    serif_part = (
        "NaruveSerif (docs/fonts/naruve-serif-*.woff2)\n"
        "Modified Version (subset, renamed) of MaruBuri 2.000.\n"
        "MaruBuri is a Reserved Font Name; this derivative does not use it.\n\n"
        "(c) NAVER Corp. (c) NAVER Cultural Foundation Corp.\n"
        f"{NAVER_NOTICE}\n\n"
        "This Font Software is licensed under the SIL Open Font License, Version 1.1.\n"
        "This license is copied below, and is also available with a FAQ at:\n"
        "https://openfontlicense.org\n\n\n"
        + ofl_body
    )
    pr_license = (PR_SRC / "LICENSE.txt").read_text(encoding="utf-8").replace("\r\n", "\n")
    sans_part = (
        "NaruveSans (docs/fonts/naruve-sans-*.woff2)\n"
        "Modified Version (subset, renamed) of Pretendard 1.3.9.\n"
        "Pretendard is a Reserved Font Name; this derivative does not use it.\n\n"
        + pr_license.split("\n\n")[0] + "\n\n"
        "This Font Software is licensed under the SIL Open Font License, Version 1.1.\n"
        "The license text is the same OFL 1.1 reproduced above.\n"
    )
    archivo_part = "Archivo (docs/fonts/archivo-*.woff2)\n\n" + ar_license
    (OUT / "LICENSE.txt").write_text(
        serif_part.rstrip() + "\n\n\n" + "=" * 59 + "\n\n" + sans_part.rstrip() + "\n\n\n"
        + "=" * 59 + "\n\n" + archivo_part.rstrip() + "\n",
        encoding="utf-8", newline="\n")
    print("docs/fonts/LICENSE.txt")


if __name__ == "__main__":
    main()
