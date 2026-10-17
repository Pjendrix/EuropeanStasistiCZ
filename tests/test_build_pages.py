import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_pages as bp  # noqa: E402
import build_web as bw  # noqa: E402
from test_build_web import data_dir  # noqa: E402,F401  (sdílená fixture s MOCK daty)


def built(data_dir):
    (data_dir / "groups.json").write_text(json.dumps([{"code": "EPP", "ep_code": "PPE", "short_label": "EPP"}]), encoding="utf-8")
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
    assert "https://howtheyvote.eu/votes/1" in html


def test_share_button_in_head_row_and_no_corner_cite(data_dir):
    """Revize sdílení N2: „Sdílet“ v řádku se zpět na v/, p/, s/; ❝ v rohu karet už není (citace je v panelu)."""
    pages = built(data_dir)
    for key in ("v/1.html", "p/1.html", "s/20.html"):
        html = pages[key]
        assert 'class="cite-btn"' not in html, key
        assert html.count("data-share") == 1 and '<div class="back-row">' in html and bp.SHARE_BUTTON in html, key
        assert "share.js" in html, key
    assert 'cite: "Evropský parlament' in pages["v/1.html"]  # citace pro „Kopírovat jako citaci“


def test_share_button_same_in_python_and_js():
    import re

    js = (Path(__file__).resolve().parent.parent / "public" / "share.js").read_text(encoding="utf-8")
    m = re.search(r"const SHARE_BTN_HTML = '([^']+)';", js)
    assert m and m[1] == bp.SHARE_BUTTON


def test_profile_page_has_numbers_with_source(data_dir):
    html = built(data_dir)["p/1.html"]
    assert "50,0 %" in html and "1 z 2 hlasování" in html  # docházka [1, 2]
    assert "https://howtheyvote.eu/members/1" in html
    assert 'href="v/3.html"' in html  # poslední závěrečné hlasování (odkazy od <base href="../">)
    assert '<base href="../">' in html and 'data-mep="1"' in html and '<script src="profile.js?v=' in html
    assert 'class="skip-link" href="p/1.html#main"' in html


def test_og_url_only_with_known_base_url(data_dir):
    assert "og:url" not in built(data_dir)["p/1.html"]
    (data_dir / "manual" / "site.json").write_text(json.dumps({"base_url": "https://example.test"}), encoding="utf-8")
    html = bp.build(data_dir)["p/1.html"]
    assert '<link rel="canonical" href="https://example.test/p/1.html">' in html
    pages = bp.build(data_dir)
    assert "<loc>https://example.test/v/1.html</loc>" in pages["sitemap.xml"]
    assert "<loc>https://example.test/</loc>" in pages["sitemap.xml"]
    assert "index.html</loc>" not in pages["sitemap.xml"]
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
        raise AssertionError("měla být chyba")
    except bp.FormatError as e:
        assert "neznamy_klic" in str(e)
    pub, data = tmp_path / "public", tmp_path / "data"
    pub.mkdir()
    data.mkdir()
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


def test_home_hero_hemicycle_facts_and_paths(data_dir):
    """Revize úvodu: hemicykl z data/home.json (tečka = poslanec, symbol + barva, odkaz na profil), střed F : A,
    pruh faktů z JSON, tři cesty, další pohledy bez číslování, sdílení napojené na panel."""
    import build_home as bh

    (data_dir / "groups.json").write_text(json.dumps([{"code": "EPP", "ep_code": "PPE", "short_label": "EPP"}]), encoding="utf-8")
    bw.run(data_dir, "2024-11-01")
    (data_dir / "splits.json").write_text(
        json.dumps({"unity": {"considered": 4, "united_final": 1, "considered_final": 2}}), encoding="utf-8"
    )
    (data_dir / "decisive.json").write_text(json.dumps({"votes": [{"id": 1}]}), encoding="utf-8")
    (data_dir / "work_hub.json").write_text(
        json.dumps({"updated": "2024-10-20", "totals": {"meps": 2, "speeches": 5, "questions": 3, "reports_lead": 1}}), encoding="utf-8"
    )
    home = bh.build(data_dir)
    (data_dir / "home.json").write_text(json.dumps(home), encoding="utf-8")
    html = bp.build(data_dir)["index.html"]
    assert "<title>EP Watch CZ – jak hlasují čeští europoslanci</title>" in html and 'id="hub-q"' in html and 'src="hub.js?v=' in html
    first = home["votes"][0]
    assert html.count('class="hm-seat"') == len(first["ppl"])
    assert f'id="hm-big">{first["counts"]["F"]}<em>:</em>{first["counts"]["A"]}<' in html  # střed = počet teček pro : proti
    assert 'href="p/1.html"' in html and 'data-share="hero"' in html and 'src="share.js?v=' in html
    assert "<dt>4</dt><dd>jmenovitých hlasování od" in html and "1 z 2 jednotně" in html and "1 hlasování" in html
    assert "Součet za všech 2 poslanců" in html
    for href in (
        "poslanci.html",
        "hlasovani.html",
        "prace.html",
        "party.html",
        "temata.html",
        "rozkol.html",
        "rozhodujici.html",
        "shoda.html",
        "o-projektu.html#metodika",
    ):
        assert f'href="{href}"' in html
    assert "row-no" not in html and "home-door" not in html  # bez číslování a bez starých dveří


def test_blocks_for_manual_pages(data_dir, tmp_path):
    built(data_dir)
    root = Path(__file__).resolve().parent.parent
    for name in ("poslanci.html", "hlasovani.html"):
        (tmp_path / name).write_text((root / "public" / name).read_text(encoding="utf-8"), encoding="utf-8")
    # 3 bloky + program zasedání (MOCK data program nemají, blok se vyprázdní)
    assert bp.sync_blocks(tmp_path, data_dir) == 4
    assert bp.sync_blocks(tmp_path, data_dir) == 0  # podruhé beze změny
    mep = (tmp_path / "poslanci.html").read_text(encoding="utf-8")
    assert "Kdo jsou čeští poslanci" in mep and 'class="hub-strip heads-strip"' in mep
    votes = (tmp_path / "hlasovani.html").read_text(encoding="utf-8")
    assert "Co se naposledy odhlasovalo" in votes and "Nejnovější zákony" in votes and "Češi proti výsledku" in votes
    assert "<h1>Jmenovitá hlasování</h1>" in votes and 'href="votes.html"' in votes
    assert "<!--sync:agenda-->\n\n<!--/sync:agenda-->" in votes  # bez programu žádný prázdný blok


def test_group_majority_and_party_votes_text():
    assert bp.group_majority_label([10, 2, 0, 5]) == "pro" and bp.group_majority_label([1, 5, 0, 0]) == "proti"
    assert bp.group_majority_label([3, 3, 0, 1]) is None and bp.group_majority_label([0, 0, 0, 9]) is None
    cz = [
        {"national_party": "A", "position": "FOR"},
        {"national_party": "A", "position": "FOR"},
        {"national_party": "B", "position": "AGAINST"},
        {"national_party": "Independent", "position": "DID_NOT_VOTE"},
    ]
    assert bp.party_votes_text(cz) == [("A", "2 pro"), ("B", "1 proti"), ("bez strany", "1 nehlasoval")]


def test_party_rows_order_dots_and_verbs():
    meps = {
        i: {"id": i, "name": f"MOCK {n}", "sort_label": n, "gender": g}
        for i, n, g in [(1, "Aaa", "MALE"), (2, "Bbb", "FEMALE"), (3, "Ccc", "FEMALE"), (4, "Ddd", "MALE"), (5, "Eee", "MALE")]
    }
    parties = [
        {"id": 10, "short_label": "AA", "chart_color": "#111111"},
        {"id": 20, "short_label": "BB", "chart_color": "#222222"},
        {"id": 30, "short_label": "Ind.", "chart_color": None},
    ]
    groups = [{"code": "EPP", "short_label": "EPP"}, {"code": "NI", "short_label": "NI"}]
    cz = [
        {"member_id": 1, "position": "FOR", "national_party_id": 20, "group_code": "EPP"},
        {"member_id": 2, "position": "ABSTENTION", "national_party_id": 10, "group_code": "EPP"},
        {"member_id": 3, "position": "ABSTENTION", "national_party_id": 10, "group_code": "NI"},
        {"member_id": 4, "position": "DID_NOT_VOTE", "national_party_id": 30, "group_code": "NI"},
        {"member_id": 5, "position": "AGAINST", "national_party_id": 10, "group_code": "EPP"},
    ]
    rows = bp.party_rows(cz, meps, parties, groups)
    assert [r["label"] for r in rows] == ["AA", "BB", "Ind."]  # největší strana první, pak abecedně
    assert sum(r["total"] for r in rows) == len(cz)  # součet teček = počet poslanců
    assert rows[0]["groups"] == ["EPP", "nezařazení"]  # frakce k datu hlasování, obě vypsané
    html = bp.party_rows_html(rows, "../")
    assert html.count('class="cz-dot') == len(cz)
    assert "zdržely se" in html and "zdrželi se" not in html  # obě ženy → ženský plurál
    assert bp.position_phrase("DID_NOT_VOTE", [meps[4]]) == "nehlasoval"
    assert bp.position_phrase("ABSTENTION", [meps[1], meps[2]]) == "zdrželi se"
    assert not bp.party_rows([], meps, parties, groups)  # prázdná strana se nevypíše


def test_topic_chips_markup_and_empty():
    """Téma: čip = ikona + text, odkaz na filtr; „+N“ v popoveru s odkazem na metodiku; bez tématu nic (žádná prázdná značka)."""
    assert bp.topic_chips([]) == "" and bp.topic_chips(None) == "" and bp.topic_chips(["neznámé"]) == ""
    html = bp.topic_chips(["env", "tra", "fin"], 1, True, "7", "../")
    assert html.count('class="topic-chip"') == 3  # 1 viditelný + 2 v popoveru
    assert 'href="../votes.html?c=env"' in html and 'popovertarget="tc-7"' in html and ">+2<" in html
    assert 'href="../o-projektu.html#tema-hlasovani"' in html and "<svg" in html
    assert 'class="info-btn"' not in html and 'class="info-btn"' in bp.topic_chips(["env"], info=True)
    assert bp.topic_text(["env", "tra"]) == "Klima, příroda a energie (+1)" and bp.topic_text([]) == ""


def test_topic_same_everywhere_on_real_data():
    """Pro každé hlasování z home.json je téma stejné jako z votes/*.json (categories_for), ve vote_cats.json i na stránce v/{id}.html."""
    import categories

    root = Path(__file__).resolve().parent.parent
    home_p, cats_p = root / "data" / "home.json", root / "data" / "vote_cats.json"
    if not home_p.exists() or not cats_p.exists():
        return
    home = json.loads(home_p.read_text(encoding="utf-8"))
    vote_cats = json.loads(cats_p.read_text(encoding="utf-8"))["votes"]
    for x in home["votes"]:
        month = json.loads((root / "data" / "votes" / f"{x['month']}.json").read_text(encoding="utf-8"))
        src = next(v for v in month["votes"] if v["id"] == x["id"])
        expect = categories.categories_for(src)
        assert [t["slug"] for t in x["topics"]] == expect
        assert vote_cats.get(str(x["id"]), []) == expect
        page_ = (root / "public" / "v" / f"{x['id']}.html").read_text(encoding="utf-8")
        if expect:
            assert bp.topic_chips(expect, 4, True, str(x["id"]), "../", True) in page_
        else:
            assert 'class="topic-chips"' not in page_


def test_static_pages_do_not_change_with_new_data_export(data_dir):
    """Blok A: nový export dat (jiné datum v overview.json) bez nových hlasování nezmění stránky v/ ani kartu hlasování,
    aby repo nerostlo při každé aktualizaci."""
    import build_cards as bc

    first = built(data_dir)
    ov_path = data_dir / "overview.json"
    ov = json.loads(ov_path.read_text(encoding="utf-8"))
    ov["sources"]["votes"]["release"] = "2099-01-01"
    ov_path.write_text(json.dumps(ov), encoding="utf-8")
    second = bp.build(data_dir)
    for key in (k for k in first if k.startswith("v/")):
        assert first[key] == second[key], key
        assert "dataDay" not in first[key] and "2099" not in second[key]
    # karta hlasování nezávisí na datu exportu (v patičce je datum hlasování)
    assert "data_day" not in bc.vote_card.__code__.co_varnames


def test_feed_and_sitemap_lastmod(data_dir):
    """Blok G: Atom feed se závěrečnými hlasováními (bez data generování) a lastmod v sitemap."""
    built(data_dir)
    (data_dir / "manual" / "site.json").write_text(json.dumps({"base_url": "https://example.test"}), encoding="utf-8")
    pages = bp.build(data_dir)
    feed = pages["feed.xml"]
    assert feed.startswith("<?xml") and 'xmlns="http://www.w3.org/2005/Atom"' in feed
    assert feed.count("<entry>") == 2 and "<id>https://example.test/v/3.html</id>" in feed  # závěrečná 1 a 3, nejnovější první
    assert feed.index("v/3.html") < feed.index("v/1.html") and "<updated>2024-10-16T12:00:00Z</updated>" in feed
    assert "Zdroj: HowTheyVote.eu" in feed
    assert "<loc>https://example.test/v/1.html</loc><lastmod>2024-09-16</lastmod>" in pages["sitemap.xml"]
    assert bp.build(data_dir)["feed.xml"] == feed  # deterministický


def test_corrections_block(tmp_path):
    data = tmp_path / "data"
    (data / "manual").mkdir(parents=True)
    assert "Zatím žádné opravy" in bp.corrections_html(data)
    (data / "manual" / "corrections.json").write_text(
        json.dumps(
            {
                "corrections": [
                    {"date": "2026-10-01", "wrong": "MOCK špatně", "right": "MOCK správně", "link": "https://example.test/x"},
                    {"date": "2026-10-05", "wrong": "MOCK B", "right": "MOCK B2"},
                ]
            }
        ),
        encoding="utf-8",
    )
    html = bp.corrections_html(data)
    assert html.index("5. 10. 2026") < html.index("1. 10. 2026") and 'href="https://example.test/x"' in html
    (data / "manual" / "corrections.json").write_text(json.dumps({"corrections": [{"date": "2026-10-01"}]}), encoding="utf-8")
    import pytest

    with pytest.raises(bp.FormatError):
        bp.corrections_html(data)


def test_cz_geo_tag_only_from_source():
    """„Týká se Česka“ jen když zdroj uvádí geografické téma CZE; jinak žádná značka. Stejný text jako czGeoTag v app.js."""
    assert bp.cz_geo_tag({"topics": {"geo": [{"code": "UKR"}]}}) == ""
    assert bp.cz_geo_tag({"topics": {}}) == "" and bp.cz_geo_tag({}) == ""
    tag = bp.cz_geo_tag({"topics": {"geo": [{"code": "CZE", "label": "Czechia"}]}})
    assert ">Týká se Česka<" in tag
    app = (Path(__file__).resolve().parent.parent / "public" / "app.js").read_text(encoding="utf-8")
    assert tag in app.replace("'", '"').replace('"<span', "<span").replace('</span>"', "</span>")


def test_share_data_trace_only_with_record(data_dir):
    built(data_dir)
    month = json.loads((data_dir / "votes" / "2024-10.json").read_text(encoding="utf-8"))["votes"]
    meps_by_id = {m["id"]: m for m in json.loads((data_dir / "meps.json").read_text(encoding="utf-8"))["meps"]}
    v = month[0]
    assert "trace" not in bp.vote_share_data(v, meps_by_id, [], [], None)
    assert bp.vote_share_data(v, meps_by_id, [], [], None, trace=True)["trace"] is True


def test_next_session_block():
    import hub

    agenda = {
        "from": "2026-10-19",
        "to": "2026-10-22",
        "days": ["2026-10-19"],
        "votes": 2,
        "fetched": "2026-10-16",
        "source": {"name": "EP Open Data API v2", "url": "https://data.europarl.europa.eu/api/v2/meetings"},
        "picks": ["MOCK-1"],
        "items": [
            {
                "id": "MOCK-1",
                "date": "2026-10-20",
                "order": 1,
                "title_cs": "MOCK DPH",
                "title_en": None,
                "docs": ["A-10-2026-0213"],
                "legislative": False,
                "cz": [{"mep_id": 1, "name": "MOCK Jedna", "role": "rapporteur"}],
            },
            {
                "id": "MOCK-2",
                "date": "2026-10-21",
                "order": 2,
                "title_cs": "MOCK jiný",
                "title_en": None,
                "docs": [],
                "legislative": False,
                "cz": [],
            },
        ],
    }
    html = hub.next_session_html(agenda)
    assert 'data-from="2026-10-19"' in html and 'data-to="2026-10-22"' in html
    assert "MOCK DPH" in html and "MOCK jiný" not in html  # na úvodu jen výběr
    assert html.count('class="cz-badge"') == 1 and 'href="p/1.html"' in html
    assert "data.europarl.europa.eu" in html  # zdroj
    full = hub.next_session_html(agenda, full=True)
    assert "MOCK jiný" in full
    assert hub.next_session_html(None) == ""


def test_radar_page_html():
    import hub

    steps = [
        {"key": k, "label": k, "date": d}
        for k, d in (("committee", "2025-02-01"), ("report", "2025-06-01"), ("trilogue", None), ("plenary", None), ("closed", None))
    ]
    cz = [{"mep_id": 1, "name": "MOCK Jedna", "role": "shadow", "role_cs": "stínový/á zpravodaj/ka"}]
    row = {
        "procedure": "2025-0001",
        "label": "2025/0001(COD)",
        "type": "COD",
        "title_cs": "MOCK zákon",
        "title_en": None,
        "url": "https://example.org/oeil",
        "committee": {"code": "ENVI", "name": "MOCK výbor", "category": "env"},
        "cz": cz,
        "steps": steps,
        "reached": "report",
        "last_event": {"date": "2025-06-01", "type": "X", "label": "výbor přijal zprávu"},
        "next_vote": None,
    }
    radar = {
        "categories": ["env", "fin"],
        "without_events": 3,
        "session": {
            "from": "2026-10-19",
            "to": "2026-10-22",
            "fetched": "2026-10-16",
            "items": [
                {
                    "id": "MOCK-1",
                    "date": "2026-10-20",
                    "order": 1,
                    "title_cs": "MOCK bod",
                    "title_en": None,
                    "docs": ["A-10-2026-0001"],
                    "legislative": True,
                    "stage": "RDG1",
                    "stage_cs": "první čtení",
                    "procedure": None,
                    "committee": {"code": "BUDG", "name": "Rozpočty", "category": "fin"},
                    "cz": [],
                }
            ],
        },
        "active": [row],
        "done": [
            {
                **row,
                "procedure": "2025-0002",
                "reached": "plenary",
                "plenary_date": "2026-09-15",
                "vote": {"vote_id": 99, "vote_date": "2026-09-15", "status": "ADOPTED"},
            }
        ],
    }
    html = hub.radar_html(radar)
    assert 'id="rd-cat"' in html and '<option value="env">' in html
    assert 'data-cat="fin" data-leg="1" data-cz="0"' in html and 'data-cat="env" data-leg="1" data-cz="1"' in html
    assert html.count('aria-current="step"') == 2 and "Datum hlasování v plénu zatím nezveřejněno" in html
    assert 'href="v/99.html"' in html and 'class="cz-badge"' in html and "U 3 procedur" in html
    assert 'data-from="2026-10-19"' in html and "o-projektu.html#radar" in html
    assert "zatím nejsou" in hub.radar_html(None)
    empty = hub.radar_html({"categories": [], "session": None, "active": [], "done": [], "without_events": 0})
    assert "Program zatím není zveřejněný" in empty and "Žádné takové procedury" in empty


def test_czech_title_preferred_and_original_kept():
    v = {"id": 1, "title": "MOCK English", "title_cs": "MOCK česky", "procedure": {"reference": "2023/0436(COD)"}}
    assert bw.vote_title(v) == "MOCK česky" and bw.vote_title({"id": 2, "title": "MOCK English"}) == "MOCK English"
    assert "MOCK English" in bp.original_title_html(v) and "EP Open Data" in bp.original_title_html(v)
    assert bp.original_title_html({"id": 2, "title": "MOCK English"}) == ""


def test_radar_proc_card_links_to_procedure_story():
    from hub import radar_proc_card

    row = {
        "procedure": "2023-0447",
        "label": "2023/0447(COD)",
        "url": "https://oeil.example/x",
        "title_cs": "MOCK",
        "committee": None,
        "cz": [],
        "steps": [],
        "reached": None,
        "last_event": None,
        "next_vote": None,
    }
    html = radar_proc_card(row, "")
    assert 'href="z/2023-0447-COD.html"' in html and "oeil.example" not in html
