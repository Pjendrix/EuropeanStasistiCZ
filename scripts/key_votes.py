"""Klíčová hlasování (D13): tři oddělené seznamy místo jednoho žebříčku, každý s jedním pravidlem.

  1. Hlavní body zasedání podle EP: hlasování, která EP sám uvedl v tiskové zprávě; autor je ručně doplňuje do
     data/manual/key_votes.json (vote_id + odkaz na tiskovou zprávu EP). Žádný scraping, žádné skóre.
  2. Zákony, o kterých se rozhodlo: závěrečné hlasování nebo prozatímní dohoda v legislativní proceduře (COD, CNS, APP).
  3. Kde se Češi nejvíc rozdělili a nejtěsnější výsledky: existující metriky, jen závěrečná hlasování.

Každý seznam je pro období poslední zasedání / 3 měsíce / 12 měsíců / celé období, nejvýš 5 položek a celkový počet.
Čtenář u každé položky vidí větu, proč v seznamu je: výběr nedělá web. Mediální zájem se jako kritérium nepoužívá;
u položek z prvního seznamu se může ručně doplnit kontext (media), ukáže se až od dvou médií.

Výstup: data/key_votes.json (build_web.py). Čísla jen z dat hlasování, nic se neodhaduje.
"""

from __future__ import annotations

import datetime as dt
import re
from urllib.parse import urlparse

from compute_stats import FormatError, active_positions, cz_split, last_session_dates
from vote_kinds import classify, is_final

LIMIT = 5
LEGISLATIVE = {"COD", "CNS", "APP"}
PERIODS = ["session", "m3", "m12", "all"]
PERIOD_LABEL = {"session": "poslední zasedání", "m3": "3 měsíce", "m12": "12 měsíců", "all": "celé období"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_items(doc: dict, vote_ids: set[int]) -> list[str]:
    """Chyby v data/manual/key_votes.json (prázdný seznam = v pořádku)."""
    problems = []
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list):
        return ["key_votes.json: chybí pole items"]
    seen = set()
    for i, it in enumerate(doc["items"]):
        where = f"key_votes.json, položka {i + 1}"
        if not isinstance(it, dict) or not isinstance(it.get("vote_id"), int):
            problems.append(f"{where}: vote_id musí být celé číslo")
            continue
        if it["vote_id"] not in vote_ids:
            problems.append(f"{where}: hlasování {it['vote_id']} v datech neexistuje")
        if it["vote_id"] in seen:
            problems.append(f"{where}: hlasování {it['vote_id']} je uvedené dvakrát")
        seen.add(it["vote_id"])
        url = it.get("source_url")
        host = urlparse(url).hostname if isinstance(url, str) else None
        if not url or not (host == "europarl.europa.eu" or (host or "").endswith(".europarl.europa.eu")) or not url.startswith("https://"):
            problems.append(f"{where}: source_url musí být odkaz https://…europarl.europa.eu na tiskovou zprávu EP")
        if it.get("press_date") and not DATE_RE.match(str(it["press_date"])):
            problems.append(f"{where}: press_date musí být RRRR-MM-DD")
        for m in it.get("media") or []:
            if not (isinstance(m, dict) and str(m.get("url", "")).startswith("https://") and m.get("outlet")):
                problems.append(f"{where}: media musí mít url (https) a outlet")
    return problems


def period_starts(votes: list[dict]) -> dict[str, str | None]:
    """Počátek každého období vůči poslednímu hlasování v datech (reprodukovatelné, nezávislé na dnešku)."""
    dates = [v["date"] for v in votes]
    if not dates:
        return {p: None for p in PERIODS}
    last = dt.date.fromisoformat(max(dates))
    return {
        "session": min(last_session_dates(dates)),
        "m3": (last - dt.timedelta(days=92)).isoformat(),
        "m12": (last - dt.timedelta(days=365)).isoformat(),
        "all": None,
    }


def _compact(v: dict, meps_by_id: dict, **extra) -> dict:
    kind, inverted = (v["vote_kind"], v.get("inverted", False)) if v.get("vote_kind") else classify(v)
    cz = active_positions(v, meps_by_id)
    c = v["counts"]
    return {"id": v["id"], "date": v["date"], "month": v["date"][:7], "title": v.get("title") or (v.get("procedure") or {}).get("title") or v.get("reference"),
            "vote_kind": kind, "result": v.get("result"), "counts": {"for": c["for"], "against": c["against"], "abstention": c["abstention"]},
            "cz": [sum(p["position"] == k for p in cz) for k in ("FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE")], **extra}


def build_key_votes(votes: list[dict], doc: dict | None, meps_by_id: dict) -> dict:
    items = {it["vote_id"]: it for it in (doc or {}).get("items", [])}
    by_id = {v["id"]: v for v in votes}
    problems = validate_items(doc or {"items": []}, set(by_id))
    if problems:
        raise FormatError("; ".join(problems))
    starts = period_starts(votes)
    finals = [v for v in votes if is_final(v)]
    laws = [v for v in finals if (v.get("procedure") or {}).get("type") in LEGISLATIVE]
    splits = []
    for v in finals:
        sp = cz_split(active_positions(v, meps_by_id))
        if sp:
            splits.append((v, sp))
    close = [v for v in finals if v.get("result") in ("ADOPTED", "REJECTED")]
    out_votes: dict[str, dict] = {}
    lists: dict[str, dict] = {}
    inside = lambda v, p: starts[p] is None or v["date"] >= starts[p]
    for p in PERIODS:
        hl = sorted((by_id[i] for i in items if inside(by_id[i], p)), key=lambda v: (v["date"], v["id"]), reverse=True)
        lw = sorted((v for v in laws if inside(v, p)), key=lambda v: (v["date"], v["id"]), reverse=True)
        sp = sorted(((v, s) for v, s in splits if inside(v, p)), key=lambda x: (-x[1][0], -(x[1][1] + x[1][2]), x[0]["date"], x[0]["id"]))
        cl = sorted((v for v in close if inside(v, p)), key=lambda v: (abs(v["counts"]["for"] - v["counts"]["against"]), v["date"], v["id"]))
        press_reason = lambda v: ("EP ho uvedl mezi hlavními body zasedání"
                                  + (f" (tisková zpráva {items[v['id']]['press_date']})" if items[v["id"]].get("press_date") else ""))
        law_reason = lambda v: f"Závěrečné hlasování v legislativní proceduře {(v.get('procedure') or {}).get('reference') or ''}".strip()
        gap = lambda v: abs(v["counts"]["for"] - v["counts"]["against"])
        close_reason = lambda v: f"Výsledek {v['counts']['for']} : {v['counts']['against']}, rozdíl {gap(v)} " + ("hlas" if gap(v) == 1 else "hlasy" if 2 <= gap(v) <= 4 else "hlasů")
        chosen = {
            "ep_highlights": (len(hl), [(v, press_reason(v)) for v in hl[:LIMIT]]),
            "laws": (len(lw), [(v, law_reason(v)) for v in lw[:LIMIT]]),
            "splits": (len(sp), [(v, f"Češi se rozdělili {s[1]} : {s[2]} (pro : proti)") for v, s in sp[:LIMIT]]),
            "close": (len(cl), [(v, close_reason(v)) for v in cl[:LIMIT]]),
        }
        lists[p] = {name: {"total": total, "items": [{"id": v["id"], "reason": reason} for v, reason in picked]}
                    for name, (total, picked) in chosen.items()}
        for _, picked in chosen.values():
            for v, _r in picked:
                it = items.get(v["id"])
                out_votes.setdefault(str(v["id"]), _compact(v, meps_by_id, **({"press": {
                    "source_url": it["source_url"], "press_date": it.get("press_date"),
                    "media": it.get("media") if len(it.get("media") or []) >= 2 else []}} if it else {})))
    return {
        "periods": {p: {"label": PERIOD_LABEL[p], "from": starts[p]} for p in PERIODS},
        "lists": lists, "votes": out_votes,
        "rules": {
            "ep_highlights": "Hlasování, která EP sám uvedl mezi hlavními body zasedání (tisková zpráva EP). Doplňuje autor ručně.",
            "laws": "Závěrečné hlasování nebo prozatímní dohoda v legislativní proceduře (COD, CNS, APP), od nejnovějších.",
            "splits": "Závěrečná hlasování, ve kterých se čeští poslanci nejvíc rozdělili (menšina mezi hlasy pro a proti).",
            "close": "Závěrečná hlasování s nejmenším rozdílem hlasů pro a proti.",
        },
        "note": "Klíčová hlasování nevybíráme my. Bereme ta, která EP sám uvedl mezi hlavními body zasedání, a k nim všechna závěrečná hlasování o zákonech.",
    }
