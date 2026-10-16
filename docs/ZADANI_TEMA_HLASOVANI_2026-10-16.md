# Zadání: téma hlasování na detailu, úvodu a kartách ke sdílení (16. 10. 2026)

Navazuje na `docs/REVIZE_DESIGN_2026-10-15.md` (S2, S5), `docs/REVIZE_SDILENI_2026-10-16.md` (N3) a `docs/REVIZE_UVOD_2026-10-16.md` (U1). Platí `CLAUDE.md` (žádná vymyšlená data, čísla a třídění počítá kód, každé číslo má zdroj, bez pořadí a hodnocení, česky, web bez build stepu).

## Proč
V kartě hlasování v seznamu (`votes.html`) je čip s tématem („Klima, příroda a energie“ + „+2“). Na detailu hlasování (`vote.html`, `v/{id}.html`) ani v hero kartě „Poslední hlasování“ na úvodu není. Názvy hlasování jsou anglicky, takže téma je pro laika nejrychlejší vodítko, o čem hlasování je.

## Princip
**Téma se nepřiřazuje znovu.** Použij přesně ten zdroj a tu funkci, ze kterých čip bere data karta v seznamu. Nic nového se nepočítá, nic nevymýšlí a AI do toho nevstupuje. Všude, kde se téma ukazuje, musí být pro dané hlasování shodné.

## T0 Průzkum (nejdřív, krátce)
1. Najdi, odkud karta v seznamu bere téma (pole v `votes/*.json` nebo `votes/search.json`, mapování témat, ikona čipu) a jak vzniká „+2“.
2. Vypiš, jak se téma určuje (pravidlo/zdroj). Pokud je to nějaké mapování, napiš ho jednou větou do metodiky (T6).
3. Zjisti, jestli data tématu mají statická stránka `v/{id}.html` (`build_pages.vote_page`) i `home.json` (`build_home.py`). Pokud ne, doplň je ze stejného zdroje.
Pokud téma u hlasování chybí (`null`), čip se nezobrazí. Nikdy ho nedopočítávej.

## T1 Společná komponenta
Jedna funkce `topicChips(topics, {max, link})` v `app.js` a její dvojče v `build_pages.py` (jako `infoButton` a `shareButton`). Stejné značky a třídy, stejné ikony jako u karty v seznamu. Test hlídá shodu JS a Pythonu.
- `max`: kolik čipů ukázat, zbytek jako „+N“ (popover nebo `details` se zbylými tématy, klávesnicí dosažitelné, ne jen `title`).
- `link: true`: čip je odkaz na `votes.html?topic=<slug>` (existující filtr podle tématu; pokud parametr nemá, doplň ho a čti při načtení).
- Čip nese text i ikonu, nikdy jen barvu. Na tmavém podkladu (hero) varianta `.chip--on-dark` z tokenů, žádné nové barvy.

## T2 Detail hlasování (`vote.html`, `v/{id}.html`)
- Do řádku nad nadpisem: `datum · [čipy témat] · [typ hlasování]`. Na detailu **všechna** témata (max 4, víc → „+N“), každé jako odkaz na filtr.
- Na mobilu (< 640 px) se řádek zalomí, témata pod datum a typ.
- JSON-LD / `meta description` statické stránky: doplň téma do věty (např. „Hlasování 7. 10. 2026 · Klima, příroda a energie · …“). Jen když téma existuje.

## T3 Úvod, hero „Poslední hlasování“ (`home.js`, `build_home.py`, `data/home.json`)
- `home.json` doplní u každého z pěti hlasování pole `topics: [{slug, label}]` ze stejného zdroje jako T0.
- V kartě: **jeden** čip (první téma) + „+N“, na samostatném řádku **nad** nadpisem hlasování. Řádek s datem, štítkem „závěrečné hlasování“ a „PŘIJATO“ se nemění (je plný).
- Čip je odkaz (T1). Při přepnutí 1/5 → 5/5 se čip vymění spolu s popiskem (stejná animace, `aria-live` popisek jej zahrne do textu).
- Bez JS (statický popisek) také čip ukázat.

## T4 Karty ke sdílení (`share.js`, `build_cards.py`)
- Karta hlasování (příspěvek 4 : 5, story, OG 1200 × 630): jeden čip s tématem (první téma + „+N“ jen jako text) nad názvem. Bez ikon sítí, bez log; text se vejde (`fitText`, „…“).
- Chybí-li téma, řádek se vynechá a zbytek karty se nepřesouvá jinak než dnes.
- Alt text a „Citovat“ obsahují téma, jen když existuje.

## T5 Instagram balíček (`scripts/build_instagram.py`)
- `popisek.txt` hlasování týdne začíná tématem (šablona, ne AI): „Téma: Klima, příroda a energie. …“. Téma se bere z dat, ne z textu popisku.
- `alt.txt` první slide zmiňuje téma.

## T6 Metodika (`o-projektu.html`)
Jedna věta v sekci o hlasováních: podle čeho se téma určuje (výsledek T0) a že ho nevybíráme my. Odkaz z ⓘ u čipu na tuto větu. Metodika se nezkracuje.

## Testy
- Python: `topicChips` JS = Python šablona; pro každé hlasování z `home.json` je téma stejné jako v `votes/*.json` a v `v/{id}.html`; chybějící téma = žádný čip, žádná prázdná značka.
- Karty: text se vejde, bez tématu se řádek nevypíše.
- E2E (`check-web.mjs`, 1366 i 390 px): čip je na detailu i v hero, má odkaz na filtr a po kliknutí se filtr použije; „+N“ se otevře klávesou a zavře Esc; hero čip se mění spolu s přepínačem 1/5; žádný vodorovný přetok při 320 px; axe bez nových porušení ve světlém i tmavém režimu.

## Hotovo když
- U každého hlasování se stejné téma ukazuje v seznamu, na detailu (statickém i interaktivním), v hero na úvodu a na sdílecí kartě.
- Žádné téma není přiřazeno novým způsobem ani AI.
- Čip je odkaz na filtr a funguje klávesnicí.
- Testy a `check-web` projdou.

## Rozhodnutí autora, která neměň
- Žádné pořadí, známky ani hodnocení. Téma je štítek, ne soud.
- Čísla a třídění počítá kód, AI nepřiřazuje témata.
- Publikace na Instagram zůstává ruční.

## Pořadí práce
| # | Bod | Velikost |
|---|---|---|
| 1 | T0 průzkum + T1 komponenta | hodina |
| 2 | T2 detail hlasování | hodina |
| 3 | T3 úvod (`home.json`, hero) | hodina |
| 4 | T4 karty ke sdílení + T5 Instagram + T6 metodika | půl dne |
