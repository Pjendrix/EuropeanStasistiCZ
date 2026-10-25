# Zadání: příprava na veřejné spuštění (25. 10. 2026)

Podklad: `docs/REVIZE_PRED_SPUSTENIM_2026-10-25.md` (body O1–O13 a V1–V19). Snímky obrazovky k bodům UX jsou v `docs/revize-2026-10-25/`.
Platí `CLAUDE.md`: žádný scraping, žádná vymyšlená data, čísla počítá kód, web bez build stepu a česky.

Postup: po fázích. Na začátku fáze krátký plán, na konci shrnutí, jak to ověřit, a co zbývá. Každá fáze končí zelenými testy (`pytest`, `node --test tests/js/*.test.mjs`, ruff, ESLint, `check_data.py`) a commitem `spusteni-fN: …`. Do další fáze až po potvrzení. Když zdroj nevrací očekávaná data nebo je něco nejasné, zastav se a zeptej se.

## Rozhodnutí (závazná)
- Publikum: novináři, analytici a politici. Všechno sdílené musí pochopit i laik. Vysvětlivky ano, ale web není učebnice.
- `/` zůstává hlavní stránkou (logo). `/aktualne` se předělá na „Novinky“ s vlastním H1.
- Kvíz je v mobilní liště běžná položka, ne zvýrazněné tlačítko s ✓.
- Analytika bez cookies: Vercel Web Analytics (`/_vercel/insights/script.js`, projde CSP `'self'`).
- Řazení tabulek podle čísel je povolené. Výchozí řazení je abecedně nebo po frakcích a web sám nic nehodnotí.
- Profil poslance: pořadí práce → hlasování → účast.
- Právo na odpověď: krátká vyjádření poslanců (max. 300 znaků), ručně schvalovaná, se štítkem „vyjádření poslance, neověřeno“.
- Lobbing: jen registr transparentnosti EU (organizace). Schůzky europoslanců se nedělají.
- **Nedělat:** feed ani RSS po jednotlivých poslancích. AI shrnutí všech závěrečných hlasování (V11) je odložené.

---

## Fáze 1 – před spuštěním (O1–O6)

1. **O1 České názvy.** Doplnit český název u 21 závěrečných hlasování, která ho nemají (např. `Election of the Commission` 27. 11. 2024, `Deforestation Regulation…`, `Objection pursuant to Rule 115…`, Omnibus `Amending Directives (EU) 2022/2464…`). Opravit „…Helsinki-Uusimaa paper“ (EGF/2026/004). Rozšířit `labels_cs.py` o francouzské popisy dílčích hlasování (`Article … - alinéa …`, `Amendements de la commission …`, `Annexe …`, `Considérant …`).
   *Hotovo, když:* `check_data.py` hlásí varování u každého závěrečného hlasování bez českého názvu a v aktuálních datech není žádné. Test pokrývá nové vzory `labels_cs`.
2. **O2 Úvod vs. Aktuálně.** `/aktualne` (`hub.py`) dostane vlastní H1 a obsah „Novinky“ (detail ve fázi 3, V3). V této fázi stačí odlišit H1 a `<title>` a nastavit canonical, aby nevznikl duplicitní obsah s `/`.
3. **O3 Mobilní lišta.** V `layout.py` a `style.css` (`.tabbar`): pět stejných položek, Aktuálně · Poslanci · Hledat · Hlasování · Více. Kvíz přesunout do „Více“. Na `/kviz` musí být „Začít“ vidět na první obrazovce při 390×844 (výběr délky sbalit, výchozí volba Čeští poslanci + Rychlý).
   *Hotovo, když:* e2e test v `tests/e2e/check-web.mjs` ověří, že „Začít“ je při 390×844 nad horním okrajem lišty.
4. **O4 Stránka 404.** `public/404.html` přes `layout.py`: hledání a odkazy na Poslance, Hlasování a Úvod. Vygenerovat při buildu.
5. **O5 Proces oprav.** Na každém profilu (`/p/`), hlasování (`/v/`) a straně (`/s/`) odkaz „Našli jste chybu?“ na formulář v `/o-projektu` s předvyplněnou URL stránky (skryté pole). V `/o-projektu#opravy` uvést lhůtu reakce, co se opravuje (chyba v datech či výpočtu) a co ne (záznam hlasu v EP), a veřejný log z `data/manual/corrections.json` (zobrazit i prázdný). Ve Formspree zapnout honeypot `_gotcha` (V19).
6. **O6 Analytika.** Vercel Web Analytics skript do `layout.py`. Upravit text v `/o-projektu` o sledování („měříme jen anonymní počty návštěv, bez cookies“).

## Fáze 2 – srozumitelnost a výkon (O7–O13)

1. **O10 Popisky „EP“ a „Češi“.** U každé karty hlasování (`/votes`, `/hlasovani`, `/temata`, karty na profilu a straně) odlišit výsledek celého EP od hlasů Čechů. Například „EP: Přijato“ a „Češi: 2 pro · 15 proti“.
2. **O9 Vysvětlení metrik.** Pod každou metrikou na profilu jedna věta přímo na stránce, ne jen v ⓘ. Dvojice všechna / závěrečná dát vedle sebe. Při rozdílu nad 10 p. b. přidat větu generovanou kódem (žádné AI).
3. **O12 Změny frakce.** Na profil přidat časovou osu frakcí (z `meps.json → groups`). „Hlasuje s frakcí“ u poslance se změnou frakce rozdělit po obdobích.
4. **O7 Výkon `/votes`.** Výchozí pohled (závěrečná hlasování, aktuální měsíc) vykreslit staticky v `build_pages.py`. `search.json` načíst až při hledání nebo změně filtru, případně zavést `search-final.json`.
   *Hotovo, když:* TBT na mobilu se 4× CPU je pod 400 ms (dnes 1,37 s).
5. **O8 `/radar`.** U procedury zobrazit poslední krok a příští termín, celou časovou osu dát do `<details>`. Seskupit podle stavu (na programu / trialog / výbor).
   *Hotovo, když:* stránka má na mobilu pod 1 500 uzlů DOM (dnes 4 500).
6. **O11 Drobnosti.**
   - pevné mezery v datech a „p.&nbsp;b.“ (helper ve `format.js` / `web_ui.py`);
   - dlaždice na úvodu pod 480 px v jednom sloupci;
   - H1 dlouhých názvů hlasování zmenšit (`clamp()`, třída nad 120 znaků);
   - tlačítko „Porovnat s…“ přejmenovat na „Porovnat“;
   - karty na `/poslanci` zarovnat nahoru;
   - jednotné „hlasování do … · export …“;
   - tlačítka Pro/Proti v náhledu kvízu na úvodu udělat funkční (V14), nebo je zobrazit jako text.
7. **O13 Kód.**
   - `profile.js:14` (`innerHTML` z `data-detail`) nahradit `<template>` + `cloneNode`;
   - rozdělit `share.js` na moduly;
   - `build_pages.py` nemá přepisovat nezměněné soubory (dnes `written: 1722`).

## Fáze 3 – novináři a politici

1. **V3 Novinky na `/aktualne`.** Chronologický seznam generovaný kódem: zasedání se souhrnem, změny frakcí, nové zprávy a stínové zprávy, předběžné výsledky (se štítkem), nové body programu. Stávající `feed.xml` může brát stejné položky. Feed po poslancích se nedělá.
2. **V1 Citace.** Tlačítko „Citovat“ u metrik a hlasování (věta + URL + datum exportu, `citeText`) a odkaz na snapshot `data-RRRR-MM-DD`.
3. **V4 Stránka `/data`.** Seznam souborů s popisem polí, licencí (ODbL, CC BY 4.0), snapshoty a příkladem citace.
4. **V2 Embed.** `/embed/v/{id}` a `/embed/p/{id}`: kompaktní karta se zdrojem a datem, kód `<iframe>` v panelu Sdílet. Ve `vercel.json` povolit `frame-ancestors *` jen pro `/embed/*`, jinak CSP beze změny.
5. **V5 Řazení.** Tabulka na `/poslanci`: řazení kliknutím na záhlaví a referenční řádek „medián EP“. Pod tabulkou export CSV.
6. **V6 Profil jako vizitka.** Pořadí práce → hlasování → účast. Zprávy ukázat s výsledkem a odkazem na `/z/`.
7. **V7 Vyjádření poslanců.** Soubor `data/manual/statements.json` (`mep_id`, `scope`: metrika nebo `vote_id`, `text` max. 300 znaků, `date`, `source`). Validace v `check_data.py`. Zobrazení se štítkem „vyjádření poslance, neověřeno“. Pod graf účasti dát poznámku, že EP důvody nepřítomnosti nezveřejňuje.
8. **V12 OG karty.** Doplnit pro `/s/` a `/z/`, generickou kartu pro `/v/` bez vlastní.

## Fáze 4 – nové zdroje (každý nejdřív spike, výsledek do `docs/`, pak se zeptat)

1. **V8 Hlasování ČR v Radě EU.** Spike: SPARQL `http://data.consilium.europa.eu/sparql`, graf `http://data.consilium.europa.eu/id/dataset/votingresults`. Zjistit pokrytí 2024–2026, četnost aktualizace, licenci a párování přes `procedure_reference`. **Bez potvrzení nestavět.** Pokud data nejsou aktuální, zastavit se a zeptat.
2. **V10 Registr transparentnosti EU.** Spike: oficiální export na data.europa.eu (formát, licence, aktualizace). Jen organizace, žádné schůzky europoslanců. Navrhnout, kde to na webu dává smysl, a zeptat se.
3. **V9 Opravy hlasů.** Ověřit, jestli opravy hlasování („corrections to votes“) jsou v exportu HowTheyVote nebo v EP Open Data (`meetings/{id}/decisions`). Pokud ano, ukázat je na `/v/` a na profilu se štítkem „oprava nemění výsledek“.

## Fáze 5 – provoz

1. **V16 Kontrola čerstvosti.** Denní GitHub Action načte `https://epwatch.cz/data/freshness.json` a založí issue, když jsou data starší než `stale_days` nebo web neodpovídá.
2. **V17 Menší build.** Do `public/data` kopírovat jen soubory, které web načítá (whitelist ve `vercel_build.sh`). Shardy hlasování seskupit po zasedání místo po jednom hlasování.
3. **V18 Zlaté kontroly.** 10–15 ručně ověřených faktů z oficiálních zdrojů EP (výsledky vybraných hlasování, členství ve výborech) v `check_data.py`. Hodnoty doplní a ověří správce, neodhadovat.
4. **V15 Čitelnost.** Minimální velikost textu 13 px na mobilu, tooltipy ⓘ na dotyk jako `<details>` nebo popover. Ruční průchod tmavým režimem.
