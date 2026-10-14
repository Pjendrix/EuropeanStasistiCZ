"""Vlastní práce poslanců: položky z data/proposals.json spojené s výsledky hlasování z HowTheyVote.

Čisté funkce bez síťových dotazů; volá je compute_stats.py.

Typy (TYPE_LABELS) a stavy (STATUS):
  ADOPTED / REJECTED / LAPSED / WITHDRAWN  výsledek posledního hlavního hlasování o textu
  superseded   samostatný návrh usnesení nahradil společný návrh (o tom se hlasovalo)
  no_vote      v datech HowTheyVote k textu není hlavní jmenovité hlasování (ještě neproběhlo, nebo se
               hlasovalo jinak než jmenovitě, např. tajně u jmenování)
  answered / unanswered   otázky: zda přišla odpověď
  None         výsledek se nesleduje (stanoviska výborů)
Výsledek se počítá jen tam, kde je známý, vždy po typech zvlášť.
"""

from __future__ import annotations

TYPE_LABELS = {
    "report": "Zprávy (zpravodaj/ka)",
    "shadow_report": "Stínové zprávy",
    "opinion": "Stanoviska výborů (zpravodaj/ka)",
    "shadow_opinion": "Stínová stanoviska",
    "motion": "Návrhy usnesení",
    "joint_motion": "Společné návrhy usnesení",
    "question": "Otázky Komisi a Radě",
}
VOTED = {"ADOPTED", "REJECTED"}


def htv_reference(doc_id: str, label: str | None) -> str | None:
    """Reference hlasování v HowTheyVote: A10-0142/2025, B10-0156/2025, RC-B10-0156/2025."""
    if doc_id.startswith("RC-"):
        parts = doc_id.split("-")  # RC-10-2025-0156
        return f"RC-B{parts[1]}-{parts[3]}/{parts[2]}" if len(parts) == 4 else None
    return label


def main_votes_by_reference(votes: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for v in votes:
        if v["is_main"] and v.get("reference"):
            out.setdefault(v["reference"], []).append(v)
    for lst in out.values():
        lst.sort(key=lambda v: (v.get("timestamp") or v["date"], v["id"]))
    return out


def vote_status(reference: str | None, by_ref: dict) -> tuple[str, int | None, str | None]:
    """(stav, ID hlasování, datum) podle posledního hlavního hlasování o textu."""
    lst = by_ref.get(reference) if reference else None
    if not lst:
        return "no_vote", None, None
    last = lst[-1]
    return (last.get("result") or "no_vote"), last["id"], last["date"]


def link(proposals: list[dict], documents: dict, votes: list[dict]) -> dict[int, list[dict]]:
    """Vrací {mep_id: [položky vlastní práce s typem, rolí a stavem]}."""
    by_ref = main_votes_by_reference(votes)
    reports_by_proc: dict[str, list[tuple[str, dict]]] = {}
    superseded_by: dict[str, str] = {}
    for doc_id, meta in documents.items():
        if meta.get("kind") == "report" and meta.get("procedure"):
            reports_by_proc.setdefault(meta["procedure"], []).append((doc_id, meta))
        if meta.get("kind") == "joint_motion":
            for b in meta.get("derived_from") or []:
                superseded_by[b] = doc_id

    def report_status(proc: str | None):
        """Stav zprávy z procedury: poslední zpráva, ke které existuje hlavní hlasování."""
        best = ("no_vote", None, None, None)
        for doc_id, meta in sorted(reports_by_proc.get(proc, []), key=lambda x: x[1].get("date") or ""):
            st = vote_status(htv_reference(doc_id, meta.get("label")), by_ref)
            if st[0] != "no_vote" or best[3] is None:
                best = (*st, meta.get("label"))
        return best

    out: dict[int, list[dict]] = {}

    def add(mep_id, entry):
        out.setdefault(mep_id, []).append(entry)

    report_procs: dict[int, set] = {}
    for item in proposals:
        base = {"id": item["id"], "label": item.get("label"), "date": item.get("date"), "title": item.get("title"),
                "url": item.get("url")}
        kind = item["kind"]
        if kind in ("report", "motion", "joint_motion"):
            status, vote_id, vote_date = vote_status(htv_reference(item["id"], item.get("label")), by_ref)
            extra = {}
            if kind == "motion" and status == "no_vote" and item["id"] in superseded_by:
                rc = superseded_by[item["id"]]
                rc_status, rc_vote, _ = vote_status(htv_reference(rc, None), by_ref)
                if rc_status != "no_vote":
                    status, extra = "superseded", {"joint_motion": rc, "joint_result": rc_status, "joint_vote_id": rc_vote}
            for p in item["participants"]:
                if kind == "report":
                    report_procs.setdefault(p["mep_id"], set()).add(item.get("procedure"))
                add(p["mep_id"], {**base, "type": kind, "role": p["role"], "status": status, "vote_id": vote_id,
                                  "vote_date": vote_date, "signatories_total": item.get("signatories_total"), **extra})
        elif kind == "procedure":
            for p in item["participants"]:
                role = p["role"]
                if role in ("RAPPORTEUR", "RAPPORTEUR_CO"):
                    if item["procedure"] in report_procs.get(p["mep_id"], set()):
                        continue  # zpráva už je započtená z dokumentu
                    typ = "report"
                elif role == "RAPPORTEUR_SHADOW":
                    typ = "shadow_report"
                elif role == "RAPPORTEUR_OPINION":
                    typ = "opinion"
                elif role == "RAPPORTEUR_SHADOW_OPINION":
                    typ = "shadow_opinion"
                else:
                    continue
                if typ in ("report", "shadow_report"):
                    status, vote_id, vote_date, report_label = report_status(item["procedure"])
                else:
                    status, vote_id, vote_date, report_label = None, None, None, None
                add(p["mep_id"], {**base, "date": p.get("date") or item.get("date"), "type": typ, "role": role,
                                  "group": p.get("group"), "committee": p.get("in_name_of"), "status": status,
                                  "vote_id": vote_id, "vote_date": vote_date, "report": report_label})
        elif kind.startswith("question"):
            for p in item["participants"]:
                add(p["mep_id"], {**base, "type": "question", "subtype": kind, "role": p["role"],
                                  "status": "answered" if item.get("answer_date") else "unanswered",
                                  "answer_date": item.get("answer_date"), "authors_total": item.get("authors_total")})
    for lst in out.values():
        lst.sort(key=lambda e: (e.get("date") or "", e["id"]), reverse=True)
    return out


def summarize(entries: list[dict]) -> dict[str, dict]:
    """Souhrn po typech: počet, a kde je výsledek známý, kolik bylo hlasováno a přijato."""
    out = {}
    for typ in TYPE_LABELS:
        lst = [e for e in entries if e["type"] == typ]
        s = {"count": len(lst)}
        if typ == "question":
            s["answered"] = sum(e["status"] == "answered" for e in lst)
        elif typ in ("report", "shadow_report", "motion", "joint_motion"):
            s["voted"] = sum(e["status"] in VOTED for e in lst)
            s["adopted"] = sum(e["status"] == "ADOPTED" for e in lst)
            s["no_vote"] = sum(e["status"] == "no_vote" for e in lst)
            s["other"] = sum(e["status"] in ("LAPSED", "WITHDRAWN") for e in lst)
            if typ == "motion":
                s["superseded"] = sum(e["status"] == "superseded" for e in lst)
        out[typ] = s
    return out
