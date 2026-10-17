"""Logo a ikony EP Watch CZ (oko + oblouk hvězd).

Vývojářský skript, NEběží v CI ani na Vercelu. Výstupy se commitují do public/assets/brand/.
Text loga se převádí na křivky z písma webu (Plus Jakarta Sans, OFL), takže SVG nezávisí na načteném písmu.

    pip install fonttools brotli cairosvg
    python scripts/build_brand.py
"""

from __future__ import annotations

import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public" / "assets" / "fonts"
OUT = ROOT / "public" / "assets" / "brand"

BLUE = "#1E4FA3"    # oko a hvězdy
NAVY = "#14264D"    # „EP“, „CZ“, slogan
WATCH = "#1E4FA3"   # „Watch“
HEADER_BG = "#0F172A"  # --navy z style.css
TAGLINE = "Fakta a data o českých europoslancích"

# --- geometrie symbolu (střed oblouku hvězd = 0,0) ---------------------------------
R = 80             # poloměr oblouku hvězd
STAR_R = 13        # vnější poloměr hvězdy
STAR_ANGLES = [-120, -90, -60, -30, 0, 30, 60, 90, 120]
EYE_CX, EYE_HW = -45, 92   # střed a poloviční šířka oka
SYMBOL_BOX = (-158, -100, 262, 200)  # x, y, w, h (špička oka s ostrým rohem přesahuje)
OX, OY = 158, 100  # posun symbolu v lockupech
SW = 15  # tloušťka obrysu oka
IRIS_R = 40


def star(cx: float, cy: float, r: float) -> str:
    pts = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        rr = r if i % 2 == 0 else r * 0.45
        pts.append(f"{cx + rr * math.cos(a):.2f},{cy + rr * math.sin(a):.2f}")
    return "M" + " L".join(pts) + " Z"


def stars_path(r_ring: float = R, angles=STAR_ANGLES, size: float = STAR_R) -> str:
    return " ".join(star(r_ring * math.cos(math.radians(a)), r_ring * math.sin(math.radians(a)), size) for a in angles)


def eye(color: str, inner: str, sw: float = SW) -> str:
    """Oko: mandlový obrys, duhovka, odlesk. inner = barva bělma (pozadí)."""
    x0, x1 = EYE_CX - EYE_HW, EYE_CX + EYE_HW
    almond = (f"M{x0},0 C{x0 + 27},-70 {x1 - 27},-70 {x1},0 C{x1 - 27},70 {x0 + 27},70 {x0},0 Z")
    return (f'<path d="{almond}" fill="{inner}" stroke="{color}" stroke-width="{sw}" stroke-linejoin="miter"/>'
            f'<circle cx="{EYE_CX}" cy="2" r="{IRIS_R}" fill="{color}"/>'
            f'<circle cx="{EYE_CX - 15}" cy="-13" r="12" fill="{inner}"/>')


def symbol_group(color: str, inner: str, star_color: str | None = None) -> str:
    return f'<g>{eye(color, inner)}<path d="{stars_path()}" fill="{star_color or color}"/></g>'


# --- text na křivky ------------------------------------------------------------------

_fonts: dict = {}


def _font(weight: int):
    if weight not in _fonts:
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
        pair = []
        for name in ("plus-jakarta-sans-latin.woff2", "plus-jakarta-sans-latin-ext.woff2"):
            f = TTFont(FONTS / name)
            pair.append(instantiateVariableFont(f, {"wght": weight}))
        _fonts[weight] = pair
    return _fonts[weight]


def text_path(text: str, weight: int, size: float, x: float = 0, y: float = 0, tracking: float = 0) -> tuple[str, float]:
    """Vrátí (SVG path d, šířka). y = účaří."""
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    fonts = _font(weight)
    upm = fonts[0]["head"].unitsPerEm
    s = size / upm
    parts, cx = [], 0.0
    for ch in text:
        f = next((f for f in fonts if ord(ch) in f.getBestCmap()), None)
        if f is None:
            raise ValueError(f"znak {ch!r} v písmu chybí")
        gname = f.getBestCmap()[ord(ch)]
        gs = f.getGlyphSet()
        pen = SVGPathPen(gs)
        gs[gname].draw(TransformPen(pen, (s, 0, 0, -s, x + cx, y)))
        parts.append(pen.getCommands())
        cx += gs[gname].width * s + tracking
    return " ".join(p for p in parts if p), cx - tracking


def wordmark(x: float, y: float, size: float, ep: str, watch: str, cz: str) -> tuple[str, float]:
    """„EP Watch CZ“: EP a CZ tučně, Watch běžně."""
    out, cx = [], x
    for txt, w, col in (("EP", 800, ep), (" ", 800, ep), ("Watch", 400, watch), (" ", 800, cz), ("CZ", 800, cz)):
        d, wd = text_path(txt, w, size, cx, y, tracking=-size * 0.01)
        if d:
            out.append(f'<path d="{d}" fill="{col}"/>')
        cx += wd
    return "".join(out), cx - x


def svg(w: float, h: float, body: str, vb: tuple | None = None, title: str = "EP Watch CZ") -> str:
    vb = vb or (0, 0, w, h)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:g} {vb[1]:g} {vb[2]:g} {vb[3]:g}" '
            f'width="{w:g}" height="{h:g}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n')


# --- varianty ------------------------------------------------------------------------

VARIANTS = {  # název: (oko/hvězdy, bělmo, EP+CZ, Watch, slogan)
    "": (BLUE, "#FFFFFF", NAVY, WATCH, NAVY),
    "-white": ("#FFFFFF", HEADER_BG, "#FFFFFF", "#FFFFFF", "#CBD5E1"),
    "-black": ("#000000", "#FFFFFF", "#000000", "#000000", "#000000"),
}


def symbol_svg(v: str) -> str:
    c, inner, *_ = VARIANTS[v]
    # u bílé varianty je bělmo průhledné (vidí se pozadí) – „díra“ přes masku
    if v == "-white":
        body = (f'<mask id="m"><rect x="-200" y="-200" width="400" height="400" fill="#fff"/>'
                f'{eye("#000", "#000", 0)}</mask>')
        x0, x1 = EYE_CX - EYE_HW, EYE_CX + EYE_HW
        almond = f"M{x0},0 C{x0 + 27},-70 {x1 - 27},-70 {x1},0 C{x1 - 27},70 {x0 + 27},70 {x0},0 Z"
        body = (f'<path d="{almond}" fill="none" stroke="{c}" stroke-width="{SW}"/>'
                f'<circle cx="{EYE_CX}" cy="2" r="{IRIS_R}" fill="{c}"/>'
                f'<circle cx="{EYE_CX - 15}" cy="-13" r="12" fill="{HEADER_BG}"/>'
                f'<path d="{stars_path()}" fill="{c}"/>')
        return svg(SYMBOL_BOX[2], SYMBOL_BOX[3], body, SYMBOL_BOX)
    return svg(SYMBOL_BOX[2], SYMBOL_BOX[3], symbol_group(c, inner), SYMBOL_BOX)


def symbol_inline(c: str, highlight: str) -> str:
    """Prvky symbolu bez <svg> (pro vložení do jiného SVG); bělmo průhledné."""
    x0, x1 = EYE_CX - EYE_HW, EYE_CX + EYE_HW
    almond = f"M{x0},0 C{x0 + 27},-70 {x1 - 27},-70 {x1},0 C{x1 - 27},70 {x0 + 27},70 {x0},0 Z"
    return (f'<path d="{almond}" fill="none" stroke="{c}" stroke-width="{SW}"/>'
            f'<circle cx="{EYE_CX}" cy="2" r="{IRIS_R}" fill="{c}"/>'
            f'<circle cx="{EYE_CX - 15}" cy="-13" r="12" fill="{highlight}"/>'
            f'<path d="{stars_path()}" fill="{c}"/>')


def horizontal_svg(v: str) -> str:
    c, inner, ep, watch, _ = VARIANTS[v]
    hl = inner if v != "-white" else HEADER_BG
    sym = f'<g transform="translate({OX},{OY})">{symbol_inline(c, hl)}</g>'
    words, ww = wordmark(268, 132, 92, ep, watch, ep)
    return svg(268 + ww + 10, 200, sym + words)


def epcz_svg(v: str) -> str:
    c, inner, ep, *_ = VARIANTS[v]
    hl = inner if v != "-white" else HEADER_BG
    sym = f'<g transform="translate({OX},{OY})">{symbol_inline(c, hl)}</g>'
    d1, w1 = text_path("EP", 800, 82, 266, 86)
    d2, w2 = text_path("CZ", 800, 82, 266, 170)
    return svg(266 + max(w1, w2) + 8, 200, sym + f'<path d="{d1} {d2}" fill="{ep}"/>')


def stacked_svg(v: str) -> str:
    c, inner, ep, watch, tag = VARIANTS[v]
    hl = inner if v != "-white" else HEADER_BG
    mark_w = 266 + text_path("EP", 800, 82)[1] + 8
    words_w = wordmark(0, 0, 96, ep, watch, ep)[1]
    tag_w = text_path(TAGLINE, 500, 34)[1]
    W = max(mark_w, words_w, tag_w) + 40
    mx = (W - mark_w) / 2
    sym = f'<g transform="translate({mx + OX},{OY})">{symbol_inline(c, hl)}</g>'
    d1, _ = text_path("EP", 800, 82, mx + 266, 86)
    d2, _ = text_path("CZ", 800, 82, mx + 266, 170)
    words, _ = wordmark((W - words_w) / 2, 310, 96, ep, watch, ep)
    dt, _ = text_path(TAGLINE, 500, 34, (W - tag_w) / 2, 370)
    return svg(W, 400, sym + f'<path d="{d1} {d2}" fill="{ep}"/>' + words + f'<path d="{dt}" fill="{tag}"/>')


def app_icon_svg(size: int = 512, rounded: bool = True, simple: bool = False, pad: float = 0.16) -> str:
    """Obrácená varianta: bílý symbol na modrém čtverci (favicon, apple-touch, PWA).
    simple = jen oko (pro 16 px, kde by hvězdy splynuly)."""
    rx = size * 0.22 if rounded else 0
    bg = f'<rect width="{size}" height="{size}" rx="{rx:g}" fill="{BLUE}"/>'
    if simple:
        x0, x1 = EYE_CX - EYE_HW, EYE_CX + EYE_HW
        k = size * (1 - 2 * pad) / (EYE_HW * 2 + 12)
        almond = f"M{x0},0 C{x0 + 27},-70 {x1 - 27},-70 {x1},0 C{x1 - 27},70 {x0 + 27},70 {x0},0 Z"
        g = (f'<g transform="translate({size / 2 - EYE_CX * k:.2f},{size / 2:.2f}) scale({k:.4f})">'
             f'<path d="{almond}" fill="none" stroke="#fff" stroke-width="20"/>'
             f'<circle cx="{EYE_CX}" cy="2" r="40" fill="#fff"/></g>')
        return svg(size, size, bg + g)
    k = size * (1 - 2 * pad) / max(SYMBOL_BOX[2], SYMBOL_BOX[3])
    cx = size / 2 - (SYMBOL_BOX[0] + SYMBOL_BOX[2] / 2) * k
    cy = size / 2 - (SYMBOL_BOX[1] + SYMBOL_BOX[3] / 2) * k
    g = f'<g transform="translate({cx:.2f},{cy:.2f}) scale({k:.4f})">{symbol_inline("#FFFFFF", BLUE)}</g>'
    return svg(size, size, bg + g)


def og_svg() -> str:
    """Výchozí náhled odkazu 1200 × 630 (stránky bez vlastního obrázku)."""
    W, H = 1200, 630
    bg = (f'<defs><radialGradient id="g" cx="85%" cy="-10%" r="90%"><stop offset="0" stop-color="#1E3A8A"/>'
          f'<stop offset=".6" stop-color="{HEADER_BG}"/><stop offset="1" stop-color="#0A1226"/></radialGradient></defs>'
          f'<rect width="{W}" height="{H}" fill="url(#g)"/>')
    k = 1.35
    sym = f'<g transform="translate({120 + OX * k},{250}) scale({k})">{symbol_inline("#FFFFFF", HEADER_BG)}</g>'
    words, _ = wordmark(470, 285, 104, "#FFFFFF", "#FFFFFF", "#FFFFFF")
    dt, _ = text_path(TAGLINE, 500, 40, 120, 470)
    d2, _ = text_path("Hlasování, docházka a práce v Evropském parlamentu", 400, 30, 120, 525)
    return svg(W, H, bg + sym + words + f'<path d="{dt}" fill="#F8FAFC"/><path d="{d2}" fill="#94A3B8"/>')


def png(svg_text: str, path: Path, w: int, h: int | None = None) -> None:
    import cairosvg
    cairosvg.svg2png(bytestring=svg_text.encode(), write_to=str(path), output_width=w, output_height=h or w)


def ico(paths: list[Path], out: Path) -> None:
    """favicon.ico se 16 a 32 px (PNG uvnitř ICO)."""
    import struct
    data = [p.read_bytes() for p in paths]
    sizes = [16, 32]
    header = struct.pack("<HHH", 0, 1, len(data))
    offset = 6 + 16 * len(data)
    entries = b""
    for s, d in zip(sizes, data, strict=False):
        entries += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(d), offset)
        offset += len(d)
    out.write_bytes(header + entries + b"".join(data))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for v in VARIANTS:
        (OUT / f"symbol{v}.svg").write_text(symbol_svg(v), encoding="utf-8")
        (OUT / f"logo-horizontal{v}.svg").write_text(horizontal_svg(v), encoding="utf-8")
        (OUT / f"logo-epcz{v}.svg").write_text(epcz_svg(v), encoding="utf-8")
        (OUT / f"logo-stacked{v}.svg").write_text(stacked_svg(v), encoding="utf-8")

    icon = app_icon_svg(512, pad=0.07)
    (OUT / "icon.svg").write_text(icon, encoding="utf-8")
    favicon = app_icon_svg(64, simple=True, pad=0.12)  # malé velikosti: jen oko
    (OUT / "favicon-simple.svg").write_text(favicon, encoding="utf-8")
    png(favicon, OUT / "favicon-16.png", 16)
    png(favicon, OUT / "favicon-32.png", 32)
    ico([OUT / "favicon-16.png", OUT / "favicon-32.png"], ROOT / "public" / "favicon.ico")
    png(app_icon_svg(180, rounded=False, pad=0.08), OUT / "apple-touch-icon.png", 180)
    png(icon, OUT / "icon-192.png", 192)
    png(icon, OUT / "icon-512.png", 512)
    png(app_icon_svg(512, rounded=False, pad=0.24), OUT / "icon-maskable-512.png", 512)
    og = og_svg()
    (OUT / "og-default.svg").write_text(og, encoding="utf-8")
    png(og, OUT / "og-default.png", 1200, 630)
    print("hotovo:", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
