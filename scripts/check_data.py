"""Kontrola rozumnosti dat před commitem týdenní aktualizace.

Porovná nová data s předchozím stavem (záloha složky data/ před stažením):
  - celkový počet hlasování nesmí klesnout,
  - žádný měsíc z předchozího stavu nesmí zmizet,
  - aktivních poslanců za ČR (mandát platný k danému dni) musí být přesně 21,
  - žádný poslanec 10. období nesmí ze seznamu zmizet.
Při porušení vypíše všechny problémy a skončí kódem 1, workflow pak nic necommitne.

Použití:
    python scripts/check_data.py --prev /tmp/data-prev [--data data] [--today 2026-10-14]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

CZ_SEATS = 21


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def active_meps(meps: list[dict], day: str) -> list[dict]:
    return [m for m in meps
            if any(x["start"] <= day and (x["end"] is None or day <= x["end"]) for x in m["mandates"])]


def check(prev_dir: Path | None, data_dir: Path, today: str, seats: int = CZ_SEATS) -> list[str]:
    problems = []
    index = _load(data_dir / "votes" / "index.json")
    meps_doc = _load(data_dir / "meps.json")
    if index is None or meps_doc is None:
        return ["chybí data/votes/index.json nebo data/meps.json"]

    active = active_meps(meps_doc["meps"], today)
    if len(active) != seats:
        names = ", ".join(sorted(m["name"] for m in active))
        problems.append(f"aktivních poslanců za ČR k {today} je {len(active)}, očekáváno {seats} ({names})")

    prev_index = _load(prev_dir / "votes" / "index.json") if prev_dir else None
    if prev_index:
        total = sum(m["votes"] for m in index["months"])
        prev_total = sum(m["votes"] for m in prev_index["months"])
        if total < prev_total:
            problems.append(f"počet hlasování klesl z {prev_total} na {total}")
        missing = sorted({m["month"] for m in prev_index["months"]} - {m["month"] for m in index["months"]})
        if missing:
            problems.append(f"zmizely měsíce: {', '.join(missing)}")

    prev_meps = _load(prev_dir / "meps.json") if prev_dir else None
    if prev_meps:
        gone = {m["id"] for m in prev_meps["meps"]} - {m["id"] for m in meps_doc["meps"]}
        if gone:
            problems.append(f"ze seznamu zmizeli poslanci s ID {sorted(gone)}")
    return problems


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prev", type=Path, help="záloha složky data/ z předchozího běhu")
    p.add_argument("--data", type=Path, default=root / "data")
    p.add_argument("--today", default=dt.datetime.now(dt.timezone.utc).date().isoformat())
    args = p.parse_args(argv)
    problems = check(args.prev, args.data, args.today)
    if problems:
        print("KONTROLA DAT SELHALA, nic se necommitne:", file=sys.stderr)
        for x in problems:
            print(f"  - {x}", file=sys.stderr)
        return 1
    print("kontrola dat: v pořádku", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
