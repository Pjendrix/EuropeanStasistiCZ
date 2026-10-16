# EP Watch CZ – revize sdílení: jeden panel s náhledem karty, sdílet odkudkoli (16. 10. 2026)

Navazuje na `docs/REVIZE_DESIGN_2026-10-15.md` (S3, S4, S5) a `docs/ZADANI_INSTAGRAM_2026-10-16.md` (I3, I4). Platí `CLAUDE.md` (žádná vymyšlená data, čísla počítá kód, každé číslo má zdroj, bez pořadí a hodnocení, česky, bez build stepu u webu).

Vizuální předloha: `docs/mockups/sdileni.html` (klikací, desktop i telefon, světlý i tmavý režim; data skutečná k 10. 10. 2026). Mockup je předloha vzhledu a chování, ne kód ke zkopírování. V mockupu se karty kreslí jako HTML, v ostré verzi je dál kreslí canvas v `share.js` a panel ukáže hotové PNG.

---

## Proč

Dnešní sdílení (`share.js`, S3–S5) funguje, ale na první pohled není jasné:

- **Dvě věci pro totéž.** Pilulka „Sdílet“ (jen detail hlasování a profil poslance) a ❝ v rohu každé karty s číslem. Návštěvník neví, co ❝ dělá (kopíruje citaci, ne sdílí).
- **Menu bez náhledu.** Seznam 4–7 textových položek („Stáhnout – detail, 3 obrázky (4 : 5)“). Formát je schovaný v textu, výsledek není vidět dřív, než se stáhne.
- **Zpětná vazba je hrubá.** Chyba přes `alert()`, stav jen přepsáním textu položky („Vytvářím…“, „Odkaz zkopírován“).
- **Na počítači nejde zkopírovat obrázek do schránky**, což je nejrychlejší cesta do Slacku, Teams nebo X.
- **Tlačítko je pokaždé jinde** (na profilu pod odkazy, u hlasování mezi odkazy) a existuje jen u dvou typů stránek.

## Princip

**Jedno místo, jedno slovo, jeden panel.** Tlačítko „Sdílet“ je na každé stránce na stejném místě. Otevře panel, kde nahoře vidíš přesně ten obrázek, který dostaneš, a vedle něj jedním pohledem: formát, hlavní akce, odkaz, kam dál. **Co je v náhledu, to se stáhne** (stejný blob, žádné druhé kreslení).

---

## N1 Komponenta sdílecího panelu (`share.js`, `style.css`)

Nahrazuje `openShareMenu`, `placeShareMenu` a styly `.share-menu`, `.sheet` pro sdílení. Stránky dál nastavují `window.shareContext`; rozšíří se o pole z tabulky N3.

**Kontejner**
- `<dialog>` + `showModal()`: top layer, zachytávání fokusu, Esc a `::backdrop` zdarma. Tím je S3 (nabídka pod sticky lištou) vyřešená natrvalo. Fallback bez `<dialog>`: `div` s `position: fixed` v `<body>` a `aria-modal="true"`.
- **≥ 641 px:** dialog max. 920 px, dva sloupce (vlevo náhled, vpravo ovládání 372 px), hlavička „Sdílet“ + kontext + ✕ přes obě.
- **≤ 640 px:** spodní panel (radius 26 px nahoře, grip, `max-height: 94dvh`, vnitřní scroll, hlavička sticky nahoře, **akční lišta sticky dole** s `env(safe-area-inset-bottom)`), nájezd `translateY` 280 ms. `prefers-reduced-motion`: bez animací.
- Barvy jen z tokenů (`--surface`, `--chip`, `--text`, `--muted`, nově `--stage` pro podklad náhledu: světle `#E8EDF4`, tmavě `#0A101E`). Žádné nové barvy mimo tokeny.

**Sloupec ovládání (shora dolů)**
1. **Formát** – segmentovaný přepínač (`role="radiogroup"`, šipky přepínají): ikona poměru stran + název + poměr (`Příspěvek 4 : 5`, `Story 9 : 16`; u poslance `Základní 4 : 5`, `Detail 3 × 4 : 5`, `Story 9 : 16`).
2. **Akce** – jedno velké primární tlačítko (54 px, pilulka) a pod ním sekundární:

| Prostředí | Primární | Sekundární |
|---|---|---|
| Telefon/tablet, kde `navigator.canShare({ files })` | **Sdílet obrázek…** (`navigator.share({ files, text, url })`); u detailu **Sdílet 3 obrázky…** | Stáhnout |
| Počítač | **Stáhnout obrázek** (u detailu **Stáhnout 3 obrázky**) | **Kopírovat obrázek** (`navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`; jen u jednoho obrázku, bez podpory API skrýt) |

   Instagram nemá webové sdílecí URL, proto v panelu není jeho ikona. Na telefonu ho nabídne systémový panel pod „Sdílet obrázek…“.
3. **Odkaz** – readonly pole s krátkou adresou bez `https://` (`epwatch.cz/v/169362`) a tlačítko **Kopírovat**; pod ním textové tlačítko **Kopírovat jako citaci** (převezme dnešní `citeText()`).
4. **Sdílet na** – WhatsApp, X, Facebook, E-mail: čtyři kulaté monochromatické ikony 48 px s popiskem (jednoduchá sada inline SVG, ne barevná loga sítí). Jsou to obyčejné `<a href>` s `rel="noopener noreferrer"` (stávající adresy z `openShareMenu`), žádné SDK sítí, žádné skripty třetích stran.
5. **Věta důvěry** s ikonou štítu (jedna až dvě řádky, podle typu karty): „Karta má datum dat, zdroj a adresu stránky. Bez pořadí a hodnocení.“ U poslance navíc „Portrét © European Union – Source: EP.“

**Náhled (levý sloupec)**
- Živě vykreslené PNG z `renderCardPng(ctx, format)` → `URL.createObjectURL(blob)` → `<img>` (`alt` poskládaný z dat karty). Výška 500 px (story 540 px), na telefonu 310 / 360 px. Pod ním `PNG · 1080 × 1350 px`.
- **Cache blobu** podle (kontext, formát). Primární akce používá týž blob, takže stažení a sdílení je okamžité. `URL.revokeObjectURL` při zavření.
- Při generování skeleton se světelným pruhem (jen když kreslení trvá > 150 ms).
- **Detail poslance (3 obrázky):** vodorovný `scroll-snap` karusel, aktivní obrázek uprostřed, vedle okraj dalšího, tečky `Obrázek 2 z 3` (`aria-label`), šipky ← → na klávesnici.

**Zpětná vazba**
- Žádný `alert()`. Úspěch: primární tlačítko na 1,8 s zezelená („✓ Staženo“, „Otevírám sdílení…“). Ostatní potvrzení (odkaz, citace, obrázek ve schránce) jako toast dole v panelu (`role="status"`, `aria-live="polite"`, 2,2 s).
- Chyba: toast s tím, co se stalo, tlačítko zůstane aktivní. `AbortError` (uživatel zavřel systémové sdílení) bez hlášky.
- Poslední zvolený formát (post/story) si pamatovat v `localStorage` (try/catch, stránka musí fungovat i bez něj).

**Přístupnost**
- `aria-labelledby` na nadpis, fokus po otevření na primární tlačítko, po zavření zpět na tlačítko, které panel otevřelo; Esc, klik na pozadí a ✕ zavírají.
- Všechny ovládací prvky ≥ 44 px na dotyku, viditelný `:focus-visible`, kontrast AA v obou režimech. Panel i tlačítka `display: none` v tisku.

---

## N2 Kde je tlačítko

| Místo | Tlačítko | Co se sdílí |
|---|---|---|
| Hlavička stránky: detail hlasování, profil poslance, strana (`v/`, `vote.html`, `p/`, `mep.html`, `s/`, `party.html`) | **Sdílet**, plná tmavá pilulka vpravo na řádku s odkazem „← zpět“. Stejné místo na každé stránce a šířce. | karta stránky |
| Přehledy (Kde se Češi rozdělili, Kde rozhodly české hlasy, Kdo s kým hlasuje) | **Sdílet pohled**, outline 36 px v toolbaru vpravo (vedle přepínače „Zobrazit“) | aktuálně zvolený pohled |
| Karta s číslem | v ⓘ popoveru (S1): **Sdílet číslo** a **Citovat** vedle sebe | jedno číslo |
| ❝ v rohu karet | **zrušit** (citace je v popoveru a v panelu jako „Kopírovat jako citaci“) | – |

Odkaz v panelu vždy vede na stejný pohled, který sdílející viděl: stav přepínačů přehledů (`view=…`) patří do `?query` nebo `#hash` a stránka ho při načtení čte. Základ adresy z `BASE_URL` (I1).

`build_pages.py` generuje tlačítko pro statické stránky ze stejné šablony jako `shareButton()` v JS (dvojče jako u `infoButton`), test hlídá shodu.

---

## N3 Co všechno lze sdílet

| Typ (`shareContext.kind`) | Kde | Formáty | Stav |
|---|---|---|---|
| `vote` | detail hlasování | post, story | existuje (`voteCardOps`), jen se přesune do panelu |
| `mep` | profil poslance | základní, detail ×3, story | existuje (`mepBasicOps`, `mepVotingOps`, `mepWorkOps`) |
| `metric` | ⓘ u karty s číslem | post, story | **nová** |
| `split` | `rozkol.html`, `rozhodujici.html` | post, story | **nová** |
| `party` | `s/`, `party.html` | post, story | nová (po schválení autorem) |
| `pair` | `shoda.html` | post | nová, volitelná |

**Karta čísla (`metric`)** – kontext zlatě nahoře (jméno · frakce · strana), název metriky, hodnota 230 px, osa s mediánem (stejná osa 60–100 % jako `metricOps`), „x z y hlasování v době mandátu“, **jedna věta definice** ze `stats.json → definitions`, patička se zdrojem, datem dat a URL s kotvou (`…/p/118949#dochazka`). Metriky bez mediánu (např. shoda s Čechy): osa se vynechá, nikdy se nedopočítává. Jen metriky, které web dnes zobrazuje s ⓘ.

**Karta přehledu (`split`)** – titulek stránky, věta o zasedání („Zasedání 5.–8. 10. 2026: 227 hlasování, Češi se rozdělili v 219. Zde 5 s největším rozdělením.“), 5 řádků (post) nebo 7 (story) **ve stejném pořadí jako na stránce**: datum · typ · výsledek, název (max. 2 řádky, „…“), vpravo „8 : 8 pro : proti“. Počet zobrazených řádků je na kartě vždy výslovně napsaný. Neřadí se poslanci, řadí se hlasování podle míry rozdělení, tedy stejně jako web.

**Karta strany (`party`)** – název a zkratka, počet poslanců v mandátu, tři dlaždice ze „Souhrn za stranu“ (účast, jednotnost, soulad s výsledkem) s „x z y“, patička. Bez log (pravidlo karet), bez porovnání mezi stranami.

**Tabulky a grafy** – sdílí se výřez, ne celý objekt: nejvýše prvních N řádků aktuálního pohledu (zbytek „… a dalších 45“) nebo graf, který stránka už kreslí z dat v JS (ověř v `profile.js`, začni měsíční účastí z `monthly`), vykreslený přes `barOps`. Matice na `shoda.html` se jako obrázek nesdílí (nečitelná); místo toho klik na buňku nabídne **Sdílet shodu** → karta `pair`: dvě jména, % shody, „x z y společných hlasování“, strany obou.

**Pravidla všech karet (beze změny):** datum dat, zdroj a adresa na každé; žádné pořadí poslanců, známky ani hodnocení barvou; žádná loga stran ani frakcí; chybějící hodnota (`null`, kratší mandát, NI bez frakce) → dlaždici vynechat, nikdy nedopočítat; text se vejde (`fitText` / `wrapText`, „…“).

---

## N4 Portrét (rozhodnutí autora)

- **Karty ze sdílení na webu mají fotku poslance** s popiskem „© European Union – Source: EP“, jako dnes. V panelu žádný přepínač portrétu.
- **Neutrální silueta (stejná pro všechny) jen v balíčku pro Instagram**, který generuje `scripts/build_instagram.py` (I3, I4). Do `shareContext.data` přidat `avatar: "photo"` (výchozí) nebo `"neutral"`; web posílá vždy `photo`, `build_instagram.py` vždy `neutral`. Kdyby se pravidlo později změnilo, mění se jen tahle jedna hodnota v generátoru.

---

## Testy

**e2e (`tests/e2e/check-web.mjs`), při 1366 i 390 px:**
- na `v/{id}.html`, `p/{id}.html`, `s/{id}.html`, `rozkol.html` existuje jedno tlačítko `[data-share]` ve stanoveném místě;
- klik otevře `dialog[open]`, fokus je na primárním tlačítku; `document.elementFromPoint` ve středu každého ovládacího prvku vrací ten prvek (nic ho nepřekrývá); Esc zavře a vrátí fokus;
- přepnutí formátu změní náhled: `img.naturalWidth === 1080`, `naturalHeight` 1350 (příspěvek) nebo 1920 (story); detail = 3 obrázky v karuselu;
- „Stáhnout“ vrátí PNG stejných rozměrů, jaké ukazuje náhled; `ClipboardItem` ověřit mockem;
- žádné volání `alert()`; úspěch i chyba přes `role="status"`;
- axe v otevřeném panelu ve světlém i tmavém režimu bez nových porušení; při 360 px žádný vodorovný scroll;
- v ⓘ popoveru u čísla je „Sdílet číslo“ a otevře panel s kartou `metric`.

**Python:** `test_build_pages.py` – šablona tlačítka v Pythonu = šablona v JS; v statickém HTML už není `.cite-btn` (jen v popoveru). `test_build_cards.py` – nové karty `metric` a `split`: text se vejde, chybějící hodnota vynechána, počet řádků v textu karty = počet vykreslených řádků.

---

## Pořadí práce

| # | Bod | Velikost | Soubory |
|---|---|---|---|
| 1 | N1 panel (dialog, náhled s cache, akce, toast), odstranit `.share-menu` | den | `share.js`, `style.css`, e2e |
| 2 | N2 tlačítka do hlaviček a toolbarů, zrušit ❝, akce v ⓘ popoveru | půl dne | `app.js`, `profile.js`, `vote.html`, `build_pages.py`, `*.html` |
| 3 | N3 karty `metric` a `split` (post, story) | půl dne | `share.js`, `build_cards.py`, testy |
| 4 | N4 příznak `avatar` + napojení na `build_instagram.py` | hodina | `share.js`, `scripts/build_instagram.py` |
| 5 | N3 karta `party`, výřez tabulky/grafu, `pair` (po schválení autorem) | den | `share.js`, `party.js`, `shoda.html` |

## Hotovo když

- Na každé stránce, kde sdílení dává smysl, je jedno „Sdílet“ na stejném místě a otevře panel s živým náhledem.
- Na počítači jde obrázek stáhnout i zkopírovat, na telefonu poslat přes systémový panel, vždy jedním kliknutím z panelu.
- Žádný `alert()`, žádná nabídka pod sticky lištou, ❝ v rozích karet zmizelo.
- Karty `metric` a `split` mají datum dat, zdroj a URL; chybějící hodnota se vynechá.
- `check-web` (e2e) a axe bez nových porušení, testy Pythonu projdou.

## Rozhodnutí autora, která neměň

- Žádné pořadí, známky ani hodnocení poslanců. Vliv velikosti frakce jen textem.
- Karty z webu s fotkou poslance; neutrální avatar jen v Instagram balíčku.
- Čísla počítá kód; karta jen zobrazí čísla stránky. AI do karet nevstupuje.
- Panel nic nepublikuje sám: žádné přihlášení do sítí, žádná SDK sítí, žádné trackery. Publikace na Instagram zůstává ruční.
