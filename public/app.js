// Sdílené funkce pro všechny stránky EP Watch CZ. Bez build stepu, čisté JS.
"use strict";

const DATA = "data/";
const HTV_SOURCE = "https://howtheyvote.eu";
const EP_SOURCE = "https://data.europarl.europa.eu";

const POSITION_LABEL = {
  FOR: "pro",
  AGAINST: "proti",
  ABSTENTION: "zdržel/a se",
  DID_NOT_VOTE: "nehlasoval/a",
};
// Tvar podle pohlaví z EP (gender MALE / FEMALE); když chybí, obecný tvar „hlasoval/a“.
function byGender(mep, male, female) {
  if (mep?.gender === "FEMALE") return female;
  if (mep?.gender === "MALE") return male;
  return female.startsWith(male) ? `${male}/${female.slice(male.length)}` : `${male} / ${female}`;
}

// Volba konkrétního poslance v jeho rodě.
function positionFor(position, mep) {
  if (position === "ABSTENTION") return byGender(mep, "zdržel se", "zdržela se");
  if (position === "DID_NOT_VOTE") return byGender(mep, "nehlasoval", "nehlasovala");
  return POSITION_LABEL[position];
}

const RESULT_LABEL = { ADOPTED: "přijato", REJECTED: "zamítnuto", LAPSED: "propadlo", WITHDRAWN: "staženo" };
const RESULT_NOTE = {
  LAPSED: "Návrh propadl: bylo přijato jiné znění, které ho vylučuje, takže se o něm už nehlasovalo jako o samostatném.",
  WITHDRAWN: "Návrh byl stažen.",
  null: "Zdroj (HowTheyVote.eu) u tohoto hlasování výsledek neuvádí. Výsledek ověř v originálu (odkaz „Originál na HowTheyVote.eu“).",
};
const NO_PARTY_NOTE = "Evropský parlament u tohoto poslance pro 10. období českou stranu neuvádí.";
const ROLE_LABEL = {
  MEMBER: "člen/ka",
  MEMBER_SUBSTITUTE: "náhradník/ice",
  CHAIR: "předseda/kyně",
  CHAIR_VICE: "místopředseda/kyně",
  MEMBER_BUREAU: "člen/ka předsednictva",
};
const COMMITTEE_TYPE = { STANDING: "stálý výbor", SUB: "podvýbor", TEMPORARY: "dočasný výbor", SPECIAL: "zvláštní výbor", INQUIRY: "vyšetřovací výbor" };

// Česká zkratka tam, kde zdroj dává anglický popis místo zkratky.
const CZ_GROUP_LABEL = { NI: "nezařazení" };

// Neutrální paleta pro štítky, dokud nejsou ručně doplněné barvy v data/manual/colors.json.
const PALETTE = ["#3B82F6", "#E11D48", "#14B8A6", "#A855F7", "#F59E0B", "#6366F1", "#0EA5E9", "#EC4899", "#84CC16", "#64748B", "#F97316"];

// Barvy frakcí (kód HowTheyVote). Ručně nastavená barva v data/manual/colors.json má přednost.
const GROUP_COLORS = {
  EPP: "#3B82F6", SD: "#E11D48", RENEW: "#F59E0B", GREEN_EFA: "#14B8A6", ECR: "#6366F1",
  PFE: "#A855F7", ESN: "#0EA5E9", GUE_NGL: "#BE123C", NI: "#94A3B8",
};
function groupColor(g, fallbackKey) {
  if (g && g.color) return g.color;
  if (g && GROUP_COLORS[g.code]) return GROUP_COLORS[g.code];
  return colorFor(fallbackKey || (g && g.code) || "");
}

const cache = new Map();
async function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(DATA + path).then((r) => {
      if (!r.ok) throw new Error(`Nepodařilo se načíst ${path} (HTTP ${r.status})`);
      return r.json();
    }));
  }
  return cache.get(path);
}

// Odlehčený seznam všech hlasování (data/votes/search.json) jako pole objektů.
async function loadSearch() {
  const doc = await getJSON("votes/search.json");
  return doc.rows.map((r) => Object.fromEntries(doc.fields.map((f, i) => [f, r[i]])));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function param(name) {
  return new URLSearchParams(location.search).get(name);
}

function pct(pair) {
  if (!pair || !pair[1]) return null;
  return pair[0] / pair[1];
}

// Velké procento s počítadlem (animuje se při vjetí do obrazu).
function countPct(value) {
  if (value === null || value === undefined) return "–";
  return `<span data-count="${(value * 100).toFixed(1)}" data-decimals="1" data-suffix=" %">${fmtPct(value)}</span>`;
}

function fmtPct(value) {
  return value === null ? "–" : (value * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " %";
}

function fmtNum(n) {
  return Number(n).toLocaleString("cs-CZ");
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

function fmtMonth(ym) {
  const months = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
  const [y, m] = ym.split("-");
  return `${months[Number(m) - 1]} ${y}`;
}

function pctCell(pair, title) {
  const v = pct(pair);
  const detail = pair && pair[1] ? `${fmtNum(pair[0])} z ${fmtNum(pair[1])}` : "nepočítá se";
  return `<span class="pct" title="${esc(title || "")}">${fmtPct(v)}<small>${detail}</small></span>`;
}

function displayName(mep) {
  // EP píše příjmení verzálkami, na webu je zobrazíme normálně.
  if (mep.given_name && mep.family_name) return `${mep.given_name} ${mep.family_name}`;
  return mep.name;
}

function currentOf(list, date) {
  if (!list || !list.length) return null;
  const at = date || new Date().toISOString().slice(0, 10);
  return list.find((x) => x.start <= at && (!x.end || at <= x.end)) || list[list.length - 1];
}

function isActive(mep) {
  const today = new Date().toISOString().slice(0, 10);
  return mep.mandates.some((m) => m.start <= today && (!m.end || today <= m.end));
}

function mandateText(mep) {
  return mep.mandates.map((m) => `${fmtDate(m.start)} – ${m.end ? fmtDate(m.end) : "dosud"}`).join(", ");
}

// Stabilní barva z kódu (FNV-1a hash): nezávisí na pořadí v seznamu ani na tom, co přibude.
function colorFor(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

// Štítek frakce. code = kód HowTheyVote (EPP, PFE…) nebo EP kód (PPE…), groups = groups.json.
function groupBadge(code, groups, epCode) {
  if (!code && !epCode) return '<span class="badge outline">bez frakce</span>';
  const g = groups.find((x) => x.code === code) || groups.find((x) => epCode && x.ep_code === epCode);
  const label = g ? (CZ_GROUP_LABEL[g.code] || g.short_label) : (code || epCode);
  const title = g ? (g.name_cs || g.label) : label;
  const logo = g && g.logo ? `<img src="${esc(g.logo)}" alt="">` : "";
  return `<span class="badge" style="--badge-dot:${groupColor(g, label)}" title="${esc(title)}">${logo}${esc(label)}</span>`;
}

function partyBadge(id, label, parties) {
  if (!id) return '<span class="badge outline">bez strany</span>';
  const p = parties.find((x) => String(x.id) === String(id));
  const text = p ? p.short_label : label;
  const dot = p && p.color ? p.color : colorFor(id);
  const logo = p && p.logo ? `<img src="${esc(p.logo)}" alt="">` : "";
  return `<span class="badge" style="--badge-dot:${dot}" title="${esc(p ? p.name : text)}">${logo}${esc(text)}</span>`;
}

// Štítek strany s odkazem na stránku strany (nezávislí stránku nemají).
function partyLink(id, label, parties) {
  const p = parties.find((x) => String(x.id) === String(id));
  const badge = partyBadge(id, label, parties);
  return p && !p.independent ? `<a href="party.html?id=${p.id}" class="badge-link">${badge}</a>` : badge;
}

function photoUrl(mep) {
  return mep.photo_url ? `assets/photos/${mep.id}.jpg` : "";
}

function splitBar(counts) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];
  const title = keys.map((k, i) => `${POSITION_LABEL[k]}: ${counts[i]}`).join(", ");
  return `<div class="split" title="${esc(title)}" role="img" aria-label="${esc(title)}">${keys
    .map((k, i) => `<span class="s-${k}" style="width:${(counts[i] / total) * 100}%"></span>`).join("")}</div>`;
}

function voteTitle(v) {
  let t = v.title || v.procedure?.title || v.reference || `Hlasování ${v.id}`;
  return t;
}

function voteSubtitle(v) {
  const parts = [];
  if (v.reference) parts.push(v.reference);
  if (v.amendment_number) parts.push(`PN ${v.amendment_number}`);
  if (v.description) parts.push(v.description);
  return parts.join(" · ");
}

function setNav(page) {
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
  });
}

function showError(el, err) {
  el.innerHTML = `<p class="error">${esc(err.message || err)}</p>`;
  console.error(err);
}

// Řazení tabulky kliknutím na záhlaví. rows = pole objektů, columns = {key: getter}, render(rows).
function sortable(table, columns, rows, render, initial) {
  let state = initial || { key: null, dir: 1 };
  const apply = () => {
    const sorted = rows().slice();
    if (state.key) {
      const get = columns[state.key];
      sorted.sort((a, b) => {
        const x = get(a), y = get(b);
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (typeof x === "string" ? x.localeCompare(y, "cs") : x - y) * state.dir;
      });
    }
    table.querySelectorAll("th[data-key]").forEach((th) => {
      th.setAttribute("aria-sort", th.dataset.key === state.key ? (state.dir > 0 ? "ascending" : "descending") : "none");
    });
    render(sorted);
  };
  table.querySelectorAll("th[data-key] button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.parentElement.dataset.key;
      state = { key, dir: state.key === key ? -state.dir : (btn.parentElement.classList.contains("num") ? -1 : 1) };
      apply();
    });
  });
  apply();
  return { refresh: apply, set: (key, dir) => { state = { key, dir }; apply(); } };
}

function sourceLine(stats) {
  const rel = stats?.sources?.votes?.release;
  return `Zdroj: <a href="${HTV_SOURCE}">HowTheyVote.eu</a> (export ${esc(rel || "")}, licence ODbL) a
    <a href="${EP_SOURCE}">EP Open Data</a> (CC BY 4.0). Čísla počítá skript
    <a href="https://github.com/Pjendrix/EuropeanStasistiCZ/blob/main/scripts/compute_stats.py">compute_stats.py</a>,
    <a href="o-projektu.html#metodika">metodika</a>.`;
}

// --- sdílené části pro seznamy hlasování -------------------------------------

// Řádek tabulky hlasování: datum, název s odkazem, výsledek, rozložení Čechů. extra = další buňky.
function voteRow(v, extra = "") {
  return `<tr>
    <td class="num">${fmtDate(v.date)}</td>
    <td><a class="vote-title" href="vote.html?id=${v.id}&m=${v.month}">${esc(voteTitle(v))}</a>
      <div class="small muted">${v.is_main ? '<span class="tag">hlavní</span>' : ""}${esc(voteSubtitle(v))}</div></td>
    ${extra}
    <td class="result-${v.result || ""}" title="${esc(RESULT_NOTE[v.result ?? null] || "")}">${RESULT_LABEL[v.result] || "neuveden"}</td>
  </tr>`;
}

function czCell(cz) {
  return `<td>${splitBar(cz)}<div class="small muted">${cz.join(" / ")}</div></td>`;
}

// Jména poslanců seskupená podle volby; positions = {id: volba} nebo [{member_id, position}].
function namesByPosition(positions, mepsById, keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"]) {
  const list = Array.isArray(positions) ? positions : Object.entries(positions).map(([id, position]) => ({ member_id: Number(id), position }));
  return keys.map((k) => {
    const names = list.filter((p) => p.position === k)
      .map((p) => mepsById[p.member_id])
      .filter(Boolean)
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "cs"))
      .map((m) => `<a href="mep.html?id=${m.id}">${esc(displayName(m))}</a>`);
    return names.length ? `<div class="small"><span class="pos pos-${k}">${POSITION_LABEL[k]} (${names.length}):</span> ${names.join(", ")}</div>` : "";
  }).join("");
}


// --- přepínač režimu a pohyb ---------------------------------------------------

const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const root = document.documentElement;
  const isDark = () => root.dataset.theme === "dark" ||
    (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const sync = () => btn.setAttribute("aria-pressed", String(isDark()));
  sync();
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* bez úložiště jen pro tuto stránku */ }
    sync();
  });
}

// Počítadlo od nuly k cíli: <span data-count="91.4" data-decimals="1" data-suffix=" %">.
function runCounter(el) {
  if (el.dataset.counted) return;
  el.dataset.counted = "1";
  const target = Number(el.dataset.count);
  const decimals = Number(el.dataset.decimals || 0);
  const suffix = el.dataset.suffix || "";
  const fmt = (v) => v.toLocaleString("cs-CZ", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  if (REDUCED_MOTION || !isFinite(target)) { el.textContent = isFinite(target) ? fmt(target) : el.textContent; return; }
  const start = performance.now(), dur = 1300;
  const tick = (now) => {
    const x = Math.min(1, (now - start) / dur);
    el.textContent = fmt(target * (1 - Math.pow(1 - x, 3)));
    if (x < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Kruhové grafy: <circle class="val" data-dash="194.8" data-value="0.91">.
function runDonut(el) {
  const len = Number(el.dataset.dash), v = Number(el.dataset.value);
  requestAnimationFrame(() => { el.style.strokeDashoffset = String(len * (1 - v)); });
}

// Prvky .reveal, [data-count] a .donut se při vjetí do obrazu animují.
// MutationObserver zachytí i obsah, který stránka vykreslí až po načtení dat.
const motion = (() => {
  const seen = new WeakSet();
  const pending = new Set();
  const io = "IntersectionObserver" in window && !REDUCED_MOTION ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) activate(e.target);
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }) : null;
  function activate(el) {
    if (!pending.has(el) && io) return;
    pending.delete(el);
    if (io) io.unobserve(el);
    el.classList.add("in");
    el.querySelectorAll("[data-count]").forEach(runCounter);
    if (el.matches("[data-count]")) runCounter(el);
    el.querySelectorAll("circle.val[data-dash]").forEach(runDonut);
  }
  // Pojistka pro rychlé skrolování: co už je nad spodním okrajem obrazovky, se odkryje vždy.
  let queued = false;
  function sweep() {
    queued = false;
    const limit = window.innerHeight;
    for (const el of [...pending]) {
      if (!el.isConnected) { pending.delete(el); continue; }
      if (el.offsetParent !== null && el.getBoundingClientRect().top < limit) activate(el);
    }
  }
  window.addEventListener("scroll", () => { if (!queued && pending.size) { queued = true; requestAnimationFrame(sweep); } }, { passive: true });
  function scan(root) {
    // Karty, tabulky a seznamy na všech stránkách se objevují při skrolování.
    root.querySelectorAll("main .card, main .table-wrap, main .list-card, main .metrics, main .profile-head")
      .forEach((el) => { if (!el.closest(".reveal") || el.classList.contains("reveal")) el.classList.add("reveal"); });
    root.querySelectorAll(".reveal, [data-count]:not(.reveal [data-count])").forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      pending.add(el);
      if (io) io.observe(el); else activate(el);
    });
    if (io) requestAnimationFrame(sweep);
  }
  return { scan };
})();

document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle();
  motion.scan(document);
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) motion.scan(n.parentElement || n); });
  }).observe(document.body, { childList: true, subtree: true });
});
