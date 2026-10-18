# EP Watch CZ – zadání: rozcestník na úvodu a kvíz jako aplikace (18. 10. 2026)

Platí `CLAUDE.md` (žádná vymyšlená data, čísla počítá kód, AI jen shrnuje, každé číslo má zdroj, bez pořadí a hodnocení).
Mockup: `docs/mockups/rozcestnik-kviz.html` (otevři v prohlížeči; klikací, na skutečných datech z repa, přepínač Desktop / Mobil 390 a tlačítko „Demo“ pro rychlý výsledek kvízu). **Mockup je vzor vzhledu a chování, ne kód k převzetí**: data v něm jsou vložená natvrdo, na webu se čtou z JSON; CSS a JS napiš podle konvencí repa (tokeny z `design/tokens.json`, vrstva `site`, 4 breakpointy, moduly v `public/`). Kde se zadání a mockup liší, platí zadání.
Pracuj po bodech v pořadí níže. Na začátku bodu krátký plán, na konci: co je hotovo, jak to ověřit, co zbývá.
Každý bod = samostatný malý commit (`portal: …`, `kviz: …`), po každém projdou `pytest`, `layout.py --check` a `tests/e2e/check-web.mjs`.

## Rozhodnuto
- Logo vede na nový rozcestník (`/`). Dnešní úvod se přesouvá na `/aktualne`, obsahově beze změny (včetně B3–B6 ze zadání úvodu).
- Kvíz má vlastní adresu `/kviz` a zvýrazněné místo v menu. `/moje-shoda` → 301 na `/kviz`.
- Mobilní lišta: **Aktuálně · Poslanci · Kvíz (uprostřed, zvýrazněný) · Hlasování · Více**. Strany a Práce poslanců jdou do „Více“.
- Po odpovědi v kvízu jen anonymní tečky (bez jmen), jména až ve výsledku.
- U výsledku obrázek ke sdílení se 3 nejvyššími shodami.
- Výsledek jen s poslanci (žádná shoda se stranami).

---

## R1 Struktura webu a menu
- `build_pages.py` / `hub.py`: dnešní úvod generovat do `public/aktualne.html`, nový `public/index.html` = rozcestník (R2). Canonical, `og:url`, sitemap a odkazy „Celý přehled“ upravit.
- `scripts/layout.py` (společná hlavička):
  - desktop menu: **Aktuálně · Poslanci · Strany · Hlasování · Práce poslanců · Analýzy** + zlaté tlačítko **Kvíz** (ikona fajfky + text, `aria-current` na stránce kvízu). „O projektu“ jen v patičce a ve „Více“, jinak se lišta na 1024 px nevejde (ověř screenshotem 1024 a 1366).
  - `data-page` pro nové stránky (`now`, `quiz`); subnav Analýz bez „Moje shoda“.
  - mobilní lišta podle „Rozhodnuto“, Kvíz jako kulaté tlačítko přesahující lištu nahoru; v sheetu „Více“ nově Strany a Práce poslanců.
- `vercel.json`: 301 `/moje-shoda` → `/kviz`.
- Vyhledávání: pole v hero jen na rozcestníku (logika z B2: tlačítko v liště skryté, dokud je pole vidět). Na `/aktualne` jen tlačítko v liště.
- e2e: všechny stránky mají nové menu, `/moje-shoda` přesměruje, logo vede na `/`.

## R2 Rozcestník (`index.html`)
**Hero (vždy tmavé, jako dnes):** nadpis „Co dělají v Bruselu čeští europoslanci.“ uvnitř oblouku půlkruhu 21 českých poslanců (na mobilu nad ním, uvnitř oblouku skóre „14 : 1 / pro : proti“).
- Animace cca 2 s: 9 hvězd z loga se rozletí do křesel → tečky v barvách frakcí (popisek „21 poslanců v N frakcích“ + legenda s počty) → přebarvování podle **5 nejnovějších závěrečných hlasování** z `home.json` (stejná data a pořadí teček jako dnešní karta), každé cca 5 s.
- Pod obloukem: „Poslední hlasování · datum · přijato/zamítnuto“, název (odkaz na `v/{id}`), počty pro / proti / zdrželo se / nehlasovalo.
- Ovládání: tečky 1–5 + tlačítko pauza (WCAG 2.2.2). Najetí / fokus na křeslo = jméno a hlas (`<title>`).
- `prefers-reduced-motion`: rovnou statický stav posledního hlasování, bez automatického přepínání.
- Bez JS: statické SVG posledního hlasování generuje `hub.py` (stejně jako dnes karta), JS ho jen oživí. Žádný obsah schovaný za `opacity: 0`.
- Nový `public/portal.js` (modul), sdílí půlkruh s `hub.js`, žádný duplikovaný kód.

**Dlaždice (bento):** každá je odkaz, čísla jen z existujících JSON, nic nového se nepočítá.
| Dlaždice | Obsah | Zdroj |
|---|---|---|
| Aktuálně (široká) | poslední zasedání (data, počet závěrečných hlasování), další zasedání (data, počet bodů), štítek „zasedání za N dní“ | `session.json`, `home.json.agenda` |
| Kvíz (největší, tmavá se zlatou) | „Jak byste hlasovali vy?“, počet otázek, CTA „Spustit kvíz“, náhled karet otázek | `quiz.json`, `quiz_summaries.json` |
| Poslanci | mozaika portrétů (thumbs), počet | `overview.json` |
| Hlasování | počet jmenovitých hlasování od 17. 7. 2024 + sloupečky po měsících (ve stejném měřítku) | `home.json.facts.monthly` |
| Strany a frakce | počet stran a frakcí (NI není frakce), štítky frakcí v jejich barvách | `home.json`, `groups.json` |
| Práce poslanců | projevy, otázky, zprávy jako zpravodaj | `home.json.facts.work` |
| Analýzy | Kde se Češi rozdělili (x z y jednotně), Kde rozhodly české hlasy (N), Kdo s kým hlasuje | `home.json.facts` |
| Témata | štítky 12 témat | `categories.py` |
| O projektu | „Každé číslo má odkaz na zdroj“ + zdroje | – |
- Rozložení: 6 sloupců (desktop), 4 (≤1024), 2 (≤560; malé dlaždice po dvou, Aktuálně, Kvíz, Analýzy, Témata a O projektu přes celou šířku). Jen 4 povolené breakpointy z `BRAND.md`.
- e2e + axe při 1366×900 a 390×844, světlý i tmavý režim; na 1366×900 je bez scrollu vidět aspoň první řada dlaždic.

## K1 Kvíz jako aplikace (`kviz.html`, `pages/kviz.js`)
Tři obrazovky v jedné stránce (stav v JS, krok v `#hash` jen jako `#otazka-3` / `#vysledek`):
1. **Úvod:** nadpis „Jak byste hlasovali vy?“, volba délky (Rychlý 12 / Delší 25), přepínač „Po každé odpovědi ukázat, jak hlasovali Češi“ (výchozí zapnuto), tlačítko Začít. Tři zásady: pravidlo výběru (rozbalit celé `quiz.rule`), AI popisy (model + zadání jako dnes), nic se neodesílá. Rozpracovaný kvíz → „Pokračovat · x z y“ a „Začít znovu“.
2. **Otázka:** jedna na obrazovce.
   - Nahoře křížek (zpět na úvod kvízu), segmentový průběh (každý segment = otázka, barva podle odpovědi, klik = skok), „3 / 12“.
   - Karta: téma, datum, druh hlasování, název od AI se štítkem AI, shrnutí, tlačítko **„Více o hlasování“** → nativní `<dialog>` (desktop panel vpravo, ≤560 px spodní list): shrnutí AI, úřední znění, procedura, kolikrát se o zákonu jmenovitě hlasovalo (`roll_calls`, vysvětlit proč je v kvízu), odkazy na příběh zákona (`z/…`) a Legislativní observatoř, zdroj.
   - Odpovědi: Pro / Proti / Zdržel/a bych se + „Nevím, přeskočit“. Velká tlačítka; ≤560 px přilepená dole u palce.
   - Po odpovědi (je-li přepínač zapnutý): Parlament přijal/zamítl + počty, mini půlkruh českých hlasů **bez jmen**, věta „Vy: Pro. Stejně hlasovalo X z Y českých poslanců, kteří hlasovali.“, poznámka „Jména uvidíte až ve výsledku“. Tlačítko „Další otázka“ (u poslední „Ukázat výsledek“). Bez přepínače rovnou další otázka.
   - Klávesy (desktop, s nápovědou): 1 / 2 / 3, 0 přeskočit, Enter / → další, ← zpět, I detail, Esc zavřít detail.
   - ≤760 px „režim aplikace“: skrýt hlavičku a spodní lištu, celá obrazovka patří otázce.
   - Pořadí teček v mini půlkruhu podle frakce **k datu hlasování**: doplnit do `quiz.json` u otázky `groups: {mep_id: kód frakce}` (`quiz.py`, test).
3. **Výsledek:** viz K2.
- Postup v `localStorage` (klíč `epw-kviz`, jen délka, index, odpovědi; try/catch, bez něj vše funguje). Text „Odpovědi se počítají jen ve vašem prohlížeči“ zůstává.
- Výpočet shody beze změny (dnešní `moje-shoda.js`: stejné odpovědi / společné otázky, min. 3 společné, řazení podle shody, pak počtu společných, pak abecedně). Přesunout do čisté funkce a otestovat.
- Přístupnost: fokus na kartu po přechodu, `aria-pressed` u odpovědí, `aria-live` u odhalení, průběh jako skupina tlačítek s popisky, animace respektují `prefers-reduced-motion`.

## K2 Výsledek a sdílení
- Nadpis „Nejčastěji stejně jako vy hlasovali“, pod ním definice shody. Tři nejvyšší shody jako karty s portrétem, %, „x z y“ (žádné „vítěz“, medaile ani pořadová čísla).
- Záložka **Všichni poslanci**: řádky s pruhem jako dnes; řádek jde rozkliknout → porovnání otázka po otázce (✓ / ✕ / nehlasoval/a / nebyl/a v mandátu). Skupina „méně než 3 společné otázky“ zůstává.
- Záložka **Vaše odpovědi**: u každé otázky vaše odpověď, mini půlkruh, rozbalovací „Kdo jak hlasoval“ se jmény podle hlasu, odkaz na detail hlasování.
- Akce: **Sdílet výsledek**, „Pokračovat delším testem (+N)“ (u krátkého; odpovědi zůstávají), „Začít znovu“.
- **Obrázek ke sdílení** (stávající mechanismus `share.js`, stejný styl jako karty hlasování, tokeny `card`): „Moje shoda s českými europoslanci“, 3 nejvyšší shody (portrét, jméno, strana, %, x z y), počet zodpovězených otázek, datum, `epwatch.cz/kviz`, drobně „Není to doporučení, koho volit“. Generuje se v prohlížeči, nic se neodesílá. Web Share API tam, kde je, jinak stažení PNG.
- Pod výsledkem dál: „Není to hodnocení poslanců ani doporučení, koho volit.“ + zdroje.
- `o-projektu.html#moje-shoda`: doplnit obrazovky, odhalení bez jmen, obrázek ke sdílení.
- e2e (1366 a 390): projít krátký kvíz klávesami / klikem, ověřit odhalení bez jmen, výsledek, rozkliknutí řádku, záložku odpovědí, pokračování po reloadu; axe bez nových porušení.

---

## Pořadí a velikost
| # | Bod | Velikost |
|---|---|---|
| 1 | R1 struktura, menu, přesměrování | půl dne |
| 2 | R2 rozcestník (animace + dlaždice) | půl dne |
| 3 | K1 kvíz jako aplikace | 1 den |
| 4 | K2 výsledek a sdílení | půl dne |

Na konci screenshoty rozcestníku a kvízu (úvod, otázka s odhalením, výsledek) při 1366×900 a 390×844, světlý i tmavý režim, a souhrn změn.
