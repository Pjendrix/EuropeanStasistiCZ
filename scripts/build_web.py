"""Předpočítá odlehčené soubory pro web z data/meps.json, data/stats.json a data/votes/*.json.

Výstup:
  data/overview.json        souhrn pro úvodní tabulku (poslanci + hlavní metriky)
  data/meps/{id}.json       vše pro profil poslance
  data/votes/search.json    odlehčený seznam všech hlasování pro seznam a vyhledávání

Nic nepočítá znovu: metriky bere ze stats.json, hlasování z měsíčních souborů.
Měsíční soubory zůstávají pro detail hlasování.

Použití:
    python scripts/build_web.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from compute_stats import POSITIONS, FormatError, in_mandate, load_votes, require

RECENT_MAIN = 15
SEARCH_FIELDS = ["id", "date", "month", "title", "reference", "description", "amendment_number",
                 "result", "is_main", "cz"]


def current(items: list[dict], day: str) -> dict | None:
    """Členství platné k danému dni, jinak poslední známé."""
    if not items:
        return None
    for x in items:
        if x["start"] <= day and (x["end"] is None or day <= x["end"]):
            return x
    return items[-1]


def vote_title(v: dict) -> str:
    return v.get("title") or (v.get("procedure") or {}).get("title") or v.get("reference") or f"Hlasování {v['id']}"


def cz_counts(vote: dict, meps_by_id: dict) -> list[int]:
    """Počty [pro, proti, zdržel, nehlasoval] českých poslanců v mandátu."""
    counts = [0, 0, 0, 0]
    for p in vote["cz_positions"]:
        m = meps_by_id.get(p["member_id"])
        if m and in_mandate(m["mandates"], vote["date"]):
            counts[POSITIONS.index(p["position"])] += 1
    return counts


def build_search(votes: list[dict], meps_by_id: dict) -> dict:
    rows = [[v["id"], v["date"], v["date"][:7], vote_title(v), v.get("reference"), v.get("description"),
             v.get("amendment_number"), v.get("result"), v["is_main"], cz_counts(v, meps_by_id)]
            for v in votes]
    return {"fields": SEARCH_FIELDS, "positions_order": POSITIONS, "rows": rows}


def mep_summary(m: dict, day: str) -> dict:
    g, p = current(m["groups"], day), current(m["parties"], day)
    return {
        "id": m["id"], "name": m["name"], "given_name": m.get("given_name"), "family_name": m.get("family_name"),
        "sort_label": m.get("sort_label"), "gender": m.get("gender"), "photo_url": m.get("photo_url"),
        "mandates": m["mandates"],
        "group": {"code": g["code"], "short_label": g["short_label"]} if g else None,
        "party": {"id": int(p["org_id"]), "short_label": p["short_label"]} if p else None,
    }


def build_overview(meps: list[dict], stats: dict, day: str) -> dict:
    return {
        "sources": stats["sources"], "period": stats["period"], "votes_total": stats["votes_total"],
        "definitions": stats["definitions"],
        "meps": [{**mep_summary(m, day), "total": stats["meps"][str(m["id"])]["total"]} for m in meps],
    }


def recent_main_votes(mep: dict, votes: list[dict], limit: int = RECENT_MAIN) -> list[dict]:
    out = []
    for v in reversed(votes):
        if not v["is_main"] or not in_mandate(mep["mandates"], v["date"]):
            continue
        pos = next((p for p in v["cz_positions"] if p["member_id"] == mep["id"]), None)
        if pos is None:
            continue
        out.append({"id": v["id"], "date": v["date"], "month": v["date"][:7], "title": vote_title(v),
                    "reference": v.get("reference"), "description": v.get("description"),
                    "result": v.get("result"), "position": pos["position"], "group_code": pos["group_code"]})
        if len(out) >= limit:
            break
    return out


def build_profile(mep: dict, meps: list[dict], stats: dict, votes: list[dict], day: str) -> dict:
    st = stats["meps"][str(mep["id"])]
    by_id = {str(m["id"]): m for m in meps}
    pairwise = sorted(
        ({**mep_summary(by_id[k], day), "same": v[0], "total": v[1]} for k, v in st["pairwise"].items() if k in by_id),
        key=lambda x: (-(x["same"] / x["total"]) if x["total"] else 1, x["id"]),
    )
    return {
        "mep": mep,
        "sources": stats["sources"],
        "definitions": stats["definitions"],
        "total": st["total"],
        "monthly": st["monthly"],
        "pairwise": pairwise,
        "recent_main_votes": recent_main_votes(mep, votes),
    }


def write_json(path: Path, obj, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":")) if compact else \
        json.dumps(obj, ensure_ascii=False, indent=1)
    path.write_text(text + "\n", encoding="utf-8")


def run(data_dir: Path, day: str) -> dict:
    meps_doc = json.loads((data_dir / "meps.json").read_text(encoding="utf-8"))
    stats = json.loads((data_dir / "stats.json").read_text(encoding="utf-8"))
    require(meps_doc, ["meps"], "meps.json")
    require(stats, ["meps", "sources", "period", "votes_total", "definitions"], "stats.json")
    meps = meps_doc["meps"]
    missing = [m["id"] for m in meps if str(m["id"]) not in stats["meps"]]
    if missing:
        raise FormatError(f"stats.json nemá poslance {missing}, spusť nejdřív compute_stats.py")
    _, votes = load_votes(data_dir / "votes")
    by_id = {m["id"]: m for m in meps}

    write_json(data_dir / "overview.json", build_overview(meps, stats, day))
    profiles_dir = data_dir / "meps"
    for m in meps:
        write_json(profiles_dir / f"{m['id']}.json", build_profile(m, meps, stats, votes, day))
    # Jedno hlasování na řádek kvůli čitelným diffům.
    search = build_search(votes, by_id)
    lines = [json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in search["rows"]]
    head = json.dumps({k: v for k, v in search.items() if k != "rows"}, ensure_ascii=False, separators=(",", ":"))
    (data_dir / "votes" / "search.json").write_text(head[:-1] + ',"rows":[\n' + ",\n".join(lines) + "\n]}\n",
                                                    encoding="utf-8")
    return {"profiles": len(meps), "votes": len(votes)}


def main(argv=None) -> int:
    import datetime as dt
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=root / "data")
    p.add_argument("--today", default=dt.datetime.now(dt.timezone.utc).date().isoformat(),
                   help="den, ke kterému se určí aktuální frakce a strana")
    args = p.parse_args(argv)
    try:
        res = run(args.data_dir, args.today)
    except FormatError as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    print(f"web: {res['profiles']} profilů, {res['votes']} hlasování v search.json", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
