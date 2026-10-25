# EP Watch CZ – revize před veřejným spuštěním (25. 10. 2026)

Podklad: zip `EuropeanStasistiCZ-main` (export HowTheyVote k 24. 10. 2026). Web jsem lokálně sestavil stejně jako Vercel (`build_shards` → `build_pages` → `build_cards`, 1 722 stránek, 689 karet) a prošel 23 stránek v Chromiu na mobilu (390 px) i desktopu (1 440 px). Výkon jsem měřil na mobilu se 4× zpomaleným CPU a s Brotli.

**Stav:** 513 Python testů, 41 JS testů, ruff, ESLint i `check_data.py` prochází. Na žádné stránce nejsou chyby v konzoli ani 4xx požadavky. Audit ze 17. 10. je téměř celý hotový: XSS, CSP a hlavičky, zamčené závislosti, `getJSON` s timeoutem, ES moduly, odstraněné dvojí renderování profilu (TBT profilu kleslo z ~325 ms na 60 ms), shardy hlasování, `cleanUrls`, CSV injection a pražský čas.

**Celkový dojem:** technicky je web připravený na provoz. Před spuštěním zbývá hlavně **obsah a srozumitelnost**: neočeštěné názvy u klíčových hlasování, dvě skoro stejné úvodní stránky a málo vysvětlení, co jednotlivá procenta znamenají. Tohle uvidí novinář nebo politik jako první.

Publikum (podle odpovědí): novináři, analytici a politici s týmy, ale vše, co se sdílí, musí pochopit i laik. Analytika bez cookies. Politikům se pošle odkaz na profil a s médii se naváže spolupráce. Řazení tabulek podle čísla je povolené, web sám pořadí nedělá.

---

# ČÁST 1 – OPRAVY

## P0 – před spuštěním

### O1 Neočeštěné názvy u závěrečných hlasování
354 z 6 411 hlasování má anglický název, z toho **21 závěrečných**. Mezi nimi je i `Election of the Commission` (27. 11. 2024), tedy hlasování, které novinář hledá jako první. Dál například `Deforestation Regulation: provisions relating to the date of application`, `Objection pursuant to Rule 115(2) and (3): Genetically modified soybean MON 87769` (21. 10. 2026, vidět ve výpisu hlasování) a `Amending Directives (EU) 2022/2464 and (EU) 2024/1760…` (Omnibus, „stop-the-clock“).
- Doplnit ručně do `data/manual/` nebo dopřeložit (`titles_cs.json`) a přidat test do `check_data.py`: **závěrečné hlasování bez českého názvu = varování**.
- Překlad `…Helsinki-Uusimaa paper` (EGF/2026/004) je nedokončený, slovo „paper“ zůstalo v angličtině.
- 75 popisů dílčích hlasování zůstalo francouzsky (`Article 1 - alinéa 1…`, `Amendements de la commission…`). Rozšířit slovník `labels_cs.py`.

### O2 Dvě úvodní stránky se stejným H1
`/` (rozcestník, `portal.py`) i `/aktualne` (`hub.py`) mají nadpis „Co dělají v Bruselu čeští europoslanci“, a stejný je i úvod a statistiky. Pro Google jde o duplicitní obsah a uživatel neví, kde je.
- `/` zůstává hlavní stránkou (logo).
- `/aktualne` předělat na **„Novinky“**: časová osa posledních událostí (zasedání, změny frakcí, nové zprávy a pozměňovací návrhy, předběžné výsledky) s vlastním H1, např. „Co se v Bruselu dělo tento týden“. Návrh obsahu je ve V3.

### O3 Mobilní lišta: kvíz jako běžná položka
Oranžové kulaté tlačítko s ✓ uprostřed lišty působí jako „Potvrdit/Hotovo“. Na `/kviz` je tlačítko **Začít** pod lištou (top 815 px, lišta začíná na 775 px při výšce 844), takže první obrazovka kvízu nemá viditelnou akci.
- Lišta: Aktuálně · Poslanci · **Hledat** · Hlasování · Více. Kvíz přesunout do „Více“ a na úvod. Nebo pět stejných položek, kde kvíz má ikonu otazníku nebo „?“, ne ✓.
- Na `/kviz` dát „Začít“ nad výběr délky, nebo výběr sbalit (výchozí: Čeští poslanci + Rychlý).

### O4 Chybí vlastní stránka 404
`/neexistuje` vrací výchozí 404 Vercelu. Po sdílení a přejmenování URL (`/mep?id=` → `/p/`) půjdou lidé i na staré odkazy. Stačí `public/404.html` (Vercel ji použije sám) s hledáním a odkazy na poslance a hlasování.

### O5 Proces oprav a právo na odpověď (kvůli politikům)
`data/manual/corrections.json` je prázdný, což je v pořádku, ale politik, kterému pošleš odkaz na profil, musí za 10 sekund najít:
1. **jak nahlásit chybu** (formulář je na `/o-projektu`, ale z profilu se k němu nedostane jedním klikem),
2. **jak rychle reaguješ** (např. „do 3 pracovních dnů“),
3. **co opravíš a co ne:** chybu v datech nebo výpočtu ano, nesouhlas s tím, jak EP hlas zapsal, ne (pro opravu hlasu existují oficiální „corrections to votes“ EP, viz V9).

Návrh: na každém profilu a hlasování v patičce odkaz „Našli jste chybu?“, který vede na formulář s předvyplněnou URL. Do `/o-projektu#opravy` dát veřejný log oprav, i když je prázdný.

### O6 Měření návštěvnosti bez cookies
Vercel Web Analytics nebo Plausible. Obojí funguje bez cookie lišty, ale **CSP dnes blokuje** externí skripty i `connect-src`:
- Vercel Analytics: skript je z vlastní domény (`/_vercel/insights/script.js`), takže stačí zapnout v dashboardu a přidat `<script defer src="/_vercel/insights/script.js">` do `layout.py`. CSP `'self'` projde.
- Plausible: doplnit doménu do `script-src` a `connect-src`.
- Aktualizovat text v `/o-projektu` („nic se nesleduje“ → „měříme jen anonymní počty návštěv, bez cookies“).

## P1 – první týdny po spuštění

### O7 Stránka „Všechna hlasování“ je na mobilu stále těžká
TBT **1,37 s** (4× CPU), plný klid sítě po ~9 s. Důvodem je parsování `search.json` (1,75 MB, 6 411 řádků) a vykreslení seznamu. Ostatní stránky jsou v pořádku (profil 60 ms, úvod 415 ms).
- Výchozí pohled („jen závěrečná, aktuální měsíc“) vykreslit **staticky** v `build_pages.py` a `search.json` načíst až po prvním psaní nebo změně filtru.
- Nebo rozdělit index: `search-final.json` (710 řádků) pro výchozí pohled a plný index až po zaškrtnutí „všechna hlasování“.

### O8 `/radar` („Co se chystá“) má na mobilu 62 000 px a 4 500 uzlů DOM
Každá procedura má rozbalenou celou časovou osu (7–8 kroků).
- Ukázat jen poslední krok a příští termín, osu dát do `<details>`.
- Stránkovat po 20 nebo seskupit podle stavu: „na programu příštího zasedání“ / „v trialogu“ / „ve výboru“.

### O9 Čísla bez kontextu: „Hlasuje s frakcí“ 74,3 % vs. 58,6 %
Na profilu (např. Knotek) je „Hlasuje s frakcí 74,3 %“ (všechna hlasování) a níže „Hlasuje s frakcí – závěrečná 58,6 %“. Dál je tam „Účast na hlasování 88,3 %“ vs. „Docházka na zasedání 86,3 %“ vs. „Účast u závěrečných 88,7 %“ a „Shoda s ostatními Čechy 87,1 %“. Je to správně, ale **novinář z toho snadno vytáhne špatné číslo**.
- Ke každé metrice jednu větu přímo pod číslem, ne jen v ⓘ (na mobilu se tooltip špatně otvírá). Například: „Docházka = podepsal prezenční listinu. Účast = hlasoval. Může chybět i na přítomném.“
- Na profilu dát obě dvojice vedle sebe: **všechna / závěrečná**, aby rozdíl byl záměrný a viditelný.
- Velký rozdíl (> 10 p. b.) vysvětlit textem generovaným kódem: „U závěrečných hlasování se od frakce odchyluje častěji než u pozměňovacích návrhů.“

### O10 Výpis hlasování míchá výsledek EP a hlasy Čechů
Karta má odznak „Přijato“ (výsledek celého EP) a pod ním proužek „2 pro · 15 proti“ (jen Češi), ale **bez popisku**. Laik čte „přijato, i když 15 proti?“.
- Před čísla dát „Češi:“ a k odznaku „EP:“, nebo proužek s malým titulkem „čeští poslanci“. Týká se `/votes`, `/hlasovani`, `/temata` a karet na profilu.

### O11 Drobné vizuální chyby
- **Mobilní hero úvodu:** štítek „NEZÁVISLÝ PŘEHLED Z OFICIÁLNÍCH DAT · OD 16. / 7. 2024“ se láme uprostřed data. Pevná mezera `16.&nbsp;7.&nbsp;2024` (platí obecně pro všechna data a „p.&nbsp;b.“).
- **Úvod na mobilu:** dlaždice v „Novinky a přehledy“ jsou ve 2 sloupcích široké ~170 px a texty se lámou po 2–3 slovech („jmenovitých / hlasování od 17. 7. / 2024; sloupec = …“). Pod 480 px dát 1 sloupec.
- **Detail hlasování:** H1 má u dlouhých názvů 5 řádků písmem ~48 px (`/v/177745`). Zmenšit podle délky (`clamp()` + třída `.long` nad 120 znaků) a úřední podtitul nechat menší.
- **Profil:** tlačítko „Porovnat s…“ je oříznuté („Porovnat s…“ je i plný text, ale vypadá jako useknutý). Lepší je „Porovnat“ nebo „Duel“.
- **Poslanci:** karta „Česká delegace ve frakcích“ má pod půlkruhem ~250 px prázdného místa (kvůli výšce sousední karty). Zarovnat obě karty nahoru (`align-items: start`).
- **Data k…:** `/poslanci` uvádí „data k 22. 10. 2026“ (poslední hlasování), patička „k 24. 10. 2026“ (export). Obojí je správně, ale vypadá to jako nesoulad. Psát jednotně „hlasování do 22. 10. · export 24. 10.“.
- **Kvíz na úvodu:** tlačítka „Pro / Proti / Zdržel/a“ v náhledu vypadají klikací, ale nejsou. Buď je udělat funkční (první otázka rovnou z úvodu, viz V5), nebo je zobrazit jako text.

### O12 Změna frakce během období je na webu skoro neviditelná
`check_data.py` hlásí: poslankyně 23699 (Konečná) je od 21. 10. 2026 podle EP v PfE, HowTheyVote má NI. Pipeline to řeší správně (počítá podle EP a k datu hlasování). Pro novináře je to ale **zpráva**, a web ji ukazuje jen nepřímo.
- Na profil přidat řádek „Frakce: nezařazení (16. 7. 2024 – 20. 10. 2026) → Patrioti (od 21. 10. 2026)“.
- Na `/aktualne` dát položku „Změna frakce“ (V3).
- Statistiky „hlasuje s frakcí“ u takového poslance rozdělit po obdobích, jinak mísí dvě různé frakce.

### O13 Kód – drobnosti
- `profile.js:14` `detail.innerHTML = btn.dataset.detail`: HTML z `data-` atributu. Dnes je bezpečné, protože ho generuje Python s `esc()`. Je to ale jediné místo, kde se HTML přenáší přes atribut. Lepší je `<template>` v DOM a `cloneNode`, aby escapování nezáviselo na dvou vrstvách.
- `share.js` má 1 705 řádků (canvas karty, panel, toasty). Rozdělit na `share/panel.js`, `share/canvas.js`, `share/cards/*.js`. Kvůli rozsahu bude nejvíc chyb při dalších úpravách právě tady.
- `profile_page.py` (1 427 ř.) a `hub.py` (1 059 ř.) by si zasloužily rozdělit po sekcích, podobně jako je rozdělený JS.
- Build na Vercelu trvá ~1,5 min (1 722 stránek + 689 PNG). S růstem dat (každé zasedání +~400 hlasování) poroste. `build_cards.py` už přeskakuje nezměněné karty (`written` vs. `removed`), ověřit, že i `build_pages.py` nepřepisuje nezměněné soubory (aktuálně `written: 1722`, tedy všechny).

---

# ČÁST 2 – VYLEPŠENÍ

## A. Pro novináře a analytiky (hlavní publikum)

### V1 Citační blok a stabilní odkaz u každého čísla
Novinář potřebuje napsat „podle EP Watch CZ hlasoval X v 88,3 % hlasování (data k 24. 10. 2026)“.
- U každé metriky a každého hlasování tlačítko **„Citovat“**, které zkopíruje větu + URL + datum exportu. `citeText` už existuje, jde jen o to dát ho na viditelné místo.
- Odkaz na **snapshot** (`data-RRRR-MM-DD`), aby citace platila i po další aktualizaci.

### V2 Embed pro média (N1 z minulého auditu, zatím není)
`/embed/v/{id}` a `/embed/p/{id}`: kompaktní karta s výsledkem a zdrojem, `<iframe>` kód v panelu Sdílet. CSP `frame-ancestors *` jen pro `/embed/*`. Každé vložení je zpětný odkaz a karta nese datum a zdroj, takže se nedá vytrhnout z kontextu.

### V3 `/aktualne` jako „Novinky“
Chronologický feed generovaný kódem, žádná redakce:
- „Zasedání 19.–22. 10.: 24 závěrečných hlasování, Češi jednotní ve 23“
- „Kateřina Konečná přešla do frakce Patrioti (21. 10.)“
- „Ondřej Knotek: nová zpráva jako stínový zpravodaj – …“
- „Předběžné výsledky 12. 11. (budou potvrzeny)“
- „Nové na programu: …“

Stávající `feed.xml` může brát stejné položky. Feed na poslance se dělat nebude (rozhodnuto 25. 10.).

### V4 Stránka `/data` (open data)
Odkazy na JSON a CSV s popisem polí, licencí (ODbL + CC BY), snapshoty a příkladem citace. Dnes je kód na GitHubu, ale novinář nepozná, který soubor stáhnout. Volitelně později DuckDB-WASM (N4 z minulého auditu).

### V5 Řazení tabulek (povoleno)
`/poslanci` → „jako tabulka“: řazení kliknutím na záhlaví (účast, s frakcí, docházka, zprávy, PN, projevy), výchozí řazení abecedně nebo po frakcích. Ke sloupcům přidat **medián EP** jako referenční řádek, aby řazení nevytvářelo dojem žebříčku bez kontextu. Pod tabulkou CSV.

## B. Pro politiky a jejich týmy

### V6 Profil jako „vizitka“
Politik (a jeho tým) bude profil sdílet, pokud v něm najde i svou práci, nejen čísla:
- **Nahoře práce, ne účast.** Dnes jako první vidí „Účast 88,3 % (o 1,7 p. b. méně než medián)“. Pro politika je to defenzivní začátek. Pořadí „Co dělá“ (výbory, zprávy, stínové zprávy, otázky) → „Jak hlasuje“ → „Účast“ je férovější a pořád faktické.
- **Zprávy jako zpravodaj s výsledkem:** „vedl 5 zpráv, z toho 3 přijaty“. Ke každé dát odkaz na příběh zákona (`/z/`), ten už existuje.
- **Sdílecí karta „Moje práce v EP za rok 2026“** jako generovaný obrázek z dat (ne žebříček), který může tým postnout. Je to nejlepší způsob, jak se web dostane k jejich voličům.

### V7 Vysvětlení nepřítomnosti
Měsíc s účastí blízko 0 % (v grafu na některých profilech) bez kontextu vypadá jako ulejvání. Důvody (nemoc, rodičovská, oficiální mise) EP nepublikuje a web je nesmí domýšlet.
- Pod graf účasti dát poznámku: „EP neuvádí důvody nepřítomnosti (nemoc, rodičovská, oficiální mise). Poslanec může důvod doplnit přes formulář oprav, zobrazí se jako jeho vyjádření se štítkem.“
- To je zároveň **právo na odpověď**: krátké vyjádření poslance (max. 300 znaků, se štítkem „vyjádření poslance, neověřeno“) u konkrétního hlasování nebo metriky. Dobrý důvod, proč se politik na web vůbec podívá. Rozhodni, jestli to chceš (viz otázky).

### V8 Hlasování ČR v Radě EU vs. čeští europoslanci *(nový zdroj, vybral jsi)*
U stejného zákona: jak hlasovala česká vláda v Radě a jak čeští europoslanci. Dobrý příběh pro média („vláda pro, europoslanci vládní strany proti“).
- **Zdroj:** Rada EU publikuje výsledky hlasování o legislativních aktech jako Linked Open Data (RDF, SPARQL `http://data.consilium.europa.eu/sparql`, graf `…/dataset/votingresults`).
- **Pozor:** referenční GitHub vzorek Rady je od 2022 archivovaný. Před stavbou ověřit, že endpoint pokrývá i 2024–2026 a jak často se aktualizuje (SPARQL dotaz na poslední datum). Párovat přes číslo procedury (`2024/0123(COD)`), které už máš v `procedure_reference`.
- Licence: ověřit v open data politice Rady (obvykle volné užití se zdrojem).
- Náročnost: M (2–3 dny). Nová sekce na `/z/{procedura}` a na `/v/` u závěrečných hlasování.

### V9 Opravy hlasů („corrections to votes“)
EP zveřejňuje, když poslanec po hlasování ohlásí, že chtěl hlasovat jinak (opravy hlasování v zápisu, v HowTheyVote zčásti). Na profilu a u hlasování ukázat: „Poslanec po hlasování ohlásil záměr hlasovat proti (oprava nemění výsledek).“ Pro politiky je to fér a pro novináře zajímavé. Ověřit, jestli to HowTheyVote export obsahuje, nebo jestli je to v EP Open Data (`meetings/{id}/decisions` – vote corrections).

### V10 Registr transparentnosti a schůzky s lobbisty *(nový zdroj, vybral jsi)*
- **Registr transparentnosti EU** (organizace, zájmy, rozpočty) je ke stažení jako open data na data.europa.eu (XML/CSV export). Bez problému.
- **Schůzky europoslanců** se zájmovými skupinami zveřejňují sami poslanci na svých stránkách EP. **Zatím jsem nenašel oficiální API ani dataset EP.** Integrity Watch EU (Transparency International) je zobrazuje, ale data získává z webu EP. Podle tvého pravidla „žádný scraping“ to tedy nejde přímo.
- Možnosti: (a) ověřit, jestli EP Open Data API v2 schůzky nově neposkytuje (kandidáti: endpointy u `meps/{id}`, dokumenty typu „meetings with interest representatives“), (b) dotázat se Integrity Watch na licenci a převzít jejich data se zdrojem, (c) vynechat. Doporučuju nejdřív (a), viz otázky.

## C. Pro laiky (aby sdílený odkaz fungoval)

### V11 „O čem se hlasovalo“ u závěrečných hlasování – **odloženo, k dodělání**
Rozhodnuto: nechat 20 shrnutí na úvodu, doplňovat postupně na vyžádání.
Pozn.: 14 z 20 současných shrnutí má `source: "title"`, tedy jen přeformulovaný nadpis bez přidané informace. Až to budeš rozšiřovat, generovat jen tam, kde je `adopted_text`, a jinak shrnutí nezobrazovat. Levnější alternativa bez AI je odkaz na oficiální „Legislative Train“ nebo tiskovou zprávu EP, pokud ji Open Data API k proceduře vrací.

### V12 Sdílecí náhledy (OG) pro laiky
OG karty jsou jen pro 24 poslanců, 389 hlasování a 276 duelů. Ostatních ~6 000 hlasování a stránky `/z/`, `/s/`, `/temata` sdílí výchozí obrázek.
- Doplnit OG pro `/s/{strana}` a `/z/{procedura}`. Ty se budou sdílet nejvíc, protože strana a zákon jsou pro média nejčastější úhly.
- U `/v/` bez vlastní karty použít generickou kartu s nadpisem a výsledkem (Pillow šablona, ne celý půlkruh).

### V13 Hledání na úvodu jako hlavní vstup
Pole „Najdi poslance, stranu nebo hlasování…“ je v hero nejsilnější nástroj, ale na mobilu je až na 4. obrazovce hero (pod půlkruhem, karuselem a legendou). Na mobilu ho dát hned pod H1.

### V14 Kvíz – první otázka rovnou z úvodu
Karta kvízu na úvodu už ukazuje otázku s tlačítky Pro/Proti/Zdržel. Kliknutí by mělo rovnou zaznamenat odpověď a otevřít `/kviz` na 2. otázce. Konverze z „vidím kartu“ na „hraju“ je pak jedno klepnutí.

### V15 Přístupnost a čitelnost
- Velmi malý text: popisky metrik a poznámky jsou 11–12 px šedou `#64748B` (kontrast 4,6:1, těsně nad AA). Na mobilu zvednout minimum na 13 px.
- Tooltipy ⓘ: na dotyk otevřít jako `<details>` nebo popover API, ne `title`.
- Tmavý režim jsem vizuálně neprocházel. Kontrolu kontrastu má CI (axe), ale vyplatí se ručně zkontrolovat grafy a karty sdílení.

## D. Kód, provoz, infrastruktura

### V16 Monitoring produkce
- **Uptime a čerstvost dat:** GitHub Action jednou denně stáhne `https://epwatch.cz/data/freshness.json` a založí issue, když `release` je starší než `stale_days`. Dnes se selhání pipeline hlásí issue, ale výpadek deploye na Vercelu ne.
- **Chyby v prohlížeči:** bez externí služby stačí `window.onerror` → `navigator.sendBeacon('/api/err')` (Vercel function, která zapíše do logu). Volitelné.

### V17 Velikost repa a buildu
`data/` má 40 MB, `public/` po buildu 141 MB (z toho `public/data` 66 MB, kopie `data/` + 6 411 shardů). Počet souborů (~10 000) i čas buildu porostou, do konce období (2029) bude hlasování zhruba 3× víc. Ověř limity svého plánu Vercelu (počet souborů a délka buildu).
- Shardy hlasování seskupit po zasedání místo po jednom (`votes/session/2026-10-19.json`, ~30–60 kB).
- `public/data` nekopírovat celé, jen soubory, které web načítá (whitelist v `vercel_build.sh`).

### V18 Testy proti realitě
Testy ověřují logiku nad fixtures. Před spuštěním přidat **10–15 „zlatých“ kontrol** proti ručně ověřeným faktům z webu EP: např. „Hlasování o Komisi 27. 11. 2024: 370 pro, 282 proti, 36 zdrž.“ (ověřit proti zápisu EP), „Knotek je ve výboru ITRE“, „poslanec X hlasoval u Y pro“. Spouštět je v `check_data.py`. Když HowTheyVote nebo EP změní význam pole, chytí to právě tyhle kontroly, ne jednotkové testy.

### V19 Bezpečnost formuláře
Kontaktní formulář přes Formspree: zapnout v Formspree reCAPTCHA nebo honeypot (`_gotcha`). Po zveřejnění a nabídnutí politikům přijde spam i cílené zprávy.

---

# Shrnutí priorit

| Priorita | Body | Odhad |
|---|---|---|
| **Před spuštěním** | O1 české názvy, O2 domovská vs. Aktuálně, O3 mobilní lišta + kvíz, O4 404, O5 proces oprav, O6 analytika | 1–2 dny |
| **První týdny** | O7 výkon `/votes`, O8 `/radar`, O9 vysvětlení metrik, O10 „Češi:“ v kartách, O11 drobnosti, O12 změna frakce | 2–3 dny |
| **Růst – novináři** | V1 citace, V2 embed, V3 Novinky (bez feedu na poslance), V4 `/data`, V5 řazení | 4–6 dní |
| **Růst – politici** | V6 profil jako vizitka, V7 vyjádření poslance, V9 opravy hlasů | 3–4 dny |
| **Nové zdroje** | V8 Rada EU (ověřit pokrytí), V10 jen registr transparentnosti | 3–5 dní |
| **Odloženo** | V11 AI shrnutí všech závěrečných hlasování | – |

## Rozhodnutí z této revize
- Hlavní publikum: novináři, analytici a politici. Vše sdílené musí pochopit laik. Vysvětlivky ano, ale web není učebnice.
- AI shrnutí zůstávají jen na úvodu, rozšíření později (V11).
- Analytika bez cookies (Vercel nebo Plausible).
- Politikům odkaz na profil a spolupráce s médii.
- `/` je hlavní stránka, `/aktualne` se předělá na novinky.
- Kvíz je v mobilní liště běžná položka.
- Nové zdroje: Rada EU, registr transparentnosti.
- Řazení tabulek podle čísel je povolené (web sám neřadí).
- Právo na odpověď (V7): ano, krátká vyjádření poslanců, ručně schvalovaná, se štítkem „vyjádření poslance, neověřeno“.
- Lobbing (V10): jen registr transparentnosti, schůzky europoslanců se nedělají.
- Profil (V6): pořadí práce → hlasování → účast.
- Růstové funkce: embed (V2), Rada EU (V8), citace a `/data` (V1, V4) a Novinky (V3) souběžně. Feed a RSS po poslancích ne.
