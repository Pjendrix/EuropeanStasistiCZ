# EP Watch CZ – design revize: méně textu, strany u hlasování, karty ke sdílení (15. 10. 2026)

Navazuje na `docs/REVIZE_2026-10-15.md`. Platí `CLAUDE.md` (žádná vymyšlená data, čísla počítá kód, každé číslo má odkaz na zdroj, bez pořadí a hodnocení).
Vizuální předlohy (skutečná data k 10. 10. 2026):
- `docs/mockups/web-zjednoduseni.html` (+ `png/web-zjednoduseni.png`) – S1, S2, S3
- `docs/mockups/karty-sdileni.html` (+ `png/mep-basic.png`, `mep-detail-2.png`, `mep-detail-3.png`, `vote-post.png`, `vote-og.png`) – S4, S5

Mockupy jsou předloha vzhledu, ne kód k zkopírování. Komponenty postav na stávajících helperech (`app.js`, `profile.js`, `share.js`, `build_pages.py`, `build_cards.py`).

---

## S1 Méně textu na první pohled (celý web)

**Stav: hotovo (15. 10. 2026). Místo `details.explain` u karet je tlačítko ⓘ s popoverem (`infoButton` / `noteLine` v `app.js`); úvodní věta + ⓘ na všech stránkách, jednořádkové zdroje. Hlídá `tests/e2e/check-web.mjs`. Popover ⓘ přímo v rohu karet `.metric` zatím není (karty mají beze změny citaci ❝).**

**Problém:** každá stránka začíná 2–4 odstavci vysvětlení, karty s čísly mají pod hodnotou 3–4 řádky drobného textu, pod každou sekcí je odstavec „Zdroj… Počítá se…“. Laik se musí prokousat textem, než uvidí data.

**Princip:** na první pohled jen *nadpis, jedna věta a data*. Definice, metodika, zdroje, „x z y“ a citace jsou o jedno kliknutí dál. Nic se nemaže, jen se přesouvá.

### Pravidla („textový rozpočet“)
| Místo | Viditelné | Schované (na vyžádání) |
|---|---|---|
| Hlavička stránky | `h1` + `.lead` = **1 věta, max. 140 znaků** | vše ostatní do `<details class="explain"><summary>ⓘ Jak to číst</summary>…</details>`, výchozí zavřené |
| Karta s číslem (`.metric`, `metricCard`) | popisek, hodnota, proužek, **1 řádek srovnání** („medián EP 89,9 %“) | definice, „5 886 z 6 154“, rozdíl v p. b., medián frakce, zdroj, metodika, Citovat → **popover pod tlačítkem ⓘ** v rohu karty (nahrazuje dnešní ❝) |
| Sekce (`h2`) | nadpis + max. 1 řádek úvodu | delší úvod do `details.explain` |
| Poznámky pod sekcí (`p.source`, `.small.muted`) | **1 řádek**: `Zdroj: X · data k D. M. RRRR · Jak počítáme` | metodické věty přesunout do `o-projektu.html#…` nebo do `details.explain` sekce |
| Legenda (třetiny, hlasy) | jeden řádek symbolů (`▲ ● ▼ třetina delegace`) | vysvětlení přes ⓘ |
| Záhlaví tabulek | max. 2 slova | vysvětlení sloupce v `title` + ⓘ u skupiny sloupců |

### Komponenty
1. **`infoButton(id)` + popover** (`app.js`, Python dvojče v `build_pages.py`): nativní Popover API (`<button popovertarget>` + `<div popover>`). Běží v top layer, takže nikdy neskončí pod jiným prvkem (souvisí s S3). Fallback pro prohlížeče bez `HTMLElement.prototype.togglePopover`: `<details>`. Obsah popoveru: nadpis metriky, definice (ze `stats.json → definitions`), „x z y“ + srovnání, odkazy **Zdroj · Metodika · ❝ Citovat**. Ovládání: Esc zavře, fokus se vrátí na tlačítko, `aria-label="Co to znamená, zdroj a citace"`. Tlačítko 30 px, na dotyku min. 44 px plochy.
2. **`details.explain`**: jednotný vzhled (karta, 14 px, max 72ch). Obsah je ve statickém HTML (SEO, citace, bez JS).
3. **Pravidlo „každé číslo má odkaz na zdroj“ zůstává splněné:** zdroj je v popoveru čísla a v jednořádkovém `p.source` sekce.

### Kde to udělat (všechny stránky)
`index`, `poslanci`, `party`/`s/`, `votes`, `vote`/`v/`, `rozkol`, `rozhodujici`, `shoda`, `prace`, `prace-poslanci`, `p/` + `mep.html`. **`o-projektu.html` (metodika) se nezkracuje.**
Příklad z `prace-poslanci.html` (screenshot autora):
- dnes: 2 odstavce (≈ 90 slov) + legenda přes celou šířku
- nově: `h1` „Práce na textech“ · lead „Kolik zpráv a stanovisek čeští poslanci vedou nebo vyjednávají za frakci.“ · `ⓘ Jak to číst` (oba odstavce uvnitř) · toolbar `Řadit` + `▲ ● ▼ třetina delegace` + `?`

### Vzhled
- Větší vzduch: mezera mezi sekcemi 56 px (dnes ~40), lead 17 px `--muted`, max. 58ch.
- Hodnoty v kartách zůstávají velké a lehké (300), popisky 14 px. Pod hodnotou nic menšího než 13 px.
- Méně rámečků: karty v jedné řadě sdílí jednu výšku (`align-items: stretch`), žádné vnořené karty v kartách.

### Hotovo když
- Viditelný text (mimo `details`, `[popover]`, tabulky a `o-projektu.html`) klesne v hlavičkách a kartách aspoň o polovinu. Claude Code vypíše před/po počet viditelných slov nad prvním blokem dat pro každou stránku.
- `tests/e2e/check-web.mjs` nově hlídá: `.lead` ≤ 160 znaků; viditelný text karty `.metric` pod hodnotou ≤ 1 řádek; žádný viditelný `<p>` > 220 znaků mimo `details`, `[popover]` a `o-projektu.html`; popover se otevře klikem i klávesou a zavře Esc; axe bez nových porušení.

---

## S2 Detail hlasování: kdo a za jakou stranu (v/*.html a vote.html)

**Stav: hotovo (15. 10. 2026). `scripts/vote_parties.py`, `czPartyRows` v `app.js`, test `test_party_rows_order_dots_and_verbs`.**

**Problém:** dnes čtyři sloupce jmen podle hlasu (pro / proti / zdržel se / nehlasoval). Není vidět, kdo je z jaké strany. U hlasování „20 pro“ je to jen dlouhý seznam jmen. Řádek „Podle českých stran“ pod tím je hustý text.

**Nově (mockup `web-zjednoduseni.html`, část S2):**
1. Hlavička: datum + typ, nadpis, pod ním jeden řádek „Za odst. 63 – PN 9 · A10‑0260/2025 · zdroje a odkazy ▾“ (HowTheyVote, interaktivní detail, přijatý text, OEIL schovat do rozbalovacího odkazu). Vpravo **Citovat** a **Sdílet** (S3, S5).
2. **Výsledek jako věta:** „✕ Zamítnuto – Pozměňovací návrh neprošel.“ Texty podle `vote_kind` a `inverted` (námitka: „Námitka neprošla – akt Komise platí.“). Věty jsou šablony v kódu, žádná AI.
3. Dvě karty s proužkem: Celý parlament / Čeští poslanci (jako dnes, kompaktnější).
4. **„Jak hlasovali Češi“ = řádek na stranu** (výchozí pohled), přepínač **Podle stran | Podle hlasu** (druhý = dnešní 4 sloupce; prázdné sloupce sbalené do „Nikdo: proti“):
   - sloupec 1: tečka barvy strany + zkratka strany + frakce malým písmem (k datu hlasování; když se poslanci jedné strany liší frakcí, vypsat obě: „PSH NI, PfE“),
   - sloupec 2: tečky = poslanci, barva = hlas (pro/proti/zdržel/nehlasoval = stávající tokeny, nehlasoval = kroužek),
   - sloupec 3: jména seskupená podle hlasu, slovo hlasu barvou hlasu a tučně: „**zdrželi se** Bžoch, Knot, … · **nehlasovala** Dostálová“. Rod a číslo slovesa podle `position_for()` / `by_gender()` (už existuje).
   - Řazení: strany podle počtu poslanců v hlasování, pak abecedně. Poslanec bez strany = „Ind.“ (stávající label z `parties.json`).
   - Jméno = odkaz na profil. Na mobilu (< 640 px) se sloupec 3 zalomí pod tečky.
5. Legenda jedním řádkem pod seznamem + „strana a frakce k datu hlasování“.
6. Tabulka „Jak hlasovaly frakce“ do `<details>` (výchozí zavřené), v summary „9 frakcí · zvýrazněné ty s Čechy“.
7. Zdroje jedním řádkem dole.
8. Stejná komponenta na statické `v/{id}.html` (`build_pages.vote_page`) i v `vote.html`. Data jsou v `cz_positions` (`national_party`, `group_code`), nic nového se nepočítá.

**Testy:** `test_build_pages.py` – řádky stran sedí s `cz_positions` (součet teček = počet poslanců v mandátu), pořadí stran, prázdná strana se nevypíše, správný tvar slovesa.

---

## S3 Chyba: nabídka „Sdílet“ je schovaná pod lištou sekcí (profil)

**Stav: hotovo (15. 10. 2026). Popover v top layer + `animation-fill-mode: backwards`; e2e kontroluje překrytí na `p/`, `vote.html` i `v/`.**

**Příčina (ověřeno v prohlížeči):** `.profile-head` má třídu `.reveal.in` s animací `rise` a `animation-fill-mode: both`. Konečný `transform` (i `none` z keyframes → `matrix(1,0,0,1,0,0)`) vytváří nový stacking context. `.share-menu` (`z-index: 30`) je tak uvězněná uvnitř hlavičky a následující sticky `.profile-nav` (`z-index: 5`) se vykreslí přes ni.

**Oprava (obě části):**
1. Nabídku sdílení vykreslovat jako **popover** (`popover="auto"` na `.share-menu`, otevírat `showPopover()`), polohu dopočítat k tlačítku (`getBoundingClientRect`, zarovnat vpravo/vlevo podle místa, na mobilu jako spodní panel přes celou šířku). Top layer = nad vším, bez z-index válek. Fallback bez Popover API: přesunout menu do `document.body` s `position: fixed`.
2. Animaci `.reveal` nenechávat ve stavu s transformací: `animation-fill-mode: backwards` (nebo po `animationend` třídu odebrat), aby hlavička po doběhnutí nevytvářela stacking context. Platí i pro další `.reveal` bloky s vyskakovacími prvky.
3. Sdílet a Citovat dát do hlavičky vpravo vedle sebe (stejně na profilu i u hlasování), ne pod odkazy.

**Test (e2e):** otevřít nabídku na `p/256846.html` a `v/{id}.html` při 1366 a 390 px, `document.elementFromPoint` ve středu každé položky menu vrátí tu položku (nic ji nepřekrývá). Esc zavře a vrátí fokus.

---

## S4 Karta poslance: základní + detail (share.js, build_cards.py)

**Stav: hotovo (15. 10. 2026), kromě volitelné „vizitky“ v hlavičce profilu (čeká na souhlas autora).**

Dnešní karta je dobrá, ale snaží se vejít víc věcí najednou. Návrh: **dvě úrovně**.

### S4a Základní (1 obrázek 4 : 5, story 9 : 16, OG 1200 × 630) – `png/mep-basic.png`
- větší portrét (380 × 475) s popiskem © EP, jméno 76 px, čipy **frakce · strana** (tečka + zkratka, bez log), „v mandátu od … / mandát … – …“,
- **jen dvě čísla vedle sebe**: Účast na hlasování (medián EP) a Hlasuje s frakcí (medián frakce), proužek 60–100 %, „x z y hlasování“,
- věta „Bez pořadí a hodnocení…“, patička se zdrojem a URL. Řádek „Práce na textech“ se přesouvá do detailu.

### S4b Detail = carousel 3 obrázků 4 : 5 (Instagram ho nahraje jako jeden příspěvek)
1. **1/3 = základní karta** (S4a).
2. **2/3 Jak hlasuje** (`png/mep-detail-2.png`): mini hlavička (kulatý portrét, jméno, frakce · strana, „2 / 3“) · proužek rozložení hlasů pro / proti / zdržel / nehlasoval s počty (`total.positions`) · dvě dlaždice: „Hlasoval jako většina EP“ (`outcome` + průměr frakce `group_outcome`) a „Účast u závěrečných hlasování“ (`attendance_main` + medián EP) · „Nejčastěji hlasuje stejně jako“: 3 čeští kolegové z `pairwise` (shoda %, strana). Jde o podobnost hlasování, ne o hodnocení; když má poslanec < 100 společných hlasování, řádek vynechat.
3. **3/3 Práce na textech a v plénu** (`png/mep-detail-3.png`): dlaždice Vedl zprávy (+ kolik přijato) · Stanoviska výborů · Stínové zprávy; Projevy (+ minuty) · Otázky Komisi (+ zodpovězeno) · Prezence (podle EP); řádek Výbory (člen) + náhradník. Patička „počty, ne hodnocení kvality práce“.
- Každý obrázek samostatně obhajitelný: datum dat, zdroj, URL, u čísel s mediánem medián. Žádné třetiny, žádné pořadí, žádné červeno-zelené hodnocení, žádná loga.
- Chybějící hodnota (`null`, kratší mandát, NI bez frakce) → dlaždici vynechat nebo „–“ s vysvětlením, nikdy nedopočítávat.
- Datum v hlavičce slidu = datum zdroje čísel na tom slidu (hlasování z HowTheyVote vs. EP Open Data se liší).

### Menu „Sdílet“ na profilu
```
Sdílet obrázek…                      (navigator.share, mobil – nabídne základní kartu)
Stáhnout – základní karta (4 : 5)
Stáhnout – detail, 3 obrázky (4 : 5) (navigator.share({files:[3 PNG]}) když jde, jinak 3 stažení)
Stáhnout – story (9 : 16)
───────────
Kopírovat odkaz · X · Facebook · WhatsApp
```
- Kreslení: rozšířit `renderCardPng(ctx, format)` o `kind: "mep-detail"` a `slide: 2|3`; `mepCardOps` rozdělit na `mepBasicOps`, `mepVotingOps`, `mepWorkOps`. Vše ze stejného `shareContext`, který profil už plní (doplnit `positions`, `outcome`, `groupOutcome`, `attendanceMain`, `pairwiseTop3`, `ownWork`, `activity`, `presence`, `committees`).
- OG 1200 × 630 (`build_cards.py`) = základní karta na šířku (portrét vlevo, dvě čísla vpravo).

### Lepší profil kandidáta na webu (navazující, volitelné)
Hlavička profilu jako „vizitka“ ve stejné logice jako S4a: portrét 120 px, jméno, čipy frakce · strana, mandát, **členství ve výborech (jen člen)** a vpravo dvě čísla s mediánem. Pod tím záložky (už existují) – Účast · Práce na textech · S kým hlasuje · Témata · Poslední hlasování. Úvodní souhrnná věta zůstává, ale jen jedna.

---

## S5 Karta hlasování (share.js, build_cards.py, v/*.html)

**Stav: hotovo (15. 10. 2026).**

**Dnes:** karta existuje jen v interaktivním `vote.html`; statické `v/{id}.html` (kam vedou odkazy z webu a vyhledávačů) tlačítko Sdílet nemá. Na kartě jsou Češi jako řada 21 teček + řádek po frakcích („PfE 1 proti, 6 zdržel se, 1 nehlasoval · EPP 3 proti, …“), kterému laik nerozumí: frakce nezná, zná strany.

**Nově – příspěvek 4 : 5 (`png/vote-post.png`):**
- hlavička: datum · typ hlasování,
- název (český z U7/X10, až bude; jinak anglický originál zalomený max. 3 řádky), pod ním „popis · reference“,
- **výsledek**: štítek „✓ PŘIJATO“ / „✕ ZAMÍTNUTO“ + věta podle typu (S2 bod 2),
- celý EP: počty + proužek,
- **„JAK HLASOVALI ČEŠI“** + souhrn s barevnými tečkami (funguje zároveň jako legenda),
- **mřížka 2 sloupce × strany**: zkratka strany + frakce malým písmem, tečky = poslanci (barva = hlas), vpravo „3 proti“ / „6 zdrž. · 1 nehl.“. Řazení jako v S2. Max. 12 stran (víc v delegaci není); když by se nevešly, sloučit jednočlenné strany do řádku „ostatní“ s tečkami a zkratkami.
- patička: zdroj, „strana k datu hlasování“, datum dat, URL.
- Story 9 : 16: stejný obsah, mřížka stran v jednom sloupci, víc vzduchu.

**OG náhled 1200 × 630 (`png/vote-og.png`, `build_cards.py`):** název, štítek výsledku + počty EP, proužek, „Češi: 3 pro · 9 proti · …“ a jeden řádek stran (zkrácený „…“). Generovat dál jen pro závěrečná hlasování a prozatímní dohody za posledních 12 měsíců; ostatní `v/` mají obecný OG obrázek webu.

**Tlačítko Sdílet na `v/{id}.html`:** `build_pages.vote_page` načte `share.js` a vloží `window.shareContext` jako inline JSON (stejná struktura jako ve `vote.html`, data už jsou v `cz_positions`), takže statická stránka umí kartu nakreslit bez dalšího stahování.

**Testy:** `test_build_cards.py` – text se vejde (měření šířky + „…“), součet teček = počet poslanců v mandátu, pořadí stran; e2e – na `v/{id}.html` existuje tlačítko Sdílet a „Stáhnout obrázek“ vrátí PNG 1080 × 1350.

---

## Pořadí práce
| # | Bod | Velikost | Soubory |
|---|---|---|---|
| 1 | **S3** oprava nabídky Sdílet (popover + reveal) | hodina | `share.js`, `style.css`, e2e |
| 2 | **S1** komponenty `infoButton` + `details.explain`, pak stránku po stránce | den | `app.js`, `profile.js`, `build_pages.py`, `style.css`, `*.html`, e2e |
| 3 | **S2** Češi podle stran na detailu hlasování | půl dne | `build_pages.py`, `vote.html`, `style.css`, testy |
| 4 | **S5** karta hlasování (nový layout) + Sdílet na `v/` + OG | půl dne | `share.js`, `build_cards.py`, `build_pages.py`, testy |
| 5 | **S4** karta poslance základní + detail (carousel) | den | `share.js`, `profile.js`, `build_cards.py`, testy |
| 6 | S4 „vizitka“ v hlavičce profilu (volitelné, po schválení autorem) | půl dne | `profile.js`, `build_pages.py` |
