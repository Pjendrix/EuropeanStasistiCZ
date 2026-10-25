"""Opravy hlasů českých poslanců (V9): data/vote_corrections.json z EP Open Data API.

Zdroj: GET /meetings/MTG-PL-{den}/decisions, pole had_voter_intended_favor / _against / _abstention (stejný dotaz
jako předběžné výsledky, scripts/preliminary.py). HowTheyVote opravy v exportu nemá. ID hlasování
(notation_votingId) je stejné jako v HowTheyVote (ověřeno, docs/SPIKE_FAZE4_2026-10-25.md).

Pravidla:
- Oprava je jen záznam, co poslanec podle vlastního oznámení zamýšlel. Výsledek ani statistiky nemění: všude se
  počítá zaznamenaný hlas, stejně jako v oficiálním výsledku a v HowTheyVote.
- Jen čeští poslanci z data/meps.json a jen hlasování, která jsou v datech HowTheyVote.
- Dny v minulosti se nemění: stahuje se jen den, který v souboru ještě není (cache), EP API se throttluje (EPClient).

Použití:
    python scripts/fetch_vote_corrections.py              # jen nové dny
    python scripts/fetch_vote_corrections.py --max-days 20
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from compute_stats import FormatError, load_votes, require
from fetch_meps import EPClient
from fetch_meps import FormatError as ApiFormatError
from preliminary import INTENDED_KEYS, _person_id

NOTE = (
    "Opravy hlasů českých poslanců z EP Open Data (meetings/{den}/decisions, had_voter_intended_*). "
    "Oprava nemění výsledek ani statistiky; počítá se zaznamenaný hlas. scripts/fetch_vote_corrections.py"
)
SOURCE = "https://data.europarl.europa.eu/api/v2/meetings/MTG-PL-{day}/decisions"


def corrections_for_day(payload: dict, day: str, cz_ids: set[int], htv_ids: set[int]) -> dict[str, dict[str, str]]:
    """{id hlasování: {id poslance: zamýšlený hlas}} pro jeden den."""
    # Vlastní čtení místo preliminary.parse_decisions: starší dny nemají u všech rozhodnutí decision_method.
    # Bereme jen ID hlasování a seznamy had_voter_intended_*, ID se páruje s HowTheyVote (jiná rozhodnutí se přeskočí).
    require(payload, ["data"], f"decisions {day}")
    out: dict[str, dict[str, str]] = {}
    for raw in payload["data"]:
        if not isinstance(raw, dict) or not str(raw.get("notation_votingId") or "").isdigit():
            continue
        vid = int(raw["notation_votingId"])
        if vid not in htv_ids:
            continue
        where = f"decisions {day} {vid}"
        cz = {}
        for pos, key in INTENDED_KEYS.items():
            for u in raw.get(key) or []:
                m = _person_id(u, where)
                if m in cz_ids:
                    if str(m) in cz and cz[str(m)] != pos:
                        raise FormatError(f"{where}: poslanec {m} má dvě různé opravy")
                    cz[str(m)] = pos
        if cz:
            out[str(vid)] = dict(sorted(cz.items(), key=lambda x: int(x[0])))
    return out


def load(path: Path) -> dict:
    if not path.exists():
        return {"note": NOTE, "source": SOURCE, "days": [], "votes": {}}
    doc = json.loads(path.read_text(encoding="utf-8"))
    require(doc, ["days", "votes"], path.name)
    return doc


def save(path: Path, doc: dict, done: set[str]) -> dict:
    doc = {"note": NOTE, "source": SOURCE, "days": sorted(done), "votes": dict(sorted(doc["votes"].items(), key=lambda x: int(x[0])))}
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return doc


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=root / "data")
    p.add_argument("--max-days", type=int, default=400, help="nejvýš tolik nových dní za běh")
    args = p.parse_args(argv)
    path = args.data_dir / "vote_corrections.json"
    try:
        _, votes = load_votes(args.data_dir / "votes")
        meps = json.loads((args.data_dir / "meps.json").read_text(encoding="utf-8"))
        require(meps, ["meps"], "meps.json")
        cz_ids = {m["id"] for m in meps["meps"]}
        htv_ids = {v["id"] for v in votes}
        doc = load(path)
        done = set(doc["days"])
        todo = sorted({v["date"] for v in votes} - done)[: args.max_days]
        client = EPClient()
        for day in todo:
            day_votes = corrections_for_day(client.get(f"meetings/MTG-PL-{day}/decisions"), day, cz_ids, htv_ids)
            doc["votes"].update(day_votes)
            done.add(day)
            save(path, doc, done)  # průběžně: přerušený běh příště naváže
            print(f"{day}: {sum(len(x) for x in day_votes.values())} oprav českých poslanců", file=sys.stderr)
    except (FormatError, ApiFormatError) as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    doc = save(path, doc, done)
    n = sum(len(x) for x in doc["votes"].values())
    print(f"opravy hlasů: {len(doc['days'])} dní, {len(doc['votes'])} hlasování, {n} oprav", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
