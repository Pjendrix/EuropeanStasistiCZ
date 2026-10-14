"""Stáhne oficiální portréty poslanců z data/meps.json do public/assets/photos/{id}.jpg
a vytvoří náhledy public/assets/photos/thumbs/{id}.webp (šířka 160 px) pro karty a tabulky.

Zdroj: URL portrétu z EP Open Data API (pole photo_url), © European Union – Source: EP.
Portréty se ukládají do repa, web je nehotlinkuje. Soubor se přepíše, jen když se změnil.

Použití:
    python scripts/fetch_photos.py
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests
from PIL import Image

ALLOWED_PREFIX = "https://www.europarl.europa.eu/mepphoto/"
MIN_INTERVAL = 0.7
THUMB_WIDTH = 160


class FormatError(RuntimeError):
    """Neočekávaná odpověď nebo vstup."""


def fetch_photos(meps: list[dict], out_dir: Path, session, min_interval: float = MIN_INTERVAL) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    result = {"saved": 0, "unchanged": 0, "missing": 0}
    for m in meps:
        url = m.get("photo_url")
        if not url:
            result["missing"] += 1
            continue
        if not url.startswith(ALLOWED_PREFIX):
            raise FormatError(f"poslanec {m['id']}: neočekávaná URL portrétu {url}")
        r = session.get(url, timeout=60)
        r.raise_for_status()
        ctype = r.headers.get("Content-Type", "")
        if not ctype.startswith("image/jpeg"):
            raise FormatError(f"poslanec {m['id']}: portrét není JPEG ({ctype})")
        path = out_dir / f"{m['id']}.jpg"
        if path.exists() and path.read_bytes() == r.content:
            result["unchanged"] += 1
        else:
            path.write_bytes(r.content)
            result["saved"] += 1
        time.sleep(min_interval)
    return result


def make_thumbs(meps: list[dict], out_dir: Path, width: int = THUMB_WIDTH) -> int:
    """Náhled WebP pro každý uložený portrét; přegeneruje se, jen když chybí nebo je starší než portrét."""
    thumbs = out_dir / "thumbs"
    thumbs.mkdir(parents=True, exist_ok=True)
    made = 0
    for m in meps:
        src, dst = out_dir / f"{m['id']}.jpg", thumbs / f"{m['id']}.webp"
        if not src.exists() or (dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime):
            continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            h = round(im.height * width / im.width)
            im.resize((width, h), Image.LANCZOS).save(dst, "WEBP", quality=80, method=6)
        made += 1
    return made


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--meps", type=Path, default=root / "data" / "meps.json")
    p.add_argument("--out-dir", type=Path, default=root / "public" / "assets" / "photos")
    args = p.parse_args(argv)
    meps = json.loads(args.meps.read_text(encoding="utf-8"))["meps"]
    try:
        with requests.Session() as s:
            res = fetch_photos(meps, args.out_dir, s)
        res["thumbs"] = make_thumbs(meps, args.out_dir)
    except FormatError as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    print(f"portréty: {res}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
