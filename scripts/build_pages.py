"""Statické stránky s obsahem vyrenderovaným na serveru (R7): trvalé odkazy, citace, náhledy ve sdílení.

Výstup (obyčejné HTML v repu, web zůstává bez build stepu):
  public/p/{id}.html   poslanec (souhrn, čísla se zdrojem, poslední závěrečná hlasování)
  public/s/{id}.html   strana
  public/v/{id}.html   závěrečné hlasování (o celém textu nebo o prozatímní dohodě)
  public/z/{rok}-{číslo}-{typ}.html   příběh zákona: průběh procedury a všechna hlasování k ní (procedure_pages.py)
  public/sitemap.xml, public/robots.txt   jen když je v data/manual/site.json adresa webu

Profil poslance má jen tuto adresu (mep.html přesměrovává): statický obsah + profile.js s interakcemi.
Strana má jen adresu s/{id}.html (party.html?id= přesměrovává): statický obsah + party.js. Hlasování mají i interaktivní stránku (vote.html), statická na ni odkazuje. Nic se nepočítá znovu: čísla jsou ze souborů z compute_stats.py a build_web.py.
Stránky nemají datum sestavení, takže se v gitu mění, jen když se změní data.

Použití:
    python scripts/build_pages.py
"""

from __future__ import annotations

import argparse
import json
import re
from urllib.parse import quote
import sys
from html import escape
from pathlib import Path

from build_cards import card_vote_ids, result_sentence
from build_web import vote_title
from categories import ICON as CAT_ICON, LABEL as CAT_LABEL, categories_for
from vote_parties import (
    POSITION_LABEL,
    POSITIONS,
    card_items,
    vote_detail,
    group_label,
    party_rows,  # noqa: F401
    position_phrase,
)
from compute_stats import FormatError, active_positions, load_votes, require
from labels_cs import translate
from layout import MODULES, json_script, page
from web_ui import page_url, vote_meaning_html
from overrides import apply_name_overrides
from vote_kinds import KIND_LABELS, classify, is_final

RESULT_LABEL = {"ADOPTED": "přijato", "REJECTED": "zamítnuto", "LAPSED": "propadlo", "WITHDRAWN": "staženo"}
HTV = "https://howtheyvote.eu"
NBSP = " "
ROOT = "../"


def esc(x) -> str:
    return escape(str(x if x is not None else ""))


def fmt_num(n) -> str:
    return f"{int(n):,}".replace(",", NBSP)


def fmt_pct(pair_or_value) -> str:
    v = pair_or_value
    if isinstance(v, list):
        v = v[0] / v[1] if v[1] else None
    return "–" if v is None else f"{v * 100:.1f}".replace(".", ",") + f"{NBSP}%"


def meps_count(n: int) -> str:
    """„1 poslanec“, „3 poslanci“, „5 poslanců“."""
    return f"{n} " + ("poslanec" if n == 1 else "poslanci" if 2 <= n <= 4 else "poslanců")


def group_majority_label(row: list[int]) -> str | None:
    """Většina frakce z počtů [pro, proti, zdržel se, nehlasoval]: jednoznačně nejvíc hlasů, jinak None."""
    v = row[:3]
    best = max(v)
    winners = [i for i, n in enumerate(v) if n == best]
    return ["pro", "proti", "zdržet se"][winners[0]] if best > 0 and len(winners) == 1 else None


def party_votes_text(cz: list[dict]) -> list[tuple[str, str]]:
    """Hlasy Čechů po českých stranách: [(strana, „3 pro, 1 proti“)], od největší strany."""
    by: dict[str, dict[str, int]] = {}
    for p in cz:
        label = p.get("national_party") if p.get("national_party") and p["national_party"] != "Independent" else "bez strany"
        by.setdefault(label, {k: 0 for k in POSITIONS})[p["position"]] += 1
    names = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdržel se", "DID_NOT_VOTE": "nehlasoval"}
    order = sorted(by, key=lambda k: (-sum(by[k].values()), k))
    return [(k, ", ".join(f"{by[k][pos]} {names[pos]}" for pos in POSITIONS if by[k][pos])) for k in order]


def party_rows_html(rows: list[dict], root: str) -> str:
    out = []
    for r in rows:
        dots = "".join(
            f'<i class="cz-dot d-{k}" title="{esc(display_name(m))}: {esc(position_phrase(k, [m]))}"></i>'
            for k in POSITIONS
            for m in r["members"][k]
        )
        names = " · ".join(
            f'<span class="pr-group"><b class="pos pos-{k}">{esc(position_phrase(k, r["members"][k]))}</b> '
            + ", ".join(f'<a href="{root}p/{m["id"]}">{esc(display_name(m))}</a>' for m in r["members"][k])
            + "</span>"
            for k in POSITIONS
            if r["members"][k]
        )
        color = f' style="background:{esc(r["color"])}"' if r["color"] else ""
        out.append(
            f'<div class="party-row"><div class="pr-party"><span class="pr-label"><span class="dot"{color}></span><b>{esc(r["label"])}</b></span>'
            f'<span class="small muted">{esc(", ".join(r["groups"]))}</span></div>'
            f'<div class="pr-dots" aria-hidden="true">{dots}</div><div class="pr-names">{names}</div></div>'
        )
    return "".join(out)


def fmt_date(iso: str | None) -> str:
    if not iso:
        return ""
    y, m, d = iso[:10].split("-")
    return f"{int(d)}. {int(m)}. {y}"


def display_name(mep: dict) -> str:
    if mep.get("given_name") and mep.get("family_name"):
        return f"{mep['given_name']} {mep['family_name']}"
    return mep["name"]


def current(items: list[dict]) -> dict | None:
    open_ = [x for x in items if not x.get("end")]
    return (open_ or items or [None])[-1]


def split_bar(counts: list[int]) -> str:
    total = sum(counts) or 1
    title = ", ".join(f"{POSITION_LABEL[k]}: {n}" for k, n in zip(POSITIONS, counts, strict=False))
    spans = "".join(f'<span class="s-{k}" style="width:{n / total * 100:.2f}%"></span>' for k, n in zip(POSITIONS, counts, strict=False))
    return f'<div class="split" role="img" aria-label="{esc(title)}">{spans}</div>'


def compare_card(total: list[int], cz_counts: list[int], src: str) -> str:
    """Celý parlament a Češi v jedné kartě, proužky pod sebou na stejné ose 0–100 % (stejné jako compareCard() v public/app.js)."""

    def row(label: str, n: list[int]) -> str:
        return (
            f'<div class="cmp-row"><div class="cmp-label">{label}</div>{split_bar(n)}'
            f'<div class="detail"><span class="pos pos-FOR">pro {n[0]}</span> · <span class="pos pos-AGAINST">proti {n[1]}</span> · '
            f"zdrželo se {n[2]} · nehlasovalo {n[3]}</div></div>"
        )

    return (
        f'<div class="card metric compare"><div class="label">Parlament a Češi</div>{row("Celý parlament", total)}'
        f'{row("Čeští poslanci", cz_counts)}<div class="detail"><a href="{esc(src)}">zdroj</a></div></div>'
    )


# Tlačítko „Sdílet“ v hlavičce stránky: stejný kód jako SHARE_BTN_HTML / shareButton() v public/share.js (hlídá test).
SHARE_BUTTON = (
    '<button type="button" class="share-btn" data-share aria-haspopup="dialog"><svg width="18" height="18" viewBox="0 0 24 24'
    '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8'
    'l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg><span>Sdílet</span></button>'
)


def back_row(href: str, label: str) -> str:
    """Řádek „← zpět“ s tlačítkem Sdílet vpravo (stejné místo na každé stránce, N2)."""
    return f'<div class="back-row"><p class="small"><a href="{href}">{esc(label)}</a></p>{SHARE_BUTTON}</div>'


OG_DEFAULT = "assets/brand/og-default.png"  # z scripts/build_brand.py, 1200 × 630


def og_meta(
    title: str,
    description: str,
    path: str,
    base_url: str | None,
    image: str | None = None,
    image_alt: str | None = None,
    card: bool = False,
) -> str:
    """Open Graph; absolutní URL jen když je známá adresa webu (data/manual/site.json).
    card = image je karta ke sdílení 1200 × 630 (scripts/build_cards.py): přidá rozměry, alt a velký náhled pro X."""
    lines = [
        '<meta property="og:type" content="website">',
        f'<meta property="og:title" content="{esc(title)}">',
        f'<meta property="og:description" content="{esc(description)}">',
        '<meta property="og:locale" content="cs_CZ">',
    ]
    if base_url:
        url = page_url(base_url, path)
        lines += [f'<link rel="canonical" href="{esc(url)}">', f'<meta property="og:url" content="{esc(url)}">']
        image = image or OG_DEFAULT  # bez vlastní karty výchozí náhled s logem (scripts/build_brand.py)
        card = card or image == OG_DEFAULT
        if image:
            img = base_url.rstrip("/") + "/" + image
            lines.append(f'<meta property="og:image" content="{esc(img)}">')
            if card:
                lines += [
                    '<meta property="og:image:width" content="1200">',
                    '<meta property="og:image:height" content="630">',
                    f'<meta property="og:image:alt" content="{esc(image_alt or title)}">',
                    '<meta name="twitter:card" content="summary_large_image">',
                    f'<meta name="twitter:image" content="{esc(img)}">',
                ]
    return "\n".join(lines) + "\n"


def kind_of(v: dict) -> tuple[str, bool]:
    return (v["vote_kind"], v.get("inverted", False)) if v.get("vote_kind") else classify(v)


# --- poslanec ------------------------------------------------------------------------


def mep_page(prof: dict, groups: list[dict], parties: list[dict], base_url: str | None, today: str) -> tuple[str, str]:
    """Profil poslance: celý obsah z profile_page.py (audit A1), profile.js jen doplní interakce."""
    from profile_page import profile_body, share_json

    mep, t = prof["mep"], prof["total"]
    name = display_name(mep)
    g, p = current(mep["groups"]), current(mep["parties"])
    att = t["attendance"]
    desc = (
        f"{name}: účast na hlasování {fmt_pct(att)} ({fmt_num(att[0])} z {fmt_num(att[1])} jmenovitých hlasování), "
        f"{group_label(g['code'] if g else None, groups)}, {p['short_label'] if p else 'strana neuvedena'}. Data z HowTheyVote.eu a EP."
    )
    body, share_ctx = profile_body(prof, groups, parties, today, SHARE_BUTTON)
    title = f"{name} – EP Watch CZ"
    meta = og_meta(title, desc, f"p/{mep['id']}.html", base_url, f"og/p/{mep['id']}.png", desc, card=True)
    # Jedna adresa profilu (U5): <base href="../">, takže odkazy i data se berou od kořene webu.
    path = f"p/{mep['id']}.html"
    share_script = f'<script type="application/json" id="share-context">{share_json(share_ctx)}</script>\n'
    return path, page(
        title,
        body,
        root="",
        base="../",
        path=path,
        current="meps",
        description=desc,
        meta=meta,
        main_attrs=f'data-mep="{mep["id"]}"',
        scripts=share_script + MODULES.format(root="", page="profile.js"),
    )


# --- duel (sdílené stránky d/{a}-{b}) ---------------------------------------------------


def duel_pages(data_dir: Path, base_url: str | None) -> dict[str, str]:
    """Stránky ke sdílení d/{a}-{b}.html pro každou dvojici z data/duel.json: stejná kostra jako duel.html (vezme se
    z public/duel.html), vlastní titulek, popis a og:image og/duel/{a}-{b}.png. duel.js dvojici čte z data-pair.
    Vznikají při sestavení (do gitu nejdou), v sitemap je jen duel.html."""
    path = data_dir / "duel.json"
    shell = data_dir.parent / "public" / "duel.html"
    if not path.exists() or not shell.exists():
        return {}
    duel = read(path)
    require(duel, ["meps", "pairs"], "duel.json")
    html_src = shell.read_text(encoding="utf-8")
    m = re.search(r'<main id="main">\n(.*)\n</main>', html_src, re.S)
    if not m:
        raise FormatError('public/duel.html: chybí <main id="main">')
    body = m.group(1)
    names = {x["id"]: " ".join(y for y in (x.get("given_name"), x.get("family_name")) if y) or x["name"] for x in duel["meps"]}
    out = {}
    for key, pair in duel["pairs"].items():
        lo, hi = (int(x) for x in key.split("-"))
        same, total = pair["agreement"]
        title = f"{names[lo]} vs {names[hi]} – Duel poslanců – EP Watch CZ"
        share = (
            f"hlasovali stejně v {fmt_pct(same / total)} z {fmt_num(total)} společných hlasování" if total else "neměli společné hlasování"
        )
        desc = f"{names[lo]} a {names[hi]}: {share}. Čísla vedle sebe, bez hodnocení. Data z HowTheyVote.eu a EP."
        rel = f"d/{key}.html"
        meta = og_meta(title, desc, rel, base_url, f"og/duel/{key}.png", desc, card=True)
        out[rel] = page(
            title,
            body,
            root="",
            base="../",
            path=rel,
            current="analyses",
            description=desc,
            meta=meta,
            main_attrs=f'data-pair="{key}"',
            scripts=MODULES.format(root="", page="pages/duel.js"),
        )
    return out


# --- strana --------------------------------------------------------------------------


def party_page(pp: dict, groups: list[dict], parties: list[dict], base_url: str | None, today: str) -> tuple[str, str]:
    """Detail strany: celý obsah z party_page.py (audit A1), party.js jen přepínač a sbalení tabulek."""
    from party_page import party_body
    from profile_page import share_json

    name = pp.get("name") or pp["short_label"]
    desc = (
        f"{name} ({pp['short_label']}) v Evropském parlamentu: {meps_count(pp['members'])} v 10. období, "
        f"jednotnost {fmt_pct(pp['cohesion'])}. Data z HowTheyVote.eu a EP."
    )
    body, share_ctx = party_body(pp, groups, parties, today, SHARE_BUTTON)
    title = f"{name} – EP Watch CZ"
    # Jedna adresa strany: <base href="../">, odkazy i data se berou od kořene webu (jako u profilu poslance).
    path = f"s/{pp['id']}.html"
    share_script = f'<script type="application/json" id="share-context">{share_json(share_ctx)}</script>\n'
    return path, page(
        title,
        body,
        root="",
        base="../",
        path=path,
        current="parties",
        description=desc,
        meta=og_meta(title, desc, path, base_url, None, "EP Watch CZ – fakta a data o českých europoslancích"),
        main_attrs=f'data-party="{pp["id"]}"',
        scripts=share_script + MODULES.format(root="", page="party.js"),
    )


# --- hlasování -----------------------------------------------------------------------


def adopted_text_url(ref: str | None) -> str | None:
    import re

    m = re.fullmatch(r"P(\d+)_TA\((\d{4})\)(\d{4})", ref or "")
    return f"https://data.europarl.europa.eu/distribution/doc/TA-{m[1]}-{m[2]}-{m[3]}_cs.pdf" if m else None


# Čipy tématu hlasování: dvojče topicChips() v public/app.js (stejné značky, třídy a ikony, hlídá test).
# Téma = kategorie z pevné tabulky pravidel nad kódy OEIL (categories.py), stejně jako čip v seznamu hlasování.
TOPIC_NOTE = (
    "Téma určuje pevná tabulka pravidel nad kódy témat Legislativní observatoře EP, které uvádí zdroj dat. Nevybíráme ho my ani AI."
)


def topic_chips(cats: list[str] | None, max_: int = 4, link: bool = True, id_: str = "x", root: str = "", info: bool = False) -> str:
    known = [k for k in (cats or []) if k in CAT_LABEL]
    if not known:
        return ""
    svg = lambda k: (
        f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" '
        f'stroke-linejoin="round" aria-hidden="true">{CAT_ICON[k]}</svg>'
    )

    def chip(k: str) -> str:
        inner = f'<span class="cat-ico sm">{svg(k)}</span>{esc(CAT_LABEL[k])}'
        return f'<a class="topic-chip" href="{root}votes?c={k}">{inner}</a>' if link else f'<span class="topic-chip">{inner}</span>'

    shown, rest = known[:max_], known[max_:]
    method = f'<a href="{root}o-projektu#tema-hlasovani">Jak určujeme téma</a>'
    more = (
        (
            f'<span class="info-wrap"><button type="button" class="topic-chip tc-more" popovertarget="tc-{id_}" aria-expanded="false" '
            f'aria-label="{esc("Další témata: " + ", ".join(CAT_LABEL[k] for k in rest))}">+{len(rest)}</button>'
            f'<div popover id="tc-{id_}" class="info-pop tc-pop" role="note"><p class="tc-list">{"".join(chip(k) for k in rest)}</p>'
            f'<p class="small">{method}</p></div></span>'
        )
        if rest
        else ""
    )
    tip = (
        (
            f'<span class="info-wrap"><button type="button" class="info-btn" popovertarget="ti-{id_}" aria-label="Jak určujeme téma" aria-expanded="false">ⓘ</button>'
            f'<div popover id="ti-{id_}" class="info-pop" role="note"><p>{TOPIC_NOTE} {method}.</p></div></span>'
        )
        if info
        else ""
    )
    return f'<span class="topic-chips">{"".join(chip(k) for k in shown)}{more}{tip}</span>'


CZ_GEO_TITLE = "Zdroj (HowTheyVote.eu) uvádí u hlasování geografické téma Česko"


def cz_geo_tag(v: dict) -> str:
    """Štítek „Týká se Česka“, jen když to uvádí zdroj (topics.geo s kódem CZE). Dvojče czGeoTag v app.js."""
    geo = ((v.get("topics") or {}).get("geo")) or []
    return f'<span class="tag cz-geo" title="{CZ_GEO_TITLE}">Týká se Česka</span>' if any(g.get("code") == "CZE" for g in geo) else ""


def topic_text(cats: list[str] | None) -> str:
    """Téma do citace, alt textu a popisu: „Klima, příroda a energie (+2)“; bez tématu prázdné."""
    known = [k for k in (cats or []) if k in CAT_LABEL]
    return f"{CAT_LABEL[known[0]]}{f' (+{len(known) - 1})' if len(known) > 1 else ''}" if known else ""


OFFICIAL_TITLE_NOTE = "Český název je oficiální název procedury z EP Open Data."
AI_TITLE_NOTE = "EP k tomuto hlasování český název nevede, jde o překlad AI (Claude Haiku)."


def original_title_html(v: dict) -> str:
    """Původní anglický název z HowTheyVote, když web ukazuje oficiální český název procedury z EP Open Data."""
    if not v.get("title_cs") or not v.get("title") or v["title"] == v["title_cs"]:
        return ""
    return (
        f'<p class="small muted">{AI_TITLE_NOTE if v.get("title_cs_ai") else OFFICIAL_TITLE_NOTE} Původní název hlasování '
        f"(HowTheyVote.eu): {esc(v['title'])}</p>"
    )


def vote_share_data(
    v: dict,
    meps_by_id: dict,
    groups: list[dict],
    parties: list[dict] | None,
    data_day: str | None,
    rows: list[dict] | None = None,
    trace: bool = False,
) -> dict:
    """Data karty hlasování pro panel sdílení (share.js voteCardOps): detail v/ i hemicykl na úvodní stránce.
    Strany se jmény poslanců (card_items); rows zůstává kvůli volajícím, karta ho nepotřebuje."""
    kind, _ = kind_of(v)
    title_txt = vote_title(v)
    desc_cs = v.get("description_cs") or translate(v.get("description"))
    c = v["counts"]
    return {
        "title": title_txt,
        "subtitle": " · ".join(x for x in (desc_cs or v.get("description"), v.get("reference")) if x),
        "date": v["date"],
        "kindLabel": KIND_LABELS.get(kind, "hlasování"),
        "result": v.get("result"),
        "resultLabel": RESULT_LABEL.get(v.get("result"), "neuveden"),
        "sentence": result_sentence(kind, v.get("result")),
        "ep": [c["for"], c["against"], c["abstention"], c["did_not_vote"]],
        "parties": card_items(active_positions(v, meps_by_id), meps_by_id, parties or [], groups),
        "topic": topic_text(categories_for(v)) or None,
        # Štítek „česká stopa“ (zpravodaj nebo stínový zpravodaj z ČR, vote_roles.json); bez záznamu se vynechá.
        **({"trace": True} if trace else {}),
        # Datum exportu dat jen když ho volající chce; statické stránky ho nemají (doplní ho share.js za běhu
        # z overview.json), aby se stránky a karty nepřepisovaly při každém novém exportu (revize, blok A).
        **({"dataDay": data_day} if data_day else {}),
    }


def vote_page(
    v: dict,
    meps_by_id: dict,
    groups: list[dict],
    base_url: str | None,
    has_card: bool = False,
    roles: list[dict] | None = None,
    parties: list[dict] | None = None,
    data_day: str | None = None,
    extra: dict | None = None,
) -> tuple[str, str]:
    kind, _ = kind_of(v)
    title_txt = vote_title(v)
    desc_cs = v.get("description_cs") or translate(v.get("description"))
    c = v["counts"]
    total = [c["for"], c["against"], c["abstention"], c["did_not_vote"]]
    cz = active_positions(v, meps_by_id)
    cz_counts = [sum(p["position"] == k for p in cz) for k in POSITIONS]
    result = RESULT_LABEL.get(v.get("result"), "neuveden")
    src = v.get("source_url") or f"{HTV}/votes/{v['id']}"
    adopted = adopted_text_url(v.get("texts_adopted_reference"))
    cats = categories_for(v)
    topic = topic_text(cats)
    desc = (
        f"Hlasování Evropského parlamentu {fmt_date(v['date'])}{' · ' + topic if topic else ''}: {title_txt}. Výsledek: {result} "
        f"({c['for']} pro, {c['against']} proti). Čeští poslanci: {cz_counts[0]} pro, {cz_counts[1]} proti, "
        f"{cz_counts[2]} se zdrželo, {cz_counts[3]} nehlasovalo."
    )
    lists, nobody = [], []
    for k in POSITIONS:
        names = sorted((meps_by_id[p["member_id"]] for p in cz if p["position"] == k), key=lambda m: m.get("sort_label") or m["name"])
        if not names:  # prázdné skupiny se sbalí do jedné věty pod seznamy (jako na interaktivní stránce)
            nobody.append(POSITION_LABEL[k])
            continue
        items = "".join(f'<li><a href="{ROOT}p/{m["id"]}">{esc(display_name(m))}</a></li>' for m in names)
        lists.append(
            f'<div class="card"><h3 class="pos pos-{k}">{POSITION_LABEL[k]} ({len(names)})</h3><ul class="plain">{items}</ul></div>'
        )
    cz_groups = {p["group_code"] for p in cz}
    trace = ""
    if roles:
        link = lambda r: (
            f'<a href="{ROOT}p/{r["mep_id"]}">{esc(display_name(meps_by_id[r["mep_id"]]))}</a>' if r["mep_id"] in meps_by_id else ""
        )
        lead = ", ".join(x for x in (link(r) for r in roles if r["role"] != "shadow") if x)
        shadow = ", ".join(x for x in (link(r) for r in roles if r["role"] == "shadow") if x)
        reports = ", ".join(sorted({r["report"] for r in roles if r.get("report")}))
        trace = (
            '<p class="small" id="ceska-stopa"><strong>Česká stopa:</strong> '
            + (f"zpravodaj/ka {lead}" if lead else "")
            + (" · " if lead and shadow else "")
            + (f"stínoví zpravodajové z ČR: {shadow}" if shadow else "")
            + f' <span class="muted">(zpráva {esc(reports)}; zdroj EP Open Data)</span></p>'
        )
    group_rows = "".join(
        f"<tr{' class=cz-row' if code in cz_groups else ''}><td>{esc(group_label(code, groups))}</td>{''.join(f'<td class=num>{n}</td>' for n in row)}"
        f"<td>{esc(group_majority_label(row) or 'bez jasné většiny')}</td><td>{split_bar(row)}</td></tr>"
        for code, row in sorted(v["group_counts"].items(), key=lambda x: -sum(x[1]))
    )
    rows = party_rows(cz, meps_by_id, parties or [], groups)
    party_html = party_rows_html(rows, ROOT)
    sentence = result_sentence(kind, v.get("result"))
    share_data = vote_share_data(v, meps_by_id, groups, parties, None, rows, bool(roles))
    # Detail ke sdílení (3 obrázky): frakce v EP a Češi jinak než frakce, česká stopa, AI shrnutí a stav procedury.
    share_data["detail"] = vote_detail(
        v, cz, meps_by_id, parties or [], groups, roles, (extra or {}).get("summary"), (extra or {}).get("procedure")
    )
    n_groups = len(v["group_counts"])
    links = [
        f'<a href="{esc(src)}">Originál na HowTheyVote.eu</a>',
        f'<a href="{ROOT}vote?id={v["id"]}&amp;m={v["date"][:7]}">Interaktivní detail</a>',
    ]
    if adopted:
        links.append(f'<a href="{esc(adopted)}">Přijatý text (PDF, EP)</a>')
    proc = (v.get("procedure") or {}).get("reference")
    story = ""
    if proc and re.match(r"^\d{4}/\d{4}\([A-Z]{3}\)$", proc):
        slug = proc.replace("/", "-").replace("(", "-").rstrip(")")
        story = (
            f'<p class="small story-link"><a href="{ROOT}z/{slug}">Příběh zákona: celý průběh a všechna hlasování k {esc(proc)} '
            '<span aria-hidden="true">→</span></a></p>'
        )
    if proc:
        links.append(
            f'<a href="https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference={esc(proc)}">'
            f"Legislativní observatoř ({esc(proc)})</a>"
        )
    # Citace pro panel sdílení („Kopírovat jako citaci“); ❝ v rohu karty už není.
    cite = (
        f"Evropský parlament {fmt_date(v['date'])}, {title_txt} ({KIND_LABELS.get(kind, kind)}{', téma ' + topic if topic else ''}): {result}, "
        f"{c['for']} pro, {c['against']} proti, {c['abstention']} se zdrželo. Čeští poslanci v mandátu: "
        f"{cz_counts[0]} pro, {cz_counts[1]} proti, {cz_counts[2]} se zdrželo, {cz_counts[3]} nehlasovalo. "
        f"Zdroj: HowTheyVote.eu ({src})"
    )
    share_ctx = {
        "kind": "vote",
        "path": f"v/{v['id']}",
        "filename": f"ep-watch-hlasovani-{v['id']}",
        "subtitle": "Hlasování · " + fmt_date(v["date"]) + (" · " + topic if topic else ""),
        "cite": cite,
        "text": f"{title_txt} ({fmt_date(v['date'])}): {sentence}."
        + (" Nehlasoval/a: hlas není zaznamenaný, důvody data neuvádějí." if cz_counts[3] else "")
        + " Zdroj: HowTheyVote.eu, EP Watch CZ",
        "data": share_data,
    }
    # Kontext panelu sdílení jako JSON (share.js), ne inline skript: CSP nepovoluje 'unsafe-inline'.
    share_script = f'<script type="application/json" id="share-context">{json_script(share_ctx)}</script>\n'
    body = f"""{back_row(f"{ROOT}votes?m={v['date'][:7]}", "← Hlasování v měsíci")}
<p class="muted vote-meta" style="margin-bottom:.3rem"><span>{fmt_date(v["date"])}</span>{topic_chips(cats, 4, True, str(v["id"]), ROOT, True)}{cz_geo_tag(v)}<span class="tag kind-{kind}">{esc(KIND_LABELS.get(kind, kind))}</span></p>
<h1{' class="long"' if len(title_txt) > LONG_TITLE else ""}>{esc(title_txt)}</h1>
{f'<p class="muted vote-desc">{esc(desc_cs or v.get("description"))}{" · " + esc(v["reference"]) if v.get("reference") else ""}</p>' if (desc_cs or v.get("description")) else ""}
{story}{vote_meaning_html(kind, ROOT)}<details class="links-more"><summary>zdroje a odkazy</summary><p class="small">{" · ".join(links)}</p>{original_title_html(v)}</details>
<div class="metrics">
  <div class="card metric"><div class="label">Výsledek</div><div class="value-sentence">{esc(result_sentence(kind, v.get("result")))}</div>
    <div class="detail"><span class="res-badge res-{v.get("result") or "NONE"}"><i class="res-ic" aria-hidden="true">{"✓" if v.get("result") == "ADOPTED" else "✕" if v.get("result") == "REJECTED" else "–"}</i><span class="res-txt">{result}</span></span></div>
    <div class="detail">celý parlament · <a href="{esc(src)}">zdroj</a></div></div>
  {compare_card(total, cz_counts, src)}
</div>
{trace}<h2>Jak hlasovali Češi</h2>
<div class="cz-views" data-view="party">
  <div class="view-switch" role="group" aria-label="Způsob zobrazení"><button type="button" data-cz-view="party" aria-pressed="true">Podle stran</button><button type="button" data-cz-view="vote" aria-pressed="false">Podle hlasu</button></div>
  <div class="cz-by-party">{party_html}</div>
  <div class="cz-by-vote"><div class="positions-grid">{"".join(lists)}</div>
  {f'<p class="small muted">Nikdo z Čechů: {", ".join(nobody)}.</p>' if nobody else ""}</div>
</div>
<div class="legend" aria-hidden="true"><span><i style="background:var(--for)"></i>pro</span><span><i style="background:var(--against)"></i>proti</span><span><i style="background:var(--abst)"></i>zdržel/a se</span><span><i class="absent"></i>nehlasoval/a</span></div>
<p class="source">Strana a frakce k datu hlasování, jen poslanci v mandátu. Zdroj: <a href="{esc(src)}">HowTheyVote.eu</a> (ODbL).</p>
<details class="explain wide"><summary><strong>Jak hlasovaly frakce</strong> · {n_groups} frakcí, zvýrazněné ty s Čechy</summary>
<div class="table-wrap"><table><thead><tr><th>Frakce</th><th class="num">Pro</th><th class="num">Proti</th><th class="num">Zdrž.</th><th class="num">Nehl.</th><th>Většina frakce</th><th>Rozložení</th></tr></thead>
<tbody>{group_rows}</tbody></table></div>
<p class="small muted">Zvýrazněné řádky jsou frakce, ve kterých sedí čeští poslanci. Většina frakce = jednoznačně nejvíc hlasů pro, proti nebo zdržet se.</p>
<p class="source">Počty spočítané z hlasování jednotlivých poslanců. Zdroj: <a href="{esc(src)}">HowTheyVote.eu</a>.</p></details>"""
    title = f"{title_txt} ({fmt_date(v['date'])}) – EP Watch CZ"
    return f"v/{v['id']}.html", page(
        title,
        body,
        root=ROOT,
        current="votes",
        description=desc,
        meta=og_meta(title, desc, f"v/{v['id']}.html", base_url, f"og/v/{v['id']}.png" if has_card else None, desc, card=True),
        scripts=f'<script type="module" src="{ROOT}app.js"></script>\n{share_script}<script type="module" src="{ROOT}share.js"></script>\n',
    )


# --- běh -----------------------------------------------------------------------------


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build(data_dir: Path) -> dict[str, str]:
    """Vrací {relativní cesta: HTML}."""
    overview = read(data_dir / "overview.json")
    require(overview, ["meps"], "overview.json")
    groups = read(data_dir / "groups.json")
    parties = read(data_dir / "parties.json")
    site_path = data_dir / "manual" / "site.json"
    base_url = read(site_path).get("base_url") if site_path.exists() else None
    meps_doc = read(data_dir / "meps.json")
    apply_name_overrides(meps_doc["meps"], data_dir / "manual" / "overrides.json")
    meps_by_id = {m["id"]: m for m in meps_doc["meps"]}
    release = (overview.get("sources") or {}).get("votes", {}).get("release") or ""
    data_day = release if len(release) == 10 and release[4] == "-" else overview["period"]["to"]  # export HowTheyVote = „data k“
    out = {}
    for m in overview["meps"]:
        prof = read(data_dir / "meps" / f"{m['id']}.json")
        require(prof, ["mep", "total", "recent_main_votes"], f"meps/{m['id']}.json")
        apply_name_overrides([prof["mep"]], data_dir / "manual" / "overrides.json")
        path, html = mep_page(prof, groups, parties, base_url, data_day)
        out[path] = html
    idx_path = data_dir / "parties" / "index.json"
    if idx_path.exists():
        for p in read(idx_path)["parties"]:
            path, html = party_page(read(data_dir / "parties" / f"{p['id']}.json"), groups, parties, base_url, data_day)
            out[path] = html
    _, votes = load_votes(data_dir / "votes")
    vr_path = data_dir / "vote_roles.json"
    vote_roles = read(vr_path)["votes"] if vr_path.exists() else {}
    with_card = card_vote_ids(votes)  # závěrečná hlasování za 12 měsíců mají kartu (build_cards.py), starší obecný obrázek
    from procedure_pages import procedure_briefs  # až tady: importuje pomocné funkce z tohoto modulu

    briefs = procedure_briefs(data_dir, votes)
    sums_path = data_dir / "vote_summaries.json"
    sums = read(sums_path).get("items", {}) if sums_path.exists() else {}
    for v in votes:
        if is_final(v):
            extra = {
                "summary": sums.get(str(v["id"])),
                "procedure": briefs.get((v.get("procedure") or {}).get("reference") or ""),
            }
            path, html = vote_page(
                v, meps_by_id, groups, base_url, v["id"] in with_card, vote_roles.get(str(v["id"])), parties, data_day, extra
            )
            out[path] = html
    from procedure_pages import procedure_pages  # až tady: importuje pomocné funkce z tohoto modulu

    out.update(procedure_pages(data_dir, votes, meps_by_id, base_url))
    out.update(duel_pages(data_dir, base_url))
    from hub import hub_page  # až tady: hub.py importuje pomocné funkce z tohoto modulu

    if (data_dir / "home.json").exists():  # data/home.json vzniká v build_web.py (build_home.py)
        from portal import portal_page  # rozcestník na „/“ (index.html), Aktuálně je hub_page (aktualne.html)

        for fn in (hub_page, portal_page):
            path, html = fn(data_dir, base_url)
            out[path] = html
    from session_page import session_page  # stránka Zasedání (zasedani.html) z programu v radar.json

    res = session_page(data_dir, base_url)
    if res:
        out[res[0]] = res[1]
    for path in out:
        if REPORT_PAGES.match(path):
            out[path] = with_report_link(out[path], page_url(base_url or "https://epwatch.cz", path))
    out["404.html"] = not_found_page()
    if base_url:
        lastmod = {f"v/{v['id']}.html": v["date"] for v in votes if is_final(v)}
        # sdílené stránky duelu (d/) do sitemap nejdou, jen duel.html (zadání 24. 10. 2026, B4)
        out.update(sitemap(base_url, sorted(p for p in out if not p.startswith("d/") and p != "404.html"), lastmod, data_day))
        out["feed.xml"] = atom_feed(base_url, votes, meps_by_id)
    return out


# Odkaz „Našli jste chybu?“ na profilu, hlasování a straně (O5): formulář na /o-projektu s předvyplněnou adresou stránky.
REPORT_PAGES = re.compile(r"(p|v|s)/[^/]+\.html")


def with_report_link(html: str, url: str) -> str:
    link = (
        f'<p class="report-link small"><a href="/o-projektu?stranka={quote(url, safe="")}#kontakt">Našli jste chybu?</a> '
        "Napište nám, ověříme ji proti zdroji a opravu zveřejníme.</p>"
    )
    if html.count("\n</main>") != 1:
        raise FormatError("stránka bez jediného </main>, odkaz na nahlášení chyby nejde vložit")
    return html.replace("\n</main>", f"\n{link}\n</main>")


LONG_TITLE = 120  # od kolika znaků je H1 hlasování menší (O11)


def not_found_page() -> str:
    """public/404.html (Vercel ji vrátí sám u neexistující adresy, O4). Odkazy od kořene webu, protože se ukáže na libovolné
    adrese (/p/x/y); hledání bez JS odešle dotaz na Poslance, s JS ho doplní našeptávač z app.js."""
    body = """<section class="page-head">
  <h1>Stránka nenalezena</h1>
  <p class="lead">Adresa neexistuje nebo se změnila (např. dřívější <code>/mep?id=…</code> je dnes <code>/p/…</code>).</p>
</section>
<form class="nf-search" role="search" action="/poslanci" method="get">
  <label for="nf-q">Najít poslance, stranu nebo hlasování</label>
  <input id="nf-q" name="q" type="search" autocomplete="off" placeholder="Jméno, strana nebo téma…">
  <button type="submit" class="btn">Hledat</button>
</form>
<ul class="nf-links">
  <li><a href="/poslanci">Poslanci</a></li>
  <li><a href="/hlasovani">Hlasování</a></li>
  <li><a href="/">Úvod</a></li>
</ul>"""
    return page(
        "Stránka nenalezena – EP Watch CZ",
        body,
        root="/",
        meta='<meta name="robots" content="noindex">\n',
        scripts='<script type="module" src="/app.js"></script>\n',
    )


STATIC_PAGES = [
    "index.html",
    "poslanci.html",
    "hlasovani.html",
    "votes.html",
    "temata.html",
    "radar.html",
    "party.html",
    "analyzy.html",
    "rozkol.html",
    "rozhodujici.html",
    "shoda.html",
    "duel.html",
    "kviz.html",
    "prace.html",
    "prace-poslanci.html",
    "o-projektu.html",
]


def sitemap(base_url: str, paths: list[str], lastmod: dict[str, str] | None = None, default_day: str | None = None) -> dict[str, str]:
    """sitemap.xml s lastmod (u hlasování datum hlasování, jinak datum dat) a robots.txt."""
    base = base_url.rstrip("/") + "/"
    lastmod = lastmod or {}

    def url(p: str) -> str:
        day = lastmod.get(p) or default_day
        loc = page_url(base, p)  # bez .html (cleanUrls), úvod jako kanonické „/“
        return f"  <url><loc>{esc(loc)}</loc>{f'<lastmod>{day}</lastmod>' if day else ''}</url>\n"

    urls = "".join(url(p) for p in dict.fromkeys(STATIC_PAGES + paths))  # index.html je v obou seznamech
    return {
        "sitemap.xml": f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n',
        "robots.txt": f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n",
    }


FEED_SIZE = 30


def atom_feed(base_url: str, votes: list[dict], meps_by_id: dict) -> str:
    """Atom feed posledních závěrečných hlasování (public/feed.xml). Jen data hlasování, bez data generování,
    takže se soubor mění jen s novým hlasováním."""
    base = base_url.rstrip("/") + "/"
    finals = sorted((v for v in votes if is_final(v)), key=lambda v: (v["date"], v.get("timestamp") or "", v["id"]), reverse=True)[
        :FEED_SIZE
    ]

    def entry(v: dict) -> str:
        kind, _ = kind_of(v)
        cz = active_positions(v, meps_by_id)
        n = [sum(p["position"] == k for p in cz) for k in POSITIONS]
        topic = topic_text(categories_for(v))
        url = page_url(base, f"v/{v['id']}.html")
        summary = (
            f"{fmt_date(v['date'])}{' · ' + topic if topic else ''} · {KIND_LABELS.get(kind, kind)}: "
            f"{result_sentence(kind, v.get('result'))}. Čeští poslanci: {n[0]} pro, {n[1]} proti, {n[2]} se zdrželo, {n[3]} nehlasovalo. "
            f"Zdroj: HowTheyVote.eu (ODbL)."
        )
        return (
            f"  <entry>\n    <id>{esc(url)}</id>\n    <title>{esc(vote_title(v))}</title>\n"
            f'    <link href="{esc(url)}"/>\n    <updated>{v["date"]}T12:00:00Z</updated>\n'
            f"    <summary>{esc(summary)}</summary>\n  </entry>\n"
        )

    updated = finals[0]["date"] if finals else "2024-07-16"
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="cs">\n'
        f"  <id>{esc(base)}</id>\n  <title>EP Watch CZ – závěrečná hlasování</title>\n"
        f"  <subtitle>Jak hlasovali čeští europoslanci. Data HowTheyVote.eu a EP Open Data.</subtitle>\n"
        f'  <link href="{esc(base)}"/>\n  <link rel="self" href="{esc(base)}feed.xml"/>\n'
        f"  <updated>{updated}T12:00:00Z</updated>\n  <author><name>EP Watch CZ</name></author>\n"
        + "".join(entry(v) for v in finals)
        + "</feed>\n"
    )


# Názvy definic metrik na stránce O projektu (klíč → název). Klíč bez názvu je chyba, ne holý klíč na webu.
DEFINITION_NAMES = {
    "attendance": "Účast na hlasování",
    "attendance_main": "Účast na hlasování – závěrečná",
    "vote_kind": "Typ hlasování",
    "group_loyalty": "Hlasuje s frakcí",
    "cz_agreement": "Shoda s ostatními Čechy",
    "pairwise": "S kým hlasuje stejně",
    "outcome_agreement": "Soulad s výsledkem",
    "group_outcome_agreement": "Soulad s výsledkem – průměr frakce",
    "close_votes": "Těsná hlasování",
    "decisive_votes": "Kde rozhodly české hlasy",
    "against_group": "Kde hlasoval jinak než frakce",
    "cz_split": "Kde se Češi rozdělili",
    "cz_unity": "Češi jednotně",
    "party_cohesion": "Jednotnost strany",
    "topics": "Témata",
    "own_work": "Práce na textech",
    "work_profile": "Práce na textech – třetiny v delegaci",
    "delegations": "Srovnání s delegacemi podobné velikosti",
    "speeches": "Projevy v plénu",
    "presence": "Docházka na zasedání (podle EP)",
}


# Skupiny definic na stránce O projektu (sbalovací <details>, pořadí = pořadí na webu). Klíč mimo skupiny je chyba.
DEFINITION_GROUPS = [
    ("Hlasování", ["vote_kind", "attendance", "attendance_main", "close_votes", "decisive_votes", "topics"]),
    ("Poslanci a frakce", ["group_loyalty", "against_group", "outcome_agreement", "group_outcome_agreement", "party_cohesion"]),
    ("Češi jako delegace", ["cz_agreement", "pairwise", "cz_split", "cz_unity", "delegations"]),
    ("Práce na textech", ["own_work", "work_profile", "speeches", "presence"]),
]
_DEF_LABEL_RE = re.compile(r"^([^:.]{2,60}):\s+")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ„0-9])")


def split_definition(name: str, text: str) -> tuple[str, str]:
    """(první věta, zbytek) definice. Úvodní „Název:“ se vynechá jen tehdy, když opakuje název pojmu
    (jinak nese informaci, např. „Účast na hlasování jen u závěrečných hlasování:“), a první písmeno se zvětší."""
    m = _DEF_LABEL_RE.match(text)
    if m and (m[1].lower() in name.lower() or name.lower() in m[1].lower()):
        text = text[m.end() :]
        text = text[:1].upper() + text[1:]
    first, *rest = _SENTENCE_RE.split(text, maxsplit=1)
    return first, rest[0] if rest else ""


def definitions_html(definitions: dict[str, str]) -> str:
    """Definice metrik jako statické HTML (pro „Jak počítáme“; funguje i bez JavaScriptu a pro vyhledávače):
    skupiny s <details id="klíč">, v <summary> název a první věta, v těle zbytek a odkaz na definici."""
    missing = [k for k in definitions if k not in DEFINITION_NAMES]
    if missing:
        raise FormatError(f"definice bez názvu v DEFINITION_NAMES: {', '.join(missing)}")
    grouped = [k for _, keys in DEFINITION_GROUPS for k in keys]
    ungrouped = [k for k in definitions if k not in grouped]
    if ungrouped:
        raise FormatError(f"definice bez skupiny v DEFINITION_GROUPS: {', '.join(ungrouped)}")
    out = []
    for title, keys in DEFINITION_GROUPS:
        items = []
        for k in (k for k in keys if k in definitions):
            first, rest = split_definition(DEFINITION_NAMES[k], definitions[k])
            body = f"<p>{esc(rest)}</p>" if rest else ""
            items.append(
                f'<details class="ab-def" id="{k}"><summary><b>{esc(DEFINITION_NAMES[k])}</b><span>{esc(first)}</span></summary>'
                f'<div class="ab-def-body">{body}<a class="ab-def-link" href="#{k}">odkaz na definici</a></div></details>\n'
            )
        if items:
            out.append(f'<div class="ab-group"><h3>{esc(title)}</h3>\n{"".join(items)}</div>\n')
    return "".join(out)


def sync_definitions(public: Path, data_dir: Path) -> bool:
    """Přepíše definice v public/o-projektu.html (blok <!--sync:definitions-->) podle data/overview.json.
    Vrací True, když se soubor změnil."""
    page = public / "o-projektu.html"
    overview = data_dir / "overview.json"
    if not page.exists() or not overview.exists():
        return False
    defs = json.loads(overview.read_text(encoding="utf-8")).get("definitions")
    if not defs:
        raise FormatError("overview.json nemá definitions")
    return sync_block(page, "definitions", definitions_html(defs).rstrip("\n"))


def sync_block(page: Path, name: str, html: str) -> bool:
    """Přepíše blok mezi <!--sync:NAME--> a <!--/sync:NAME--> v ruční stránce. Vrací True, když se soubor změnil."""
    rx = re.compile(rf"(<!--sync:{name}-->).*?(<!--/sync:{name}-->)", re.S)
    old = page.read_text(encoding="utf-8")
    if len(rx.findall(old)) != 1:
        raise FormatError(f"{page.name} nemá právě jeden blok <!--sync:{name}-->")
    new = rx.sub(lambda m: f"{m[1]}\n{html}\n{m[2]}", old)
    if new != old:
        page.write_text(new, encoding="utf-8")
    return new != old


def corrections_html(data_dir: Path) -> str:
    """Opravy z data/manual/corrections.json (ruční záznamy) jako položky časové osy „Opravy a změny“
    (<li data-kind="fix">, nejnovější první); prázdná = „Zatím žádné opravy.“"""
    path = data_dir / "manual" / "corrections.json"
    items = read(path)["corrections"] if path.exists() else []
    for i, c in enumerate(items):
        require(c, ["date", "wrong", "right"], f"manual/corrections.json[{i}]")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(c["date"])):
            raise FormatError(f"manual/corrections.json[{i}]: date není RRRR-MM-DD: {c['date']!r}")
    if not items:
        return '<li class="ab-tl-empty" data-kind="fix"><p>Zatím žádné opravy.</p></li>'

    def item(c: dict) -> str:
        link = f' <a href="{esc(c["link"])}">odkaz</a>' if c.get("link") else ""
        return (
            f'<li data-kind="fix"><time datetime="{c["date"]}">{fmt_date(c["date"])}</time> <span class="ab-tl-tag">oprava</span>'
            f'<p class="ab-tl-text"><strong>Co bylo špatně:</strong> {esc(c["wrong"])} <strong>Co je správně:</strong> {esc(c["right"])}{link}</p></li>'
        )

    return "\n".join(item(c) for c in sorted(items, key=lambda c: c["date"], reverse=True))


def follow_html() -> str:
    from layout import INSTAGRAM

    return (
        f'<p>Nová hlasování a souhrny zasedání sdílíme na Instagramu <a href="{INSTAGRAM}" rel="me noopener">@epwatch.cz</a>. '
        f'Stejná čísla jako na webu, vždy se zdrojem. Přehled změn odebírejte i přes <a href="feed.xml">RSS / Atom</a>.</p>'
    )


def sync_blocks(public: Path, data_dir: Path) -> int:
    """Portréty na poslanci.html a přehled na hlasovani.html se generují z dat při každém buildu (týdenní aktualizace)."""
    from hub import agenda_procedures, heads_html, next_session_html, radar_html, votes_hero_html, votes_overview_html

    changed = 0
    if (public / "o-projektu.html").exists() and "<!--sync:corrections-->" in (public / "o-projektu.html").read_text(encoding="utf-8"):
        changed += sync_block(public / "o-projektu.html", "corrections", corrections_html(data_dir))
        changed += sync_block(public / "o-projektu.html", "follow", follow_html())
    if (data_dir / "overview.json").exists() and (public / "poslanci.html").exists():
        changed += sync_block(public / "poslanci.html", "heads", heads_html(data_dir))
    if (data_dir / "key_votes.json").exists() and (data_dir / "session.json").exists() and (public / "hlasovani.html").exists():
        changed += sync_block(public / "hlasovani.html", "overview", votes_overview_html(data_dir))
    hlas = public / "hlasovani.html"
    if hlas.exists() and "<!--sync:agenda-->" in hlas.read_text(encoding="utf-8"):
        home = read(data_dir / "home.json") if (data_dir / "home.json").exists() else {}
        changed += sync_block(hlas, "agenda", next_session_html(home.get("agenda"), procs=agenda_procedures(data_dir)))
    if (public / "radar.html").exists() and (data_dir / "radar.json").exists():
        changed += sync_block(public / "radar.html", "radar", radar_html(read(data_dir / "radar.json")))
    if (data_dir / "category_stats.json").exists() and (data_dir / "session.json").exists() and (public / "hlasovani.html").exists():
        changed += sync_block(public / "hlasovani.html", "hero", votes_hero_html(data_dir))
    return changed


# Ruční stránky s jednou adresou: kanonický odkaz a absolutní adresy v Open Graph podle site.json.
# party.html chybí záměrně (?c=, ?v=eu jsou samostatné pohledy, kanonický odkaz na seznam by je schoval).
CANONICAL_PAGES = [p for p in STATIC_PAGES if p not in ("index.html", "party.html")]
_ABS_META_RE = re.compile(r'(<meta (?:property="og:(?:url|image)"|name="twitter:image") content=")https?://[^/"]+/')


def sync_head(page: Path, rel: str, base_url: str) -> bool:
    """Nastaví <link rel="canonical"> (vloží za <title>, když chybí) a og:url na adresu bez .html, doménu v og:image / twitter:image."""
    base = base_url.rstrip("/") + "/"
    url = page_url(base, rel)
    canon = f'<link rel="canonical" href="{esc(url)}">'
    old = page.read_text(encoding="utf-8")
    if '<link rel="canonical"' in old:
        new = re.sub(r'<link rel="canonical" href="[^"]*">', canon, old)
    elif "</title>\n" in old:
        new = old.replace("</title>\n", f"</title>\n{canon}\n", 1)
    else:
        raise FormatError(f"{rel} nemá <title> pro vložení kanonického odkazu")
    new = _ABS_META_RE.sub(lambda m: m[1] + base, new)
    new = re.sub(r'(<meta property="og:url" content=")[^"]*"', lambda m: f'{m[1]}{esc(url)}"', new)  # bez .html jako canonical
    if new != old:
        page.write_text(new, encoding="utf-8")
    return new != old


def sync_heads(public: Path, data_dir: Path) -> int:
    site = data_dir / "manual" / "site.json"
    base_url = read(site).get("base_url") if site.exists() else None
    if not base_url:
        return 0
    return sum(sync_head(public / rel, rel, base_url) for rel in CANONICAL_PAGES if (public / rel).exists())


def write(pages: dict[str, str], public: Path) -> dict[str, int]:
    """Zapíše stránky; soubory v p/, s/, v/, z/, d/, které už nevznikly, smaže. Nezměněné nepřepisuje."""
    written = removed = 0
    for sub in ("p", "s", "v", "z", "d"):
        d = public / sub
        d.mkdir(parents=True, exist_ok=True)
        for f in d.glob("*.html"):
            if f"{sub}/{f.name}" not in pages:
                f.unlink()
                removed += 1
    for rel, html in pages.items():
        f = public / rel
        if not f.exists() or f.read_text(encoding="utf-8") != html:
            f.write_text(html, encoding="utf-8")
            written += 1
    return {"pages": len(pages), "written": written, "removed": removed}


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=root / "data")
    p.add_argument("--public", type=Path, default=root / "public")
    args = p.parse_args(argv)
    try:
        res = write(build(args.data_dir), args.public)
        res["definitions_changed"] = int(sync_definitions(args.public, args.data_dir))
        res["blocks_changed"] = sync_blocks(args.public, args.data_dir)
        res["heads_changed"] = sync_heads(args.public, args.data_dir)
    except FormatError as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    print(f"statické stránky: {res}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
