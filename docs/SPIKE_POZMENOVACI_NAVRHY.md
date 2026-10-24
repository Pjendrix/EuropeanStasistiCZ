# Spike: pozměňovací návrhy (PN) českých poslanců

Stav k 24. 10. 2026. Navazuje na `docs/PRUZKUM_FAZE_D.md` (14. 10. 2026). Jen průzkum, na web ani do `data/` nic nejde.
Skripty (ve `scratch/`, výstupy mimo repo):

| Skript | Co dělá |
|---|---|
| `pn_ep_list.py` | seznam dokumentů PN z EP API (`/documents?work-type=AMENDMENT_LIST&year=…`) |
| `pn_docx.py` | parser oficiálního DOCX s PN (značky `<NumAm>`, `<Members>`, `<AuNomDe>`) |
| `pn_committee_docx.py` | PN ve výborech pro Čechy z DOCX (celé období, nebo jen to, co nemá Parltrack) |
| `pn_ep_reports.py` | plenární PN ke zprávám A10 z EP API (1 dotaz na zprávu) |
| `pn_spike.py`, `pn_probe.py` | Parltrack, plenární PN, párování s HowTheyVote |

## Shrnutí

- **PN ve výborech jdou spočítat aktuálně a z oficiálního zdroje.** EP API vypíše dokumenty PN (`{VÝBOR}-AM-{číslo}`) a ke každému dá odkaz na DOCX.
  V DOCX jsou autoři ve strojových značkách šablony EP (`<Members>Jméno, Jméno</Members>`, `<AuNomDe>za frakci</AuNomDe>`).
  Ze stránky se nic nescrapuje, ale jde o čtení dokumentu, ne o API. Pro produkci to vyžaduje výjimku v `CLAUDE.md` (návrh níže).
  - Pokrytí: **16. 7. 2024 – 21. 10. 2026**, 1 483 dokumentů, 251 145 PN.
  - Kontrola: u všech 1 445 přečtených dokumentů sedí počet PN s rozsahem v hlavičce (`<RangeAM>`). Na 6 dokumentech (1 203 PN) se shodují autoři s Parltrackem na 100 %.
  - Nepřečteno: 25 dokumentů bez anglické verze (404), 11 kompromisních PN (nepřipisují se, viz níže), 2 dokumenty jiné šablony.
- **Parltrack je neúplný a starý:** dump končí 29. 1. 2026 a i do té doby má jen 645 z 1 483 dokumentů EP (v lednu 2026 chybí 7 z 37).
  U poslanců, jejichž mandát skončil před 2026, se čísla s DOCX shodují (Kovařík 89 = 89, Turek 607 vs. 621), jinde Parltrack podhodnocuje. Jako zdroj nevyhovuje.
- **PN v plénu** jsou v EP API aktuálně (zprávy A10, jména v titulku dokumentu). Všechny s podpisem Čecha jsou ale hromadné (36 a více podpisů, medián 74).
  Podle rozhodnutí z 24. 10. se ukážou jako „spolupodepsané PN v plénu“ s vysvětlivkou.
- **Odkaz na detaily:** profil poslance na webu EP sekci PN nemá. Na webu tak ukážeme přímo seznam dokumentů z našich dat
  (každý s odkazem na PDF/DOCX v registru EP), případně odkaz na Parltrack jako doplněk.

## Zdroje

| Zdroj | Co má | Pokrytí 10. období | Autoři | Licence, formát | Použitelné |
|---|---|---|---|---|---|
| **EP API + DOCX výborových PN** (`documents/{VÝBOR}-AM-…` → `distribution/reds_iCmDoc_Amd/…/…_en.docx`) | všechny PN ve výborech | 1 483 dokumentů, 16. 7. 2024 – 21. 10. 2026 | značky šablony EP v DOCX | CC BY 4.0 (EP), DOCX | **ano, hlavní zdroj** |
| EP API, plenární PN (`plenary-documents/{A-10-…}` → `inverse_foresees_change_of`) | PN ke zprávám A10 | 561 zpráv, 1 413 dokumentů, 11 275 PN, do 20. 10. 2026 | v titulku: „A10-0259/1 - Pozměňovací návrh 1 - Jméno, Jméno - [za skupinu X] - Zpráva …“ | CC BY 4.0, JSON-LD | ano |
| EP API, PN k návrhům usnesení (B10, RC) | dokumenty PN | – | v titulku ani jinde nejsou | – | ne (podle HTV je podávají frakce) |
| Parltrack `ep_amendments.json.zst` (dump 3. 2. 2026) | výborové PN | 645 dokumentů do 29. 1. 2026 | `meps` = ID poslanců | ODbL | jen křížová kontrola |
| Parltrack `ep_plenary_amendments.json.zst` (24. 7. 2026) | plenární PN | pro 10. období jen PN výborů ze zpráv, bez autorů a data | – | ODbL | ne |
| Parltrack `ep_mep_activities.json.zst` (24. 7. 2026) | aktivity poslanců | PN v něm nejsou | – | ODbL | ne |
| HowTheyVote `amendment_authors_votes`, `amendment_urls` | jmenovitá hlasování o PN | 3 810 hlasování o PN | jen typ autora (GROUP, MEMBERS, COMMITTEE…) | ODbL, CSV | ke spárování výsledku |

Technické poznámky k EP API: seznam `documents?work-type=AMENDMENT_LIST` vrací spolehlivě jen stránky po 10 (větší padají na 500, OutOfMemory) a filtruje se rokem (`year`).
Seznam celého období je asi 380 dotazů. Při výpadku EP API 24. 10. dopoledne padaly i malé stránky (viz #85, #86).

## Počty pro české poslance

Počítá se jen v době mandátu. PN s více autory se připisuje každému z nich.
- **Výbor celkem**: poslanec je mezi autory (`<Members>`). **Sám**: jediný autor. **Za frakci**: PN je navíc „on behalf of the … Group“.
  **Dossierů**: počet různých procedur.
- **Parltrack**: totéž podle Parltracku (do 29. 1. 2026, neúplné), jen pro srovnání.
- **Plénum spolupodepsané**: PN poslanců ke zprávám A10, kde je mezi podepsanými (vše hromadné PN nad prahem 1/20 poslanců; PN „za skupinu“ a PN výborů se nepočítají).

| Poslanec | Mandát | Výbor celkem | Sám | Za frakci | Dossierů | Parltrack | Plénum spolupodepsané |
|---|---|---:|---:|---:|---:|---:|---:|
| Nikola Bartůšek | od 16. 7. 2024 | 1024 | 44 | 57 | 45 | 1055 | 119 |
| Jaroslav Bžoch | od 16. 7. 2024 | 1493 | 55 | 13 | 51 | 488 | 158 |
| Ivan David | od 16. 7. 2024 | 413 | 163 | 8 | 19 | 73 | 1 |
| Klára Dostálová | od 16. 7. 2024 | 1598 | 351 | 0 | 36 | 557 | 158 |
| Ondřej Dostál | od 16. 7. 2024 | 92 | 46 | 0 | 10 | 28 | 4 |
| Jan Farský | od 16. 7. 2024 | 1299 | 196 | 0 | 34 | 168 | 19 |
| Markéta Gregorová | od 16. 7. 2024 | 679 | 456 | 387 | 18 | 482 | 6 |
| Martin Hlaváček | 16. 7. 2024 – 31. 7. 2024 | 0 | 0 | 0 | 0 | 0 | 0 |
| Ondřej Knotek | od 16. 7. 2024 | 3184 | 105 | 29 | 104 | 938 | 158 |
| Jaroslav Knot | od 31. 7. 2025 | 391 | 0 | 0 | 13 | 0 | 58 |
| Ondřej Kolář | od 16. 7. 2024 | 194 | 176 | 0 | 13 | 94 | 12 |
| Kateřina Konečná | od 16. 7. 2024 | 685 | 675 | 0 | 39 | 280 | 4 |
| Ondřej Kovařík | 16. 7. 2024 – 30. 7. 2025 | 89 | 17 | 0 | 2 | 89 | 6 |
| Ondřej Krutílek | od 16. 7. 2024 | 1611 | 535 | 227 | 47 | 287 | 15 |
| Tomáš Kubín | od 1. 8. 2024 | 2232 | 84 | 5 | 81 | 723 | 149 |
| Jana Nagyová | od 16. 7. 2024 | 2473 | 169 | 29 | 54 | 496 | 154 |
| Danuše Nerudová | od 16. 7. 2024 | 418 | 257 | 0 | 41 | 256 | 15 |
| Luděk Niedermayer | od 16. 7. 2024 | 293 | 118 | 0 | 9 | 65 | 9 |
| Jaroslava Pokorná Jermanová | od 16. 7. 2024 | 836 | 90 | 0 | 39 | 328 | 145 |
| Antonín Staněk | od 4. 10. 2025 | 1330 | 12 | 0 | 37 | 36 | 77 |
| Filip Turek | 16. 7. 2024 – 3. 10. 2025 | 607 | 4 | 82 | 29 | 621 | 78 |
| Alexandr Vondra | od 16. 7. 2024 | 1805 | 318 | 390 | 53 | 505 | 12 |
| Veronika Vrecionová | od 16. 7. 2024 | 417 | 74 | 0 | 22 | 309 | 9 |
| Tomáš Zdechovský | od 16. 7. 2024 | 1294 | 629 | 29 | 66 | 549 | 50 |

**Pokrytí:** výbor 16. 7. 2024 – 21. 10. 2026 (DOCX EP), plénum 16. 7. 2024 – 20. 10. 2026 (EP API, zprávy A10).
Tabulka má 24 osob: 21 mandátů a poslanci s ukončeným nebo pozdějším mandátem (`data/meps.json`).

**Co se nepřipisuje nikomu:**
- kompromisní PN ve výborech (11 dokumentů, `TypeAM: COMPROMISE AMENDMENTS`): vyjednávají je stínoví zpravodajové za více frakcí,
- plenární PN frakcí (zprávy A10): The Left 1 211, PfE 1 038, ESN 856, ECR 691, PPE 311, Verts/ALE 301, S&D 239, Renew 120,
- plenární PN výborů (předkládá zpravodaj nebo předseda): 6 051.

## Párování s výsledky hlasování (HowTheyVote)

Přes URL PN v `amendment_urls` (`…/A-10-2026-0259-AM-001-002_EN.pdf`), tedy přesně na dokument.
- Plenární PN poslanců (A10): 82 ze 156 dokumentů (53 %) mají jmenovité hlasování. S podpisem Čecha 47 z 87 (54 %): 147× zamítnuto, 11× přijato.
- PN ve výborech spárovat nejde, hlasování ve výborech nejsou strojově dostupná.

## Doporučení

1. **PN ve výborech: jedno číslo „pozměňovací návrhy ve výborech“** (Výbor celkem) s datem pokrytí, jen jako počet, bez pořadí a úspěšnosti, mezi „další aktivitou“.
   Pod číslem „z toho sám N, za frakci N“ a u PN s mnoha spoluautory vysvětlivka, že se počítá každému.
2. **PN v plénu jako „spolupodepsané“** (rozhodnutí 24. 10.), šedě, s vysvětlivkou o hromadných podpisech.
3. **Detaily:** na profilu seznam posledních dokumentů (výbor, procedura, datum, počet PN, odkaz na DOCX/PDF v registru EP). Odkaz na Parltrack jen jako doplněk.
4. **Pravidlo v `CLAUDE.md`** (návrh, obdobně jako výjimka pro XML hlasování v části C):
   > Pro pozměňovací návrhy smí pipeline číst oficiální DOCX z registru EP, na který odkazuje EP Open Data API (`distribution/reds_iCmDoc_Amd/…`), a to jen ze strojových značek šablony EP (`<NumAm>`, `<Members>`, `<AuNomDe>`, `<RangeAM>`). HTML se dál nescrapuje. Při změně šablony skript skončí čitelnou chybou.

### Známá omezení
- Jména autorů v DOCX i titulcích EP se párují přesnou shodou (bez diakritiky a velikosti písmen) na 24 známých jmen. Překlep v dokumentu vede k vynechanému PN, ne k chybnému přiřazení.
- 25 dokumentů ještě nemá anglickou verzi (404). Produkce je stáhne v jiném jazyce nebo příští týden.
- Jeden PN s 80 podpisy se počítá každému stejně jako PN jednoho autora, proto se ukazuje i „sám“.
- Čísla jsou silně ovlivněná tím, kdo sedí v kterých výborech (MFF 2028–2034 v roce 2026 = tisíce PN v BUDG/REGI/AGRI). Srovnání poslanců bez kontextu výborů je zavádějící.

## Odhad práce pro produkční `fetch_amendments.py`

- **Výbor (EP API + DOCX):** výpis po rocích, stav zpracovaných dokumentů v `data/amendments_state.json` (stejně jako `proposals_state.json`), stažení DOCX jen nových dokumentů
  (první běh ~1 500 souborů, asi 200 MB a 30 min s throttlingem, pak desítky týdně), parser s `FormatError` a kontrolou `<RangeAM>`, testy na fixture `tests/fixtures/amendments/`.
  Asi **1,5 dne**. Bez nové závislosti (DOCX je ZIP, stačí standardní knihovna).
- **Plénum (EP API):** 1 dotaz na zprávu A10 (první běh ~600 dotazů), dál jen nové zprávy; parser titulku s testy na tři tvary. Asi **0,5 dne**.
- Web (profil, „další aktivita“, duel): asi **1 den**.

### Návrh schématu `data/amendments.json`

```json
{
  "source": {
    "committee": {"name": "EP Open Data API v2 + DOCX z registru EP", "url": "https://data.europarl.europa.eu/api/v2/documents?work-type=AMENDMENT_LIST", "license": "CC BY 4.0", "coverage_to": "2026-10-21"},
    "plenary": {"name": "EP Open Data API v2", "url": "https://data.europarl.europa.eu/api/v2/plenary-documents", "license": "CC BY 4.0", "coverage_to": "2026-10-20"}
  },
  "meps": {
    "256852": {
      "committee": {"total": 1024, "sole": 44, "on_behalf_of_group": 57, "dossiers": 45,
                     "recent": [{"doc": "MOCK-AM-000000", "date": "2026-01-01", "procedure": "MOCK", "count": 1}]},
      "plenary": {"cosigned": 119}
    }
  }
}
```
Hodnota `null` u poslance, jehož mandát leží celý mimo pokrytí zdroje.
