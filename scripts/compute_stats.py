"""Spočítá statistiky českých poslanců z data/meps.json a data/votes/*.json.

Výstup:
  data/stats.json    metriky na poslance, celkem i po měsících (vždy jako počty x z y)
  data/groups.json   frakce (kód HowTheyVote, kód EP, názvy, barva, logo)
  data/parties.json  české strany (ID organizace v EP, zkratka, název, barva, logo)

Ruční údaje (barvy, případně cesty k logům) jsou v data/manual/colors.json. Skript je
jen načte a přimíchá, soubor nikdy nepřepisuje.

Všechny metriky jsou čisté deterministické funkce bez odhadů. Definice jsou v DEFINITIONS
a ukládají se i do stats.json, aby je web mohl zobrazit.

Použití:
    python scripts/compute_stats.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

POSITIONS = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"]
VOTED = {"FOR", "AGAINST", "ABSTENTION"}
NO_GROUP = {None, "NI"}  # nezařazení nejsou frakce, loajalita se nepočítá

DEFINITIONS = {
    "attendance": "Podíl jmenovitých hlasování, ve kterých poslanec hlasoval (pro, proti nebo se zdržel). "
                  "Počítají se jen hlasování v době jeho mandátu podle EP.",
    "attendance_main": "Docházka jen u hlavních (závěrečných) hlasování o celém textu.",
    "group_loyalty": "Podíl hlasování, kde poslanec hlasoval stejně jako většina jeho frakce (k datu hlasování). "
                     "Počítá se jen tam, kde hlasoval a frakce měla jednoznačnou většinu (pro / proti / zdržet se). "
                     "Nezařazení (NI) se nepočítají.",
    "cz_agreement": "Podíl hlasování, kde poslanec hlasoval stejně jako většina ostatních českých poslanců, kteří hlasovali. "
                    "Bez hlasování s nerozhodnou většinou.",
    "pairwise": "Shoda dvou poslanců: podíl hlasování, kde oba hlasovali a hlasovali stejně.",
}


class FormatError(RuntimeError):
    """Vstupní data nemají očekávaný formát."""


def require(obj, keys, where):
    missing = [k for k in keys if not isinstance(obj, dict) or k not in obj]
    if missing:
        raise FormatError(f"{where}: chybí pole {missing}")


def in_mandate(mandates: list[dict], date: str) -> bool:
    return any(m["start"] <= date and (m["end"] is None or date <= m["end"]) for m in mandates)


def majority(counts: dict[str, int]) -> str | None:
    """Jednoznačně nejčastější z pro / proti / zdržet se; při remíze nebo bez hlasů None."""
    best = max((counts.get(p, 0) for p in VOTED), default=0)
    if best == 0:
        return None
    winners = [p for p in VOTED if counts.get(p, 0) == best]
    return winners[0] if len(winners) == 1 else None


def group_majority(group_counts: dict[str, list[int]], group: str | None) -> str | None:
    if group in NO_GROUP or group not in group_counts:
        return None
    row = group_counts[group]
    return majority(dict(zip(POSITIONS, row)))


def empty_metrics() -> dict:
    return {
        "attendance": [0, 0],
        "attendance_main": [0, 0],
        "group_loyalty": [0, 0],
        "cz_agreement": [0, 0],
        "positions": {p: 0 for p in POSITIONS},
    }


def add_vote(metrics: dict, vote: dict, pos: dict, others: list[str]) -> None:
    """Započte jedno hlasování jednoho poslance. others = pozice ostatních Čechů v mandátu."""
    position = pos["position"]
    voted = position in VOTED
    metrics["positions"][position] += 1
    metrics["attendance"][1] += 1
    metrics["attendance"][0] += voted
    if vote["is_main"]:
        metrics["attendance_main"][1] += 1
        metrics["attendance_main"][0] += voted
    if not voted:
        return
    gm = group_majority(vote["group_counts"], pos["group_code"])
    if gm is not None:
        metrics["group_loyalty"][1] += 1
        metrics["group_loyalty"][0] += position == gm
    cm = majority(Counter(p for p in others if p in VOTED))
    if cm is not None:
        metrics["cz_agreement"][1] += 1
        metrics["cz_agreement"][0] += position == cm


def compute(meps: list[dict], votes: list[dict]) -> dict:
    by_id = {m["id"]: m for m in meps}
    total = {i: empty_metrics() for i in by_id}
    monthly: dict[int, dict[str, dict]] = {i: {} for i in by_id}
    pairwise: dict[int, dict[int, list[int]]] = {i: defaultdict(lambda: [0, 0]) for i in by_id}
    unknown = set()

    for vote in votes:
        require(vote, ["id", "date", "is_main", "group_counts", "cz_positions"], f"hlasování {vote.get('id')}")
        active = []
        for p in vote["cz_positions"]:
            m = by_id.get(p["member_id"])
            if m is None:
                unknown.add(p["member_id"])
                continue
            if in_mandate(m["mandates"], vote["date"]):
                active.append(p)
        month = vote["date"][:7]
        for p in active:
            others = [o["position"] for o in active if o is not p]
            add_vote(total[p["member_id"]], vote, p, others)
            add_vote(monthly[p["member_id"]].setdefault(month, empty_metrics()), vote, p, others)
        voted = [p for p in active if p["position"] in VOTED]
        for a in voted:
            for b in voted:
                if a is not b:
                    cell = pairwise[a["member_id"]][b["member_id"]]
                    cell[1] += 1
                    cell[0] += a["position"] == b["position"]

    if unknown:
        raise FormatError(f"hlasování obsahují poslance, kteří nejsou v meps.json: {sorted(unknown)}")
    return {
        str(i): {
            "total": total[i],
            "monthly": dict(sorted(monthly[i].items())),
            "pairwise": {str(k): v for k, v in sorted(pairwise[i].items())},
        }
        for i in sorted(by_id)
    }


def derive_group_codes(meps: list[dict], votes: list[dict]) -> dict[str, str]:
    """Párování kódů frakcí HowTheyVote -> EP podle toho, v jaké frakci poslanec v den hlasování byl
    v obou zdrojích. Bere se jen jednoznačné párování."""
    by_id = {m["id"]: m for m in meps}
    pairs: dict[str, Counter] = defaultdict(Counter)
    for vote in votes:
        for p in vote["cz_positions"]:
            m = by_id.get(p["member_id"])
            if not m or p["group_code"] is None:
                continue
            ep = [g["code"] for g in m["groups"]
                  if g["start"] <= vote["date"] and (g["end"] is None or vote["date"] <= g["end"])]
            if len(ep) == 1:
                pairs[p["group_code"]][ep[0]] += 1
    return {htv: c.most_common(1)[0][0] for htv, c in pairs.items() if len(c) == 1}


def find_logo(assets: Path, kind: str, key: str) -> str | None:
    for ext in ("svg", "png", "jpg", "webp"):
        if (assets / "logos" / kind / f"{key}.{ext}").exists():
            return f"assets/logos/{kind}/{key}.{ext}"
    return None


COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def load_manual(path: Path) -> dict:
    """data/manual/colors.json: {"groups": {kód: {"color", "logo"}}, "parties": {id: {...}}}.
    Chybějící soubor = žádné ruční údaje."""
    if not path.exists():
        return {"groups": {}, "parties": {}}
    manual = json.loads(path.read_text(encoding="utf-8"))
    require(manual, ["groups", "parties"], str(path))
    for kind in ("groups", "parties"):
        for key, entry in manual[kind].items():
            if not isinstance(entry, dict):
                raise FormatError(f"{path}: {kind}.{key} musí být objekt")
            color = entry.get("color")
            if color is not None and not COLOR_RE.match(color):
                raise FormatError(f"{path}: {kind}.{key}.color '{color}' není ve tvaru #RRGGBB")
            logo = entry.get("logo")
            if logo is not None and not isinstance(logo, str):
                raise FormatError(f"{path}: {kind}.{key}.logo musí být text nebo null")
    return manual


def build_groups(index_groups: list[dict], meps: list[dict], votes: list[dict], assets: Path,
                 manual: dict | None = None) -> list[dict]:
    manual = (manual or {}).get("groups", {})
    mapping = derive_group_codes(meps, votes)
    names_cs = {g["code"]: g["name_cs"] for m in meps for g in m["groups"]}
    out = []
    for g in index_groups:
        ep_code = mapping.get(g["code"])
        out.append({
            "code": g["code"],
            "ep_code": ep_code,
            "short_label": g["short_label"],
            "label": g["label"],
            "name_cs": names_cs.get(ep_code),
            "color": manual.get(g["code"], {}).get("color"),
            "logo": manual.get(g["code"], {}).get("logo") or find_logo(assets, "ep", g["code"]),
        })
    return out


def build_parties(meps: list[dict], assets: Path, manual: dict | None = None) -> list[dict]:
    manual = (manual or {}).get("parties", {})
    parties = {}
    for m in meps:
        for p in m["parties"]:
            parties[p["org_id"]] = {
                "id": int(p["org_id"]),
                "short_label": p["short_label"],
                "name": p["name"],
                "color": manual.get(p["org_id"], {}).get("color"),
                "logo": manual.get(p["org_id"], {}).get("logo") or find_logo(assets, "cz", p["org_id"]),
            }
    return [parties[k] for k in sorted(parties, key=int)]


def load_votes(votes_dir: Path) -> tuple[dict, list[dict]]:
    index_path = votes_dir / "index.json"
    if not index_path.exists():
        raise FormatError(f"chybí {index_path}, spusť nejdřív fetch_votes.py")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    require(index, ["months", "groups", "source"], "votes/index.json")
    votes = []
    for m in index["months"]:
        data = json.loads((votes_dir / f"{m['month']}.json").read_text(encoding="utf-8"))
        require(data, ["votes"], f"votes/{m['month']}.json")
        votes.extend(data["votes"])
    return index, votes


def run(data_dir: Path, assets: Path) -> dict:
    meps_doc = json.loads((data_dir / "meps.json").read_text(encoding="utf-8"))
    require(meps_doc, ["meps", "source"], "meps.json")
    for m in meps_doc["meps"]:
        require(m, ["id", "mandates", "groups", "parties"], f"meps.json poslanec {m.get('id')}")
    index, votes = load_votes(data_dir / "votes")
    meps = meps_doc["meps"]
    stats = {
        "sources": {"votes": index["source"], "meps": meps_doc["source"]},
        "period": {"from": min(v["date"] for v in votes), "to": max(v["date"] for v in votes)} if votes else None,
        "votes_total": len(votes),
        "definitions": DEFINITIONS,
        "meps": compute(meps, votes),
    }
    write = lambda name, obj: (data_dir / name).write_text(
        json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    write("stats.json", stats)
    manual = load_manual(data_dir / "manual" / "colors.json")
    write("groups.json", build_groups(index["groups"], meps, votes, assets, manual))
    write("parties.json", build_parties(meps, assets, manual))
    return stats


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=root / "data")
    p.add_argument("--assets", type=Path, default=root / "public" / "assets")
    args = p.parse_args(argv)
    try:
        stats = run(args.data_dir, args.assets)
    except FormatError as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    print(f"statistiky pro {len(stats['meps'])} poslanců z {stats['votes_total']} hlasování", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
