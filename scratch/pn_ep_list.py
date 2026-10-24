"""Spike PN: vypíše seznam plenárních PN (work-type AMENDMENT_LIST) z EP Open Data API a volitelně jejich detaily.

Jen průzkum, výstup do adresáře z argumentu (ne do data/). Throttling: nejvýš ~90 dotazů za minutu (limit EP 500/5 min).

    python scratch/pn_ep_list.py OUT_DIR            # seznam ID
    python scratch/pn_ep_list.py OUT_DIR --details  # + detail každého dokumentu 10. období (titulek, datum)
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

API = "https://data.europarl.europa.eu/api/v2"
FMT = {"format": "application/ld+json"}
PAUSE = 0.7
PAGE = 10


def get(s: requests.Session, path: str, params: dict) -> dict | None:
    # EP API vrací 500 (OutOfMemory) nahodile i u malých stránek, opakování obvykle projde
    for attempt in range(12):
        try:
            r = s.get(f"{API}/{path}", params={**params, **FMT}, timeout=120)
        except requests.RequestException:
            time.sleep(3)
            continue
        time.sleep(PAUSE)
        if r.status_code == 204:
            return None
        if r.status_code == 200:
            return r.json()
        print("retry", r.status_code, path, params.get("offset", ""), file=sys.stderr, flush=True)
        time.sleep(1 + attempt)
    raise SystemExit(f"EP API: {path} {params} selhalo 12×")


def main(out: Path, details: bool) -> None:
    out.mkdir(parents=True, exist_ok=True)
    lst = out / "am_list.json"
    with requests.Session() as s:
        if lst.exists():
            ids = json.loads(lst.read_text())
        else:
            # API při stránce nad ~10 položek padá na 500 (OutOfMemory v SPARQL), proto po letech a po 10
            ids = []
            for year in (2024, 2025, 2026):
                off = 0
                while True:
                    d = get(s, "documents", {"work-type": "AMENDMENT_LIST", "year": year, "limit": PAGE, "offset": off})
                    page = [x["identifier"] for x in (d or {}).get("data", [])]
                    ids += page
                    if off % 100 == 0:
                        print(year, off, len(ids), file=sys.stderr, flush=True)
                    if len(page) < PAGE:
                        break
                    off += PAGE
            lst.write_text(json.dumps(ids))
        print("AMENDMENT_LIST celkem", len(ids), file=sys.stderr)
        if not details:
            return
        det = out / "am_details.jsonl"
        done = {json.loads(line)["identifier"] for line in det.open()} if det.exists() else set()
        todo = [i for i in ids if "-10-" in i and i not in done]
        print("detailů ke stažení", len(todo), file=sys.stderr)
        with det.open("a") as f:
            for n, i in enumerate(todo):
                d = get(s, f"documents/{i}", {})
                x = (d or {}).get("data", [{}])[0]
                t = x.get("title_dcterms") or {}
                f.write(json.dumps({
                    "identifier": i,
                    "date": x.get("document_date"),
                    "pe": x.get("epNumber"),
                    "begin": x.get("itemNumberBegin"),
                    "end": x.get("itemNumberEnd"),
                    "title_en": t.get("en"),
                    "title_cs": t.get("cs"),
                    "title_any": next(iter(t.values()), None),
                }, ensure_ascii=False) + "\n")
                if n % 200 == 0:
                    print(n, file=sys.stderr)
                    f.flush()


if __name__ == "__main__":
    main(Path(sys.argv[1]), "--details" in sys.argv)
