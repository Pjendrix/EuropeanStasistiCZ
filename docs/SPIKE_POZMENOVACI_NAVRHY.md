# Spike: pozměňovací návrhy (PN) českých poslanců

Stav k 24. 10. 2026. Navazuje na `docs/PRUZKUM_FAZE_D.md` (14. 10. 2026). Jen průzkum, na web ani do `data/` nic nejde.
Skripty: `scratch/pn_probe.py` (struktura dumpů), `scratch/pn_ep_reports.py` (plenární PN z EP API), `scratch/pn_spike.py` (počty a párování s HowTheyVote).

## Shrnutí

- **Výborové PN** (tam je většina skutečné práce na textech): jediný strojově čitelný zdroj s autory je Parltrack `ep_amendments`. Data končí **29. 1. 2026** a dump se od 3. 2. 2026 neaktualizoval.
  Čísla sedí s Parltrackem (Bartůšek 1 055 = jeho stránka na parltrack.org).
- **Plenární PN**: EP Open Data API je má aktuálně, poslední z 20. 10. 2026. Jména autorů jsou jen v titulku dokumentu, ale v pevném tvaru, takže jdou spolehlivě spárovat.
  Všech 1 416 plenárních PN s podpisem Čecha jsou ale **hromadné návrhy s 36 a více podpisy** (práh 1/20 poslanců, medián 74 podpisů). Žádný Čech nepodal plenární PN sám.
  Jako ukazatel osobní práce je to slabé: číslo hlavně ukazuje, jestli frakce (zejména PfE) sbírá podpisy pod hromadné PN.
- Odkaz na detaily: **profil poslance na webu EP sekci PN nemá**. Pro výborové PN je k dispozici `https://parltrack.org/activities/{id}/type/amendments` (seznam s odkazy na PDF EP).

## Zdroje

| Zdroj | Co má | Pokrytí 10. období | Autoři | Licence, formát | Použitelné |
|---|---|---|---|---|---|
| Parltrack `ep_amendments.json.zst` (120 MB, dump 3. 2. 2026) | výborové PN, 1,27 mil. záznamů | 115 043 záznamů, 16. 7. 2024 – **29. 1. 2026** (402 záznamů s nesmyslným datem 2047+ vyřazeno) | `meps` = ID poslanců EP, `authors` text (u 12 020 „on behalf of the … Group“) | ODbL, JSON po řádcích | ano, s datem pokrytí |
| Parltrack `ep_plenary_amendments.json.zst` (24. 7. 2026) | plenární PN | 3 430 záznamů, ale jen PN výborů vyčtené z HTML zpráv: **bez autorů, bez data**, rozbité `id` | žádní | ODbL | ne |
| Parltrack `ep_mep_activities.json.zst` (24. 7. 2026) | aktivity po poslancích | kategorie CRE, REPORT, WQ, MOTION…, **PN chybí** | – | ODbL | ne |
| EP Open Data API v2 `plenary-documents/{A-10-…}` → `inverse_foresees_change_of` | všechny plenární PN ke zprávě (dokumenty `A-10-RRRR-NNNN-AM-xxx-yyy`), rozsah čísel PN, datum | 561 zpráv A10, 1 413 dokumentů PN, 11 275 PN, poslední 20. 10. 2026 | jen v titulku: „A10-0259/1 - Pozměňovací návrh 1 - Jméno, Jméno - [za skupinu X] - Zpráva …“ | CC BY 4.0, JSON-LD | ano (jen zprávy A10) |
| EP API, PN k návrhům usnesení (B10, RC) | dokumenty PN existují | – | **titulek autory neuvádí v žádném jazyce** | CC BY 4.0 | ne (podle HTV je podávají frakce) |
| EP API, výborové PN (`documents/REGI-AM-782329` apod.) | metadata dokumentu (výbor, PE číslo, rozsah PN, datum) | průběžně, i po únoru 2026 | **jen v PDF/DOCX** | CC BY 4.0 | existuje, ale vyžadovalo by parsování DOCX |
| HowTheyVote `amendment_authors_votes`, `amendment_urls` | jmenovité hlasování o PN, typ autora, URL PN | 3 810 hlasování o PN v 10. období (GROUP 3 605, MEMBERS 256, COMMITTEE 204, RAPPORTEUR 4) | jen typ (+ kód frakce), žádná jména | ODbL, CSV | ke spárování výsledku |

Technické poznámky k EP API: seznam `documents?work-type=AMENDMENT_LIST` padá na 500 (OutOfMemory) při stránce nad 10 položek a filtry `committee-documents`/`plenary-documents` s tímto typem vrací 204.
Cesta přes zprávy (1 dotaz na zprávu) je proto výrazně levnější než procházet seznam PN.

## Počty pro české poslance

Počítá se jen v době mandátu. Jeden PN s více autory se připisuje každému. Plenární PN jsou počítány po jednotlivých číslech (dokument `AM-004-013` = 10 PN).

- **Výbor celkem**: poslanec je mezi autory (`meps`). **Výbor sám**: jediný autor. **z toho za frakci**: text „on behalf of the … Group“ (Parltrack je připisuje poslanci, který je předložil).
- **Plénum celkem**: poslanec je mezi podepsanými u PN poslanců (ne frakce, ne výboru). **Plénum sám**: jediný podpis. **Plénum za frakci**: předložil PN „za skupinu“; to se mu nepřipisuje, uvedeno jen pro představu.

| Poslanec | Mandát | Výbor celkem | Výbor sám | z toho za frakci | Výbor: dossierů | Plénum celkem | Plénum sám | Plénum za frakci |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Nikola Bartůšek | od 16. 7. 2024 | 1055 | 44 | 39 | 43 | 119 | 0 | 301 |
| Jaroslav Bžoch | od 16. 7. 2024 | 488 | 6 | 26 | 22 | 158 | 0 | 31 |
| Ivan David | od 16. 7. 2024 | 73 | 66 | 0 | 5 | 1 | 0 | 14 |
| Klára Dostálová | od 16. 7. 2024 | 557 | 80 | 0 | 22 | 158 | 0 | 37 |
| Ondřej Dostál | od 16. 7. 2024 | 28 | 0 | 0 | 4 | 4 | 0 | 0 |
| Jan Farský | od 16. 7. 2024 | 168 | 67 | 0 | 15 | 19 | 0 | 0 |
| Markéta Gregorová | od 16. 7. 2024 | 482 | 384 | 127 | 10 | 6 | 0 | 10 |
| Martin Hlaváček | 16. 7. – 31. 7. 2024 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Ondřej Knotek | od 16. 7. 2024 | 938 | 26 | 29 | 56 | 158 | 0 | 81 |
| Jaroslav Knot | od 31. 7. 2025 | 0 | 0 | 0 | 0 | 58 | 0 | 0 |
| Ondřej Kolář | od 16. 7. 2024 | 94 | 76 | 0 | 9 | 12 | 0 | 3 |
| Kateřina Konečná | od 16. 7. 2024 | 280 | 270 | 0 | 21 | 4 | 0 | 0 |
| Ondřej Kovařík | 16. 7. 2024 – 30. 7. 2025 | 89 | 17 | 0 | 2 | 6 | 0 | 0 |
| Ondřej Krutílek | od 16. 7. 2024 | 287 | 104 | 0 | 19 | 15 | 0 | 55 |
| Tomáš Kubín | od 1. 8. 2024 | 723 | 18 | 2 | 33 | 149 | 0 | 14 |
| Jana Nagyová | od 16. 7. 2024 | 496 | 34 | 29 | 23 | 154 | 0 | 126 |
| Danuše Nerudová | od 16. 7. 2024 | 256 | 158 | 0 | 26 | 15 | 0 | 1 |
| Luděk Niedermayer | od 16. 7. 2024 | 65 | 41 | 0 | 2 | 9 | 0 | 0 |
| Jaroslava Pokorná Jermanová | od 16. 7. 2024 | 328 | 29 | 0 | 21 | 145 | 0 | 11 |
| Antonín Staněk | od 4. 10. 2025 | 36 | 0 | 0 | 4 | 77 | 0 | 44 |
| Filip Turek | 16. 7. 2024 – 3. 10. 2025 | 621 | 4 | 29 | 29 | 78 | 0 | 45 |
| Alexandr Vondra | od 16. 7. 2024 | 505 | 223 | 58 | 30 | 12 | 0 | 72 |
| Veronika Vrecionová | od 16. 7. 2024 | 309 | 27 | 0 | 15 | 9 | 0 | 48 |
| Tomáš Zdechovský | od 16. 7. 2024 | 549 | 308 | 12 | 47 | 50 | 0 | 25 |

**Pokrytí:** výbor 16. 7. 2024 – 29. 1. 2026 (Parltrack, dump 3. 2. 2026); plénum 16. 7. 2024 – 20. 10. 2026 (EP API, zprávy A10).
Tabulka má 24 osob: 21 mandátů a náhradníci nebo poslanci s ukončeným mandátem (`data/meps.json`).
U poslanců, kteří nastoupili později, pokrývají výborová data jen část mandátu (Knot: 31. 7. 2025 – 29. 1. 2026, Staněk: 4. 10. 2025 – 29. 1. 2026).

**PN frakcí** (nepřipisují se nikomu), plénum, zprávy A10: The Left 1 211, PfE 1 038, ESN 856, ECR 691, PPE 311, Verts/ALE 301, S&D 239, Renew 120.
PN výborů v plénu (předkládá zpravodaj nebo předseda): 6 051. Nezařazeno 57 PN ve 3 dokumentech bez titulku.

## Párování s výsledky hlasování (HowTheyVote)

Párování přes URL PN v `amendment_urls` (`…/A-10-2026-0259-AM-001-002_EN.pdf`), tedy přesně na dokument PN, ne odhadem.
- Plenární PN poslanců (zprávy A10): 82 ze 156 dokumentů (53 %) má jmenovité hlasování. Ostatní se hlasovaly zvednutím ruky, padly s jiným PN, nebo se nehlasovaly vůbec.
- S podpisem Čecha: 47 z 87 dokumentů (54 %). Ve jmenovitých hlasováních bylo 147× zamítnuto a 11× přijato.
- Výborové PN s výsledkem spárovat nejdou, hlasování ve výborech nejsou strojově dostupná.

## Doporučení

1. **Zobrazit jedno číslo: „pozměňovací návrhy ve výborech“** (Výbor celkem) s viditelným datem pokrytí „podle Parltracku, data do 29. 1. 2026“ a odkazem na `parltrack.org/activities/{id}/type/amendments`.
   Jen jako počet, bez úspěšnosti a bez pořadí, šedě mezi „další aktivitou“ (jak předpokládá `ZADANI_PROJEVY_A_POZMENOVACI_NAVRHY.md`).
   U poslanců, kteří nastoupili po 1. 1. 2026, místo 0 zobrazit „–“ (období bez dat).
2. **Plenární PN jednotlivě nezobrazovat.** Jsou to výhradně hromadné podpisy (36+). Číslo by odměňovalo podepisování za frakci, ne práci. Případně jen v duelu/profilu jako „spolupodepsané PN v plénu“ s vysvětlivkou.
   Rozhodnutí je redakční, data jsou připravená.
3. **Čerstvější výborové PN** existují v EP API, ale autoři jsou jen v PDF/DOCX (`distribution/reds_iPlRp_Amd/…docx`). Parsování DOCX je mimo pravidla repa, proto jen poznámka. Pravidelně kontrolovat `Last-Modified` dumpu Parltracku. Pokud se obnoví, stačí přepočítat.

### Známá omezení
- Parltrack sám stahuje dokumenty EP (je to odvozený zdroj) a dump se neaktualizuje pravidelně. Bez novějšího dumpu výborové PN stárnou.
- Jména v titulcích EP se párují přesnou shodou (bez diakritiky a velikosti písmen) na 24 známých jmen. Přejmenování nebo překlep v titulku se projeví jako vynechaný PN, ne jako chybné přiřazení.
- Jeden PN s 80 podpisy se počítá každému z 80 podepsaných stejně jako PN podaný jedním poslancem. Proto doporučení 1 počítá výbor celkem, ale sloupec „sám“ je pro kontext.

## Odhad práce pro produkční `fetch_amendments.py`

- Výbor (Parltrack): kontrola `Last-Modified` a stažení 120 MB `.zst` jen při změně, streamované čtení (~1 min), validace polí (`meps`, `date`, `reference`, `peid`), filtr data a mandátu, testy na fixture `tests/fixtures/parltrack/`. Asi **1 den** i s napojením na `activity.py` a profil.
- Plénum (EP API, volitelně): 1 dotaz na zprávu A10 (první běh ~600 dotazů, ~15 minut s throttlingem), dál jen nové zprávy. Parser titulku s testy na všechny tři tvary + `FormatError`. Asi **1 den**.
- Závislost: `zstandard` (do `requirements.in`).

### Návrh schématu `data/amendments.json`

```json
{
  "source": {
    "committee": {"name": "Parltrack ep_amendments", "url": "https://parltrack.org/dumps/ep_amendments.json.zst", "license": "ODbL", "dump_date": "2026-02-03", "coverage_to": "2026-01-29"},
    "plenary": {"name": "EP Open Data API v2", "url": "https://data.europarl.europa.eu/api/v2/plenary-documents", "license": "CC BY 4.0", "coverage_to": "2026-10-20"}
  },
  "meps": {
    "256852": {
      "committee": {"total": 1055, "sole": 44, "on_behalf_of_group": 39, "dossiers": 43, "details_url": "https://parltrack.org/activities/256852/type/amendments"},
      "plenary": {"cosigned": 119, "sole": 0}
    }
  }
}
```
Hodnota `null` u poslance, jehož mandát leží celý mimo pokrytí zdroje.
