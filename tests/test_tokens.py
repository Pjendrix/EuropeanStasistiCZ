import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import tokens  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def test_css_and_share_js_match_tokens():
    # Ruční úprava barev ve style.css nebo share.js = test selže; oprava: upravit design/tokens.json a spustit python scripts/tokens.py
    assert tokens.main(["--check"]) == 0


def test_only_agreed_breakpoints():
    css = (ROOT / "public" / "style.css").read_text(encoding="utf-8")
    allowed = {v for k, v in tokens.load()["breakpoints"].items() if isinstance(v, int)}
    assert tokens.media_widths(css) <= allowed, tokens.media_widths(css) - allowed


def test_theme_tokens_have_light_and_dark():
    t = tokens.load()
    for group in ("theme", "theme_other"):
        for name, pair in t[group].items():
            assert isinstance(pair, list) and len(pair) == 2, name


def test_css_block_uses_light_dark_with_fallback():
    block = tokens.css_block(tokens.load())
    assert "--bg: light-dark(#F8FAFC, #0B1220);" in block and "@supports not (color: light-dark(#000, #fff))" in block
    assert "--mx-max: 42%" in block  # hodnota, která není barva, má tmavý přepis


def test_card_colors_shared_with_build_cards():
    import build_cards

    rgb = tokens.card_rgb()
    assert build_cards.NAVY == rgb["navy"] and build_cards.FOR_C == rgb["for"] and build_cards.ABSENT_C == rgb["absent"]
