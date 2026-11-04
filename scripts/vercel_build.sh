#!/usr/bin/env bash
# Sestavení webu na Vercelu (audit A6): v gitu jsou jen data/ a ruční stránky, odvozené výstupy vznikají tady.
#   public/data/        jen soubory, které web načítá (scripts/public_data.py, V17)
#   public/data/votes/id/  hlasování po jednom pro vote.html (build_shards.py, audit A4)
#   public/p, s, v, z/  statické stránky, index.html (rozcestník), aktualne.html, sitemap.xml, feed.xml (build_pages.py)
#   public/og/          obrázky ke sdílení (build_cards.py)
#   public/**/*.js      importy s ?v=<otisk> (layout.py --version-imports, revize 3. 11. 2026)
# Spouští ho vercel.json (buildCommand); lokálně stejně: bash scripts/vercel_build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

python3 --version
# Pillow do vlastního adresáře (bez práv k systémovému Pythonu), verze zamčená otisky.
python3 -m pip install --quiet --disable-pip-version-check --require-hashes --target .pydeps -r requirements-build.txt
export PYTHONPATH="$PWD/.pydeps${PYTHONPATH:+:$PYTHONPATH}"

rm -rf public/data && mkdir -p public/data
python3 scripts/public_data.py public/data   # jen soubory, které web načítá (V17, whitelist)
python3 scripts/build_shards.py
python3 scripts/build_pages.py
python3 scripts/build_cards.py
# Poslední krok: importy v JS dostanou ?v=<otisk> (stejné otisky jako ?v= v HTML), lib/*.js se pak cachuje natrvalo.
python3 scripts/layout.py --version-imports
