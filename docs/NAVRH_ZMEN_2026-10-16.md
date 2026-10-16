# Návrh změn: automatizace, Instagram, program EP, česká stopa, velikost repa (16. 10. 2026)

Vychází z revize projektu ze 16. 10. 2026. Platí `CLAUDE.md`: žádný scraping, žádná vymyšlená data, čísla počítá kód, každé číslo má zdroj, bez pořadí a hodnocení, česky, web bez build stepu.

**Podmínka tohoto návrhu: nic placeného a žádné služby navíc.** Všechno jde udělat jen vývojem v repu a s tím, co projekt už používá:

| Používá se | Cena |
|---|---|
| GitHub (soukromé repo, Actions, issues) | zdarma, 2 000 minut Actions měsíčně |
| Vercel Hobby | zdarma |
| EP Open Data API v2, HowTheyVote export, Wikidata | zdarma, bez klíče |
| Instagram | ruční publikace z telefonu, žádné API |

**Vědomě vynecháno:** Meta Graph API (vyžaduje Facebook stránku, Meta aplikaci a tokeny), Buffer, Make, Zapier, newsletterové služby, analytika (Vercel Web Analytics jen po samostatném rozhodnutí autora), placené monitorování.

---

## Přehled a pořadí

| # | Blok | Přínos | Velikost |
|---|---|---|---|
| A | Úklid a zastavení růstu repa | repo přestane každý týden růst o ~11 MB | půl dne |
| B | Instagram na webu (odkazy, opravy) | návštěvníci najdou profil, web a IG se doplňují | hodina |
| C | Program příštího zasedání + odpočet | web „žije“ i mezi plény | den |
| D | Česká stopa (štítek, filtr, příští hlasování) | rychlá odpověď „co se týká Čechů“ | den |
| E | Rychlejší a hlídaná aktualizace dat | výsledky do 1–2 dnů po plénu, nic se nerozbije potichu | půl dne |
| F | Balíček pro Instagram (generátor) | příprava příspěvku = stáhnout a nahrát | den |
| G | RSS feed a sitemap `lastmod` | sledování webu bez dalších služeb, lepší SEO | hodina |
| H | Generované soubory mimo git (volitelné) | repo jen zdroje a data | den + rozhodnutí |

Doporučené pořadí: **A → B → E → C → D → G → F → H.** Každý blok je samostatný PR s testy.

---

## A Úklid a zastavení růstu repa

**Zjištění z revize:**
- Historie má 547 MB verzí souborů. Z toho `public/v` (statické stránky hlasování, 13 573 verzí) tvoří 254 MB a `public/og` (PNG náhledy, 2 862 verzí) 81 MB.
- Příčina: každá statická stránka i každý obrázek obsahuje „data k …“. Při každé týdenní aktualizaci se proto přepíše všech ~640 stránek a ~390 PNG, i když se hlasování nezměnilo. PNG se v gitu nekomprimuje, takže přibývá asi 11 MB každý týden.
- Omylem verzované soubory v kořeni: `download`, `download (1)` (kopie `.gitignore` a `.vercelignore`) a `ZADANI_REVIZE.md`.
- Portrét `197549.jpg` má 3,5 MB, ostatní 0,1–0,5 MB.

**Změny:**
- **A1** Smazat `download`, `download (1)`. `ZADANI_REVIZE.md` přesunout do `docs/`.
- **A2** Statické stránky `v/`, `p/`, `s/`: datum exportu dat nepsat do HTML. V `shareContext` ho načíst za běhu z `overview.json` (stránky stejně načítají `app.js`). V HTML zůstane jen datum hlasování.
- **A3** OG obrázky (`build_cards.py`): v patičce místo „data k <export>“ uvádět datum hlasování a zdroj. Výsledek hlasování se po zveřejnění nemění, takže se obrázek už nepřepíše. U karty poslance, kde se čísla mění, nechat datum, ale generovat ji jen při změně čísel (porovnání otisku vstupních dat, ne času).
- **A4** `fetch_photos.py`: portrét zmenšit na nejvýš 600 px na delší straně (Pillow už v projektu je). Náhledy `thumbs/` beze změny.
- **A5** Test: dvě po sobě jdoucí sestavení se stejnými daty a jiným „dneškem“ nezmění žádný soubor v `public/v`, `public/og`, `public/p`, `public/s`.

**Lokálně (u tebe na disku, nic se nemění v repu):**
- `git gc --prune=now` zabalí nezabalené objekty.
- Složku `.cache/` lze smazat (cache stažených CSV, je v `.gitignore`, při dalším běhu se stáhne znovu).

**Hotovo když:** týdenní aktualizace bez nových hlasování nezmění žádný soubor ve `public/v` ani `public/og`.

---

## B Instagram na webu

Bez API: jen odkazy a stránka s opravami, publikace zůstává ruční.

- **B1** Odkaz `https://www.instagram.com/epwatch.cz/` (jedna konstanta v `layout.py`, vše se generuje odtud):
  - **hlavička (desktop):** ikona Instagramu vlevo od přepínače režimu, `aria-label="EP Watch CZ na Instagramu"`, `rel="me noopener"`;
  - **mobil:** položka „Instagram“ v panelu Více, sekce Projekt;
  - **patička** všech stránek.
- **B2** `og:site_name` na všech stránkách a JSON-LD `Organization` na úvodu se `sameAs` na Instagram.
- **B3** `o-projektu.html`:
  - krátká sekce „Sledujte nás“;
  - sekce **„Opravy“** (`#opravy`): tabulka datum · co bylo špatně · co je správně · odkaz. Prázdná je v pořádku („Zatím žádné opravy“). Data z ručního `data/manual/corrections.json`, aby se tabulka generovala a dala se testovat.
- **B4** Žádný vložený feed ani widget Instagramu (rychlost, soukromí, žádné skripty Mety).
- **B5** Odkaz v bio Instagramu: `https://epwatch.cz/?utm_source=instagram`. Web nic neměří, parametr jen nic nerozbije, kdyby se měření někdy zapnulo.

**Test:** odkaz je v hlavičce, panelu Více a patičce každé stránky. `layout.py --check` hlídá shodu.

---

## C Program příštího zasedání a odpočet

**Ověřené zdroje (EP Open Data API v2, zdarma, bez klíče):**
- `/meetings?year=YYYY` vrací plenární dny dopředu (např. `MTG-PL-2026-10-21` … `MTG-PL-2026-12-17`).
- `/meetings/{id}/foreseen-activities` vrací program dne:
  - body typu hlasování (`had_activity_type = def/ep-activities/PLENARY_VOTE`, id `…-OJ-ITM-V-…`);
  - **český název** (`activity_label.cs`) a pořadí;
  - odkazy na dokumenty (`A-10-2026-0258` = zpráva výboru, `B-10-…` = návrh usnesení, `C-10-…`).

**Změny:**
- **C1** `scripts/fetch_agenda.py` → `data/agenda.json`:
  - nejbližší zasedání (dny od–do), seznam hlasovacích bodů (id, český název, dokumenty, pořadí), čas stažení;
  - validace polí, při změně formátu čitelná chyba;
  - limit 500 dotazů za 5 minut se ani nepřiblíží, jsou to jednotky dotazů.
- **C2** Spouštět denně v existujícím `proposals.yml` (žádný nový workflow). Commit jen při změně souboru.
- **C3** Úvod a `hlasovani.html`: blok „Další zasedání“:
  - text „21.–22. 10. 2026 · za 5 dní · 13 hlasování v programu“, odkaz na seznam bodů;
  - **odpočet počítá prohlížeč z data**, web se kvůli němu denně nepřestavuje;
  - během zasedání „právě probíhá“, po něm „výsledky budou po zveřejnění dat (obvykle do několika dnů)“.
- **C4** Seznam bodů na `hlasovani.html`:
  - český název, dokument s odkazem na EP a čip tématu, pokud ho jde určit stejnou funkcí `categories_for` (jinak bez čipu, nic se nedomýšlí);
  - štítek **„podle programu EP k <datum stažení>, program se může změnit“**.
- **C5** Výběr do bloku na úvodu jen pravidlem (bez redakce):
  - nejdřív body s českou stopou (D3);
  - pak legislativní body podle pořadí v programu;
  - nejvýš 3 body, pravidlo v metodice.
- **C6** Po zasedání se blok přepne na výsledky, jakmile přijdou data z HowTheyVote (spojení přes číslo dokumentu nebo proceduru).

**Testy:** fixture s MOCK programem, výběr bodů podle pravidla, prázdný program = blok se nezobrazí, odpočet správně kolem půlnoci a během zasedání.

---

## D Česká stopa

Vše z dat, která web už má (`vote_roles.json`, `own_work.json`, `topics.geo` ze zdroje).

- **D1** Štítek **„česká stopa“** (zpravodaj nebo stínový zpravodaj z ČR) na kartě hlasování v seznamu, v heru úvodu a na kartě ke sdílení. Stejná komponenta v JS i Pythonu jako u čipů témat.
- **D2** Filtr ve `votes.html`: „jen s českou stopou“ (`?stopa=1`).
- **D3** **Česká stopa v příštím hlasování:**
  - čísla zpráv z programu (`A-10-2026-0258`) se spojí s `own_work.json`, kde jsou zprávy jako `A10-0258/2026` (112 zpráv s českou rolí, část má stav „bez hlasování“);
  - v bloku C: „Na programu je zpráva, kterou vedl/a <jméno> (zpravodaj/ka)“.
- **D4** **„Týká se Česka“**, jen když to uvádí zdroj (geografické téma `topics.geo` = Czechia). Dnes 1 hlasování (Fond solidarity), objeví se i u dalších fondů.
- **D5** Tabulka témat: sloupec „z toho s českým zpravodajem“.
- **D6** Detail strany: „Zprávy, které vedli poslanci strany“ (součet rolí, bez hodnocení).

**Testy:** spojení čísel zpráv v obou formátech, štítek jen při existujícím záznamu, nikdy prázdná značka.

---

## E Rychlejší a hlídaná aktualizace dat

- **E1** Aktualizace podle vydání dat místo pondělí:
  - denní krok v `proposals.yml` zjistí datum posledního exportu HowTheyVote (stabilní odkaz `latest`);
  - při změně spustí týdenní aktualizaci (`workflow_dispatch` přes `gh workflow run` s `GITHUB_TOKEN`);
  - pondělní cron zůstane jako pojistka.
- **E2** Kontrola webu po aktualizaci dat:
  - `commit_data.sh` pushuje přes `GITHUB_TOKEN`, takže se `web-check` dnes nespustí;
  - přidat krok Playwright + axe přímo do `weekly.yml` před commit, nebo ho spustit `workflow_dispatch`;
  - při chybě se data necommitnou.
- **E3** Upozornění na stará data:
  - na webu: pokud je „data k“ starší než 14 dní, nenápadný pruh „data mohou být neaktuální“ (počítá prohlížeč);
  - v GitHubu: selhání naplánovaného běhu → automatické issue (`actions/github-script`, zdarma), notifikace přijde do aplikace GitHub v telefonu.
- **E4** Dependabot jen pro verze GitHub Actions (zdarma, `.github/dependabot.yml`).
- **E5** Hlídat minuty Actions: kontrola webu jen u PR a po aktualizaci dat, ne u každého pushe do větve.

---

## F Balíček pro Instagram (bez API)

Navazuje na `docs/ZADANI_INSTAGRAM.md`, bod I4. Publikace zůstává ruční.

- **F1** `scripts/build_instagram.py` vytvoří `out/instagram/<datum>/`:
  - `slide-N.png` (1080 × 1350 a 1080 × 1920), `popisek.txt`, `alt.txt`, `zdroje.txt`;
  - obrázky ze stejných šablon jako karty ke sdílení;
  - u karty poslance neutrální avatar (`avatar: "neutral"`);
  - v popisku téma (čip tématu) a česká stopa z dat.
- **F2** Spouští se po týdenní aktualizaci. Výsledek se uloží jako **artifact GitHub Actions** (zdarma, 90 dní). Workflow založí issue „Balíček pro Instagram je připravený“ s odkazem ke stažení.
- **F3** Výběr hlasování deterministický (pravidlo ze zadání I4). Rotace poslanců se stavem v `data/instagram_state.json`.
- **F4** Testy podle zadání I4: součty teček, text se vejde, každý slide má zdroj a datum, alt text pro každý slide.

**Postup pro tebe:** v aplikaci GitHub otevřeš issue, stáhneš ZIP, v telefonu nahraješ karusel a vložíš popisek a alt texty.

---

## G RSS feed a sitemap

- **G1** `public/feed.xml` (Atom): posledních 30 závěrečných hlasování s výsledkem, tématem a odkazem na `v/{id}`. Generuje `build_pages.py`, odkaz `<link rel="alternate">` v hlavičce.
  - Kdo chce, sleduje web ve čtečce.
  - Kdykoli později se na feed dá napojit cokoli dalšího bez úprav webu.
- **G2** `sitemap.xml` s `lastmod` (datum hlasování u `v/`, datum dat u ostatních).

---

## H Generované soubory mimo git (volitelné, až po A)

Až A zastaví růst, je potřeba rozhodnout, jestli stačí. Pokud ne:

- **H1** `public/v`, `p`, `s`, `og` a `sitemap.xml` stavět až při nasazení:
  - **varianta 1:** build přímo ve Vercelu (`buildCommand`: `pip install` a volání `build_pages.py` a `build_cards.py`). Zdarma, ale je potřeba ověřit délku buildu a dostupnost Pythonu a Pillow v build prostředí Vercelu;
  - **varianta 2:** GitHub Action postaví web a nasadí ho přes Vercel CLI. Zdarma, potřebuje token Vercelu v GitHub Secrets.
- **H2** Pak generované složky do `.gitignore`.
- **H3** Jednorázové pročištění historie (`git filter-repo`), jen když bude velikost vadit:
  - vyžaduje force push do main, zálohu (`git clone --mirror`), žádné otevřené PR a nové klonování všude;
  - dělá se ručně v klidném okamžiku, nikdy automaticky.

---

## Rozhodnutí autora, která neměnit

- Žádné pořadí, známky ani hodnocení poslanců. Česká stopa a témata jsou štítky, ne soud.
- Čísla a výběry počítá kód podle pravidel v metodice; AI nic nevybírá ani nepřiřazuje.
- Publikace na Instagram ruční; web nevkládá skripty sociálních sítí.
- Žádné měření návštěvnosti bez samostatného souhlasu autora.

## Otevřené otázky pro autora

1. **C5:** Pravidlo výběru bodů na úvod (česká stopa → legislativní → pořadí, max. 3)? Nebo jen počet a odkaz na seznam?
2. **F2:** Upozornění na hotový balíček jako issue v GitHubu, nebo stačí artifact bez upozornění?
3. **H:** Stačí po bloku A zastavit růst, nebo chceš i přesun buildu mimo git a pročištění historie?

---

## Rozhodnutí autora (16. 10. 2026)

| Otázka | Rozhodnutí |
|---|---|
| Program na úvodu (C5) | Odpočet + nejvýš 3 body: česká stopa → legislativní → pořadí v programu. Celý seznam na stránce Hlasování. |
| Balíček pro Instagram (F2) | Issue v GitHubu s odkazem na ZIP (artifact). |
| Velikost repa | Teď blok A (zastavit růst). Přesun buildu mimo git a pročištění historie (H) až později podle velikosti. |
| Instagram v hlavičce (B1) | Ikona vedle přepínače režimu; na mobilu v panelu Více a v patičce. |
| Aktualizace dat (E1) | Denně kontrolovat nový export HowTheyVote, pondělí jako pojistka. |
| Stará data na webu (E3) | Upozornění od 14 dnů. Nezobrazí se, pokud od data dat neproběhlo žádné plenární zasedání (letní a vánoční pauza). |
| Opravy (B3) | Prázdná tabulka „Zatím žádné opravy“, záznamy v `data/manual/corrections.json`. Stávající „Opravy a změny metodiky“ zůstávají jako changelog. |
| Pull requesty | Tři PR: **1)** A + B + G, **2)** E + C + D, **3)** F. |
