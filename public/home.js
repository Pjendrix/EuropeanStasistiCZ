// Úvodní stránka: dvě čísla, tři vstupy, česká delegace ve frakcích, rozdělená hlasování a karty poslanců.
"use strict";

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
    kpiBlock("Jmenovitých hlasování", ov.votes_total, {}, `od ${fmtDate(ov.period.from)} · <a href="votes.html">seznam hlasování</a>`),
    kpiBlock("Docházka delegace", Math.round((att[0] / att[1]) * 1000) / 10, { decimals: 1, suffix: " %" },
      `${fmtNum(att[0])} z ${fmtNum(att[1])} hlasů současných poslanců` +
      (med != null ? ` · medián celého EP ${fmtPct(med)}` : "")),
  ].join("");
  document.getElementById("hero-eyebrow").textContent = `10. volební období · data k ${fmtDate(ov.period.to)}`;
}

// Tři vstupy pod čísly: poslanec, co se naposledy odhlasovalo, témata.
function renderEntries(ov, session) {
  const el = document.getElementById("entries");
  if (!el) return;
  const topics = (ov.topics || []).slice(0, 6);
  el.innerHTML = `
    <a class="entry" href="#poslanci"><strong>Najít poslance</strong><span>${fmtNum(ov.meps.filter(isActive).length)} poslanců v mandátu, docházka a hlasování</span></a>
    <a class="entry" href="votes.html?m=${esc((session.to || "").slice(0, 7))}&f=final&od=${esc(session.from || "")}"><strong>Co se naposledy odhlasovalo</strong>
      <span>závěrečná hlasování ze zasedání ${fmtDate(session.from)} – ${fmtDate(session.to)}</span></a>
    <div class="entry"><strong>Témata</strong>
      <span class="entry-topics">${topics.map((t) => `<a href="votes.html?t=${esc(t.code)}&f=final">${esc(t.label_cs || t.label || t.code)}</a>`).join("") || "připravuje se"}</span></div>`;
}

function htvCode(m, groups) {
  return (groups.find((g) => g.ep_code === m.group?.code) || {}).code || m.group?.code || "NI";
}

function groupName(code, groups) {
  const g = groups.find((x) => x.code === code);
  return g ? (CZ_GROUP_LABEL[code] || g.short_label) : code;
}

// Půlkruh: frakce zleva doprava, mezi bloky frakcí mezera, nad blokem zkratka (barva není jediné vodítko).
function renderDelegation(ov, groups) {
  const active = ov.meps.filter(isActive);
  const people = active
    .map((m) => ({ m, code: htvCode(m, groups) }))
    .sort((a, b) => (GROUP_ORDER.indexOf(a.code) - GROUP_ORDER.indexOf(b.code)) ||
      (a.m.sort_label || a.m.name).localeCompare(b.m.sort_label || b.m.name, "cs"));
  const byCode = {};
  people.forEach((p) => { (byCode[p.code] = byCode[p.code] || []).push(p.m); });
  const codes = GROUP_ORDER.filter((c) => byCode[c]);
  // Pořadí míst: poslanci, mezi frakcemi jedno prázdné místo.
  const sequence = [];
  codes.forEach((c, i) => {
    if (i) sequence.push(null);
    byCode[c].forEach((m) => sequence.push({ m, code: c }));
  });
  const n = people.length;
  const total = sequence.length;
  const inner = Math.round(total * 0.38);
  const slots = [];
  [[inner, 92], [total - inner, 150]].forEach(([k, r]) => {
    for (let i = 0; i < k; i++) {
      const a = Math.PI - (k === 1 ? 0.5 : i / (k - 1)) * Math.PI;
      slots.push({ a, x: 200 + r * Math.cos(a), y: 196 - r * Math.sin(a) });
    }
  });
  slots.sort((s1, s2) => s2.a - s1.a);
  const gcolor = (code) => groupColor(groups.find((x) => x.code === code));
  const angles = {};
  const seats = sequence.map((p, i) => {
    if (!p) return "";
    (angles[p.code] = angles[p.code] || []).push(slots[i].a);
    return `<a class="seat" tabindex="-1" href="${mepUrl(p.m.id)}" data-code="${p.code}"
      style="left:${(slots[i].x / 400 * 100).toFixed(2)}%;top:${(slots[i].y / 222 * 100).toFixed(2)}%;background:${gcolor(p.code)}"
      title="${esc(displayName(p.m))} · ${esc(groupName(p.code, groups))}" aria-label="${esc(displayName(p.m))}, ${esc(groupName(p.code, groups))}"></a>`;
  }).join("");
  const labels = codes.map((c) => {
    const a = angles[c].reduce((x, y) => x + y, 0) / angles[c].length;
    const x = 200 + 178 * Math.cos(a), y = 196 - 178 * Math.sin(a);
    const g = groups.find((x) => x.code === c);
    return `<span class="hemi-label" aria-hidden="true" style="left:${(x / 400 * 100).toFixed(2)}%;top:${(y / 222 * 100).toFixed(2)}%">${esc(c === "NI" ? "NI" : (g?.short_label || c))}</span>`;
  }).join("");
  const hemi = document.getElementById("hemi");
  hemi.innerHTML = seats + labels +
    `<div class="hemi-center"><div class="n" id="hemi-n">${n}</div><div class="small muted" id="hemi-label">křesel</div></div>`;
  document.getElementById("del-count").textContent = `${n} křesel`;

  const chips = document.getElementById("group-chips");
  chips.innerHTML = codes.map((c) => `<button type="button" class="group-chip" data-code="${c}" aria-pressed="false">
      ${logoTile(groups.find((x) => x.code === c), 18) || `<span class="dot" style="background:${gcolor(c)}"></span>`}${esc(groupName(c, groups))} <strong>${byCode[c].length}</strong></button>`).join("");

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
      ? `<strong>${esc(groupName(code, groups))}:</strong> ${byCode[code].map((m) => `<a href="${mepUrl(m.id)}">${esc(displayName(m))}</a>`).join(", ")}`
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
      `výrazně rozdělení (menšina aspoň 30 %) byli ${fmtNum(u.strong_split)}×. Níže hlasování s největším rozkolem` +
      (onlyFinal ? " mezi závěrečnými." : ".");
  }
  const keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];
  const total = (cz) => cz.reduce((a, b) => a + b, 0) || 1;
  document.getElementById("ses-list").innerHTML = list.length ? list.map((v) => `
    <a class="vrow" href="vote.html?id=${v.id}&m=${v.month}">
      <div class="vrow-head"><span class="vrow-title">${onlyFinal ? "" : kindTag(v)}${esc(voteTitle(v))}</span>
        <span class="pill-result ${v.result || ""}">${resultHtml(v)}</span></div>
      <div class="split grow" role="img" aria-label="${v.cz[0]} pro, ${v.cz[1]} proti, ${v.cz[2]} se zdrželo, ${v.cz[3]} nehlasovalo">
        ${keys.map((k, i) => `<span class="s-${k}" style="width:${(v.cz[i] / total(v.cz)) * 100}%"></span>`).join("")}</div>
      <span class="tip">${czCountsText(v.cz)}</span>
    </a>`).join("") : '<p class="muted">Na posledním zasedání hlasovali Češi jednotně.</p>';
  document.getElementById("ses-source").innerHTML =
    `Zdroj: <a href="${HTV_SOURCE}">HowTheyVote.eu</a> (export ${esc(session.sources.votes?.release || "")}) ·
     <a href="rozkol.html?v=last_session">všechna rozdělená hlasování zasedání (${fmtNum(session.split_count)})</a>`;
}

// Karta poslance: docházka vůči mediánu EP, loajalita vůči mediánu vlastní frakce (U2).
function mepCard({ m, s, g, p, active }, groups, parties, bench) {
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
    ${benchRow("Docházka", s.attendance, bench?.ep?.attendance ?? null, "medián EP")}
    ${benchRow("Loajalita k frakci", s.group_loyalty, isNI ? null : (gb?.group_loyalty ?? null), "medián frakce",
      { naText: isNI ? NI_NOTE : "nepočítá se" })}
  </a>`;
}

// Výchozí zobrazení po frakcích (pořadí jako v půlkruhu); nadpis = logo, název, počet, medián loajality frakce.
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
        <span class="small muted">${rows.length} ${rows.length === 1 ? "poslanec" : rows.length < 5 ? "poslanci" : "poslanců"}${med != null ? ` · medián loajality frakce v celém EP ${fmtPct(med)}` : ""}</span></h3>
      <div class="mep-grid">${rows.map((r) => mepCard(r, groups, parties, bench)).join("")}</div></section>`;
  }).join("");
}

(async () => {
  const cards = document.getElementById("cards");
  try {
    const [ov, groups, parties] = await Promise.all([getJSON("overview.json"), getJSON("groups.json"), getJSON("parties.json")]);
    // benchmarks.json vzniká při týdenní aktualizaci; bez něj se karty ukážou bez mediánů.
    const bench = await getJSON("benchmarks.json").catch(() => null);
    if (!bench) document.getElementById("bench-key").hidden = true;
    renderKpis(ov, bench);
    getJSON("session.json").then((session) => {
      renderEntries(ov, session);
      renderSession(session);
    }).catch((e) => showError(document.getElementById("ses-list"), e));
    renderDelegation(ov, groups);

    document.getElementById("source").innerHTML = sourceLine(ov) +
      (bench ? ` Mediány: ${esc(bench.definition || "")}` : "");
    document.getElementById("source").before(csvButton("poslanci.csv", () => [
      ["id", "poslanec", "frakce", "strana", "v_mandatu", "dochazka", "dochazka_hlasovani", "dochazka_zaverecna", "loajalita_frakce", "shoda_s_cechy"],
      ...ov.meps.map((m) => [m.id, displayName(m), m.group?.short_label || "", m.party?.short_label || "", isActive(m) ? "ano" : "ne",
        csvShare(m.total.attendance), m.total.attendance[1], csvShare(m.total.attendance_main), csvShare(m.total.group_loyalty), csvShare(m.total.cz_agreement)]),
    ], "Stáhnout poslance (CSV)"));
    document.getElementById("period").textContent =
      `${fmtNum(ov.votes_total)} jmenovitých hlasování, ${fmtDate(ov.period.from)} – ${fmtDate(ov.period.to)}`;

    const rows = ov.meps.map((m) => ({ m, s: m.total, g: m.group, p: m.party, active: isActive(m) }));
    const former = document.getElementById("former");
    const q = document.getElementById("q");
    const asTable = document.getElementById("as-table");
    const tableWrap = document.getElementById("table-wrap");
    const tbody = document.querySelector("#meps tbody");
    const sortSelect = document.getElementById("sort-select");
    const visible = () => {
      const needle = q.value.trim().toLowerCase();
      return rows.filter((r) => (former.checked || r.active) &&
        (!needle || [displayName(r.m), r.p?.short_label, r.g?.short_label].join(" ").toLowerCase().includes(needle)));
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
        '<p class="muted">Nikdo neodpovídá hledání.</p>';
      if (!list.length) cards.innerHTML = '<p class="muted">Nikdo neodpovídá hledání.</p>';
      tbody.innerHTML = list.map(({ m, s, g, p, active }) => {
        const isNI = htvCode(m, groups) === "NI";
        return `<tr class="${active ? "" : "former"}">
          <td class="sticky-col"><div class="mep-cell">${avatar(m, 40)}
            <div><a href="${mepUrl(m.id)}">${esc(displayName(m))}</a></div></div></td>
          <td>${groupBadge(null, groups, g?.code)}</td>
          <td>${p ? partyLink(p.id, p.short_label, parties, m) : `<span class="badge outline" title="${esc(NO_PARTY_NOTE)}">neuvedeno</span>`}</td>
          <td>${benchRow("Docházka", s.attendance, bench?.ep?.attendance ?? null, "medián EP", { compact: true })}</td>
          <td class="num">${pctCell(s.attendance_main)}</td>
          <td>${benchRow("Loajalita", s.group_loyalty, isNI ? null : (groupBench(bench, groups, g?.code)?.group_loyalty ?? null), "medián frakce",
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
    [former, q].forEach((el) => el.addEventListener(el === q ? "input" : "change", () => table.refresh()));
    asTable.addEventListener("change", () => {
      tableWrap.hidden = !asTable.checked;
      cards.hidden = asTable.checked;
    });
  } catch (e) {
    showError(cards, e);
  }
})();
