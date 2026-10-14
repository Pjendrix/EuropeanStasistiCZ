# Licence dat

Licence MIT v souboru `LICENSE` platí jen pro **kód** (skripty v `scripts/`, testy, web v `public/`).
Pro data platí licence jejich zdrojů:

| Co | Zdroj | Licence |
|---|---|---|
| Hlasování a vše z nich spočítané (`data/votes/`, `data/stats.json`, `data/overview.json`, `data/meps/`, `data/parties/`, `data/decisive.json`, `data/splits.json`, `data/session.json`, `data/agreement.json`) | [HowTheyVote.eu](https://howtheyvote.eu), [datový export](https://github.com/HowTheyVote/data) | [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/) – při dalším šíření databáze uveďte zdroj a sdílejte za stejných podmínek |
| Poslanci, mandáty, frakce, strany, výbory, vlastní práce (`data/meps.json`, `data/proposals.json`, `data/own_work.json`) | [EP Open Data](https://data.europarl.europa.eu) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) – © European Union, Source: EP |
| Portréty (`public/assets/photos/`) | Evropský parlament | © European Union – Source: EP |
| Písmo Plus Jakarta Sans (`public/assets/fonts/`) | [The Plus Jakarta Sans Project Authors](https://github.com/tokotype/PlusJakartaSans) | SIL Open Font License 1.1 (`public/assets/fonts/OFL.txt`) |
| Ruční doplňky (`data/manual/`) | EP Watch CZ (barvy, český překlad názvů témat OEIL – neoficiální) | jako data, která doplňují (ODbL) |

Každá týdenní aktualizace dat má git tag `data-RRRR-MM-DD`.
