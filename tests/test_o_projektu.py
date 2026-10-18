"""Stránka O projektu (public/o-projektu.html): každá kotva, na kterou web odkazuje, na stránce existuje."""

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_pages as bp  # noqa: E402

# Kotvy, na které odkazuje web (scripts/*.py, public/**/*.js, ruční stránky) nebo zvenku (Instagram „Opravy“, starší odkazy).
# Nový odkaz na o-projektu#… = přidat sem; test níže hlídá, že seznam odpovídá zdrojům.
LINKED_ANCHORS = {
    "kontakt",  # patička, panel Více, karty
    "metodika",  # ⓘ v kartách (infoButton), profily, rozcestník
    "zdroje",  # pruh se stářím dat (lib/ui.js)
    "radar",  # stránka Co se chystá
    "program-ep",  # další zasedání, program
    "tema-hlasovani",  # čip tématu
    "moje-shoda",  # kvíz
    "kviz-frakce",  # kvíz, varianta Evropské frakce
    "ai",  # shrnutí hlasování na úvodu
    "z-posledniho-zasedani",  # úvod
}
# Sekce a aliasy sloučených sekcí (dřívější adresy): sledujte → kontakt, corrections/opravy → zmeny.
ALIASES = {
    "definitions", "opravy", "corrections", "sledujte", "zmeny", "licence", "nezavislost", "nazvy", "pribeh-zakona",
    "stranky", "loga",
}  # fmt: skip


# Pravidla stránek, která jsou <details> s kotvou (odkazy z kvízu, radaru, úvodu…).
RULE_DETAILS = {
    "kviz-frakce", "radar", "program-ep", "tema-hlasovani", "moje-shoda", "ai", "z-posledniho-zasedani", "nazvy", "pribeh-zakona",
}  # fmt: skip


class _Ids(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.details = set(), set()

    def handle_starttag(self, tag, attrs):
        i = dict(attrs).get("id")
        if i:
            self.ids.add(i)
            if tag == "details":
                self.details.add(i)


def page_ids() -> _Ids:
    p = _Ids()
    p.feed((ROOT / "public" / "o-projektu.html").read_text(encoding="utf-8"))
    return p


def linked_in_sources() -> set[str]:
    rx = re.compile(r"o-projektu(?:\.html)?#([A-Za-z0-9_-]+)")
    files = [*(ROOT / "scripts").glob("*.py"), *(ROOT / "public").rglob("*.js"), *(ROOT / "public").glob("*.html")]
    return {m for f in files for m in rx.findall(f.read_text(encoding="utf-8"))}


def test_linked_anchors_list_matches_sources():
    found = linked_in_sources()
    assert found <= LINKED_ANCHORS, f"nové odkazy na o-projektu#…, doplň do LINKED_ANCHORS: {sorted(found - LINKED_ANCHORS)}"


def test_every_linked_anchor_exists():
    ids = page_ids().ids
    missing = sorted((LINKED_ANCHORS | ALIASES | set(bp.DEFINITION_NAMES)) - ids)
    assert not missing, f"o-projektu.html nemá kotvy: {missing}"


def test_definitions_and_rules_are_details():
    """Definice (kotva = klíč z overview.json) a pravidla stránek jsou <details>, které skript otevře podle kotvy."""
    d = page_ids().details
    assert set(bp.DEFINITION_NAMES) <= d
    assert RULE_DETAILS <= d


def test_page_keeps_form_and_sync_blocks():
    html = (ROOT / "public" / "o-projektu.html").read_text(encoding="utf-8")
    assert 'action="https://formspree.io/f/xyegyyjo" method="POST"' in html
    for f in ("zprava", "stranka", "email", "_gotcha", "_subject"):
        assert f'name="{f}"' in html
    for b in ("definitions", "corrections", "follow"):
        assert html.count(f"<!--sync:{b}-->") == 1
    assert len(re.findall(r'\bid="([^"]+)"', html)) == len(set(re.findall(r'\bid="([^"]+)"', html)))  # žádné duplicitní id


def test_quiz_groups_rule_matches_constants():
    """Prahy kvízu Evropské frakce na stránce O projektu odpovídají konstantám v scripts/quiz_groups.py."""
    import quiz_groups as qg

    html = (ROOT / "public" / "o-projektu.html").read_text(encoding="utf-8")
    found = dict(re.findall(r'<span data-param="([A-Z_]+)">([^<]+)</span>', html))
    assert set(found) >= {
        "MIN_MINORITY",
        "MIN_SIDE",
        "LAW_MIN_ROLL_CALLS",
        "LAW_DEAL_MIN_MINORITY",
        "RES_MIN_ROLL_CALLS",
        "RES_MIN_MINORITY",
    }
    for k, text in found.items():
        v = getattr(qg, k)
        assert text == (f"{round(v * 100)} %" if isinstance(v, float) else str(v)), k
