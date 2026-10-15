import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_pages as bp  # noqa: E402
import build_web as bw  # noqa: E402
from test_build_web import data_dir  # noqa: E402,F401  (sdílená fixture s MOCK daty)


def built(data_dir):
    (data_dir / "groups.json").write_text(json.dumps([{"code": "EPP", "ep_code": "PPE", "short_label": "EPP"}]),
                                          encoding="utf-8")
    bw.run(data_dir, "2024-11-01")
    return bp.build(data_dir)


def test_pages_for_meps_parties_and_final_votes_only(data_dir):
    pages = built(data_dir)
    assert sorted(k for k in pages if k.startswith("p/")) == ["p/1.html", "p/2.html"]
    assert "s/20.html" in pages and "s/99.html" not in pages  # nezávislí nejsou strana
    # hlasování 1 a 3 jsou závěrečná, 2 dílčí, 4 návrh na zamítnutí
    assert sorted(k for k in pages if k.startswith("v/")) == ["v/1.html", "v/3.html"]


def test_vote_page_content(data_dir):
    html = built(data_dir)["v/1.html"]
    assert "<h1>MOCK vote</h1>" in html and "přijato" in html
    assert 'href="../p/1.html"' in html and 'data-root="../"' in html
    assert "https://howtheyvote.eu/votes/1" in html and 'class="cite-btn"' in html


def test_profile_page_has_numbers_with_source(data_dir):
    html = built(data_dir)["p/1.html"]
    assert "50,0 %" in html and "1 z 2 hlasování" in html  # docházka [1, 2]
    assert "https://howtheyvote.eu/members/1" in html
    assert 'href="v/3.html"' in html  # poslední závěrečné hlasování (odkazy od <base href="../">)
    assert '<base href="../">' in html and 'data-mep="1"' in html and '<script src="profile.js">' in html
    assert 'class="skip-link" href="p/1.html#main"' in html


def test_og_url_only_with_known_base_url(data_dir):
    assert "og:url" not in built(data_dir)["p/1.html"]
    (data_dir / "manual" / "site.json").write_text(json.dumps({"base_url": "https://example.test"}), encoding="utf-8")
    html = bp.build(data_dir)["p/1.html"]
    assert '<link rel="canonical" href="https://example.test/p/1.html">' in html
    pages = bp.build(data_dir)
    assert "<loc>https://example.test/v/1.html</loc>" in pages["sitemap.xml"]
    assert "<loc>https://example.test/index.html</loc>" in pages["sitemap.xml"]
    assert pages["robots.txt"].endswith("Sitemap: https://example.test/sitemap.xml\n")


def test_write_removes_stale_and_keeps_unchanged(tmp_path):
    (tmp_path / "v").mkdir()
    (tmp_path / "v" / "999.html").write_text("MOCK", encoding="utf-8")
    res = bp.write({"v/1.html": "<p>MOCK</p>"}, tmp_path)
    assert res == {"pages": 1, "written": 1, "removed": 1}
    assert bp.write({"v/1.html": "<p>MOCK</p>"}, tmp_path)["written"] == 0


def test_formatting():
    assert bp.fmt_pct([1, 3]) == "33,3 %" and bp.fmt_pct([0, 0]) == "–"
    assert bp.fmt_num(6154) == "6 154" and bp.fmt_date("2024-07-16") == "16. 7. 2024"


def test_definitions_static_and_every_key_has_a_name(tmp_path):
    defs = {"attendance": "Text <b>", "work_profile": "Další"}
    html = bp.definitions_html(defs)
    assert "<strong>Účast na hlasování</strong>: Text &lt;b&gt;" in html and "work_profile" not in html
    try:
        bp.definitions_html({"neznamy_klic": "x"})
        assert False, "měla být chyba"
    except bp.FormatError as e:
        assert "neznamy_klic" in str(e)
    pub, data = tmp_path / "public", tmp_path / "data"
    pub.mkdir(); data.mkdir()
    (pub / "o-projektu.html").write_text('<ul class="plain" id="definitions"><li class="loading">Načítám…</li></ul>', encoding="utf-8")
    (data / "overview.json").write_text(json.dumps({"definitions": defs}), encoding="utf-8")
    assert bp.sync_definitions(pub, data) is True
    assert "Načítám" not in (pub / "o-projektu.html").read_text(encoding="utf-8")
    assert bp.sync_definitions(pub, data) is False  # podruhé beze změny


def test_repo_definitions_in_sync_with_overview(tmp_path):
    """Seznam „Jak počítáme“ v public/o-projektu.html odpovídá data/overview.json (jinak spusť scripts/build_pages.py)."""
    root = Path(__file__).resolve().parent.parent
    (tmp_path / "o-projektu.html").write_text((root / "public" / "o-projektu.html").read_text(encoding="utf-8"), encoding="utf-8")
    assert bp.sync_definitions(tmp_path, root / "data") is False


def test_hub_is_gateway_with_three_doors(data_dir):
    pages = built(data_dir)
    html = pages["index.html"]
    assert "<title>EP Watch CZ – jak hlasují čeští europoslanci</title>" in html and 'id="hub-q"' in html and 'src="hub.js"' in html
    assert html.count('class="home-door ') == 3
    for href in ("poslanci.html", "hlasovani.html", "votes.html", "prace.html", "party.html", "temata.html", "rozkol.html", "rozhodujici.html", "shoda.html",
                 "o-projektu.html#metodika"):
        assert f'href="{href}"' in html
    # úvodka je rozcestník: seznamy hlasování a portréty jsou na stránkách Hlasování a Poslanci
    assert "hub-vote" not in html and "hub-av" not in html and "Nejnovější zákony" not in html


def test_blocks_for_manual_pages(data_dir, tmp_path):
    built(data_dir)
    root = Path(__file__).resolve().parent.parent
    for name in ("poslanci.html", "hlasovani.html"):
        (tmp_path / name).write_text((root / "public" / name).read_text(encoding="utf-8"), encoding="utf-8")
    assert bp.sync_blocks(tmp_path, data_dir) == 3
    assert bp.sync_blocks(tmp_path, data_dir) == 0  # podruhé beze změny
    mep = (tmp_path / "poslanci.html").read_text(encoding="utf-8")
    assert "Kdo jsou čeští poslanci" in mep and 'class="hub-strip heads-strip"' in mep
    votes = (tmp_path / "hlasovani.html").read_text(encoding="utf-8")
    assert "Co se naposledy odhlasovalo" in votes and "Nejnovější zákony" in votes and "Češi proti výsledku" in votes
    assert "<h1>Jmenovitá hlasování</h1>" in votes and 'href="votes.html"' in votes


def test_group_majority_and_party_votes_text():
    assert bp.group_majority_label([10, 2, 0, 5]) == "pro" and bp.group_majority_label([1, 5, 0, 0]) == "proti"
    assert bp.group_majority_label([3, 3, 0, 1]) is None and bp.group_majority_label([0, 0, 0, 9]) is None
    cz = [{"national_party": "A", "position": "FOR"}, {"national_party": "A", "position": "FOR"},
          {"national_party": "B", "position": "AGAINST"}, {"national_party": "Independent", "position": "DID_NOT_VOTE"}]
    assert bp.party_votes_text(cz) == [("A", "2 pro"), ("B", "1 proti"), ("bez strany", "1 nehlasoval")]


def test_party_rows_order_dots_and_verbs():
    meps = {i: {"id": i, "name": f"MOCK {n}", "sort_label": n, "gender": g} for i, n, g in
            [(1, "Aaa", "MALE"), (2, "Bbb", "FEMALE"), (3, "Ccc", "FEMALE"), (4, "Ddd", "MALE"), (5, "Eee", "MALE")]}
    parties = [{"id": 10, "short_label": "AA", "chart_color": "#111111"}, {"id": 20, "short_label": "BB", "chart_color": "#222222"},
               {"id": 30, "short_label": "Ind.", "chart_color": None}]
    groups = [{"code": "EPP", "short_label": "EPP"}, {"code": "NI", "short_label": "NI"}]
    cz = [{"member_id": 1, "position": "FOR", "national_party_id": 20, "group_code": "EPP"},
          {"member_id": 2, "position": "ABSTENTION", "national_party_id": 10, "group_code": "EPP"},
          {"member_id": 3, "position": "ABSTENTION", "national_party_id": 10, "group_code": "NI"},
          {"member_id": 4, "position": "DID_NOT_VOTE", "national_party_id": 30, "group_code": "NI"},
          {"member_id": 5, "position": "AGAINST", "national_party_id": 10, "group_code": "EPP"}]
    rows = bp.party_rows(cz, meps, parties, groups)
    assert [r["label"] for r in rows] == ["AA", "BB", "Ind."]       # největší strana první, pak abecedně
    assert sum(r["total"] for r in rows) == len(cz)                  # součet teček = počet poslanců
    assert rows[0]["groups"] == ["EPP", "nezařazení"]                # frakce k datu hlasování, obě vypsané
    html = bp.party_rows_html(rows, "../")
    assert html.count('class="cz-dot') == len(cz)
    assert "zdržely se" in html and "zdrželi se" not in html         # obě ženy → ženský plurál
    assert bp.position_phrase("DID_NOT_VOTE", [meps[4]]) == "nehlasoval"
    assert bp.position_phrase("ABSTENTION", [meps[1], meps[2]]) == "zdrželi se"
    assert not bp.party_rows([], meps, parties, groups)              # prázdná strana se nevypíše
