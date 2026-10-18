#!/usr/bin/env bash
# Commit dat z GitHub Actions bez konfliktů s jiným během nebo s novým kódem v main.
#
# Každý workflow „vlastní“ jen soubory, které sám stahuje (zadané jako argumenty).
# Ty se odloží, větev se srovná s aktuálním origin/main, vrátí se zpět a odvozené
# soubory (stats.json, soubory pro web, statické stránky) se přepočítají aktuálním kódem z main.
# Při souběžném pushi se postup zopakuje (nejvýš 3×).
#
# Použití: scripts/commit_data.sh "zpráva commitu" [--tag data-YYYY-MM-DD] cesta [cesta...]
set -euo pipefail

msg="$1"; shift
tag=""
if [[ "${1:-}" == "--tag" ]]; then tag="$2"; shift 2; fi
owned=("$@")
stash="${RUNNER_TEMP:-$(mktemp -d)}/owned-data"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

rm -rf "$stash" && mkdir -p "$stash"
for p in "${owned[@]}"; do
  if [[ -e "$p" ]]; then mkdir -p "$stash/$(dirname "$p")" && cp -r "$p" "$stash/$(dirname "$p")/"; fi
done

for attempt in 1 2 3; do
  git fetch -q origin main
  git reset -q --hard origin/main
  for p in "${owned[@]}"; do
    if [[ -e "$stash/$p" ]]; then rm -rf "$p" && mkdir -p "$(dirname "$p")" && cp -r "$stash/$p" "$(dirname "$p")/"; fi
  done
  python scripts/compute_stats.py
  python scripts/build_web.py
  # build_pages.py kvůli blokům z dat v ručních stránkách (poslanci.html, hlasovani.html, o-projektu.html);
  # stránky p/, s/, v/, z/, index.html, aktualne.html, sitemap, feed a obrázky og/ jsou v .gitignore, vznikají při sestavení na Vercelu
  # (scripts/vercel_build.sh, audit A6)
  python scripts/build_pages.py
  git add data public
  if git diff --cached --quiet; then
    echo "Žádná nová data."
    exit 0
  fi
  git commit -q -m "$msg"
  if git push -q origin HEAD:main; then
    if [[ -n "$tag" ]]; then
      git tag -f "$tag" && git push -q -f origin "refs/tags/$tag" || echo "Tag $tag se nepodařilo pushnout."
    fi
    echo "Hotovo (pokus $attempt)."
    exit 0
  fi
  echo "Push selhal, main se mezitím změnil; opakuji."
  sleep $((attempt * 10))
done
echo "CHYBA: push se nepodařil ani na třetí pokus." >&2
exit 1
