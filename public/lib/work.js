// Čisté funkce tabulky „Práce na textech po poslancích“ (prace-poslanci.html, hromadné zadání 24. 10. 2026, úkol 0).
// Bez DOM, testy v tests/js/work.test.mjs. Čísla jen z data/work.json, nic se nepřepočítává kromě poměrů pro proužky.

export const VIEWS = {
  texty: { label: "Práce na textech", default: "lead_reports" },
  ucast: { label: "Účast", default: "attendance" },
  aktivita: { label: "Aktivita a návrhy", default: "speeches" },
};
export const DEFAULT_VIEW = "texty";

// Sloupce pohledu: key = klíč řazení, group = nadpis skupiny sloupců (prázdný = bez skupiny).
export const COLUMNS = {
  texty: [
    { key: "lead_reports", label: "Zprávy", group: "Vede text", adopted: "lead_adopted" },
    { key: "lead_opinions", label: "Stanoviska", group: "Vede text" },
    { key: "shadow_reports", label: "Zprávy", group: "Za frakci", adopted: "shadow_adopted" },
    { key: "shadow_opinions", label: "Stanoviska", group: "Za frakci" },
  ],
  ucast: [
    { key: "attendance", label: "Účast na hlasování", group: "" },
    { key: "presence", label: "Docházka", group: "" },
  ],
  aktivita: [
    { key: "speeches", label: "Projevy", group: "" },
    { key: "amendments", label: "PN ve výborech", group: "Pozměňovací návrhy" },
    { key: "amendments_cosigned", label: "PN v plénu spolupodepsané", group: "Pozměňovací návrhy" },
    { key: "motions_signed", label: "Návrhy usnesení podepsané", group: "", muted: true, note: "vypovídá spíš o frakci" },
  ],
};

export function parseView(search) {
  const v = new URLSearchParams(search).get("pohled");
  return Object.hasOwn(VIEWS, v || "") ? v : DEFAULT_VIEW;
}

// Hodnota pro řazení a proužek; null = zdroj nemá (řadí se na konec, proužek prázdný).
export function metric(m, key) {
  if (key === "name") return m.sort_label || m.name || "";
  if (key === "attendance") return m.attendance && m.attendance[1] ? m.attendance[0] / m.attendance[1] : null;
  if (key === "presence") return m.presence && m.presence.days ? m.presence.present / m.presence.days : null;
  const v = m[key];
  return v === undefined ? null : v;
}

// První klik na číselný sloupec řadí sestupně, na jméno vzestupně; druhý klik obrátí.
export function nextSort(state, key) {
  if (state.key === key) return { key, dir: -state.dir };
  return { key, dir: key === "name" ? 1 : -1 };
}

export function sortRows(rows, key, dir) {
  return rows.slice().sort((a, b) => {
    const x = metric(a, key), y = metric(b, key);
    if (x === null && y === null) return (a.sort_label || "").localeCompare(b.sort_label || "", "cs");
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === "string" ? x.localeCompare(y, "cs") : x - y;
    return c * dir || (a.sort_label || "").localeCompare(b.sort_label || "", "cs");
  });
}

// Skupiny podle frakce v pořadí order (kódy webu), uvnitř zachované pořadí řádků. groupOf(m) → kód webu.
export function groupRows(rows, order, groupOf) {
  const out = new Map(order.map((g) => [g, []]));
  for (const r of rows) {
    const g = groupOf(r);
    if (!out.has(g)) out.set(g, []);
    out.get(g).push(r);
  }
  return [...out].filter(([, list]) => list.length).map(([code, list]) => ({ code, rows: list }));
}

// Šířka proužku v % = hodnota / maximum v delegaci u stejné metriky. Nula nebo null = 0.
export function barPct(value, max) {
  if (!value || !max) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function maxOf(rows, key) {
  return rows.reduce((mx, r) => { const v = metric(r, key); return typeof v === "number" && v > mx ? v : mx; }, 0);
}

// Osa pohledu Účast: od minima (účast i docházka, zaokrouhleno dolů na 2 procentní body) do 100 %. Hodnoty v podílech 0–1.
export function axisRange(rows) {
  const vals = rows.flatMap((r) => [metric(r, "attendance"), metric(r, "presence")]).filter((v) => typeof v === "number");
  if (!vals.length) return [0, 1];
  const lo = Math.floor((Math.min(...vals) * 100) / 2) * 2;
  return [Math.min(lo, 98) / 100, 1];
}

export function axisPos(value, range) {
  const [lo, hi] = range;
  return Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
}

// „+1,3 b.“ / „−0,8 b.“ proti mediánu EP (procentní body, jedno desetinné místo).
export function vsMedian(share, median) {
  if (share === null || share === undefined || !median) return "";
  const d = Math.round((share - median) * 1000) / 10;
  if (d === 0) return "na mediánu EP";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} b. proti mediánu EP`;
}
