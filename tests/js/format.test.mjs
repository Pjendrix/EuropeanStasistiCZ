// Jednotkové testy čistých funkcí webu (public/lib/format.js), bez prohlížeče: node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  esc, fmtDate, fmtMonth, fmtPct, highlight, isStale, matchesAll, mepsCount, norm, pagePath, pct, procedureUrl, resultSentence,
  resultText, searchTerms, sessionCountdown, siteUrl, rollSession, fmtRange,
} from "../../public/lib/format.js";

test("esc escapuje HTML a null je prázdný text", () => {
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(0), "0");
});

test("pct a fmtPct: bez jmenovatele null a pomlčka", () => {
  assert.equal(pct([1, 2]), 0.5);
  assert.equal(pct([0, 0]), null);
  assert.equal(pct(null), null);
  assert.equal(fmtPct(0.5), "50,0 %");
  assert.equal(fmtPct(null), "–");
});

test("datum a měsíc česky", () => {
  assert.equal(fmtDate("2025-07-09"), "9.\u00a07.\u00a02025");
  assert.equal(fmtDate("2025-07-09T10:00:00Z"), "9.\u00a07.\u00a02025");
  assert.equal(fmtDate(null), "");
  // pevné mezery: datum se na konci řádku nerozdělí (O11)
  assert.ok(!/ /.test(fmtDate("2024-07-16")));
  assert.equal(fmtMonth("2024-12"), "prosinec 2024");
});

test("mepsCount skloňuje", () => {
  assert.equal(mepsCount(1), "1 poslanec");
  assert.equal(mepsCount(3), "3 poslanci");
  assert.equal(mepsCount(5), "5 poslanců");
});

test("hledání bez diakritiky a zkrácených koncovek", () => {
  assert.equal(norm("Ukrajina ŽÁDOST"), "ukrajina zadost");
  const terms = searchTerms("Ukrajina migrace");
  assert.deepEqual(terms, ["ukraji", "migrac"]);
  assert.ok(matchesAll(norm("Podpora Ukrajinu a migraci"), terms));
  assert.ok(!matchesAll(norm("Podpora Ukrajinu"), terms));
});

test("highlight zvýrazní shodu i s diakritikou a escapuje", () => {
  assert.equal(highlight("Česká <b>", ["ceska"]), "<mark>Česká</mark> &lt;b&gt;");
  assert.equal(highlight("x", []), "x");
});

test("procedureUrl jen pro platné číslo procedury", () => {
  assert.equal(procedureUrl("2023/0447(COD)"), "z/2023-0447-COD");
  assert.equal(procedureUrl("2023/0447(COD)", "../"), "../z/2023-0447-COD");
  assert.equal(procedureUrl("<script>"), null);
  assert.equal(procedureUrl(null), null);
});

test("siteUrl na veřejné doméně, adresa stránky bez .html (cleanUrls)", () => {
  assert.equal(siteUrl("/v/1.html"), "https://epwatch.cz/v/1");
  assert.equal(siteUrl("rozkol.html?v=last_session"), "https://epwatch.cz/rozkol?v=last_session");
  assert.equal(siteUrl("index.html"), "https://epwatch.cz/");
  assert.equal(siteUrl("data/home.json"), "https://epwatch.cz/data/home.json");
  assert.equal(pagePath("o-projektu.html#kontakt"), "o-projektu#kontakt");
});

test("výsledek u návrhu na zamítnutí a námitky", () => {
  assert.equal(resultText({ result: "ADOPTED" }), "přijato");
  assert.equal(resultText({ result: "ADOPTED", vote_kind: "rejection" }), "přijato = text zamítnut");
  assert.equal(resultText({ result: "REJECTED", vote_kind: "objection" }), "zamítnuto = námitka neprošla");
  assert.equal(resultSentence("amendment", "ADOPTED"), "Pozměňovací návrh byl přijat");
  assert.equal(resultSentence("final", null), "Výsledek neuveden");
});

test("odpočet do zasedání", () => {
  assert.equal(sessionCountdown("2026-10-20", "2026-10-23", "2026-10-19"), "zítra");
  assert.equal(sessionCountdown("2026-10-20", "2026-10-23", "2026-10-17"), "za 3 dny");
  assert.equal(sessionCountdown("2026-10-20", "2026-10-23", "2026-10-10"), "za 10 dní");
  assert.equal(sessionCountdown("2026-10-20", "2026-10-23", "2026-10-21"), "právě probíhá");
  assert.match(sessionCountdown("2026-10-20", "2026-10-23", "2026-10-24"), /skončilo/);
});

test("isStale: starý export a mezitím zasedání", () => {
  const fresh = { release: "2026-10-01", stale_days: 14, sittings_after: ["2026-10-07"] };
  assert.equal(isStale(fresh, "2026-10-10"), false);
  assert.equal(isStale(fresh, "2026-10-20"), true);
  assert.equal(isStale({ ...fresh, sittings_after: [] }, "2026-10-20"), false);
  assert.equal(isStale(null, "2026-10-20"), false);
});

test("rollSession: před, během, po zasedání a den po posledním dni (úkol 3)", () => {
  const r = (today) => rollSession("2026-10-19", "2026-10-22", "2026-11-11", "2026-11-12", today);
  assert.deepEqual(r("2026-10-16"), { state: "upcoming", from: "2026-10-19", to: "2026-10-22", switched: false });
  assert.equal(r("2026-10-21").state, "current");
  assert.equal(r("2026-10-22").state, "current");
  assert.deepEqual(r("2026-10-23"), { state: "upcoming", from: "2026-11-11", to: "2026-11-12", switched: true });
  assert.deepEqual(r("2026-10-24"), { state: "upcoming", from: "2026-11-11", to: "2026-11-12", switched: true });
  assert.equal(r("2026-11-11").state, "current");
  assert.equal(r("2026-11-13").state, "gone");
  assert.equal(rollSession("2026-10-19", "2026-10-22", undefined, undefined, "2026-10-23").state, "gone");
});

test("fmtRange jako _range v hub.py", () => {
  assert.equal(fmtRange("2026-11-11", "2026-11-12"), "11.–12.\u00a011.\u00a02026");
  assert.equal(fmtRange("2026-09-30", "2026-10-02"), "30.\u00a09. – 2.\u00a010.\u00a02026");
  assert.equal(fmtRange("2026-11-11", "2026-11-11"), "11.\u00a011.\u00a02026");
});
