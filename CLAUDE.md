# EP Watch CZ

Statický web, který sleduje práci českých europoslanců v 10. volebním období (od 16. 7. 2024): hlasování, docházku, návrhy a podpisy, statistiky. Data se stahují jednou týdně přes GitHub Actions do JSON souborů v repu, web je jen zobrazuje (hosting Vercel).

Celý koncept je v `docs/KONCEPT.md`. Před každou fází si přečti relevantní sekce. Sekce „Zadání k vytvoření“ je závazná specifikace (struktura repa, datový model, akceptační kritéria).

## Tvrdá pravidla

- **Žádný scraping HTML.** Data jen z oficiálních API a exportů: HowTheyVote CSV export (GitHub releases, stabilní odkazy `latest/download/*.csv.gz`), EP Open Data API v2 (`https://data.europarl.europa.eu/api/v2`), případně Parltrack dumpy.
  Výjimka pro pozměňovací návrhy: pipeline smí číst oficiální DOCX z registru EP, na který odkazuje EP Open Data API (`distribution/reds_iCmDoc_Amd/…`), a to jen ze strojových značek šablony EP (`<NumAm>`, `<Members>`, `<AuNomDe>`, `<RangeAM>` …). HTML se dál nescrapuje; při změně šablony skript skončí čitelnou chybou (`scripts/amendments.py`).
  Předběžné výsledky po zasedání (`data/preliminary/`) jsou z EP Open Data API (`meetings/{id}/decisions`, `scripts/preliminary.py`). **Předběžná data nikdy nevstupují do statistik** (profily, statistiky, kvíz, duel, OG karty); na webu jen se štítkem „předběžné“ a smažou se, jakmile den pokryje export HowTheyVote.
- **Žádná vymyšlená data.** Co zdroj nemá, je `null`. Nikdy neodhaduj, nedoplňuj z paměti, nepoužívej mock data mimo testy (testovací data mají prefix `MOCK_` nebo leží v `tests/fixtures/`).
- **Čísla počítá kód, ne AI.** Statistiky jsou čisté, deterministické funkce s testy. AI (Claude Haiku) jen shrnuje a překládá obsah hlasování do češtiny a nikdy nevkládá čísla, která nespočítal kód.
- **Validace vstupů.** Každý skript ověří očekávané sloupce a pole. Při změně formátu skončí čitelnou chybou, nikdy tiše nepočítá dál.
- **Velká data nečti do kontextu.** CSV a JSON zpracovávej skripty, do konverzace dávej jen souhrny (počty řádků, ukázku 3–5 záznamů).
- **Příslušnost k frakci a straně se bere k datu hlasování**, ne podle současného stavu. Docházka se počítá jen z hlasování v době mandátu.
- **Každé číslo a shrnutí na webu má odkaz na zdroj.** Portréty s uvedením „© European Union – Source: EP“. Loga stran a frakcí neupravovat a nekreslit, jen ručně uložené oficiální soubory; když chybí, barevný štítek.
- **Tajné klíče** (ANTHROPIC_API_KEY) jen v GitHub Secrets / env proměnných, nikdy v kódu ani na webu.
- **EP API limit:** max. 500 dotazů za 5 minut na endpoint. Dotazy throttluj a cachuj.

## Způsob práce

- Pracuj po fázích z konceptu. Na začátku fáze napiš krátký plán, na konci shrň, co je hotovo, jak to ověřit a co zbývá.
- Každá fáze končí funkčním výstupem a projdenými testy. Neskákej do další fáze bez potvrzení.
- Když narazíš na otevřenou otázku nebo zdroj nevrací očekávaná data, zastav se a zeptej se. Neobcházej to vymyšleným řešením.
- Commity malé a pojmenované podle fáze (`faze1: fetch_meps`).
- Web: statické HTML + JS bez build stepu, česky, funkční na mobilu i desktopu.
- Komunikuj česky, stručně.
