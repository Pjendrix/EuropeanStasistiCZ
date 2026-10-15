// Sdílené funkce pro všechny stránky EP Watch CZ. Bez build stepu, čisté JS.
"use strict";

// Statické stránky v podadresářích (p/, s/, v/) mají <html data-root="../">.
const ROOT = document.documentElement.dataset.root || "";
const DATA = ROOT + "data/";
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
// Typ hlasování (vote_kind) určuje build_web.py pevnými pravidly (scripts/vote_kinds.py).
const KIND_LABEL = {
  final: "závěrečné hlasování",
  provisional_agreement: "prozatímní dohoda s Radou",
  objection: "námitka proti aktu Komise",
  rejection: "návrh na zamítnutí",
  mandate: "mandát k jednání s Radou",
  urgency: "naléhavý postup",
  amendment: "pozměňovací návrh",
  split_part: "dílčí hlasování",
  procedural: "procedurální hlasování",
  other: "ostatní",
};
const FINAL_KINDS = ["final", "provisional_agreement", "objection"];
// Co znamená hlas PRO u typů, kde to není zřejmé (stejné texty jako KIND_NOTES ve vote_kinds.py).
const KIND_NOTE = {
  rejection: "Hlasovalo se o návrhu na zamítnutí: hlas PRO = text zamítnout, hlas PROTI = text ponechat.",
  objection: "Hlasovalo se o usnesení, kterým Parlament vznáší námitku proti aktu Komise (čl. 114 nebo 115 jednacího řádu): hlas PRO = vznést námitku (nesouhlas s aktem), hlas PROTI = námitku nevznášet.",
};
const INVERTED_NOTE = KIND_NOTE.rejection;
const SHORT_MANDATE_NOTE = "Mandát kratší než 60 dní: procenta jsou z velmi malého počtu hlasování.";
const INDEPENDENT_NOTE = "EP Open Data uvádí poslance jako nezávislého (Independent, zkratka Ind.), tedy bez národní strany.";
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

// Barva identity frakce nebo strany je v datech (groups.json / parties.json z data/manual/colors.json):
// oficiální brand_color, jinak chart_color zvolená kvůli rozlišitelnosti. V JS žádné barvy dat.
function groupColor(g) {
  return (g && (g.color || g.chart_color)) || "var(--muted)";
}

// Logo na bílé dlaždici (funguje i v tmavém režimu bez úpravy loga); jen na místech s dost místa, ne v drobných štítcích.
// Dlaždice má pevnou výšku `size`; samotné logo se zmenší podle poměru stran (logo_aspect z compute_stats.py),
// aby široká slovní loga (PATRIOTS.EU, renew europe) měla zhruba stejnou plochu jako čtvercová (ECR, S&D).
// Logo se jen zmenšuje, kresba se nemění.
function logoHeight(aspect, size) {
  if (!aspect || aspect <= 1) return size;
  return Math.round(size * Math.max(0.42, Math.pow(aspect, -0.4)) * 10) / 10;
}

function logoTile(entity, size = 28) {
  if (!entity || !entity.logo) return "";
  const name = entity.name_cs || entity.name || entity.label || entity.short_label || "";
  const h = logoHeight(entity.logo_aspect, size);
  const w = entity.logo_aspect ? ` width="${Math.round(h * entity.logo_aspect)}"` : "";
  return `<span class="logo-tile" style="height:${size}px"><img src="${esc(entity.logo)}" alt="${esc(name)}" style="height:${h}px"${w} height="${Math.round(h)}" loading="lazy"></span>`;
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
  return `<span data-count="${(value * 100).toFixed(1)}" data-decimals="1" data-suffix="&nbsp;%">${fmtPct(value)}</span>`;
}

function fmtPct(value) {
  return value === null ? "–" : (value * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "\u00a0%";
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

// Štítek frakce. code = kód HowTheyVote (EPP, PFE…) nebo EP kód (PPE…), groups = groups.json.
function groupBadge(code, groups, epCode) {
  if (!code && !epCode) return '<span class="badge outline">bez frakce</span>';
  const g = groups.find((x) => x.code === code) || groups.find((x) => epCode && x.ep_code === epCode);
  const label = g ? (CZ_GROUP_LABEL[g.code] || g.short_label) : (code || epCode);
  const title = g ? (g.name_cs || g.label) : label;
  return `<span class="badge" style="--badge-dot:${groupColor(g)}" title="${esc(title)}">${esc(label)}</span>`;
}

// mep (nepovinné) = poslanec kvůli rodu u „nezávislý/á“.
function partyBadge(id, label, parties, mep) {
  if (!id) return '<span class="badge outline">bez strany</span>';
  const p = parties.find((x) => String(x.id) === String(id));
  // EP vede poslance bez strany jako „Independent“ (zkratka Ind.); nejde o stranu.
  if (p && p.independent) return `<span class="badge outline" title="${esc(INDEPENDENT_NOTE)}">${mep ? byGender(mep, "nezávislý", "nezávislá") : "nezávislý/á"}</span>`;
  const text = p ? p.short_label : label;
  return `<span class="badge" style="--badge-dot:${groupColor(p)}" title="${esc(p ? p.name : text)}">${esc(text)}</span>`;
}

// Štítek strany s odkazem na stránku strany (nezávislí stránku nemají).
function partyLink(id, label, parties, mep) {
  const p = parties.find((x) => String(x.id) === String(id));
  const badge = partyBadge(id, label, parties, mep);
  return p && !p.independent ? `<a href="party.html?id=${p.id}" class="badge-link">${badge}</a>` : badge;
}

// Profil poslance: statická stránka s plným obsahem, JS na ní doplní interakce (U5).
function mepUrl(id) {
  return `p/${id}.html`;
}

// Počty Čechů: pro a proti výrazně, zdržení a nehlasování menším písmem.
function czCountsText(cz) {
  return `${cz[0]} pro · ${cz[1]} proti · ${cz[2]} se zdrželo · ${cz[3]} nehlasovalo`;
}

function czCountsHtml(cz) {
  return `<span class="cz-counts"><b>${cz[0]} pro</b> · <b>${cz[1]} proti</b> <small>· ${cz[2]} zdrž. · ${cz[3]} nehl.</small></span>`;
}

function photoUrl(mep, thumb = false) {
  if (!mep.photo_url) return "";
  return thumb ? `assets/photos/thumbs/${mep.id}.webp` : `assets/photos/${mep.id}.jpg`;
}

// Portrét (náhled) nebo iniciály, když portrét chybí.
function avatar(mep, size = 40) {
  if (mep.photo_url) return `<img src="${photoUrl(mep, true)}" alt="" loading="lazy" width="${size}" height="${size}">`;
  const initials = [mep.given_name, mep.family_name].filter(Boolean).map((x) => x[0]).join("") || (mep.name || "?")[0];
  return `<span class="avatar-initials" style="width:${size}px;height:${size}px;border-radius:50%;flex:none" aria-hidden="true">${esc(initials)}</span>`;
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

// Popis toho, o čem se hlasovalo: česky, když ho pravidla umí přeložit, jinak originál ze zdroje.
function voteDesc(v) {
  return v.description_cs || v.description || "";
}

function voteSubtitle(v) {
  const parts = [];
  if (v.reference) parts.push(v.reference);
  const desc = voteDesc(v);
  if (desc) parts.push(desc);
  else if (/^\d+$/.test(String(v.amendment_number || ""))) parts.push(`PN ${v.amendment_number}`);
  return parts.join(" · ");
}

// Štítek typu hlasování; starší data bez vote_kind ukážou jen „hlavní“.
function kindTag(v) {
  if (v.vote_kind) return `<span class="tag kind-${esc(v.vote_kind)}" title="${esc(KIND_NOTE[v.vote_kind] || "")}">${esc(KIND_LABEL[v.vote_kind] || v.vote_kind)}</span>`;
  return v.is_main ? '<span class="tag">hlavní</span>' : "";
}

// Výsledek slovy; u návrhu na zamítnutí a námitky i co to znamená.
function resultText(v) {
  const base = RESULT_LABEL[v.result] || "neuveden";
  if (v.inverted || v.vote_kind === "rejection") {
    if (v.result === "ADOPTED") return `${base} = text zamítnut`;
    if (v.result === "REJECTED") return `${base} = text nezamítnut`;
  }
  if (v.vote_kind === "objection") {
    if (v.result === "ADOPTED") return `${base} = Parlament vznesl námitku`;
    if (v.result === "REJECTED") return `${base} = námitka neprošla`;
  }
  return base;
}

// Výsledek jako věta podle typu hlasování (nadpis výsledkové karty na detailu).
function resultSentence(kind, result) {
  const ok = result === "ADOPTED", no = result === "REJECTED";
  if (!ok && !no) return RESULT_LABEL[result] ? RESULT_LABEL[result][0].toUpperCase() + RESULT_LABEL[result].slice(1) : "Výsledek neuveden";
  const S = {
    rejection: ["Návrh na zamítnutí prošel – text je zamítnut", "Návrh na zamítnutí neprošel – text zůstává"],
    objection: ["Parlament vznesl námitku proti aktu Komise", "Námitka neprošla"],
    amendment: ["Pozměňovací návrh byl přijat", "Pozměňovací návrh byl zamítnut"],
    split_part: ["Tato část textu byla přijata", "Tato část textu byla zamítnuta"],
    final: ["Parlament text přijal", "Parlament text zamítl"],
    provisional_agreement: ["Parlament dohodu s Radou schválil", "Parlament dohodu s Radou zamítl"],
    mandate: ["Mandát k jednání s Radou schválen", "Mandát k jednání s Radou neschválen"],
    urgency: ["Naléhavý postup schválen", "Naléhavý postup zamítnut"],
  }[kind];
  return S ? S[ok ? 0 : 1] : (ok ? "Přijato" : "Zamítnuto");
}

// Tečky českých poslanců seskupené podle frakcí, obarvené podle hlasu (pro/proti/zdržel se/nehlasoval).
function czDots(positions, mepsById, groups) {
  const by = {};
  positions.forEach((p) => { (by[p.group_code || "–"] = by[p.group_code || "–"] || []).push(p); });
  const order = Object.keys(by).sort((a, b) => by[b].length - by[a].length || a.localeCompare(b));
  const counts = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"].map((k) => positions.filter((p) => p.position === k).length);
  return `<div class="cz-dots" role="img" aria-label="${esc(`Čeští poslanci: ${czCountsText(counts)}`)}">${order.map((code) => {
    const g = groups.find((x) => x.code === code);
    const label = g ? (CZ_GROUP_LABEL[code] || g.short_label) : code;
    return `<span class="cz-dot-group"><span class="cz-dot-label">${esc(label)}</span>${by[code]
      .map((p) => `<i class="cz-dot d-${p.position}" title="${esc(`${displayName(mepsById[p.member_id] || { name: "?" })}: ${POSITION_LABEL[p.position]}`)}"></i>`).join("")}</span>`;
  }).join("")}</div>`;
}

// Výsledek s ikonou (✓ přijato, ✕ zamítnuto); ikona je jen doplněk textu, barvy pro/proti se nepoužívají.
function resultHtml(v) {
  const icon = { ADOPTED: "✓", REJECTED: "✕" }[v.result] || "–";
  return `<span class="res-icon" aria-hidden="true">${icon}</span>${esc(resultText(v))}`;
}

// Závěrečné hlasování o textu (nebo o prozatímní dohodě); starší data jen podle is_main.
function isFinal(v) {
  if (v.is_final !== undefined) return v.is_final;
  return v.vote_kind ? FINAL_KINDS.includes(v.vote_kind) : Boolean(v.is_main);
}

// Přijatý text v češtině (PDF z EP Open Data) podle texts_adopted_reference „P10_TA(2026)0230“.
function adoptedTextUrl(ref) {
  const m = /^P(\d+)_TA\((\d{4})\)(\d{4})$/.exec(ref || "");
  return m ? `https://data.europarl.europa.eu/distribution/doc/TA-${m[1]}-${m[2]}-${m[3]}_cs.pdf` : null;
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
      <div class="small muted">${kindTag(v)}${esc(voteSubtitle(v))}</div></td>
    ${extra}
    <td class="result-${v.result || ""}" title="${esc(RESULT_NOTE[v.result ?? null] || "")}">${resultHtml(v)}</td>
  </tr>`;
}

function czCell(cz) {
  return `<td>${splitBar(cz)}<div class="small">${czCountsHtml(cz)}</div></td>`;
}

// Jména poslanců seskupená podle volby; positions = {id: volba} nebo [{member_id, position}].
function namesByPosition(positions, mepsById, keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"]) {
  const list = Array.isArray(positions) ? positions : Object.entries(positions).map(([id, position]) => ({ member_id: Number(id), position }));
  return keys.map((k) => {
    const names = list.filter((p) => p.position === k)
      .map((p) => mepsById[p.member_id])
      .filter(Boolean)
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "cs"))
      .map((m) => `<a href="${mepUrl(m.id)}">${esc(displayName(m))}</a>`);
    return names.length ? `<div class="small"><span class="pos pos-${k}">${POSITION_LABEL[k]} (${names.length}):</span> ${names.join(", ")}</div>` : "";
  }).join("");
}


// Dlouhé tabulky sbalit na prvních n řádků s tlačítkem „Zobrazit všech N“.
function collapseTables(root, n = window.matchMedia("(max-width: 640px)").matches ? 3 : 5) {
  root.querySelectorAll(".table-wrap table").forEach((table) => {
    const rows = [...table.tBodies[0]?.rows || []];
    if (rows.length <= n + 1 || table.dataset.collapsed) return;
    table.dataset.collapsed = "1";
    rows.slice(n).forEach((r) => { r.hidden = true; });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "more-btn";
    btn.textContent = `Zobrazit všech ${rows.length}`;
    btn.addEventListener("click", () => { rows.forEach((r) => { r.hidden = false; }); btn.remove(); });
    table.closest(".table-wrap").after(btn);
  });
}

// --- srovnání s mediánem (benchRow) ---------------------------------------------

const BENCH_MIN = 0.6; // osa 60–100 %; nižší hodnoty se přilepí k levému okraji (číslo je vždy v textu)

// Řádek: popisek a číslo, pod tím proužek (tečka = poslanec, čárka = medián) a věta se srovnáním.
// pair = [čitatel, jmenovatel], median = podíl nebo null, refLabel = „medián EP“ / „medián frakce“,
// naText = věta, když se metrika nepočítá. compact = bez věty pod proužkem (tabulka, mobil).
function benchRow(label, pair, median, refLabel, opts = {}) {
  const { naText = "nepočítá se", compact = false } = opts;
  const v = pct(pair);
  if (v === null) {
    return `<div class="bench"><div class="bench-top"><span class="bench-label">${label}</span><b>–</b></div>
      <p class="bench-note">${esc(naText)}</p></div>`;
  }
  const pos = (x) => `${(Math.max(0, Math.min(1, (x - BENCH_MIN) / (1 - BENCH_MIN))) * 100).toFixed(2)}%`;
  const hasMed = median !== null && median !== undefined;
  let note = "";
  if (hasMed) {
    const d = Math.round((v - median) * 1000) / 10;
    const abs = Math.abs(d).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    note = d === 0 ? `stejně jako ${refLabel} (${fmtPct(median)})` : `o ${abs} p. b. ${d > 0 ? "víc" : "méně"} než ${refLabel} (${fmtPct(median)})`;
  }
  const below = v < BENCH_MIN ? ` Hodnota je pod rozsahem osy (${fmtPct(v)}).` : "";
  const aria = `${label} ${fmtPct(v)}${hasMed ? `, ${refLabel} ${fmtPct(median)}` : ""}`;
  return `<div class="bench${compact ? " compact" : ""}" role="group" aria-label="${esc(aria)}">
    <div class="bench-top"><span class="bench-label">${label}</span><b>${fmtPct(v)}</b></div>
    <div class="bench-strip" aria-hidden="true"><i class="bench-track"></i><i class="bench-dot" style="left:${pos(v)}"></i>
      ${hasMed ? `<i class="bench-med" style="left:${pos(median)}"></i>` : ""}</div>
    ${compact || !(note + below) ? "" : `<p class="bench-note">${esc(note + below)}</p>`}</div>`;
}

// Medián frakce poslance z benchmarks.json (klíče jsou kódy HowTheyVote, poslanec má kód EP).
function groupBench(bench, groups, epCode) {
  if (!bench || !epCode) return null;
  const g = groups.find((x) => x.ep_code === epCode || x.code === epCode);
  return g ? bench.groups?.[g.code] || null : null;
}

// --- citace a export ---------------------------------------------------------

// Tlačítko „Citovat“: věta s číslem; při kopírování se doplní verze dat a adresa stránky.
// „Vysvětlit s AI“: web sám AI nevolá. Připraví neutrální dotaz s odkazy na oficiální zdroje a otevře ho
// v AI nástroji podle volby čtenáře. Claude a ChatGPT dotaz převezmou z odkazu (?q=), Gemini oficiálně ne:
// dotaz se zkopíruje do schránky a Gemini se otevře. Odpověď AI není součást webu a web za ni neručí.
function aiPrompt({ v, kind, final, desc, adopted, c }) {
  const lines = [
    "Vysvětli mi stručně a neutrálně česky, o čem bylo toto hlasování v Evropském parlamentu a co jeho výsledek znamená v praxi.",
    "Vycházej jen z oficiálních dokumentů na odkazech níže; když něco z nich nevyplývá, napiš to. Uveď hlavní argumenty pro i proti, nehodnoť politiky.",
    "",
    `Hlasování: ${voteTitle(v)}${v.reference ? ` (${v.reference})` : ""}`,
    !final && desc ? `Předmět dílčího hlasování: ${desc}` : null,
    `Datum: ${v.date}${kind ? `, typ: ${KIND_LABEL[kind] || kind}` : ""}`,
    `Výsledek: ${RESULT_LABEL[v.result] || "neuveden"} (${c.for} pro, ${c.against} proti, ${c.abstention} se zdrželo)`,
    adopted ? `Přijatý text: ${adopted}` : null,
    v.procedure?.reference ? `Legislativní observatoř: https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference=${encodeURIComponent(v.procedure.reference)}` : null,
    `Údaje o hlasování: ${v.source_url}`,
  ];
  return lines.filter((x) => x !== null).join("\n");
}

function askAiBox(ctx) {
  const prompt = aiPrompt(ctx);
  const q = encodeURIComponent(prompt);
  return `<details class="card ask-ai"><summary><strong>Vysvětlit s pomocí AI</strong> <span class="small muted">(otevře se mimo tento web)</span></summary>
    <p class="small muted">Dotaz se odešle do vybraného AI nástroje mimo tento web; jeho odpověď neověřujeme. Dotaz odkazuje jen na oficiální dokumenty; odpověď si vždy ověřte ve zdroji.</p>
    <div class="ask-ai-row">
      <a class="more-btn" href="https://claude.ai/new?q=${q}" target="_blank" rel="noopener">Claude</a>
      <a class="more-btn" href="https://chatgpt.com/?q=${q}" target="_blank" rel="noopener">ChatGPT</a>
      <a class="more-btn" href="https://gemini.google.com/app" target="_blank" rel="noopener" data-copy-prompt="${esc(prompt)}" title="Dotaz se zkopíruje do schránky, v Gemini ho vložte (Ctrl+V)">Gemini (vložit ze schránky)</a>
      <button type="button" class="more-btn" data-copy-prompt="${esc(prompt)}">Zkopírovat dotaz</button>
    </div>
    <pre class="ask-ai-prompt small">${esc(prompt)}</pre>
  </details>`;
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-copy-prompt]");
  if (!el) return;
  try { navigator.clipboard?.writeText(el.dataset.copyPrompt); } catch (e) { /* schránka nedostupná */ }
  if (el.tagName === "BUTTON") {
    const old = el.textContent;
    el.textContent = "Zkopírováno";
    setTimeout(() => { el.textContent = old; }, 1500);
  }
});

function citeButton(text) {
  return `<button type="button" class="cite-btn" data-cite="${esc(text)}" aria-label="Citovat" title="Citovat (zkopíruje větu se zdrojem)">${CITE_ICON}</button>`;
}
const CITE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.2 6C4.9 7.2 3.5 9.4 3.5 12.3V18h6.2v-6.1H6.6c.1-1.9 1-3.3 2.6-4.2L7.2 6zm9.8 0c-2.3 1.2-3.7 3.4-3.7 6.3V18h6.2v-6.1h-3.1c.1-1.9 1-3.3 2.6-4.2L17 6z"/></svg>';

async function citeText(text) {
  let release = "";
  try { release = (await getJSON("overview.json")).sources?.votes?.release || ""; } catch (e) { /* bez verze */ }
  const today = fmtDate(new Date().toISOString().slice(0, 10));
  return `${text}${release ? ` Data: export HowTheyVote ${release}.` : ""} EP Watch CZ, ${location.href} (citováno ${today}).`;
}

document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".cite-btn");
  if (!btn) return;
  const text = await citeText(btn.dataset.cite);
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add("done");
    btn.setAttribute("aria-label", "Citace zkopírována");
  } catch (e) {
    window.prompt("Zkopírujte citaci:", text);
  }
  setTimeout(() => { btn.classList.remove("done"); btn.setAttribute("aria-label", "Citovat"); }, 2000);
});

// Tlačítko „Stáhnout CSV“; rows = pole polí (první řádek = záhlaví). Oddělovač středník kvůli českému Excelu.
function csvButton(filename, rowsFn, label = "Stáhnout CSV") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "csv-btn";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    const cell = (x) => {
      const s = x === null || x === undefined ? "" : String(x);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const text = "\ufeff" + rowsFn().map((r) => r.map(cell).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });
  return btn;
}

// Podíl jako číslo pro CSV (0,914), bez procent kvůli dalšímu zpracování.
function csvShare(pair) {
  const v = pct(pair);
  return v === null ? "" : v.toFixed(4).replace(".", ",");
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

// Stránky s <base href="../"> (p/{id}.html): odkaz „#kotva“ by vedl na úvodní stránku, proto se kotvy řeší tady.
document.addEventListener("click", (ev) => {
  const a = ev.target.closest('a[href^="#"]');
  if (!a || !document.querySelector("base")) return;
  const target = document.getElementById(a.getAttribute("href").slice(1));
  if (!target) return;
  ev.preventDefault();
  history.replaceState(null, "", location.pathname + location.search + a.getAttribute("href"));
  target.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth" });
  if (a.classList.contains("skip-link")) { target.setAttribute("tabindex", "-1"); target.focus(); }
});

document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle();
  motion.scan(document);
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) motion.scan(n.parentElement || n); });
  }).observe(document.body, { childList: true, subtree: true });
});
