// Načítání dat (data/*.json): cache, timeout, měkké chyby.
import { fmtDate, norm, siteUrl, todayCZ } from "./format.js";

// Statické stránky v podadresářích (p/, s/, v/) mají <html data-root="../">.
export const ROOT = document.documentElement.dataset.root || "";

export const DATA = ROOT + "data/";

export const cache = new Map();

// Data webu s cache. Zamítnutý slib se z cache smaže (přechodná chyba sítě nevyžaduje reload), dlouhé čekání skončí chybou.
export async function getJSON(path, { timeout = 20000 } = {}) {
  if (!cache.has(path)) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    const p = fetch(DATA + path, { signal: ctl.signal })
      .then((r) => {
        // status na chybě: volající pozná „soubor neexistuje“ (404, špatné id v adrese) od výpadku sítě
        if (!r.ok) throw Object.assign(new Error(`Nepodařilo se načíst ${path} (HTTP ${r.status})`), { status: r.status });
        return r.json();
      })
      .catch((e) => { throw e.name === "AbortError" ? new Error(`Načítání ${path} trvá příliš dlouho, zkuste to znovu.`) : e; })
      .finally(() => clearTimeout(timer));
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}

// Volitelná data: při chybě náhradní hodnota, ale chyba se zapíše do konzole (rozbitý soubor se v produkci pozná).
export function soft(fallback) {
  return (e) => { console.warn(e); return fallback; };
}

// Odlehčený seznam všech hlasování (data/votes/search.json) jako pole objektů.
// file = votes/search-final.json pro jen závěrečná hlasování (stejný formát, O7).
export async function loadSearch(file = "votes/search.json") {
  const doc = await getJSON(file);
  return doc.rows.map((r) => Object.fromEntries(doc.fields.map((f, i) => [f, r[i]])));
}

// Text témat hlasování pro hledání (audit UX P1): české názvy kategorií webu a podtémat Legislativní observatoře EP
// a ručně ověřená synonyma k nim (data/manual/search_synonyms.json). Vrací funkci hlasování -> normalizovaný text.
export async function loadTopicText(file = "votes/search.json") {
  const [doc, cats, syn] = await Promise.all([getJSON(file), getJSON("categories.json").catch(soft({})),
    getJSON("manual/search_synonyms.json").catch(soft({}))]);
  const topicLabels = doc.topic_labels || {};
  const words = (label, extra) => [label || "", ...(extra || [])].join(" ");
  return (v) => norm([...(v.topics || []).map((c) => words(topicLabels[c], syn.topics?.[c])),
    ...(v.cats || []).map((c) => words(cats[c]?.label, syn.cats?.[c]))].join(" "));
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

// Kategorie hlasování (data/categories.json, tabulka v scripts/categories.py). Hlavní kategorie + „+n“; bez kategorie nic.
export let CATEGORY_META = {};

export async function loadCategories() {
  try { CATEGORY_META = await getJSON("categories.json"); } catch { CATEGORY_META = {}; }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}

export async function citeText(text) {
  let release = "";
  try { release = (await getJSON("overview.json")).sources?.votes?.release || ""; } catch (e) { /* bez verze */ }
  const today = fmtDate(todayCZ());
  return `${text}${release ? ` Data: export HowTheyVote ${release}.` : ""} EP Watch CZ, ${siteUrl(location.pathname + location.search)} (citováno ${today}).`;
}
