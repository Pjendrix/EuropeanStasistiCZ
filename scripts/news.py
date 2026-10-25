"""Novinky na /aktualne (V3): chronologický seznam událostí, který skládá kód z dat, žádná redakce ani AI.

Položky (každá má datum, druh, text a odkaz na stránku webu nebo zdroj):
  - zasedání: počty hlasování posledního zasedání (data/session.json, HowTheyVote),
  - změna frakce: poslanec vstoupil do jiné frakce během 10. období (data/meps.json → groups, EP Open Data),
  - nová zpráva / stínová zpráva: český poslanec zpravodajem nebo stínovým zpravodajem (data/own_work.json),
  - předběžné výsledky: den zasedání, který ještě nepokryl export HowTheyVote (data/preliminary/, štítek „předběžné“),
  - na programu: příští zasedání z návrhu programu (data/agenda.json).
Čísla jsou jen ta, která už spočítal jiný skript (session.json, agenda.json); news.py nic nepočítá.
"""

from __future__ import annotations

import datetime as dt

from compute_stats import FormatError, require

TERM_START = "2024-07-16"
WINDOW_DAYS = 60  # jak staré události ukázat
MAX_ITEMS = 30
REPORT_TYPES = {"report": "zprávu", "shadow_report": "stínovou zprávu"}


def _name(m: dict) -> str:
    return " ".join(x for x in (m.get("given_name"), m.get("family_name")) if x) or m["name"]


def _fem(m: dict) -> bool:
    return m.get("gender") == "FEMALE"


def session_item(s: dict | None) -> list[dict]:
    if not s:
        return []
    require(s, ["from", "to", "votes", "main", "adopted_main", "unity"], "session.json")
    u = s["unity"]
    return [
        {
            "date": s["to"],
            "kind": "session",
            "from": s["from"],
            "votes": s["votes"],
            "main": s["main"],
            "adopted_main": s["adopted_main"],
            "united": u.get("united"),
            "considered": u.get("considered"),
            "href": f"votes?od={s['from']}&m={s['to'][:7]}&f=final",
        }
    ]


def group_changes(meps: list[dict], group_label) -> list[dict]:
    """Vstup do frakce po začátku období (první frakce mandátu není změna)."""
    out = []
    for m in meps:
        seq = sorted(m.get("groups") or [], key=lambda g: g["start"])
        for prev, g in zip(seq, seq[1:], strict=False):
            if g["start"] > TERM_START:
                out.append(
                    {
                        "date": g["start"],
                        "kind": "group_change",
                        "mep_id": m["id"],
                        "name": _name(m),
                        "female": _fem(m),
                        "from_group": group_label(prev),
                        "to_group": group_label(g),
                        "href": f"p/{m['id']}",
                    }
                )
    return out


def report_items(own_work: dict | None, meps_by_id: dict) -> list[dict]:
    out = []
    for mid, w in ((own_work or {}).get("meps") or {}).items():
        m = meps_by_id.get(int(mid))
        if not m:
            continue
        for it in w.get("items", []):
            if it.get("type") not in REPORT_TYPES or not it.get("date"):
                continue
            title = (it.get("title") or {}).get("cs") or (it.get("title") or {}).get("en") or it.get("label")
            out.append(
                {
                    "date": it["date"],
                    "kind": it["type"],
                    "mep_id": m["id"],
                    "name": _name(m),
                    "female": _fem(m),
                    "title": title,
                    "label": it.get("label"),
                    "href": f"p/{m['id']}#prace-prehled",
                }
            )
    return out


def preliminary_items(days: list[dict]) -> list[dict]:
    return [
        {"date": d["date"], "kind": "preliminary", "votes": len(d.get("votes") or []), "href": "./#h-prelim", "preliminary": True}
        for d in days
    ]


def agenda_item(agenda: dict | None) -> list[dict]:
    nxt = (agenda or {}).get("next")
    if not nxt or not nxt.get("from"):
        return []
    return [
        {
            "date": nxt["from"],
            "kind": "agenda",
            "to": nxt.get("to"),
            "items": len(nxt.get("items") or []),
            "href": "zasedani",
            "upcoming": True,
        }
    ]


def build_news(
    session: dict | None,
    meps: list[dict],
    own_work: dict | None,
    agenda: dict | None,
    preliminary_days: list[dict],
    today: str,
    group_label=lambda g: g.get("short_label") or g["code"],
) -> list[dict]:
    """Seznam novinek od nejnovější; budoucí zasedání nahoře. Jen události za posledních WINDOW_DAYS dní."""
    for m in meps:
        require(m, ["id", "name", "groups"], f"poslanec {m.get('id')}")
    since = (dt.date.fromisoformat(today) - dt.timedelta(days=WINDOW_DAYS)).isoformat()
    by_id = {m["id"]: m for m in meps}
    past = [
        x
        for x in session_item(session)
        + group_changes(meps, group_label)
        + report_items(own_work, by_id)
        + preliminary_items(preliminary_days)
        if since <= x["date"] <= today
    ]
    past.sort(key=lambda x: (x["date"], x["kind"]), reverse=True)
    upcoming = [x for x in agenda_item(agenda) if x["date"] > today]
    return upcoming + past[:MAX_ITEMS]


def validate(items: list[dict]) -> None:
    for x in items:
        if not x.get("date") or not x.get("kind") or not x.get("href"):
            raise FormatError(f"novinka bez data, druhu nebo odkazu: {x}")
