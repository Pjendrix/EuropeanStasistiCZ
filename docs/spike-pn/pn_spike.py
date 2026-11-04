"""Spike PN: počty pozměňovacích návrhů českých poslanců z Parltracku a EP API, párování s HowTheyVote.

Jen průzkum (zadání 24. 10. 2026, část A). Výstup do adresáře z argumentu, nic do data/.

    python docs/spike-pn/pn_spike.py DL_DIR HTV_DIR EP_DIR OUT_DIR

DL_DIR  dumpy Parltracku (ep_amendments.json.zst, ep_plenary_amendments.json.zst)
HTV_DIR export HowTheyVote (votes, amendment_authors_votes, amendment_urls .csv.gz)
EP_DIR  výstup docs/spike-pn/pn_ep_list.py (am_details.jsonl)
"""

from __future__ import annotations

import collections
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from pn_probe import records  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]  # docs/spike-pn/ → kořen repa
TERM_START = "2024-07-16"
TODAY = date.today().isoformat()


def load_meps() -> list[dict]:
    d = json.loads((ROOT / "data" / "meps.json").read_text(encoding="utf-8"))
    return d["meps"]


def in_mandate(mep: dict, day: str) -> bool:
    return any(m["start"] <= day and (m["end"] is None or day <= m["end"]) for m in mep["mandates"])


def fold(s: str) -> str:
    """Jméno bez diakritiky a velikosti písmen, pro porovnání s titulkem EP."""
    s = unicodedata.normalize("NFKD", s)
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).lower().split())


def committee(dl: Path, meps: dict[int, dict]) -> dict:
    """Výborové PN (ep_amendments): podepsal celkem / jako jediný autor, jen v době mandátu."""
    total, sole = collections.Counter(), collections.Counter()
    n10 = future = no_meps = group_auth = 0
    max_day = "0000"
    months = collections.Counter()
    dossiers = collections.defaultdict(set)
    for r in records(dl / "ep_amendments.json.zst"):
        day = (r.get("date") or "")[:10]
        if day < TERM_START:
            continue
        if day > TODAY:
            future += 1  # Parltrack má u části záznamů nesmyslný rok (2047, 2068…)
            continue
        n10 += 1
        max_day = max(max_day, day)
        months[day[:7]] += 1
        ids = r.get("meps") or []
        if not ids:
            no_meps += 1
        authors = r.get("authors") or ""
        if isinstance(authors, list):
            authors = ", ".join(map(str, authors))
        if re.search(r"on behalf of the .* group", authors, re.I):
            group_auth += 1
        for mid in set(ids):
            mep = meps.get(mid)
            if mep and in_mandate(mep, day):
                total[mid] += 1
                dossiers[mid].add(r.get("reference"))
                if len(set(ids)) == 1:
                    sole[mid] += 1
    return {
        "records_term10": n10,
        "future_dates_dropped": future,
        "without_meps": no_meps,
        "authors_on_behalf_of_group": group_auth,
        "coverage_max_date": max_day,
        "months": dict(sorted(months.items())),
        "total": total,
        "sole": sole,
        "dossiers": {k: len(v) for k, v in dossiers.items()},
    }


def plenary_parltrack(dl: Path) -> dict:
    """Plenární PN v Parltracku: kolik záznamů 10. období má autory (meps)."""
    n = with_meps = with_date = 0
    sources = collections.Counter()
    for r in records(dl / "ep_plenary_amendments.json.zst"):
        if "-10-" not in (r.get("adoc_src") or "") and "-10-" not in (r.get("src") or ""):
            continue
        n += 1
        with_meps += bool(r.get("meps"))
        with_date += bool(r.get("date"))
        sources[r.get("src_type")] += 1
    return {"records_term10": n, "with_meps": with_meps, "with_date": with_date, "src_type": dict(sources)}


AM = re.compile(r"^(Pozměňovací(ch)? návrh|Amendment)")
GROUP = re.compile(r"^(za skupinu|on behalf of the) (?P<g>.+?)( Group)?$")
GROUP_ALIASES = {"Pfe": "PfE", "Patrioti": "PfE", "EPP": "PPE", "Verts/ALE Group": "Verts/ALE"}


def classify(title: str) -> tuple[str, list[str], str | None]:
    """Titulek PN (cs) → (typ, jména, frakce).

    'A10-0031/2 - Pozměňovací návrh 2 - Jméno - za skupinu The Left - Zpráva …' → group (připisuje se frakci)
    'A10-0259/1 - Pozměňovací návrh 1 - Jméno, Jméno - Zpráva …'                 → members
    'Pozměňovací návrh 001-005 - Zpravodaj - Zpráva …'                            → committee (PN výboru)
    """
    parts = title.split(" - ")
    # reference bývá i "A10-0170/2025/9", "A10-0063/34/rev", "423/423"; EP občas píše "Pozměňovacích návrh"
    if len(parts) >= 4 and AM.match(parts[1]) and not AM.match(parts[0]):
        people = [p.strip() for p in parts[2].split(",") if p.strip()]
        nxt = parts[3].strip()
        g = GROUP.match(nxt)
        if g:
            return "group", people, GROUP_ALIASES.get(g.group("g").strip(), g.group("g").strip())
        if re.match(r"^(za |on behalf of the )?(Výbor|Committee)", nxt):  # předkládá zpravodaj/předseda za výbor
            return "committee", people, None
        return "members", people, None
    if parts and AM.match(parts[0]):
        return "committee", [], None
    return "unknown", [], None


def plenary_ep(ep_dir: Path, meps: dict[int, dict]) -> dict:
    """Plenární PN ke zprávám A10 z EP API: autoři z titulku (cs), párování na Čechy přesnou shodou jména."""
    path = ep_dir / "am_by_doc.jsonl"
    if not path.exists():
        return {"available": False}
    names = {fold(f"{m['given_name']} {m['family_name']}"): mid for mid, m in meps.items()}
    total, sole, presented = collections.Counter(), collections.Counter(), collections.Counter()
    kinds_docs, kinds_items = collections.Counter(), collections.Counter()
    group_items = collections.Counter()
    unknown: list[str] = []
    reports = failed = 0
    max_day = "0000"
    per_doc: list[dict] = []
    for line in path.open(encoding="utf-8"):
        r = json.loads(line)
        reports += 1
        failed += r["status"] != 200
        for d in r["amendments"]:
            kind, people, group = classify(d.get("title_cs") or d.get("title_en") or "")  # pár PN nemá český titulek
            b, e = d.get("begin"), d.get("end")
            n_items = e - b + 1 if b and e else 1
            kinds_docs[kind] += 1
            kinds_items[kind] += n_items
            day = d.get("date") or ""
            max_day = max(max_day, day)
            if kind == "unknown" and len(unknown) < 5:
                unknown.append((d.get("title_cs") or d["id"])[:200])
            hits = [names[fold(p)] for p in people if fold(p) in names]
            hits = [mid for mid in set(hits) if in_mandate(meps[mid], day)]
            if kind == "group":
                group_items[group] += n_items
                for mid in hits:  # předkládá za frakci, nepřipisuje se mu
                    presented[mid] += n_items
            elif kind == "members":
                for mid in hits:
                    total[mid] += n_items
                    if len(people) == 1:
                        sole[mid] += n_items
            per_doc.append({"id": d["id"], "items": n_items, "kind": kind, "cz": hits})
    return {
        "available": True,
        "reports": reports,
        "reports_failed": failed,
        "am_docs_by_kind": dict(kinds_docs),
        "am_items_by_kind": dict(kinds_items),
        "unknown_examples": unknown,
        "group_items": dict(group_items.most_common()),
        "coverage_max_date": max_day,
        "total": total,
        "sole": sole,
        "presented_for_group": presented,
        "per_doc": per_doc,
    }


def htv_match(htv: Path, ep: dict) -> dict:
    """Plenární PN ↔ hlasování HowTheyVote přes URL PN (A-10-…-AM-xxx-yyy) a číslo PN."""
    votes = pd.read_csv(htv / "votes.csv.gz", usecols=["id", "timestamp", "result", "amendment_number"])
    urls = pd.read_csv(htv / "amendment_urls.csv.gz")
    auth = pd.read_csv(htv / "amendment_authors_votes.csv.gz")
    urls["doc"] = urls["url"].str.extract(r"/document/([A-Z]+-10-[\d\-]+-AM-\d+-\d+)_")[0]
    u10 = urls.dropna(subset=["doc"]).merge(votes, left_on="vote_id", right_on="id")
    out = {
        "htv_amendment_votes_term10": int(u10["vote_id"].nunique()),
        "htv_author_types_term10": auth[auth["vote_id"].isin(u10["vote_id"])]["author_type"].value_counts().to_dict(),
    }
    if not ep.get("available"):
        return out
    voted_docs = set(u10["doc"])
    member = [d for d in ep["per_doc"] if d["kind"] == "members"]
    cz = [d for d in member if d["cz"]]
    out.update({
        "ep_member_docs": len(member),
        "ep_member_docs_with_rcv": sum(d["id"] in voted_docs for d in member),
        "ep_cz_docs": len(cz),
        "ep_cz_docs_with_rcv": sum(d["id"] in voted_docs for d in cz),
        "ep_cz_results": u10[u10["doc"].isin({d["id"] for d in cz})]["result"].value_counts().to_dict(),
    })
    return out


def main(dl: Path, htv: Path, ep_dir: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    meps = {m["id"]: m for m in load_meps()}
    com = committee(dl, meps)
    plp = plenary_parltrack(dl)
    ple = plenary_ep(ep_dir, meps)
    match = htv_match(htv, ple)
    rows = []
    for mid, m in sorted(meps.items(), key=lambda kv: kv[1]["sort_label"]):
        mand = m["mandates"]
        rows.append({
            "id": mid,
            "name": f"{m['given_name']} {m['family_name']}",
            "mandate": f"{mand[0]['start']}–{mand[-1]['end'] or ''}",
            "com_total": com["total"].get(mid, 0),
            "com_sole": com["sole"].get(mid, 0),
            "com_dossiers": com["dossiers"].get(mid, 0),
            "pl_total": ple["total"].get(mid, 0) if ple.get("available") else None,
            "pl_sole": ple["sole"].get(mid, 0) if ple.get("available") else None,
            "pl_for_group": ple["presented_for_group"].get(mid, 0) if ple.get("available") else None,
        })
    summary = {
        "committee": {k: v for k, v in com.items() if k not in ("total", "sole", "dossiers")},
        "plenary_parltrack": plp,
        "plenary_ep": {k: v for k, v in ple.items() if k not in ("total", "sole", "presented_for_group", "per_doc")},
        "htv": match,
        "rows": rows,
    }
    (out / "pn_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}, ensure_ascii=False, indent=1)[:4000])
    for r in rows:
        print(r)


if __name__ == "__main__":
    main(*(Path(a) for a in sys.argv[1:5]))
