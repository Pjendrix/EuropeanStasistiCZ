"""Hlasování po jednom (audit A4): data/votes/{měsíc}.json → {out}/{id}.json pro interaktivní detail vote.html.

vote.html dřív stahoval celý měsíc (až 2,2 MB) a kvůli odkazu na závěrečné hlasování i search.json (1,7 MB),
přitom potřebuje jedno hlasování (≈ 7 kB). Soubory vznikají až při sestavení webu (scripts/vercel_build.sh),
do gitu nejdou (audit A6): obsah je jen jiný řez dat, která v gitu jsou.

Každý soubor: {"vote": hlasování s českým názvem a měsícem, "final_vote": závěrečné hlasování téže reference nebo null}.

Duel (část B): {duel_out}/{a}-{b}.json se všemi hlasováními, kde se dvojice rozešla (PRO / PROTI), pro odkaz
„všechna hlasování, kde se rozešli“ na duel.html (duel.pair_shards).

Použití:
    python scripts/build_shards.py                       # → public/data/votes/id/ a public/data/duel/
    python scripts/build_shards.py --out cesta/k/adresari
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from compute_stats import load_votes
from duel import pair_shards
from vote_kinds import is_final

ROOT = Path(__file__).resolve().parent.parent


def shards(votes: list[dict]) -> dict[int, dict]:
    """{id: obsah souboru}. U dílčích hlasování odkaz na poslední závěrečné hlasování téže reference (A10-…/B10-…)."""
    finals: dict[str, list[dict]] = {}
    for v in votes:
        if v.get("reference") and is_final(v):
            finals.setdefault(v["reference"], []).append(v)
    out = {}
    for v in votes:
        final = None
        if not is_final(v) and v.get("reference"):
            cands = sorted(finals.get(v["reference"], []), key=lambda x: (x["date"], x["id"]))
            if cands:
                f = cands[-1]
                final = {"id": f["id"], "date": f["date"], "month": f["date"][:7], "result": f.get("result")}
        out[v["id"]] = {"vote": {**v, "month": v["date"][:7]}, "final_vote": final}
    return out


def write(items: dict[int, dict], out_dir: Path) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    for vid, doc in items.items():
        (out_dir / f"{vid}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(items)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=ROOT / "data")
    p.add_argument("--out", type=Path, default=ROOT / "public" / "data" / "votes" / "id")
    p.add_argument("--duel-out", type=Path, default=ROOT / "public" / "data" / "duel")
    args = p.parse_args(argv)
    _, votes = load_votes(args.data_dir / "votes")
    n = write(shards(votes), args.out)
    print(f"hlasování po jednom: {n} souborů v {args.out}", file=sys.stderr)
    meps = json.loads((args.data_dir / "meps.json").read_text(encoding="utf-8"))["meps"]
    n = write(pair_shards(votes, meps), args.duel_out)
    print(f"duel: {n} dvojic v {args.duel_out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
