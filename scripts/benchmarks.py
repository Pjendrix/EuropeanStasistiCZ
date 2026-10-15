"""Srovnání s celým EP: mediány docházky a loajality k frakci přes všechny poslance (R8).

Bez pořadí a žebříčků, jen mediány celého EP a každé frakce. Počítá se ze stejného exportu
HowTheyVote jako české metriky a stejnými pravidly (compute_stats.group_majority, závěrečná hlasování
podle vote_kinds). Rozdíl: u poslanců jiných států nemáme mandáty z EP API, proto se počítají
všechna hlasování, ve kterých je HowTheyVote vede (u Čechů jen hlasování v době mandátu podle EP).
Do mediánu se berou jen poslanci (u frakce poslanec v dané frakci) s aspoň MIN_VOTES hlasováními.

Vstup: řádky (vote_id, member_id, position, group_code) za všechny poslance, group_counts a množina
ID závěrečných hlasování. Výstup: malý slovník pro data/benchmarks.json.
"""

from __future__ import annotations

from collections import defaultdict
from statistics import median

from compute_stats import VOTED, group_majority

MIN_VOTES = 100
METRICS = ["attendance", "attendance_main", "group_loyalty"]

DEFINITION = (
    "Medián EP a medián frakce: prostřední hodnota přes všechny poslance EP (nebo poslance dané frakce), kteří mají "
    f"v datech HowTheyVote aspoň {MIN_VOTES} hlasování. Počítá se stejně jako u českých poslanců (docházka, "
    "docházka u závěrečných hlasování, loajalita k frakci k datu hlasování), jen u poslanců jiných států se berou "
    "všechna hlasování, ve kterých je HowTheyVote vede. Pořadí poslanců v celém EP záměrně neuvádíme."
)


def _empty() -> dict[str, list[int]]:
    return {m: [0, 0] for m in METRICS}


def compute_benchmarks(rows, group_counts: dict[int, dict[str, list[int]]], final_ids: set[int],
                       min_votes: int = MIN_VOTES) -> dict:
    """rows: iterovatelné (vote_id, member_id, position, group_code)."""
    by_member: dict[int, dict] = defaultdict(_empty)
    by_member_group: dict[tuple[int, str], dict] = defaultdict(_empty)
    for vote_id, member_id, position, group in rows:
        voted = position in VOTED
        final = vote_id in final_ids
        targets = [by_member[member_id]]
        if group:
            targets.append(by_member_group[(member_id, group)])
        gm = group_majority(group_counts.get(vote_id, {}), group)
        for t in targets:
            t["attendance"][0] += voted
            t["attendance"][1] += 1
            if final:
                t["attendance_main"][0] += voted
                t["attendance_main"][1] += 1
            if voted and gm is not None:
                t["group_loyalty"][0] += position == gm
                t["group_loyalty"][1] += 1

    def medians(items: list[dict]) -> dict:
        items = [x for x in items if x["attendance"][1] >= min_votes]
        out = {"meps": len(items)}
        for m in METRICS:
            vals = [x[m][0] / x[m][1] for x in items if x[m][1]]
            out[m] = round(median(vals), 4) if vals else None
        return out

    groups: dict[str, list[dict]] = defaultdict(list)
    for (_, group), st in by_member_group.items():
        groups[group].append(st)
    return {
        "min_votes": min_votes,
        "definition": DEFINITION,
        "ep": medians(list(by_member.values())),
        "groups": {g: medians(items) for g, items in sorted(groups.items())},
    }
