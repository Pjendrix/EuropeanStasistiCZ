# EP Watch CZ – revize úvodní stránky: hemicykl 21 místo dekorace (16. 10. 2026)

Navazuje na `docs/REVIZE_DESIGN_2026-10-15.md` a `docs/REVIZE_SDILENI_2026-10-16.md` (tlačítko sdílení z hera používá nový panel). Platí `CLAUDE.md` (žádná vymyšlená data, čísla počítá kód, každé číslo má zdroj, bez pořadí a hodnocení, česky, web bez build stepu).

Vizuální předloha: `docs/mockups/uvod.html` (klikací, desktop, telefon, tmavý režim; data skutečná k 10. 10. 2026). Mockup je předloha vzhledu a chování, ne kód ke zkopírování.

---

## Proč

Hero dnes (`.home-hero`, `.home-art`, `.hero-emblem`) je dekorace: vlajka ve hvězdách a věta. Na hlavní stránce, kterou vidí každý návštěvník, **nenese jediné číslo ani jedinou informaci o datech**. Nikdo z ní nepozná, o čem web je, dokud nescrolluje. Hledání je malé a schované pod textem. Seznam „Zajímavé souvislosti“ je číslovaný, což na webu bez pořadí vyvolává dojem pořadí.

## Princip

**Hero ukáže data samotná.** Každý z 21 českých europoslanců je jedna tečka v hemicyklu a barva ukazuje, jak hlasoval v posledním závěrečném hlasování. Do tří vteřin je jasné, co web dělá (hlasování českých poslanců), na čem stojí (oficiální data) a kam jít (hledání, tři cesty). Nic nevybíráme redakčně: zobrazí se **pět nejnovějších závěrečných hlasování**, od nejnovějšího.

---

## U1 Hero (`index.html`, `home.js`, `style.css`)

Dvousloupcové rozložení na tmavém podkladu (stávající gradient hera). Vlevo text a hledání, vpravo scéna s hemicyklem. Pod tím pruh faktů (U3).

**Levý sloupec**
- Eyebrow „10. volební období · od 16. 7. 2024“ (zlatá, jako dnes).
- H1 beze změny textu: „Co dělají v Bruselu **čeští europoslanci**.“ Zlatá tečka na konci je kruh (`.stop`), ne znak.
- Jedna věta: „Hlasování, účast a práce na textech z oficiálních dat. Bez pořadí a bez hodnocení.“
- **Hledání** (U2) a pod ním čtyři rychlé odkazy (Poslanci, Strany, Hlasování, Práce poslanců). Rychlé odkazy jsou neutrální navigace, žádné „oblíbené“ nebo „nejčtenější“.

**Scéna vpravo (`.stage`)**
- Hlavička: tečka + „Poslední hlasování“ a přepínač `‹ 1 / 5 ›` (dvě tlačítka, 36 px, na `pointer: coarse` 44 px, šipky ← → na klávesnici uvnitř skupiny).
- **Hemicykl:** 21 teček ve dvou obloucích (vnitřní 96, vnější 150 v souřadnicích viewBoxu 400 × 232). Geometrii převezmi z `renderDelegation` v `home.js`, ať je na webu jeden hemicykl a ne dva různé. Kolem jemný půlkruh 7 hvězd (opacity .32) jako odkaz na EU, bez dalších dekorací.
- **Barva i symbol** (barva sama nestačí, `CLAUDE.md` přístupnost): pro = zelená ✓, proti = červená ✕, zdržel se = šedá –, nehlasoval = prázdný kroužek. Tokeny `--for`, `--against`, `--abst`, `--absent`. Mimo mandát v době hlasování = přerušovaný prázdný kroužek (u nejnovějších pěti hlasování se nevyskytne, ale logika musí být).
- **Pořadí teček** je pevné pro všech pět hlasování (dle `GROUP_ORDER`, pak strana, pak příjmení). Při přepnutí hlasování se tečky jen přebarví (500 ms, s malým zpožděním podle indexu), nepřesouvají se. Tím oko vidí změnu, ne nový obrázek.
- **Střed:** velké „14 : 1“ (pro : proti) a popisek „PRO : PROTI“. Čísla z dat hlasování, ne z AI.
- **Hover/fokus na tečku:** tooltip se jménem, stranou a hlasem; tečky stejné strany zůstanou, ostatní zesvětlí na 28 %. Tečka je odkaz na profil poslance (`mep.html?id=…`), klávesnicí dosažitelná (`aria-label` „Jméno, strana“).
- **Popisek pod hemicyklem** (`aria-live="polite"`): datum, štítek „závěrečné hlasování“, výsledek (✓ Přijato / Zamítnuto), titul hlasování (max 2 řádky), legenda s počty (jen nenulové), odkaz „Detail hlasování →“ na `vote.html?id=…` a ikonové tlačítko **Sdílet** (otevře panel z `REVIZE_SDILENI`, kontext = to hlasování).
- Při přepnutí popisek na 170 ms zprůhlední a vymění se. `prefers-reduced-motion`: žádné animace, jen okamžitá změna.

**Telefon (≤ 560 px):** jeden sloupec, pořadí: text, hledání, rychlé odkazy, scéna. Scéna má šířku obrazovky minus gutter, hemicykl se škáluje (viewBox), tečky zůstávají ≥ 24 px.

## U2 Hledání

Z drobného pole se stává hlavní ovládací prvek hera: výška 60 px, pilulka, zlatý fokusový kroužek.

- `role="combobox"` + `listbox`, `aria-activedescendant`, šipky, Enter, Esc maže. Klávesa **/** (mimo inputy) hledání zaměří; v poli je vidět `/` jako nápověda, při fokusu se změní na tlačítko „Hledat“.
- Výsledky seskupené: **Poslanci** (portrét, jméno, strana · frakce), **Strany**, **Hlasování** (titul, datum). Max 4 na skupinu. Řazení uvnitř skupiny abecedně / chronologicky, **ne podle „relevance“ nebo popularity**.
- Normalizace bez diakritiky (`normalize("NFD")`).
- Prázdný výsledek: „Nic jsme nenašli. Zkuste jméno, zkratku strany nebo téma hlasování.“
- Zdroj dat: stávající index vyhledávání, který už web má (nezavádět nový). Hlasování se hledají jen mezi těmi, které index obsahuje.

## U3 Pruh faktů

Čtyři čísla pod herem, všechna z dat a každé s popiskem, který říká, co se počítá:

| Číslo | Popisek | Zdroj v repozitáři |
|---|---|---|
| 21 | poslanců v mandátu | `meps.json` (aktivní) |
| 9 | českých stran a 2 bez strany | `parties.json` / `meps.json` (strana ≠ „Ind.“, počet nezávislých) |
| 6 154 | jmenovitých hlasování od 17. 7. 2024 | `splits.json` → `unity.considered` |
| 10. 10. 2026 | stav dat (export HowTheyVote), aktualizace každý týden | `session.json` / release |

Všechna čísla se čtou za běhu z JSON, nikde nejsou zapsána v HTML. Pokud nejsou data k dispozici, pruh se nezobrazí (ne „0“).

## U4 „Tři cesty do dat“ (bento)

Nahrazuje dnešní tři dveře. Mřížka 12 sloupců: **Poslanci** (5 sloupců, přes dvě řady, modrá), **Hlasování** (7, tmavá), **Práce** (7, světlá). Na ≤ 980 px jedna karta na řádek.

- **Poslanci:** mozaika 21 kulatých portrétů, 7 × 3, abecedně. Hover/fokus ukáže jméno a stranu pod mozaikou, klik vede na profil. Portréty s hlavičkou „© European Union – Source: EP“ v patičce stránky (stávající kredit).
- **Hlasování:** velké číslo 6 154 a sloupcový graf počtu hlasování po měsících od 7/2024 (`votes/index.json`). Poslední sloupec zlatý, ostatní zlatá s průhledností, `title` s měsícem a počtem. Graf je dekorativní (`aria-hidden`), číslo nese informaci.
- **Práce:** tři čísla ze `work_hub.json` totals: projevy v plénu (793), otázky Komisi a Radě (456), zprávy vedené jako zpravodaj (39). Pod nimi věta „Součet za všech 24 poslanců 10. období včetně bývalých · EP Open Data, stav k <datum>“. Rozdíl 24 vs. 21 musí být vysvětlen, jinak vypadá jako chyba.

## U5 „Další pohledy“

Nahrazuje číslovaný seznam „Zajímavé souvislosti“. **Bez číslování**, řádky s názvem, jednou větou a šipkou. Dva řádky nesou číslo ze dat:

- **Kde se Češi rozdělili:** „141 z 640 jednotně“ (`splits.json` → `unity.united_final` z `unity.considered_final`). Popis: „Závěrečná hlasování, v nichž se čeští poslanci neshodli.“ Štítek říká, v kolika případech byli jednotní, ne „rozdělení“, ať se nedá číst jako hodnocení.
- **Kde rozhodly české hlasy:** „32 hlasování“ (`decisive.json` → délka pole `votes`; definice „těsné“ je v poli `definition`).

Ostatní řádky (Strany, Podle témat, Shoda mezi Čechy) bez čísla.

## U6 Pás zásad a patička

Tmavý pás „Každé číslo má **odkaz na zdroj.**“ se třemi sloupci (Oficiální data, Bez pořadí a známek, Počítá kód, ne AI) a tlačítkem „Metodika a zdroje →“. Patička beze změny textu (licence ODbL, CC BY 4.0, kredit portrétů, nezávislost, odkazy).

---

## Pravidla dat (tvrdá)

1. **Hero ukazuje pět nejnovějších závěrečných hlasování** (`vote_kind == "final"`), seřazených od nejnovějšího data. Žádný redakční výběr, žádné „nejzajímavější“. Generuje `scripts/` (nový krok `build_home.py`, nebo rozšíření existujícího) do `data/home.json`: pole pěti objektů `{id, date, title, result, ppl:[{id, name, party, group, pos}]}`. Pozice `pos` ∈ F/A/B/N jsou **hlasy k datu hlasování**, ne k dnešku (viz `CLAUDE.md`).
2. Tečky = poslanci, kteří byli v mandátu v den prvního z těch pěti hlasování. Kdo ve starším hlasování mandát nedržel, má `pos: "X"`.
3. Titul hlasování se nepřekládá ani neupravuje (je v angličtině, jak ho dodává HowTheyVote), pod ním už je na detailu český popis, pokud existuje. Případný český titul jen z dat, ne z AI.
4. Středové „14 : 1“ je počet `F` a `A` z `ppl`, ne z jiného zdroje (jinak by se mohly rozejít s tečkami).
5. Pruh faktů a štítky u řádků U5 se čtou z existujících JSON. Žádné číslo není natvrdo v HTML ani v JS.
6. Žádné řazení poslanců nebo stran podle výsledku. Mozaika a hledání jsou abecedně.

## Přístupnost a výkon

- Hero nesmí posunout LCP: SVG se renderuje inline z `home.json`, žádný další request nad rámec dat. Fonty a obrázky beze změny.
- Tečka má vždy **symbol i barvu**; `aria-label` = „Jméno, strana“, aktuální hlas v `aria-live` popisku a v tooltipu.
- Kontrast textu na tmavém podkladu ≥ 4,5 : 1, tečky ≥ 3 : 1 vůči podkladu.
- Fokus viditelný (zlatý outline 2 px), všechny interaktivní prvky ≥ 44 px na dotyku.
- Funguje bez JS: hero ukáže statický popisek posledního hlasování a hledání odkáže na stránku Poslanci (progressive enhancement; hemicykl se kreslí JS, nebo ho při buildu vyrenderuje `build_pages.py`).

## Testy

- Unit: `build_home.py` vybere přesně 5 nejnovějších `final` hlasování, `F+A+B+N+X == 21`, pozice odpovídají `cz_positions` k datu.
- Konzistence: střed „F : A“ == počty teček v barvě pro/proti; pruh faktů == hodnoty v `splits.json` / `meps.json`.
- E2E (Playwright, desktop 1440 a telefon 400): žádný vodorovný přetok, přepínač 1/5 → 5/5 (tlačítka se vypínají na krajích), `/` zaměří hledání, šipky + Enter v hledání otevřou položku, Esc zavře.
- Tmavý i světlý režim: hero je tmavý v obou, zbytek stránky se přepíná tokeny.
- Regrese: stránky `v/`, `p/` a `mep.html` beze změny.

## Pořadí práce

1. `build_home.py` + `home.json` + testy (U1 data, U3 hodnoty).
2. Hero: hemicykl, přepínač, popisek (U1) bez hledání.
3. Hledání (U2) a pruh faktů (U3).
4. Bento a Další pohledy (U4, U5), pás zásad (U6).
5. Napojení na sdílecí panel (po `REVIZE_SDILENI`), do té doby tlačítko skryté.
6. Odstranit nepoužívané `.hero-emblem`, `.home-art`, `hero_art.py` (EMBLEM/STARS) po ověření, že je nic jiného nepoužívá. Symbol v hlavičce zůstává.

## Rozhodnutí autora

- **Počet hlasování ve scéně:** pět (jako v mockupu), nebo jen poslední? Pět dává pocit „živého“ webu, jedno je klidnější.
- **Přepínač:** má se scéna po několika sekundách sama přepínat? Doporučuji **ne** (pohyb rozptyluje, a navíc je to další pohyblivá věc pro `prefers-reduced-motion`).
- **Rychlé odkazy pod hledáním:** nechat čtyři, nebo odstranit, protože hlavní navigace nahoře dělá totéž?
- **Text tlačítka u řádku „Kde rozhodly české hlasy“:** „32 hlasování“ říká jen počet. Chcete přidat definici „těsné“ (rozdíl pod N hlasů) přímo sem, nebo jen na cílové stránce?
