// Strany: seznam (party.html) a detail strany (s/{id}.html; statický obsah v HTML, tento skript ho nahradí interaktivní verzí).
"use strict";

setNav("parties");
const MIN_VOTERS_EU = 10;
const groupPageUrl = (code) => `party.html?c=${encodeURIComponent(code)}`;
const main = document.getElementById("main");

function pairText(pair, unit = "hlasování") {
  return pair && pair[1] ? `${fmtNum(pair[0])} z ${fmtNum(pair[1])} ${unit}` : "nepočítá se";
}

// Přepínač pohledu: vlajka druhého pohledu (u českých stran evropská, u evropských frakcí česká) + popisek.
const FLAGS = {
  eu: (() => {
    const stars = Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6, x = 18 + 7.5 * Math.sin(a), y = 12 - 7.5 * Math.cos(a);
      const pts = Array.from({ length: 10 }, (_, k) => { const r = k % 2 ? 0.9 : 2.1, t = (k * Math.PI) / 5; return `${(x + r * Math.sin(t)).toFixed(2)},${(y - r * Math.cos(t)).toFixed(2)}`; }).join(" ");
      return `<polygon points="${pts}" fill="#FFCC00"/>`; }).join("");
    return `<svg class="flag" viewBox="0 0 36 24" aria-hidden="true"><rect width="36" height="24" rx="3" fill="#003399"/>${stars}</svg>`;
  })(),
  cz: '<svg class="flag" viewBox="0 0 36 24" aria-hidden="true"><rect width="36" height="24" rx="3" fill="#FFFFFF"/><path d="M0 12h36v9a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3z" fill="#D7141A"/><path d="M0 0l18 12L0 24z" fill="#11457E"/><rect width="36" height="24" rx="3" fill="none" stroke="rgba(15,23,42,.25)"/></svg>',
};
function viewSwitch(current) {
  const to = current === "cz" ? "eu" : "cz";
  return `<a class="flag-switch" href="party.html${to === "eu" ? "?v=eu" : ""}" title="${to === "eu" ? "Přepnout na evropské frakce" : "Přepnout na české strany"}">${FLAGS[to]}<span>${to === "eu" ? "Evropské frakce" : "České strany"}</span></a>`;
}

async function euListPage() {
  const [idx, bench] = await Promise.all([getJSON("eugroups/index.json"), getJSON("benchmarks.json").catch(() => null)]);
  main.innerHTML = `
    <div class="page-head"><h1>Evropské frakce v Evropském parlamentu</h1>${viewSwitch("eu")}</div>
    <div class="lead-row"><p class="lead">Souhrn hlasování celých politických skupin EP, ve kterých sedí čeští poslanci.</p>${infoButton(`<p>Čísla jsou za všechny poslance skupiny v celém Evropském parlamentu, ne jen za české. <strong>Účast</strong> = podíl hlasů pro, proti nebo zdržel se z hlasů všech členů skupiny. <strong>Soudržnost</strong> = podíl hlasů pro a proti, které odpovídají většině skupiny (v hlasováních, kde hlasovalo pro nebo proti aspoň ${MIN_VOTERS_EU} členů). <strong>Výrazně rozdělená hlasování</strong> = menšina mezi hlasy pro a proti tvoří aspoň 30 % (stejný práh jako u české delegace). Nezařazení poslanci nejsou skupina, proto tu nejsou. Žádné pořadí ani hodnocení. <a href="o-projektu.html#metodika">Jak počítáme</a>.</p>`)}</div>
    <div class="table-wrap"><table class="cards">
      <thead><tr><th>Skupina</th><th class="num">Čeští poslanci</th><th class="num">Účast skupiny${bench?.ep?.attendance != null ? `<div class="small muted th-note">medián EP ${fmtPct(bench.ep.attendance)}</div>` : ""}</th>
        <th class="num">Soudržnost</th><th class="num">Výrazně rozdělená hlasování</th></tr></thead>
      <tbody>${idx.groups.map((g) => `<tr>
        <td>${entityCell(g, { name: g.name_cs || g.label, href: groupPageUrl(g.code), sub: esc(CZ_GROUP_LABEL[g.code] || g.short_label) })}</td>
        <td class="num" data-label="Čeští poslanci">${g.cz_members ? fmtNum(g.cz_members) : '<span class="muted">žádný</span>'}</td>
        <td class="num" data-label="Účast skupiny">${pctCell(g.attendance)}</td>
        <td class="num" data-label="Soudržnost">${pctCell(g.majority, "podíl hlasů pro a proti odpovídajících většině skupiny")}</td>
        <td class="num" data-label="Výrazně rozdělená">${g.considered ? `${fmtNum(g.splits)} z ${fmtNum(g.considered)}<div class="small muted">${fmtPct(g.splits / g.considered)}</div>` : "–"}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="source">${sourceLine(idx)}</p>`;
}

async function euDetailPage(code) {
  const [g, groups] = await Promise.all([getJSON(`eugroups/${code}.json`).catch(() => { throw new Error("Skupina nenalezena. Vrať se na seznam frakcí."); }), getJSON("groups.json")]);
  document.title = `${g.name_cs || g.label} – EP Watch CZ`;
  const mepsById = Object.fromEntries(g.member_list.map((m) => [m.id, m]));
  const rows = (list) => list.length ? `<div class="table-wrap"><table class="stack">
      <thead><tr><th class="num">Datum</th><th>Hlasování</th><th>Skupina</th><th>Výsledek</th></tr></thead>
      <tbody>${list.map((v) => voteRow(v, `<td class="extra cz">${splitBar(v.gc)}<div class="small">${czCountsHtml(v.gc)}</div></td>`)).join("")}</tbody></table></div>`
    : '<p class="muted">Žádné takové hlasování.</p>';
  main.innerHTML = `
    <div class="page-head"><p class="small"><a href="party.html?v=eu">← Všechny frakce</a></p>${viewSwitch("eu")}</div>
    ${g.logo ? `<div class="logo-row">${logoTile(g, 48)}</div>` : ""}
    <h1>${esc(g.name_cs || g.label)} ${groupBadge(g.code, groups)}</h1>
    <p class="small">${g.cz_members} ${g.cz_members === 1 ? "český poslanec" : g.cz_members < 5 ? "čeští poslanci" : "českých poslanců"}${g.web ? ` · <a class="ext" href="${esc(g.web)}" rel="noopener" title="Adresu webu uvádí Wikidata (CC0)">oficiální web</a>` : ""}</p>

    ${g.member_list.length ? `<h2>Čeští poslanci ve skupině</h2>
    <div class="table-wrap"><table class="cards">
      <thead><tr><th>Poslanec</th><th>Strana</th><th class="num">Účast na hlasování</th><th class="num">Hlasuje s frakcí</th></tr></thead>
      <tbody>${[...g.member_list].sort((a, b) => (a.sort_label || a.name).localeCompare(b.sort_label || b.name, "cs")).map((m) => `<tr>
        <td><div class="mep-cell"><img src="${photoUrl(m, true)}" alt="" loading="lazy" width="40" height="40"><a href="${mepUrl(m.id)}">${esc(displayName(m))}</a></div></td>
        <td class="wide" data-label="Strana">${m.party ? esc(m.party.short_label === "Ind." ? byGender(m, "nezávislý", "nezávislá") : m.party.short_label) : ""}</td>
        <td class="num" data-label="Účast na hlasování">${pctCell(m.total.attendance)}</td><td class="num" data-label="Hlasuje s frakcí">${pctCell(m.total.group_loyalty)}</td></tr>`).join("")}</tbody>
    </table></div>` : '<p class="muted">Ve skupině nesedí žádný český poslanec.</p>'}

    <h2>Souhrn za celou skupinu</h2>
    <div class="metrics">
      <div class="card metric"><div class="label">Účast skupiny na hlasování</div><div class="value">${countPct(pct(g.attendance))}</div>
        <div class="detail">${pairText(g.attendance, "hlasů členů skupiny")}</div></div>
      <div class="card metric"><div class="label">Soudržnost</div><div class="value">${countPct(pct(g.majority))}</div>
        <div class="detail">${pairText(g.majority, "hlasů pro/proti")}${infoButton(`<p>Podíl hlasů pro a proti, které odpovídají většině skupiny, v hlasováních, kde pro nebo proti hlasovalo aspoň ${MIN_VOTERS_EU} členů. U závěrečných hlasování: ${fmtPct(pct(g.majority_main))} (${pairText(g.majority_main, "hlasů pro/proti")}).</p>`)}</div></div>
      <div class="card metric"><div class="label">Výrazně rozdělená hlasování</div><div class="value">${g.considered ? fmtNum(g.splits) : "–"}</div>
        <div class="detail">z ${fmtNum(g.considered)} hlasování${infoButton(`<p>Menšina mezi hlasy pro a proti tvoří aspoň 30 %. U závěrečných hlasování: ${fmtNum(g.splits_main)} z ${fmtNum(g.considered_main)}.</p>`)}</div></div>
    </div>
    <p class="source">${sourceLine({ sources: { votes: g.sources.votes } })}</p>

    <h2>Kde se skupina rozdělila</h2>
    ${noteLine("Hlasování s největším podílem menšiny mezi hlasy pro a proti.", "Zobrazeno nejvýš 50 hlasování. Čísla ve sloupci Skupina jsou hlasy všech členů skupiny.")}
    <div class="controls"><label><input type="checkbox" id="split-main"> jen závěrečná hlasování</label></div>
    <div id="splits">${rows(g.splits_list)}</div>`;
  document.getElementById("split-main")?.addEventListener("change", (e) => {
    document.getElementById("splits").innerHTML = rows(e.target.checked ? g.splits_list_main : g.splits_list);
    collapseTables(document.getElementById("splits"));
  });
  collapseTables(document.getElementById("splits"));
}

async function listPage() {
  const [idx, groups, parties, bench] = await Promise.all([getJSON("parties/index.json"), getJSON("groups.json"), getJSON("parties.json"), getJSON("benchmarks.json").catch(() => null)]);
  // Nejdřív strany s nejvíc poslanci (pořadí podle ID nic neříká).
  const list = [...idx.parties].sort((a, b) => b.members - a.members || (a.name || a.short_label).localeCompare(b.name || b.short_label, "cs"));
  const epMed = bench?.ep?.attendance;
  main.innerHTML = `
    <div class="page-head"><h1>České strany v Evropském parlamentu</h1>${viewSwitch("cz")}</div>
    <div class="lead-row"><p class="lead">Souhrnné metriky poslanců jednotlivých stran v 10. volebním období.</p>${infoButton(`<p>Příslušnost ke straně se bere k datu hlasování. Nezávislí poslanci nejsou strana, a proto tu nejsou. Strany jsou řazené podle počtu poslanců. U stran s více poslanci je jednotnost přirozeně nižší: víc lidí, víc možností se rozejít. <a href="o-projektu.html#metodika">Jak počítáme</a>.</p>`)}</div>
    <div class="table-wrap"><table class="cards">
      <thead><tr><th>Strana</th><th class="num">Poslanců</th><th class="num">Účast na hlasování${epMed != null ? `<div class="small muted th-note">medián EP ${fmtPct(epMed)}</div>` : ""}</th>
        <th class="num">Jednotnost</th><th class="num">Hlasování, kde se strana rozdělila</th></tr></thead>
      <tbody>${list.map((p) => `<tr>
        <td>${entityCell(p, { name: p.name || p.short_label, href: partyUrl(p.id), sub: esc(p.short_label) })}</td>
        <td class="num" data-label="Poslanců">${fmtNum(p.members)}</td>
        <td class="num" data-label="Účast na hlasování">${pctCell(p.total.attendance)}</td>
        <td class="num" data-label="Jednotnost">${pctCell(p.cohesion, "všichni poslanci strany hlasovali stejně")}</td>
        <td class="num" data-label="Strana se rozdělila">${p.cohesion[1] ? `${fmtNum(p.splits_count)} z ${fmtNum(p.cohesion[1])}<div class="small muted">${fmtPct(p.splits_count / p.cohesion[1])}</div>` : '<span class="muted">jen 1 poslanec</span>'}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <p class="source">${sourceLine(idx)}</p>`;
}

const meps_count_cs = (n) => `${fmtNum(n)} ${n === 1 ? "poslanec" : n < 5 ? "poslanci" : "poslanců"}`;

async function detailPage(id) {
  const [p, groups, parties] = await Promise.all([
    getJSON(`parties/${id}.json`).catch(() => { throw new Error("Strana nenalezena. Vrať se na seznam stran."); }),
    getJSON("groups.json"), getJSON("parties.json"),
  ]);
  document.title = `${p.name || p.short_label} – EP Watch CZ`;
  const t = p.total;
  const meps = Object.fromEntries(p.member_list.map((m) => [m.id, m]));
  const single = p.cohesion[1] === 0;
  const splitList = (list) => list.length ? `<div class="table-wrap"><table class="stack">
      <thead><tr><th class="num">Datum</th><th>Hlasování</th><th>Poslanci strany</th><th>Výsledek</th></tr></thead>
      <tbody>${list.map((v) => voteRow(v, `<td class="extra">${namesByPosition(v.positions, meps)}</td>`)).join("")}</tbody></table></div>`
    : '<p class="muted">Žádné takové hlasování.</p>';
  // Karta strany (sdílení): tři čísla ze „Souhrn za stranu“, bez log a bez srovnání mezi stranami.
  const nowCount = p.member_list.filter((m) => isActive(m) && m.party_periods.some((x) => !x.end)).length;
  const url = siteUrl(`s/${p.id}.html`);
  const name = p.name || p.short_label;
  window.shareContext = () => ({
    kind: "party", url, filename: `ep-watch-strana-${p.id}`, subtitle: `Strana · ${p.short_label}`,
    cite: single ? "" : `${name}: poslanci strany v Evropském parlamentu hlasovali jednotně v ${fmtPct(pct(p.cohesion))} hlasování (${fmtNum(p.cohesion[0])} z ${fmtNum(p.cohesion[1])}, kde hlasovali aspoň dva). Zdroj: HowTheyVote.eu, výpočet EP Watch CZ.`,
    text: `${name} v Evropském parlamentu: účast poslanců na hlasování ${fmtPct(pct(t.attendance))}${single ? "" : `, jednotnost ${fmtPct(pct(p.cohesion))}`}. Zdroj: HowTheyVote.eu, EP Watch CZ`,
    data: {
      name, sub: `${name !== p.short_label ? `${p.short_label} · ` : ""}${nowCount ? `${meps_count_cs(nowCount)} v mandátu` : "nikdo v mandátu"}`, dataDay: p.sources?.votes?.release || new Date().toISOString().slice(0, 10),
      tiles: [{ label: "Účast poslanců na hlasování", pair: t.attendance }, { label: "Jednotnost", pair: single ? null : p.cohesion, note: "všichni hlasující poslanci strany stejně" },
        { label: "Soulad s výsledkem", pair: t.outcome, note: "jen informativní" }],
      urlShort: url.replace(/^https?:\/\//, "").replace(/\.html$/, ""),
    },
  });
  main.innerHTML = `
    <div class="back-row"><p class="small"><a href="party.html">← Všechny strany</a></p>${typeof shareButton === "function" ? shareButton() : ""}</div>
    ${p.logo ? `<div class="logo-row">${logoTile(p, 48)}</div>` : ""}
    <h1>${esc(p.name || p.short_label)} ${partyBadge(p.id, p.short_label, parties)}</h1>

    <h2>Poslanci</h2>
    <div class="table-wrap"><table class="cards">
      <thead><tr><th>Poslanec</th><th>Ve straně (podle EP)</th><th class="num">Účast na hlasování</th><th class="num">Hlasuje s frakcí</th></tr></thead>
      <tbody>${[...p.member_list].sort((a, b) => (pct(b.total.attendance) ?? -1) - (pct(a.total.attendance) ?? -1)).map((m) => `<tr>
        <td><div class="mep-cell"><img src="${photoUrl(m, true)}" alt="" loading="lazy" width="40" height="40">
          <div><a href="${mepUrl(m.id)}">${esc(displayName(m))}</a><div>${groupBadge(null, groups, m.group?.code)}</div></div></div></td>
        <td class="small wide" data-label="Ve straně (podle EP)">${m.party_periods.map((x) => `${fmtDate(x.start)} – ${x.end ? fmtDate(x.end) : "dosud"}`).join("<br>")}</td>
        <td class="num" data-label="Účast na hlasování">${pctCell(m.total.attendance)}</td>
        <td class="num" data-label="Hlasuje s frakcí">${pctCell(m.total.group_loyalty)}</td></tr>`).join("")}</tbody>
    </table></div>

    <h2>Souhrn za stranu</h2>
    <div class="metrics">
      <div class="card metric"><div class="label">Účast poslanců strany na hlasování</div><div class="value">${countPct(pct(t.attendance))}</div>
        <div class="detail">${pairText(t.attendance, "hlasů poslanců")}</div></div>
      <div class="card metric"><div class="label">Jednotnost</div><div class="value">${single ? "–" : fmtPct(pct(p.cohesion))}</div>
        <div class="detail">${single ? "strana měla v žádném hlasování víc než 1 hlasujícího poslance" : pairText(p.cohesion)}</div>
        <div class="detail">závěrečná hlasování: ${single ? "–" : `${fmtPct(pct(p.cohesion_main))} (${pairText(p.cohesion_main)})`}</div></div>
      <div class="card metric"><div class="label">Soulad s výsledkem</div><div class="value">${countPct(pct(t.outcome))}</div>
        <div class="detail">${pairText(t.outcome, "hlasů pro/proti")} · jen informativní</div></div>
    </div>
    <p class="source">${sourceLine(p)}</p>

    ${single ? "" : `<h2>Kde se strana rozdělila</h2>
      <p class="muted">Hlasování, kde poslanci strany hlasovali pro i proti. Celkem ${fmtNum(p.splits_count)} z ${fmtNum(p.cohesion[1])} hlasování (${fmtPct(p.splits_count / p.cohesion[1])}), z toho v závěrečných ${fmtNum(p.splits_count_main)} z ${fmtNum(p.cohesion_main[1])}.</p>
      <div class="controls"><label><input type="checkbox" id="split-main"> jen závěrečná hlasování</label></div>
      <div id="splits">${splitList(p.splits)}</div>`}`;
  document.getElementById("split-main")?.addEventListener("change", (e) => {
    document.getElementById("splits").innerHTML = splitList(e.target.checked ? p.splits_main : p.splits);
    collapseTables(document.getElementById("splits"));
  });
  if (!single) collapseTables(document.getElementById("splits"));
}

(async () => {
  try {
    const code = param("c");
    if (code) {
      if (!/^[A-Z_]+$/.test(code)) throw new Error("Skupina nenalezena.");
      return await euDetailPage(code);
    }
    if (param("v") === "eu" && !main.dataset.party) return await euListPage();
    const id = main.dataset.party || param("id");
    if (id && !/^\d+$/.test(id)) throw new Error("Strana nenalezena.");
    await (id ? detailPage(id) : listPage());
  } catch (e) {
    showError(main, e);
  }
})();
