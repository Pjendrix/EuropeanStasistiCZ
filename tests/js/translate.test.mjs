// Strojový překlad (public/translate.js): jazyk prohlížeče, adresa pro Google Translate, původní adresa z proxy.
import assert from "node:assert/strict";
import { test } from "node:test";
import { originalUrl, pickLanguage, translateUrl } from "../../public/translate.js";

const L = ["en", "de", "pl", "uk"];
const loc = (pathname, search = "", hash = "") => ({ pathname, search, hash });

test("jazyk: první jazyk prohlížeče ze seznamu, jinak první ze seznamu", () => {
  assert.equal(pickLanguage(["de-AT", "en"], L), "de");
  assert.equal(pickLanguage(["cs", "fr-FR", "uk"], L), "uk");
  assert.equal(pickLanguage(["fr"], L), "en");
  assert.equal(pickLanguage([], L), "en");
});

test("odkaz na Google Translate: kanonická doména, cesta, parametry i kotva", () => {
  const u = new URL(translateUrl(loc("/kviz", "?x=1", "#frakce/otazka-2"), "de"));
  assert.equal(u.origin + u.pathname, "https://translate.google.com/translate");
  assert.equal(u.searchParams.get("sl"), "cs");
  assert.equal(u.searchParams.get("tl"), "de");
  assert.equal(u.searchParams.get("u"), "https://epwatch.cz/kviz?x=1#frakce/otazka-2");
});

test("původní adresa z proxy: bez parametrů _x_tr_*", () => {
  assert.equal(originalUrl(loc("/p/256846", "?_x_tr_sl=cs&_x_tr_tl=en&_x_tr_hl=en")), "https://epwatch.cz/p/256846");
  assert.equal(originalUrl(loc("/votes", "?c=env&_x_tr_tl=de", "#a")), "https://epwatch.cz/votes?c=env#a");
});
