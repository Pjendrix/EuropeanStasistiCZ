// Jednotkové testy čistých funkcí duelu (public/lib/duel.js) a escapující šablony (public/lib/html.js): node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";
import { METRICS, barWidths, metricValue, orient, pairKey, pickPair, samplePairs, sameMandate, shareMetricRows, sumOrNull } from "../../public/lib/duel.js";
import { html, trusted } from "../../public/lib/html.js";

const MEPS = [{ id: 23699 }, { id: 256851 }, { id: 270261 }];

test("html`` escapuje vložené hodnoty, vnořené šablony a pole nechá", () => {
  const name = `<b>"MOCK"</b>`;
  const e = "&lt;b&gt;&quot;MOCK&quot;&lt;/b&gt;";
  assert.equal(String(html`<a title="${name}">${name}</a>`), `<a title="${e}">${e}</a>`);
  assert.equal(String(html`<ul>${["a<", "b"].map((x) => html`<li>${x}</li>`)}</ul>`), "<ul><li>a&lt;</li><li>b</li></ul>");
  assert.equal(String(html`${null}${undefined}${false}${0}`), "0");
  assert.equal(String(html`${trusted("<i>ok</i>")}`), "<i>ok</i>");
});

test("pairKey je kanonický (menší ID první)", () => {
  assert.equal(pairKey(256851, 23699), "23699-256851");
  assert.equal(pairKey("23699", "256851"), "23699-256851");
});

test("pickPair: neplatné, neznámé a stejné ID = výběr (null)", () => {
  assert.deepEqual(pickPair("256851", "23699", MEPS), { a: 256851, b: 23699 }); // pořadí zůstane podle uživatele
  for (const [a, b] of [["23699", "23699"], ["23699", "999"], ["23699", "1 OR 1"], ["23699", undefined], ["<x>", "23699"], ["23699", "0x5c63"]]) {
    assert.equal(pickPair(a, b, MEPS), null, `${a}/${b}`);
  }
});

test("metricValue: podíly s jmenovatelem, null = zdroj neuvádí", () => {
  const m = { attendance: [8, 10], against_group: null, positions: { FOR: 3 }, votes_in_mandate: 10, reports: null, motions: 2, joint_motions: 1 };
  const by = (k) => METRICS.find((x) => x.key === k);
  assert.deepEqual(metricValue(by("attendance"), m), { n: 8, share: 0.8, total: 10 });
  assert.deepEqual(metricValue(by("against_group"), m), { n: null, share: null, total: null });
  assert.deepEqual(metricValue(by("pos_FOR"), m), { n: 3, share: 0.3, total: 10 });
  assert.deepEqual(metricValue(by("reports"), m), { n: null, share: null, total: null });
  assert.equal(metricValue(by("motions"), m).n, 3);
  assert.equal(sumOrNull(1, null), null);
});

test("barWidths: stejná škála pro obě strany, podíly v procentech", () => {
  assert.deepEqual(barWidths(50, 100, false), [50, 100]);
  assert.deepEqual(barWidths(0, 0, false), [0, 0]);
  assert.deepEqual(barWidths(null, 4, false), [0, 100]);
  assert.deepEqual(barWidths(0.912, 0.5, true), [91.2, 50]);
});

test("orient: řádek rozchodu v pořadí, které zvolil uživatel", () => {
  const row = [1, "FOR", "AGAINST", "EPP", "PFE"];
  assert.deepEqual(orient(row, 23699, 256851), { id: 1, a: "FOR", b: "AGAINST", ga: "EPP", gb: "PFE" });
  assert.deepEqual(orient(row, 256851, 23699), { id: 1, a: "AGAINST", b: "FOR", ga: "PFE", gb: "EPP" });
});

test("samplePairs: pravidlem nejvyšší a nejnižší shoda mezi současnými s dost společnými hlasováními", () => {
  const duel = {
    meps: [{ id: 1, on: true }, { id: 2, on: true }, { id: 3, on: true }, { id: 4, on: false }],
    pairs: {
      "1-2": { agreement: [900, 1000] }, "1-3": { agreement: [300, 1000] }, "2-3": { agreement: [600, 1000] },
      "1-4": { agreement: [10, 1000] }, // bývalý poslanec
    },
  };
  const s = samplePairs(duel, (m) => m.on, 1);
  assert.deepEqual(s.high.map((x) => x.key), ["1-2"]);
  assert.deepEqual(s.low.map((x) => x.key), ["1-3"]);
});

test("sameMandate porovná začátek i konec mandátu", () => {
  const m = (start, end) => ({ mandates: [{ start, end }] });
  assert.equal(sameMandate(m("2024-07-16", null), m("2024-07-16", null)), true);
  assert.equal(sameMandate(m("2024-07-16", null), m("2025-07-31", null)), false);
});

test("shareMetricRows: 7 čísel karty, stejná škála, null = „–“, bez vítěze", () => {
  const a = { metrics: { attendance: [90, 100], presence: null, group_loyalty: [5, 10], reports: 2, shadow_reports: 0, speeches: 10, amendments: null } };
  const b = { metrics: { attendance: [80, 100], presence: [9, 10], group_loyalty: [8, 10], reports: 4, shadow_reports: 0, speeches: 5, amendments: 3 } };
  const rows = shareMetricRows(a, b);
  assert.deepEqual(rows.map((r) => r.key), ["attendance", "presence", "group_loyalty", "reports", "shadow_reports", "speeches", "amendments"]);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.presence.a.text, "–");
  assert.equal(by.amendments.a.w, 0);
  assert.equal(by.reports.a.w, 0.5);
  assert.equal(by.reports.b.w, 1);
  assert.equal(by.attendance.a.w, 0.9);
  assert.equal(by.shadow_reports.a.w, 0);
  assert.ok(rows.every((r) => !("winner" in r)));
});
