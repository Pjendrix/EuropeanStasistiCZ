"""Spike PN: autoři PN ve výborech z oficiálního DOCX EP (značky <NumAm>, <Members>, <AuNomDe>).

DOCX bere z distribuce EP Open Data (stejná cesta, jakou vrací API v `is_exemplified_by`):
https://data.europarl.europa.eu/distribution/reds_iCmDoc_Amd/{ID}/{ID}_en.docx

    python scratch/pn_docx.py CACHE_DIR ID [ID …]   # vypíše PN a autory
"""

from __future__ import annotations

import html
import re
import sys
import zipfile
from pathlib import Path

import requests

DIST = "https://data.europarl.europa.eu/distribution/reds_iCmDoc_Amd/{id}/{id}_en.docx"


class FormatError(Exception):
    pass


def download(cache: Path, doc_id: str) -> Path:
    path = cache / f"{doc_id}_en.docx"
    if not path.exists():
        r = requests.get(DIST.format(id=doc_id), timeout=120)
        r.raise_for_status()
        if not r.content.startswith(b"PK"):
            raise FormatError(f"{doc_id}: odpověď není DOCX ({r.headers.get('content-type')})")
        cache.mkdir(parents=True, exist_ok=True)
        path.write_bytes(r.content)
    return path


def text(path: Path) -> str:
    """Text dokumentu: odstavce na řádky, značky EP (<NumAm> …) zůstanou jako text."""
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    xml = xml.replace("</w:p>", "\n")
    return html.unescape(re.sub(r"<[^>]+>", "", xml))


TAG = lambda name: re.compile(rf"<{name}>(.*?)</{name}>", re.S)  # noqa: E731
NUM, MEMBERS, ONBEHALF = re.compile(r"<NumAm[AB]?>(.*?)</NumAm[AB]?>", re.S), TAG("Members"), TAG("AuNomDe")
HEAD = {"committee": TAG("Commission"), "date": TAG("Date"), "range": TAG("RangeAM"), "procedure": TAG("RefProc")}


def parse(path: Path) -> dict:
    t = text(path)
    head = {k: (m.group(1).strip() if (m := rx.search(t)) else None) for k, rx in HEAD.items()}
    # Šablony EP: <RepeatBlock-Amend>/<Amend>/<NumAm>, u dvousloupcových zpráv i varianty …A a …B
    if not re.search(r"<RepeatBlock-Amend[AB]?>", t) or not head["range"]:
        raise FormatError(f"{path.name}: chybí <RepeatBlock-Amend…> nebo <RangeAM>, formát DOCX se změnil")
    head = {k: re.sub(r"^\{[^}]*\}", "", v) if v else v for k, v in head.items()}  # "{REGI}Committee…" → "Committee…"
    amendments = []
    for block in re.split(r"<RepeatBlock-Amend[AB]?>", t)[1:]:
        for am in re.split(r"<Amend[AB]?>", block)[1:]:
            num = NUM.search(am)
            by = am.split("</RepeatBlock-By>")[0]
            members = [n.strip() for m in MEMBERS.findall(by) for n in re.split(r",|\n", m) if n.strip()]
            group = ONBEHALF.search(by)
            amendments.append({
                "num": num.group(1).strip() if num else None,
                "members": members,
                "on_behalf": re.sub(r"^\{[^}]*\}", "", group.group(1)).strip() if group else None,
            })
    if not amendments or any(a["num"] is None for a in amendments):
        raise FormatError(f"{path.name}: PN bez <NumAm>")
    return {**head, "amendments": amendments}


if __name__ == "__main__":
    cache = Path(sys.argv[1])
    for doc_id in sys.argv[2:]:
        d = parse(download(cache, doc_id))
        print(doc_id, {k: v for k, v in d.items() if k != "amendments"}, len(d["amendments"]), "PN")
        for a in d["amendments"][:4]:
            print("  ", a)
