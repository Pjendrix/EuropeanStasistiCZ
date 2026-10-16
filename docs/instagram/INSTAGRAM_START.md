# EP Watch CZ – Instagram: start (16. 10. 2026)

Navazuje na koncept Instagramu. Vzorové šablony jsou vygenerované skriptem `build.py` ze skutečných dat webu (vzorové hlasování 197509 z 7. 10. 2026, vzorový poslanec = první abecedně, aby nešlo o výběr).

## 1. Nastavení účtu (jednou, ~1 hodina)
1. Účet typu **Profesionální (Tvůrce nebo Firma)**, jméno `EP Watch CZ`, handle `@epwatch.cz` (ověř volnost).
2. Profilovka: `D0-avatar.png` (symbol oka s hvězdami).
3. Bio (max. 150 znaků): `Jak hlasují čeští europoslanci. Oficiální data, bez hodnocení a pořadí. Nezávislý projekt.`
4. Odkaz v bio: `epwatch.cz` (doména koupená 16. 10. 2026, viz bod 7).
5. Highlighty (Stories → Zvýraznit): Jak číst, Zdroje, Opravy, Poslanci, Rozkoly (`D1–D5`). Zatím stačí prázdné „Jak číst“ a „Zdroje“ naplnit slidy B2 a B5.
6. Alt text u každého slidu (Pokročilá nastavení) – texty níže.
7. Pravidla komentářů do bio highlightu nebo připnutého komentáře: skrýváme urážky a spam, kritiku ne.

## 2. Prvních 9 příspěvků (zásoba před startem)
Mřížka profilu = `E-mrizka-profilu.png` (zástupné pořadí).

| # | Příspěvek | Formát | Hotovo |
|---|---|---|---|
| 1 | **Úvod: Jak hlasují čeští europoslanci** (B1–B5: tečka, čísla, co nedělám, zdroje) | karusel 5 | ✓ šablona |
| 2 | **Hlasování týdne** (A1–A5) | karusel 5 | ✓ vzor |
| 3 | **Poslanec v kostce** (C1) | 1 obrázek (později karusel 3) | ✓ vzor |
| 4 | Kde se Češi rozdělili (z `rozkol.html`) | karusel | šablona A3 |
| 5 | Vysvětlovač: Co dělá zpravodaj a stínový zpravodaj | karusel 4 | nová |
| 6 | Poslanec v kostce č. 2 | 1 obr. | šablona C1 |
| 7 | Rozhodující hlasování (o kolik hlasů se rozhodlo) | karusel | šablona A2 |
| 8 | Strana v kostce | karusel | nová |
| 9 | Jak počítáme účast (vysvětlovač) | karusel 3 | nová |

**Panorama (F1–F3) jde jako úplně první**, protože tvoří spodní řadu mřížky. Nahrávej v pořadí **F3 (vlajka) → F2 (ČR) → F1 (mapa EU)**, ať je v mřížce zleva mapa EU, ČR, vlajka. Bez popisků, alt text: „Mapa Evropy, mapa České republiky a vlajka EU.“

Pak: 1 → 2 → 3, pak po jednom každý druhý den, zbytek podle plenárního kalendáře. Příspěvek 1 připni.

## 3. První dva týdny
| Den | Co |
|---|---|
| Po | Zveřejni **#1 Úvod** (karusel). Story: anketa „Víš, kolik českých poslanců je v EP?“ → odpověď 21. |
| St | Story: slide B2 (tečky), odkaz na web. |
| Čt | **#3 Poslanec v kostce** (1 poslanec, rotace abecedně). |
| Pá | **#2 Hlasování týdne** + story s odkazem na `v/…`. |
| Po–St (další týden) | Story: 1× denně „co se dnes hlasuje“ jen v plenárním týdnu. |
| Pá | Další Hlasování týdne. |
Po dvou týdnech: podívej se, co lidé **ukládají a sdílejí**, a ladit poměr pilířů podle toho.

## 4. Popisky (návrhy, čísla jen z webu)
**#1 Úvod**
> Jak hlasují čeští europoslanci? Na jednom místě, jen z oficiálních dat. Jedna tečka = jeden poslanec, barva = hlas. Bez hodnocení, bez pořadí, každé číslo se zdrojem. Detail a metodika na webu (odkaz v bio). 🇪🇺 #europarlament #europoslanci #hlasování

**#2 Hlasování týdne (7. 10. 2026)**
> Konzulární ochrana občanů Unie bez zastoupení ve třetích zemích: návrh prošel (470 pro, 180 proti). Češi se rozdělili: 10 pro, 4 proti, 6 se zdrželo, 1 nehlasoval. Podle stran a jmenovitě na dalších slidech. Zdroj: HowTheyVote.eu, data k 10. 10. 2026. Detail: epwatch.cz/v/197509.html #europarlament #hlasování

**#3 Poslanec v kostce**
> Nikola Bartůšek (ECR, nezávislá). Účast na hlasování 91,0 % (medián EP 89,9 %), hlasuje s frakcí v 80,9 % případů (medián frakce 91,1 %). Čísla nejsou známka a poslance neřadíme. Zdroj: HowTheyVote.eu, data k 10. 10. 2026. Portrét © EP. #europoslanci

Alt text (vzor): „Karta s 21 tečkami. Deset zelených (pro), čtyři červené (proti), šest šedých (zdržel se) a jedna prázdná (nehlasoval).“

## 5. Pravidla pro každý příspěvek (kontrola před publikací)
- Zdroj + datum dat + URL na každém slidu. ✓ (v šablonách)
- Žádné pořadí, známky, „nejlepší/nejhorší“. Stejná šablona pro každou stranu.
- Čísla z `data/*.json`, ne z hlavy. Český překlad názvu hlasování zatím píše člověk/AI → zkontroluj před publikací.
- Chybějící hodnota se vynechá. Oprava chyby = nový příspěvek + highlight Opravy.
- Portrét jen s „© European Union – Source: EP“, loga jen oficiální soubory.

## 6. Zadání pro Claude Code (až bude chuť)
Skript `build_instagram.py` v repu: po týdenním update dat vygeneruje balíček `out/instagram/<datum>/` (PNG 1080×1350 podle `build.py`, `popisek.txt`, `alt.txt`) pro Hlasování týdne a dalšího poslance v pořadí. Předloha: přiložený `build.py`. Karty z revize S4/S5 se mají renderovat stejným kódem, ať web a Instagram vypadají stejně.

## 7. Doména epwatch.cz
DNS u registrátora (A `epwatch.cz` → `76.76.21.21`, CNAME `*.epwatch.cz` → `cname.vercel-dns.com`) míří na Vercel. Zbývá:
1. Ve Vercelu u projektu: Settings → Domains → přidat `epwatch.cz` (a `www.epwatch.cz`, pokrývá ho wildcard CNAME). Počkat na ověření a certifikát.
2. Zadání pro Claude Code: nahradit základní URL `european-stasisticz.vercel.app` → `epwatch.cz` (canonical, `og:url`, `og:image`, `sitemap.xml`, `robots.txt`, `build_pages.py`, `build_cards.py`, `share.js`, texty ve zdrojích a citacích). Starou adresu nechat jako přesměrování na novou.
3. Karty a příspěvky teď používají `epwatch.cz/v/{id}.html` a `epwatch.cz/p/{id}.html`.
