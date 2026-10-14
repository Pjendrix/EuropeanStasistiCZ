// Úvodní stránka: počítadla, česká delegace ve frakcích, rozdělená hlasování a karty poslanců.
"use strict";

setNav("meps");

// Pořadí frakcí v půlkruhu zleva doprava (jak sedí v EP), kód HowTheyVote.
const GROUP_ORDER = ["GUE_NGL", "SD", "GREEN_EFA", "RENEW", "EPP", "ECR", "PFE", "ESN", "NI"];
const DASH = 194.8; // obvod kruhu r=31

function kpiBlock(label, count, opts, note) {
  const { decimals = 0, suffix = "", color = "" } = opts || {};
  return `<div class="kpi"><div class="k-label">${label}</div>
    <div class="k-value" ${color ? `style="color:${color}"` : ""} data-count="${count}" data-decimals="${decimals}" data-suffix="${esc(suffix)}">0</div>
    <div class="k-note">${note}</div></div>`;
}

function renderKpis(ov, session, decisive) {
  const active = ov.meps.filter(isActive);
  const att = active.reduce((a, m) => [a[0] + m.total.attendance[0], a[1] + m.total.attendance[1]], [0, 0]);
  document.getElementById("kpis").innerHTML = [
    kpiBlock("Jmenovitých hlasování", ov.votes_total, {}, `od ${fmtDate(ov.period.from)}`),
    kpiBlock("Docházka delegace", Math.round((att[0] / att[1]) * 1000) / 10, { decimals: 1, suffix: " %" },
      `${fmtNum(att[0])} z ${fmtNum(att[1])} hlasů současných poslanců`),
    kpiBlock("Rozdělení Čechů", session.split_count, { suffix: "×", color: "#FDA4AF" },
      `na posledním zasedání (z ${fmtNum(session.votes)} hlasování)`),
    kpiBlock("Rozhodující hlasování", decisive.votes.length, { color: "#F59E0B" },
      `<a href="rozhodujici.html">bez Čechů by dopadla opačně</a>`),
  ].join("");
  document.getElementById("hero-eyebrow").textContent = `10. volební období · data k ${fmtDate(ov.period.to)}`;
}

function renderDelegation(ov, groups) {
  const active = ov.meps.filter(isActive);
  const htvCode = (m) => (groups.find((g) => g.ep_code === m.group?.code) || {}).code || m.group?.code || "NI";
  const people = active
    .map((m) => ({ m, code: htvCode(m) }))
    .sort((a, b) => (GROUP_ORDER.indexOf(a.code) - GROUP_ORDER.indexOf(b.code)) ||
      (a.m.sort_label || a.m.name).localeCompare(b.m.sort_label || b.m.name, "cs"));
  const n = people.length;
  const inner = Math.round(n * 0.38);
  const slots = [];
  [[inner, 92], [n - inner, 150]].forEach(([k, r]) => {
    for (let i = 0; i < k; i++) {
      const a = Math.PI - (k === 1 ? 0.5 : i / (k - 1)) * Math.PI;
      slots.push({ a, x: 200 + r * Math.cos(a), y: 190 - r * Math.sin(a) });
    }
  });
  slots.sort((s1, s2) => s2.a - s1.a);
  const byCode = {};
  people.forEach((p) => { (byCode[p.code] = byCode[p.code] || []).push(p.m); });
  const gname = (code) => { const g = groups.find((x) => x.code === code); return g ? (CZ_GROUP_LABEL[code] || g.short_label) : code; };
  const gcolor = (code) => groupColor(groups.find((x) => x.code === code), code);

  const hemi = document.getElementById("hemi");
  hemi.innerHTML = people.map((p, i) => `<a class="seat" href="mep.html?id=${p.m.id}" data-code="${p.code}"
      style="left:${(slots[i].x / 400 * 100).toFixed(2)}%;top:${(slots[i].y / 215 * 100).toFixed(2)}%;background:${gcolor(p.code)}"
      title="${esc(displayName(p.m))} · ${esc(gname(p.code))}" aria-label="${esc(displayName(p.m))}, ${esc(gname(p.code))}"></a>`).join("") +
    `<div class="hemi-center"><div class="n" id="hemi-n">${n}</div><div class="small muted" id="hemi-label">křesel</div></div>`;
  document.getElementById("del-count").textContent = `${n} křesel`;

  const codes = GROUP_ORDER.filter((c) => byCode[c]);
  const chips = document.getElementById("group-chips");
  chips.innerHTML = codes.map((c) => `<button type="button" class="group-chip" data-code="${c}">
      <span class="dot" style="background:${gcolor(c)}"></span>${esc(gname(c))} <strong>${byCode[c].length}</strong></button>`).join("");

  const focus = (code) => {
    hemi.querySelectorAll(".seat").forEach((s) => {
      s.classList.toggle("dim", Boolean(code) && s.dataset.code !== code);
      s.classList.toggle("hi", s.dataset.code === code);
    });
    chips.querySelectorAll(".group-chip").forEach((c) => c.classList.toggle("on", c.dataset.code === code));
    document.getElementById("hemi-n").textContent = code ? byCode[code].length : n;
    document.getElementById("hemi-label").textContent = code ? gname(code) : "křesel";
    document.getElementById("hemi-names").innerHTML = code
      ? `<strong>${esc(gname(code))}:</strong> ${byCode[code].map((m) => `<a href="mep.html?id=${m.id}">${esc(displayName(m))}</a>`).join(", ")}`
      : `Česká delegace má ${n} poslanců v ${codes.length} frakcích Evropského parlamentu. Najeďte na frakci pro jména.`;
  };
  const bind = (el) => {
    el.addEventListener("mouseenter", () => focus(el.dataset.code));
    el.addEventListener("focus", () => focus(el.dataset.code));
    el.addEventListener("mouseleave", () => focus(null));
    el.addEventListener("blur", () => focus(null));
  };
  focus(null);
  hemi.querySelectorAll(".seat").forEach(bind);
  chips.querySelectorAll(".group-chip").forEach(bind);
}

function renderSession(session) {
  document.getElementById("ses-when").textContent = `${fmtDate(session.from)} – ${fmtDate(session.to)}`;
  const list = session.top_splits_main.length ? session.top_splits_main : session.top_splits;
  const keys = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];
  const total = (cz) => cz.reduce((a, b) => a + b, 0) || 1;
  document.getElementById("ses-list").innerHTML = list.length ? list.map((v) => `
    <a class="vrow" href="vote.html?id=${v.id}&m=${v.month}">
      <div class="vrow-head"><span class="vrow-title">${v.is_main ? '<span class="tag">hlavní</span>' : ""}${esc(voteTitle(v))}</span>
        <span class="pill-result ${v.result || ""}">${RESULT_LABEL[v.result] || "neuveden"}</span></div>
      <div class="split grow" role="img" aria-label="${v.cz[0]} pro, ${v.cz[1]} proti, ${v.cz[2]} se zdrželo, ${v.cz[3]} nehlasovalo">
        ${keys.map((k, i) => `<span class="s-${k}" style="width:${(v.cz[i] / total(v.cz)) * 100}%"></span>`).join("")}</div>
      <span class="tip">${v.cz[0]} pro · ${v.cz[1]} proti · ${v.cz[2]} zdržel/a se · ${v.cz[3]} nehlasoval/a</span>
    </a>`).join("") : '<p class="muted">Na posledním zasedání hlasovali Češi jednotně.</p>';
  document.getElementById("ses-source").innerHTML =
    `Zdroj: <a href="${HTV_SOURCE}">HowTheyVote.eu</a> (export ${esc(session.sources.votes?.release || "")}) ·
     <a href="rozkol.html?v=last_session">všechna rozdělená hlasování zasedání (${fmtNum(session.split_count)})</a>`;
}

function mepCard({ m, s, g, p, active }, groups, parties) {
  const gObj = groups.find((x) => x.ep_code === g?.code);
  const ring = groupColor(gObj, g?.code);
  const att = pct(s.attendance);
  const mini = (label, pair, color) => `<div class="mini-row"><div class="top"><span>${label}</span><b>${fmtPct(pct(pair))}</b></div>
    <div class="mini-bar"><span class="grow" style="width:${(pct(pair) ?? 0) * 100}%;background:${color}"></span></div></div>`;
  return `<a class="mep-card reveal ${active ? "" : "former"}" href="mep.html?id=${m.id}" style="--ring:${ring}">
    <div class="mep-card-head">
      <img src="${photoUrl(m)}" alt="" loading="lazy">
      <div style="min-width:0"><div class="name">${esc(displayName(m))}</div>
        <div class="sub">${gObj ? esc(CZ_GROUP_LABEL[gObj.code] || gObj.short_label) : esc(g?.short_label || "bez frakce")} ·
          ${p ? esc(p.short_label) : "strana neuvedena"}${active ? "" : ` · do ${fmtDate(m.mandates[m.mandates.length - 1].end)}`}</div></div>
    </div>
    <div class="mep-card-body">
      <div class="donut" title="Docházka: ${s.attendance[0]} z ${s.attendance[1]} hlasování">
        <svg width="78" height="78" viewBox="0 0 78 78" role="img" aria-label="Docházka ${fmtPct(att)}">
          <circle class="track" cx="39" cy="39" r="31" fill="none" stroke-width="7"></circle>
          <circle class="val" cx="39" cy="39" r="31" fill="none" stroke-width="7" stroke-linecap="round"
            stroke-dasharray="${DASH}" stroke-dashoffset="${REDUCED_MOTION ? DASH * (1 - (att ?? 0)) : DASH}"
            data-dash="${DASH}" data-value="${att ?? 0}" transform="rotate(-90 39 39)"></circle>
        </svg>
        <div class="center"><b>${att === null ? "–" : Math.round(att * 100) + " %"}</b><small>docházka</small></div>
      </div>
      <div class="mini">${mini("Loajalita k frakci", s.group_loyalty, "#6366F1")}${mini("Shoda s Čechy", s.cz_agreement, "#E11D48")}</div>
    </div>
  </a>`;
}

(async () => {
  const cards = document.getElementById("cards");
  try {
    const [ov, groups, parties] = await Promise.all([getJSON("overview.json"), getJSON("groups.json"), getJSON("parties.json")]);
    Promise.all([getJSON("session.json"), getJSON("decisive.json")]).then(([session, decisive]) => {
      renderKpis(ov, session, decisive);
      renderSession(session);
    }).catch((e) => showError(document.getElementById("ses-list"), e));
    renderDelegation(ov, groups);

    document.getElementById("source").innerHTML = sourceLine(ov);
    document.getElementById("period").textContent =
      `${fmtNum(ov.votes_total)} jmenovitých hlasování, ${fmtDate(ov.period.from)} – ${fmtDate(ov.period.to)}`;

    const rows = ov.meps.map((m) => ({ m, s: m.total, g: m.group, p: m.party, active: isActive(m) }));
    const former = document.getElementById("former");
    const q = document.getElementById("q");
    const asTable = document.getElementById("as-table");
    const tableWrap = document.getElementById("table-wrap");
    const tbody = document.querySelector("#meps tbody");
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
      cards.innerHTML = list.map((r) => mepCard(r, groups, parties)).join("") ||
        '<p class="muted">Nikdo neodpovídá hledání.</p>';
      tbody.innerHTML = list.map(({ m, s, g, p, active }) => `
        <tr class="${active ? "" : "former"}">
          <td class="sticky-col"><div class="mep-cell"><img src="${photoUrl(m)}" alt="" loading="lazy">
            <div><a href="mep.html?id=${m.id}">${esc(displayName(m))}</a></div></div></td>
          <td>${groupBadge(null, groups, g?.code)}</td>
          <td>${p ? partyLink(p.id, p.short_label, parties) : `<span class="badge outline" title="${esc(NO_PARTY_NOTE)}">neuvedeno</span>`}</td>
          <td class="num">${pctCell(s.attendance)}</td><td class="num">${pctCell(s.attendance_main)}</td>
          <td class="num">${pctCell(s.group_loyalty)}</td><td class="num">${pctCell(s.cz_agreement)}</td>
        </tr>`).join("");
    };
    // Výchozí řazení abecedně, aby přehled nepůsobil jako žebříček.
    const table = sortable(document.getElementById("meps"), columns, visible, render, { key: "name", dir: 1 });
    const sortSelect = document.getElementById("sort-select");
    sortSelect.addEventListener("change", () => {
      const [key, dir] = sortSelect.value.split(":");
      table.set(key, Number(dir));
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
