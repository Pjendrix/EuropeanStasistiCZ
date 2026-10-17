"""Nahraje ručně stažené oficiální logo strany nebo frakce a zapíše ho do data/manual/logos.json.

  python scripts/add_logo.py ep GUE_NGL ~/Downloads/The-Left_Logo.png --source https://left.eu/...
  python scripts/add_logo.py cz 6793 ~/Downloads/logo.svg --source https://www.top09.cz/...

SVG se zkopíruje beze změny (jen kontrola, že neobsahuje skript, obsluhu událostí ani externí odkaz).
Rastr (PNG/JPG/WebP) se převede do bezeztrátového WebP s výškou 128 px; mění se jen formát a velikost,
kresba zůstává. Zdroj (URL, odkud je soubor stažený) je povinný.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UNSAFE_SVG = re.compile(r"<script|\son\w+\s*=|xlink:href\s*=\s*[\"']https?:|href\s*=\s*[\"']https?:", re.I)
RASTER = {".png", ".jpg", ".jpeg", ".webp"}
TARGET_HEIGHT = 128


class LogoError(Exception):
    pass


def add_logo(kind: str, key: str, src: Path, source: str, root: Path = ROOT, today: str | None = None) -> str:
    if kind not in ("ep", "cz"):
        raise LogoError("druh musí být 'ep' (frakce) nebo 'cz' (strana)")
    if not source or not source.startswith("http"):
        raise LogoError("--source musí být URL oficiální stránky nebo souboru")
    if not src.exists():
        raise LogoError(f"soubor {src} neexistuje")
    manifest_path = root / "data" / "manual" / "logos.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    section = manifest["groups" if kind == "ep" else "parties"]
    if key not in section:
        raise LogoError(f"{key} není v data/manual/logos.json ({'groups' if kind == 'ep' else 'parties'}); zkontroluj kód")
    out_dir = root / "public" / "assets" / "logos" / kind
    out_dir.mkdir(parents=True, exist_ok=True)
    ext = src.suffix.lower()
    note = None
    if ext == ".svg":
        text = src.read_text(encoding="utf-8", errors="replace")
        if UNSAFE_SVG.search(text):
            raise LogoError("SVG obsahuje skript, obsluhu události nebo externí odkaz; pročistit (např. svgo)")
        target = out_dir / f"{key}.svg"
        shutil.copyfile(src, target)
    elif ext in RASTER:
        from PIL import Image

        target = out_dir / f"{key}.webp"
        with Image.open(src) as im:
            w, h = im.size
            im = im.convert("RGBA")
            if h > TARGET_HEIGHT:
                im = im.resize((round(w * TARGET_HEIGHT / h), TARGET_HEIGHT), Image.LANCZOS)
            im.save(target, "WEBP", lossless=True)
            note = f"{ext[1:].upper()} {w}×{h} převeden do bezeztrátového WebP {im.size[0]}×{im.size[1]} (jen formát a velikost)"
    else:
        raise LogoError(f"nepodporovaný formát {ext} (SVG, PNG, JPG, WebP)")
    for old in out_dir.glob(f"{key}.*"):
        if old != target:
            old.unlink()
    entry = section[key]
    entry.update({"file": f"assets/logos/{kind}/{target.name}", "source": source, "retrieved": today or dt.date.today().isoformat()})
    entry.setdefault("terms", None)
    entry.pop("chybi", None)
    if note:
        entry["note"] = note
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return entry["file"]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("kind", choices=["ep", "cz"], help="ep = frakce (kód HowTheyVote), cz = strana (ID v EP)")
    p.add_argument("key", help="např. GUE_NGL, GREEN_EFA, ESN, EPP nebo 6793, 6794")
    p.add_argument("file", type=Path)
    p.add_argument("--source", required=True, help="URL, odkud je logo stažené")
    args = p.parse_args(argv)
    try:
        f = add_logo(args.kind, args.key, args.file, args.source)
    except LogoError as e:
        print(f"CHYBA: {e}", file=sys.stderr)
        return 2
    print(f"uloženo {f}; teď spusť scripts/compute_stats.py a scripts/build_web.py", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
