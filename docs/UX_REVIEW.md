# UX/UI review – backlog úkolů

Stav k 14. 10. 2026 (verze s `vote_kinds.py`, `benchmarks.py`, statickými stránkami).
Celé review s odůvodněním a obrázky je ve sdíleném dokumentu „EP Watch CZ – UX/UI review a loga“.
Platí `CLAUDE.md` (žádná vymyšlená data, čísla počítá kód, statický web bez build stepu).
Každý úkol = commit `ux: <id> <popis>`. Vizuální vzor karty: `docs/mockups/karta.html`.

---

## U1 Sémantické barevné tokeny
**Stav (15. 10. 2026): hotovo** (tokeny, výsledky s ikonou).
**Proč:** modrá dnes znamená odkaz, hlas pro, „přijato“, docházku, EPP i štítek „závěrečné“.
Lišta loajality má barvu ECR (#6366F1), lišta shody barvu ESN (#0EA5E9). Barvy proto nic neříkají.

**Úkol (`style.css`, `app.js`, `home.js`, `mep.html`):**
- Zavést tokeny a používat jen je (žádný hex v JS):
  - `--data: #334155` / dark `#CBD5E1` – hodnota poslance (tečky, lišty, sloupce)
  - `--bench: #B45309` / dark `#F59E0B` – medián EP / frakce (vždy stejná značka)
  - `--for`, `--against`, `--abst`, `--absent` – jen hlasy (ponechat dnešní hodnoty)
  - identita frakcí/stran – jen tečky, 4px proužek karty, rámeček avataru, logo
- Výsledek (`resultText`, `.result-*`, `.pill-result`) bez barvy pro/proti: barva písma + ikona
  „✓ přijato“ / „✕ zamítnuto“ (ikona `aria-hidden`, text zůstává).
- Odkazy: barva písma + podtržení, hover zlatý (nebo jedna vyhrazená barva, která se v datech nepoužije).
- Sloupce „Docházka po měsících“ v `--data`, linka mediánu EP v `--bench`.

**Hotovo když:** v `public/*.js` není žádný hex kód barvy dat; axe bez nových chyb kontrastu.

## U2 Nová karta poslance (místo kruhu)
**Stav (15. 10. 2026): hotovo** (karta s mediánem EP a frakce, bez pořadí).
**Proč:** hodnoty 80–98 % jsou v kruhu k nerozeznání, kruh neumí srovnání a popisek „docházka“
přetéká přes okraj kruhu.

**Úkol (`home.js` `mepCard`, `style.css`):**
- Načíst `benchmarks.json` na úvodu (už existuje, profil ho používá).
- Dva řádky: **Docházka** (srovnání s mediánem EP) a **Loajalita k frakci** (srovnání s mediánem frakce
  poslance; u NI text „nezařazení nemají frakci, nepočítá se“).
- Řádek = popisek vlevo, číslo vpravo (20 px, 600), pod tím proužek (osa 60–100 %), tečka 11 px
  `--data` s 2px lemem v barvě pozadí, čárka mediánu 3 × 17 px `--bench` NAD tečkou (z-index),
  pod tím text „o 1,1 p. b. víc než medián EP (89,9 %)“ v `--muted`, bez barevného hodnocení.
- Hodnoty pod 60 % přilepit k levému okraji a v textu uvést přesné číslo.
- Legenda jednou nad mřížkou: tečka = poslanec, čárka = medián, osa 60–100 %.
- „Shoda s Čechy“ z karty odstranit (zůstává na profilu a v tabulce).
- Barva frakce: `border-left: 4px solid` + tečka u zkratky + rámeček avataru. Vpravo nahoře slot pro logo (U4).
- `aria-label` řádku: „Docházka 91,0 %, medián EP 89,9 %“.
- Stejnou komponentu (`benchRow(label, value, median, refLabel)` v `app.js`) použít v metrických kartách
  profilu a v režimu „jako tabulka“.

**Kostra (přizpůsobit stávajícím helperům):**
```js
// app.js
const BENCH_MIN = 0.6;
function benchRow(label, pair, median, refLabel) {
  const v = pct(pair);
  if (v === null) return `<div class="bench"><div class="bench-top"><span>${label}</span><b>–</b></div>
    <p class="bench-note">nepočítá se</p></div>`;
  const pos = (x) => `${Math.max(0, Math.min(1, (x - BENCH_MIN) / (1 - BENCH_MIN))) * 100}%`;
  const d = Math.round((v - median) * 1000) / 10;
  const diff = d === 0 ? "stejně jako" : `o ${Math.abs(d).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p. b. ${d > 0 ? "víc" : "méně"} než`;
  return `<div class="bench" aria-label="${esc(`${label} ${fmtPct(v)}, ${refLabel} ${fmtPct(median)}`)}">
    <div class="bench-top"><span>${label}</span><b>${fmtPct(v)}</b></div>
    <div class="bench-strip" aria-hidden="true"><i class="bench-track"></i>
      <i class="bench-dot" style="left:${pos(v)}"></i><i class="bench-med" style="left:${pos(median)}"></i></div>
    <p class="bench-note">${diff} ${refLabel} (${fmtPct(median)})</p></div>`;
}
```
**Hotovo když:** karta odpovídá mockupu v světlém i tmavém režimu, žádný text nepřetéká při 320 px.

## U3 Úvodní stránka – méně a jasněji
**Stav (15. 10. 2026): hotovo** (2 KPI, skupiny podle frakcí; úvod je nově rozcestník, seznam poslanců je na `poslanci.html`: revize X11).
- Smazat tlačítka „Najít svého poslance“ a „Poslední zasedání“ (duplikují dlaždice pod KPI).
- KPI jen dvě: počet jmenovitých hlasování a docházka delegace s mediánem EP.
  „Češi jednotně“ a „Rozhodly české hlasy“ přesunout do úvodu stránky Analýzy.
- Seznam poslanců ve výchozím stavu seskupit podle frakcí (pořadí jako půlkruh), nadpis skupiny =
  logo (U4) + název + počet + medián loajality frakce. Abecední řazení jako volba.
- Půlkruh: mezery mezi bloky frakcí a zkratka nad blokem (barva nesmí být jediné vodítko).
- Panel „Kde se Češi rozdělili“: štítek typu skrýt, když jsou v seznamu jen závěrečná.

## U4 Loga v kódu
**Stav (15. 10. 2026): hotovo** (loga a barvy v kódu, `data/manual/logos.json`).
Loga nahrává autor ručně (viz `docs/LOGA.md`). Úkol pro kód:
- `data/manual/logos.json` (šablona v repu): `compute_stats.py` z něj vezme `file` a `source`;
  když záznam chybí, zůstává dnešní `find_logo()`.
- `check_data.py`: varovat, když logo nemá `source`, soubor > 60 kB, nebo SVG obsahuje `<script`,
  `on[a-z]+=`, `javascript:` či externí `href`. Volitelně `svgo` v CI.
- Zobrazení: komponenta `logoTile(entity, height)` = `<span class="logo-tile"><img …></span>`
  na bílém pozadí s 4px paddingem a zaoblením (funguje v tmavém režimu bez úpravy loga), `alt` = celý název,
  pevná výška, šířka auto, `loading="lazy"`.
- Kde: chipy pod půlkruhem, nadpisy skupin (U3), hlavička profilu (frakce + strana, 32 px),
  stránka strany (48 px), tabulka „Jak hlasovaly frakce“ (20–24 px), roh karty (28 px).
  V drobných textových štítcích logo NE, jen tečka + zkratka.
- `colors.json`: rozdělit na `brand_color` (z manuálu/loga, pro tečky a proužky) a `chart_color`
  (rozlišitelné barvy pro půlkruh; EPP, ECR, ESN a PfE jsou oficiálně modré).
- „O projektu“: doplnit „Na žádost vlastníka logo odstraníme.“

## U5 Profil
**Stav (15. 10. 2026): hotovo** (jedna adresa `p/{id}.html`; strana má jednu adresu `s/{id}.html`).
- Metrické karty: místo 4–5 řádků textu `benchRow` (U2) s mediánem EP i frakce; text „5 600 z 6 154“.
- Hlavička: když se frakce během období měnila, „ECR (do 3. 2. 2026 PfE)“; `partyBadge` s `byGender`
  („nezávislá“ místo „nezávislý/á“).
- Sekce „Frakce a strana“ jako časová osa (SVG, dva řádky: frakce, strana; osa 7/2024 → dnes) nad grafem docházky.
- „Vlastní práce“: dokud nejsou data, sekci i kotvu skrýt.
- „Citovat“: jedna malá ikonová akce v rohu karty místo tlačítka u každé položky.
- Kotvy lepkavé (`position: sticky`), dlouhé seznamy na mobilu v `<details>` po 3 položkách.
- Jedna URL: `p/{id}.html` s plným statickým obsahem, JS jen doplní interakce (graf, přepínače);
  `mep.html?id=` přesměrovat ve `vercel.json`. Totéž zvážit pro `v/` a `vote.html`.

## U6 Typ `objection` a výsledky v seznamech
**Stav (15. 10. 2026): hotovo** (typ `objection`, výsledky s ikonou).
- `vote_kinds.py`: nový typ `objection` pro „Objection pursuant to Rule 115…“ (36 hlasování vedených
  jako `final`), `inverted: true`, vysvětlivka „Hlasovat PRO = opatření Komise zablokovat“. Testy.
- Doplnit vzory, které dnes končí jako `other` (log z `fetch_votes.py`: „Proposition de décision du Conseil“,
  „Demande d'ajournement…“, „Procédure d'approbation“, „…décharge…“ ad.).
- Seznam hlasování: sloupec Češi „14 pro · 1 proti“ (zdržení/nehlasování menším písmem) místo „14/1/2/4“;
  štítek typu skrýt, když plyne z filtru.
- Detail: nadpis výsledkové karty jako věta (u inverzních typů „Návrh na zamítnutí neprošel – text zůstává“),
  „zamítnuto“ jako menší štítek. Nad seznamy jmen 21 teček seskupených podle frakcí, obarvených podle hlasu.
  Prázdné sloupce („nikdo“) sbalit.

## U7 České názvy a shrnutí závěrečných hlasování
**Stav (15. 10. 2026): nehotovo** (AI shrnutí a české názvy zatím ne, rozhodnutí autora; potřebuje `ANTHROPIC_API_KEY` v GitHub Secrets).
- Dle konceptu (Claude Haiku, `data/summaries/`), jen `vote_kind in {final, provisional_agreement}`.
- Výstup: krátký český název (max. 80 znaků) + 2 věty; označit „AI shrnutí“, anglický originál jako podtitul.
- Použít v seznamech, panelu na úvodu, profilu, analýzách a statických stránkách (`<title>`, OG).
- Žádná čísla v AI textu (validace regexem na číslice mimo reference).

## U8 Analýzy – Kde se Češi rozdělili
**Stav (15. 10. 2026): hotovo**.
- Místo dvou řad podtržených jmen: „pro: EPP 4 · ECR 3 · PfE 1“, jména po rozkliknutí.
- V seznamech jmen odkazy bez podtržení (podtržení na hover/focus).
- „rozkol 0,474“ nahradit „10 : 9“, desetinné číslo jen v metodice a CSV.
- Zobrazit 10 položek + „zobrazit další“ (dnes 50 položek, 10 000 px).

## U9 Mobil
**Stav (15. 10. 2026): hotovo** (a mobilní karty místo tabulek: revize X1).
- Seznam poslanců pod 640 px jako kompaktní řádky (avatar 40, jméno, frakce, docházka + mini proužek).
- Hero na mobilu nejvýš ~1 obrazovka (po U3 by mělo vyjít samo).

## U10 Kontrast a dotykové cíle
**Stav (15. 10. 2026): hotovo** (kontrasty, dotykové cíle 44 px včetně menu a podmenu: revize X3).
- Matice shody: tmavý text do hodnoty ~0,75, bílý až nad (dnes 2,1 : 1 ve 148 buňkách).
- `.pill-result.REJECTED`: 4,46 : 1 → ztmavit (#9A3412) nebo vyřeší U1.
- Chipy frakcí, „Citovat“, „CSV“: min. výška 44 px na dotykových zařízeních (`@media (pointer: coarse)`).

## U11 Barvy stran
**Stav (15. 10. 2026): částečně** (loga všech stran a frakcí jsou; oficiální `brand_color` zatím jen ODS).
- Dokud nejsou loga a `brand_color`, barvy z hashe kolidují (SPD a ANO zelené, KSČM fialová jako PfE).
  Doplnit `colors.json` z oficiálních manuálů (ODS má logomanuál s barvami).

## U12 Kontrola
**Stav (15. 10. 2026): hotovo** (`tests/e2e/check-web.mjs` + `.github/workflows/web-check.yml`: konzole, přetékání při 320/390/1366 px a axe-core ve světlém i tmavém režimu na 13 stránkách; běží u pull requestů).
- Playwright screenshoty úvodu, profilu, detailu a seznamu (desktop 1366, mobil 390, světlý/tmavý) před a po.
- axe-core bez chyb na všech stránkách.
