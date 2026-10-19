// Stavební bloky stránek (HTML řetězce, tabulky, ⓘ, sdílení čísel, CSV, toast).
import { CATEGORY_META, ROOT, getJSON } from "./data.js";
import { COUNTRY_CS, CZ_GROUP_LABEL, EP_SOURCE, HTV_SOURCE, INDEPENDENT_NOTE, KIND_LABEL, KIND_NOTE, POSITION_LABEL, RESULT_NOTE, VOTE_MEANING, adoptedTextHtmlUrl, byGender, czCountsText, displayName, epDocUrl, esc, fmtDate, fmtNum, fmtPct, groupColor, isStale, logoHeight, pct, positionPhrase, resultText, sessionCountdown, voteSubtitle, voteTitle } from "./format.js";

export function logoTile(entity, size = 28) {
  if (!entity || !entity.logo) return "";
  const name = entity.name_cs || entity.name || entity.label || entity.short_label || "";
  const h = logoHeight(entity.logo_aspect, size);
  const w = entity.logo_aspect ? ` width="${Math.round(h * entity.logo_aspect)}"` : "";
  return `<span class="logo-tile" style="height:${size}px"><img src="${esc(entity.logo)}" alt="${esc(name)}" style="height:${h}px"${w} height="${Math.round(h)}" loading="lazy"></span>`;
}

// Buňka „logo + název + doplněk“: logo v pevně širokém slotu, aby názvy v tabulce lícovaly i u řádků bez loga
// (tam je v slotu jen tečka v barvě strany/frakce). size = výška dlaždice loga.
export function entityCell(entity, { name, href, sub = "", size = 28, slot = "" } = {}) {
  const logo = logoTile(entity, size) || `<span class="dot" style="background:${groupColor(entity)}"></span>`;
  const title = href ? `<a href="${esc(href)}" class="vote-title">${esc(name)}</a>` : `<span>${esc(name)}</span>`;
  return `<div class="entity-cell"><span class="logo-slot${slot ? ` ${slot}` : ""}">${logo}</span>
    <div class="entity-text">${title}${sub ? `<div class="small muted">${sub}</div>` : ""}</div></div>`;
}

// Velké procento s počítadlem (animuje se při vjetí do obrazu).
export function countPct(value) {
  if (value === null || value === undefined) return "–";
  return `<span data-count="${(value * 100).toFixed(1)}" data-decimals="1" data-suffix="&nbsp;%">${fmtPct(value)}</span>`;
}

export function pctCell(pair, title) {
  const v = pct(pair);
  const detail = pair && pair[1] ? `${fmtNum(pair[0])} z ${fmtNum(pair[1])}` : "nepočítá se";
  return `<span class="pct" title="${esc(title || "")}">${fmtPct(v)}<small>${detail}</small></span>`;
}

// Štítek frakce. code = kód HowTheyVote (EPP, PFE…) nebo EP kód (PPE…), groups = groups.json.
export function groupBadge(code, groups, epCode) {
  if (!code && !epCode) return '<span class="badge outline">bez frakce</span>';
  const g = groups.find((x) => x.code === code) || groups.find((x) => epCode && x.ep_code === epCode);
  const label = g ? (CZ_GROUP_LABEL[g.code] || g.short_label) : (code || epCode);
  const title = g ? (g.name_cs || g.label) : label;
  return `<span class="badge" style="--badge-dot:${groupColor(g)}" title="${esc(title)}">${esc(label)}</span>`;
}

// mep (nepovinné) = poslanec kvůli rodu u „nezávislý/á“.
export function partyBadge(id, label, parties, mep) {
  if (!id) return '<span class="badge outline">bez strany</span>';
  const p = parties.find((x) => String(x.id) === String(id));
  // EP vede poslance bez strany jako „Independent“ (zkratka Ind.); nejde o stranu.
  if (p && p.independent) return `<span class="badge outline" title="${esc(INDEPENDENT_NOTE)}">${mep ? byGender(mep, "nezávislý", "nezávislá") : "nezávislý/á"}</span>`;
  const text = p ? p.short_label : label;
  return `<span class="badge" style="--badge-dot:${groupColor(p)}" title="${esc(p ? p.name : text)}">${esc(text)}</span>`;
}

// Profil poslance: statická stránka s plným obsahem, JS na ní doplní interakce (U5).
// Jedna adresa strany (s/{id}.html; party.html?id= se přesměrovává).
export function partyUrl(id) {
  return `s/${id}`;
}

export function mepUrl(id) {
  return `p/${id}`;
}

export function czCountsHtml(cz) {
  return `<span class="cz-counts"><b>${cz[0]} pro</b> · <b>${cz[1]} proti</b> <small>· ${cz[2]} zdrž. · ${cz[3]} nehl.</small></span>`;
}

export function photoUrl(mep, thumb = false) {
  if (!mep.photo_url) return "";
  return thumb ? `assets/photos/thumbs/${mep.id}.webp` : `assets/photos/${mep.id}.jpg`;
}

// Portrét (náhled) nebo iniciály, když portrét chybí.
export function avatar(mep, size = 40) {
  if (mep.photo_url) return `<img src="${photoUrl(mep, true)}" alt="" loading="lazy" width="${size}" height="${size}">`;
  const initials = [mep.given_name, mep.family_name].filter(Boolean).map((x) => x[0]).join("") || (mep.name || "?")[0];
  return `<span class="avatar-initials" style="width:${size}px;height:${size}px;border-radius:50%;flex:none" aria-hidden="true">${esc(initials)}</span>`;
}

export function splitBar(counts) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];
  const title = keys.map((k, i) => `${POSITION_LABEL[k]}: ${counts[i]}`).join(", ");
  return `<div class="split" title="${esc(title)}" role="img" aria-label="${esc(title)}">${keys
    .map((k, i) => `<span class="s-${k}" style="width:${(counts[i] / total) * 100}%"></span>`).join("")}</div>`;
}

// Celý parlament a Češi v jedné kartě, proužky pod sebou na stejné ose (audit UI5; stejné jako compare_card() v build_pages.py).
export function compareCard(total, cz, src) {
  const row = (label, n) => `<div class="cmp-row"><div class="cmp-label">${label}</div>${splitBar(n)}`
    + `<div class="detail"><span class="pos pos-FOR">pro ${n[0]}</span> · <span class="pos pos-AGAINST">proti ${n[1]}</span> · zdrželo se ${n[2]} · nehlasovalo ${n[3]}</div></div>`;
  return `<div class="card metric compare"><div class="label">Parlament a Češi</div>${row("Celý parlament", total)}${row("Čeští poslanci", cz)}`
    + `<div class="detail"><a href="${esc(src)}">zdroj</a></div></div>`;
}

export function catChip(v) {
  const cats = v.cats || [];
  const c = CATEGORY_META[cats[0]];
  if (!c) return "";
  const more = cats.length > 1
    ? `<span class="cat-more" title="${esc(cats.slice(1).map((k) => CATEGORY_META[k]?.label).filter(Boolean).join(", "))}">+${cats.length - 1}</span>` : "";
  return `<div class="cat-inline"><span class="cat-ico sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${c.icon}</svg></span>${esc(c.label)}${more}</div>`;
}

// Čipy tématu hlasování (stejná data i ikony jako catChip; dvojče topic_chips() v scripts/build_pages.py, shodu hlídá test).
// cats = klíče kategorií podle priority (první = hlavní). opts: max = kolik čipů ukázat (zbytek „+N“ v popoveru),
// link = čip vede na filtr votes.html?c=…, id = jedinečná část id popoveru, root = cesta ke kořeni webu, info = ⓘ s odkazem na metodiku.
export const TOPIC_ICON_SVG = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const TOPIC_NOTE = "Téma určuje pevná tabulka pravidel nad kódy témat Legislativní observatoře EP, které uvádí zdroj dat. Nevybíráme ho my ani AI.";

export function topicChips(cats, opts = {}) {
  const { max = 4, link = true, id = "x", root = "", info = false } = opts;
  const known = (cats || []).filter((k) => CATEGORY_META[k]);
  if (!known.length) return "";
  const chip = (k) => {
    const inner = `<span class="cat-ico sm">${TOPIC_ICON_SVG(CATEGORY_META[k].icon)}</span>${esc(CATEGORY_META[k].label)}`;
    return link ? `<a class="topic-chip" href="${root}votes?c=${k}">${inner}</a>` : `<span class="topic-chip">${inner}</span>`;
  };
  const shown = known.slice(0, max), rest = known.slice(max);
  const method = `<a href="${root}o-projektu#tema-hlasovani">Jak určujeme téma</a>`;
  const more = rest.length ? `<span class="info-wrap"><button type="button" class="topic-chip tc-more" popovertarget="tc-${id}" aria-expanded="false" aria-label="${esc(`Další témata: ${rest.map((k) => CATEGORY_META[k].label).join(", ")}`)}">+${rest.length}</button>`
    + `<div popover id="tc-${id}" class="info-pop tc-pop" role="note"><p class="tc-list">${rest.map(chip).join("")}</p><p class="small">${method}</p></div></span>` : "";
  const tip = info ? `<span class="info-wrap"><button type="button" class="info-btn" popovertarget="ti-${id}" aria-label="Jak určujeme téma" aria-expanded="false">ⓘ</button>`
    + `<div popover id="ti-${id}" class="info-pop" role="note"><p>${TOPIC_NOTE} ${method}.</p></div></span>` : "";
  return `<span class="topic-chips">${shown.map(chip).join("")}${more}${tip}</span>`;
}

// Text tématu do citace a alt textu: „Klima, příroda a energie (+2)“; bez tématu prázdný řetězec.
export function topicText(cats) {
  const known = (cats || []).filter((k) => CATEGORY_META[k]);
  return known.length ? `${CATEGORY_META[known[0]].label}${known.length > 1 ? ` (+${known.length - 1})` : ""}` : "";
}

// Prázdný stav s vysvětlením a dalším krokem (audit UI3): co to znamená a kam pokračovat, ne slepá ulička.
export function emptyState(title, hint = "", links = []) {
  const acts = links.length ? `<div class="empty-acts">${links.map(([href, label]) => `<a class="more-btn" href="${esc(href)}">${esc(label)}</a>`).join("")}</div>` : "";
  return `<div class="empty-state"><p><strong>${esc(title)}</strong>${hint ? ` ${esc(hint)}` : ""}</p>${acts}</div>`;
}

// Krátké oznámení dole (role=status), společné pro celý web (audit UI4).
export function toast(text, { bad = false, ms = 2600 } = {}) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "sd-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.toggle("bad", bad);
  el.classList.add("show");
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove("show"), ms);
}

// Štítek typu hlasování; starší data bez vote_kind ukážou jen „hlavní“.
export function kindTag(v) {
  if (v.vote_kind) return `<span class="tag kind-${esc(v.vote_kind)}" title="${esc(KIND_NOTE[v.vote_kind] || "")}">${esc(KIND_LABEL[v.vote_kind] || v.vote_kind)}</span>`;
  return v.is_main ? '<span class="tag">hlavní</span>' : "";
}

// Tečky českých poslanců seskupené podle frakcí, obarvené podle hlasu (pro/proti/zdržel se/nehlasoval).
export function czDots(positions, mepsById, groups) {
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

// Čeští poslanci v hlasování podle strany (k datu hlasování); strany od největší, pak abecedně. Stejná logika jako party_rows v Pythonu.
export function czPartyRows(positions, mepsById, parties, groups) {
  const byId = Object.fromEntries(parties.map((p) => [p.id, p]));
  const rows = {};
  positions.forEach((p) => {
    const entry = byId[p.national_party_id];
    const label = entry?.short_label || (p.national_party && p.national_party !== "Independent" ? p.national_party : "Ind.");
    const r = (rows[label] = rows[label] || { label, color: entry?.chart_color || null, groups: [], members: { FOR: [], AGAINST: [], ABSTENTION: [], DID_NOT_VOTE: [] } });
    const g = groups.find((x) => x.code === p.group_code);
    const gl = p.group_code ? (g ? (CZ_GROUP_LABEL[g.code] || g.short_label) : p.group_code) : "bez frakce";
    if (!r.groups.includes(gl)) r.groups.push(gl);
    r.members[p.position].push(mepsById[p.member_id]);
  });
  return Object.values(rows).map((r) => {
    r.groups.sort((a, b) => a.localeCompare(b, "cs"));
    Object.values(r.members).forEach((l) => l.sort((a, b) => (a.sort_label || a.name).localeCompare(b.sort_label || b.name, "cs")));
    r.total = Object.values(r.members).reduce((n, l) => n + l.length, 0);
    return r;
  }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "cs"));
}

export function czPartyRowsHtml(rows) {
  const KEYS4 = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];
  return rows.map((r) => {
    const dots = KEYS4.flatMap((k) => r.members[k].map((m) => `<i class="cz-dot d-${k}" title="${esc(`${displayName(m)}: ${positionPhrase(k, [m])}`)}"></i>`)).join("");
    const names = KEYS4.filter((k) => r.members[k].length).map((k) =>
      `<span class="pr-group"><b class="pos pos-${k}">${esc(positionPhrase(k, r.members[k]))}</b> ${r.members[k].map((m) => `<a href="${mepUrl(m.id)}">${esc(displayName(m))}</a>`).join(", ")}</span>`).join(" · ");
    return `<div class="party-row"><div class="pr-party"><span class="pr-label"><span class="dot"${r.color ? ` style="background:${esc(r.color)}"` : ""}></span><b>${esc(r.label)}</b></span>
      <span class="small muted">${esc(r.groups.join(", "))}</span></div><div class="pr-dots" aria-hidden="true">${dots}</div><div class="pr-names">${names}</div></div>`;
  }).join("");
}

// Výsledek s ikonou (✓ přijato, ✕ zamítnuto); ikona je jen doplněk textu, barvy pro/proti se nepoužívají.
export function resultHtml(v) {
  const icon = { ADOPTED: "✓", REJECTED: "✕" }[v.result] || "–";
  return `<span class="res-badge res-${v.result || "NONE"}"><i class="res-ic" aria-hidden="true">${icon}</i><span class="res-txt">${esc(resultText(v))}</span></span>`;
}

export function setNav(page) {
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
  });
  // Mobilní lišta: stránky bez vlastní záložky (analýzy, o projektu) zvýrazní „Více“.
  document.querySelectorAll(".tab-more[data-pages]").forEach((b) => {
    if (b.dataset.pages.split(" ").includes(page)) b.setAttribute("aria-current", "page");
  });
}

// Chyba s tlačítkem „Zkusit znovu“: retry() načte obsah znovu bez reloadu; bez něj se stránka obnoví. Bez inline onclick (CSP).
export function showError(el, err, retry) {
  el.innerHTML = `<p class="error" role="alert">${esc(err.message || err)}
    <button type="button" class="more-btn">Zkusit znovu</button></p>`;
  el.querySelector("button").addEventListener("click", () => (retry ? retry() : location.reload()));
  console.error(err);
}

// Řazení tabulky kliknutím na záhlaví. rows = pole objektů, columns = {key: getter}, render(rows).
export function sortable(table, columns, rows, render, initial) {
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

export function sourceLine(stats) {
  const rel = stats?.sources?.votes?.release;
  const date = rel && /^\d{4}-\d{2}-\d{2}/.test(rel) ? ` · data k ${fmtDate(rel.slice(0, 10))}` : "";
  return `Zdroj: <a href="${HTV_SOURCE}">HowTheyVote.eu</a> · <a href="${EP_SOURCE}">EP Open Data</a>${date}`
    + infoButton(`<p><a href="${HTV_SOURCE}">HowTheyVote.eu</a> (export ${esc(rel || "")}, licence ODbL) a <a href="${EP_SOURCE}">EP Open Data</a> (CC BY 4.0).
      Čísla počítá skript <a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/compute_stats.py">compute_stats.py</a>, ne AI.
      <a href="o-projektu#metodika">Jak počítáme</a>.</p>`, "Zdroj a metodika");
}

// --- sdílené části pro seznamy hlasování -------------------------------------

// Řádek tabulky hlasování: datum, název s odkazem, výsledek, rozložení Čechů. extra = další buňky.
export function voteRow(v, extra = "") {
  return `<tr>
    <td class="num date">${fmtDate(v.date)}</td>
    <td class="title"><a class="vote-title" href="vote?id=${v.id}&m=${v.month}">${esc(voteTitle(v))}</a>
      <div class="small muted">${kindTag(v)}${esc(voteSubtitle(v))}</div></td>
    ${extra}
    <td class="result result-${v.result || ""}" title="${esc(RESULT_NOTE[v.result ?? null] || "")}">${resultHtml(v)}</td>
  </tr>`;
}

// Jména poslanců seskupená podle volby; positions = {id: volba} nebo [{member_id, position}].
export function namesByPosition(positions, mepsById, keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"]) {
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
export function collapseTables(root, n = window.matchMedia("(max-width: 560px)").matches ? 3 : 5) {
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

export const BENCH_MIN = 0.6;

// osa 60–100 %; nižší hodnoty se přilepí k levému okraji (číslo je vždy v textu)

// Řádek: popisek a číslo, pod tím proužek (tečka = poslanec, čárka = medián) a věta se srovnáním.
// pair = [čitatel, jmenovatel], median = podíl nebo null, refLabel = „medián EP“ / „medián frakce“,
// naText = věta, když se metrika nepočítá. compact = bez věty pod proužkem (tabulka, mobil).
export function benchRow(label, pair, median, refLabel, opts = {}) {
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

// Mediány platné pro poslance: kdo má kratší mandát, porovnává se s mediánem jen z hlasování v době svého mandátu (D7).
export function benchFor(bench, mep) {
  const w = bench && mep?.bench_key ? bench.windows?.[mep.bench_key] : null;
  return w ? { ...bench, ep: w.ep, groups: w.groups } : bench;
}

// Medián frakce poslance z benchmarks.json (klíče jsou kódy HowTheyVote, poslanec má kód EP).
export function groupBench(bench, groups, epCode) {
  if (!bench || !epCode) return null;
  const g = groups.find((x) => x.ep_code === epCode || x.code === epCode);
  return g ? bench.groups?.[g.code] || null : null;
}

export function aiPrompt({ v, kind, final, desc, adopted, c }) {
  const doc = epDocUrl(v.reference);
  const ta = adoptedTextHtmlUrl(v.texts_adopted_reference) || adopted;
  const lines = [
    "Vysvětli mi stručně a neutrálně česky, o čem bylo toto hlasování v Evropském parlamentu:",
    "1. V 3–5 bodech shrň, co projednávaný text obsahuje nebo navrhuje (hlavní požadavky a opatření).",
    !final && desc ? "2. Vysvětli, o čem bylo toto dílčí hlasování (pozměňovací návrh, odstavec…) a co by změnilo." : null,
    `${!final && desc ? 3 : 2}. Co výsledek znamená v praxi: je text závazný, co následuje dál.`,
    `${!final && desc ? 4 : 3}. Hlavní argumenty pro i proti, jak je uváděly frakce nebo rozprava. Nehodnoť politiky.`,
    "",
    "Text najdeš na odkazech níže na webu Evropského parlamentu. Když odkaz nejde otevřít, vyhledej dokument podle jeho čísla na europarl.europa.eu.",
    "Čísla o hlasování ber jen z údajů níže. Co nevychází z dokumentů EP, výslovně označ jako obecný kontext.",
    "",
    `Hlasování: ${voteTitle(v)}${v.reference ? ` (dokument ${v.reference})` : ""}`,
    v.procedure?.reference ? `Procedura: ${v.procedure.reference}` : null,
    !final && desc ? `Předmět dílčího hlasování: ${desc}` : null,
    `Datum: ${v.date}${kind ? `, typ: ${KIND_LABEL[kind] || kind}` : ""}`,
    `Výsledek: ${resultText({ ...v, vote_kind: kind })} (${c.for} pro, ${c.against} proti, ${c.abstention} se zdrželo)`,
    KIND_NOTE[kind] ? KIND_NOTE[kind] : null,
    doc ? `Text dokumentu: ${doc}` : null,
    ta ? `Přijatý text: ${ta}` : null,
    v.procedure?.reference ? `Legislativní observatoř: https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference=${encodeURIComponent(v.procedure.reference)}` : null,
    `Údaje o hlasování: ${v.source_url}`,
  ];
  return lines.filter((x) => x !== null).join("\n");
}

export function askAiBox(ctx) {
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

// Tlačítko „Stáhnout CSV“; rows = pole polí (první řádek = záhlaví). Oddělovač středník kvůli českému Excelu.
export function csvButton(filename, rowsFn, label = "Stáhnout CSV") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "csv-btn";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    const cell = (x) => {
      let s = x === null || x === undefined ? "" : String(x);
      // text ze zdroje začínající =, +, -, @ by Excel spustil jako vzorec (audit B5); čísla zůstanou čísly
      if (typeof x === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
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
export function csvShare(pair) {
  const v = pct(pair);
  return v === null ? "" : v.toFixed(4).replace(".", ",");
}

// --- přepínač režimu a pohyb ---------------------------------------------------

export const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function setupThemeToggle() {
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
export function runCounter(el) {
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
export function runDonut(el) {
  const len = Number(el.dataset.dash), v = Number(el.dataset.value);
  requestAnimationFrame(() => { el.style.strokeDashoffset = String(len * (1 - v)); });
}

// Prvky .reveal, [data-count] a .donut se při vjetí do obrazu animují.
// MutationObserver zachytí i obsah, který stránka vykreslí až po načtení dat.
export const motion = (() => {
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

// --- tlačítko ⓘ s vysvětlením (S1) --------------------------------------------------------------
// Vysvětlivky, definice a metodika jsou o jedno kliknutí dál: nativní popover (top layer), jinak fallback.
export let infoSeq = 0;

export function infoButton(html, label = "Jak to číst, definice a zdroj") {
  const id = `info-${++infoSeq}-${Math.random().toString(36).slice(2, 6)}`;
  return `<span class="info-wrap"><button type="button" class="info-btn" popovertarget="${id}" aria-label="${esc(label)}" aria-expanded="false">ⓘ</button>`
    + `<div popover id="${id}" class="info-pop" role="note">${html}</div></span>`;
}

// Jednořádková poznámka s ⓘ: krátký text vidět, zbytek (definice, metodika, zdroje) po kliknutí.
export function noteLine(short, long, cls = "small muted") {
  return `<div class="${cls}">${short}${long ? infoButton(`<p>${long}</p>`) : ""}</div>`;
}

export const HAS_POPOVER = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;

export function placeInfo(pop, btn) {
  const r = btn.getBoundingClientRect();
  const w = Math.min(pop.offsetWidth || 420, window.innerWidth - 16);
  pop.style.inset = "auto";
  pop.style.margin = "0";
  pop.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - w - 8)}px`;
  const below = r.bottom + 6;
  pop.style.top = `${below + pop.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - 6 - pop.offsetHeight) : below}px`;
}

export function infoPopFor(btn) { return document.getElementById(btn.getAttribute("popovertarget")); }

// Štítek „Týká se Česka“, jen když to uvádí zdroj (topics.geo s kódem CZE). Dvojče cz_geo_tag v build_pages.py.
export function czGeoTag(v) {
  return (v?.topics?.geo || []).some((g) => g.code === "CZE")
    ? '<span class="tag cz-geo" title="Zdroj (HowTheyVote.eu) uvádí u hlasování geografické téma Česko">Týká se Česka</span>' : "";
}

export function fillCountdowns(root = document) {
  root.querySelectorAll(".ns-when[data-from]").forEach((el) => {
    const out = el.querySelector(".ns-count");
    if (out) out.textContent = ` · ${sessionCountdown(el.dataset.from, el.dataset.to)}`;
  });
}

export async function staleNotice() {
  const main = document.getElementById("main");
  if (!main) return;
  let fresh;
  try { fresh = await getJSON("freshness.json"); } catch (e) { return; }
  if (!isStale(fresh)) return;
  const p = document.createElement("p");
  p.className = "stale-note";
  p.setAttribute("role", "status");
  p.innerHTML = `Data mohou být neaktuální: poslední export hlasování je z ${fmtDate(fresh.release)} a od té doby už zasedal
    Evropský parlament. Nová data přibudou po zveřejnění na <a href="${HTV_SOURCE}">HowTheyVote.eu</a>
    (<a href="${ROOT}o-projektu#zdroje">jak to funguje</a>).`;
  main.prepend(p);
}

// Tabulka delegací pro srovnání; rows = [{ label, get: (country) => text }].
export function delegationTable(dl, columns) {
  const order = [dl.own, ...dl.peers];
  return `<div class="table-wrap"><table class="compact cards"><thead><tr><th>Delegace</th><th class="num">Poslanců</th>${columns.map((c) => `<th class="num">${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${order.map((code) => `<tr${code === dl.own ? ' class="own-row"' : ""}><td>${esc(COUNTRY_CS[code] || code)}</td><td class="num" data-label="Poslanců">${fmtNum(dl.countries[code].seats)}</td>
      ${columns.map((c) => `<td class="num" data-label="${esc(c.label)}">${c.get(dl.countries[code])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

// Tlačítko „Sdílet“ (otevře panel ze share.js); stejný kód jako SHARE_BUTTON v build_pages.py, hlídá test.
export const SHARE_BTN_HTML = '<button type="button" class="share-btn" data-share aria-haspopup="dialog"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg><span>Sdílet</span></button>';

// Tlačítko do hlavičky stránky (stejný kód jako share_button() v build_pages.py, hlídá test).
// Varianta „view“: obrys, „Sdílet pohled“ (přehledy), kind se předá do shareContext.
export function shareButton(kind = "", label = "") {
  if (!kind && !label) return SHARE_BTN_HTML;
  return SHARE_BTN_HTML.replace('class="share-btn"', `class="share-btn${kind === "view" ? " outline" : ""}"`)
    .replace("data-share", `data-share="${esc(kind)}"`).replace("<span>Sdílet</span>", `<span>${esc(label || "Sdílet")}</span>`);
}

export const SHARE_KEYS = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];

// Řádky stran pro kartu z czPartyRows() (lib/ui.js); zrcadlo card_parties() v scripts/vote_parties.py.
// Když by se strany nevešly (víc než 12), sloučí se jednočlenné do „ostatní“.
export function shareCardParties(rows, maxRows = 12) {
  let items = rows.map((r) => ({ label: r.label, groups: r.groups, positions: SHARE_KEYS.flatMap((k) => r.members[k].map(() => k)), total: r.total }));
  if (items.length > maxRows) {
    const keep = items.filter((i) => i.total > 1), rest = items.filter((i) => i.total === 1);
    while (keep.length >= maxRows && keep.length) rest.unshift(keep.pop());
    keep.push({ label: "ostatní", groups: rest.map((i) => i.label).sort((a, b) => a.localeCompare(b, "cs")),
      positions: rest.flatMap((i) => i.positions).sort((a, b) => SHARE_KEYS.indexOf(a) - SHARE_KEYS.indexOf(b)), total: rest.reduce((n, i) => n + i.total, 0) });
    items = keep;
  }
  return items;
}

// Blok „Co znamenal hlas“ (stejné HTML jako vote_meaning_html ve scripts/web_ui.py): o čem se hlasovalo, význam PRO a PROTI.
export function voteMeaningHtml(kind) {
  const m = VOTE_MEANING[kind];
  if (!m) return "";
  const [about, yes, no] = m;
  return '<section class="card vote-meaning" aria-labelledby="vm-h"><h2 id="vm-h">Co znamenal hlas</h2>' +
    `<p>${esc(about)}</p><ul class="plain vm-list">` +
    `<li><span class="pos pos-FOR">PRO</span> = ${esc(yes)}</li><li><span class="pos pos-AGAINST">PROTI</span> = ${esc(no)}</li></ul>` +
    '<p class="small muted">Zdržet se = ani pro, ani proti. Vysvětlení plyne z typu hlasování, který určuje pevná tabulka pravidel ' +
    `(<a href="${ROOT}o-projektu#metodika">jak typ určujeme</a>).</p></section>`;
}
