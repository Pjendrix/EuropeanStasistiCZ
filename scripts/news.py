"""Novinky na /aktualne: časová osa po zasedáních pléna, kterou skládá kód z dat. Žádná redakce, žádná AI.

Bloky časové osy (od nejnovějšího, posledních WINDOW_DAYS dní):
  - zasedání: dny s jmenovitým hlasováním (HowTheyVote) seskupené do zasedání (mezera nejvýš SESSION_GAP dní),
    čísla závěrečných hlasování a výběr hlavních hlasování pravidlem pick_votes,
  - předběžné zasedání: dny z data/preliminary/, které HowTheyVote ještě nemá (štítek „předběžné“, nic se nepočítá),
  - událost: změna frakce nebo strany, začátek nebo konec mandátu (data/meps.json, EP Open Data),
  - mezi zasedáními: nové zprávy a stínové zprávy českých poslanců (data/own_work.json), sbalené po poslancích.
Karta „Chystá se“: nejbližší zasedání z programu (data/agenda.json) a česká stopa v něm (data/radar.json).

Výběr hlavních hlasování zasedání (pick_votes), jen závěrečná hlasování (vote_kinds.is_final, stejně jako jinde na webu):
  1. nejdřív po jednom nejlepším hlasování z každé kategorie v tomto pořadí: česká stopa (zpravodaj nebo stínový
     zpravodaj), Češi rozděleni (menšina aspoň 30 % hlasů pro a proti, jako /rozkol), rozhodly české hlasy
     (jako /rozhodujici), těsný výsledek EP (compute_stats.is_close),
  2. zbylá místa doplní pořadí podle stejných kritérií (stopa → rozděleni → rozhodly → těsné → vyšší účast Čechů),
  3. nejvýš MAX_PICKS; při shodě novější den a vyšší id hlasování.
Definice rozdělení, rozhodujících a těsných hlasování jsou ze compute_stats.py (stejné funkce jako analýzy).
"""

from __future__ import annotations

import datetime as dt
from collections import Counter

from compute_stats import STRONG_SPLIT, VOTED, FormatError, active_positions, cz_split, decisive_alternative, is_close, require
from vote_kinds import is_final

TERM_START = "2024-07-16"
WINDOW_DAYS = 60
SESSION_GAP = 3  # dny hlasování s mezerou nejvýš 3 dny patří k jednomu zasedání (štrasburský týden po–čt)
MAX_PICKS = 5
FULL_SESSIONS = 2  # kolik nejnovějších zasedání je rozbalených
REPORT_TYPES = ("report", "shadow_report")
PICK_CATEGORIES = ("trace", "split", "decisive", "close")


def _name(m: dict) -> str:
    return " ".join(x for x in (m.get("given_name"), m.get("family_name")) if x) or m["name"]


def _day(s: str, days: int) -> str:
    return (dt.date.fromisoformat(s) + dt.timedelta(days=days)).isoformat()


# --- zasedání ------------------------------------------------------------------------------------


def group_sessions(days: list[str], gap: int = SESSION_GAP) -> list[list[str]]:
    """Dny hlasování → zasedání (seznamy dnů vzestupně); nový blok, když je mezera větší než gap dní."""
    out: list[list[str]] = []
    for d in sorted(set(days)):
        if out and (dt.date.fromisoformat(d) - dt.date.fromisoformat(out[-1][-1])).days <= gap:
            out[-1].append(d)
        else:
            out.append([d])
    return out


def vote_features(v: dict, active: list[dict], roles: list[dict] | None) -> dict:
    """Znaky hlasování pro výběr a pro řádek na webu. active = Češi v mandátu (compute_stats.active_positions)."""
    sp = cz_split(active)
    cz = [sum(p["position"] == k for p in active) for k in ("FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE")]
    return {
        "id": v["id"],
        "date": v["date"],
        "trace": bool(roles),
        "rapporteur": any(r.get("role") == "rapporteur" for r in roles or []),
        "split": bool(sp and sp[0] >= STRONG_SPLIT),
        "decisive": decisive_alternative(v, active) is not None,
        "close": is_close(v),
        "turnout": sum(p["position"] in VOTED for p in active),
        "cz": cz,
    }


def pick_key(f: dict) -> tuple:
    return (not f["trace"], not f["split"], not f["decisive"], not f["close"], -f["turnout"], _neg_date(f["date"]), -f["id"])


def _neg_date(d: str) -> int:
    return -dt.date.fromisoformat(d).toordinal()


def pick_votes(feats: list[dict], n: int = MAX_PICKS) -> list[dict]:
    """Hlavní hlasování zasedání (viz docstring modulu): po jednom z každé kategorie, pak podle pořadí priorit."""
    ranked = sorted(feats, key=pick_key)
    picked: list[dict] = []
    for cat in PICK_CATEGORIES:
        best = next((f for f in ranked if f[cat] and f not in picked), None)
        if best is not None and len(picked) < n:
            picked.append(best)
    for f in ranked:
        if len(picked) >= n:
            break
        if f not in picked:
            picked.append(f)
    return sorted(picked, key=pick_key)


def session_block(days: list[str], votes: list[dict], meps_by_id: dict, vote_roles: dict) -> dict:
    """Blok zasedání: čísla závěrečných hlasování a hlavní hlasování (jen data HowTheyVote)."""
    finals = [v for v in votes if is_final(v)]
    feats = []
    for v in finals:
        f = vote_features(v, active_positions(v, meps_by_id), vote_roles.get(str(v["id"])))
        f["vote"] = v
        feats.append(f)
    considered = [f for f in feats if f["cz"][0] + f["cz"][1] >= 2]
    return {
        "type": "session",
        "from": days[0],
        "to": days[-1],
        "date": days[-1],
        "anchor": f"zasedani-{days[0]}",
        "votes": len(votes),
        "finals": len(finals),
        "united": sum(1 for f in considered if not f["cz"][0] or not f["cz"][1]),
        "considered": len(considered),
        "trace": sum(f["trace"] for f in feats),
        "splits": sum(f["split"] for f in feats),
        "rapporteurs": sum(f["rapporteur"] for f in feats),
        "picks": pick_votes(feats),
        "feats": feats,  # pro karusel ke sdílení (sitting_share.py); do HTML ani feedu se nepíše
    }


def preliminary_block(days: list[dict]) -> dict:
    """Předběžné zasedání (data/preliminary/): jen hlavní hlasování v pořadí dne, nic se nepočítá do statistik."""
    mains = [v for d in days for v in d["votes"] if v.get("main")]
    return {
        "type": "preliminary",
        "from": days[0]["date"],
        "to": days[-1]["date"],
        "date": days[-1]["date"],
        "anchor": f"zasedani-{days[0]['date']}",
        "votes": sum(len(d["votes"]) for d in days),
        "mains": mains[:MAX_PICKS],
        "mains_total": len(mains),
    }


# --- události a zprávy --------------------------------------------------------------------------------


def mep_events(meps: list[dict], since: str, today: str, group_label=lambda g: g.get("short_label") or g["code"]) -> list[dict]:
    """Změna frakce nebo strany a začátek či konec mandátu v okně [since, today] (EP Open Data, meps.json)."""
    out = []
    for m in meps:
        require(m, ["id", "name", "mandates", "groups"], f"poslanec {m.get('id')}")
        base = {"type": "event", "mep_id": m["id"], "name": _name(m), "female": m.get("gender") == "FEMALE", "href": f"p/{m['id']}"}
        for key, kind in (("groups", "group"), ("parties", "party")):
            seq = sorted(m.get(key) or [], key=lambda x: x["start"])
            for prev, cur in zip(seq, seq[1:], strict=False):
                if cur["start"] > TERM_START and since <= cur["start"] <= today:
                    label = group_label if kind == "group" else (lambda x: x.get("short_label") or x.get("name") or "")
                    out.append({**base, "kind": kind, "date": cur["start"], "from_label": label(prev), "to_label": label(cur)})
        for mand in m["mandates"]:
            if mand.get("start") and mand["start"] > TERM_START and since <= mand["start"] <= today:
                out.append({**base, "kind": "mandate_start", "date": mand["start"]})
            if mand.get("end") and since <= mand["end"] <= today:
                out.append({**base, "kind": "mandate_end", "date": mand["end"]})
    return out


def report_items(own_work: dict | None, meps_by_id: dict, since: str, today: str) -> list[dict]:
    out = []
    for mid, w in ((own_work or {}).get("meps") or {}).items():
        m = meps_by_id.get(int(mid))
        if not m:
            continue
        for it in w.get("items", []):
            if it.get("type") in REPORT_TYPES and it.get("date") and since <= it["date"] <= today:
                t = it.get("title") or {}
                out.append(
                    {
                        "type": "report",
                        "kind": it["type"],
                        "date": it["date"],
                        "mep_id": m["id"],
                        "name": _name(m),
                        "title": t.get("cs") or t.get("en") or it.get("label"),
                        "label": it.get("label"),
                    }
                )
    return out


def fold_reports(reports: list[dict]) -> dict:
    """Blok „mezi zasedáními“: zprávy (hlavní zpravodaj) vypsané zvlášť, stínové sbalené po poslancích (Jméno · počet)."""
    main = sorted((r for r in reports if r["kind"] == "report"), key=lambda r: (r["date"], r["name"]), reverse=True)
    shadow = Counter((r["mep_id"], r["name"]) for r in reports if r["kind"] == "shadow_report")
    chips = sorted(({"mep_id": k[0], "name": k[1], "count": n} for k, n in shadow.items()), key=lambda c: (-c["count"], c["name"]))
    dates = sorted(r["date"] for r in reports)
    return {
        "type": "between",
        "from": dates[0],
        "to": dates[-1],
        "date": dates[-1],
        "reports": main,
        "shadow": chips,
        "shadow_total": sum(shadow.values()),
    }


# --- celá časová osa ----------------------------------------------------------------------------------


def build_timeline(
    votes: list[dict],
    meps: list[dict],
    own_work: dict | None,
    vote_roles: dict,
    preliminary_days: list[dict],
    today: str,
    group_label=lambda g: g.get("short_label") or g["code"],
) -> list[dict]:
    """Bloky časové osy od nejnovějšího. Zprávy mezi dvěma bloky zasedání (nebo událostí) se sloučí do jednoho bloku."""
    since = _day(today, -WINDOW_DAYS)
    meps_by_id = {m["id"]: m for m in meps}
    window = [v for v in votes if since <= v["date"] <= today]
    by_day: dict[str, list[dict]] = {}
    for v in window:
        by_day.setdefault(v["date"], []).append(v)
    blocks = [session_block(days, [v for d in days for v in by_day[d]], meps_by_id, vote_roles) for days in group_sessions(list(by_day))]
    covered = max(by_day, default="")
    prelim = sorted((d for d in preliminary_days if d["date"] > covered and since <= d["date"] <= today), key=lambda d: d["date"])
    for days in group_sessions([d["date"] for d in prelim]):
        blocks.append(preliminary_block([d for d in prelim if d["date"] in days]))
    blocks += mep_events(meps, since, today, group_label)
    reports = report_items(own_work, meps_by_id, since, today)
    # zprávy přiřadit k mezeře mezi bloky: seřadit vše od nejnovějšího a po sobě jdoucí zprávy sloučit
    order = {"session": 0, "preliminary": 0, "event": 1, "report": 2}
    items = sorted(blocks + reports, key=lambda x: (x["date"], -order[x["type"]]), reverse=True)
    out: list[dict] = []
    run: list[dict] = []
    for x in items:
        if x["type"] == "report":
            run.append(x)
            continue
        if run:
            out.append(fold_reports(run))
            run = []
        out.append(x)
    if run:
        out.append(fold_reports(run))
    seen = 0
    for b in out:
        if b["type"] == "session":
            b["full"] = seen < FULL_SESSIONS
            seen += 1
    return out


def upcoming(agenda: dict | None, radar: dict | None, today: str) -> dict | None:
    """Karta „Chystá se“: nejbližší zasedání z programu EP a česká stopa v jeho bodech (radar.json)."""
    nxt = (agenda or {}).get("next")
    if not nxt or not nxt.get("from") or (nxt.get("to") or nxt["from"]) < today:
        return None
    s = (radar or {}).get("session") or {}
    items = (s.get("items") or []) if s.get("from") == nxt["from"] else []
    trace = [
        {
            "title": it.get("title_cs") or it.get("title_en") or it.get("id"),
            "label": (it.get("procedure") or {}).get("label"),
            "cz": it["cz"],
        }
        for it in items
        if it.get("cz")
    ]
    return {"from": nxt["from"], "to": nxt.get("to") or nxt["from"], "items": len(nxt.get("items") or []), "trace": trace}


def validate(blocks: list[dict]) -> None:
    for b in blocks:
        if not b.get("date") or b.get("type") not in ("session", "preliminary", "event", "between"):
            raise FormatError(f"novinky: neplatný blok {b.get('type')} {b.get('date')}")
