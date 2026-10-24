"""Spike PN: plenární PN z EP Open Data API přes zprávy A10, které mění.

Jeden dotaz na dokument: `plenary-documents/{id}` vrací v `inverse_foresees_change_of` všechny jeho PN
i s titulkem, kde jsou jména autorů ("Pozměňovací návrh 001-005 - Jméno, Jméno - Zpráva …").
Seznam dokumentů bere z data/proposals_state.json. Jen průzkum, výstup do OUT_DIR/am_by_doc.jsonl.

    python scratch/pn_ep_reports.py OUT_DIR
"""

from __future__ import annotations

import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

API = "https://data.europarl.europa.eu/api/v2"
FMT = {"format": "application/ld+json"}
ROOT = Path(__file__).resolve().parent.parent
MIN_GAP = 0.65  # ~460 dotazů za 5 minut, pod limitem EP 500
_lock = threading.Lock()
_last = [0.0]


def throttle() -> None:
    with _lock:
        wait = _last[0] + MIN_GAP - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()


def fetch(doc_id: str) -> dict:
    for attempt in range(10):
        throttle()
        try:
            r = requests.get(f"{API}/plenary-documents/{doc_id}", params=FMT, timeout=120)
        except requests.RequestException:
            time.sleep(3)
            continue
        if r.status_code == 404:
            return {"doc": doc_id, "status": 404, "amendments": []}
        if r.status_code == 200:
            d = r.json()["data"][0]
            ams = [
                {
                    "id": a.get("identifier"),
                    "date": a.get("document_date"),
                    "begin": a.get("itemNumberBegin"),
                    "end": a.get("itemNumberEnd"),
                    "title_cs": (a.get("title_dcterms") or {}).get("cs"),
                    "title_en": (a.get("title_dcterms") or {}).get("en"),
                }
                for a in d.get("inverse_foresees_change_of") or []
                if str(a.get("work_type", "")).endswith("AMENDMENT_LIST")
            ]
            return {"doc": doc_id, "status": 200, "amendments": ams}
        time.sleep(1 + attempt)
    return {"doc": doc_id, "status": "failed", "amendments": []}


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    state = json.loads((ROOT / "data" / "proposals_state.json").read_text(encoding="utf-8"))
    # PN k návrhům usnesení (B10, RC) nemají v titulku autory (ověřeno), jmenovitě jen zprávy A10
    docs = [k for k in state["documents"] if k.startswith("A-")]
    path = out / "am_by_doc.jsonl"
    done = {json.loads(line)["doc"] for line in path.open()} if path.exists() else set()
    todo = [d for d in docs if d not in done]
    print("dokumentů", len(docs), "zbývá", len(todo), file=sys.stderr, flush=True)
    with path.open("a", encoding="utf-8") as f, ThreadPoolExecutor(3) as ex:
        for n, res in enumerate(ex.map(fetch, todo)):
            f.write(json.dumps(res, ensure_ascii=False) + "\n")
            f.flush()
            if n % 50 == 0:
                print(n, file=sys.stderr, flush=True)
    print("hotovo", file=sys.stderr)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
