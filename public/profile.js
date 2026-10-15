// Profil poslance (p/{id}.html, dříve mep.html?id=). Statická stránka má obsah v HTML (build_pages.py),
// tento skript ho nahradí plnou interaktivní verzí (graf účasti na hlasování, přepínače, seznamy).
"use strict";

setNav("meps");
const main = document.getElementById("main");

// Metrická karta: hodnota a proužek se srovnáním (benchRow), pod tím počty, definice a zdroj; citace ikonou v rohu.
// median = podíl nebo null, refLabel = „medián EP“ / „medián frakce“, extra = další řádek (např. druhý medián).
function metricCard(label, pair, detail, sourceHref, median, refLabel, cite, opts = {}) {
  // Proužek jen tam, kde je s čím srovnat (medián); jinak velké číslo.
  const head = median != null && pct(pair) !== null ? benchRow(label, pair, median, refLabel || "", opts)
    : `<div class="label">${label}</div><div class="value">${countPct(pct(pair))}</div>
       ${pct(pair) === null ? `<div class="detail">${esc(opts.naText || "nepočítá se")}</div>` : ""}`;
  return `<div class="card metric">
    ${head}
    <div class="detail">${pair && pair[1] ? `${fmtNum(pair[0])} z ${fmtNum(pair[1])} hlasování` : ""}${opts.extra ? ` · ${opts.extra}` : ""}</div>
    <div class="detail">${detail} · <a href="${sourceHref}">zdroj a metodika</a></div>
    ${cite && pair && pair[1] ? citeButton(cite) : ""}
  </div>`;
}

// Čitelná barva textu na barevném pozadí (tmavá na světlém, bílá na tmavém), podle relativní jasnosti WCAG.
function textOn(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#0F172A";
  const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#0F172A" : "#FFFFFF";
}

// Časová osa frakcí a stran (od začátku mandátu do dneška nebo konce mandátu).
function timeline(mep, groups, parties) {
  const today = new Date().toISOString().slice(0, 10);
  const start = mep.mandates[0].start;
  const lastEnd = mep.mandates[mep.mandates.length - 1].end;
  const end = lastEnd && lastEnd < today ? lastEnd : today;
  const t0 = Date.parse(start), t1 = Date.parse(end);
  const W = 1000, X0 = 90, span = Math.max(t1 - t0, 1);
  const x = (d) => X0 + ((Math.min(Math.max(Date.parse(d), t0), t1) - t0) / span) * (W - X0);
  const row = (items, y, label, colorOf, textOf) => `<text x="0" y="${y + 17}" class="tl-row">${label}</text>` +
    items.map((it) => {
      const x1 = x(it.start), x2 = x(it.end || end), w = Math.max(x2 - x1, 3);
      const txt = textOf(it);
      const fill = colorOf(it);
      return `<rect x="${x1.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="24" rx="5" fill="${fill}"><title>${esc(txt)}: ${periodText(it)}</title></rect>` +
        (w > 60 ? `<text x="${(x1 + 8).toFixed(1)}" y="${y + 17}" class="tl-seg" fill="${textOn(fill)}">${esc(txt)}</text>` : "");
    }).join("");
  const years = [];
  for (let yr = Number(start.slice(0, 4)) + 1; yr <= Number(end.slice(0, 4)); yr++) years.push(`${yr}-01-01`);
  const ticks = years.map((d) => `<line x1="${x(d)}" x2="${x(d)}" y1="0" y2="68" class="tl-tick"/><text x="${x(d) + 4}" y="84" class="tl-year">${d.slice(0, 4)}</text>`).join("");
  const gOf = (it) => groups.find((g) => g.ep_code === it.code || g.code === it.code);
  const pOf = (it) => parties.find((p) => String(p.id) === String(it.org_id));
  const desc = [...mep.groups.map((it) => `frakce ${CZ_GROUP_LABEL[gOf(it)?.code] || it.short_label} ${periodText(it)}`),
    ...mep.parties.map((it) => `strana ${it.short_label} ${periodText(it)}`)].join("; ");
  return `<svg class="timeline" viewBox="0 0 ${W} 90" role="img" aria-label="${esc(`Časová osa: ${desc}`)}">
    ${ticks}
    ${row(mep.groups, 4, "Frakce", (it) => groupColor(gOf(it)), (it) => CZ_GROUP_LABEL[gOf(it)?.code] || gOf(it)?.short_label || it.short_label)}
    ${row(mep.parties, 36, "Strana", (it) => groupColor(pOf(it)), (it) => pOf(it)?.independent ? byGender(mep, "nezávislý", "nezávislá") : it.short_label)}
    <text x="${X0}" y="84" class="tl-year">${fmtDate(start)}</text><text x="${W}" y="84" class="tl-year" text-anchor="end">${end === today ? "dnes" : fmtDate(end)}</text>
  </svg>`;
}

function monthlyChart(monthly) {
  const months = Object.keys(monthly);
  if (!months.length) return '<p class="muted">Žádná hlasování v době mandátu.</p>';
  const cols = months.map((k, i) => {
    const pair = monthly[k].attendance;
    const v = pct(pair);
    const [y, m] = k.split("-");
    const showYear = i === 0 || m === "01";
    return `<button type="button" class="col" data-month="${k}">
      <span class="bar-fill ${v === 0 ? "zero" : ""}" style="height:${v ? v * 100 : 0}%"></span>
      <span class="col-label" aria-hidden="true">${Number(m)}${showYear ? `<br><b>${y.slice(2)}</b>` : ""}</span>
      <span class="sr-only">${fmtMonth(k)}: ${fmtPct(v)}, ${pair[0]} z ${pair[1]} hlasování</span></button>`;
  }).join("");
  return `<div class="chart-wrap"><div class="chart-y"><span>100 %</span><span>50 %</span><span>0 %</span></div>
    <div class="chart" role="group" aria-label="Účast na hlasování po měsících">${cols}</div></div>
    <p class="chart-detail" aria-live="polite"></p>`;
}

// Hodnota vybraného měsíce pod grafem; klepnutí nebo najetí na sloupec ji změní (funguje i bez myši).
function bindChart(root, monthly, mep) {
  const detail = root.querySelector(".chart-detail");
  const cols = [...root.querySelectorAll(".chart .col")];
  if (!detail || !cols.length) return;
  const show = (btn) => {
    cols.forEach((c) => c.classList.toggle("active", c === btn));
    const k = btn.dataset.month;
    const a = monthly[k].attendance;
    detail.innerHTML = `<strong>${fmtMonth(k)}</strong>: ${byGender(mep, "hlasoval", "hlasovala")} v ${fmtNum(a[0])} z ${fmtNum(a[1])} hlasování
      (<strong>${fmtPct(pct(a))}</strong>)`;
  };
  cols.forEach((c) => { c.addEventListener("click", () => show(c)); c.addEventListener("mouseenter", () => show(c)); c.addEventListener("focus", () => show(c)); });
  show(cols[cols.length - 1]);
}

// Karta souladu s výsledkem: poslanec vedle průměru jeho frakce ve stejných hlasováních.
function outcomeCard(label, own, group, detail, mep) {
  return `<div class="card metric">
    <div class="label">${label}</div>
    <div class="value">${countPct(pct(own))}</div>
    <div class="detail">${own && own[1] ? `${fmtNum(own[0])} z ${fmtNum(own[1])} hlasů pro/proti` : "nepočítá se"}</div>
    <div class="detail">${group && group[1] ? `průměr ${byGender(mep, "jeho", "její")} frakce ve stejných hlasováních: <strong>${fmtPct(pct(group))}</strong>` : "průměr frakce se nepočítá (nezařazení)"}</div>
    <div class="detail">${detail} · <a href="o-projektu.html#metodika">co to znamená</a></div>
  </div>`;
}

// Hlasoval(a) tak, jak hlasování dopadlo? Jen u hlasů pro a proti a jen při výsledku přijato / zamítnuto (jinak „–“).
function sideCell(v) {
  const won = (v.position === "FOR" && v.result === "ADOPTED") || (v.position === "AGAINST" && v.result === "REJECTED");
  const lost = (v.position === "FOR" && v.result === "REJECTED") || (v.position === "AGAINST" && v.result === "ADOPTED");
  return `<td class="extra small muted">${won ? "ano, výsledek odpovídá hlasu" : lost ? "ne, hlasování dopadlo opačně" : "–"}</td>`;
}

function voteTable(rows, extraHead, extraCell) {
  if (!rows.length) return '<p class="muted">Žádné takové hlasování.</p>';
  return `<div class="table-wrap"><table class="stack">
    <thead><tr><th class="num">Datum</th><th>Hlasování</th>${extraHead}<th>Výsledek</th></tr></thead>
    <tbody>${rows.map((v) => voteRow(v, extraCell(v))).join("")}</tbody></table></div>`;
}

const OWN_STATUS = {
  ADOPTED: ["přijato", "result-ADOPTED"], REJECTED: ["zamítnuto", "result-REJECTED"],
  LAPSED: ["propadlo", ""], WITHDRAWN: ["staženo", ""],
  superseded: ["nahrazeno společným návrhem", "muted"], no_vote: ["bez jmenovitého hlasování v plénu", "muted"],
  answered: ["odpověď přišla", ""], unanswered: ["zatím bez odpovědi", "muted"],
};
const OWN_ROLE = {
  RAPPORTEUR: "zpravodaj/ka", RAPPORTEUR_CO: "spoluzpravodaj/ka", RAPPORTEUR_SHADOW: "stínový zpravodaj/ka",
  RAPPORTEUR_OPINION: "zpravodaj/ka stanoviska", RAPPORTEUR_SHADOW_OPINION: "stínový zpravodaj/ka stanoviska", AUTHOR: "autor/ka",
};
const NO_VOTE_NOTE = "HowTheyVote eviduje jen jmenovitá hlasování. O textu se mohlo hlasovat jinak (zvednutím ruky, tajně, např. u jmenování) nebo hlasování teprve proběhne.";
const PROCESS_TYPE = {
  COD: "legislativní – řádný postup", CNS: "legislativní – konzultace", APP: "legislativní – souhlas",
  INI: "z vlastního podnětu", NLE: "nelegislativní akt", DEC: "absolutorium", BUD: "rozpočet", BUI: "rozpočet",
  DEA: "akt v přenesené pravomoci", RSP: "usnesení k tématu",
};
const QUESTION_KIND = { question_written: "písemná", question_priority: "přednostní písemná", question_oral: "ústní" };

// Souhrn po typech: výsledek jen tam, kde je známý (hlasováno v plénu), nikdy dohromady.
function ownSummaryLine(typ, s) {
  if (!s || !s.count) return "";
  let detail = "";
  if (typ === "question") detail = `odpověď přišla na ${s.answered}`;
  else if (s.voted !== undefined) {
    const parts = [`hlasováno v plénu ${s.voted}, z toho přijato ${s.adopted}`];
    if (s.superseded) parts.push(`nahrazeno společným návrhem ${s.superseded}`);
    if (s.other) parts.push(`propadlo nebo staženo ${s.other}`);
    if (s.no_vote) parts.push(`bez jmenovitého hlasování ${s.no_vote}`);
    detail = parts.join(" · ");
  } else detail = "výsledek se nesleduje";
  return `<div class="card metric"><div class="label">${esc(typ)}</div><div class="value">${fmtNum(s.count)}</div><div class="detail">${detail}</div></div>`;
}

function ownItem(e) {
  const [label, cls] = OWN_STATUS[e.status] || ["", ""];
  const title = (e.title && (e.title.cs || e.title.en)) || e.label || e.id;
  const voteLink = e.vote_id ? ` · <a href="vote.html?id=${e.vote_id}">hlasování</a>` : "";
  const extra = e.type === "question" ? `${QUESTION_KIND[e.subtype] || ""} otázka${e.authors_total > 1 ? `, spoluautorů ${e.authors_total}` : ""}${e.answer_date ? `, odpověď ${fmtDate(e.answer_date)}` : ""}`
    : e.signatories_total ? `podepsalo ${e.signatories_total} poslanců` : (e.committee ? `výbor ${esc(e.committee)}` : "");
  const ptag = e.process_type ? ` <span class="badge outline${e.legislative ? " leg" : ""}" title="typ procedury ${esc(e.process_type)}">${esc(PROCESS_TYPE[e.process_type] || e.process_type)}</span>` : "";
  return `<li><a href="${esc(e.url)}">${esc(title)}</a>${ptag}
    <div class="small muted">${fmtDate(e.date)} · ${esc(e.label || "")} · ${OWN_ROLE[e.role] || esc(e.role)}${extra ? ` · ${extra}` : ""}${e.report ? ` · zpráva ${esc(e.report)}` : ""}</div>
    ${label ? `<div class="small"><span class="${cls}" title="${e.status === "no_vote" ? esc(NO_VOTE_NOTE) : ""}">${label}</span>${e.note === "rejection_adopted" ? " (Parlament přijal návrh na zamítnutí)" : ""}${e.joint_result ? ` (společný návrh: ${RESULT_LABEL[e.joint_result] || e.joint_result})` : ""}${voteLink}</div>` : ""}</li>`;
}

// „Práce na textech“: přidělené role (zpravodaj/stínový u zpráv a stanovisek) s třetinou v delegaci, bez celkového pořadí.
// Jen počty z own_work.json, žádné body ani váhy.
function passedCard(label, value, details, suffix = "") {
  return `<div class="card metric"><div class="label">${label}</div><div class="value">${value === null ? "–" : `${fmtNum(value)}${suffix}`}</div>
    ${details.filter(Boolean).map((d) => `<div class="detail">${d}</div>`).join("")}</div>`;
}

const TIER_TEXT = { top: "▲ horní třetina delegace", mid: "● střední třetina delegace", low: "▼ dolní třetina delegace" };

function ownPassed(ow, mep) {
  const p = ow.passed, r = ow.roles;
  if (!p || !r) return "";
  const d = r.delegation;
  const tierLine = (k) => (!d || !r[k] ? "" : d.tiers_skipped ? "kratší mandát, nesrovnává se" : d.tiers[k] ? `<strong>${TIER_TEXT[d.tiers[k]]}</strong>` : "");
  const leg = (n) => (n ? `z toho legislativních <strong>${fmtNum(n)}</strong>` : "");
  const status = (adopted, pending) => [adopted ? `prošlo <strong>${fmtNum(adopted)}</strong>` : "",
    pending ? `${fmtNum(pending)} zatím bez jmenovitého hlasování` : ""].filter(Boolean).join(" · ");
  const adoptedList = ow.items.filter((e) => (e.type === "report" || e.type === "shadow_report") && e.status === "ADOPTED");
  const zprav = byGender(mep, "zpravodaj", "zpravodajka"), stin = byGender(mep, "stínový zpravodaj", "stínová zpravodajka");
  const cards = [
    passedCard(`Zprávy – ${zprav}`, r.lead_reports,
      [tierLine("lead_reports"), "text vedl" + byGender(mep, "", "a") + " za výbor", status(p.lead_adopted, p.lead_pending), leg(p.lead_adopted_legislative)]),
    passedCard(`Stanoviska – ${zprav}`, r.lead_opinions,
      [tierLine("lead_opinions"), "stanovisko dalšího výboru k cizí zprávě"]),
    passedCard(`Zprávy – ${stin}`, r.shadow_reports,
      [tierLine("shadow_reports"), "vyjednával" + byGender(mep, "", "a") + " text za svou frakci", status(p.shadow_adopted, p.shadow_pending), leg(p.shadow_adopted_legislative)]),
    passedCard(`Stanoviska – ${stin}`, r.shadow_opinions,
      [tierLine("shadow_opinions"), "vyjednával" + byGender(mep, "", "a") + " stanovisko za svou frakci"]),
    passedCard("Podepsané návrhy usnesení", r.motions_signed,
      [p.resolutions_adopted ? `z toho přijato ${fmtNum(p.resolutions_adopted)}` : "",
        "nesrovnává se: návrh podepisují desítky poslanců za frakci"]),
  ].join("");
  const note = d ? `Třetina = kde poslanec stojí mezi ${fmtNum(d.of)} současnými poslanci delegace v dané kategorii;
      celkové pořadí záměrně nepočítáme.${d.mandate_from ? ` Pozor: mandát má až od ${fmtDate(d.mandate_from)}, ostatní většinou od 16. 7. 2024.` : ""}${d.tiers_skipped ? " Mandát pokrývá méně než 75 % období, proto se třetina neurčuje a počty se s kolegy nesrovnávají." : ""}
      <a href="prace.html">Srovnání celé delegace</a>.`
    : `${byGender(mep, "Bývalý poslanec", "Bývalá poslankyně")} se se současnou delegací nesrovnává (jiné období).`;
  const list = adoptedList.length ? `<details class="card own-list"><summary><strong>Přijaté zprávy, na kterých pracoval${byGender(mep, "", "a")}</strong> (${adoptedList.length})</summary>
      <ul class="plain">${adoptedList.map(ownItem).join("")}</ul></details>` : "";
  return `<h3 class="own-sub">Práce na textech v delegaci</h3><div class="metrics">${cards}</div>${list}
    <p class="small muted">Zpravodaj/ka píše text za výbor (zprávu výboru, který věc vede, nebo stanovisko dalšího výboru),
      stínový/á zpravodaj/ka ho vyjednává za svou frakci. Počítají se všechny přidělené texty bez ohledu na výsledek hlasování.
      Legislativní = Parlament spolurozhoduje o právním předpisu (procedury COD, CNS, APP). ${note}</p>
    <h3 class="own-sub">Všechna práce podle typu</h3>`;
}

function ownWork(ow, mep) {
  if (!ow) return '<p class="muted">Data o vlastní práci se připravují.</p>';
  const types = Object.keys(ow.type_labels);
  const cards = types.map((t) => ownSummaryLine(ow.type_labels[t], ow.summary[t])).join("");
  const lists = types.map((t) => {
    const items = ow.items.filter((e) => e.type === t);
    if (!items.length) return "";
    return `<details class="card own-list"><summary><strong>${esc(ow.type_labels[t])}</strong> (${items.length})</summary>
      <ul class="plain">${items.map(ownItem).join("")}</ul></details>`;
  }).join("");
  return `${mep ? ownPassed(ow, mep) : ""}${cards ? `<div class="metrics">${cards}</div>` : '<p class="muted">V datech EP není žádná zpráva, usnesení ani otázka.</p>'}
    ${lists}
    <p class="source">Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0), výsledky hlasování
      <a href="https://howtheyvote.eu">HowTheyVote.eu</a>. Aktualizováno ${fmtDate(ow.updated)}${ow.complete ? "" : " (stahování ještě neskončilo, data nejsou úplná)"}.
      Pozměňovací návrhy nejsou zahrnuté. „Bez jmenovitého hlasování“: ${esc(NO_VOTE_NOTE)} <a href="o-projektu.html#metodika">Jak počítáme</a>.</p>`;
}

// Souhrn ve větě ze šablony; všechna čísla jsou ze stats.json (spočítal skript).
function summarySentence(mep, t, profile) {
  const att = pct(t.attendance);
  const loy = pct(t.group_loyalty);
  const ro = profile.own_work?.roles;
  const pa = profile.own_work?.passed;
  const plural = (n) => `${fmtNum(n)} ${n === 1 ? "zprávu" : n < 5 ? "zprávy" : "zpráv"}`;
  const adoptedOf = (n, adopted) => (n && adopted ? `, z toho ${fmtNum(adopted)} Parlament přijal` : "");
  const sentences = [];
  if (att !== null || loy !== null) {
    const first = att !== null ? `${byGender(mep, "Hlasoval", "Hlasovala")} v ${fmtPct(att)} jmenovitých hlasování ze svého mandátu (${fmtNum(t.attendance[0])} z ${fmtNum(t.attendance[1])})` : "";
    const second = loy !== null ? `v ${fmtPct(loy)} ${byGender(mep, "hlasoval", "hlasovala")} stejně jako většina ${byGender(mep, "jeho", "její")} frakce` : "";
    sentences.push(esc(first && second ? `${first} a ${second}` : first || `${byGender(mep, "Hlasoval", "Hlasovala")} ${second}`));
  }
  // Zpravodaj text píše za výbor, stínový zpravodaj ho jen vyjednává za frakci: každá role má vlastní větu.
  if (ro?.lead_reports) sentences.push(esc(`${byGender(mep, "Vedl", "Vedla")} ${plural(ro.lead_reports)} výboru${adoptedOf(ro.lead_reports, pa?.lead_adopted)}`));
  if (ro?.shadow_reports) sentences.push(esc(`Jako ${byGender(mep, "stínový zpravodaj", "stínová zpravodajka")} ${byGender(mep, "vyjednával", "vyjednávala")} za frakci ${plural(ro.shadow_reports)}${adoptedOf(ro.shadow_reports, pa?.shadow_adopted)}`));
  return sentences.map((s) => s + ".").join(" ");
}

function periodText(x) {
  return `${fmtDate(x.start)} – ${x.end ? fmtDate(x.end) : "dosud"}`;
}

(async () => {
  try {
    const id = main.dataset.mep || param("id");
    if (!/^\d+$/.test(id || "")) throw new Error("Poslanec nenalezen. Vrať se na přehled.");
    const [profile, groups, parties] = await Promise.all([
      getJSON(`meps/${id}.json`).catch(() => { throw new Error("Poslanec nenalezen. Vrať se na přehled."); }),
      getJSON("groups.json"), getJSON("parties.json"),
    ]);
    const mep = profile.mep;
    const stats = { sources: profile.sources };
    const t = profile.total;
    const name = displayName(mep);
    document.title = `${name} – EP Watch CZ`;
    const active = isActive(mep);
    const g = currentOf(mep.groups);
    const p = currentOf(mep.parties);
    const htvMember = `https://howtheyvote.eu/members/${mep.id}`;
    const extLinks = `<a href="${esc(mep.profile_url)}">Profil na webu EP</a> ·
      <a href="${htvMember}">Hlasování na HowTheyVote.eu</a> · <a href="${esc(mep.source_url)}">Data z EP API</a>`;
    const b = profile.benchmarks;
    const isNI = (groups.find((x) => x.ep_code === g?.code)?.code || g?.code) === "NI";
    // Dřívější frakce do hlavičky: „do 3. 2. 2026 PfE“.
    const prevGroups = mep.groups.filter((x) => x !== g && x.end).map((x) => {
      const go = groups.find((y) => y.ep_code === x.code || y.code === x.code);
      return `do ${fmtDate(x.end)} ${CZ_GROUP_LABEL[go?.code] || go?.short_label || x.short_label}`;
    }).join(", ");
    const ow = profile.own_work;
    const hasOwn = Boolean(ow && ow.items && ow.items.length);
    const here = mepUrl(mep.id);
    const since = fmtDate(mep.mandates[0].start);
    const cite = (what, pair) => pair && pair[1] ? `${name}: ${what} ${fmtPct(pct(pair))} (${fmtNum(pair[0])} z ${fmtNum(pair[1])} jmenovitých hlasování v Evropském parlamentu v době mandátu, od ${since}). Zdroj: HowTheyVote.eu, výpočet EP Watch CZ.` : "";

    const committeesNow = mep.committees.filter((c) => !c.end || c.end >= new Date().toISOString().slice(0, 10));
    const committeesPast = mep.committees.filter((c) => !committeesNow.includes(c));
    const committeeLi = (c) => `<li><strong>${esc(c.code)}</strong> – ${esc(c.name_cs || c.name_en || "")}
      <div class="small muted">${ROLE_LABEL[c.role] || esc(c.role)} · ${COMMITTEE_TYPE[c.type] || esc(c.type)} · ${periodText(c)}</div></li>`;

    const pairLi = ({ m, v }) => `<li style="display:flex;justify-content:space-between;gap:1rem;align-items:center">
        <span><a href="${mepUrl(m.id)}">${esc(displayName(m))}</a> ${groupBadge(null, groups, m.group?.code)}</span>
        <span class="num">${fmtPct(pct(v))} <span class="small muted">(${fmtNum(v[0])} z ${fmtNum(v[1])})</span></span></li>`;
    const pairs = profile.pairwise
      .filter((x) => x.total >= 50)
      .map((x) => ({ m: x, v: [x.same, x.total] }));

    main.innerHTML = `
      <p class="small"><a href="index.html">← Všichni poslanci</a></p>
      <div class="profile-head">
        <figure class="portrait">
          ${mep.photo_url ? `<img src="${photoUrl(mep)}" alt="Portrét: ${esc(name)}">` : `<span class="avatar-initials" style="width:160px;height:200px;border-radius:var(--radius);font-size:3rem" aria-hidden="true">${esc([mep.given_name, mep.family_name].filter(Boolean).map((x) => x[0]).join(""))}</span>`}
          ${mep.photo_credit ? `<figcaption>${esc(mep.photo_credit)}</figcaption>` : ""}
        </figure>
        <div>
          <h1>${esc(name)}</h1>
          ${(() => { const gl = logoTile(groups.find((x) => x.ep_code === g?.code), 32), pl = p ? logoTile(parties.find((x) => String(x.id) === String(p.org_id)), 32) : "";
            return gl || pl ? `<div class="logo-row">${gl}${pl}</div>` : ""; })()}
          <div class="facts">
            ${groupBadge(null, groups, g?.code)}${prevGroups ? `<span class="small muted">(${esc(prevGroups)})</span>` : ""}
            ${p ? partyLink(p.org_id, p.short_label, parties, mep) : `<span class="badge outline" title="${esc(NO_PARTY_NOTE)}">strana neuvedena</span>`}
            ${active ? '<span class="badge outline">v mandátu</span>' : `<span class="badge outline">${byGender(mep, "bývalý poslanec", "bývalá poslankyně")}</span>`}
          </div>
          <p class="muted">Mandát: ${mandateText(mep)}</p>
          ${mep.name_note ? `<p class="small muted">Podoba jména: ${esc(mep.name_note)}</p>` : ""}
          ${profile.short_mandate ? `<p class="small note">${esc(SHORT_MANDATE_NOTE)} Mandát trval ${fmtNum(profile.mandate_days)} dní.</p>` : ""}
          <p class="small profile-links head-only">${extLinks}</p>
        </div>
      </div>

      <p class="lead" style="margin-top:1.5rem">${summarySentence(mep, t, profile)}</p>
      <nav class="subnav profile-nav" aria-label="Části profilu">
        <a href="${here}#dochazka">Účast na hlasování</a>${hasOwn ? `<a href="${here}#vlastni-prace">Práce na textech</a>` : ""}
        <a href="${here}#frakce">Frakce a strana</a><a href="${here}#temata">Témata</a>
        <a href="${here}#s-kym">S kým hlasuje</a><a href="${here}#posledni">Poslední hlasování</a>
      </nav>

      <h2 id="dochazka">Hlasování v číslech</h2>
      <div class="metrics">
        ${metricCard("Účast na hlasování", t.attendance, "všechna jmenovitá hlasování v době mandátu", "o-projektu.html#metodika",
          b?.ep?.attendance, "medián EP", cite("účast na hlasování", t.attendance),
          { extra: b?.group?.attendance != null ? `medián frakce ${fmtPct(b.group.attendance)}` : "" })}
        ${metricCard("Účast na hlasování – závěrečná", t.attendance_main, "o celém textu, o prozatímní dohodě s Radou nebo o námitce proti aktu Komise", "o-projektu.html#metodika",
          b?.ep?.attendance_main, "medián EP", cite("účast na hlasování u závěrečných hlasování", t.attendance_main),
          { extra: b?.group?.attendance_main != null ? `medián frakce ${fmtPct(b.group.attendance_main)}` : "" })}
        ${metricCard("Hlasuje s frakcí", t.group_loyalty, "jen informativní", "o-projektu.html#metodika",
          isNI ? null : b?.group?.group_loyalty, "medián frakce", cite("hlasuje s frakcí", t.group_loyalty),
          { naText: isNI ? "nezařazení nemají frakci, nepočítá se" : "nepočítá se" })}
        ${metricCard("Shoda s ostatními Čechy", t.cz_agreement, "jen informativní", "o-projektu.html#metodika", null, "", cite("shoda s ostatními českými poslanci", t.cz_agreement))}
      </div>
      <p class="source">${byGender(mep, "Hlasoval", "Hlasovala")} pro ${fmtNum(t.positions.FOR)}×, proti ${fmtNum(t.positions.AGAINST)}×,
        ${positionFor("ABSTENTION", mep)} ${fmtNum(t.positions.ABSTENTION)}×, ${positionFor("DID_NOT_VOTE", mep)} ${fmtNum(t.positions.DID_NOT_VOTE)}×. ${sourceLine(stats)}</p>

      ${b ? `<p class="small muted" id="srovnani">Srovnání s celým EP: ${esc(b.definition || "")}</p>` : ""}

      ${hasOwn ? `<h2 id="vlastni-prace">Práce na textech</h2>
      <p class="small muted">Hlasování je jen část práce poslance. Kromě něj poslanci vedou zprávy a stanoviska výborů, vyjednávají je za frakci, kladou otázky Komisi a vystupují v rozpravách. Čísla ukazují, kolik takové práce kdo má přidělené, ne jak kvalitní je.</p>
      <p class="small muted">Zprávy, stínové zprávy, stanoviska, návrhy usnesení a otázky, na kterých se ${byGender(mep, "podílel", "podílela")}.
        U zpráv a usnesení výsledek závěrečného jmenovitého hlasování v plénu (nebo přijatého návrhu na zamítnutí), vždy po typech zvlášť.</p>
      ${ownWork(ow, mep)}` : ""}

      <h2 id="soulad">Soulad s výsledkem hlasování</h2>
      <p class="small muted">Jak často hlasoval${byGender(mep, "", "a")} tak, jak hlasování nakonec dopadlo. Číslo hlavně odráží velikost a pozici frakce;
        hlasovat proti většině je legitimní opoziční role. Proto ho vždy srovnáváme s průměrem frakce.</p>
      <div class="metrics">
        ${outcomeCard("Všechna hlasování", t.outcome, t.group_outcome, "jen informativní", mep)}
        ${outcomeCard("Závěrečná hlasování", t.outcome_main, t.group_outcome_main, "jen informativní", mep)}
        ${metricCard("Těsná hlasování", t.outcome_close, "rozdíl pro − proti nejvýš 21 hlasů", "o-projektu.html#metodika", null, "")}
      </div>

      <h2 id="frakce">Frakce a strana</h2>
      <div class="card">${timeline(mep, groups, parties)}
        <p class="source">Příslušnost podle EP Open Data, k datu. Zdroj: <a href="${esc(mep.source_url)}">EP Open Data</a>.</p></div>

      <h2 id="mesice">Účast na hlasování po měsících</h2>
      <div class="card">${monthlyChart(profile.monthly)}
        <p class="small muted">Sloupec = podíl hlasování v měsíci, ve kterých ${byGender(mep, "hlasoval", "hlasovala")}; pod sloupcem číslo měsíce a rok.
        Nízká čárka = v měsíci ${byGender(mep, "nehlasoval", "nehlasovala")} ani jednou. Klepnutím na sloupec se ukáže přesné číslo. Měsíce bez zasedání (srpen) chybí.</p></div>

      <div class="grid-2">
        <section>
          <h2>Členství podrobně</h2>
          <div class="card"><ul class="plain">
            ${mep.groups.map((x) => { const go = groups.find((y) => y.ep_code === x.code || y.code === x.code);
              return `<li>${entityCell(go || { code: x.code }, { name: x.name_cs || x.name_en || x.short_label, size: 24, slot: "sm",
                sub: `${esc(go ? (CZ_GROUP_LABEL[go.code] || go.short_label) : x.short_label)}${x.role && x.role !== "MEMBER" ? ` · <strong>${ROLE_LABEL[x.role] || esc(x.role)}</strong>` : ""} · ${periodText(x)}` })}</li>`; }).join("")}
            ${mep.parties.map((x) => { const po = parties.find((y) => String(y.id) === String(x.org_id));
              if (po?.independent) return `<li>${partyBadge(x.org_id, x.short_label, parties, mep)}<div class="small muted">${periodText(x)}</div></li>`;
              return `<li>${entityCell(po || {}, { name: x.name || x.short_label, href: po ? `party.html?id=${po.id}` : "", size: 24, slot: "sm",
                sub: `${esc(x.short_label)} · ${periodText(x)}` })}</li>`; }).join("") || `<li class="muted">${esc(NO_PARTY_NOTE)}</li>`}
          </ul>
          <p class="source">Zdroj: <a href="${esc(mep.source_url)}">EP Open Data</a></p></div>
        </section>
        <section>
          <h2>Výbory</h2>
          <div class="card">
            <ul class="plain">${committeesNow.map(committeeLi).join("") || '<li class="muted">Žádný aktuální výbor.</li>'}</ul>
            ${committeesPast.length ? `<h3>Dříve</h3><ul class="plain">${committeesPast.map(committeeLi).join("")}</ul>` : ""}
            <p class="source">Zdroj: <a href="${esc(mep.source_url)}">EP Open Data</a></p>
          </div>
        </section>
      </div>

      <h2 id="proti-frakci">Kde hlasoval${byGender(mep, "", "a")} jinak než frakce</h2>
      <div class="card">
        <p>${byGender(mep, "Hlasoval", "Hlasovala")} jinak než většina své frakce ${fmtNum(profile.against_group.count)}× ze
          ${fmtNum(t.group_loyalty[1])} hlasování, ve kterých se to počítá (z toho v závěrečných hlasováních ${fmtNum(profile.against_group.count_main)}×).
          ${t.group_loyalty[1] ? "" : "U nezařazených poslanců se nepočítá."}</p>
        ${profile.against_group.count ? `<div class="controls"><label><input type="checkbox" id="against-main"> jen závěrečná hlasování</label></div>
          <div id="against"></div>` : ""}
      </div>

      <h2 id="rozhodly">Kde rozhodly české hlasy</h2>
      <div class="card">
        <p class="small muted">Těsná hlasování, která by bez hlasů českých poslanců dopadla opačně; většinou pozměňovací návrhy a dílčí hlasování
          (<a href="rozhodujici.html">všechna taková hlasování</a>).
          Ukazuje se, jak ${byGender(mep, "hlasoval", "hlasovala")} v těch, která proběhla v době ${byGender(mep, "jeho", "jejího")} mandátu.</p>
        ${voteTable(profile.decisive, "<th>Volba</th><th>Na straně výsledku</th>", (v) => `<td class="extra pos pos-${v.position}">${positionFor(v.position, mep)}</td>${sideCell(v)}`)}
      </div>

      <h2 id="temata">Podle témat</h2>
      <div class="card">
        <p class="small muted">Deset témat s nejvíce hlasováními podle Legislativní observatoře EP. Názvy témat jsou ruční český překlad (OEIL je jen anglicky a francouzsky).</p>
        <div class="table-wrap"><table class="stack topics">
          <thead><tr><th>Téma</th><th class="num">Hlasování</th><th class="num">Účast na hlasování</th><th class="num">Pro / proti / zdržel${byGender(mep, "", "a")} se</th><th class="num">Hlasuje s frakcí</th></tr></thead>
          <tbody>${profile.topics.map((x) => `<tr>
            <td class="title"><a href="votes.html?t=${esc(x.code)}&f=final">${esc(x.label_cs || x.label || `téma ${x.code} (zdroj neuvádí název)`)}</a> <span class="small muted">${esc(x.code)}</span></td>
            <td class="num" data-label="Hlasování">${fmtNum(x.attendance[1])}</td>
            <td class="num" data-label="Účast">${pctCell(x.attendance)}</td>
            <td class="num extra">${splitBar([x.positions.FOR, x.positions.AGAINST, x.positions.ABSTENTION, x.positions.DID_NOT_VOTE])}<div class="small">${fmtNum(x.positions.FOR)} pro · ${fmtNum(x.positions.AGAINST)} proti · ${fmtNum(x.positions.ABSTENTION)} zdržel${byGender(mep, "", "a")} se</div></td>
            <td class="num" data-label="S frakcí">${pctCell(x.group_loyalty)}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>

      <h2 id="s-kym">S kým hlasuje stejně</h2>
      <div class="card">
        <p class="small muted">Podíl hlasování, kde oba hlasovali a hlasovali stejně (jen dvojice s aspoň 50 společnými hlasováními).
          <a href="shoda.html?id=${mep.id}">Celá tabulka shody všech českých poslanců</a>.</p>
        ${pairs.length ? `<div class="grid-2">
          <div><h3>Nejčastěji stejně</h3><ul class="plain">${pairs.slice(0, 5).map(pairLi).join("")}</ul></div>
          <div><h3>Nejméně často stejně</h3><ul class="plain">${pairs.slice(-5).reverse().map(pairLi).join("")}</ul></div>
        </div>` : '<p class="muted">Nedostatek společných hlasování.</p>'}
      </div>

      <h2 id="posledni">Poslední závěrečná hlasování</h2>
      <div id="recent" class="loading">Načítám…</div>
      <p class="small profile-links foot-only">${extLinks}</p>
    `;

    bindChart(main, profile.monthly, mep);

    const renderAgainst = () => {
      const el = document.getElementById("against");
      if (!el) return;
      const onlyMain = document.getElementById("against-main").checked;
      el.innerHTML = voteTable(onlyMain ? profile.against_group.recent_main : profile.against_group.recent,
        "<th>Volba / frakce</th>",
        (v) => `<td class="extra"><span class="pos pos-${v.position}">${positionFor(v.position, mep)}</span>
          <div class="small muted">většina ${esc(v.group_code)}: ${POSITION_LABEL[v.group_majority]}</div></td>`) +
        `<p class="small muted">Posledních ${fmtNum((onlyMain ? profile.against_group.recent_main : profile.against_group.recent).length)} z ${fmtNum(onlyMain ? profile.against_group.count_main : profile.against_group.count)}.</p>`;
      collapseTables(el);
    };
    document.getElementById("against-main")?.addEventListener("change", renderAgainst);
    renderAgainst();

    const recent = document.getElementById("recent");
    const rows = profile.recent_main_votes.map((v) => ({ v, pos: v, month: v.month }));
    recent.className = "";
    recent.innerHTML = rows.length ? `<div class="table-wrap"><table class="stack">
      <thead><tr><th>Datum</th><th>Hlasování</th><th>Volba</th><th>Výsledek</th></tr></thead>
      <tbody>${rows.map(({ v, pos, month }) => `<tr>
        <td class="num date">${fmtDate(v.date)}</td>
        <td class="title"><a class="vote-title" href="vote.html?id=${v.id}&m=${month}">${esc(voteTitle(v))}</a>
          <div class="small muted">${kindTag(v)}${esc(voteSubtitle(v))}</div></td>
        <td class="extra pos pos-${pos.position}">${positionFor(pos.position, mep)}</td>
        <td class="result result-${v.result || ""}" title="${esc(RESULT_NOTE[v.result ?? null] || "")}">${resultHtml(v)}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="source">Zdroj: <a href="https://howtheyvote.eu/members/${mep.id}">HowTheyVote.eu</a>.
      Všechna hlasování najdeš v <a href="votes.html">seznamu hlasování</a>.</p>`
      : '<p class="muted">Žádná hlasování.</p>';
    collapseTables(main);
  } catch (e) {
    showError(main, e);
  }
})();
