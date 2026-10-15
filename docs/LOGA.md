# Loga stran a frakcí – kde je vzít a jak je nahrát

Loga jsou ochranné známky. Stahují se ručně z oficiálních webů, ukládají se **bez úprav**
a používají se jen k identifikaci. Když logo chybí, web ukáže tečku v barvě a zkratku.

## Stav k 15. 10. 2026

Nahráno z oficiálních webů (bez úprav kresby, rastry jen převedené do bezeztrátového WebP 128 px; zdroj u každého v `data/manual/logos.json`):
ODS, Piráti, STAN, KSČM, SPD, Motoristé sobě, ECR (česká verze EKR), PfE, Renew Europe, S&D.

Chybí (web ukazuje tečku a zkratku). Prostředí Claude Code soubory z webů stran stáhnout nemůže (síť je omezená),
proto je potřeba je stáhnout ručně. Přímé odkazy dohledané 15. 10. 2026 na oficiálních webech:

| Kdo | Uložit jako | Odkud stáhnout | Pozn. |
|---|---|---|---|
| TOP 09 (kandidátka TOP09/STAN, ID 6793) | `cz/6793.svg` | https://www.top09.cz/styles/assets/svg/logo.svg (stránka https://www.top09.cz/o-nas/logo-a-graficky-manual/) | Kolář i Niedermayer jsou členové TOP 09 (potvrzeno autorem webu) → logo TOP 09 |
| ANO 2011 (6794) | `cz/6794.svg` | https://www.anobudoucnosti.cz (web blokuje automatické čtení, stáhnout v prohlížeči z hlavičky nebo sekce pro média) | |
| The Left (GUE_NGL) | `ep/GUE_NGL.webp` | https://left.eu/app/uploads/2024/05/cropped-The-Left_Logo_A_Color-1.png | PNG → bezeztrátové WebP, výška 128 px |
| Greens/EFA (GREEN_EFA) | `ep/GREEN_EFA.webp` nebo `.svg` | ZIP s českou verzí: https://extranet.greens-efa.eu/public/media/file/1/6869 (stránka https://www.greens-efa.eu/en/newsroom/visual-identity) | v ZIPu PNG/EPS/AI; PNG → WebP, z EPS lze SVG konverzí |
| ESN | `ep/ESN.webp` | https://cdn.dorik.com/66f2616720bf9b0012e67e2a/images/logofJAaB-5suZj.png (logo z hlavičky https://esn-group.eu/) | ověřit, že je barevné na světlém pozadí |
| EPP | `ep/EPP.svg` | https://eppgroup.eu/who-we-are/logo-graphic-charter | **jen s výslovným souhlasem** (napsat press@eppgroup.eu) |
| KDU-ČSL (6770), Přísaha (7033) | – | https://www.kdu.cz/o-nas/grafika · https://www.hnutiprisaha.cz | strany už nemají poslance v mandátu, nízká priorita |

Po nahrání souboru doplnit do `data/manual/logos.json` `file`, `source` (URL, odkud je staženo), `retrieved`.
Velikost na webu se vyrovná sama: `compute_stats.py` zapíše poměr stran (`logo_aspect`) a web široká slovní
loga zmenší tak, aby měla zhruba stejnou plochu jako čtvercová (kresba se nemění, jen měřítko).

## Formát a umístění

- **SVG** (preferované): ostré v každé velikosti, obvykle 2–20 kB.
- Když oficiální zdroj nabízí jen rastr (PNG/JPG): bezeztrátové **WebP** ve 2× zobrazované velikosti
  (max. 256 px na výšku). Z EPS lze SVG vyrobit konverzí bez úpravy kresby.
- Frakce → `public/assets/logos/ep/{KÓD}.svg`, strany → `public/assets/logos/cz/{ID}.svg`.
- Každé logo zapsat do `data/manual/logos.json` (zdroj, datum, podmínky).
- SVG z webu před nahráním pročistit (žádné `<script>`, `on…=` atributy, externí odkazy); `svgo` stačí.

Wikimedia Commons je jen pohodlný zdroj: před použitím porovnat s aktuálním logem na oficiálním webu
a do manifestu zapsat oficiální zdroj. Odkazy na Commons jsou z vyhledávání 14. 10. 2026, neověřené otevřením.

## Frakce EP → `public/assets/logos/ep/`

| Frakce | Soubor | Oficiální zdroj | Commons | Poznámka |
|---|---|---|---|---|
| EPP | `EPP.svg` | https://eppgroup.eu/who-we-are/logo-graphic-charter (ZIP po jazycích vč. češtiny: EPS, PNG, JPG) | https://commons.wikimedia.org/wiki/File:EPP_Group_logo-cs.svg | **Web EPP: logo nelze použít bez výslovného souhlasu.** Napsat tiskovému oddělení, do té doby textový štítek. |
| ECR | `ECR.svg` | https://ecrgroup.eu/logos_branding | https://commons.wikimedia.org/wiki/File:ECR_Group_logo_(2020%E2%80%93present).svg | |
| Patrioti (PfE) | `PFE.svg` | https://patriots.eu (media sekce) | https://commons.wikimedia.org/wiki/File:Logo_of_the_Patriots_for_Europe_(October_2024).svg | |
| Zelení/EFA | `GREEN_EFA.svg` | https://www.greens-efa.eu (press) | https://commons.wikimedia.org/wiki/File:GreensEFA_logo_EN.svg | |
| ESN | `ESN.svg` | https://esn-group.eu/ | – | jen z oficiálního webu |
| S&D | `SD.svg` | https://www.socialistsanddemocrats.eu | https://commons.wikimedia.org/wiki/File:S&D.svg | ověřit aktuálnost |
| Renew Europe | `RENEW.svg` | https://www.reneweuropegroup.eu | https://commons.wikimedia.org/wiki/File:Logo_of_Renew_Europe.svg | |
| Levice | `GUE_NGL.svg` | https://left.eu | https://commons.wikimedia.org/wiki/File:Logo_of_The_Left_in_the_European_Parliament.svg | |
| Nezařazení (NI) | – | – | – | nejsou frakce, logo nemají |

## České strany → `public/assets/logos/cz/`

| Strana | ID v EP | Soubor | Oficiální zdroj | Commons | Poznámka |
|---|---|---|---|---|---|
| ANO 2011 | 6794 | `6794.svg` | https://www.anobudoucnosti.cz | https://commons.wikimedia.org/wiki/File:ANO_Logo.svg | ověřit aktuálnost |
| ODS | 6768 | `6768.svg` | https://www.ods.cz/docs/o-nas/ods-logomanual-web.pdf | – | logomanuál uvádí i barvy |
| STAN | 6835 | `6835.svg` | https://www.starostove.cz/ke-stazeni | – | |
| TOP09/STAN | 6793 | `6793.svg` | https://www.top09.cz | https://commons.wikimedia.org/wiki/File:TOP_09_logo.svg | EP vede společnou kandidátku; zobrazit logo strany poslance (ověřit členství) |
| KDU-ČSL | 6770 | `6770.svg` | https://www.kdu.cz | jen JPG/PNG | |
| Piráti | 6862 | `6862.svg` | https://pirati.cz/download/ | https://commons.wikimedia.org/wiki/File:Logo_Pir%C3%A1t%C5%AF.svg | |
| SPD | 6864 | `6864.svg` | https://spd.cz/volby2025/ke-stazeni/ | https://commons.wikimedia.org/wiki/File:SPD_text_logo.svg | |
| KSČM | 6769 | `6769.svg` | https://www.kscm.cz/ke-stazeni-a-sdileni/ | https://commons.wikimedia.org/wiki/File:Logo_KS%C4%8CM.svg | |
| Motoristé sobě | 7034 | `7034.svg` | https://motoristesobe.cz/hlavni-stranka-wall-media/#media | https://commons.wikimedia.org/wiki/File:Motorist%C3%A9_sob%C4%9B_logo.svg | |
| Přísaha | 7033 | `7033.svg` | https://www.hnutiprisaha.cz | – | jen z oficiálního webu |
| nezávislý (Ind.) | 6843 | – | – | – | není strana |

## Nahrání přes web GitHubu (bez Claude Code)

1. Repo → *Add file → Create new file*, do názvu `public/assets/logos/ep/.gitkeep` → commit (vznikne složka). Totéž pro `cz/`.
2. Ve složce *Add file → Upload files*, přetáhnout přejmenované soubory, commit do `main`.
3. Upravit `data/manual/logos.json` (tužka v GitHubu): `file`, `source`, `retrieved`, `terms`.
4. *Actions → Týdenní aktualizace dat → Run workflow* (nebo počkat na pondělí). `compute_stats.py` loga
   najde a zapíše do `groups.json` / `parties.json`, Vercel web nasadí.

## Zobrazení na webu

- Vždy na bílé zaoblené dlaždici (4px padding): tmavá loga fungují i v tmavém režimu bez úpravy loga.
- Pevná výška (20–48 px podle místa), šířka auto, `alt` = celý název.
- V drobných textových štítcích logo nepoužívat (nečitelné), jen tečka + zkratka.
