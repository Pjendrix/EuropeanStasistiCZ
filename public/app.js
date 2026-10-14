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
const PALETTE = ["#dbe7ff", "#ffe2cc", "#d6f5e3", "#f3dcff", "#fff1b8", "#ffd6dc", "#d4f1f7", "#e8e1d4", "#e1e4ea", "#ead7ff", "#d9f2c7"];

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
  const bg = g && g.color ? g.color : colorFor(g ? g.code : label);
  const logo = g && g.logo ? `<img src="${esc(g.logo)}" alt="">` : "";
  return `<span class="badge" style="--badge-bg:${bg}; --badge-fg:#1b1f24" title="${esc(title)}">${logo}${esc(label)}</span>`;
}

function partyBadge(id, label, parties) {
  if (!id) return '<span class="badge outline">bez strany</span>';
  const p = parties.find((x) => String(x.id) === String(id));
  const text = p ? p.short_label : label;
  const bg = p && p.color ? p.color : colorFor(id);
  const logo = p && p.logo ? `<img src="${esc(p.logo)}" alt="">` : "";
  return `<span class="badge" style="--badge-bg:${bg}; --badge-fg:#1b1f24" title="${esc(p ? p.name : text)}">${logo}${esc(text)}</span>`;
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
  return apply;
}

function sourceLine(stats) {
  const rel = stats?.sources?.votes?.release;
  return `Zdroj: <a href="${HTV_SOURCE}">HowTheyVote.eu</a> (export ${esc(rel || "")}, licence ODbL) a
    <a href="${EP_SOURCE}">EP Open Data</a> (CC BY 4.0). Čísla počítá skript
    <a href="https://github.com/Pjendrix/EuropeanStasistiCZ/blob/main/scripts/compute_stats.py">compute_stats.py</a>,
    <a href="o-projektu.html#metodika">metodika</a>.`;
}
