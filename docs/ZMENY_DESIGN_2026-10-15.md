# Změny designu – dodatek (ZIP #2, 2026-10-15)

Staví na stavu z `EuropeanStasistiCZ-main_8.zip` (kde už je ZIP #1: barvy PRO/PROTI, kategorie na kartě hubu).

## Co je nově
- **Kategorie v dynamických seznamech**: `public/votes.html` (seznam hlasování) a `public/home.js` (karta zasedání) ukazují ikonu + název kategorie a „+n“.
  - Data: `scripts/build_web.py` přidává pole `cats` do search/session/meps/parties/decisive/splits/key_votes a píše `data/categories.json` (popisky + ikony z `scripts/categories.py`).
  - JS: `public/app.js` (`loadCategories()`, `catChip()`), styly v `public/style.css`.
- **Symboly ✓ ✕ – ○ v sdílecích kartách**: `public/share.js` (`POSDOT`), barvy stejné jako na webu; barevně slepý čtenář pozná hlas podle tvaru.
- Hlasování bez tématu OEIL (20 ze 640 závěrečných) kategorii nemá, nic se nedomýšlí.

## Soubory
public/app.js, home.js, share.js, style.css, votes.html · scripts/build_web.py, categories.py · data/** (nové pole `cats`, nový `categories.json`)

## Mimo ZIP
- PNG karty v `public/og/` se přegenerují `python scripts/build_cards.py` / týdenním buildem (barvy v něm už jsou z ZIPu #1).
- Pozor na data: 48 hlasování „Objection pursuant to Rule 115…“ má uložené `vote_kind: final`, proto jsou v „Češi proti výsledku“. Je to věc exportu, ne designu.
- Testy: 247 prošlo.
