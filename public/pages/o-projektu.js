// Skript stránky o-projektu.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
// Bez JavaScriptu je vše čitelné: definice a pravidla jsou zavřené <details>, časová osa celá; vyhledávání a filtr jsou skryté (hidden).
import { getJSON } from "../lib/data.js";
import { fmtDate } from "../lib/format.js";
import { setNav, showError } from "../lib/ui.js";
setNav("about");
(async () => {
  const el = document.getElementById("release");
  try {
    const stats = await getJSON("overview.json");
    // Definice metrik jsou v HTML statické (scripts/build_pages.py: sync_definitions); tady jen aktuální data.
    const rel = stats.sources.votes?.release;
    document.getElementById("release").textContent =
      `Aktuální data: export HowTheyVote ${rel || ""}, hlasování ${fmtDate(stats.period.from)} – ${fmtDate(stats.period.to)}.`;
  } catch (e) {
    showError(el, e);
  }
})();

// Odkaz „Našli jste chybu?“ z profilu, hlasování nebo strany (?stranka=…#kontakt) předvyplní adresu stránky ve formuláři.
{
  const from = new URLSearchParams(location.search).get("stranka");
  const field = document.querySelector('.contact-form input[name="stranka"]');
  if (from && field && /^https:\/\/epwatch\.cz\//.test(from)) field.value = from;
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// --- vyhledávání pojmů ------------------------------------------------------------
const find = document.querySelector(".ab-find");
const q = document.getElementById("ab-q");
const defs = [...document.querySelectorAll("#definitions details")];
const texts = new Map(defs.map((d) => [d, fold(d.textContent)]));
const pojmy = (n) => (n === 1 ? "pojem" : n >= 2 && n <= 4 ? "pojmy" : "pojmů");
function search() {
  const v = fold(q.value.trim());
  let n = 0;
  for (const d of defs) {
    const hit = !v || texts.get(d).includes(v);
    d.hidden = !hit;
    d.classList.toggle("is-hit", !!v && hit);
    n += hit;
  }
  document.querySelectorAll("#definitions .ab-group").forEach((g) => { g.hidden = !g.querySelector("details:not([hidden])"); });
  document.getElementById("ab-none").hidden = n > 0;
  document.getElementById("ab-q-status").textContent = v ? `Nalezeno ${n} ${pojmy(n)}.` : "";
}
if (find && q) {
  find.hidden = false;
  q.addEventListener("input", search);
}

// --- časová osa oprav a změn ------------------------------------------------------
const LIMIT = 5;
const tl = document.getElementById("corrections");
const filterBox = document.querySelector(".ab-tl-filter");
const older = document.getElementById("ab-older");
let filter = "all";
let expanded = false;
const entries = tl ? [...tl.querySelectorAll("li:not(.ab-tl-empty)")] : [];
const empty = tl?.querySelector(".ab-tl-empty");
// nejnovější nahoře; opravy se generují (build_pages.py), změny jsou ručně v HTML, proto řazení až tady
entries.sort((a, b) => (b.querySelector("time")?.getAttribute("datetime") || "").localeCompare(a.querySelector("time")?.getAttribute("datetime") || ""));
entries.forEach((li) => tl.append(li));

// Text zkrácený na 2 řádky; tlačítko „celý text“ jen tam, kde se opravdu zkrátil.
function clamp(li) {
  const p = li.querySelector(".ab-tl-text");
  if (!p || li.dataset.measured || li.hidden) return;
  li.dataset.measured = "1";
  p.classList.add("is-clamped");
  if (p.scrollHeight <= p.clientHeight + 1) { p.classList.remove("is-clamped"); return; }
  p.id ||= `ab-tl-${entries.indexOf(li)}`;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ab-more";
  b.textContent = "celý text";
  b.setAttribute("aria-expanded", "false");
  b.setAttribute("aria-controls", p.id);
  b.addEventListener("click", () => {
    const open = b.getAttribute("aria-expanded") !== "true";
    p.classList.toggle("is-clamped", !open);
    b.setAttribute("aria-expanded", String(open));
    b.textContent = open ? "méně" : "celý text";
  });
  li.append(b);
}

function applyFilter() {
  const match = entries.filter((li) => filter === "all" || li.dataset.kind === filter);
  entries.forEach((li) => { li.hidden = true; });
  match.forEach((li, i) => { li.hidden = !expanded && i >= LIMIT; });
  if (empty) empty.hidden = !(filter === "fix" && !match.length);
  if (older) older.hidden = expanded || match.length <= LIMIT;
  match.forEach(clamp);
  filterBox?.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
}
function setFilter(f) { filter = f; applyFilter(); }

if (tl) {
  const nFix = entries.filter((li) => li.dataset.kind === "fix").length;
  filterBox?.querySelectorAll('[data-count="fix"]').forEach((s) => { s.textContent = String(nFix); });
  if (filterBox) filterBox.hidden = false;
  filterBox?.addEventListener("click", (e) => { const b = e.target.closest("button[data-f]"); if (b) setFilter(b.dataset.f); });
  older?.addEventListener("click", () => {
    const first = entries.find((li) => li.hidden && (filter === "all" || li.dataset.kind === filter));
    expanded = true;
    applyFilter();
    if (first) { first.tabIndex = -1; first.focus(); }
  });
  applyFilter();
  // po změně šířky se zkrácení přeměří (text, který se dřív vešel, se může zalomit víc)
  let t;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      entries.forEach((li) => {
        const b = li.querySelector(".ab-more");
        if (b?.getAttribute("aria-expanded") === "true") return;
        b?.remove();
        li.querySelector(".ab-tl-text")?.classList.remove("is-clamped");
        delete li.dataset.measured;
        clamp(li);
      });
    }, 200);
  });
}

// --- kotvy: otevřít <details> a posunout do středu (při načtení i hashchange) ------------
const ALIAS_FIX = new Set(["opravy", "corrections"]);  // Highlight „Opravy“ na Instagramu: rovnou filtr Opravy
function openHash({ initial = false } = {}) {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  if (ALIAS_FIX.has(id) && tl) setFilter("fix");
  if (el.closest("#definitions") && el.hidden && q) { q.value = ""; search(); }  // pojem skrytý hledáním
  let open = false;
  for (let d = el.closest("details"); d; d = d.parentElement?.closest("details")) {
    if (!d.open) { d.open = true; open = true; }
  }
  const target = el.tagName === "DETAILS" ? el : el.closest("details");
  if (target || open) {
    requestAnimationFrame(() => (target || el).scrollIntoView({ block: "center", behavior: initial || reduced() ? "auto" : "smooth" }));
  }
}
window.addEventListener("hashchange", () => openHash());
// klik na odkaz se stejnou kotvou, jaká už je v adrese (hashchange se nespustí), např. znovu „odkaz na definici“
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (a && a.getAttribute("href") === location.hash) setTimeout(() => openHash(), 0);
});
openHash({ initial: true });

// --- obsah stránky: zvýraznění aktuální sekce, mobilní seznam se po výběru zavře -------------
const tocLinks = [...document.querySelectorAll(".ab-toc a, .ab-toc-m a")];
const mobileToc = document.querySelector(".ab-toc-m details");
mobileToc?.addEventListener("click", (e) => { if (e.target.closest("a")) mobileToc.open = false; });
function mark(id) {
  tocLinks.forEach((a) => {
    if (a.getAttribute("href") === `#${id}`) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
}
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) mark(e.target.id); }), { rootMargin: "-30% 0px -60% 0px" });
  document.querySelectorAll(".ab-sec").forEach((s) => io.observe(s));
}
