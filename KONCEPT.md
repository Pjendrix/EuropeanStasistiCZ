# EP Watch CZ – koncept

Oct 14, 2026 · @PJX88

## Cíl a princip

Stránka jednou týdně automaticky stáhne oficiální data o 21 českých europoslancích, spočítá statistiky a nechá AI napsat česky srozumitelné shrnutí, co se v Parlamentu odhlasovalo a jak hlasovali Češi.

Klíčové rozhodnutí: **nescrapovat weby, ale brát data z oficiálních API a datových exportů.** Scraping HTML se rozbije při každé změně webu. Strukturovaná data jsou stabilní, legální a zdarma.

AI v tom nedělá sběr dat ani výpočty. Čísla počítá kód (deterministicky), AI jen překládá a shrnuje obsah hlasování do lidské řeči.

## Zdroje dat

Stačí dva zdroje, oba otevřené, bez API klíče a s licencí, která dovoluje vlastní použití s uvedením zdroje.

| Zdroj | Co z něj vezmete | Formát | Aktualizace |
| --- | --- | --- | --- |
| [HowTheyVote.eu – datový export](https://github.com/HowTheyVote/data) | Jmenovitá hlasování v plénu: jak hlasoval každý poslanec, název a téma hlasování, výbor, autoři pozměňovacích návrhů | CSV (stabilní odkazy na nejnovější verzi) | týdně |
| [EP Open Data API v2](https://data.europarl.europa.eu/api/v2) | Seznam poslanců (filtr CZ), frakce, výbory, dokumenty poslanců (zprávy, otázky), projevy na plénu, deklarace | JSON (REST) | průběžně, obvykle přes noc |

Omezení, se kterými je třeba počítat:

- HowTheyVote pokrývá **jen jmenovitá hlasování** v plénu, ne hlasování ve výborech ani hlasování zvednutím ruky.
- EP API má limit **500 dotazů za 5 minut** na endpoint. Pro 21 poslanců jednou týdně je to víc než dost.
- Při publikaci je nutné uvést zdroj (licence CC BY 4.0 u EP, ODbL u HowTheyVote).

## Co stránka ukazuje

Čtyři obrazovky, od přehledu k detailu.

1. **Přehled (žebříček)**: tabulka všech 21 českých europoslanců, řaditelná podle metrik níže. Barevně frakce a česká strana.
2. **Profil poslance**: docházka v čase, seznam jeho zpráv a stínových zpráv, otázky Komisi, projevy, výbory. Poslední hlasování s jeho volbou. Návrhy, pod kterými je podepsaný, s výsledkem.
3. **Hlasování**: každé jmenovité hlasování s AI shrnutím v češtině a s tím, jak hlasovali čeští poslanci (pro / proti / zdržel se / nepřítomen).
4. **Týdenní digest**: co se tento týden odhlasovalo, kde se Češi shodli a kde rozdělili, kdo chyběl.

Metriky práce, rozdělené podle váhy:

| Metrika | Co měří | Váha pro hodnocení |
| --- | --- | --- |
| Zprávy (zpravodaj) | Vedl legislativní text za celý Parlament | vysoká |
| Stínové zprávy | Vyjednával text za svou frakci | vysoká |
| Docházka na hlasování | Podíl jmenovitých hlasování, kde hlasoval | střední |
| Loajalita k frakci | Jak často hlasuje stejně jako většina jeho frakce | jen informativní |
| Shoda s ostatními Čechy | Jak často hlasuje stejně jako ostatní čeští poslanci | jen informativní |
| Otázky Komisi, projevy | Aktivita, kterou lze snadno nafouknout | nízká |

Souhrnné skóre doporučuji nedělat, nebo jen s transparentními vahami, které uživatel vidí a může měnit. Jedno číslo „pracovitosti“ jinak snadno zkresluje.

## Návrhy a podpisy poslanců

Dá se to, ale ne u všech typů návrhů stejně dobře: u zpráv a návrhů usnesení jde spolehlivě spojit autora s výsledkem, u pozměňovacích návrhů ve výborech je autor známý, výsledek ne.

| Typ návrhu | Co to je | Autor (zdroj) | Výsledek (zdroj) | Úspěšnost spočítatelná |
| --- | --- | --- | --- | --- |
| Zpráva (zpravodaj) | Text výboru, legislativní i nelegislativní | EP API, Legislative Observatory | HowTheyVote: hlavní hlasování, přijato / zamítnuto | ano |
| Návrh usnesení (B10-…) | Text k aktuálnímu tématu, podepisují ho poslanci za frakci | EP API: dokumenty pléna a jejich signatáři | HowTheyVote přes referenci dokumentu | ano |
| Pozměňovací návrh v plénu | Změna textu před finálním hlasováním | HowTheyVote zná jen typ autora (frakce, výbor, skupina poslanců), ne jména | HowTheyVote | částečně |
| Pozměňovací návrh ve výboru | Většina skutečné práce na textech | [Parltrack](https://parltrack.eu/schemas/ep_amendments): datová sada amendmentů s ID poslanců | Hlasování ve výborech nejsou strojově dostupná | jen počet, ne úspěšnost |
| Otázka Komisi | Dotaz s povinnou odpovědí | EP API | nehlasuje se | ne |

Co z toho na profilu poslance zobrazit:

- **Seznam všeho, pod čím je podepsaný**, se stavem: prošlo / neprošlo / propadlo / čeká.
- **Úspěšnost podle typu návrhu**: podíl přijatých zpráv, usnesení a pozměňovacích návrhů zvlášť, nikdy dohromady.
- **Srovnání s průměrem jeho frakce**: úspěšnost silně závisí na velikosti a pozici frakce, ne jen na poslanci.
- **S kým podepisuje**: nejčastější spolupodepisující, zvýrazněné spolupráce napříč frakcemi.
- **Témata jeho návrhů**: podle kategorií EuroVoc z HowTheyVote.

Pravidla výpočtu:

- „Propadlo“ (LAPSED) se nepočítá jako neúspěch. Návrh propadne, když projde jiný, který ho vylučuje.
- Výsledek hlasování je v HowTheyVote dostupný až od roku 2024, tedy pro celé současné volební období.
- Otevřená otázka: zda EP API vrací jména autorů pozměňovacích návrhů v plénu. Ověřit ve fázi 1, jinak zůstanou jen na úrovni frakcí.

## Portréty a loga

Portréty poslanců jsou oficiální a volně použitelné, loga stran a frakcí ne: jsou to ochranné známky, takže se stáhnou z oficiálních webů a použijí jen k identifikaci.

| Obrázek | Oficiální zdroj | Podmínky použití | Řešení v aplikaci |
| --- | --- | --- | --- |
| Portrét poslance | EP (profil poslance, [Multimedia Centre](https://multimedia.europarl.europa.eu/)), odkaz na fotku vrací i EP API | volné použití s uvedením „© European Union – Source: EP“ | stáhnout jednou týdně do repa, nehotlinkovat |
| Logo české strany | web strany, sekce pro média / ke stažení | ochranná známka strany | uložit ručně do `assets/logos/cz/`, jen pro identifikaci, bez úprav |
| Logo evropské frakce (EPP, ECR, Patrioti…) | web frakce, press kit | ochranná známka frakce | uložit ručně do `assets/logos/ep/` |
| Barva strany / frakce | stejné zdroje | – | v `parties.json`, záložní zobrazení, když logo chybí |

Loga se nemění často, proto je stačí stáhnout jednou ručně (asi 10 českých stran a 8 frakcí). U kandidátek více stran, např. SPOLU, se zobrazuje logo konkrétní strany poslance, ne koalice.

## Historie od voleb 2024

Aplikace pokryje celé 10. volební období: od ustavující schůze 16. 7. 2024 do současnosti. Volby v ČR proběhly 7.–8. 6. 2024.

- **Jednorázový backfill**: první běh stáhne všechna hlasování, dokumenty a podpisy od 16. 7. 2024. Další týdenní běhy už jen doplňují nové.
- **Všichni, kdo za ČR v období seděli**: i poslanci, kteří mandát opustili, a jejich náhradníci. Každý má datum začátku a konce mandátu.
- **Změny frakcí a stran v čase**: příslušnost se bere k datu hlasování (HowTheyVote to tak eviduje), ne podle současného stavu.
- **Docházka férově**: počítá se jen z hlasování v době, kdy byl poslanec v mandátu.
- **Časová osa na profilu**: měsíční vývoj docházky, počtu podpisů a úspěšnosti.
- **AI shrnutí při backfillu jen pro hlavní hlasování** (`is_main`), ne pro každý pozměňovací návrh. Jinak by šlo o tisíce volání.

## Role AI

AI dělá tři věci, všechny jednou týdně v rámci automatického běhu, ne při každém otevření stránky:

- **Shrnutí hlasování**: z názvu a popisu hlasování (anglicky, úřední jazyk) napíše 2–3 věty česky, o čem se hlasovalo a co by výsledek znamenal.
- **Kategorizace**: přiřadí hlasování k tématům (energetika, migrace, zemědělství…), aby šlo filtrovat. Část témat už dodává HowTheyVote (EuroVoc, OEIL), AI je jen doplní česky.
- **Týdenní digest**: z již spočítaných čísel napíše krátký článek, co se tento týden dělo.

Pravidla, aby AI nezkreslovala:

- AI dostane jen data, nikdy nepočítá čísla sama. Statistiky do digestu vkládá kód.
- Výstup AI se uloží do souboru a na stránce je označený jako „AI shrnutí“ s odkazem na originál.
- Žádné hodnocení poslanců od AI (typu „pracovitý / líný“). Jen fakta.

Vhodný model: Claude Haiku přes API (levný, na shrnutí stačí).

## Architektura a stack

Žádný server ani databáze: týdenní skript vyrobí JSON soubory a stránka je jen zobrazí. Stejný model jako u Squad Check (statické HTML + Vercel z GitHub repa).

```
HowTheyVote export (CSV) ─┐
                          ├─> GitHub Actions (1× týdně) ─> data/*.json v repu ─> Vercel (statický web)
EP Open Data API (JSON) ──┘          │
                                     └─> Claude API (Haiku): česká shrnutí, digest
```

Stránka při otevření nevolá žádné cizí API, takže odpadá problém s CORS i s limity dotazů. AI se volá jen pro hlasování, která ještě nemají shrnutí.

| Vrstva | Volba | Proč |
| --- | --- | --- |
| Sběr a výpočet | Python (pandas) nebo Node.js | CSV z HowTheyVote jde načíst jedním řádkem |
| Plánovač | GitHub Actions, cron 1× týdně | zdarma, bez vlastního serveru |
| Úložiště | JSON soubory v repu | historie změn zdarma přes git |
| Frontend | statické HTML + JS, grafy přes Chart.js | bez build stepu, snadné úpravy |
| Hosting | Vercel | nasadí se sám po každém commitu |

## Co budete potřebovat

| Položka | K čemu | Cena |
| --- | --- | --- |
| GitHub účet + repo | Kód, data a automatický týdenní běh (GitHub Actions) | zdarma |
| Vercel (Hobby) | Hosting statické stránky, nasazení z repa | zdarma pro nekomerční projekt |
| Anthropic API klíč | AI shrnutí a digest | odhadem do pár dolarů měsíčně (přibližné) |
| Python nebo Node.js | Skript na stažení dat a výpočet statistik | zdarma |

Znalosti: základní práce s CSV/JSON a HTML + JS. Skripty i frontend vám můžu napsat celé, vy je nahrajete do repa.

API klíč se uloží jako GitHub Secret, nikdy ne do kódu ani do stránky.

## Plán postupu a rizika

Každá fáze dává použitelný výsledek, AI přichází až na konec.

1. **Data**: skript stáhne české poslance z EP API a hlasování z HowTheyVote, uloží JSON. Ověřit ručně na 2–3 hlasováních proti howtheyvote.eu.
2. **Statistiky**: docházka, loajalita k frakci, shoda mezi Čechy. Vše v čistých funkcích, testovatelné.
3. **Stránka**: přehled + profil poslance + seznam hlasování. Nasazení na Vercel.
4. **Automatizace**: GitHub Actions jednou týdně spustí fáze 1–2 a commitne nová data. Vercel stránku sám přenasadí.
5. **AI**: shrnutí hlasování a týdenní digest. Ukládat do souborů, už shrnutá hlasování znovu neposílat.
6. **Rozšíření**: návrhy a podpisy (zprávy, usnesení a otázky z EP API, amendmenty z Parltracku, napojení na výsledky hlasování), porovnání s jinými zeměmi, e-mailový digest.

Rizika:

- **Změna formátu dat**: HowTheyVote označuje export jako experimentální. Skript má validovat sloupce a při změně spadnout s jasnou chybou, ne tiše počítat nesmysly.
- **Zkreslující metriky**: nízká docházka může mít důvod (nemoc, mateřská). Zobrazit čísla bez soudů a odkázat na zdroj.
- **Chyby AI**: shrnutí může zjednodušit nebo minout podstatu. Vždy odkaz na originální text hlasování.

## Zadání k vytvoření

Tuto sekci stačí předat jako zadání. Staví se po fázích z plánu výše, každá fáze končí funkčním výstupem, který zkontrolujete, než se jde dál.

**Struktura repa**

```
/scripts        fetch_meps, fetch_votes, fetch_proposals, fetch_photos, compute_stats, summarize
/data           meps.json, parties.json, groups.json, votes/YYYY-MM.json,
                proposals.json, stats.json, summaries/
/public         index.html, mep.html, vote.html, digest.html
/public/assets  photos/, logos/cz/, logos/ep/
/.github/workflows/weekly.yml
```

**Datový model (hlavní soubory)**

| Soubor | Obsah |
| --- | --- |
| `meps.json` | ID z EP, jméno, foto, mandát od–do, česká strana a frakce s historií změn, výbory |
| `parties.json` / `groups.json` | kód, název, zkratka, barva, cesta k logu |
| `votes/YYYY-MM.json` | hlasování v měsíci: název, datum, výsledek, téma, hlavní ano/ne, pozice každého českého poslance |
| `proposals.json` | zprávy, usnesení, amendmenty: typ, autoři (ID), datum, výsledek, odkaz na originál |
| `stats.json` | předpočítané metriky na poslance, celkem i po měsících |
| `summaries/` | AI shrnutí podle ID hlasování, s datem a použitým modelem |

**Obrazovky v1**: přehled, profil poslance, seznam a detail hlasování, týdenní digest. Česky, mobil i desktop.

**Akceptační kritéria**

- [ ] Zobrazí všechny poslance zvolené za ČR v 10. období, včetně těch, co odešli.
- [ ] Docházka 3 náhodně vybraných poslanců sedí s howtheyvote.eu.
- [ ] Výsledky 5 náhodných hlasování sedí s oficiálním zápisem EP.
- [ ] Každé číslo a shrnutí má odkaz na zdroj.
- [ ] Portréty mají uvedený zdroj EP, chybějící logo nahradí barevný štítek.
- [ ] Týdenní běh projde bez ručního zásahu a při změně formátu dat skončí čitelnou chybou.
- [ ] AI shrnutí jsou označená a nikdy neobsahují čísla, která nespočítal kód.

**Co rozhodnete vy před začátkem**

- Python, nebo Node.js pro skripty.
- Název a doména (Vercel subdoména stačí).
- Zobrazovat souhrnné skóre, nebo jen jednotlivé metriky.
- Loga stran stáhnete sám, nebo mám připravit seznam odkazů na jejich mediální sekce.

## Zdroje

- [HowTheyVote.eu – data na GitHubu](https://github.com/HowTheyVote/data)
- [HowTheyVote.eu – o projektu a licenci](https://howtheyvote.eu/about)
- [EP Open Data API v2](https://data.europarl.europa.eu/api/v2)
- [EP Open Data Portal – release notes](https://data.europarl.europa.eu/release-notes)

* [Parltrack – schéma datové sady amendmentů](https://parltrack.eu/schemas/ep_amendments)
* [HowTheyVote – popis tabulek exportu](https://github.com/HowTheyVote/data/releases/tag/2026-07-11)

- [EP Multimedia Centre – oficiální portréty poslanců](https://multimedia.europarl.europa.eu/)
