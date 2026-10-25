"""Stavební bloky statických stránek (audit A1: jeden zdroj vykreslování).

Stránky p/, s/ a v/ vykresluje jen Python; JS na nich jen doplňuje interakce („ostrůvky“: graf, přepínače, sdílení).
Značky a třídy jsou stejné jako dřív v public/lib/ui.js, aby platilo CSS i chování app.js (ⓘ, počítadla, sbalení tabulek).

Každá stránka si vytvoří Ui() kvůli číslování ⓘ (id popoverů musí být na stránce jedinečná a stabilní mezi buildy).
"""

from __future__ import annotations

import math
import re
from decimal import ROUND_HALF_UP, Decimal
from html import escape

NBSP = " "
HTV_SOURCE = "https://howtheyvote.eu"
EP_SOURCE = "https://data.europarl.europa.eu"

POSITION_LABEL = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdržel/a se", "DID_NOT_VOTE": "nehlasoval/a"}
RESULT_LABEL = {"ADOPTED": "přijato", "REJECTED": "zamítnuto", "LAPSED": "propadlo", "WITHDRAWN": "staženo"}
RESULT_NOTE = {
    "LAPSED": "Návrh propadl: bylo přijato jiné znění, které ho vylučuje, takže se o něm už nehlasovalo jako o samostatném.",
    "WITHDRAWN": "Návrh byl stažen.",
    None: "Zdroj (HowTheyVote.eu) u tohoto hlasování výsledek neuvádí. Výsledek ověř v originálu (odkaz „Originál na HowTheyVote.eu“).",
}
KIND_LABEL = {
    "final": "závěrečné hlasování",
    "provisional_agreement": "prozatímní dohoda s Radou",
    "objection": "námitka proti aktu Komise",
    "rejection": "návrh na zamítnutí",
    "mandate": "mandát k jednání s Radou",
    "urgency": "naléhavý postup",
    "amendment": "pozměňovací návrh",
    "split_part": "dílčí hlasování",
    "procedural": "procedurální hlasování",
    "other": "ostatní",
}
KIND_NOTE = {
    "rejection": "Hlasovalo se o návrhu na zamítnutí: hlas PRO = text zamítnout, hlas PROTI = text ponechat.",
    "objection": "Hlasovalo se o usnesení, kterým Parlament vznáší námitku proti aktu Komise (čl. 114 nebo 115 jednacího "
    "řádu): hlas PRO = vznést námitku (nesouhlas s aktem), hlas PROTI = námitku nevznášet.",
}
# Co znamenal hlas PRO a PROTI podle typu hlasování (audit UX P1, blok „Co znamenal hlas“ na detailu hlasování).
# Pevná pravidla jednacího řádu EP, žádná AI; stejné texty jako VOTE_MEANING v public/lib/format.js (hlídá test).
VOTE_MEANING = {
    "final": (
        "Hlasovalo se o celém textu (postoji k návrhu zákona, usnesení nebo rozhodnutí).",
        "text přijmout",
        "text nepřijmout",
    ),
    "provisional_agreement": (
        "Hlasovalo se o dohodě, kterou Parlament vyjednal s Radou; schválením je zákon v praxi přijatý v dohodnutém znění.",
        "dohodu schválit",
        "dohodu neschválit",
    ),
    "objection": (
        "Hlasovalo se o usnesení, kterým Parlament vznáší námitku proti aktu Komise (čl. 114 nebo 115 jednacího řádu).",
        "vznést námitku (nesouhlas s aktem)",
        "námitku nevznášet",
    ),
    "rejection": (
        "Hlasovalo se o návrhu na zamítnutí celého textu.",
        "text zamítnout",
        "text ponechat",
    ),
    "mandate": (
        "Hlasovalo se o tom, zda výbor může na základě své zprávy zahájit jednání s Radou.",
        "zahájit jednání s Radou",
        "nezahájit jednání; o zprávě pak hlasuje plénum, kde ji lze měnit pozměňovacími návrhy",
    ),
    "urgency": (
        "Hlasovalo se o žádosti projednat návrh naléhavým (zrychleným) postupem; o obsahu se tím nerozhoduje.",
        "naléhavý postup",
        "běžný postup",
    ),
    "amendment": (
        "Hlasovalo se o pozměňovacím návrhu, tedy o změně části textu; o celém textu se hlasuje zvlášť.",
        "změnu do textu vložit",
        "ponechat původní znění",
    ),
    "split_part": (
        "Hlasovalo se odděleně jen o části textu (odstavci, bodu, článku); o celém textu se hlasuje zvlášť.",
        "tuto část v textu ponechat",
        "tuto část z textu vypustit",
    ),
    "procedural": (
        "Procedurální žádost (např. odložení hlasování nebo vrácení věci výboru); o obsahu textu se nerozhoduje.",
        "žádosti vyhovět",
        "žádost zamítnout",
    ),
}
SHORT_MANDATE_NOTE = "Mandát kratší než 60 dní: procenta jsou z velmi malého počtu hlasování."
INDEPENDENT_NOTE = "EP Open Data uvádí poslance jako nezávislého (Independent, zkratka Ind.), tedy bez národní strany."
NO_PARTY_NOTE = "Evropský parlament u tohoto poslance pro 10. období českou stranu neuvádí."
ROLE_LABEL = {
    "MEMBER": "člen/ka",
    "MEMBER_SUBSTITUTE": "náhradník/ice",
    "CHAIR": "předseda/kyně",
    "CHAIR_VICE": "místopředseda/kyně",
    "MEMBER_BUREAU": "člen/ka předsednictva",
}
COMMITTEE_TYPE = {
    "STANDING": "stálý výbor",
    "SUB": "podvýbor",
    "TEMPORARY": "dočasný výbor",
    "SPECIAL": "zvláštní výbor",
    "INQUIRY": "vyšetřovací výbor",
}
CZ_GROUP_LABEL = {"NI": "nezařazení"}
MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"]

CITE_ICON = (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.2 6C4.9 7.2 3.5 9.4 3.5 '
    "12.3V18h6.2v-6.1H6.6c.1-1.9 1-3.3 2.6-4.2L7.2 6zm9.8 0c-2.3 1.2-3.7 3.4-3.7 6.3V18h6.2v-6.1h-3.1c.1-1.9 1-3.3 2.6-4.2L17 "
    '6z"/></svg>'
)
SHARE_SMALL_ICON = (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>'
)
BENCH_MIN = 0.6


# --- formátování (stejné výstupy jako public/lib/format.js, hlídá tests/test_web_ui.py) ---------------------


def esc(x) -> str:
    return escape(str(x if x is not None else ""))


def fmt_num(n) -> str:
    return f"{int(n):,}".replace(",", NBSP)


def fixed(x: float, digits: int) -> str:
    """Číslo na pevný počet desetinných míst jako toFixed() v prohlížeči: přesná hodnota double, polovina nahoru."""
    return str(Decimal(x).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))


def _intl1(x: float) -> str:
    """Jedno desetinné místo jako Intl.NumberFormat: zaokrouhluje nejkratší zápis čísla (92.55 → 92,6), polovina nahoru."""
    return str(Decimal(repr(float(x))).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def js_round(x: float) -> int:
    """Math.round(): polovina nahoru (Python round() zaokrouhluje k sudé)."""
    return math.floor(x + 0.5)


def fmt_pct(value) -> str:
    if isinstance(value, list):
        value = pct(value)
    return "–" if value is None else _intl1(value * 100).replace(".", ",") + f"{NBSP}%"


def pct(pair) -> float | None:
    return pair[0] / pair[1] if pair and pair[1] else None


def fmt_date(iso: str | None) -> str:
    if not iso:
        return ""
    y, m, d = iso[:10].split("-")
    return f"{int(d)}.{NBSP}{int(m)}.{NBSP}{y}"  # pevné mezery: datum se nezalomí (O11); dvojče fmtDate ve format.js


def fmt_month(ym: str) -> str:
    y, m = ym.split("-")
    return f"{MONTHS[int(m) - 1]} {y}"


def by_gender(mep: dict | None, male: str, female: str) -> str:
    g = (mep or {}).get("gender")
    if g == "FEMALE":
        return female
    if g == "MALE":
        return male
    return f"{male}/{female[len(male) :]}" if female.startswith(male) else f"{male} / {female}"


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


def current_of(items: list[dict] | None, at: str) -> dict | None:
    if not items:
        return None
    return next((x for x in items if x["start"] <= at and (not x.get("end") or at <= x["end"])), items[-1])


def is_active(mep: dict, today: str) -> bool:
    return any(m["start"] <= today and (not m.get("end") or today <= m["end"]) for m in mep["mandates"])


def period_text(x: dict) -> str:
    return f"{fmt_date(x['start'])} – {fmt_date(x['end']) if x.get('end') else 'dosud'}"


def mandate_text(mep: dict) -> str:
    return ", ".join(period_text(m) for m in mep["mandates"])


def first_sentence(text: str | None) -> str:
    t = str(text or "").strip()
    colon = t.find(": ")
    if 0 < colon < 60:
        t = t[colon + 2 :]
    m = re.search(r"\.(\s|$)", t)
    t = t[: m.start() + 1] if m and m.start() > 0 else t
    return t[:1].upper() + t[1:]


def group_color(g: dict | None) -> str:
    return (g and (g.get("color") or g.get("chart_color"))) or "var(--muted)"


def logo_height(aspect, size: float) -> float:
    if not aspect or aspect <= 1:
        return size
    return math.floor(size * max(0.42, aspect**-0.4) * 10 + 0.5) / 10


def num(x: float) -> str:
    """Číslo do atributu jako String(x) v JS (12.0 → 12, jinak nejkratší přesný zápis)."""
    return str(int(x)) if float(x).is_integer() else repr(float(x))


def vote_title(v: dict) -> str:
    return v.get("title_cs") or v.get("title") or (v.get("procedure") or {}).get("title") or v.get("reference") or f"Hlasování {v['id']}"


def vote_subtitle(v: dict) -> str:
    parts = []
    if v.get("reference"):
        parts.append(v["reference"])
    desc = v.get("description_cs") or v.get("description") or ""
    if desc:
        parts.append(desc)
    elif re.fullmatch(r"\d+", str(v.get("amendment_number") or "")):
        parts.append(f"PN {v['amendment_number']}")
    return " · ".join(parts)


def result_text(v: dict) -> str:
    base = RESULT_LABEL.get(v.get("result"), "neuveden")
    if v.get("inverted") or v.get("vote_kind") == "rejection":
        if v.get("result") == "ADOPTED":
            return f"{base} = text zamítnut"
        if v.get("result") == "REJECTED":
            return f"{base} = text nezamítnut"
    if v.get("vote_kind") == "objection":
        if v.get("result") == "ADOPTED":
            return f"{base} = Parlament vznesl námitku"
        if v.get("result") == "REJECTED":
            return f"{base} = námitka neprošla"
    return base


def page_path(path: str) -> str:
    """Veřejná adresa stránky bez koncovky .html (vercel.json cleanUrls): p/1.html → p/1, votes.html?c=x → votes?c=x,
    index.html → "" (kořen webu). Kotvy a parametry zůstávají. Stejná funkce je pagePath v public/lib/format.js."""
    return re.sub(r"\.html(?=[?#]|$)", "", re.sub(r"(^|/)index\.html(?=[?#]|$)", r"\1", path))


def page_url(base_url: str, path: str) -> str:
    """Absolutní kanonická adresa stránky: page_url("https://epwatch.cz", "p/1.html") → https://epwatch.cz/p/1."""
    return base_url.rstrip("/") + "/" + page_path(path)


def vote_url(v: dict) -> str:
    """Závěrečná hlasování mají statickou stránku v/{id}, ostatní interaktivní detail vote."""
    return f"v/{v['id']}" if v.get("is_final") else f"vote?id={v['id']}&amp;m={v.get('month')}"


def mep_url(mep_id) -> str:
    return f"p/{mep_id}"


def party_url(party_id) -> str:
    return f"s/{party_id}"


def photo_url(mep: dict, thumb: bool = False) -> str:
    if not mep.get("photo_url"):
        return ""
    return f"assets/photos/thumbs/{mep['id']}.webp" if thumb else f"assets/photos/{mep['id']}.jpg"


# --- komponenty ------------------------------------------------------------------------------------------


def logo_tile(entity: dict | None, size: int = 28) -> str:
    if not entity or not entity.get("logo"):
        return ""
    name = entity.get("name_cs") or entity.get("name") or entity.get("label") or entity.get("short_label") or ""
    h = logo_height(entity.get("logo_aspect"), size)
    w = f' width="{js_round(h * entity["logo_aspect"])}"' if entity.get("logo_aspect") else ""
    return (
        f'<span class="logo-tile" style="height:{size}px"><img src="{esc(entity["logo"])}" alt="{esc(name)}" '
        f'style="height:{num(h)}px"{w} height="{js_round(h)}" loading="lazy"></span>'
    )


def entity_cell(entity: dict | None, name: str, href: str = "", sub: str = "", size: int = 28, slot: str = "") -> str:
    logo = logo_tile(entity, size) or f'<span class="dot" style="background:{group_color(entity)}"></span>'
    title = f'<a href="{esc(href)}" class="vote-title">{esc(name)}</a>' if href else f"<span>{esc(name)}</span>"
    sub_html = f'<div class="small muted">{sub}</div>' if sub else ""
    return (
        f'<div class="entity-cell"><span class="logo-slot{" " + slot if slot else ""}">{logo}</span>'
        f'<div class="entity-text">{title}{sub_html}</div></div>'
    )


def count_pct(value: float | None) -> str:
    if value is None:
        return "–"
    return f'<span data-count="{fixed(value * 100, 1)}" data-decimals="1" data-suffix="&nbsp;%">{fmt_pct(value)}</span>'


def pct_cell(pair, title: str = "") -> str:
    detail = f"{fmt_num(pair[0])} z {fmt_num(pair[1])}" if pair and pair[1] else "nepočítá se"
    return f'<span class="pct" title="{esc(title)}">{fmt_pct(pct(pair))}<small>{detail}</small></span>'


def find_group(groups: list[dict], code: str | None = None, ep_code: str | None = None) -> dict | None:
    return next((x for x in groups if code and x["code"] == code), None) or next(
        (x for x in groups if ep_code and x.get("ep_code") == ep_code), None
    )


def find_party(parties: list[dict], party_id) -> dict | None:
    return next((x for x in parties if str(x["id"]) == str(party_id)), None)


def group_badge(code: str | None, groups: list[dict], ep_code: str | None = None) -> str:
    if not code and not ep_code:
        return '<span class="badge outline">bez frakce</span>'
    g = find_group(groups, code, ep_code)
    label = (CZ_GROUP_LABEL.get(g["code"]) or g["short_label"]) if g else (code or ep_code)
    title = (g.get("name_cs") or g.get("label")) if g else label
    return f'<span class="badge" style="--badge-dot:{group_color(g)}" title="{esc(title)}">{esc(label)}</span>'


def party_badge(party_id, label: str, parties: list[dict], mep: dict | None = None) -> str:
    if not party_id:
        return '<span class="badge outline">bez strany</span>'
    p = find_party(parties, party_id)
    if p and p.get("independent"):
        text = by_gender(mep, "nezávislý", "nezávislá") if mep else "nezávislý/á"
        return f'<span class="badge outline" title="{esc(INDEPENDENT_NOTE)}">{text}</span>'
    text = p["short_label"] if p else label
    return f'<span class="badge" style="--badge-dot:{group_color(p)}" title="{esc(p["name"] if p else text)}">{esc(text)}</span>'


def group_url(code: str) -> str:
    return f"party?c={code}"


def group_link(code: str | None, groups: list[dict], ep_code: str | None = None) -> str:
    """Štítek frakce jako odkaz na stránku frakce (party?c=…); nezařazení stránku nemají, zůstane jen štítek."""
    g = find_group(groups, code, ep_code)
    badge = group_badge(code, groups, ep_code)
    return f'<a href="{group_url(g["code"])}" class="badge-link">{badge}</a>' if g and g["code"] != "NI" else badge


def party_link(party_id, label: str, parties: list[dict], mep: dict | None = None) -> str:
    p = find_party(parties, party_id)
    badge = party_badge(party_id, label, parties, mep)
    return f'<a href="{party_url(p["id"])}" class="badge-link">{badge}</a>' if p and not p.get("independent") else badge


def split_bar(counts: list[int]) -> str:
    total = sum(counts) or 1
    keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"]
    title = ", ".join(f"{POSITION_LABEL[k]}: {counts[i]}" for i, k in enumerate(keys))
    spans = "".join(f'<span class="s-{k}" style="width:{num(counts[i] / total * 100)}%"></span>' for i, k in enumerate(keys))
    return f'<div class="split" title="{esc(title)}" role="img" aria-label="{esc(title)}">{spans}</div>'


def empty_state(title: str, hint: str = "", links: list[tuple[str, str]] = ()) -> str:
    acts = (
        '<div class="empty-acts">' + "".join(f'<a class="more-btn" href="{esc(h)}">{esc(lbl)}</a>' for h, lbl in links) + "</div>"
        if links
        else ""
    )
    return f'<div class="empty-state"><p><strong>{esc(title)}</strong>{" " + esc(hint) if hint else ""}</p>{acts}</div>'


def kind_tag(v: dict) -> str:
    k = v.get("vote_kind")
    if k:
        return f'<span class="tag kind-{esc(k)}" title="{esc(KIND_NOTE.get(k, ""))}">{esc(KIND_LABEL.get(k, k))}</span>'
    return '<span class="tag">hlavní</span>' if v.get("is_main") else ""


def result_html(v: dict, ep: bool = False) -> str:
    """Dvojče resultHtml v public/lib/ui.js; ep = popisek „EP:“ v kartách vedle hlasů Čechů (O10)."""
    icon = {"ADOPTED": "✓", "REJECTED": "✕"}.get(v.get("result"), "–")
    return (
        f'<span class="res-badge res-{v.get("result") or "NONE"}"><i class="res-ic" aria-hidden="true">{icon}</i>'
        f'{'<span class="who">EP:</span> ' if ep else ""}<span class="res-txt">{esc(result_text(v))}</span></span>'
    )


def vote_row(v: dict, extra: str = "") -> str:
    return (
        f'<tr><td class="num date">{fmt_date(v["date"])}</td>'
        f'<td class="title"><a class="vote-title" href="{vote_url(v)}">{esc(vote_title(v))}</a>'
        f'<div class="small muted">{kind_tag(v)}{esc(vote_subtitle(v))}</div></td>{extra}'
        f'<td class="result result-{v.get("result") or ""}" title="{esc(RESULT_NOTE.get(v.get("result"), ""))}">{result_html(v, ep=True)}</td></tr>'
    )


def bench_row(label: str, pair, median: float | None, ref_label: str, na_text: str = "nepočítá se") -> str:
    v = pct(pair)
    if v is None:
        return (
            f'<div class="bench"><div class="bench-top"><span class="bench-label">{label}</span><b>–</b></div>'
            f'<p class="bench-note">{esc(na_text)}</p></div>'
        )

    def pos(x: float) -> str:
        return f"{fixed(max(0.0, min(1.0, (x - BENCH_MIN) / (1 - BENCH_MIN))) * 100, 2)}%"

    has_med = median is not None
    note = ""
    if has_med:
        d = math.floor((v - median) * 1000 + 0.5) / 10
        a = _intl1(abs(d)).replace(".", ",")
        note = (
            f"stejně jako {ref_label} ({fmt_pct(median)})"
            if d == 0
            else f"o {a}{NBSP}p.{NBSP}b. {'víc' if d > 0 else 'méně'} než {ref_label} ({fmt_pct(median)})"
        )
    below = f" Hodnota je pod rozsahem osy ({fmt_pct(v)})." if v < BENCH_MIN else ""
    aria = f"{label} {fmt_pct(v)}{f', {ref_label} {fmt_pct(median)}' if has_med else ''}"
    med = f'<i class="bench-med" style="left:{pos(median)}"></i>' if has_med else ""
    note_html = f'<p class="bench-note">{esc(note + below)}</p>' if note + below else ""
    return (
        f'<div class="bench" role="group" aria-label="{esc(aria)}">'
        f'<div class="bench-top"><span class="bench-label">{label}</span><b>{fmt_pct(v)}</b></div>'
        f'<div class="bench-strip" aria-hidden="true"><i class="bench-track"></i><i class="bench-dot" style="left:{pos(v)}"></i>{med}</div>'
        f"{note_html}</div>"
    )


class Ui:
    """Komponenty s ⓘ: id popoverů číslované v rámci stránky (stabilní mezi buildy)."""

    def __init__(self, prefix: str):
        self.prefix, self.n = prefix, 0

    def info_button(self, html: str, label: str = "Jak to číst, definice a zdroj") -> str:
        self.n += 1
        pid = f"info-{self.prefix}-{self.n}"
        return (
            f'<span class="info-wrap"><button type="button" class="info-btn" popovertarget="{pid}" aria-label="{esc(label)}" '
            f'aria-expanded="false">ⓘ</button><div popover id="{pid}" class="info-pop" role="note">{html}</div></span>'
        )

    def note_line(self, short: str, long: str = "", cls: str = "small muted") -> str:
        return f'<div class="{cls}">{short}{self.info_button(f"<p>{long}</p>") if long else ""}</div>'

    def metric_actions(self, html: str, share_key: str | None, cite: str | None) -> str:
        share = (
            f'<button type="button" class="pop-act" data-share="{esc(share_key)}" aria-haspopup="dialog">{SHARE_SMALL_ICON}<span>Sdílet číslo</span></button>'
            if share_key
            else ""
        )
        cite_btn = f'<button type="button" class="pop-act" data-cite="{esc(cite)}">{CITE_ICON}<span>Citovat</span></button>' if cite else ""
        out = self.info_button(f'{html}<div class="pop-acts">{share}{cite_btn}</div>', "Definice, sdílení a citace")
        return out.replace('class="info-wrap"', 'class="info-wrap corner"', 1)

    def source_line(self, release: str | None, votes_to: str | None = None) -> str:
        """Dvojče sourceLine v ui.js: jednotně „hlasování do … · export …“ (O11)."""
        parts = ([f"hlasování do {fmt_date(votes_to)}"] if votes_to else []) + (
            [f"export {fmt_date(release[:10])}"] if release and re.match(r"\d{4}-\d{2}-\d{2}", release) else []
        )
        date = "".join(f" · {x}" for x in parts)
        return f'Zdroj: <a href="{HTV_SOURCE}">HowTheyVote.eu</a> · <a href="{EP_SOURCE}">EP Open Data</a>{date}' + self.info_button(
            f'<p><a href="{HTV_SOURCE}">HowTheyVote.eu</a> (export {esc(release or "")}, licence ODbL) a <a href="{EP_SOURCE}">EP Open Data</a> (CC BY 4.0).\n'
            f'      Čísla počítá skript <a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/compute_stats.py">compute_stats.py</a>, ne AI.\n'
            f'      <a href="o-projektu#metodika">Jak počítáme</a>.</p>',
            "Zdroj a metodika",
        )


INTENDED = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdržet se"}


def correction_tag(mep: dict, intended: str | None) -> str:
    """Štítek opravy hlasu (V9, EP Open Data had_voter_intended_*): co poslanec podle oznámení zamýšlel. Nemění výsledek."""
    if intended not in INTENDED:
        return ""
    return (
        f'<span class="fix-tag" title="Poslanec po hlasování oznámil, že chtěl hlasovat jinak. Oficiální výsledek i statistiky '
        f'počítají zaznamenaný hlas.">oprava: {by_gender(mep, "chtěl", "chtěla")} hlasovat {INTENDED[intended]} · nemění výsledek</span>'
    )


def cite_button(cite: str | None) -> str:
    """Viditelné tlačítko „Citovat“ (V1): zkopíruje větu + adresu + datum exportu (citeText v lib/data.js, app.js)."""
    if not cite:
        return ""
    return f'<button type="button" class="cite-chip" data-cite="{esc(cite)}">{CITE_ICON}<span>Citovat</span></button>'


def vote_meaning_html(kind: str | None, root: str = "") -> str:
    """Blok „Co znamenal hlas“: o čem se hlasovalo a co znamenal hlas PRO a PROTI (VOTE_MEANING); u typu „ostatní“ nic."""
    if kind not in VOTE_MEANING:
        return ""
    about, yes, no = VOTE_MEANING[kind]
    return (
        '<section class="card vote-meaning" aria-labelledby="vm-h"><h2 id="vm-h">Co znamenal hlas</h2>'
        f'<p>{esc(about)}</p><ul class="plain vm-list">'
        f'<li><span class="pos pos-FOR">PRO</span> = {esc(yes)}</li><li><span class="pos pos-AGAINST">PROTI</span> = {esc(no)}</li></ul>'
        f'<p class="small muted">Zdržet se = ani pro, ani proti. Vysvětlení plyne z typu hlasování, který určuje pevná tabulka pravidel '
        f'(<a href="{root}o-projektu#metodika">jak typ určujeme</a>).</p></section>'
    )
