// Kvíz (public/lib/quiz.js): shoda, porovnání, uložený postup, pořadí teček. Data MOCK.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_COMMON, agreement, answeredCount, compareRows, czCounts, hemiPoints, orderIds, parseState, realCount, resumeIndex,
} from "../../public/lib/quiz.js";

const Q = (id, positions, groups = {}) => ({ id, positions, groups });
const M = (id, sort) => ({ id, name: `MOCK ${sort}`, sort_label: sort });
const QS = [
  Q(1, { 10: "F", 11: "A", 12: "F", 13: "N" }),
  Q(2, { 10: "A", 11: "A", 12: "F", 13: "F" }),
  Q(3, { 10: "F", 11: "F", 12: "B" }),
  Q(4, { 10: "F", 11: "A", 12: "F", 13: "A" }),
];
const MEPS = [M(10, "Č"), M(11, "B"), M(12, "A"), M(13, "D"), M(14, "E")];

test("shoda: stejné / společné, přeskočené a nehlasoval se nepočítají", () => {
  const { enough, few } = agreement(QS, { 1: "F", 2: "A", 3: "F", 4: "S" }, MEPS);
  const by = Object.fromEntries([...enough, ...few].map((r) => [r.m.id, [r.same, r.common]]));
  assert.deepEqual(by, { 10: [3, 3], 11: [2, 3], 12: [1, 3], 13: [0, 1] });
  assert.deepEqual(enough.map((r) => r.m.id), [10, 11, 12]);
  assert.deepEqual(few.map((r) => r.m.id), [13]);   // méně než MIN_COMMON
  assert.equal(MIN_COMMON, 3);
  assert.ok(!by[14]);   // bez společné otázky vůbec není
});

test("shoda: při stejném procentu víc společných otázek, pak abecedně (česky)", () => {
  const qs = [Q(1, { 1: "F", 2: "F", 3: "F" }), Q(2, { 1: "F", 2: "F", 3: "F" }), Q(3, { 1: "F", 2: "F", 3: "F" }), Q(4, { 3: "F" })];
  const meps = [M(1, "Čapek"), M(2, "Cihla"), M(3, "Zeman")];
  const { enough } = agreement(qs, { 1: "F", 2: "F", 3: "F", 4: "F" }, meps);
  assert.deepEqual(enough.map((r) => r.m.id), [3, 2, 1]);   // 4 z 4 před 3 z 3; C před Č
});

test("porovnání otázka po otázce", () => {
  const rows = compareRows(QS, { 1: "F", 2: "F", 3: "S", 4: "F" }, 13);
  assert.deepEqual(rows.map((r) => [r.q.id, r.state]), [[1, "na"], [2, "ok"], [4, "no"]]);
  assert.equal(compareRows(QS, { 3: "F" }, 13)[0].state, "out");   // nebyl/a v mandátu
});

test("počty a pokračování", () => {
  assert.deepEqual(czCounts(QS[0].positions), { F: 2, A: 1, B: 0, N: 1 });
  const a = { 1: "F", 2: "S" };
  assert.equal(answeredCount(QS, a), 2);
  assert.equal(realCount(QS, a), 1);
  assert.equal(resumeIndex(QS, a), 2);
  assert.equal(resumeIndex(QS, { 1: "F", 2: "F", 3: "F", 4: "F" }), 3);
});

test("uložený postup: neplatné a zastaralé hodnoty se zahodí", () => {
  const quiz = { questions: QS, short: [1, 2], long: [1, 2, 3, 4] };
  assert.deepEqual(parseState(null, quiz), { len: "short", idx: 0, answers: {}, reveal: true });
  assert.deepEqual(parseState("{nejde", quiz), { len: "short", idx: 0, answers: {}, reveal: true });
  const s = parseState(JSON.stringify({ len: "long", idx: 3, answers: { 1: "F", 2: "X", 99: "A", 4: "S" }, reveal: false }), quiz);
  assert.deepEqual(s, { len: "long", idx: 3, answers: { 1: "F", 4: "S" }, reveal: false });
  assert.equal(parseState({ len: "short", idx: 5 }, quiz).idx, 0);   // mimo rozsah
});

test("pořadí teček podle frakce k datu hlasování, pak příjmení", () => {
  const q = Q(1, { 1: "F", 2: "A", 3: "F", 4: "B" }, { 1: "EPP", 2: "SD", 3: "EPP", 4: null });
  const meps = new Map([[1, M(1, "Zeman")], [2, M(2, "Novák")], [3, M(3, "Adam")], [4, M(4, "Bílý")]]);
  assert.deepEqual(orderIds(q, meps), ["2", "3", "1", "4"]);
});

test("půlkruh: n bodů zleva doprava", () => {
  for (const n of [0, 1, 2, 5, 21]) assert.equal(hemiPoints(n).length, n);
  const p = hemiPoints(21);
  assert.ok(p[0].x < p[20].x);
});

// --- varianta Evropské frakce --------------------------------------------------------------------
import { QUIZ_GROUPS, SPLIT_SHARE, STORE_KEYS, groupAgreement, groupCompareRows, groupCounts, parseHash, toHash } from "../../public/lib/quiz.js";

const G = (pos, share = 0.9) => ({ pos, share: pos ? share : null, counts: [0, 0, 0, 0] });
const GQ = (id, groups) => ({ id, groups });
const GQS = [
  GQ(1, { EPP: G("F"), SD: G("A"), PFE: G("F", 0.6), NI: G("F") }),
  GQ(2, { EPP: G("F"), SD: G("F"), PFE: G("A") }),
  GQ(3, { EPP: G("A"), SD: G(null), PFE: G("A") }),
  GQ(4, { EPP: G("F"), SD: G("A"), PFE: G("B") }),
];

test("frakce: shoda jen z otázek, kde frakce má postoj; přeskočené se nepočítají; NI mimo", () => {
  const { enough, few } = groupAgreement(GQS, { 1: "F", 2: "F", 3: "A", 4: "S" });
  assert.deepEqual(enough.map((r) => [r.code, r.same, r.common]), [["EPP", 3, 3], ["PFE", 2, 3]]);
  assert.deepEqual(few.map((r) => [r.code, r.same, r.common]), [["SD", 1, 2]]);   // remíza ve 3. otázce se nepočítá
  assert.ok(!enough.concat(few).some((r) => r.code === "NI" || r.code === "ECR"));
  assert.equal(QUIZ_GROUPS.length, 8);
});

test("frakce: porovnání otázka po otázce a nejednotná frakce", () => {
  const rows = groupCompareRows(GQS, { 1: "F", 2: "F", 3: "B" }, "PFE");
  assert.deepEqual(rows.map((r) => [r.q.id, r.state, r.split]), [[1, "ok", true], [2, "no", false], [3, "no", false]]);
  assert.equal(groupCompareRows(GQS, { 3: "A" }, "SD")[0].state, "na");
  assert.ok(Math.abs(SPLIT_SHARE - 2 / 3) < 1e-9);
});

test("frakce: počty postojů bez názvů", () => {
  assert.deepEqual(groupCounts(GQS[0], ["EPP", "SD", "PFE", "ECR"]), { F: 2, A: 1, B: 0, none: 1, split: 1 });
});

test("krok v adrese: obě varianty, staré adresy poslanců platí", () => {
  assert.deepEqual(parseHash("#otazka-3", 12), { variant: "poslanci", phase: "q", idx: 2 });
  assert.deepEqual(parseHash("#vysledek"), { variant: "poslanci", phase: "result", idx: 0 });
  assert.deepEqual(parseHash("#frakce/otazka-12", 12), { variant: "frakce", phase: "q", idx: 11 });
  assert.deepEqual(parseHash("#frakce/vysledek"), { variant: "frakce", phase: "result", idx: 0 });
  assert.deepEqual(parseHash("#frakce"), { variant: "frakce", phase: "intro", idx: 0 });
  assert.deepEqual(parseHash("#frakce/otazka-13", 12), { variant: "frakce", phase: "intro", idx: 0 });   // mimo rozsah
  assert.equal(parseHash(""), null);
  assert.equal(parseHash("#neco"), null);
  for (const [v, ph, i] of [["poslanci", "q", 2], ["poslanci", "result", 0], ["frakce", "q", 0], ["frakce", "result", 0], ["frakce", "intro", 0]]) {
    assert.deepEqual(parseHash(toHash(v, ph, i)), { variant: v, phase: ph, idx: i });
  }
  assert.equal(toHash("poslanci", "intro", 0), "");
  assert.deepEqual(STORE_KEYS, { poslanci: "epw-kviz-poslanci", frakce: "epw-kviz-frakce" });
});
