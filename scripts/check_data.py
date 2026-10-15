"""Kontrola rozumnosti dat před commitem týdenní aktualizace.

Porovná nová data s předchozím stavem (záloha složky data/ před stažením):
  - celkový počet hlasování nesmí klesnout,
  - žádný měsíc z předchozího stavu nesmí zmizet,
  - aktivních poslanců za ČR (mandát platný k danému dni) musí být 21; o jednoho méně
    je jen varování (uprázdněné místo, než nastoupí náhradník), jiný počet je chyba,
  - žádný poslanec 10. období nesmí ze seznamu zmizet,
  - loga stran a frakcí (jen varování): logo bez zdroje v data/manual/logos.json, soubor větší než 60 kB,
    SVG s <script>, atributy on…= , javascript: nebo externím odkazem.
Při chybě vypíše všechny problémy a skončí kódem 1, workflow pak nic necommitne.
Varování se vypíší jako GitHub anotace (::warning::) a běh pokračuje.

Použití:
    python scripts/check_data.py --prev /tmp/data-prev [--data data] [--today 2026-10-14]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

CZ_SEATS = 21
LOGO_MAX_BYTES = 60_000
UNSAFE_SVG = re.compile(r"<script|\son[a-z]+\s*=|javascript:|(?:xlink:)?href\s*=\s*[\"'](?:https?:)?//", re.I)


def check_logos(data_dir: Path, public: Path) -> list[str]:
    """Varování k logům v groups.json a parties.json (soubory nahrává autor ručně)."""
    warnings = []
    for name in ("groups.json", "parties.json"):
        for e in _load(data_dir / name) or []:
            logo = e.get("logo")
            if not logo:
                continue
            label = e.get("short_label") or e.get("code") or e.get("id")
            if not e.get("logo_source"):
                warnings.append(f"logo {label} ({logo}) nemá v data/manual/logos.json uvedený zdroj")
            f = public / logo
            if not f.exists():
                warnings.append(f"logo {label}: soubor {logo} neexistuje")
                continue
            if f.stat().st_size > LOGO_MAX_BYTES:
                warnings.append(f"logo {label}: soubor {logo} má {f.stat().st_size // 1000} kB (víc než 60 kB)")
            if f.suffix == ".svg" and UNSAFE_SVG.search(f.read_text(encoding="utf-8", errors="replace")):
                warnings.append(f"logo {label}: SVG {logo} obsahuje skript, obsluhu události nebo externí odkaz; pročistit")
    return warnings


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def active_meps(meps: list[dict], day: str) -> list[dict]:
    return [m for m in meps
            if any(x["start"] <= day and (x["end"] is None or day <= x["end"]) for x in m["mandates"])]


def check(prev_dir: Path | None, data_dir: Path, today: str, seats: int = CZ_SEATS) -> tuple[list[str], list[str]]:
    """Vrací (chyby, varování)."""
    problems, warnings = [], []
    index = _load(data_dir / "votes" / "index.json")
    meps_doc = _load(data_dir / "meps.json")
    if index is None or meps_doc is None:
        return ["chybí data/votes/index.json nebo data/meps.json"], []

    active = active_meps(meps_doc["meps"], today)
    if len(active) != seats:
        names = ", ".join(sorted(m["name"] for m in active))
        msg = f"aktivních poslanců za ČR k {today} je {len(active)}, očekáváno {seats} ({names})"
        if len(active) == seats - 1:
            warnings.append(msg + "; nejspíš uprázdněné místo před nástupem náhradníka")
        else:
            problems.append(msg)

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
    return problems, warnings


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--prev", type=Path, help="záloha složky data/ z předchozího běhu")
    p.add_argument("--data", type=Path, default=root / "data")
    p.add_argument("--today", default=dt.datetime.now(dt.timezone.utc).date().isoformat())
    p.add_argument("--public", type=Path, default=root / "public")
    args = p.parse_args(argv)
    problems, warnings = check(args.prev, args.data, args.today)
    warnings += check_logos(args.data, args.public)
    for w in warnings:
        print(f"::warning title=Kontrola dat::{w}")
    if problems:
        print("KONTROLA DAT SELHALA, nic se necommitne:", file=sys.stderr)
        for x in problems:
            print(f"  - {x}", file=sys.stderr)
        return 1
    print("kontrola dat: v pořádku", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
