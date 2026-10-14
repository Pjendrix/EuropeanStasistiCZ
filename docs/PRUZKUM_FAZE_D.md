# Fáze D – průzkum zdrojů pro „vlastní práci“ poslanců

Stav k 14. 10. 2026. Ověřeno dotazy na EP Open Data API v2 a na dumpy Parltracku.

## Shrnutí

| Typ | Zdroj | Jména / ID poslanců | Výsledek | Čerstvost | Náklad prvního stažení |
|---|---|---|---|---|---|
| Zprávy (zpravodaj) | EP API `plenary-documents/{A-10-…}` | ano, role `RAPPORTEUR`, s frakcí | ano, přes `reference` hlavního hlasování v HowTheyVote | průběžně | ~2 000 dotazů (všechny A/B/RC dokumenty) |
| Stínové zprávy | EP API `procedures/{rok-číslo}` | ano, `RAPPORTEUR_SHADOW` (a `RAPPORTEUR_SHADOW_OPINION` / `RAPPORTEUR_OPINION` u stanovisek) | ano, přes zprávu procedury → hlasování | průběžně | ~1 750 dotazů (procedury 2024–2026) |
| Návrhy usnesení (B10, RC-B10) | EP API `plenary-documents/{B-10-…}`, `{RC-10-…}` | ano, signatáři s rolí `AUTHOR` a frakcí | ano, přes `reference` (B10-…/RC-B10-…) | průběžně | v rámci dokumentů výše |
| Otázky Komisi (písemné, ústní) | EP API `parliamentary-questions/{id}` | ano, `AUTHOR` | nehlasuje se; je známo, zda a kdy přišla odpověď | průběžně | ~10 000 dotazů (API neumí filtr podle poslance) |
| Pozměňovací návrhy v plénu | EP API: jména jen v textu názvu; Parltrack `ep_plenary_amendments`: pro 10. období **žádná data** (poslední 24. 4. 2024) | ne strukturovaně | HowTheyVote zná výsledek, ale jen typ autora | – | – |
| Pozměňovací návrhy ve výborech | Parltrack `ep_amendments.json.zst` (120 MB, ODbL) | ano, pole `meps` = ID z EP | ne (hlasování ve výborech nejsou strojově dostupná) | **dump končí 29. 1. 2026** | 1 stažení, ~20 s zpracování |

## Podrobnosti

**EP API**
- Zprávy: `workHadParticipation` obsahuje `RAPPORTEUR` (`had_participant_person`, `politicalGroup`, `participation_in_name_of` = výbor).
  Příklad: A10-0142/2025, zpravodajka Nikola Bartůšek (PfE). V HowTheyVote je k ní hlavní hlasování 178336 z 9. 9. 2025: přijato 606 : 5.
- Stínoví zpravodajové nejsou u dokumentu, ale u procedury (`/procedures/2025-0084`): role `RAPPORTEUR_SHADOW`,
  `RAPPORTEUR_SHADOW_OPINION`, `RAPPORTEUR_OPINION`, s datem a frakcí. Příklad: Alexandr Vondra jako stínový zpravodaj stanoviska.
- Návrhy usnesení: B10-… i společné RC-10-… mají signatáře (`AUTHOR`, 1 až 79 osob, s frakcí).
  Pozor na formát: EP používá `RC-10-2025-0156`, HowTheyVote `RC-B10-0156/2025`.
- Otázky: `E-10-…` (písemné), `O-10-…` (ústní) s autorem a s odkazem na odpověď (`inverse_answers_to`).
  Seznam (`/parliamentary-questions?year=`) vrací jen ID. Filtry `person-id`, `creator` a další API ignoruje, takže je nutné stáhnout detail každé otázky (2025: 4 948 otázek).
- Filtr `work-type=RESOLUTION_MOTION` u `plenary-documents` funguje.
- Limit 500 dotazů za 5 minut na endpoint, tedy první stažení všeho asi 14 000 dotazů, zhruba 2,5 hodiny. Další týdenní běhy jen nové položky (desítky až stovky dotazů).

**Napojení na výsledky (HowTheyVote)**
- Hlavní hlasování (680) mají reference: A10 (468), RC-B10 (91), B10 (90), C10 (23). 508 z nich má i `texts_adopted_reference`.
- Samostatné B10 návrhy často nejsou hlasovány, protože je nahradí společný RC-B10. Takové je potřeba označit „nahrazeno společným návrhem“, ne „neprošlo“.

**Parltrack** (ODbL, dumpy `.zst`, záznam na řádek)
- `ep_amendments`: 1,27 mil. záznamů, z toho 115 043 v 10. období (294 dossierů). Pokrytí končí 29. 1. 2026, aktualizace jsou nepravidelné (dump z 3. 2. 2026).
  402 záznamů má nesmyslné datum v budoucnosti (2047, 2068…), je nutné je filtrovat.
  Čeští autoři v době mandátu: 8 427 amendmentů. Jeden amendment může mít víc spoluautorů a počítá se každému.
  Nejvíc má Nikola Bartůšek (1 055 ve 43 dossierech), nejméně Ondřej Dostál (28).
- `ep_plenary_amendments`: posledních záznam 24. 4. 2024, pro 10. období nepoužitelné.
- `ep_mep_activities` (50 MB, 22. 7. 2026): vše po poslancích v jednom souboru (zprávy, stínové zprávy, usnesení, otázky, projevy, vysvětlení hlasování).
  Je ale 3 měsíce starý a odvozený, protože Parltrack sám stahuje web EP. Hodí se jako křížová kontrola, ne jako hlavní zdroj.

## Doporučení
1. Hlavní zdroj: EP API (zprávy, stínové zprávy, usnesení, otázky). Je oficiální a čerstvé. První běh jako samostatný ruční workflow, pak týdně jen nové položky (zpracované ID se drží v `data/proposals.json`).
2. Amendmenty ve výborech z Parltracku jen jako počet, s viditelným datem „podle Parltracku, data do 29. 1. 2026“.
3. Pozměňovací návrhy v plénu podle jmen nedělat. Zůstat u úrovně frakcí z HowTheyVote.
4. Výsledek jen u zpráv a usnesení (přes HowTheyVote), vždy po typech zvlášť. U otázek jen „odpověď přišla / nepřišla“.
