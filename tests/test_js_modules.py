"""Struktura JS modulů webu (audit A2): sdílený kód je v public/lib/*.js, vstupní moduly se navzájem neimportují."""

import re
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"
IMPORT_RE = re.compile(r'^import\s+(?:\{[^}]*\}\s+from\s+)?"([^"]+)";', re.M)


def _imports(path: Path) -> list[Path]:
    return [(path.parent / m).resolve() for m in IMPORT_RE.findall(path.read_text(encoding="utf-8"))]


def test_entry_modules_import_only_lib():
    lib = (PUBLIC / "lib").resolve()
    files = [f for f in PUBLIC.rglob("*.js") if "data" not in f.relative_to(PUBLIC).parts]
    assert files
    for f in files:
        for target in _imports(f):
            assert target.exists(), f"{f.relative_to(PUBLIC)}: import {target} neexistuje"
            assert target.parent == lib, f"{f.relative_to(PUBLIC)} importuje {target.relative_to(PUBLIC)} (jen lib/*.js)"


def test_format_has_no_dom():
    # lib/format.js testuje node --test bez prohlížeče: žádný document/window ani import DOM modulů.
    src = (PUBLIC / "lib" / "format.js").read_text(encoding="utf-8")
    assert not re.search(r"\b(document|window|localStorage)\s*[.[]", src)
    assert not IMPORT_RE.search(src)


def test_no_inline_scripts_in_pages():
    # CSP script-src 'self' (vercel.json): vložený skript by prohlížeč nespustil; JSON bloky jsou v pořádku.
    for f in PUBLIC.glob("*.html"):
        html = f.read_text(encoding="utf-8")
        for tag in re.findall(r"<script\b[^>]*>", html):
            assert "src=" in tag or "application/" in tag, f"{f.name}: {tag}"
