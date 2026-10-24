"""Spike PN: výborové PN po skončení dumpu Parltracku z oficiálních DOCX EP.

Vstup: seznam ID z scratch/pn_ep_list.py (am_list.json). Výborové dokumenty mají tvar {VÝBOR}-AM-{číslo};
ty, které už pokrývá Parltrack (pole src), se přeskočí. Počítá podpisy Čechů v době mandátu, zvlášť „sám“ a „za frakci“.
Jen průzkum, výstup do OUT_DIR.

    python scratch/pn_committee_docx.py AM_LIST_JSON PARLTRACK_DUMP OUT_DIR
"""

from __future__ import annotations

import collections
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pn_docx import FormatError, download, parse  # noqa: E402
from pn_probe import records  # noqa: E402
from pn_spike import fold, in_mandate, load_meps  # noqa: E402

COMMITTEE_DOC = re.compile(r"^[A-Z0-9]{4}-AM-\d+$")  # výbory (AGRI) i společné výbory (CJ71)


def parltrack_docs(dump: Path) -> set[str]:
    out = set()
    for r in records(dump):
        m = re.search(r"/([A-Z0-9]+-AM-\d+)_", r.get("src") or "")
        if m:
            out.add(m.group(1))
    return out


def iso(day: str | None) -> str | None:
    """'20.1.2026' (hlavička DOCX) → '2026-01-20'."""
    try:
        return datetime.strptime(day.strip(), "%d.%m.%Y").date().isoformat() if day else None
    except ValueError:
        return None


def main(am_list: Path, dump: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    ids = [i for i in json.loads(am_list.read_text()) if COMMITTEE_DOC.match(i)]
    known = parltrack_docs(dump)
    todo = [i for i in ids if i not in known]
    print(f"výborových AM dokumentů {len(ids)}, z toho v Parltracku {len(ids) - len(todo)}, ke zpracování {len(todo)}", file=sys.stderr)
    meps = {m["id"]: m for m in load_meps()}
    names = {fold(f"{m['given_name']} {m['family_name']}"): mid for mid, m in meps.items()}
    total, sole, group = collections.Counter(), collections.Counter(), collections.Counter()
    dossiers = collections.defaultdict(set)
    days, errors, n_am = [], [], 0
    for n, doc_id in enumerate(todo):
        try:
            d = parse(download(out / "cache", doc_id))
        except Exception as e:  # noqa: BLE001 – průzkum: chybu zapsat a pokračovat
            errors.append(f"{doc_id}: {e}")
            continue
        finally:
            time.sleep(0.5)
        day = iso(d["date"])
        if not day:
            errors.append(f"{doc_id}: datum {d['date']!r}")
            continue
        days.append(day)
        for a in d["amendments"]:
            n_am += 1
            people = {names[fold(p)] for p in a["members"] if fold(p) in names}
            for mid in people:
                if not in_mandate(meps[mid], day):
                    continue
                total[mid] += 1
                dossiers[mid].add(d["procedure"])
                if len(a["members"]) == 1:
                    sole[mid] += 1
                if a["on_behalf"]:
                    group[mid] += 1
        if n % 50 == 0:
            print(n, file=sys.stderr, flush=True)
    summary = {
        "docs": len(todo),
        "amendments": n_am,
        "errors": errors[:20],
        "n_errors": len(errors),
        "date_min": min(days) if days else None,
        "date_max": max(days) if days else None,
        "rows": {
            str(mid): {"name": f"{m['given_name']} {m['family_name']}", "total": total[mid], "sole": sole[mid], "on_behalf": group[mid], "dossiers": len(dossiers[mid])}
            for mid, m in meps.items()
        },
    }
    (out / "committee_docx.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "rows"}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(*(Path(a) for a in sys.argv[1:4]))
