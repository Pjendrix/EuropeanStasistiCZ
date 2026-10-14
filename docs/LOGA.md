# Loga stran a frakcí – kde je stáhnout

Loga jsou ochranné známky. Stahují se ručně z oficiálních webů, ukládají se **bez úprav**
a používají se jen k identifikaci. Když logo chybí, web ukáže textový štítek se zkratkou.

**Kam uložit:** název souboru = klíč ze sloupce „Soubor“, formát `svg` (preferovaný), `png`, `jpg` nebo `webp`.
Po uložení spusť `python scripts/compute_stats.py`, který logo najde a zapíše do `parties.json` / `groups.json`.

Odkazy jsem ověřil 14. 10. 2026 jen tak, že stránka existuje. Jestli na ní logo opravdu je ke stažení, je potřeba zkontrolovat ručně.

## České strany → `public/assets/logos/cz/`

| Strana | ID v EP | Soubor | Kde hledat |
|---|---|---|---|
| ANO 2011 | 6794 | `6794.svg` | https://www.anobudoucnosti.cz (web z našeho prostředí neodpovídal, media sekci najdi ručně) |
| ODS | 6768 | `6768.svg` | https://www.ods.cz (odkaz na média na úvodní stránce nenalezen, zkus patičku webu) |
| STAN | 6835 | `6835.svg` | https://www.starostove.cz/ke-stazeni |
| TOP09/STAN (Niedermayer, Kolář) | 6793 | `6793.svg` | EP je vede jako společnou kandidátku TOP 09 a STAN. Podle konceptu se má ukázat logo konkrétní strany poslance, ne koalice: https://www.top09.cz (sekce pro novináře: https://www.top09.cz/co-delame/odebirani-novinek/#formular_pro_novinare) |
| KDU-ČSL | 6770 | `6770.svg` | https://www.kdu.cz (media sekci najdi ručně) |
| Piráti (PIR) | 6862 | `6862.svg` | https://pirati.cz/download/ |
| SPD | 6864 | `6864.svg` | https://spd.cz/volby2025/ke-stazeni/ |
| KSČM | 6769 | `6769.svg` | https://www.kscm.cz/ke-stazeni-a-sdileni/ |
| Motoristé sobě (AUTO) | 7034 | `7034.svg` | https://motoristesobe.cz/hlavni-stranka-wall-media/#media |
| Přísaha (PSH) | 7033 | `7033.svg` | https://www.hnutiprisaha.cz (web z našeho prostředí neodpovídal) |
| nezávislý (Ind.) | 6843 | – | není strana, logo se nepoužije |

## Frakce EP → `public/assets/logos/ep/`

| Frakce | Soubor | Kde hledat |
|---|---|---|
| EPP | `EPP.svg` | https://www.eppgroup.eu/logo-graphic-charter |
| ECR | `ECR.svg` | https://ecrgroup.eu/logos_branding |
| Patrioti pro Evropu (PfE) | `PFE.svg` | https://patriots.eu (media sekci najdi ručně) |
| Zelení/EFA | `GREEN_EFA.svg` | https://www.greens-efa.eu/en/who-we-are/press-contacts |
| ESN | `ESN.svg` | https://esn-group.eu (media sekci najdi ručně) |
| S&D | `SD.svg` | https://www.socialistsanddemocrats.eu |
| Renew Europe | `RENEW.svg` | https://www.reneweuropegroup.eu |
| Levice (The Left) | `GUE_NGL.svg` | https://left.eu (z našeho prostředí blokováno) |
| Nezařazení (NI) | – | nejsou frakce, logo nemají |

Čeští poslanci jsou v EPP, ECR, PfE, Zelení/EFA, ESN a NI. Ostatní frakce se na webu objevují jen v detailu hlasování.
