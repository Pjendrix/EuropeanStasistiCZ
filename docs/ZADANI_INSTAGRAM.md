# Zadání: Instagram EP Watch CZ a jeho propojení s webem (16. 10. 2026)

Navazuje na `docs/REVIZE_DESIGN_2026-10-15.md` (karty S4/S5). Platí `CLAUDE.md` (žádná vymyšlená data, čísla počítá kód, každé číslo má odkaz na zdroj, bez pořadí a hodnocení, česky, bez build stepu u webu).

Autor založí Instagram `@epwatch.cz` a koupil doménu **epwatch.cz** (DNS už míří na Vercel: A `76.76.21.21`, wildcard CNAME `cname.vercel-dns.com`). Instagram slouží jako vstupní brána na web. Obsah, rytmus a šablony: `docs/instagram/INSTAGRAM_START.md`, vzorové PNG: `docs/instagram/sablony/`, vzorový generátor: `scripts/instagram/build_vzor.py` (+ `pano.mjs`, `slice.py`).

Pracuj po fázích, každá končí funkčním výstupem a testy. Mezi fázemi se zastav a shrň, co je hotovo.

---

## I1 Přechod na doménu epwatch.cz (nejdřív, blokuje všechno ostatní)
- Základní URL `https://european-stasisticz.vercel.app` → `https://epwatch.cz` všude: `canonical`, `og:url`, `og:image`, `twitter:image`, `sitemap.xml`, `robots.txt`, `site.webmanifest`, `build_pages.py`, `build_cards.py`, `share.js`, citace (Citovat), texty „Zdroj/URL“ na kartách.
- Jedna konstanta `BASE_URL` (Python i JS), žádné natvrdo napsané adresy mimo ni.
- `vercel.json`: přesměrování 301 `european-stasisticz.vercel.app` → `epwatch.cz` (včetně cesty), `www.epwatch.cz` → `epwatch.cz`. Zvaž `cleanUrls`, aby `epwatch.cz/v/197509` fungovalo i bez `.html` (sitemap a canonical zůstanou jedním tvarem).
- Autor sám ve Vercelu přidá doménu (Settings → Domains). Až to bude hotové, ověř `curl -I`: 200 na `/`, 301 ze staré adresy, platný certifikát.
- Test: `grep -R "vercel.app"` v repu nenajde nic mimo `vercel.json` a testy přesměrování; e2e hlídá, že `canonical` každé stránky začíná `https://epwatch.cz/`.

## I2 Instagram na webu
- **Patička** (všechny stránky): odkaz na Instagram `https://instagram.com/epwatch.cz` s ikonou a textem „Instagram“, `rel="me noopener"`, `aria-label="EP Watch CZ na Instagramu (otevře se v nové záložce)"`. Žádný vložený widget ani feed (soukromí, rychlost).
- **`o-projektu.html`**: krátká sekce „Sledujte nás“ (1 věta + odkaz) a nová sekce **„Opravy“** (`#opravy`): tabulka datum · co bylo špatně · co je správně · odkaz na příspěvek. Prázdná je v pořádku („Zatím žádné opravy“). Instagram highlight „Opravy“ bude odkazovat sem.
- `<meta property="og:site_name">` a JSON-LD `Organization.sameAs` doplnit o Instagram.
- Žádné sledování návštěvníků navíc. Pokud web nemá měření, nepřidávej ho bez schválení autorem (varianta: privacy-friendly Vercel Web Analytics). Odkaz v bio bude `https://epwatch.cz/?utm_source=instagram` (jediný, co se měří).

## I3 Karty ke sdílení na webu (S4/S5 z revize) ve verzi pro Instagram
- Karty z `share.js`/`build_cards.py` mají vzhled sjednocený se šablonami z `docs/instagram/sablony/` (barvy, písmo, tečky, patička „Zdroj · datum dat · URL“). Šablony jsou předloha vzhledu, ne kód ke zkopírování.
- **Karta poslance pro Instagram používá jednotný neutrální avatar** (silueta, stejná pro všechny), ne fotku. Rozhodnutí autora: žádný poslanec nesmí být vizuálně zvýhodněn. Webový profil fotky z EP dál zobrazuje (s „© European Union – Source: EP“). Do `shareContext` přidej příznak `avatar: "neutral"` jako výchozí pro obrázkové karty, fotka je volitelná.
- Rozměry: příspěvek 1080×1350 (4:5), story 1080×1920 (9:16). Nic podstatného mimo střed (profilová mřížka ořezává strany na 3:4).
- Na každém slidu zdroj + datum dat + `epwatch.cz/...`. Chybějící hodnota → vynechat dlaždici, nikdy nedopočítat.

## I4 Generátor balíčku příspěvků `scripts/build_instagram.py`
Výstup do `out/instagram/<YYYY-MM-DD>/` (gitignorovat, nepatří do repa), spouští týdenní GitHub Action po aktualizaci dat (nebo ručně `python scripts/build_instagram.py --date …`). Publikování zůstává ruční.

1. **Hlasování ze zasedání** (karusel, `A1–A5` ze šablon): vybere poslední plenární zasedání (`data/votes/*.json`, nejnovější dny s hlasováním). Z **závěrečných hlasování** (`vote_kind == "final"`) vybere jedno podle deterministického pravidla: největší rozdělení české delegace (`data/splits.json`, `strong_split`), při shodě nejnovější. Pravidlo vypiš do `popisek.txt`. Žádné „nejlepší/nejhorší“.
2. **Poslanec v kostce**: další v pořadí podle `sort_label` (abecedně, rotace s uloženým stavem v `data/instagram_state.json`), karta s neutrálním avatarem. Jméno a čísla jsou na kartě (vzor `C1` je anonymní šablona).
3. Pro každý balíček: `slide-1.png …`, `popisek.txt` (šablona, čísla z dat), `alt.txt` (alt text každého slidu), `zdroje.txt` (URL a datum dat). Popisek smí AI jen přeformulovat úvodní větu, čísla nikdy; český název hlasování stejný překlad, jaký už web používá (U7/X10), jinak anglický originál.
4. Dlaždice panoramatu (`F1–F3`) jsou statické: ulož do `docs/instagram/sablony/`, negeneruj je znovu. Skript `pano.mjs` (potřebuje `npm i world-atlas@2 topojson-client@3 d3-geo@3`) a `slice.py` zůstanou v `scripts/instagram/` pro případnou úpravu.
5. Chrome pro render přes Playwright (už je v prostředí; nespouštěj `playwright install`).

**Testy** (`tests/test_build_instagram.py`): součty teček = počet poslanců v mandátu, pořadí stran, text se vejde na slide, žádný slide bez zdroje a data, rotace poslanců nevynechá a neopakuje, `alt.txt` má záznam pro každý slide, výběr hlasování je deterministický.

## I5 Stránka „Ke sdílení / pro média“ (volitelné, po schválení autorem)
`media.html`: seznam posledních zasedání s odkazem na kartu každého závěrečného hlasování ke stažení (PNG 4:5 a 9:16) a upozorněním na licenci dat (ODbL, CC BY 4.0) a pravidla citace. Slouží novinářům i lidem, kteří chtějí kartu sdílet mimo Instagram. Nepřidávej nic, co by vyžadovalo další zdroj dat.

---

## Pořadí práce
| # | Bod | Velikost |
|---|---|---|
| 1 | I1 doména + přesměrování | hodina až půl dne |
| 2 | I2 patička, Opravy, Instagram odkaz | hodina |
| 3 | I3 sjednocení karet + avatar | půl dne (spolu s S4/S5 z revize) |
| 4 | I4 generátor balíčku + testy + GitHub Action | den |
| 5 | I5 stránka pro média | půl dne, volitelné |

## Hotovo když
- Žádná adresa `*.vercel.app` mimo přesměrování, `canonical` všude `https://epwatch.cz/...`.
- Instagram odkaz je v patičce každé stránky, sekce „Opravy“ existuje.
- `python scripts/build_instagram.py` vyrobí kompletní balíček z aktuálních dat a testy projdou.
- `check-web` (e2e) a axe bez nových porušení.

## Rozhodnutí autora, která neměň
- Žádné pořadí, známky ani hodnocení poslanců. Vliv velikosti frakce jen textem.
- Karty poslanců pro Instagram s jednotným avatarem, bez fotek.
- Žádné AI hodnocení; AI jen shrnutí/překlad, bez čísel.
- Publikace na Instagram ruční.
