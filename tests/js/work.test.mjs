// Jednotkové testy tabulky práce poslanců (public/lib/work.js): node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";
import { COLUMNS, axisPos, axisRange, barPct, groupRows, maxOf, metric, nextSort, parseView, sortRows, vsMedian } from "../../public/lib/work.js";

const M = (id, o = {}) => ({ id, sort_label: `MOCK_${id}`, lead_reports: 0, attendance: [90, 100], presence: { present: 9, days: 10 }, ...o });

test("parseView: ?pohled= s výchozí hodnotou texty", () => {
  assert.equal(parseView(""), "texty");
  assert.equal(parseView("?pohled=ucast"), "ucast");
  assert.equal(parseView("?pohled=aktivita"), "aktivita");
  assert.equal(parseView("?pohled=%3Cx%3E"), "texty");
});

test("nextSort: první klik sestupně, u jména vzestupně, druhý klik obrátí", () => {
  assert.deepEqual(nextSort({ key: "name", dir: 1 }, "lead_reports"), { key: "lead_reports", dir: -1 });
  assert.deepEqual(nextSort({ key: "lead_reports", dir: -1 }, "lead_reports"), { key: "lead_reports", dir: 1 });
  assert.deepEqual(nextSort({ key: "lead_reports", dir: -1 }, "name"), { key: "name", dir: 1 });
});

test("sortRows: null na konec, shoda podle jména", () => {
  const rows = [M(1, { speeches: 3 }), M(2, { speeches: null }), M(3, { speeches: 5 }), M(4, { speeches: 3 })];
  assert.deepEqual(sortRows(rows, "speeches", -1).map((r) => r.id), [3, 1, 4, 2]);
  assert.deepEqual(sortRows(rows, "speeches", 1).map((r) => r.id), [1, 4, 3, 2]);
});

test("groupRows: pořadí frakcí podle GROUP_ORDER, uvnitř pořadí řazení", () => {
  const rows = [M(1, { g: "EPP" }), M(2, { g: "SD" }), M(3, { g: "EPP" })];
  const out = groupRows(rows, ["SD", "EPP", "NI"], (m) => m.g);
  assert.deepEqual(out.map((b) => [b.code, b.rows.map((r) => r.id)]), [["SD", [2]], ["EPP", [1, 3]]]);
});

test("barPct a maxOf: hodnota / maximum v delegaci, nula prázdná", () => {
  const rows = [M(1, { lead_reports: 11 }), M(2, { lead_reports: 0 }), M(3, { lead_reports: 3 })];
  assert.equal(maxOf(rows, "lead_reports"), 11);
  assert.equal(barPct(11, 11), 100);
  assert.equal(barPct(0, 11), 0);
  assert.equal(barPct(null, 11), 0);
  assert.equal(barPct(5, 0), 0);
});

test("axisRange: minimum zaokrouhlené dolů na 2 b., maximum 100 %", () => {
  const rows = [M(1, { attendance: [7950, 10000] }), M(2, { presence: { present: 97, days: 100 } })];
  assert.deepEqual(axisRange(rows), [0.78, 1]);
  assert.equal(axisPos(0.89, [0.78, 1]), 50);
  assert.deepEqual(axisRange([]), [0, 1]);
});

test("vsMedian: procentní body s desetinnou čárkou", () => {
  assert.equal(vsMedian(0.977, 0.8997), "+7,7 b. proti mediánu EP");
  assert.equal(vsMedian(0.85, 0.8997), "−5,0 b. proti mediánu EP");
  assert.equal(vsMedian(null, 0.9), "");
});

test("metric a sloupce pohledů", () => {
  assert.equal(metric(M(1), "presence"), 0.9);
  assert.equal(metric(M(1, { presence: null }), "presence"), null);
  assert.deepEqual(COLUMNS.texty.map((c) => c.key), ["lead_reports", "lead_opinions", "shadow_reports", "shadow_opinions"]);
});
