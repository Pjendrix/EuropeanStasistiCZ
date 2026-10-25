// Úvodní stránka: dvě čísla, tři vstupy, česká delegace ve frakcích, rozdělená hlasování a karty poslanců.
import { getJSON, loadCategories, param, soft } from "./lib/data.js";
import { CZ_GROUP_LABEL, HTV_SOURCE, NO_PARTY_NOTE, SHORT_MANDATE_NOTE, byGender, czCountsText, debounce, displayName, esc, fmtDate, fmtNum, fmtPct, groupColor, isActive, matchesAll, norm, pct, searchTerms, voteTitle } from "./lib/format.js";
import { avatar, benchFor, benchRow, catChip, csvButton, csvShare, entityCell, groupBench, infoButton, kindTag, logoTile, mepUrl, partyBadge, partyUrl, pctCell, resultHtml, setNav, showError, sortable, sourceLine } from "./lib/ui.js";

setNav("meps");

// Pořadí frakcí v půlkruhu zleva doprava (jak sedí v EP), kód HowTheyVote.
const GROUP_ORDER = ["GUE_NGL", "SD", "GREEN_EFA", "RENEW", "EPP", "ECR", "PFE", "ESN", "NI"];
const NI_NOTE = "nezařazení nemají frakci, nepočítá se";

function kpiBlock(label, count, opts, note) {
  const { decimals = 0, suffix = "" } = opts || {};
  return `<div class="kpi"><div class="k-label">${label}</div>
    <div class="k-value" data-count="${count}" data-decimals="${decimals}" data-suffix="${esc(suffix)}">0</div>
    <div class="k-note">${note}</div></div>`;
}

// Jen dvě čísla; „Češi jednotně“ a „Rozhodly české hlasy“ jsou v Analýzách.
function renderKpis(ov, bench) {
  const active = ov.meps.filter(isActive);
  const att = active.reduce((a, m) => [a[0] + m.total.attendance[0], a[1] + m.total.attendance[1]], [0, 0]);
  const med = bench?.ep?.attendance;
  document.getElementById("kpis").innerHTML = [
    kpiBlock("Jmenovitých hlasování", ov.votes_total, {}, `od ${fmtDate(ov.period.from)} · <a href="votes">seznam hlasování</a>`),
    kpiBlock("Účast delegace na hlasování", Math.round((att[0] / att[1]) * 1000) / 10, { decimals: 1, suffix: " %" },
      `${fmtNum(att[0])} z ${fmtNum(att[1])} hlasů současných poslanců` +
      (med != null ? ` · medián celého EP ${fmtPct(med)}` : "")),
  ].join("");
  document.getElementById("hero-eyebrow").textContent = `10. volební období · data k ${fmtDate(ov.period.to)}`;
}

function htvCode(m, groups) {
  return (groups.find((g) => g.ep_code === m.group?.code) || {}).code || m.group?.code || "NI";
}

function groupName(code, groups) {
  const g = groups.find((x) => x.code === code);
  return g ? (CZ_GROUP_LABEL[code] || g.short_label) : code;
}

// Půlkruh: frakce zleva doprava, mezi bloky frakcí mezera, nad blokem zkratka (barva není jediné vodítko).
// Strany ve vybrané frakci: zkratka, celý název (když ho zdroj má), odkaz na oficiální web a jména poslanců.
// Web strany = adresa, ze které pochází její logo (parties.json → logo_source, ručně ověřený oficiální zdroj); jiné popisy neuvádíme.
function partyWeb(p) {
  const m = /https?:\/\/[^\s/)]+/.exec(p?.logo_source || "");
  return m ? m[0] : null;
}
function partyLines(members, parties) {
  const by = {};
  members.forEach((m) => { const k = m.party?.id ?? "none"; (by[k] = by[k] || []).push(m); });
  return `<ul class="party-lines">${Object.values(by).sort((a, b) => b.length - a.length || displayName(a[0]).localeCompare(displayName(b[0]), "cs")).map((ms) => {
    const p = parties.find((x) => String(x.id) === String(ms[0].party?.id));
    const label = p && !p.independent ? p.short_label : "bez strany";
    const full = p && !p.independent && p.name && p.name !== p.short_label && !/czechia/i.test(p.name) ? p.name : "";
    const web = p && !p.independent ? partyWeb(p) : null;
    return `<li><span class="party-name"><span class="dot" style="background:${groupColor(p)}"></span><strong>${esc(label)}</strong>${full ? ` <span class="muted">${esc(full)}</span>` : ""}${web ? ` · <a class="ext" href="${esc(web)}" rel="noopener">oficiální web</a>` : ""}</span>
      <span class="party-members">${ms.map((m) => `<a href="${mepUrl(m.id)}">${esc(displayName(m))}</a>`).join(", ")}</span></li>`;
  }).join("")}</ul>`;
}

// Hlavička vybrané frakce: stejný věcný řádek u všech (zkratka, celý název, počet Čechů, oficiální web), bez popisů a hodnocení.
function groupHead(code, count, groups, groupWeb) {
  const g = groups.find((x) => x.code === code);
  const web = groupWeb?.groups?.[code]?.web;
  const full = code === "NI" ? "poslanci, kteří nepatří do žádné politické skupiny" : (g?.name_cs || "");
  return `<div class="group-head-line"><strong>${esc(groupName(code, groups))}</strong>${full ? ` <span class="muted">${esc(full)}</span>` : ""}
    · ${count} ${count === 1 ? "český poslanec" : count < 5 ? "čeští poslanci" : "českých poslanců"}${web ? ` · <a class="ext" href="${esc(web)}" rel="noopener">oficiální web</a>` : ""}</div>`;
}

function renderDelegation(ov, groups, parties, groupWeb) {
  const active = ov.meps.filter(isActive);
  const people = active
    .map((m) => ({ m, code: htvCode(m, groups) }))
    .sort((a, b) => (GROUP_ORDER.indexOf(a.code) - GROUP_ORDER.indexOf(b.code)) ||
      (a.m.sort_label || a.m.name).localeCompare(b.m.sort_label || b.m.name, "cs"));
  const byCode = {};
  people.forEach((p) => { (byCode[p.code] = byCode[p.code] || []).push(p.m); });
  const codes = GROUP_ORDER.filter((c) => byCode[c]);
  // Klasický diagram parlamentu: dvě řady, počet míst v řadě úměrný poloměru (stejné rozestupy),
  // všechna místa obsazená (žádné prázdné mezery, takže tvar je vždy souměrný). Místa se seřadí podle úhlu
  // zleva doprava a frakce je dostanou postupně, takže každá frakce tvoří souvislý klín.
  const sequence = codes.flatMap((c) => byCode[c].map((m) => ({ m, code: c })));
  const n = people.length;
  const RADII = [96, 150];
  const inner = Math.max(1, Math.round(n * RADII[0] / (RADII[0] + RADII[1])));
  const slots = [];
  [[inner, RADII[0]], [n - inner, RADII[1]]].forEach(([k, r]) => {
    for (let i = 0; i < k; i++) {
      const a = Math.PI - (k === 1 ? 0.5 : i / (k - 1)) * Math.PI;
      slots.push({ a, r, x: 200 + r * Math.cos(a), y: 196 - r * Math.sin(a) });
    }
  });
  // Shodný úhel (krajní místa obou řad): vlevo nejdřív vnější, vpravo nejdřív vnitřní řada, aby byl obraz zrcadlový.
  slots.sort((s1, s2) => (s2.a - s1.a) || (s1.a > Math.PI / 2 ? s2.r - s1.r : s1.r - s2.r));
  const gcolor = (code) => groupColor(groups.find((x) => x.code === code));
  const angles = {};
  const seats = sequence.map((p, i) => {
    (angles[p.code] = angles[p.code] || []).push(slots[i]);
    return `<a class="seat" tabindex="-1" href="${mepUrl(p.m.id)}" data-code="${p.code}"
      style="left:${(slots[i].x / 400 * 100).toFixed(2)}%;top:${(slots[i].y / 222 * 100).toFixed(2)}%;background:${gcolor(p.code)}"
      title="${esc(displayName(p.m))} · ${esc(groupName(p.code, groups))}" aria-label="${esc(displayName(p.m))}, ${esc(groupName(p.code, groups))}"></a>`;
  }).join("");
  const labels = codes.map((c) => {
    const mean = (f) => angles[c].reduce((t, sl) => t + f(sl), 0) / angles[c].length;
    const a = mean((sl) => sl.a);
    // Popisek od oblouku ven (vlevo zarovnaný doprava, vpravo doleva); u frakcí dole u základny pod místy,
    // aby nepřetékal z obrázku.
    const low = Math.sin(a) < 0.12;
    const x = low ? mean((sl) => sl.x) : 200 + 166 * Math.cos(a), y = low ? 216 : 196 - 166 * Math.sin(a);
    const tx = low ? -50 : (-50 + 50 * Math.cos(a)).toFixed(0);
    const g = groups.find((x) => x.code === c);
    return `<span class="hemi-label" aria-hidden="true" style="left:${(x / 400 * 100).toFixed(2)}%;top:${(y / 222 * 100).toFixed(2)}%;transform:translate(${tx}%,-50%)">${esc(c === "NI" ? "NI" : (g?.short_label || c))}</span>`;
  }).join("");
  const hemi = document.getElementById("hemi");
  hemi.innerHTML = seats + labels +
    `<div class="hemi-center"><div class="n" id="hemi-n">${n}</div><div class="small muted" id="hemi-label">křesel</div></div>`;
  document.getElementById("del-count").textContent = `${n} křesel`;

  const chips = document.getElementById("group-chips");
  chips.innerHTML = codes.map((c) => `<button type="button" class="group-chip" data-code="${c}" aria-pressed="false">
      ${logoTile(groups.find((x) => x.code === c), 22) || `<span class="dot" style="background:${gcolor(c)}"></span>`}${esc(groupName(c, groups))} <strong>${byCode[c].length}</strong></button>`).join("");

  const focus = (code) => {
    hemi.querySelectorAll(".seat").forEach((s) => {
      s.classList.toggle("dim", Boolean(code) && s.dataset.code !== code);
      s.classList.toggle("hi", s.dataset.code === code);
    });
    chips.querySelectorAll(".group-chip").forEach((c) => {
      c.classList.toggle("on", c.dataset.code === code);
      c.setAttribute("aria-pressed", String(c.dataset.code === code));
    });
    document.getElementById("hemi-n").textContent = code ? byCode[code].length : n;
    document.getElementById("hemi-label").textContent = code ? groupName(code, groups) : "křesel";
    document.getElementById("hemi-names").innerHTML = code
      ? groupHead(code, byCode[code].length, groups, groupWeb) + partyLines(byCode[code], parties)
      : `Česká delegace má ${n} poslanců v ${codes.length} frakcích Evropského parlamentu. Vyberte frakci pro jména.`;
  };
  // Výběr frakce kliknutím (funguje dotykem i klávesnicí); najetí myší je jen bonus.
  let selected = null;
  chips.querySelectorAll(".group-chip").forEach((el) => {
    el.addEventListener("click", () => { selected = selected === el.dataset.code ? null : el.dataset.code; focus(selected); });
    el.addEventListener("mouseenter", () => focus(el.dataset.code));
    el.addEventListener("mouseleave", () => focus(selected));
  });
  hemi.querySelectorAll(".seat").forEach((el) => {
    el.addEventListener("mouseenter", () => focus(el.dataset.code));
    el.addEventListener("mouseleave", () => focus(selected));
  });
  focus(null);
}

function renderSession(session) {
  document.getElementById("ses-when").textContent = `${fmtDate(session.from)} – ${fmtDate(session.to)}`;
  const onlyFinal = session.top_splits_main.length > 0;
  const list = onlyFinal ? session.top_splits_main : session.top_splits;
  const u = session.unity;
  const intro = document.getElementById("ses-intro");
  if (intro && u && u.considered) {
    intro.textContent = `Na posledním zasedání hlasovali Češi jednotně v ${fmtNum(u.united)} z ${fmtNum(u.considered)} hlasování, ` +
      `výrazně rozdělení (menšina aspoň 30 %) byli ${fmtNum(u.strong_split)}×. Níže hlasování s největším rozdělením` +
      (onlyFinal ? " mezi závěrečnými." : ".");
  }
  const keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];
  const total = (cz) => cz.reduce((a, b) => a + b, 0) || 1;
  document.getElementById("ses-list").innerHTML = list.length ? list.map((v) => `
    <a class="vrow" href="vote?id=${v.id}&m=${v.month}">
      <div class="vrow-head"><span class="vrow-title">${catChip(v)}${onlyFinal ? "" : kindTag(v)}${esc(voteTitle(v))}</span>
        ${resultHtml(v)}</div>
      <div class="split grow" role="img" aria-label="${v.cz[0]} pro, ${v.cz[1]} proti, ${v.cz[2]} se zdrželo, ${v.cz[3]} nehlasovalo">
        ${keys.map((k, i) => `<span class="s-${k}" style="width:${(v.cz[i] / total(v.cz)) * 100}%"></span>`).join("")}</div>
      <span class="tip">${czCountsText(v.cz)}</span>
    </a>`).join("") : '<p class="muted">Na posledním zasedání hlasovali Češi jednotně.</p>';
  document.getElementById("ses-source").innerHTML =
    `Zdroj: <a href="${HTV_SOURCE}">HowTheyVote.eu</a> (export ${esc(session.sources.votes?.release || "")}) ·
     <a href="rozkol?v=last_session">všechna rozdělená hlasování zasedání (${fmtNum(session.split_count)})</a>`;
}

// Karta poslance: účast na hlasování vůči mediánu EP, hlasování s frakcí vůči mediánu vlastní frakce (U2).
function mepCard({ m, s, g, p, active }, groups, parties, benchAll) {
  const bench = benchFor(benchAll, m);
  const gObj = groups.find((x) => x.ep_code === g?.code);
  const pObj = parties.find((x) => String(x.id) === String(p?.id));
  const isNI = (gObj?.code || g?.code) === "NI";
  const gb = groupBench(bench, groups, g?.code);
  const partyText = p ? (pObj?.independent || p.short_label === "Ind." ? byGender(m, "nezávislý", "nezávislá") : esc(p.short_label)) : "strana neuvedena";
  return `<a class="mep-card reveal ${active ? "" : "former"}" href="${mepUrl(m.id)}" style="--g:${groupColor(gObj)}">
    <div class="mep-card-head">
      ${avatar(m, 48)}
      <div style="min-width:0"><div class="name">${esc(displayName(m))}</div>
        <div class="sub"><span class="dot"></span>${gObj ? esc(CZ_GROUP_LABEL[gObj.code] || gObj.short_label) : esc(g?.short_label || "bez frakce")} ·
          ${partyText}${active ? "" : ` · do ${fmtDate(m.mandates[m.mandates.length - 1].end)}`}</div></div>
      ${logoTile(pObj, 28)}
    </div>
    ${m.short_mandate ? `<p class="small note" style="margin:0 0 .4rem">${esc(SHORT_MANDATE_NOTE)}</p>` : ""}
    ${benchRow("Účast na hlasování", s.attendance, bench?.ep?.attendance ?? null, "medián EP")}
    ${benchRow("Hlasuje s frakcí", s.group_loyalty, isNI ? null : (gb?.group_loyalty ?? null), "medián frakce",
      { naText: isNI ? NI_NOTE : "nepočítá se" })}
  </a>`;
}

// Výchozí zobrazení po frakcích (pořadí jako v půlkruhu); nadpis = logo, název, počet, medián frakce v hlasování s frakcí.
function groupedCards(list, groups, parties, bench) {
  const by = {};
  list.forEach((r) => { (by[htvCode(r.m, groups)] = by[htvCode(r.m, groups)] || []).push(r); });
  const order = [...GROUP_ORDER, ...Object.keys(by).filter((c) => !GROUP_ORDER.includes(c))];
  return order.filter((c) => by[c]).map((c) => {
    const g = groups.find((x) => x.code === c);
    const med = c === "NI" ? null : bench?.groups?.[c]?.group_loyalty;
    const rows = by[c].sort((a, b) => (a.m.sort_label || a.m.name).localeCompare(b.m.sort_label || b.m.name, "cs"));
    return `<section class="group-block" aria-label="${esc(g?.name_cs || groupName(c, groups))}">
      <h3 class="group-head">${logoTile(g, 24) || `<span class="dot" style="background:${groupColor(g)}"></span>`}
        <span>${esc(g?.name_cs || groupName(c, groups))}</span>
        <span class="small muted">${rows.length} ${rows.length === 1 ? "poslanec" : rows.length < 5 ? "poslanci" : "poslanců"}${med != null ? ` · medián frakce v hlasování s frakcí v celém EP ${fmtPct(med)}` : ""}</span></h3>
      <div class="mep-grid">${rows.map((r) => mepCard(r, groups, parties, bench)).join("")}</div></section>`;
  }).join("");
}

(async () => {
  const cards = document.getElementById("cards");
  try {
    const [ov, groups, parties] = await Promise.all([getJSON("overview.json"), getJSON("groups.json"), getJSON("parties.json")]);
    // benchmarks.json vzniká při týdenní aktualizaci; bez něj se karty ukážou bez mediánů.
    const bench = await getJSON("benchmarks.json").catch(soft(null));
    if (!bench) document.getElementById("bench-key").hidden = true;
    renderKpis(ov, bench);
    Promise.all([getJSON("session.json"), loadCategories()]).then(([session]) => {
      renderSession(session);
    }).catch((e) => showError(document.getElementById("ses-list"), e));
    renderDelegation(ov, groups, parties, await getJSON("group_web.json").catch(soft(null)));

    document.getElementById("source").innerHTML = sourceLine(ov) +
      (bench ? infoButton(`<p>Mediány: ${esc(bench.definition || "")}</p><p>Weby frakcí: Wikidata (CC0), vlastnost „oficiální web“. Weby stran: adresa, ze které pochází jejich logo.</p>`, "Definice mediánů a zdroje webů") : "");
    document.getElementById("source").before(csvButton("poslanci.csv", () => [
      ["id", "poslanec", "frakce", "strana", "v_mandatu", "ucast_na_hlasovani", "hlasovani_v_dobe_mandatu", "ucast_zaverecna", "hlasuje_s_frakci", "shoda_s_cechy"],
      ...ov.meps.map((m) => [m.id, displayName(m), m.group?.short_label || "", m.party?.short_label || "", isActive(m) ? "ano" : "ne",
        csvShare(m.total.attendance), m.total.attendance[1], csvShare(m.total.attendance_main), csvShare(m.total.group_loyalty), csvShare(m.total.cz_agreement)]),
    ], "Stáhnout poslance (CSV)"));
    document.getElementById("period").textContent =
      `${fmtNum(ov.votes_total)} jmenovitých hlasování, ${fmtDate(ov.period.from)} – ${fmtDate(ov.period.to)}`;

    const rows = ov.meps.map((m) => ({ m, s: m.total, g: m.group, p: m.party, active: isActive(m) }));
    const former = document.getElementById("former");
    const q = document.getElementById("q");
    if (param("q")) q.value = param("q");   // hledání z úvodní stránky bez JavaScriptu (form action=poslanci)
    const asTable = document.getElementById("as-table");
    const tableWrap = document.getElementById("table-wrap");
    const tbody = document.querySelector("#meps tbody");
    const sortSelect = document.getElementById("sort-select");
    const visible = () => {
      const terms = searchTerms(q.value);
      return rows.filter((r) => (former.checked || r.active) &&
        matchesAll(r.hay ??= norm([displayName(r.m), r.m.name, r.p?.short_label, r.g?.short_label].join(" ")), terms));
    };
    const columns = {
      name: (r) => r.m.sort_label || r.m.name,
      group: (r) => r.g?.short_label || "",
      party: (r) => r.p?.short_label || "",
      attendance: (r) => pct(r.s.attendance),
      attendance_main: (r) => pct(r.s.attendance_main),
      group_loyalty: (r) => pct(r.s.group_loyalty),
      cz_agreement: (r) => pct(r.s.cz_agreement),
    };
    const render = (list) => {
      cards.innerHTML = (sortSelect.value === "groups"
        ? groupedCards(list, groups, parties, bench)
        : `<div class="mep-grid">${list.map((r) => mepCard(r, groups, parties, bench)).join("")}</div>`) ||
        "";
      if (!list.length) cards.innerHTML = `<div class="empty-state"><p><strong>Nikoho jsme nenašli.</strong> Zkuste jen část jména nebo zkratku strany${former.checked ? "" : ", případně zahrňte i bývalé poslance"}.</p>
        <button type="button" class="more-btn" data-clear-search>Zrušit hledání</button></div>`;
      // Referenční řádek „medián EP“ (V5): řazení podle čísla nesmí vypadat jako žebříček bez kontextu; neřadí se.
      const ep = bench?.ep;
      const med = (x) => (typeof x === "number" ? fmtPct(x) : "–");
      const ref = ep ? `<tr class="ref-row"><td class="sticky-col"><b>Medián EP</b><div class="small muted">všichni poslanci EP, celé období</div></td>
        <td>–</td><td>–</td><td class="num">${med(ep.attendance)}</td><td class="num">${med(ep.attendance_main)}</td><td class="num">${med(ep.group_loyalty)}</td><td class="num">–</td></tr>` : "";
      tbody.innerHTML = ref + list.map(({ m, s, g, p, active }) => {
        const isNI = htvCode(m, groups) === "NI";
        return `<tr class="${active ? "" : "former"}">
          <td class="sticky-col"><div class="mep-cell">${avatar(m, 40)}
            <div><a href="${mepUrl(m.id)}">${esc(displayName(m))}</a></div></div></td>
          <td>${(() => { const go = groups.find((x) => x.ep_code === g?.code);
            return entityCell(go || { code: g?.code }, { name: go ? (CZ_GROUP_LABEL[go.code] || go.short_label) : (g?.short_label || "bez frakce"), size: 22, slot: "sm" }); })()}</td>
          <td>${(() => { const po = p ? parties.find((x) => String(x.id) === String(p.id)) : null;
            if (!p) return `<span class="badge outline" title="${esc(NO_PARTY_NOTE)}">neuvedeno</span>`;
            if (po?.independent) return `<div class="entity-cell"><span class="logo-slot sm"></span>${partyBadge(p.id, p.short_label, parties, m)}</div>`;
            return entityCell(po || {}, { name: p.short_label, href: po ? partyUrl(po.id) : "", size: 22, slot: "sm" }); })()}</td>
          <td>${benchRow("Účast na hlasování", s.attendance, benchFor(bench, m)?.ep?.attendance ?? null, "medián EP", { compact: true })}</td>
          <td class="num">${pctCell(s.attendance_main)}</td>
          <td>${benchRow("Hlasuje s frakcí", s.group_loyalty, isNI ? null : (groupBench(benchFor(bench, m), groups, g?.code)?.group_loyalty ?? null), "medián frakce",
            { compact: true, naText: isNI ? NI_NOTE : "nepočítá se" })}</td>
          <td class="num">${pctCell(s.cz_agreement)}</td>
        </tr>`;
      }).join("");
    };
    // Výchozí zobrazení po frakcích, ne žebříček.
    const table = sortable(document.getElementById("meps"), columns, visible, render, { key: "name", dir: 1 });
    sortSelect.addEventListener("change", () => {
      if (sortSelect.value === "groups") table.set("name", 1);
      else {
        const [key, dir] = sortSelect.value.split(":");
        table.set(key, Number(dir));
      }
    });
    former.addEventListener("change", () => table.refresh());
    q.addEventListener("input", debounce(() => table.refresh(), 150));
    cards.addEventListener("click", (ev) => {
      if (!ev.target.closest("[data-clear-search]")) return;
      q.value = "";
      table.refresh();
      q.focus();
    });
    asTable.addEventListener("change", () => {
      tableWrap.hidden = !asTable.checked;
      cards.hidden = asTable.checked;
    });
  } catch (e) {
    showError(cards, e);
  }
})();
