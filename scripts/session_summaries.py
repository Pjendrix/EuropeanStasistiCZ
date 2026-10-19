"""Krátké AI shrnutí „o co jde“ u bodů programu zasedání (Claude Haiku), data/session_summaries.json.

Stránka Zasedání (session_page.py) ukazuje u vybraných bodů pod názvem jednu větu, čeho se návrh týká. Vstup jsou jen
údaje z programu EP (radar.json → session): úřední český a anglický název, druh procedury a odpovědný výbor. Žádný text
návrhu (ten není v oficiálních datech strojově k dispozici), proto model jen srozumitelně přeformuluje název. Stejné
pojistky jako u ostatních shrnutí (vote_summaries.py, CLAUDE.md: AI jen shrnuje a překládá, čísla počítá kód):
  - číslo, které není ve vstupu, shrnutí zahodí,
  - hodnocení, výsledek ani předpověď hlasování se nepíšou (pokyn v PROMPT),
  - bez ANTHROPIC_API_KEY volá lokální Claude Code (`claude -p`); bez obojího nic nevolá a karta ukáže jen název.
Shrnutí se cachují podle bodu (číslo procedury, jinak id bodu) a otisku vstupu; znovu se volá jen nový nebo změněný bod.

Použití (po radar.py / build_web.py, před build_pages.py):
    python scripts/session_summaries.py                    # lokálně přes Claude Code
    ANTHROPIC_API_KEY=... python scripts/session_summaries.py --backend api
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

from quiz_summaries import MODEL, ApiBackend, CliBackend
from vote_summaries import PROCESS_TYPE, valid

PROMPT_VERSION = 1
PROMPT = """Jsi editor českého nezávislého webu o hlasování europoslanců. Na stránce s programem zasedání Evropského
parlamentu je u bodu úřední název. Napiš pod něj "shrnuti": jednu krátkou větu (nejvýš 160 znaků), čeho se návrh týká,
srozumitelně pro laika.

Pravidla:
- Vycházej jen z dodaného názvu, druhu procedury a výboru. Nic nedomýšlej: žádné cíle, dopady ani podrobnosti, které
  v zadání nejsou.
- Neopakuj doslova nadpis; řekni to jednodušeji a uveď druh textu (zákon, zpráva, usnesení, rozpočet…).
- Piš neutrálně: žádné hodnocení, žádné „důležitý“, „sporný“, žádné argumenty pro ani proti.
- Nepiš, jak hlasování dopadne ani kdo jak bude hlasovat.
- Nepoužívej čísla, která nejsou v zadání.
- Spisovná čeština, bez zkratek, které laik nezná (EU a Komise jsou v pořádku). Nepiš výplňové věty."""
SCHEMA = {
    "type": "object",
    "properties": {"shrnuti": {"type": "string"}},
    "required": ["shrnuti"],
    "additionalProperties": False,
}


def item_key(it: dict) -> str:
    return (it.get("procedure") or {}).get("label") or it["id"]


def item_input(it: dict) -> str:
    """Zadání pro model: jen údaje z programu EP."""
    lines = []
    if it.get("title_cs"):
        lines.append(f"Úřední český název: {it['title_cs']}")
    if it.get("title_en"):
        lines.append(f"Anglický název: {it['title_en']}")
    proc = it.get("procedure") or {}
    if proc.get("label"):
        ptype = proc.get("type")
        lines.append(f"Procedura: {proc['label']} ({PROCESS_TYPE.get(ptype, ptype)})")
    comm = it.get("committee") or {}
    if comm.get("name"):
        lines.append(f"Odpovědný výbor: {comm['name']}")
    return "\n".join(lines)


def fingerprint(text: str) -> str:
    return hashlib.sha256(f"{PROMPT_VERSION}\n{MODEL}\n{PROMPT}\n{text}".encode()).hexdigest()[:16]


def run(session: dict | None, cache: dict, backend, today: str, log=print) -> dict:
    """Shrnutí pro body programu; shrnutí bodů, které už v programu nejsou, se zahodí (program se týden po týdnu mění)."""
    old = cache.get("items", {}) if cache.get("prompt_version") == PROMPT_VERSION else {}
    items = {}
    for it in (session or {}).get("items", []):
        if not (it.get("title_cs") or it.get("title_en")):
            continue
        key, source = item_key(it), item_input(it)
        fp = fingerprint(source)
        if old.get(key, {}).get("fingerprint") == fp:
            items[key] = old[key]
            continue
        if backend is None or key in items:
            continue
        data = backend.ask(source)
        text = data.get("shrnuti", "").strip() if isinstance(data, dict) and isinstance(data.get("shrnuti"), str) else ""
        if not valid(text, source):
            log(f"{key}: shrnutí zamítnuto (odmítnutí, neplatný výstup nebo číslo mimo zadání), karta ukáže jen název")
            continue
        items[key] = {"shrnuti": text, "fingerprint": fp, "generated": today}
    return {
        "note": "Krátká shrnutí bodů programu zasedání od Claude Haiku (scripts/session_summaries.py), jen z úředního názvu. "
        "Čísla, hodnocení ani výsledky neobsahují.",
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "prompt": PROMPT,
        "items": dict(sorted(items.items())),
    }


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=root / "data")
    p.add_argument("--backend", choices=["auto", "api", "claude-cli"], default="auto")
    args = p.parse_args(argv)
    out_path = args.data_dir / "session_summaries.json"
    radar_path = args.data_dir / "radar.json"
    session = json.loads(radar_path.read_text(encoding="utf-8")).get("session") if radar_path.exists() else None
    backend = None
    use_api = args.backend == "api" or (args.backend == "auto" and os.environ.get("ANTHROPIC_API_KEY"))
    if use_api and os.environ.get("ANTHROPIC_API_KEY"):
        import anthropic  # jen když se opravdu volá API

        backend = ApiBackend(anthropic.Anthropic(), prompt=PROMPT, schema=SCHEMA)
    elif not use_api and shutil.which("claude"):
        backend = CliBackend(prompt=PROMPT, schema=SCHEMA)
        print("shrnutí přes Claude Code (claude -p), bez API klíče", file=sys.stderr)
    else:
        print("chybí ANTHROPIC_API_KEY i Claude Code: nová shrnutí se nevytvoří, zůstanou jen uložená", file=sys.stderr)
    cache = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    out = run(session, cache, backend, dt.date.today().isoformat(), log=lambda m: print(m, file=sys.stderr))
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"shrnutí bodů programu: {len(out['items'])}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
