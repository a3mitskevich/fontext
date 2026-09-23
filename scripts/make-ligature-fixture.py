# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools>=4.50"]
# ///
"""Builds assets/font-multi-ligature-lookups.ttf, a test font whose ligatures are split
across several GSUB subtables and lookups (the shape real icon fonts often have).

  lookup 1, subtable 1:  a b c -> U+E001
  lookup 1, subtable 2:  d e f -> U+E002
  lookup 2:              g h i -> U+E003
  lookup 3 (extension):  j k l -> U+E004

Run: uv run scripts/make-ligature-fixture.py
"""

from pathlib import Path

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UNITS_PER_EM = 1000
ADVANCE = 600
OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "font-multi-ligature-lookups.ttf"

LETTERS = list("abcdefghijkl")
LIGATURES = {"lig_abc": 0xE001, "lig_def": 0xE002, "lig_ghi": 0xE003, "lig_jkl": 0xE004}

FEATURES = """
languagesystem DFLT dflt;

lookup SPLIT_SUBTABLES {
  sub a b c by lig_abc;
  subtable;
  sub d e f by lig_def;
} SPLIT_SUBTABLES;

lookup SECOND_LOOKUP {
  sub g h i by lig_ghi;
} SECOND_LOOKUP;

lookup EXTENSION_LOOKUP useExtension {
  sub j k l by lig_jkl;
} EXTENSION_LOOKUP;

feature liga {
  lookup SPLIT_SUBTABLES;
  lookup SECOND_LOOKUP;
  lookup EXTENSION_LOOKUP;
} liga;
"""


def box(inset: int):
    pen = TTGlyphPen(None)
    pen.moveTo((inset, inset))
    pen.lineTo((inset, 700 - inset))
    pen.lineTo((ADVANCE - inset, 700 - inset))
    pen.lineTo((ADVANCE - inset, inset))
    pen.closePath()
    return pen.glyph()


def empty():
    return TTGlyphPen(None).glyph()


def main() -> None:
    glyph_order = [".notdef", "space", *LETTERS, *LIGATURES]
    cmap = {ord(" "): "space", **{ord(ch): ch for ch in LETTERS}}
    cmap.update({code: name for name, code in LIGATURES.items()})

    glyphs = {".notdef": box(50), "space": empty()}
    glyphs.update({ch: box(100 + i * 10) for i, ch in enumerate(LETTERS)})
    glyphs.update({name: box(20) for name in LIGATURES})

    fb = FontBuilder(UNITS_PER_EM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({name: (ADVANCE, 0) for name in glyph_order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Fontext Fixture", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    addOpenTypeFeaturesFromString(fb.font, FEATURES)
    fb.save(OUTPUT)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
