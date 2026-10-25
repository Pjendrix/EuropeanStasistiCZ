"""Denní kontrola čerstvosti nasazeného webu (V16): načte https://epwatch.cz/data/freshness.json.

Problém (vypíše se do GITHUB_OUTPUT jako problem=… a workflow založí issue):
  - web neodpovídá nebo soubor nejde přečíst,
  - export hlasování (release) je starší než stale_days dní.
Bez problému vypíše problem= (prázdné) a workflow otevřené issue zavře.

Použití:
    python scripts/check_freshness.py [--url …] [--today RRRR-MM-DD] >> "$GITHUB_OUTPUT"
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.request

URL = "https://epwatch.cz/data/freshness.json"


def problem(doc: dict | None, today: str, error: str | None = None) -> str:
    if error:
        return f"Web neodpovídá nebo freshness.json nejde přečíst: {error}"
    if not isinstance(doc, dict) or not doc.get("release") or not isinstance(doc.get("stale_days"), int):
        return "freshness.json nemá pole release nebo stale_days (změna formátu?)"
    age = (dt.date.fromisoformat(today) - dt.date.fromisoformat(doc["release"][:10])).days
    if age > doc["stale_days"]:
        return f"Data jsou stará: export HowTheyVote {doc['release'][:10]} je {age} dní starý (limit {doc['stale_days']} dní)."
    return ""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", default=URL)
    p.add_argument("--today", default=dt.date.today().isoformat())
    args = p.parse_args(argv)
    doc, err = None, None
    try:
        with urllib.request.urlopen(urllib.request.Request(args.url, headers={"User-Agent": "epwatch-freshness"}), timeout=60) as r:
            doc = json.load(r)
    except Exception as e:  # noqa: BLE001 – jakákoli chyba sítě nebo JSON = web neodpovídá
        err = f"{type(e).__name__}: {e}"
    msg = problem(doc, args.today, err)
    print(f"problem={msg}")
    print(msg or "web i data v pořádku", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
