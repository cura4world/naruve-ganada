"""앱 글꼴을 만든다 — DECISIONS 21.6 · 21.7.

  python scripts/fonts_subset.py      (npm run fonts)

하는 일
  1. 마루 부리(SemiBold·Bold)에서 앱이 쓰는 글자만 남긴 woff2를 만든다.
     MaruBuri는 네이버의 예약 글꼴 이름(RFN)이라, 잘라 낸 수정본은 이름을
     NaruveSerif로 바꾼다(OFL 3항). 저작권 표시(name ID 0)는 그대로 둔다.
  2. 학교안심 알림장 B에서 같은 글자만 남긴 제목용 고딕을 만든다(DECISIONS 21.7).
     "Hakgyoansim Allimjang"은 KERIS 상표라 이름을 NaruveGothic으로 바꾼다.
     원본 TTF는 고정 커밋에서 받아 sha256을 대조한다(scripts/.font-cache, 커밋하지 않음).
  3. Archivo 라틴 네 굵기를 @fontsource/archivo에서 그대로 복사한다.
  4. docs/fonts/LICENSE.txt(세 글꼴의 저작권 + OFL 전문)를 만든다.
  5. docs/fonts/naruve-serif.chars.txt에 서브셋에 넣은 한글을 적는다.
     check_docs.mjs가 이 목록과 앱의 한글을 대조한다. 두 한글 글꼴은 같은 글자를 담는다.

필요한 것: Python 3 + fonttools + brotli, npm install(devDependencies), 첫 실행 때 네트워크.
"""
import hashlib
import pathlib
import re
import shutil
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "fonts"
MB_SRC = ROOT / "node_modules" / "@kfonts" / "maruburi" / "src"
AR_SRC = ROOT / "node_modules" / "@fontsource" / "archivo"

# CSS 굵기 → 원본 파일. --kr은 500과 700에만 쓰인다(app.css).
SERIF = {500: ("MaruBuri-SemiBold.ttf", "SemiBold"), 700: ("MaruBuri-Bold.ttf", "Bold")}
ARCHIVO = [400, 500, 600, 700]
FAMILY = "NaruveSerif"
GOTHIC_FAMILY = "NaruveGothic"
GOTHIC_URL = ("https://raw.githubusercontent.com/fonts-archive/HakgyoansimAllimjang/"
              "d818335167906730db4fc240683c91fd323e6446/HakgyoansimAllimjang-B.ttf")
GOTHIC_SHA256 = "6c99fc277790f100a44908e27d68cb2d2060fd56690d0085cc562c85898a149f"
CACHE = ROOT / "scripts" / ".font-cache"
EXTRA = "".join(chr(c) for c in range(0x20, 0x7F)) + "·×–—…→−‘’“”"
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


def gothic_source():
    CACHE.mkdir(parents=True, exist_ok=True)
    src = CACHE / "HakgyoansimAllimjang-B.ttf"
    if not src.exists():
        print("학교안심 알림장 B 원본을 받는다 …")
        urllib.request.urlretrieve(GOTHIC_URL, src)
    digest = hashlib.sha256(src.read_bytes()).hexdigest()
    if digest != GOTHIC_SHA256:
        src.unlink()
        sys.exit(f"학교안심 알림장 원본 sha256 불일치: {digest}")
    return src


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
    if not MB_SRC.is_dir() or not AR_SRC.is_dir():
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

    font = subset_to(TTFont(gothic_source()), text)
    # 원본 0번 칸은 저작권 표시라 그대로 둔다. OFL 근거와 출처는 LICENSE.txt에 적는다.
    rename(font, "Bold", family=GOTHIC_FAMILY, origin="Hakgyoansim Allimjang B by KERIS",
           banned=("Hakgyoansim", "Allimjang", "학교안심", "알림장"))
    for nid in (7, 8, 9, 11):  # 상표·제작사 칸은 rename이 이미 비웠다. 남아 있으면 지운다
        font["name"].removeNames(nameID=nid)
    font.flavor = "woff2"
    dst = OUT / "naruve-gothic-700.woff2"
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
    gothic_part = (
        "NaruveGothic (docs/fonts/naruve-gothic-700.woff2)\n"
        "Modified Version (subset, renamed) of Hakgyoansim Allimjang B.\n"
        "Source: Korea Education and Research Information Service (KERIS).\n"
        "Hakgyoansim Allimjang is a trademark of KERIS; this derivative does not use the name.\n"
        "Copyright (c) KERIS. Designed by Heumm Design.\n"
        "Distributed by KERIS under the SIL Open Font License, Version 1.1 (KERIS copyright support\n"
        "center and KOGL listing). The license text is the same OFL 1.1 reproduced above.\n"
    )
    archivo_part = "Archivo (docs/fonts/archivo-*.woff2)\n\n" + ar_license
    (OUT / "LICENSE.txt").write_text(
        serif_part.rstrip() + "\n\n\n" + "=" * 59 + "\n\n" + gothic_part.rstrip() + "\n\n\n"
        + "=" * 59 + "\n\n" + archivo_part.rstrip() + "\n",
        encoding="utf-8", newline="\n")
    print("docs/fonts/LICENSE.txt")


if __name__ == "__main__":
    main()
