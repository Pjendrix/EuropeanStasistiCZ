"""Které soubory z data/ jdou na web (V17): whitelist pro public/data při sestavení (scripts/vercel_build.sh)
i pro kopii webu v e2e testu (tests/e2e/check-web.mjs), aby test viděl totéž co Vercel.

Na web jdou jen soubory, které načítá JavaScript stránek (getJSON v public/), a soubory popsané na /otevrena-data
(build_pages.DATA_FILES). Ostatní data/ potřebují jen skripty při sestavení. Hlasování po jednom (votes/id/)
a duel (duel/) vytváří build_shards.py rovnou do public/data.

Použití:
    python scripts/public_data.py public/data      # zkopíruje whitelist z data/
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

FILES = [
    "agenda.json",
    "agreement.json",
    "benchmarks.json",
    "categories.json",
    "category_stats.json",
    "decisive.json",
    "delegations.json",
    "duel.json",
    "freshness.json",
    "group_web.json",
    "groups.json",
    "meps.json",
    "overview.json",
    "parties.json",
    "quiz.json",
    "quiz_groups.json",
    "quiz_summaries.json",
    "session.json",
    "splits.json",
    "vote_cats.json",
    "vote_roles.json",
    "work.json",
    "work_hub.json",
    "manual/search_synonyms.json",
    "votes/index.json",
    "votes/search.json",
    "votes/search-final.json",
]
DIRS = ["meps", "parties", "eugroups"]


def copy(data_dir: Path, out: Path) -> int:
    n = 0
    for rel in FILES:
        src = data_dir / rel
        if not src.exists():
            raise SystemExit(f"public_data: chybí {src} (spusť build_web.py)")
        (out / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, out / rel)
        n += 1
    for d in DIRS:
        for src in sorted((data_dir / d).glob("*.json")):
            (out / d).mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out / d / src.name)
            n += 1
    return n


def main(argv=None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    root = Path(__file__).resolve().parent.parent
    out = Path(args[0]) if args else root / "public" / "data"
    n = copy(root / "data", out)
    print(f"public_data: {n} souborů do {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
