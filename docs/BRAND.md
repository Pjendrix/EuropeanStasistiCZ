# Logo EP Watch CZ – manuál

Symbol: oko (sledujeme) + oblouk 9 hvězd (EU), vedle něj „EP / CZ“ nebo „EP Watch CZ“.
Zdroj všech souborů: `scripts/build_brand.py` (vývojářský skript, ne v CI). Úpravy dělej tam a soubory přegeneruj,
SVG ručně neupravuj. Text je převedený na křivky z písma webu (Plus Jakarta Sans, OFL), SVG nepotřebují písmo.

## Barvy
| Token | Hex | Použití |
|---|---|---|
| brand-blue | `#1E4FA3` | oko, hvězdy, „Watch“, pozadí ikon |
| brand-navy | `#14264D` | „EP“, „CZ“, slogan |
| header-navy | `#0F172A` | pozadí hlavičky (= `--navy`) |
Na tmavém pozadí bílá varianta, pro jednobarevný tisk černá.

## Soubory (`public/assets/brand/`)
| Soubor | Kdy použít |
|---|---|
| `logo-stacked*.svg` | hlavní logo se sloganem (O projektu, tiskoviny, prezentace) |
| `logo-horizontal*.svg` | řádkové logo (patičky, e-maily, cizí weby) |
| `logo-epcz*.svg` | kompaktní značka „EP / CZ“ |
| `symbol*.svg` | samotný symbol (avatar sociálních sítí, vodoznak na kartách ke sdílení) |
| `icon.svg`, `icon-192/512.png`, `icon-maskable-512.png` | ikona aplikace (manifest) |
| `favicon-simple.svg`, `favicon-16/32.png`, `/favicon.ico` | favicon – jen oko, hvězdy by v 16 px splynuly |
| `apple-touch-icon.png` | iOS plocha (180 px, bez zaoblení – iOS zaobluje sám) |
| `og-default.png` | výchozí náhled odkazu 1200 × 630 |
Varianty: bez přípony = barevná na světlém pozadí, `-white` = na tmavém, `-black` = jednobarevná.

## Pravidla
- Ochranná zóna = výška jedné hvězdy kolem celého loga. Minimální šířka horizontálního loga 120 px, symbolu 24 px.
- Logo nedeformovat, nepřebarvovat mimo uvedené varianty, nedávat na fotky bez podkladu.
- V hlavičce webu je symbol vložený inline (`scripts/layout.py`, `BRAND_MARK`) s `currentColor`, text „EP Watch CZ“ je HTML.
- Hvězdy jsou modré/bílé v oblouku, ne zlatý kruh 12 hvězd: logo nesmí působit jako oficiální symbol EU nebo EP
  (web je nezávislý projekt – viz „O projektu“).

## Design tokeny a breakpointy (audit UI6)

- **Jediný zdroj barev je `design/tokens.json`.** Ručně se neupravuje `:root` ve `public/style.css` ani konstanty `SC` v `public/share.js`; po změně tokenů stačí `python scripts/tokens.py`. `build_cards.py` (obrázky OG karet) čte tokeny přímo. Test `tests/test_tokens.py` hlídá, že soubory sedí.
- Skupiny tokenů: `brand` (barvy značky, stejné v obou režimech), `theme` (barvy jako dvojice světlá/tmavá, v CSS jako `light-dark()`), `theme_other` (hodnoty, které nejsou barvy: stín, sytost tabulky shody, poloměry), `card` (obrázky ke sdílení, vždy tmavý podklad).
- Tmavý režim: `color-scheme` na `:root` (systém, nebo přepínač `html[data-theme]`). Pro prohlížeče bez `light-dark()` (před rokem 2024) generátor přidá záložní blok se stejnými hodnotami.
- CSS má dvě vrstvy: `@layer tokens` (generované) a `@layer site` (pravidla webu). Nová pravidla patří do `site`.
- **Breakpointy jen čtyři**, vždy `@media (max-width: …)`:
  - `360px` malé telefony,
  - `560px` telefony (karty místo tabulek, jednosloupcové rozložení),
  - `760px` mobilní rozložení (spodní lišta, kompaktní hlavička),
  - `1024px` úzký desktop (úvodní stránka do jednoho sloupce).
  Jiná šířka v `style.css` = test selže.
