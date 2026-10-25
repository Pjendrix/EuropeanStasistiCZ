"""Organizace se sídlem v ČR z Registru transparentnosti EU (V10): data/register_cz.json.

Zdroj: oficiální denní export https://transparency-register.europa.eu/odplastorganisationxml_en (XML, ~120 MB),
odkazuje na něj data.europa.eu (sada „Transparency Register“). Licence: Commission reuse (© European Union, CC BY 4.0).

Pravidla (zadání 25. 10. 2026):
- Jen organizace (žádné schůzky europoslanců), jen se sídlem (headOffice) v ČR.
- Ukládá se jen identifikace: kód, název, zkratka, kategorie, web, datum registrace a poslední změny.
  Adresy, telefony, finanční údaje ani volný text o zájmech se neukládají a nepárují se s poslanci ani zákony.
- Export je XML 1.1 s odkazy na řídicí znaky; před parsováním (XML 1.0) se odstraní. Chybí-li očekávané pole,
  skript skončí čitelnou chybou.

Použití:
    python scripts/fetch_register.py                  # stáhne export
    python scripts/fetch_register.py --file org.xml   # ze staženého souboru
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from compute_stats import FormatError

URL = "https://transparency-register.europa.eu/odplastorganisationxml_en"
REGISTER_ENTRY = "https://transparency-register.europa.eu/search-register-or-update/organisation-detail_en?id={id}"
COUNTRY = "CZECH REPUBLIC"
SKIP = {"Self-employed individuals"}  # fyzické osoby: zadání chce jen organizace
REQUIRED = ["identificationCode", "registrationDate", "name", "registrationCategory", "headOffice"]
# Český popisek kategorie pro web (vlastní překlad; na stránce je vždy i původní anglický název z registru)
CATEGORY_CS = {
    "Professional consultancies": "Profesní poradenské firmy",
    "Law firms": "Advokátní kanceláře",
    "Self-employed individuals": "Samostatně výdělečně činné osoby",
    "Companies & groups": "Společnosti a skupiny",
    "Trade and business associations": "Obchodní a podnikatelská sdružení",
    "Trade unions and professional associations": "Odbory a profesní sdružení",
    "Other in house lobbyists": "Jiné organizace s vlastními lobbisty",
    "Non-governmental organisations, platforms and networks and similar": "Nevládní organizace, platformy a sítě",
    "Think tanks and research institutions": "Think-tanky a výzkumné instituce",
    "Academic institutions": "Akademické instituce",
    "Organisations representing churches and religious communities": "Organizace zastupující církve a náboženská společenství",
    "Associations and networks of public authorities": "Sdružení a sítě veřejných orgánů",
    "Other public or mixed entities, created by law whose purpose is to act in the public interest": "Jiné veřejné nebo smíšené subjekty",
    "Other organisations, public or mixed entities": "Jiné organizace, veřejné nebo smíšené subjekty",
}


def sanitize(raw: str) -> str:
    """XML 1.1 → 1.0: odstraní odkazy na řídicí znaky, které XML 1.0 nepovoluje."""

    def ok(m: re.Match) -> str:
        s = m.group(1)
        n = int(s[1:], 16) if s[0] in "xX" else int(s)
        return m.group(0) if n in (9, 10, 13) or n >= 32 else ""

    out = re.sub(r"&#([xX][0-9a-fA-F]+|[0-9]+);", ok, raw)
    return re.sub(r"^<\?xml version=['\"]1\.1['\"]", "<?xml version='1.0'", out, count=1)


def parse(raw: str) -> dict:
    export_date, total, orgs = None, None, []
    for _, el in ET.iterparse(io.StringIO(sanitize(raw))):
        if el.tag == "exportDate":
            export_date = (el.text or "")[:10]
        elif el.tag == "numberOfIR":
            total = int(el.text)
        elif el.tag == "interestRepresentative":
            missing = [k for k in REQUIRED if el.find(k) is None]
            if missing:
                raise FormatError(f"registr: záznam {el.findtext('identificationCode')} nemá pole {missing}")
            if (el.findtext("headOffice/country") or "").strip() == COUNTRY and el.findtext("registrationCategory") not in SKIP:
                cat = el.findtext("registrationCategory")
                orgs.append(
                    {
                        "id": el.findtext("identificationCode"),
                        "url": REGISTER_ENTRY.format(id=el.findtext("identificationCode")),
                        "name": (el.findtext("name/originalName") or "").strip(),
                        "acronym": (el.findtext("acronym") or "").strip() or None,
                        "category": cat,
                        "category_cs": CATEGORY_CS.get(cat),
                        "web": (el.findtext("webSiteURL") or "").strip() or None,
                        "registered": el.findtext("registrationDate")[:10],
                        "updated": (el.findtext("lastUpdateDate") or "")[:10] or None,
                    }
                )
            el.clear()
    if not export_date or total is None:
        raise FormatError("registr: export nemá metaData/exportDate nebo numberOfIR")
    unknown = sorted({o["category"] for o in orgs if not o["category_cs"]})
    if unknown:
        raise FormatError(f"registr: neznámé kategorie {unknown}, doplň CATEGORY_CS")
    orgs.sort(key=lambda o: (o["category_cs"], o["name"].casefold()))
    return {
        "note": "Organizace se sídlem v ČR z Registru transparentnosti EU (scripts/fetch_register.py). Jen identifikace, bez kontaktů.",
        "source": URL,
        "license": "© European Union, Commission reuse (CC BY 4.0)",
        "export_date": export_date,
        "total_register": total,
        "organisations": orgs,
    }


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=root / "data")
    p.add_argument("--file", type=Path, help="už stažený export XML")
    args = p.parse_args(argv)
    try:
        if args.file:
            raw = args.file.read_text(encoding="utf-8")
        else:
            import requests

            r = requests.get(URL, timeout=600)
            r.raise_for_status()
            raw = r.content.decode("utf-8")
        doc = parse(raw)
    except FormatError as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    (args.data_dir / "register_cz.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(
        f"registr: {len(doc['organisations'])} organizací se sídlem v ČR z {doc['total_register']} (export {doc['export_date']})",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
