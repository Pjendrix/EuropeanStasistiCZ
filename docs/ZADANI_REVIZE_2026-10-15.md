# Zadání: zapracuj revizi

Úkol: zapracuj `docs/REVIZE_2026-10-15.md` (body D1–D13 a X1–X12).

## Postup
1. Přečti `CLAUDE.md` (tvrdá pravidla platí beze změny), `docs/REVIZE_2026-10-15.md` a kvůli kontextu `docs/UX_REVIEW.md`.
2. Pracuj podle sekce **4. Roadmap**, nejdřív **Teď – quick wins**, pak **Fáze 2**. **Fázi 3 nedělej**, ta potřebuje nová data a rozhodnutí autora.
3. Na začátku napiš krátký plán, které body uděláš a v jakém pořadí.
4. Každý bod = jeden malý commit `revize: <ID> <popis>` (např. `revize: D1 účast na hlasování`). Po každém bodu projdou testy (`pytest`). U nové výpočetní logiky (D3, D5, D6, D7, D8, D13) přidej testy.
5. Po quick wins se zastav, shrň, co je hotovo a jak to ověřit, a počkej na potvrzení. Teprve pak pokračuj Fází 2.

## Pozor
- Čísla v revizi označená „n“, „N“, „X–Y“ jsou zástupné hodnoty. Skutečné hodnoty spočítá kód, nikdy je nevymýšlej.
- D13: `data/manual/key_votes.json` vytvoř jako prázdnou šablonu se schématem a validací v `check_data.py`. Položky (odkazy na tiskové zprávy EP) doplní autor ručně. Žádný scraping médií ani EP webu.
- X12: na kartách ke sdílení žádná loga stran a frakcí, jen zkratka a tečka. Vždy datum dat, zdroj, URL, u poslance medián EP.
- D1, D2 přejmenování: změň texty v UI, definicích, statických stránkách i CSV hlavičkách. Klíče v JSON (`attendance`, `group_loyalty`) nech, ať se nerozbije datový model. Záznam přidej do „Opravy a změny metodiky“ v `o-projektu.html`.
- Když něco v revizi odporuje datům nebo kódu, zastav se a zeptej se.
- Na konci aktualizuj `docs/UX_REVIEW.md`: u hotových úkolů z U1–U12 napiš „hotovo“.
