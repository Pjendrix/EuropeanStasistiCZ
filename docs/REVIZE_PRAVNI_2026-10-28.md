# Právní a faktická revize webu: zpráva R1 (audit)

Stav: **R1 hotová, čeká na schválení.** V kódu jsem nic neměnil (jediná změna v repu je tato zpráva). Opravy R2–R6 dělám až po schválení, každou jako malý commit `revize-pravni: …`.

Zadání: `docs/ZADANI_PRAVNI_REVIZE_2026-10-28.md`. Stav dat při auditu: export HowTheyVote z 24. 10. 2026, hlasování do 22. 10. 2026, web na `main` po PR #105.

## 1. Shrnutí

| Závažnost | Počet | Nálezy |
|---|---|---|
| Vysoká | 5 | R2-1, R4-1, R5-1, R5-2, R6-1 |
| Střední | 12 | R2-2, R2-3, R2-4, R3-1, R3-2, R3-3, R3-4, R3-5, R4-2, R4-3, R5-3, R6-2 |
| Nízká | 6 | R2-5, R3-6, R5-4, R6-3, D-1, D-2 |

- **Vzorek dat (kap. 2): 5 z 5 hlasování a všechna porovnaná čísla souhlasí s exportem HowTheyVote.** Našel jsem dva rozdíly proti čistému přepočtu z exportu, oba jsou záměrné a ani jeden není chyba výpočtu (D-1, D-2). Výpočty jsem nemusel zastavovat.
- Co je v pořádku: žádné cookies, žádné externí požadavky (fonty jsou vlastní, CSP povoluje jen vlastní zdroje), žádná osobní data poslanců nad rámec jména, mandátů, frakce, strany, výborů a fotky (datum narození, e-mail a sociální sítě z exportu se na web nedostanou), v patičce každé stránky je zdroj, datum dat, ODbL, CC BY a autorství portrétů, loga mají evidenci původu.
- Největší mezery: štítek u strojového překladu názvů hlasování (vidět není), chybějící sekce o osobních údajích, kredit fotek na kartách, logo EPP bez souhlasu a dohledatelnost dat, kterou veřejnost ověřit nemůže.

## 2. Kontrola dat na vzorku

Postup: vzorek jsem losoval deterministicky (`random.Random(20261028)`, seed je datum zadání). Originál jsem stáhl z `github.com/HowTheyVote/data/releases/download/2026-10-24/` (`votes.csv.gz`, `member_votes.csv.gz`) a porovnal s tím, co web publikuje (`public/data/votes/id/{id}.json`, `data/votes/search.json`, stránka `v/{id}`). Skripty jsou jen pomocné a leží mimo repo. Skript `scripts/check_sample.py --seed N` z testů zadání vyrobím ve fázi oprav.

**Pět hlasování** (ze všech 6 411 v datech): 191569 (29. 4. 2026), 192218 (30. 4. 2026), 194308 (16. 6. 2026), 196353 (15. 9. 2026), 197467 (6. 10. 2026).

| Co se porovnávalo | Výsledek |
|---|---|
| Počty celého EP (pro, proti, zdržel se, nehlasoval) a výsledek | shoda 5/5 |
| Hlas každého českého poslance (21 u každého hlasování) | shoda 105/105 |
| Frakce a strana poslance k datu hlasování | shoda 105/105 |
| Řádek v `search.json` (počty Čechů) | shoda 5/5 |
| Stránka `v/{id}` | existuje jen u 197467 (závěrečná), čísla na ní souhlasí; ostatní čtyři jsou dílčí hlasování bez statické stránky |

Omezení: ve vzorku nebyl žádný poslanec s odchodem nebo nástupem uprostřed období, takže zástupy se neprověřily. Doporučuji do skriptu přidat vzorek kolem 31. 7. 2024, 1. 8. 2024, 30. 7. 2025 a 3.–4. 10. 2025.

**Tři poslanci** (stejný seed): Jaroslav Knot (270261), Klára Dostálová (256853), Tomáš Kubín (261038). Přepočet z exportu jsem napsal nezávisle na `scripts/`.

| Poslanec | Účast (web / přepočet) | Hlasuje s frakcí (web / přepočet) |
|---|---|---|
| Knot | 3 535 z 4 317 / stejně, shoda | 2 683 z 3 524 / 2 684 z 3 525 |
| Dostálová | 5 178 z 6 411 / stejně, shoda | 3 908 z 5 161 / 3 909 z 5 162 |
| Kubín | 6 009 z 6 385 / 6 009 z 6 387 | 4 542 z 5 991 / 4 543 z 5 992 |

Obě odchylky jsem dohledal, nejsou to chyby ve výpočtu (viz D-1 a D-2). Do jejich vysvětlení jsem se zahloubal kvůli pravidlu „chyba ve výpočtu = zastavit“: výpočet dělá přesně to, co popisují definice, jen web používá jinou frakci než export a nepočítá hlasování, ve kterém export poslance nevede.

## 3. Nálezy

Značení: **[V]** vysoká, **[S]** střední, **[N]** nízká. „Hotovo“ je to, co už odpovídá zadání.

### R2 Štítky u obsahu od AI

**Hotovo:** u karty „shrnutí hlasování“ je text „Shrnutí napsala AI (Claude)… Plné znění na webu EP“ (`public/lib/share-cards.js:262`) a „shrnutí AI“ ve zdroji (`:311`); kvíz má viditelný štítek AI a odstavec „Názvy a popisy otázek napsala AI“ s modelem a promptem (`public/pages/kviz.js:177`, `:267`, `:322`); u vstupu generátorů se zahazují čísla, která nejsou ve zdroji (`scripts/quiz_summaries.py:93`, `vote_summaries.py:101`, `title_translations.py:67`). Zpětná kontrola uložených dat: žádné číslo mimo zdroj u `title_translations.json` (22 položek) a `vote_summaries.json` (20 položek). Číslice, které v textech jsou (roky a čísla předpisů), pocházejí z názvu.

- **R2-1 [V] Strojově přeložený název hlasování nemá viditelný štítek.** 22 závěrečných hlasování nemá oficiální český název a titul překládá Haiku (`data/title_translations.json`). Na stránce `v/{id}` je to nadpis `<h1>`, a věta „jde o překlad AI“ s odkazem na originál je schovaná v rozbalovátku „zdroje a odkazy“ (`scripts/build_pages.py:395–405`). V seznamech (22 stránek `p/{id}`, 38 stránek `v/…`, JS seznam na `votes`, `search.json`) se překlad zobrazuje bez jakéhokoli označení, protože `build_web.py:214,234` ukládá do sloupce `title` překlad bez příznaku (stránka `vote.html` příznak `title_cs_ai` má, `search*.json` ne). Karty a popisky pro Instagram berou stejný název (`build_instagram.py:128`).
  Návrh: přidat do `search*.json` příznak (např. sloupec `title_ai`), u názvu v seznamech i v nadpisu malý štítek „strojový překlad“ s odkazem na originál, viditelnou větu nad rozbalovátkem, na kartu a do popisku větu „Název přeložila AI“.
- **R2-2 [S] Sekce `o-projektu#ai` je neúplná a zastaralá** (`public/o-projektu.html:242`). Popisuje jen „shrnutí na úvodu“ a nezmiňuje překlad názvů, shrnutí bodů programu, názvy a shrnutí v kvízu. Chybí věta, že překlad může být nepřesný, a odkaz na nahlášení chyby.
  Návrh: jedna věta navrch (viz zadání), seznam všech míst s AI textem a odkaz na `#kontakt`.
- **R2-3 [S] Označení AI je místy nenápadné nebo chybí.** U shrnutí bodů programu na Zasedání je štítek jen „AI“ s popisem v atributu `title` (neukáže se na dotykovém zařízení; `scripts/session_page.py:201`). Na úvodu je v kartě kvízu AI název otázky bez označení (`scripts/portal.py:146`).
  Návrh: štítek „shrnutí AI“ viditelným textem, na úvodu štítek nebo neutrální název z oficiálního zdroje.
- **R2-4 [S] Výstupy pro Instagram.** `build_instagram.py:128,148` používá `share["title"]`, tedy i strojový překlad, bez označení. Zdroj české stopy (EP Open Data, CC BY) je jen v `zdroje.txt`, popisek uvádí jen HowTheyVote. Hlasování týdne se přitom zasílá s textem bez věty „Název přeložila AI“.
  Návrh: totéž jako R2-1 a do popisku doplnit EP Open Data, když je česká stopa.
- **R2-5 [N]** Zakázaná čísla hlídá jen generátor při vzniku, žádný test nekontroluje uložená data. Návrh: test, že každý uložený AI text neobsahuje číslici mimo svůj zdroj (u `vote_summaries` a `title_translations` projde dnes bez výjimky).

### R3 Výklad a metodika

**Hotovo:** metodika a odkazy na `o-projektu#metodika` jsou na `rozhodujici`, `rozkol`, `shoda`, `temata`, `prace`, `analyzy`, `hlasovani`, `votes`, `poslanci`; `duel` a `kviz` odkaz mají. Věta „Počty, ne hodnocení kvality“ je u práce poslance, „Bez pořadí a hodnocení“ u `poslanci`. Medián je u profilu vysvětlen (`scripts/profile_page.py:1094` a popup). Zakázaná hodnoticí slova v textu webu nejsou: nenašel jsem „nejlepší“, „nejhorší“, „propadák“, „ulejvák“ ani „žebříček“ (jen v komentářích kódu a v pravidlech „žádný žebříček“).

- **R3-1 [S] `rozhodujici`:** vysvětlení, že jde o aritmetiku hlasů a ne o tvrzení, jak by Češi hlasovali, na stránce není. Je v rozbalovací nápovědě (ⓘ) vedle nadpisu („Většinou jde o pozměňovací návrhy…“), nad výsledky jen věta „která by bez českých hlasů dopadla opačně“ (`public/rozhodujici.html`, `public/pages/rozhodujici.js`).
  Návrh: dvě věty viditelně nad výsledky: „Jde o prostý součet hlasů. Neříká, že by Češi hlasovali jinak, ani že je to dobře či špatně“, a odkaz na `o-projektu#metodika`.
- **R3-2 [S] `rozkol`, `shoda`, `duel`, `kviz`:** chybí věta, že čísla nejsou hodnocení (metodiku odkazují). Návrh: jedna stejná věta v úvodu každé stránky.
- **R3-3 [S] Profil poslance:** medián je vysvětlen, ale ne, že vyšší nebo nižší hodnota není známka. Případ „nepočítá se“ je u nezařazených popsán jen krátkým „nepočítá se“. Případ krátkého mandátu je jen v popupu (`profile_page.py:1085–1094`).
  Návrh: ke srovnání s mediánem věta „Vyšší ani nižší hodnota není známka“, u nezařazených „nezařazení nemají frakci“, u krátkého mandátu věta viditelně.
- **R3-4 [S] Řazení podle metriky je v rozporu s pravidlem „žádné pořadí“.** Na `poslanci` lze řadit sestupně podle účasti, účasti u závěrečných, hlasování s frakcí a shody s Čechy (`public/poslanci.html:110`), podobně `shoda` („Seřadit podle shody“). Profil ukazuje „Nejčastěji“ a „Nejméně často stejně“ s pěti dvojicemi (`profile_page.py:1321–1322`), `duel` obdobně, kvíz řadí poslance podle shody (to je záměr kvízu). Číslo je vždy vedle mediánu a texty jsou neutrální, ale výsledek je žebříček účasti.
  Návrh k rozhodnutí autora: ponechat řazení po frakcích a abecedně jako výchozí, řazení podle metriky buď odstranit, nebo před řazením zobrazit větu „Pořadí nevypovídá o kvalitě práce“.
- **R3-5 [S] Faktická chyba v odkazu ke vložení (embed) pro bývalé poslance.** `embed/p/118949.html` (Ondřej Kovařík, mandát skončil 30. 7. 2025) říká „Europoslanec za ČR · Patrioti“ v přítomném čase (`scripts/embed_pages.py:89`). Návrh: „Bývalý europoslanec (do 30. 7. 2025)“, u frakce a strany k datu konce mandátu.
- **R3-6 [N] Předběžná data.** Štítek „předběžné“ i smazání po exportu pokrývají `tests/test_preliminary.py`, `tests/test_portal.py` a e2e `preliminary_page.py`. Chybí strukturální test, že statistiky, kvíz, duel, profily a karty nikdy `data/preliminary/` nečtou (dnes ji čtou jen `preliminary.py`, `news*.py`, `portal.py`, `build_pages.py`, `build_web.py` pro čas obnovy). Aktuálně je složka prázdná. Návrh: statický test importů a testovací sestavení s falešným předběžným dnem, který nesmí změnit žádné číslo.

### R4 Ochrana osobních údajů

**Hotovo (ověřeno v prohlížeči na 33 stránkách):** žádné cookies, žádné externí požadavky, `localStorage` se po načtení nepoužívá (klíče vznikají až po akci: `theme` při přepnutí motivu, `epw-kviz-poslanci` a `epw-kviz-frakce` při kvízu, `epw-share-content`, `epw-share-format`, `ep-share-theme` při sdílení), fonty jsou vlastní, CSP `default-src 'self'`. Měření (Vercel Web Analytics, bez cookies) je popsáno v `o-projektu.html:340`. Z exportu HowTheyVote se na web nedostává datum narození, e-mail ani sociální sítě poslanců.

- **R4-1 [V] Chybí sekce o osobních údajích a identifikace provozovatele.** `o-projektu#osobni-udaje` neexistuje, v patičce není odkaz „Osobní údaje“ (`scripts/layout.py:245–252`). Provozovatel není nikde jmenován (v `LICENSE` jen „Pjendrix“), jediným kontaktem je formulář.
  Návrh: sekce podle zadání se zástupnými `{PROVOZOVATEL}` a `{EMAIL}`. Skutečný stav k popsání: veřejné údaje poslanců z EP; návštěvníci: Vercel Web Analytics (bez cookies), hosting Vercel (technické logy), formulář přes Formspree (e-mail a text), `localStorage` jen pro motiv, kvíz a sdílení, žádné externí fonty ani trackery. Pozor: v `o-projektu.html:335` stojí „Uloží se jen to, co vyplníte“, ale Formspree a Vercel zpracují i technické údaje (IP adresa). Text upravit podle skutečnosti.
- **R4-2 [S] Formulář a CSP.** Formulář posílá data třetí straně (`action="https://formspree.io/f/xyegyyjo"`, `public/o-projektu.html:324`; CSP `form-action` to povoluje). V textu je to uvedeno jednou větou. Návrh: doplnit do `#osobni-udaje` zemi zpracování a odkaz na zásady Formspree (neověřil jsem je, jen na to odkážu).
- **R4-3 [S] Fyzické osoby v registru zástupců zájmů.** Stránka `registr` zobrazuje 227 subjektů z Registru transparentnosti EU (`data/register_cz.json`), mezi nimi nejméně dvě fyzické osoby („Tomáš Prošek“, „Vladimír Šefrna, LL.M.“) a jednu advokátní praxi pojmenovanou jménem. Zdroj je veřejný, ale nejde o poslance ve veřejné funkci.
  Návrh k rozhodnutí autora: u fyzických osob uvádět jen kategorii a odkaz na oficiální záznam, nebo je vynechat; v `#osobni-udaje` popsat účel a postup výmazu.

### R5 Zdroje, licence, autorství

**Hotovo:** na všech prověřených stránkách je v patičce zdroj a datum dat; v patičce je „Data: HowTheyVote.eu (ODbL) a EP Open Data (CC BY 4.0). Portréty © European Union – Source: EP“ (`layout.py:246–248`); `DATA_LICENSE.md` a `o-projektu#licence-kod` uvádějí, že odvozená data jsou ODbL se sdílením za stejných podmínek a `otevrena-data` to říká u každého souboru; všech 18 log (8 frakcí, 10 stran) má v `data/manual/logos.json` zdroj, datum stažení a poznámku o úpravě, žádný soubor není bez záznamu; fotky mají jednotné `photo_credit` pro všech 24 poslanců; karty mají zdroj a datum v patičce (`shareFooter`).

- **R5-1 [V] Fotky na kartách nemají všude kredit.** Slide 1 karty poslance, kvíz a první strana duelu kredit mají (`share-cards.js:371,924,994`). Slidy 2 a 3 karty poslance (`mepMiniHead`, `:421–429`) a duelu (`duelMiniHead`, `:1024–1030`) fotku používají bez „© European Union – Source: EP“, zdrojová řádka ve slidech 2–3 uvádí jen HowTheyVote a EP Open Data. Návrh: doplnit kredit do zdrojové řádky, kde je fotka.
- **R5-2 [V] (rozhodnutí autora) Loga.** U EPP je v evidenci výslovně: „Web EPP uvádí, že logo nelze použít bez souhlasu“, a logo se přesto používá (`data/manual/logos.json`). U většiny dalších log je „podmínky neuvedeny“ (jen k identifikaci), u šesti stran je „volně ke stažení“. Všechna jsou ručně uložená, ale převedená do WebP a oříznutá o prázdný okraj (poznámky v souboru), takže „neupravujeme“ platí jen pro kresbu. Návrh: u EPP buď písemný souhlas, nebo dočasně barevný štítek se zkratkou (pravidlo `CLAUDE.md`), u ostatních jednu větu v `#loga`, že logo je převedené beze změny kresby. Právní posouzení značek nechávám na vás.
- **R5-3 [S] AI texty v otevřených datech.** `title_translations.json`, `vote_summaries.json`, `session_summaries.json` a `quiz_summaries.json` nejsou v `DATA_LICENSE.md`, a strojový překlad je v `votes/search.json` ve sloupci `title` bez příznaku (viz R2-1). Návrh: do licenční tabulky řádek „texty vygeneroval Claude Haiku, bez nároku na autorství, mohou být nepřesné“ a příznak v datech.
- **R5-4 [N] `LICENSE` v tomto repu je „všechna práva vyhrazena“**, `o-projektu#licence-kod` tvrdí „Výpočty GNU AGPL-3.0, viz LICENSE“. Odkaz míří do veřejného repa `ep-watch-cz-open`, kde AGPL je (exportuje se `docs/open-repo/LICENSE-AGPL-3.0.txt`), takže text sedí; do veřejného repa jsem neviděl, proto to neověřuji. Návrh: ověřit, že sync repa AGPL opravdu publikuje, a do `licence-kod` doplnit „ve veřejném repozitáři“.

### R6 Opravy a dohledatelnost

**Hotovo:** `o-projektu#opravy` existuje, formulář předvyplní adresu stránky (`?stranka=…`, `build_pages.py:854`, `public/pages/o-projektu.js:22`); odkaz „Našli jste chybu?“ je na všech 24 profilech, 665 hlasováních a 10 stranách; datum exportu je v patičce každé stránky; poslední export (24. 10. 2026) je v `votes/index.json` a git tagu `data-2026-10-24`.

- **R6-1 [V] Dohledatelnost ověřit nelze.** `o-projektu` slibuje značky `data-RRRR-MM-DD` „v repozitáři“, ale značky existují jen v soukromém repu (`data-2026-10-15`, `-17`, `-19`, `-24`), veřejné repo dostává jeden synchronizační commit a žádné značky (`.github/workflows/sync-open-repo.yml:52–61`), a značky se při vydání přesouvají (`git tag -f` a force push, `scripts/commit_data.sh:45–46`). Denní aktualizace vlastní práce (26.–28. 10.) se commitují bez značky.
  Návrh: přiložit k datům věc, kterou ověří kdokoli: tag exportu HowTheyVote (`2026-10-24`, veřejné releasy), kontrolní součty souborů v `votes/index.json`, a tagy do veřejného repa; popsat postup v `docs/OPRAVY_POSTUP.md` (viz R6-3). Do zprávy pro případ ohrady: číslo → profil/hlasování → `source.release` → release HowTheyVote → `scripts/check_sample.py`.
- **R6-2 [S] Patička a odkazy na chyby.** Patička nemá odkaz „Opravy“, jen „Kontakt a nahlášení chyby“ (bez předvyplněné stránky) a nemá „Osobní údaje“ (`layout.py:250`). Odkaz „Našli jste chybu?“ chybí na seznamech (`votes`, `poslanci`, `hlasovani`…), na stránkách `z/` (741) a na dynamických `vote.html`, `mep.html`, `party.html`. Adresa stránky je v poli „Odkaz na stránku“, ne v předmětu zprávy (`_subject` je stálý, `o-projektu.html`).
  Návrh: patička „Osobní údaje · Opravy · Kontakt“; `REPORT_PAGES` rozšířit o `z/`; předmět zprávy doplňovat JavaScriptem z `?stranka=`.
- **R6-3 [N] `docs/OPRAVY_POSTUP.md` neexistuje.** Návrh: šablona odpovědi (poděkovat, ověřit u zdroje, do 48 hodin opravit nebo vysvětlit metodiku, zapsat do Oprav).

### Dodatky k datům (nálezy z kontroly vzorku)

- **D-1 [N] Frakce poslanců s rozdílem mezi HowTheyVote a EP.** Kateřina Konečná je v exportu HowTheyVote 21. a 22. 10. 2026 nezařazená (152 a 76 hlasování), v EP Open Data je od 21. 10. 2026 v Patriotech. Web ji bere do frakce podle EP a započítá ji do většiny frakce Patriotů (`scripts/ep_groups.py`). Proto má „hlasování s frakcí“ u všech poslanců Patriotů o jedno hlasování víc než čistý přepočet z exportu (Knot, Dostálová, Kubín: +1/+1). Postup je správný (shodně s pravidlem „frakce k datu hlasování“), ale na webu není vysvětlený. Návrh: věta v `#metodika`.
- **D-2 [N] Hlasování, ve kterém export poslance nevede, se do jmenovatele účasti nepočítá.** U Tomáše Kubína export neobsahuje dvě hlasování z 18. 9. 2024 (169418 a 169419), přestože byl v mandátu (od 1. 8. 2024). Web počítá jen hlasování se záznamem (6 385), čistý přepočet podle dat mandátu dává 6 387. Definice „v kolika hlasováních v době mandátu hlasoval“ to nezmiňuje. Návrh: věta v definici účasti; zda jde o chybu exportu, nechávám na posouzení u zdroje (HowTheyVote).

## 4. Doporučené pořadí oprav

1. **R2** (R2-1 až R2-4): štítky u AI včetně dat, karet a Instagramu, text `#ai`.
2. **R4** a patička (R4-1, R4-2, R6-2): sekce o osobních údajích, patička, odkazy na opravy.
3. **R5** (R5-1, R5-3, R5-4): kredit fotek na kartách, AI soubory v licencích. R5-2 podle vašeho rozhodnutí.
4. **R3** (R3-1 až R3-6, D-1, D-2): věty u analytických stránek, embed pro bývalé poslance, testy.
5. **R6** (R6-1, R6-3): dohledatelnost, `OPRAVY_POSTUP.md`, `check_sample.py`.
6. Testy ze zadání (štítky AI, hodnoticí slova, zdroj a datum, patička, kredit fotek) napíšu průběžně s každou fází.

## 5. Otevřené otázky pro autora

1. **EPP logo (R5-2):** požádat o souhlas, nebo dočasně nahradit štítkem?
2. **Řazení podle metriky (R3-4):** odstranit, nebo ponechat s větou o kvalitě?
3. **Fyzické osoby v registru (R4-3):** vynechat, nebo uvádět jen kategorii a odkaz?
4. **Provozovatel a e-mail (R4-1):** doplníte `{PROVOZOVATEL}` a `{EMAIL}` sám, jak je v zadání. Chcete na webu uvést jméno, nebo jen e-mail?
5. **Veřejné repo a značky (R6-1):** mám značky `data-…` publikovat i do veřejného repa `ep-watch-cz-open`? To je změna, která se týká GitHubu mimo tohle repo, proto ptám.

## 6. Rozsah a co jsem neověřil

- Prošel jsem všechny typy stránek ze zadání v prohlížeči (`playwright` na lokální kopii, 33 stránek včetně vzorku `p/`, `v/`, `s/`, `z/`) a karty podle zdrojového kódu `share-cards.js`. Karty jsem nevykresloval do PNG a `build_instagram.py` jsem nespouštěl (potřebuje Chromium a vykreslení ze statických stránek); závěry o Instagramu jsou ze zdrojového kódu a z popisků.
- Nevidím produkční Vercel (skutečné hlavičky, měření, přesměrování z `european-stasisticz.vercel.app`) ani veřejné repo `ep-watch-cz-open`.
- Právní stránku (zda je použití log, jmen fyzických osob nebo AI textů v souladu se zákonem) neposuzuji, jen popisuji, co na webu je a co chybí oproti pravidlům `CLAUDE.md` a zadání.
