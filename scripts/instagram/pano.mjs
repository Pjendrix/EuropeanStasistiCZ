// Panorama 3 dlaždic pro dolní řadu mřížky Instagramu: mapa EU | mapa ČR | vlajka EU.
// Šířka vizuální části dlaždice v mřížce (ořez 3:4 z 4:5) = 1012 px; každá dlaždice má navíc 34 px přesahu na obou stranách.
import fs from "fs";
import * as topo from "topojson-client";
import { geoAzimuthalEqualArea, geoConicConformal, geoPath, geoContains } from "d3-geo";

const world = JSON.parse(fs.readFileSync("node_modules/world-atlas/countries-50m.json"));
const countries = topo.feature(world, world.objects.countries).features;
const W = 3104, H = 1350, PAD = 34, TW = 1012;
const EU = new Set(["Austria","Belgium","Bulgaria","Croatia","Cyprus","Czechia","Denmark","Estonia","Finland","France","Germany","Greece","Hungary","Ireland","Italy","Latvia","Lithuania","Luxembourg","Malta","Netherlands","Poland","Portugal","Romania","Slovakia","Slovenia","Spain","Sweden"]);
const missing = [...EU].filter(n => !countries.some(c => c.properties.name === n)); if (missing.length) console.error("CHYBÍ:", missing);
const cx = i => PAD + TW * i + TW / 2;       // střed i-té dlaždice v souřadnicích panoramatu
const PRAGUE = [14.4378, 50.0755];

// --- 1. mapa Evropy
const box1 = [[PAD + 20, 170], [PAD + TW - 10, 1180]];
const pEU = geoAzimuthalEqualArea().rotate([-12, -53]).clipExtent([[0, 0], [PAD + TW + 34, H]]);
pEU.fitExtent(box1, { type: "MultiPoint", coordinates: [[-11, 36], [33, 36], [33, 66], [-11, 66], [10, 70.5], [10, 34]] });
const pathEU = geoPath(pEU);
const eurPaths = countries.map(c => {
  const d = pathEU(c); if (!d) return "";
  const eu = EU.has(c.properties.name), cz = c.properties.name === "Czechia";
  return `<path d="${d}" fill="${cz ? "#F59E0B" : eu ? "#2B5BD7" : "rgba(148,163,184,.16)"}" stroke="#0F172A" stroke-width="1.6" stroke-linejoin="round"/>`;
}).join("");
const prEU = pEU(PRAGUE);

// --- 2. mapa ČR + sousedé
const cz = countries.find(c => c.properties.name === "Czechia");
const box2 = [[PAD + TW + 70, 320], [PAD + 2 * TW - 70, 1030]];
const pCZ = geoConicConformal().parallels([49.5, 50.5]).rotate([-15.5, 0]).clipExtent([[PAD + TW - 40, 0], [PAD + 2 * TW + 40, H]]);
pCZ.fitExtent(box2, cz);
const pathCZ = geoPath(pCZ);
const near = new Set(["Germany", "Poland", "Austria", "Slovakia"]);
const nbPaths = countries.filter(c => near.has(c.properties.name)).map(c => `<path d="${pathCZ(c)}" fill="rgba(148,163,184,.13)" stroke="#0F172A" stroke-width="2"/>`).join("");
const czPath = pathCZ(cz);
// 21 teček (počet českých poslanců) rovnoměrně uvnitř hranice, deterministicky
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const [[bx0, by0], [bx1, by1]] = pathCZ.bounds(cz);
const pts = []; let tries = 0;
while (pts.length < 21 && tries++ < 200000) {
  const x = bx0 + rnd() * (bx1 - bx0), y = by0 + rnd() * (by1 - by0);
  const ll = pCZ.invert([x, y]); if (!geoContains(cz, ll)) continue;
  const minD = 112 - Math.min(40, tries / 800);
  if (pts.every(p => Math.hypot(p[0] - x, p[1] - y) > minD)) pts.push([x, y]);
}
const prCZ = pCZ(PRAGUE);
const dotsCZ = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="19" fill="#F8FAFC" opacity=".95"/>`).join("");

// --- 3. vlajka EU (12 zlatých hvězd na modrém poli, 3:2)
const fw = 830, fh = 553, fx = cx(2) - fw / 2, fy = H / 2 - fh / 2 - 10;
const star = (x, y, R) => { let d = ""; for (let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.382 : R, a = -Math.PI / 2 + i * Math.PI / 5; d += (i ? "L" : "M") + (x + r * Math.cos(a)).toFixed(2) + " " + (y + r * Math.sin(a)).toFixed(2); } return d + "Z"; };
const ringR = fh / 3, starR = fh / 18;
const stars = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<path d="${star(fx + fw / 2 + ringR * Math.sin(a), fy + fh / 2 - ringR * Math.cos(a), starR)}" fill="#FFCC00"/>`; }).join("");
const flag = `<g filter="url(#sh)"><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="14" fill="#003399"/>${stars}</g>`;

// --- propojení: tečkovaná zlatá linka přes všechny 3 dlaždice (Praha na mapě EU → Praha na mapě ČR → vlajka)
const a = prEU, b = prCZ, c = [fx - 20, fy + fh / 2];
const link = `M${a[0]},${a[1]} C${a[0] + 330},${a[1] + 330} ${b[0] - 380},${b[1] - 330} ${b[0]},${b[1]} S${c[0] - 260},${c[1] + 280} ${c[0]},${c[1]}`;
const sparkles = Array.from({ length: 90 }, () => `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H).toFixed(0)}" r="${(1 + rnd() * 2.2).toFixed(1)}" fill="#fff" opacity="${(0.08 + rnd() * 0.22).toFixed(2)}"/>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<radialGradient id="g1" cx="85%" cy="0%" r="60%"><stop offset="0" stop-color="#1E3A8A" stop-opacity=".85"/><stop offset="1" stop-color="#1E3A8A" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="15%" cy="100%" r="55%"><stop offset="0" stop-color="#1E3A8A" stop-opacity=".5"/><stop offset="1" stop-color="#1E3A8A" stop-opacity="0"/></radialGradient>
<linearGradient id="czf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B5BD7"/><stop offset="1" stop-color="#1E3A8A"/></linearGradient>
<linearGradient id="fadeR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="mEU" maskUnits="userSpaceOnUse" x="0" y="0" width="${PAD + TW + 34}" height="${H}"><rect x="0" y="0" width="${PAD + TW + 34}" height="${H}" fill="url(#fadeR)"/></mask>
<radialGradient id="fadeC" cx="50%" cy="50%" r="50%"><stop offset=".35" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
<mask id="mNB" maskUnits="userSpaceOnUse" x="${cx(1) - 520}" y="${H / 2 - 520}" width="1040" height="1040"><rect x="${cx(1) - 520}" y="${H / 2 - 520}" width="1040" height="1040" fill="url(#fadeC)"/></mask>
<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#000" flood-opacity=".5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#0F172A"/><rect width="${W}" height="${H}" fill="url(#g1)"/><rect width="${W}" height="${H}" fill="url(#g2)"/>${sparkles}
<g mask="url(#mEU)">${eurPaths}</g>
<g mask="url(#mNB)">${nbPaths}</g><g><path d="${czPath}" fill="url(#czf)" stroke="#F8FAFC" stroke-width="5" stroke-linejoin="round" filter="url(#sh)"/>${dotsCZ}</g>
${flag}
<path d="${link}" fill="none" stroke="#F59E0B" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 20"/>
<g fill="none" stroke="#F59E0B" stroke-width="6"><circle cx="${prEU[0]}" cy="${prEU[1]}" r="22"/><circle cx="${prEU[0]}" cy="${prEU[1]}" r="9" fill="#F59E0B"/><circle cx="${prCZ[0]}" cy="${prCZ[1]}" r="27" stroke="#F59E0B"/><circle cx="${prCZ[0]}" cy="${prCZ[1]}" r="9" fill="#F59E0B"/></g>
</svg>`;
fs.writeFileSync("pano.svg", svg);
console.log("hotovo", pts.length, "teček", prEU.map(Math.round), prCZ.map(Math.round));
