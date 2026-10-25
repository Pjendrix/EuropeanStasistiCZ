"""Český název závěrečného hlasování, které nemá oficiální český název procedury (Claude Haiku), data/title_translations.json.

Většina hlasování dostane český název z EP Open Data (compute_stats.procedure_titles). Některá závěrečná hlasování
procedurní číslo nemají nebo k němu EP český název nevede (volba Komise, námitky podle čl. 115, naléhavé postupy…),
a web by ukázal anglický název z HowTheyVote. Tento skript je nechá přeložit: vstup je jen anglický název a popis
hlasování, výstup jen překlad (CLAUDE.md: AI jen shrnuje a překládá). Pojistky:
  - číslo, které ve vstupu není, překlad zahodí (has_foreign_numbers),
  - délka nejvýš 300 znaků,
  - web u přeloženého názvu uvede, že jde o překlad AI, a ukáže původní název (build_pages.original_title_html).
Překlady se cachují podle id hlasování a otisku vstupu; znovu se volá jen nové nebo změněné hlasování.

Použití (před compute_stats.py; bez API klíče lokálně přes Claude Code):
    python scripts/title_translations.py
    ANTHROPIC_API_KEY=... python scripts/title_translations.py --backend api
    python scripts/title_translations.py --check     # počet závěrečných hlasování bez českého názvu (GITHUB_OUTPUT)
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

from compute_stats import FormatError, load_votes, require
from quiz_summaries import MODEL, ApiBackend, CliBackend, has_foreign_numbers

PROMPT_VERSION = 2
MAX_LEN = 300
PROMPT = """Překládáš úřední názvy hlasování Evropského parlamentu z angličtiny do češtiny pro český nezávislý web.
Vrať "nazev": věrný český překlad názvu, jak by ho uvedl úřední český dokument EP.

Pravidla:
- Překládej jen název, nic nepřidávej, nevysvětluj a nehodnoť.
- Zachovej čísla, označení předpisů, kódy a vlastní jména přesně jako ve vstupu (např. MON 87769, (EU) 2022/2464).
- „Rule“ jednacího řádu překládej jako „článek“ (Rule 115(2) → článek 115 odst. 2).
- „Amending …“ na začátku názvu → „Změna …“ (Amending Regulation (EU) No 228/2013 → Změna nařízení (EU) č. 228/2013).
- „Objection pursuant to Rule …“ → „Námitka podle článku … jednacího řádu: …“.
- Spisovná čeština, bez uvozovek kolem celého názvu."""
SCHEMA = {
    "type": "object",
    "properties": {"nazev": {"type": "string"}},
    "required": ["nazev"],
    "additionalProperties": False,
}
NOTE = (
    "Překlad anglického názvu závěrečných hlasování bez oficiálního českého názvu procedury od Claude Haiku "
    "(scripts/title_translations.py). Web ho označí jako překlad AI a ukáže původní název."
)


def title_input(v: dict) -> str:
    lines = [f"Anglický název: {v['title']}"]
    if v.get("description"):
        lines.append(f"Popis hlasování (francouzsky): {v['description']}")
    return "\n".join(lines)


def fingerprint(text: str) -> str:
    return hashlib.sha256(f"{PROMPT_VERSION}\n{MODEL}\n{PROMPT}\n{text}".encode()).hexdigest()[:16]


def valid(title: str, source: str) -> bool:
    return 0 < len(title) <= MAX_LEN and not has_foreign_numbers(title, source)


def needs_title(votes: list[dict]) -> list[dict]:
    """Závěrečná hlasování bez oficiálního českého názvu (po apply_titles), s anglickým názvem."""
    for v in votes:
        require(v, ["id", "is_main"], f"hlasování {v.get('id')}")
    return [v for v in votes if v["is_main"] and not v.get("title_cs") and v.get("title")]


def run(votes: list[dict], cache: dict, backend, today: str, log=print) -> dict:
    old = cache.get("items", {})
    items: dict[str, dict] = {}
    for v in needs_title(votes):
        key, text = str(v["id"]), title_input(v)
        fp = fingerprint(text)
        if old.get(key, {}).get("fingerprint") == fp:
            items[key] = old[key]
            continue
        if backend is None:
            continue
        data = backend.ask(text)
        title = data.get("nazev", "").strip() if isinstance(data, dict) and isinstance(data.get("nazev"), str) else ""
        if not valid(title, text):
            log(f"{key}: překlad zamítnut (odmítnutí, neplatný výstup nebo číslo mimo zadání), web ukáže anglický název")
            continue
        items[key] = {"title_cs": title, "title": v["title"], "fingerprint": fp, "generated": today}
    return {"note": NOTE, "model": MODEL, "prompt_version": PROMPT_VERSION, "prompt": PROMPT, "items": dict(sorted(items.items()))}


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=root / "data")
    p.add_argument("--backend", choices=["auto", "api", "claude-cli"], default="auto")
    p.add_argument("--check", action="store_true", help="nic negeneruje, jen vypíše závěrečná hlasování bez českého názvu")
    args = p.parse_args(argv)
    out_path = args.data_dir / "title_translations.json"
    try:
        _, votes = load_votes(args.data_dir / "votes")
    except FormatError as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    if args.check:
        miss = needs_title(votes)
        lines = "\n".join(f"- {v['title']} ({v['date']})" for v in miss)
        print(f"missing_titles={len(miss)}\nlist_titles<<EOF_LIST\n{lines}\nEOF_LIST")
        return 0
    backend = None
    use_api = args.backend == "api" or (args.backend == "auto" and os.environ.get("ANTHROPIC_API_KEY"))
    if use_api and os.environ.get("ANTHROPIC_API_KEY"):
        import anthropic  # jen když se opravdu volá API

        backend = ApiBackend(anthropic.Anthropic(), prompt=PROMPT, schema=SCHEMA)
    elif not use_api and shutil.which("claude"):
        backend = CliBackend(prompt=PROMPT, schema=SCHEMA)
        print("překlad přes Claude Code (claude -p), bez API klíče", file=sys.stderr)
    else:
        print("chybí ANTHROPIC_API_KEY i Claude Code: nové překlady se nevytvoří, zůstanou jen uložené", file=sys.stderr)
    # load_votes už uložené překlady použil; pro run potřebujeme hlasování bez nich
    for v in votes:
        if v.pop("title_cs_ai", False):
            v.pop("title_cs", None)
    cache = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    out = run(votes, cache, backend, dt.date.today().isoformat(), log=lambda m: print(m, file=sys.stderr))
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"přeložené názvy: {len(out['items'])} z {len(needs_title(votes))} závěrečných hlasování bez českého názvu", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
