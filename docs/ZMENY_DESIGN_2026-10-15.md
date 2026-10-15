# Změny: zelená/červená, kategorie, nová karta hlasování (15. 10. 2026)

Zkopíruj soubory do repa se stejnými cestami (přepíšou se) a commitni.

| Soubor | Co se mění |
|---|---|
| `public/style.css` | pro = zelená, proti = červená (světlý i tmavý režim), nový token `--glyph`; třídy `.vd` (tečka se symbolem ✓ ✕ – ○), legenda, kategorie, neutrální štítek výsledku |
| `public/share.js`, `scripts/build_cards.py` | nové barvy hlasů ve sdílecích kartách (symboly v kartách zatím nejsou) |
| `scripts/categories.py` (nový) | tabulka 12 kategorií nad kódy témat OEIL, bez AI |
| `scripts/key_votes.py` | každé hlasování v `key_votes.json` dostane `cats` |
| `scripts/hub.py` | nová karta: kategorie, 21 teček, legenda, celý EP, neutrální „Přijato“ |
| `data/key_votes.json`, `public/index.html` | přegenerováno |
| `tests/test_categories.py` (nový) | testy mapování kategorií |

Testy: 247 prošlo. Neobsaženo: přegenerování OG obrázků (`python scripts/build_cards.py`, proběhne při týdenním buildu), kategorie v dynamických seznamech (`votes.html`, `home.js`) a symboly v sdílecích kartách.
