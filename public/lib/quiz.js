// Čisté funkce kvízu (public/kviz.html, pages/kviz.js): shoda s poslanci, uložený postup, pořadí a poloha teček v půlkruhu.
// Bez DOM, aby šly testovat v Node (tests/js/quiz.test.mjs). Data jsou z data/quiz.json (scripts/quiz.py).

// Méně společných otázek = procento bez vypovídací hodnoty, poslanec jde do zvláštní skupiny.
export const MIN_COMMON = 3;
// Odpovědi uživatele: F pro, A proti, B zdržel/a by se, S přeskočeno (do shody se nepočítá).
export const ANSWERS = ["F", "A", "B", "S"];
export const ANSWER_LABEL = { F: "Pro", A: "Proti", B: "Zdržel/a bych se", S: "Přeskočeno" };
// Hlasy poslanců v quiz.json: F, A, B, N (nehlasoval/a).
export const POSITION_TEXT = { F: "pro", A: "proti", B: "zdržel/a se", N: "nehlasoval/a" };
// Pořadí frakcí zleva doprava (stejné jako GROUP_ORDER v scripts/build_home.py a portal.py).
export const GROUP_ORDER = ["GUE_NGL", "SD", "GREEN_EFA", "RENEW", "EPP", "ECR", "PFE", "ESN", "NI"];
export const STORE_KEY = "epw-kviz";

const sortKey = (m) => m.sort_label || m.name || "";
const byName = (x, y) => sortKey(x.m).localeCompare(sortKey(y.m), "cs");

// Shoda = stejné odpovědi / otázky, na které uživatel odpověděl (ne přeskočil) a ve kterých poslanec hlasoval
// (pro, proti, zdržel se). Nehlasoval nebo nebyl v mandátu: otázka se mu nepočítá.
// enough: aspoň MIN_COMMON společných, podle shody, pak počtu společných, pak abecedně; few: zbytek abecedně.
export function agreement(questions, answers, meps) {
  const rows = meps.map((m) => {
    let same = 0, common = 0;
    questions.forEach((q) => {
      const a = answers[q.id], p = q.positions[String(m.id)];
      if (!a || a === "S" || !p || p === "N") return;
      common += 1;
      if (p === a) same += 1;
    });
    return { m, same, common, pct: common ? same / common : null };
  }).filter((r) => r.common);
  return {
    enough: rows.filter((r) => r.common >= MIN_COMMON).sort((x, y) => y.pct - x.pct || y.common - x.common || byName(x, y)),
    few: rows.filter((r) => r.common < MIN_COMMON).sort(byName),
  };
}

// Porovnání jednoho poslance otázku po otázce: ok (stejně), no (jinak), na (nehlasoval/a, nebyl/a v mandátu).
export function compareRows(questions, answers, mepId) {
  return questions.filter((q) => answers[q.id] && answers[q.id] !== "S").map((q) => {
    const a = answers[q.id], p = q.positions[String(mepId)];
    const state = !p ? "out" : p === "N" ? "na" : p === a ? "ok" : "no";
    return { q, a, p: p || null, state };
  });
}

export function czCounts(positions) {
  const c = { F: 0, A: 0, B: 0, N: 0 };
  Object.values(positions).forEach((p) => { if (p in c) c[p] += 1; });
  return c;
}

// Kolik odpovědí (bez přeskočených) a kolik otázek má nějakou volbu.
export const answeredCount = (questions, answers) => questions.filter((q) => answers[q.id]).length;
export const realCount = (questions, answers) => questions.filter((q) => answers[q.id] && answers[q.id] !== "S").length;

// Index, kde pokračovat: první otázka bez odpovědi, jinak poslední.
export function resumeIndex(questions, answers) {
  const i = questions.findIndex((q) => !answers[q.id]);
  return i < 0 ? Math.max(0, questions.length - 1) : i;
}

// Uložený postup (localStorage epw-kviz): jen délka, index, odpovědi a přepínač odhalení. Neplatné hodnoty se zahodí,
// odpovědi jen k otázkám, které v quiz.json pořád jsou (nové týdenní data mohou otázky vyměnit).
export function parseState(raw, quiz) {
  const out = { len: "short", idx: 0, answers: {}, reveal: true };
  let s = null;
  try { s = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { s = null; }
  if (!s || typeof s !== "object") return out;
  if (s.len === "long" || s.len === "short") out.len = s.len;
  if (typeof s.reveal === "boolean") out.reveal = s.reveal;
  const ids = new Set(quiz.questions.map((q) => String(q.id)));
  if (s.answers && typeof s.answers === "object") {
    Object.entries(s.answers).forEach(([id, a]) => { if (ids.has(id) && ANSWERS.includes(a)) out.answers[id] = a; });
  }
  const n = (quiz[out.len] || []).length;
  if (Number.isInteger(s.idx) && s.idx >= 0 && s.idx < n) out.idx = s.idx;
  return out;
}

// Pořadí teček: frakce k datu hlasování (groups v quiz.json) podle GROUP_ORDER, pak příjmení (sort_label).
export function orderIds(q, mepsById) {
  const g = (id) => { const i = GROUP_ORDER.indexOf(q.groups?.[id]); return i < 0 ? GROUP_ORDER.length : i; };
  const name = (id) => sortKey(mepsById.get(Number(id)) || {});
  return Object.keys(q.positions).sort((a, b) => g(a) - g(b) || name(a).localeCompare(name(b), "cs") || Number(a) - Number(b));
}

// Body půlkruhu: řady úměrně poloměru, zleva doprava podle úhlu (jako hub.hemi_slots). Vrací [{x, y}] pro n teček.
export function hemiPoints(n, rows = 3, r0 = 54, r1 = 100, cx = 120, cy = 112) {
  if (n <= 0) return [];
  const rr = Math.min(rows, n);
  const radii = Array.from({ length: rr }, (_, i) => (rr === 1 ? r1 : r0 + ((r1 - r0) * i) / (rr - 1)));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.max(1, Math.round((n * r) / sum)));
  counts[counts.length - 1] += n - counts.reduce((a, b) => a + b, 0);
  const pts = [];
  radii.forEach((r, ri) => {
    const c = counts[ri];
    for (let k = 0; k < c; k++) {
      const a = Math.PI * (c === 1 ? 0.5 : k / (c - 1));
      pts.push({ x: cx - r * Math.cos(a), y: cy - r * Math.sin(a), a, r });
    }
  });
  return pts.sort((p, q) => p.a - q.a || q.r - p.r).map(({ x, y }) => ({ x, y }));
}
