# Zadání: projevy v plénu a pozměňovací návrhy ve výborech

Navazuje na stránku **Vlastní práce** (`public/prace.html`, data `data/work.json`). Cíl: ukázat co nejúplněji,
kolik toho kdo dělá, a přitom zůstat u čísel, která spočítá kód z oficiálních dat. Platí všechna tvrdá pravidla
z `CLAUDE.md` (žádný scraping, žádná vymyšlená data, validace vstupů, čísla počítá kód).

## Rozhodnutí, která už padla (neměnit bez dotazu)

- **Žádné souhrnné skóre ani celkové pořadí.** Každá kategorie zvlášť.
- **Žádné hodnocení od AI** (kategorie typu „tahoun“, slovní verdikty).
- Třetiny v delegaci (`own_work.tier`) mají jen kategorie přičitatelné jednomu člověku:
  zprávy a stanoviska jako zpravodaj/ka a stínový/á zpravodaj/ka.
- Snadno nafouknutelné metriky (podepsané návrhy usnesení, otázky, **projevy, pozměňovací návrhy**) se ukazují
  jako počty **bez třetin**, šedě, s vysvětlením proč. Kde to jde, s mediánem celého EP jako kontextem.
- Velikost frakce se jen vysvětluje v textu, čísla se neupravují.

## 1. Projevy v plénu (EP Open Data API v2)

**Zdroj:** `https://data.europarl.europa.eu/api/v2` – endpoint pro projevy na plénu (v dokumentaci API
„speeches“). Odsud (cloudová session bez přístupu k EP API) nebylo možné ověřit přesný tvar odpovědi.

Postup:
1. Nejdřív stáhni ručně pár odpovědí pro jednoho poslance (např. 197528) a ulož zkrácený vzorek do
   `tests/fixtures/ep/speeches_MOCK.json`. Zkontroluj, jaká pole skutečně existují (ID poslance, datum,
   typ projevu, odkaz na bod jednání). **Když tam nejsou, zastav se a zeptej se.**
2. Nový skript `scripts/fetch_speeches.py` (vzor: `fetch_proposals.py` – throttling max. 500 dotazů / 5 min,
   cache, `require()` na očekávaná pole, čitelná chyba při změně formátu). Výstup `data/speeches.json`.
3. Rozlišuj typy, pokud je zdroj rozlišuje: **ústní projev v rozpravě**, **jednominutový projev**,
   **vysvětlení hlasování (ústní / písemné)**. Písemná vysvětlení hlasování se dají psát hromadně, proto
   je počítej zvlášť a do „projevů“ nesčítej.
4. Počty jen v době mandátu (stejně jako docházka).

## 2. Pozměňovací návrhy ve výborech (Parltrack)

**Zdroj:** Parltrack dump `ep_amendments` (schéma: https://parltrack.eu/schemas/ep_amendments), licence ODbL –
doplň do `DATA_LICENSE.md` a patičky.

Postup:
1. Dump je velký: stahuj streamovaně a hned filtruj na ID českých poslanců z `data/meps.json`. Do repa
   ukládej jen výsledek (`data/amendments.json`), ne celý dump. Ověř velikost a dobu běhu, ať se vejde
   do GitHub Actions.
2. Ulož zkrácený vzorek do `tests/fixtures/parltrack/amendments_MOCK.json` a ověř pole (ID poslanců,
   výbor, datum, reference procedury). **Chybí-li, zastav se a zeptej se.**
3. Počítej **počet pozměňovacích návrhů, pod kterými je poslanec podepsán**, a zvlášť **podíl** (každý návrh
   = 1 / počet podepisujících), aby hromadně podepsané návrhy nepřevážily. Výsledek hlasování ve výborech
   strojově dostupný není – neuváděj úspěšnost.
4. Počty jen v době mandátu, jen 10. volební období.

## 3. Výpočet a web

- Čisté funkce v `scripts/own_work.py` (nebo nový modul) + testy na fixturách. Výsledek do `own_work.json` →
  `build_web.build_work` → `work.json` (klíče např. `speeches`, `vote_explanations_written`, `amendments`,
  `amendments_share`).
- Medián EP: pokud jde levně spočítat ze stejného zdroje pro všechny poslance, přidej do `benchmarks.json`
  (vzor: docházka). Když ne, medián vynech, nic neodhaduj.
- `prace.html`: nová skupina sloupců **„Další aktivita“** (šedě, bez třetin): projevy, pozměňovací návrhy.
  Tabulka se musí vejít na šířku 1280 px (teď je přesně na hraně – zvaž přesun usnesení a docházky do
  této skupiny nebo přepínač „zobrazit další aktivitu“).
- Profil poslance (`profile.js`, `build_pages.py`): karty se stejnými počty.
- Metodika (`compute_stats.DEFINITIONS["work_profile"]`) a záznam v „Opravy a změny metodiky“
  (`o-projektu.html`).
- Workflow: přidat kroky do `.github/workflows/proposals.yml` nebo `weekly.yml`, `check_data.py` rozšířit
  o kontrolu rozumnosti (počet nespadne skokem na nulu).

## Akceptační kritéria

- `python -m pytest -q` prochází, nové funkce mají testy na `MOCK_` fixturách.
- Žádné číslo na webu bez zdroje; projevy a pozměňovací návrhy mají v patičce odkaz na zdroj a licenci.
- Na šířce 1280 px tabulka nepřetéká, na mobilu se posouvá jen tabulka, ne stránka.
