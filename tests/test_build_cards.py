import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_cards as bc  # noqa: E402
import build_pages as bp  # noqa: E402
import build_web as bw  # noqa: E402
from test_build_web import data_dir  # noqa: E402,F401  (sdílená fixture s MOCK daty)


def vote(i, date, final=True):
    return {"id": i, "date": date, "vote_kind": "final" if final else "amendment", "is_main": final}


def test_cards_only_for_final_votes_of_last_twelve_months():
    votes = [vote(1, "2025-10-07"), vote(2, "2025-10-09"), vote(3, "2026-01-15", final=False), vote(4, "2026-10-08")]
    # poslední hlasování 8. 10. 2026: hranice 8. 10. 2025 (včetně), hlasování 1 je starší, 3 není závěrečné
    assert bc.card_vote_ids(votes) == {2, 4}
    assert bc.card_vote_ids([]) == set()


def test_text_helpers_never_overflow():
    from PIL import Image, ImageDraw
    d = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    f = bc.font(46, 700)
    long = "Implementation of the Urban Wastewater Treatment Directive (UWWTD) and risks to the security of supply of medicines " * 3
    lines = bc.wrap(d, long, f, 1000, 3)
    assert len(lines) <= 3 and lines[-1].endswith("…")
    assert all(bc.text_w(d, ln, f) <= 1000 for ln in lines)
    assert bc.fit(d, "krátké", f, 1000) == "krátké"
    assert bc.text_w(d, bc.fit(d, "x" * 500, f, 300), f) <= 300


def test_result_sentence_by_kind():
    assert bc.result_sentence("objection", "REJECTED") == "Námitka neprošla – akt Komise platí"
    assert bc.result_sentence("rejection", "ADOPTED") == "Návrh na zamítnutí prošel – text je zamítnut"
    assert bc.result_sentence("final", "LAPSED") == "Propadlo"
    assert bc.result_sentence("final", None) == "Výsledek neuveden"


def test_build_writes_card_for_every_mep_and_final_vote(data_dir):
    (data_dir / "groups.json").write_text(json.dumps([{"code": "EPP", "ep_code": "PPE", "short_label": "EPP"}]), encoding="utf-8")
    bw.run(data_dir, "2024-11-01")
    public = data_dir.parent / "public"
    res = bc.build(data_dir, public)
    meps = [p.stem for p in (public / "og" / "p").glob("*.png")]
    votes = [p.stem for p in (public / "og" / "v").glob("*.png")]
    assert sorted(meps) == ["1", "2"] and (public / "og" / "default.png").exists()
    pages = bp.build(data_dir)
    # každá statická stránka hlasování s kartou ji má v og:image; stránky bez karty (mimo 12 měsíců) obecný obrázek
    assert {k[2:-5] for k in pages if k.startswith("v/")} >= set(votes) and res["meps"] == 2
    first = (public / "og" / "p" / "1.png").read_bytes()
    assert first[:8] == b"\x89PNG\r\n\x1a\n"
    bc.build(data_dir, public)
    assert (public / "og" / "p" / "1.png").read_bytes() == first  # deterministické
