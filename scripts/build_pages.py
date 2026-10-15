"""Statické stránky s obsahem vyrenderovaným na serveru (R7): trvalé odkazy, citace, náhledy ve sdílení.

Výstup (obyčejné HTML v repu, web zůstává bez build stepu):
  public/p/{id}.html   poslanec (souhrn, čísla se zdrojem, poslední závěrečná hlasování)
  public/s/{id}.html   strana
  public/v/{id}.html   závěrečné hlasování (o celém textu nebo o prozatímní dohodě)
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
import sys
from html import escape
from pathlib import Path

from build_cards import card_vote_ids
from build_web import vote_title
from compute_stats import FormatError, active_positions, load_votes, require
from labels_cs import translate
from layout import page
from overrides import apply_name_overrides
from vote_kinds import KIND_LABELS, classify, is_final

POSITION_LABEL = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdržel/a se", "DID_NOT_VOTE": "nehlasoval/a"}
POSITIONS = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"]
RESULT_LABEL = {"ADOPTED": "přijato", "REJECTED": "zamítnuto", "LAPSED": "propadlo", "WITHDRAWN": "staženo"}
HTV = "https://howtheyvote.eu"
NBSP = " "
ROOT = "../"
RECENT = 15


def esc(x) -> str:
    return escape(str(x if x is not None else ""))


def fmt_num(n) -> str:
    return f"{int(n):,}".replace(",", NBSP)


def fmt_pct(pair_or_value) -> str:
    v = pair_or_value
    if isinstance(v, list):
        v = v[0] / v[1] if v[1] else None
    return "–" if v is None else f"{v * 100:.1f}".replace(".", ",") + f"{NBSP}%"


WORK_INTRO = "Hlasování je jen část práce poslance. Kromě něj poslanci vedou zprávy a stanoviska výborů, vyjednávají je za frakci, kladou otázky Komisi a vystupují v rozpravách. Čísla ukazují, kolik takové práce kdo má přidělené, ne jak kvalitní je."


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


def fmt_date(iso: str | None) -> str:
    if not iso:
        return ""
    y, m, d = iso[:10].split("-")
    return f"{int(d)}. {int(m)}. {y}"


def by_gender(mep: dict, male: str, female: str) -> str:
    g = mep.get("gender")
    if g == "FEMALE":
        return female
    if g == "MALE":
        return male
    return f"{male}/{female[len(male):]}" if female.startswith(male) else f"{male} / {female}"


def position_for(position: str, mep: dict) -> str:
    if position == "ABSTENTION":
        return by_gender(mep, "zdržel se", "zdržela se")
    if position == "DID_NOT_VOTE":
        return by_gender(mep, "nehlasoval", "nehlasovala")
    return POSITION_LABEL[position]


def display_name(mep: dict) -> str:
    if mep.get("given_name") and mep.get("family_name"):
        return f"{mep['given_name']} {mep['family_name']}"
    return mep["name"]


def current(items: list[dict]) -> dict | None:
    open_ = [x for x in items if not x.get("end")]
    return (open_ or items or [None])[-1]


def split_bar(counts: list[int]) -> str:
    total = sum(counts) or 1
    title = ", ".join(f"{POSITION_LABEL[k]}: {n}" for k, n in zip(POSITIONS, counts))
    spans = "".join(f'<span class="s-{k}" style="width:{n / total * 100:.2f}%"></span>' for k, n in zip(POSITIONS, counts))
    return f'<div class="split" role="img" aria-label="{esc(title)}">{spans}</div>'


CITE_ICON = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.2 6C4.9 7.2 3.5 '
             '9.4 3.5 12.3V18h6.2v-6.1H6.6c.1-1.9 1-3.3 2.6-4.2L7.2 6zm9.8 0c-2.3 1.2-3.7 3.4-3.7 6.3V18h6.2v-6.1h-3.1c.1-1.9 1-3.3 '
             '2.6-4.2L17 6z"/></svg>')


def cite_button(text: str) -> str:
    return (f'<button type="button" class="cite-btn" data-cite="{esc(text)}" aria-label="Citovat" '
            f'title="Citovat (zkopíruje větu se zdrojem)">{CITE_ICON}</button>')


OG_DEFAULT = "assets/brand/og-default.png"  # z scripts/build_brand.py, 1200 × 630


def og_meta(title: str, description: str, path: str, base_url: str | None, image: str | None = None,
            image_alt: str | None = None, card: bool = False) -> str:
    """Open Graph; absolutní URL jen když je známá adresa webu (data/manual/site.json).
    card = image je karta ke sdílení 1200 × 630 (scripts/build_cards.py): přidá rozměry, alt a velký náhled pro X."""
    lines = [f'<meta property="og:type" content="website">', f'<meta property="og:title" content="{esc(title)}">',
             f'<meta property="og:description" content="{esc(description)}">', '<meta property="og:locale" content="cs_CZ">']
    if base_url:
        url = base_url.rstrip("/") + "/" + path
        lines += [f'<link rel="canonical" href="{esc(url)}">', f'<meta property="og:url" content="{esc(url)}">']
        image = image or OG_DEFAULT  # bez vlastní karty výchozí náhled s logem (scripts/build_brand.py)
        card = card or image == OG_DEFAULT
        if image:
            img = base_url.rstrip("/") + "/" + image
            lines.append(f'<meta property="og:image" content="{esc(img)}">')
            if card:
                lines += ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
                          f'<meta property="og:image:alt" content="{esc(image_alt or title)}">',
                          '<meta name="twitter:card" content="summary_large_image">', f'<meta name="twitter:image" content="{esc(img)}">']
    return "\n".join(lines) + "\n"


def group_label(code: str | None, groups: list[dict]) -> str:
    if not code:
        return "bez frakce"
    g = next((x for x in groups if x["code"] == code or x.get("ep_code") == code), None)
    if g and g["code"] == "NI":
        return "nezařazení"
    return g["short_label"] if g else code


def kind_of(v: dict) -> tuple[str, bool]:
    return (v["vote_kind"], v.get("inverted", False)) if v.get("vote_kind") else classify(v)


# --- poslanec ------------------------------------------------------------------------

def metric(label: str, pair: list[int] | None, detail: str, bench_line: str = "", cite: str = "") -> str:
    if not (pair and pair[1]):
        bench_line = cite = ""  # srovnání ani citace u nepočítané metriky
    count = f"{fmt_num(pair[0])} z {fmt_num(pair[1])} hlasování" if pair and pair[1] else "nepočítá se"
    return (f'<div class="card metric"><div class="label">{label}</div><div class="value">{fmt_pct(pair) if pair else "–"}</div>'
            f'<div class="detail">{count}</div>{bench_line}<div class="detail">{detail}</div>{cite}</div>')


def presence_card(pr: dict | None) -> str:
    """Prezence na zasedání podle prezenční listiny EP (bez mediánu a pořadí)."""
    if not pr or not pr["days"]:
        return ""
    excused = f' · {fmt_num(pr["excused"])} omluven/a' if pr.get("excused") else ""
    return (f'<div class="card metric"><div class="label">Prezence na zasedání (podle EP)</div><div class="value">{fmt_pct([pr["present"], pr["days"]])}</div>'
            f'<div class="detail">{fmt_num(pr["present"])} z {fmt_num(pr["days"])} dnů jednání v době mandátu{excused}</div>'
            f'<div class="detail">podle prezenční listiny EP · EP Open Data</div></div>')


def bench_line(b: dict | None, key: str) -> str:
    if not b:
        return ""
    parts = []
    if b["ep"].get(key) is not None:
        parts.append(f"medián EP {fmt_pct(b['ep'][key])}")
    if b.get("group") and b["group"].get(key) is not None:
        parts.append(f"medián frakce {fmt_pct(b['group'][key])}")
    return f'<div class="detail">{" · ".join(parts)}</div>' if parts else ""


def mep_page(prof: dict, groups: list[dict], parties: list[dict], base_url: str | None) -> tuple[str, str]:
    mep, t = prof["mep"], prof["total"]
    name = display_name(mep)
    g, p = current(mep["groups"]), current(mep["parties"])
    active = any(not m.get("end") for m in mep["mandates"])
    mandate = ", ".join(f"{fmt_date(m['start'])} – {fmt_date(m['end']) if m.get('end') else 'dosud'}" for m in mep["mandates"])
    htv = f"{HTV}/members/{mep['id']}"
    b = prof.get("benchmarks")
    rng = f"od {fmt_date(mep['mandates'][0]['start'])}"
    att = t["attendance"]
    desc = f"{name}: účast na hlasování {fmt_pct(att)} ({fmt_num(att[0])} z {fmt_num(att[1])} jmenovitých hlasování), " \
           f"{group_label(g['code'] if g else None, groups)}, {p['short_label'] if p else 'strana neuvedena'}. Data z HowTheyVote.eu a EP."
    cite = lambda what, pair: cite_button(
        f"{name}: {what} {fmt_pct(pair)} ({fmt_num(pair[0])} z {fmt_num(pair[1])} jmenovitých hlasování v Evropském parlamentu "
        f"v době mandátu, {rng}). Zdroj: HowTheyVote.eu, výpočet EP Watch CZ") if pair and pair[1] else ""
    photo = (f'<figure class="portrait"><img src="assets/photos/{mep["id"]}.jpg" alt="Portrét: {esc(name)}">'
             f'<figcaption>{esc(mep.get("photo_credit") or "© European Union – Source: EP")}</figcaption></figure>'
             if mep.get("photo_url") else "")
    rows = "".join(
        f'<tr><td class="num">{fmt_date(v["date"])}</td>'
        f'<td><a class="vote-title" href="v/{v["id"]}.html">{esc(v["title"])}</a>'
        f'<div class="small muted">{esc(v.get("reference") or "")}{" · " + esc(v.get("description_cs") or v.get("description")) if (v.get("description_cs") or v.get("description")) else ""}</div></td>'
        f'<td class="pos pos-{v["position"]}">{esc(position_for(v["position"], mep))}</td>'
        f'<td class="result-{v.get("result") or ""}">{RESULT_LABEL.get(v.get("result"), "neuveden")}</td></tr>'
        for v in prof["recent_main_votes"][:RECENT])
    own = prof.get("own_work")
    own_html = ""
    if own and own.get("summary"):
        items = "".join(f'<li><strong>{esc(own["type_labels"].get(k, k))}</strong>: {fmt_num(s["count"])}</li>'
                        for k, s in own["summary"].items() if s.get("count"))
        pa, ro = own.get("passed"), own.get("roles")
        if pa and ro:
            items = (f'<li><strong>Zprávy jako zpravodaj/ka</strong>: {fmt_num(ro["lead_reports"])} (prošlo {fmt_num(pa["lead_adopted"])})</li>'
                     f'<li><strong>Stanoviska jako zpravodaj/ka</strong>: {fmt_num(ro["lead_opinions"])}</li>'
                     f'<li><strong>Zprávy jako stínový/á zpravodaj/ka</strong>: {fmt_num(ro["shadow_reports"])} (prošlo {fmt_num(pa["shadow_adopted"])})</li>'
                     f'<li><strong>Stanoviska jako stínový/á zpravodaj/ka</strong>: {fmt_num(ro["shadow_opinions"])}</li>'
                     f'<li><strong>Podepsané návrhy usnesení</strong>: {fmt_num(ro["motions_signed"])} (přijato {fmt_num(pa["resolutions_adopted"])})</li>') + items
        if items:
            own_html = (f'<h2 id="vlastni-prace">Práce na textech</h2><p class="small muted">{WORK_INTRO}</p><div class="card"><ul class="plain">{items}</ul>'
                        f'<p class="source">Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0). '
                        f'Podrobnosti a výsledky hlasování jsou v plné verzi stránky (potřebuje JavaScript).</p></div>')
    act = prof.get("activity")
    if act:
        own_html += (f'<h3>Projevy v plénu</h3><div class="card"><ul class="plain">'
                     f'<li><strong>Ústní projevy v rozpravách</strong>: {fmt_num(act["speeches"])} (celkem {fmt_num(round(act["speeches_minutes"]))} min)</li>'
                     f'<li><strong>Písemná prohlášení</strong>: {fmt_num(act["written_statements"])} (počítají se zvlášť)</li></ul>'
                     f'<p class="source">Počty v době mandátu. Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0). '
                     f'Projevy nevypovídají o kvalitě ani vlivu.</p></div>')
    pos = t["positions"]
    body = f"""<p class="small"><a href="poslanci.html">← Všichni poslanci</a></p>
<div class="profile-head">
  {photo}
  <div>
    <h1>{esc(name)}</h1>
    <div class="facts"><span class="badge">{esc(group_label(g['code'] if g else None, groups))}</span>
      {f'<a class="badge-link" href="s/{esc(p["org_id"])}.html"><span class="badge">{esc(p["short_label"])}</span></a>' if p and any(str(x["id"]) == str(p["org_id"]) and not x.get("independent") for x in parties) else f'<span class="badge outline">{("nezávislý/á" if p["short_label"] == "Ind." or any(str(x["id"]) == str(p["org_id"]) and x.get("independent") for x in parties) else esc(p["short_label"])) if p else "strana neuvedena"}</span>'}
      <span class="badge outline">{"v mandátu" if active else by_gender(mep, "bývalý poslanec", "bývalá poslankyně")}</span></div>
    <p class="muted">Mandát: {mandate}</p>
    {f'<p class="small muted">Podoba jména: {esc(mep["name_note"])}</p>' if mep.get("name_note") else ""}
    {f'<p class="small note">Mandát kratší než 60 dní: procenta jsou z velmi malého počtu hlasování.</p>' if prof.get("short_mandate") else ""}
    <p class="small"><a href="{esc(mep.get('profile_url'))}">Profil na webu EP</a> · <a href="{htv}">Hlasování na HowTheyVote.eu</a></p>
  </div>
</div>

<h2 id="dochazka">Hlasování v číslech</h2>
<div class="metrics">
  {metric("Účast na hlasování", t["attendance"], "všechna jmenovitá hlasování v době mandátu", bench_line(b, "attendance"), cite("účast na hlasování", t["attendance"]))}
  {metric("Účast na hlasování – závěrečná", t["attendance_main"], "o celém textu nebo o prozatímní dohodě s Radou", bench_line(b, "attendance_main"), cite("účast na hlasování u závěrečných hlasování", t["attendance_main"]))}
  {presence_card(prof.get("presence"))}
  {metric("Hlasuje s frakcí", t["group_loyalty"], "jen informativní", bench_line(b, "group_loyalty"), cite("hlasuje s frakcí", t["group_loyalty"]))}
  {metric("Shoda s ostatními Čechy", t["cz_agreement"], "jen informativní")}
</div>
<p class="source">{by_gender(mep, "Hlasoval", "Hlasovala")} pro {fmt_num(pos["FOR"])}×, proti {fmt_num(pos["AGAINST"])}×,
  zdržel{by_gender(mep, "", "a")} se {fmt_num(pos["ABSTENTION"])}×, nehlasoval{by_gender(mep, "", "a")} {fmt_num(pos["DID_NOT_VOTE"])}×.
  Zdroj: <a href="{htv}">HowTheyVote.eu</a> (ODbL), <a href="o-projektu.html#metodika">metodika</a>{". " + esc(b["definition"]) if b else ""}</p>
{own_html}
<h2 id="posledni">Poslední závěrečná hlasování</h2>
{f'<div class="table-wrap"><table><thead><tr><th class="num">Datum</th><th>Hlasování</th><th>Volba</th><th>Výsledek</th></tr></thead><tbody>{rows}</tbody></table></div>' if rows else '<p class="muted">Žádná hlasování.</p>'}
<p class="source">Zdroj: <a href="{htv}">HowTheyVote.eu</a>. Všechna hlasování v <a href="votes.html">seznamu hlasování</a>.</p>"""
    title = f"{name} – EP Watch CZ"
    meta = og_meta(title, desc, f"p/{mep['id']}.html", base_url, f"og/p/{mep['id']}.png", desc, card=True)
    # Jedna adresa profilu (U5): <base href="../">, takže odkazy i data se berou od kořene webu;
    # profile.js obsah nahradí plnou interaktivní verzí, statický obsah zůstává pro vyhledávače a bez JS.
    path = f"p/{mep['id']}.html"
    return path, page(title, body, root="", base="../", path=path, current="meps", description=desc, meta=meta,
                      main_attrs=f'data-mep="{mep["id"]}"',
                      scripts='<script src="app.js"></script>\n<script src="share.js"></script>\n<script src="profile.js"></script>\n')


# --- strana --------------------------------------------------------------------------

def party_page(pp: dict, base_url: str | None) -> tuple[str, str]:
    name = pp.get("name") or pp["short_label"]
    coh = pp["cohesion"]
    desc = f"{name} ({pp['short_label']}) v Evropském parlamentu: {meps_count(pp['members'])} v 10. období, " \
           f"jednotnost {fmt_pct(coh)}. Data z HowTheyVote.eu a EP."
    members = "".join(
        f'<li><a href="p/{m["id"]}.html">{esc(display_name(m))}</a>'
        f'<div class="small muted">{", ".join(fmt_date(x["start"]) + " – " + (fmt_date(x["end"]) if x.get("end") else "dosud") for x in m["party_periods"])}'
        f' · účast na hlasování {fmt_pct(m["total"]["attendance"])}</div></li>'
        for m in sorted(pp["member_list"], key=lambda m: (-(m["total"]["attendance"][0] / m["total"]["attendance"][1])
                                                          if m["total"]["attendance"][1] else 1, m.get("sort_label") or m["name"])))
    cite = cite_button(f"{name}: poslanci strany v Evropském parlamentu hlasovali jednotně v {fmt_pct(coh)} hlasování "
                       f"({fmt_num(coh[0])} z {fmt_num(coh[1])}, kde hlasovali aspoň dva). Zdroj: HowTheyVote.eu, výpočet EP Watch CZ") if coh[1] else ""
    heading = f"<h1>{esc(name)}</h1>"
    if pp.get("logo"):
        a = pp.get("logo_aspect")  # stejná výška jako logoHeight() v app.js
        h = 40 if not a or a <= 1 else round(40 * max(0.42, a ** -0.4), 1)
        w = f' width="{round(h * pp["logo_aspect"])}"' if pp.get("logo_aspect") else ""
        heading = (f'<div class="entity-cell"><span class="logo-tile" style="height:40px"><img src="{esc(pp["logo"])}" '
                   f'alt="Logo {esc(name)}" style="height:{h:.0f}px"{w} height="{h:.0f}"></span><h1>{esc(name)}</h1></div>')
    splits_value = (f"{fmt_num(pp['splits_count'])} z {fmt_num(coh[1])} ({fmt_pct(pp['splits_count'] / coh[1])})"
                    if coh[1] else "jen 1 poslanec")
    body = f"""<p class="small"><a href="party.html">← Všechny strany</a></p>
{heading}
<p class="muted">{esc(pp['short_label'])} · {meps_count(pp['members'])} v 10. volebním období</p>
<div class="metrics">
  {metric("Jednotnost strany", coh, "hlasování, kde hlasovali aspoň dva poslanci strany", "", cite)}
  {metric("Jednotnost – závěrečná hlasování", pp["cohesion_main"], "o celém textu nebo o prozatímní dohodě s Radou")}
  <div class="card metric"><div class="label">Hlasování, kde se strana rozdělila</div><div class="value">{splits_value}</div>
    <div class="detail">aspoň jeden pro a jeden proti; z toho závěrečných {fmt_num(pp['splits_count_main'])}{
      f" z {fmt_num(pp['cohesion_main'][1])}" if pp['cohesion_main'][1] else ""}</div></div>
</div>
<h2>Poslanci</h2>
<div class="card"><ul class="plain">{members}</ul></div>
<p class="source">Příslušnost ke straně k datu hlasování. U stran s více poslanci je jednotnost přirozeně nižší: víc lidí, víc možností
  se rozejít. Zdroj: <a href="{HTV}">HowTheyVote.eu</a> (ODbL) a
  <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0), <a href="o-projektu.html#metodika">metodika</a>.</p>"""
    title = f"{name} – EP Watch CZ"
    # Jedna adresa strany: <base href="../">, party.js obsah nahradí interaktivní verzí (jako u profilu poslance).
    path = f"s/{pp['id']}.html"
    return path, page(title, body, root="", base="../", path=path, current="parties", description=desc,
                      meta=og_meta(title, desc, path, base_url, None, "EP Watch CZ – fakta a data o českých europoslancích"),
                      main_attrs=f'data-party="{pp["id"]}"',
                      scripts='<script src="app.js"></script>\n<script src="party.js"></script>\n')


# --- hlasování -----------------------------------------------------------------------

def adopted_text_url(ref: str | None) -> str | None:
    import re
    m = re.fullmatch(r"P(\d+)_TA\((\d{4})\)(\d{4})", ref or "")
    return f"https://data.europarl.europa.eu/distribution/doc/TA-{m[1]}-{m[2]}-{m[3]}_cs.pdf" if m else None


def vote_page(v: dict, meps_by_id: dict, groups: list[dict], base_url: str | None, has_card: bool = False,
              roles: list[dict] | None = None) -> tuple[str, str]:
    kind, _ = kind_of(v)
    title_txt = vote_title(v)
    desc_cs = v.get("description_cs") if "description_cs" in v else translate(v.get("description"))
    c = v["counts"]
    total = [c["for"], c["against"], c["abstention"], c["did_not_vote"]]
    cz = active_positions(v, meps_by_id)
    cz_counts = [sum(p["position"] == k for p in cz) for k in POSITIONS]
    result = RESULT_LABEL.get(v.get("result"), "neuveden")
    src = v.get("source_url") or f"{HTV}/votes/{v['id']}"
    adopted = adopted_text_url(v.get("texts_adopted_reference"))
    desc = f"Hlasování Evropského parlamentu {fmt_date(v['date'])}: {title_txt}. Výsledek: {result} " \
           f"({c['for']} pro, {c['against']} proti). Čeští poslanci: {cz_counts[0]} pro, {cz_counts[1]} proti, " \
           f"{cz_counts[2]} se zdrželo, {cz_counts[3]} nehlasovalo."
    lists, nobody = [], []
    for k in POSITIONS:
        names = sorted((meps_by_id[p["member_id"]] for p in cz if p["position"] == k), key=lambda m: m.get("sort_label") or m["name"])
        if not names:  # prázdné skupiny se sbalí do jedné věty pod seznamy (jako na interaktivní stránce)
            nobody.append(POSITION_LABEL[k])
            continue
        items = "".join(f'<li><a href="{ROOT}p/{m["id"]}.html">{esc(display_name(m))}</a></li>' for m in names)
        lists.append(f'<div class="card"><h3 class="pos pos-{k}">{POSITION_LABEL[k]} ({len(names)})</h3><ul class="plain">{items}</ul></div>')
    cz_groups = {p["group_code"] for p in cz}
    trace = ""
    if roles:
        link = lambda r: f'<a href="{ROOT}p/{r["mep_id"]}.html">{esc(display_name(meps_by_id[r["mep_id"]]))}</a>' if r["mep_id"] in meps_by_id else ""
        lead = ", ".join(x for x in (link(r) for r in roles if r["role"] != "shadow") if x)
        shadow = ", ".join(x for x in (link(r) for r in roles if r["role"] == "shadow") if x)
        reports = ", ".join(sorted({r["report"] for r in roles if r.get("report")}))
        trace = ('<p class="small" id="ceska-stopa"><strong>Česká stopa:</strong> '
                 + (f"zpravodaj/ka {lead}" if lead else "") + (" · " if lead and shadow else "")
                 + (f"stínoví zpravodajové z ČR: {shadow}" if shadow else "")
                 + f' <span class="muted">(zpráva {esc(reports)}; zdroj EP Open Data)</span></p>')
    group_rows = "".join(
        f'<tr{" class=cz-row" if code in cz_groups else ""}><td>{esc(group_label(code, groups))}</td>{"".join(f"<td class=num>{n}</td>" for n in row)}'
        f'<td>{esc(group_majority_label(row) or "bez jasné většiny")}</td><td>{split_bar(row)}</td></tr>'
        for code, row in sorted(v["group_counts"].items(), key=lambda x: -sum(x[1])))
    party_items = "".join(f'<li><strong>{esc(label)}</strong> {esc(text)}</li>' for label, text in party_votes_text(cz))
    links = [f'<a href="{esc(src)}">Originál na HowTheyVote.eu</a>',
             f'<a href="{ROOT}vote.html?id={v["id"]}&amp;m={v["date"][:7]}">Interaktivní detail</a>']
    if adopted:
        links.append(f'<a href="{esc(adopted)}">Přijatý text (PDF, EP)</a>')
    proc = (v.get("procedure") or {}).get("reference")
    if proc:
        links.append(f'<a href="https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference={esc(proc)}">'
                     f'Legislativní observatoř ({esc(proc)})</a>')
    cite = cite_button(f"Evropský parlament {fmt_date(v['date'])}, {title_txt} ({KIND_LABELS.get(kind, kind)}): {result}, "
                       f"{c['for']} pro, {c['against']} proti, {c['abstention']} se zdrželo. Čeští poslanci v mandátu: "
                       f"{cz_counts[0]} pro, {cz_counts[1]} proti, {cz_counts[2]} se zdrželo, {cz_counts[3]} nehlasovalo. "
                       f"Zdroj: HowTheyVote.eu ({src})")
    body = f"""<p class="small"><a href="{ROOT}votes.html?m={v['date'][:7]}">← Hlasování v měsíci</a></p>
<p class="muted" style="margin-bottom:.3rem">{fmt_date(v['date'])} · <span class="tag kind-{kind}">{esc(KIND_LABELS.get(kind, kind))}</span></p>
<h1>{esc(title_txt)}</h1>
{f'<p class="muted">{esc(desc_cs or v.get("description"))}{" · " + esc(v["reference"]) if v.get("reference") else ""}</p>' if (desc_cs or v.get("description")) else ""}
<p class="small">{" · ".join(links)}</p>
<div class="metrics">
  <div class="card metric"><div class="label">Výsledek</div><div class="value result-{v.get('result') or ''}">{result}</div>
    <div class="detail">celý parlament · <a href="{esc(src)}">zdroj</a></div>{cite}</div>
  <div class="card metric"><div class="label">Celý parlament</div>{split_bar(total)}
    <div class="detail"><span class="pos pos-FOR">pro {c['for']}</span> · <span class="pos pos-AGAINST">proti {c['against']}</span> · zdrželo se {c['abstention']} · nehlasovalo {c['did_not_vote']}</div></div>
  <div class="card metric"><div class="label">Čeští poslanci</div>{split_bar(cz_counts)}
    <div class="detail"><span class="pos pos-FOR">pro {cz_counts[0]}</span> · <span class="pos pos-AGAINST">proti {cz_counts[1]}</span> · zdrželo se {cz_counts[2]} · nehlasovalo {cz_counts[3]}</div></div>
</div>
{trace}<h2>Jak hlasovali Češi</h2>
<div class="positions-grid">{"".join(lists)}</div>
<h3>Podle českých stran</h3><ul class="party-votes plain">{party_items}</ul>
{f'<p class="small muted">Nikdo z Čechů: {", ".join(nobody)}.</p>' if nobody else ""}
<p class="source">Jen poslanci v mandátu podle EP; frakce a strana k datu hlasování. Zdroj: <a href="{esc(src)}">HowTheyVote.eu</a> (ODbL).</p>
<h2>Jak hlasovaly frakce</h2>
<div class="table-wrap"><table><thead><tr><th>Frakce</th><th class="num">Pro</th><th class="num">Proti</th><th class="num">Zdrž.</th><th class="num">Nehl.</th><th>Většina frakce</th><th>Rozložení</th></tr></thead>
<tbody>{group_rows}</tbody></table></div>
<p class="small muted">Zvýrazněné řádky jsou frakce, ve kterých sedí čeští poslanci. Většina frakce = jednoznačně nejvíc hlasů pro, proti nebo zdržet se.</p>
<p class="source">Počty spočítané z hlasování jednotlivých poslanců. Zdroj: <a href="{esc(src)}">HowTheyVote.eu</a>.</p>"""
    title = f"{title_txt} ({fmt_date(v['date'])}) – EP Watch CZ"
    return f"v/{v['id']}.html", page(title, body, root=ROOT, current="votes", description=desc,
                                     meta=og_meta(title, desc, f"v/{v['id']}.html", base_url,
                                                  f"og/v/{v['id']}.png" if has_card else None, desc, card=True),
                                     scripts=f'<script src="{ROOT}app.js"></script>\n')


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
    out = {}
    for m in overview["meps"]:
        prof = read(data_dir / "meps" / f"{m['id']}.json")
        require(prof, ["mep", "total", "recent_main_votes"], f"meps/{m['id']}.json")
        apply_name_overrides([prof["mep"]], data_dir / "manual" / "overrides.json")
        path, html = mep_page(prof, groups, parties, base_url)
        out[path] = html
    idx_path = data_dir / "parties" / "index.json"
    if idx_path.exists():
        for p in read(idx_path)["parties"]:
            path, html = party_page(read(data_dir / "parties" / f"{p['id']}.json"), base_url)
            out[path] = html
    _, votes = load_votes(data_dir / "votes")
    vr_path = data_dir / "vote_roles.json"
    vote_roles = read(vr_path)["votes"] if vr_path.exists() else {}
    with_card = card_vote_ids(votes)  # závěrečná hlasování za 12 měsíců mají kartu (build_cards.py), starší obecný obrázek
    for v in votes:
        if is_final(v):
            path, html = vote_page(v, meps_by_id, groups, base_url, v["id"] in with_card, vote_roles.get(str(v["id"])))
            out[path] = html
    from hub import hub_page  # až tady: hub.py importuje pomocné funkce z tohoto modulu
    if (data_dir / "key_votes.json").exists() and (data_dir / "session.json").exists():
        path, html = hub_page(data_dir, base_url)
        out[path] = html
    if base_url:
        out.update(sitemap(base_url, sorted(out)))
    return out


STATIC_PAGES = ["index.html", "poslanci.html", "votes.html", "party.html", "rozkol.html", "rozhodujici.html", "shoda.html", "prace.html", "o-projektu.html"]


def sitemap(base_url: str, paths: list[str]) -> dict[str, str]:
    base = base_url.rstrip("/") + "/"
    urls = "".join(f"  <url><loc>{esc(base + p)}</loc></url>\n" for p in STATIC_PAGES + paths)
    return {
        "sitemap.xml": f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n',
        "robots.txt": f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n",
    }


# Názvy definic metrik na stránce O projektu (klíč → název). Klíč bez názvu je chyba, ne holý klíč na webu.
DEFINITION_NAMES = {
    "attendance": "Účast na hlasování", "attendance_main": "Účast na hlasování – závěrečná", "vote_kind": "Typ hlasování",
    "group_loyalty": "Hlasuje s frakcí", "cz_agreement": "Shoda s ostatními Čechy", "pairwise": "S kým hlasuje stejně",
    "outcome_agreement": "Soulad s výsledkem", "group_outcome_agreement": "Soulad s výsledkem – průměr frakce",
    "close_votes": "Těsná hlasování", "decisive_votes": "Kde rozhodly české hlasy",
    "against_group": "Kde hlasoval jinak než frakce", "cz_split": "Kde se Češi rozdělili", "cz_unity": "Češi jednotně",
    "party_cohesion": "Jednotnost strany", "topics": "Témata", "own_work": "Práce na textech",
    "work_profile": "Práce na textech – třetiny v delegaci", "delegations": "Srovnání s delegacemi podobné velikosti", "speeches": "Projevy v plénu", "presence": "Prezence na zasedání (podle EP)",
}


def definitions_html(definitions: dict[str, str]) -> str:
    """Seznam definic metrik jako statické HTML (pro „Jak počítáme“; funguje i bez JavaScriptu a pro vyhledávače)."""
    missing = [k for k in definitions if k not in DEFINITION_NAMES]
    if missing:
        raise FormatError(f"definice bez názvu v DEFINITION_NAMES: {', '.join(missing)}")
    return "".join(f"<li><strong>{esc(DEFINITION_NAMES[k])}</strong>: {esc(text)}</li>\n" for k, text in definitions.items())


_DEFS_RE = re.compile(r'(<ul class="plain" id="definitions">).*?(</ul>)', re.S)


def sync_definitions(public: Path, data_dir: Path) -> bool:
    """Přepíše seznam definic v public/o-projektu.html podle data/overview.json. Vrací True, když se soubor změnil."""
    page = public / "o-projektu.html"
    overview = data_dir / "overview.json"
    if not page.exists() or not overview.exists():
        return False
    defs = json.loads(overview.read_text(encoding="utf-8")).get("definitions")
    if not defs:
        raise FormatError("overview.json nemá definitions")
    old = page.read_text(encoding="utf-8")
    if len(_DEFS_RE.findall(old)) != 1:
        raise FormatError("o-projektu.html nemá právě jeden seznam <ul id=\"definitions\">")
    new = _DEFS_RE.sub(lambda m: f"{m[1]}\n{definitions_html(defs)}{m[2]}", old)
    if new != old:
        page.write_text(new, encoding="utf-8")
    return new != old


def write(pages: dict[str, str], public: Path) -> dict[str, int]:
    """Zapíše stránky; soubory v p/, s/, v/, které už nevznikly, smaže. Nezměněné nepřepisuje."""
    written = removed = 0
    for sub in ("p", "s", "v"):
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
    except FormatError as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    print(f"statické stránky: {res}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
