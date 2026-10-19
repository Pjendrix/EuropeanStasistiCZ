"""Design tokeny (audit UI6): jeden zdroj barev v design/tokens.json pro CSS, share.js i build_cards.py.

Z design/tokens.json se vygeneruje:
  - blok :root ve public/style.css (mezi značkami tokens:start / tokens:end): barvy světlého a tmavého režimu jako
    light-dark(světlá, tmavá); výchozí je vždy světlý, tmavý jen po přepnutí (html[data-theme="dark"], theme.js), pro hodnoty, které nejsou barvy (stín, sytost tabulky shody), krátký tmavý přepis,
    a záložní blok pro prohlížeče bez light-dark() (před rokem 2024),
  - řádek konstant SC_THEMES v public/share.js (barvy obrázků ke sdílení: tmavá karta z „card“, světlá z „card_light“).
build_cards.py čte design/tokens.json přímo (card_rgb).

Použití:
    python scripts/tokens.py          # přepíše blok v style.css a řádek v share.js
    python scripts/tokens.py --check  # jen ověří (CI, tests/test_tokens.py)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "design" / "tokens.json"
START, END = "/* tokens:start", "/* tokens:end */"
SC_RE = re.compile(r"^const SC_THEMES = \{.*?\};$", re.M | re.S)
DARK = ':root[data-theme="dark"]'


def load(path: Path = TOKENS) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _decls(pairs: dict[str, str]) -> str:
    return " ".join(f"--{k}: {v};" for k, v in pairs.items())


def css_block(t: dict) -> str:
    """Blok :root pro style.css (včetně značek)."""
    theme, other = t["theme"], t["theme_other"]
    lines = [
        f"{START} – generuje scripts/tokens.py z design/tokens.json, ručně neupravovat.",
        "   Barvy hlasů (--for/--against/--abst/--absent) znamenají jen hlas, nikdy výsledek ani kvalitu; identita frakcí",
        "   a stran je v datech (groups.json, parties.json). --data = hodnota poslance, --bench = medián. */",
        "@layer tokens {",
        ":root {",
        "  color-scheme: light;",
    ]
    lines += [f"  --{k}: {v};" for k, v in t["brand"].items()]
    lines += [f"  --{k}: light-dark({light}, {dark});" if light != dark else f"  --{k}: {light};" for k, (light, dark) in theme.items()]
    lines += [f"  --{k}: {light};" for k, (light, _dark) in other.items()]
    lines.append("}")
    lines.append(f"{DARK} {{ color-scheme: dark; }}")
    dark_other = {k: dark for k, (light, dark) in other.items() if light != dark}
    if dark_other:
        lines.append("/* tmavý režim pro hodnoty, které nejsou barvy (light-dark() umí jen barvy) */")
        lines.append(f"{DARK} {{ {_decls(dark_other)} }}")
    light = {k: v[0] for k, v in theme.items() if v[0] != v[1]}
    dark = {k: v[1] for k, v in theme.items() if v[0] != v[1]}
    lines.append("/* prohlížeče bez light-dark() (před rokem 2024): stejné barvy postaru */")
    lines.append("@supports not (color: light-dark(#000, #fff)) {")
    lines.append(f"  :root {{ {_decls(light)} }}")
    lines.append(f"  {DARK} {{ {_decls(dark)} }}")
    lines.append("}")
    lines.append("}")
    lines.append(END)
    return "\n".join(lines)


def sc_line(t: dict) -> str:
    """Konstanty barev pro obrázky ke sdílení v share.js: tmavá a světlá karta se stejnými rolemi."""

    def obj(c: dict) -> str:
        return "{ " + ", ".join(f'{k}: "{v}"' for k, v in c.items() if k != "note") + " }"

    return f"const SC_THEMES = {{ dark: {obj(t['card'])}, light: {obj(t['card_light'])} }};"


def card_rgb(t: dict | None = None) -> dict[str, tuple[int, int, int]]:
    """Barvy karet jako RGB pro Pillow (build_cards.py)."""
    c = (t or load())["card"]
    return {k: tuple(int(v[i : i + 2], 16) for i in (1, 3, 5)) for k, v in c.items()}


def sync_css(css: str, t: dict) -> str:
    a, b = css.find(START), css.find(END)
    if a < 0 or b < 0:
        raise ValueError("style.css nemá značky tokens:start / tokens:end")
    return css[:a] + css_block(t) + css[b + len(END) :]


def sync_share(js: str, t: dict) -> str:
    if len(SC_RE.findall(js)) != 1:
        raise ValueError("share.js nemá právě jeden řádek const SC_THEMES = {…};")
    return SC_RE.sub(lambda _: sc_line(t), js)


def media_widths(css: str) -> set[int]:
    return {int(w) for w in re.findall(r"@media[^{]*max-width:\s*(\d+)px", css)}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="jen ověřit, nic nepřepisovat")
    args = p.parse_args(argv)
    t = load()
    stale = []
    for path, fn in ((ROOT / "public" / "style.css", sync_css), (ROOT / "public" / "share.js", sync_share)):
        old = path.read_text(encoding="utf-8")
        new = fn(old, t)
        if new != old:
            stale.append(path.name)
            if not args.check:
                path.write_text(new, encoding="utf-8")
    if args.check and stale:
        print(f"neodpovídá design/tokens.json: {', '.join(stale)} (spusť python scripts/tokens.py)", file=sys.stderr)
        return 1
    print(f"tokens: {'zkontrolováno' if args.check else 'upraveno'} {len(stale)} souborů", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
