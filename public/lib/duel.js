// Čisté funkce stránky duel.html (bez DOM, testuje node --test). Data: data/duel.json (scripts/duel.py).
import { fmtNum, fmtPct, pct } from "./format.js";

export const ID_RE = /^\d{1,7}$/;
export const SAMPLE_MIN_SHARED = 500;

// Kanonický klíč dvojice (menší ID první): klíč v duel.json, OG karta og/duel/{a}-{b}.png a sdílená stránka d/{a}-{b}.
export function pairKey(a, b) {
  const [lo, hi] = [Number(a), Number(b)].sort((x, y) => x - y);
  return `${lo}-${hi}`;
}

// Parametry ?a=&b= → dvojice nebo null (výběr). ID musí být číslo, patřit poslanci z dat a nesmí být stejné.
export function pickPair(a, b, meps) {
  const ok = (x) => typeof x === "string" && ID_RE.test(x) && meps.some((m) => String(m.id) === x);
  return ok(a) && ok(b) && a !== b ? { a: Number(a), b: Number(b) } : null;
}

// Řádky „čísla proti sobě“: hodnota je číslo, nebo null = zdroj neuvádí / nepočítá se. pair = [čitatel, jmenovatel] u podílů.
export const METRICS = [
  { key: "attendance", label: "Účast na hlasování", pair: (m) => m.attendance, def: "attendance", src: "htv", group: "Hlasování" },
  { key: "presence", label: "Docházka na zasedání", pair: (m) => m.presence, def: "presence", src: "ep", group: "Hlasování" },
  { key: "group_loyalty", label: "Hlasuje s frakcí", pair: (m) => m.group_loyalty, def: "group_loyalty", src: "htv", group: "Hlasování" },
  { key: "votes_in_mandate", label: "Hlasování v době mandátu", value: (m) => m.votes_in_mandate, def: "attendance", src: "htv", group: "Hlasování", count: true },
  ...["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"].map((p) => ({
    key: `pos_${p}`, label: { FOR: "Pro", AGAINST: "Proti", ABSTENTION: "Zdržel/a se", DID_NOT_VOTE: "Nehlasoval/a" }[p], pos: p,
    pair: (m) => [m.positions[p] || 0, m.votes_in_mandate], def: "attendance", src: "htv", group: "Hlasování", count: true,
  })),
  { key: "against_group", label: "Proti většině své frakce", pair: (m) => m.against_group, def: "against_group", src: "htv", group: "Hlasování", count: true },
  { key: "reports", label: "Zprávy (zpravodaj/ka)", value: (m) => m.reports, def: "own_work", src: "ep", group: "Vlastní práce", count: true },
  { key: "shadow_reports", label: "Stínové zprávy", value: (m) => m.shadow_reports, def: "own_work", src: "ep", group: "Vlastní práce", count: true },
  { key: "opinions", label: "Stanoviska (zpravodaj/ka)", value: (m) => m.opinions, def: "own_work", src: "ep", group: "Vlastní práce", count: true },
  { key: "shadow_opinions", label: "Stínová stanoviska", value: (m) => m.shadow_opinions, def: "own_work", src: "ep", group: "Vlastní práce", count: true },
  { key: "motions", label: "Návrhy usnesení", value: (m) => sumOrNull(m.motions, m.joint_motions), def: "own_work", src: "ep", group: "Vlastní práce", count: true },
  { key: "questions", label: "Písemné a ústní otázky", value: (m) => m.questions, def: "own_work", src: "ep", group: "Vlastní práce", count: true },
  { key: "speeches", label: "Projevy v plénu", value: (m) => m.speeches, def: "speeches", src: "ep", group: "Vlastní práce", count: true },
  { key: "amendments", label: "Pozměňovací návrhy ve výborech", value: (m) => m.amendments, def: "amendments", src: "ep", group: "Vlastní práce", count: true },
  { key: "amendments_cosigned", label: "Spolupodepsané PN v plénu", value: (m) => m.amendments_cosigned, def: "amendments", src: "ep", group: "Vlastní práce", count: true },
];

export function sumOrNull(...xs) {
  return xs.some((x) => x === null || x === undefined) ? null : xs.reduce((s, x) => s + x, 0);
}

// Hodnota řádku pro poslance: { n: číslo k zobrazení, share: podíl 0–1 nebo null, total: jmenovatel }.
export function metricValue(metric, m) {
  if (metric.pair) {
    const p = metric.pair(m);
    if (!p) return { n: null, share: null, total: null };
    return { n: p[0], share: pct(p), total: p[1] };
  }
  const v = metric.value(m);
  return { n: v ?? null, share: null, total: null };
}

// Délky proužků na stejné škále: obě strany vůči většímu z nich (0–100). Podíly se kreslí v procentech (škála 0–100 %).
export function barWidths(x, y, isShare) {
  const a = x ?? 0, b = y ?? 0;
  if (isShare) return [Math.round(a * 1000) / 10, Math.round(b * 1000) / 10];
  const max = Math.max(a, b);
  return max ? [Math.round((a / max) * 1000) / 10, Math.round((b / max) * 1000) / 10] : [0, 0];
}

// Ukázkové dvojice pravidlem (ne redakčně): mezi současnými poslanci s aspoň SAMPLE_MIN_SHARED společnými hlasováními
// dvě s nejvyšší a dvě s nejnižší shodou. Při shodě rozhoduje klíč dvojice.
export function samplePairs(duel, isActive, n = 2) {
  const active = new Set(duel.meps.filter(isActive).map((m) => String(m.id)));
  const rows = Object.entries(duel.pairs)
    .filter(([k, p]) => k.split("-").every((id) => active.has(id)) && p.agreement[1] >= SAMPLE_MIN_SHARED)
    .map(([k, p]) => ({ key: k, share: p.agreement[0] / p.agreement[1] }))
    .sort((x, y) => x.share - y.share || (x.key < y.key ? -1 : 1));
  return { high: rows.slice(-n).reverse(), low: rows.slice(0, n) };
}

// Řádek rozchodu z duel.json / shardu ([id, pozice menšího ID, pozice většího, frakce menšího, frakce většího])
// v pořadí, které zvolil uživatel (a vlevo, b vpravo).
export function orient(row, a, b) {
  const [id, p1, p2, g1, g2] = row;
  return a < b ? { id, a: p1, b: p2, ga: g1, gb: g2 } : { id, a: p2, b: p1, ga: g2, gb: g1 };
}

// Období mandátu pro poznámku pod řádky s počty, když mají poslanci různě dlouhý mandát.
export function mandateSpan(m) {
  const first = m.mandates[0], last = m.mandates[m.mandates.length - 1];
  return { from: first.start, to: last.end };
}

export function sameMandate(x, y) {
  const a = mandateSpan(x), b = mandateSpan(y);
  return a.from === b.from && a.to === b.to;
}

// Volba poslance: barva i symbol (✓ pro, ✕ proti, – zdržel se, ○ nehlasoval), aby rozdíl nebyl jen v barvě.
export const POS_GLYPH = { FOR: "✓", AGAINST: "✕", ABSTENTION: "–", DID_NOT_VOTE: "○" };

// Odkaz na hlasování: závěrečná mají statickou stránku v/{id}, ostatní interaktivní detail.
export const voteHref = (v) => (v.is_main ? `v/${v.id}` : `vote?id=${v.id}`);

// Metriky karty ke sdílení (2/3, úkol 4): 7 čísel jako na stránce, proužek na stejné škále (barWidths), null = „–“.
export const SHARE_METRICS = ["attendance", "presence", "group_loyalty", "reports", "shadow_reports", "speeches", "amendments"];
const SHARE_LABEL = { reports: "Zprávy – vede text", shadow_reports: "Zprávy – za frakci", amendments: "PN ve výborech" };

export function shareMetricRows(a, b) {
  return SHARE_METRICS.map((key) => {
    const metric = METRICS.find((x) => x.key === key);
    const va = metricValue(metric, a.metrics), vb = metricValue(metric, b.metrics);
    const isShare = Boolean(metric.pair) && !metric.count;
    const [wa, wb] = barWidths(isShare ? va.share : va.n, isShare ? vb.share : vb.n, isShare);
    const side = (v, w) => (v.n === null ? { text: "–", w: 0, sub: "zdroj neuvádí" }
      : { text: isShare ? fmtPct(v.share) : fmtNum(v.n), w: w / 100, sub: isShare ? `${fmtNum(v.n)} z ${fmtNum(v.total)}` : "" });
    return { key, label: SHARE_LABEL[key] || metric.label, a: side(va, wa), b: side(vb, wb) };
  });
}
