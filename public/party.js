// Strany: seznam (party.html) a detail strany (s/{id}.html; statický obsah v HTML, tento skript ho nahradí interaktivní verzí).
"use strict";

setNav("parties");
const main = document.getElementById("main");

function pairText(pair, unit = "hlasování") {
  return pair && pair[1] ? `${fmtNum(pair[0])} z ${fmtNum(pair[1])} ${unit}` : "nepočítá se";
}

async function listPage() {
  const [idx, groups, parties, bench] = await Promise.all([getJSON("parties/index.json"), getJSON("groups.json"), getJSON("parties.json"), getJSON("benchmarks.json").catch(() => null)]);
  // Nejdřív strany s nejvíc poslanci (pořadí podle ID nic neříká).
  const list = [...idx.parties].sort((a, b) => b.members - a.members || (a.name || a.short_label).localeCompare(b.name || b.short_label, "cs"));
  const epMed = bench?.ep?.attendance;
  main.innerHTML = `
    <h1>České strany v Evropském parlamentu</h1>
    <div class="lead-row"><p class="lead">Souhrnné metriky poslanců jednotlivých stran v 10. volebním období.</p>${infoButton(`<p>Příslušnost ke straně se bere k datu hlasování. Nezávislí poslanci nejsou strana, a proto tu nejsou. Strany jsou řazené podle počtu poslanců. U stran s více poslanci je jednotnost přirozeně nižší: víc lidí, víc možností se rozejít. <a href="o-projektu.html#metodika">Jak počítáme</a>.</p>`)}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Strana</th><th class="num">Poslanců</th><th class="num">Účast na hlasování${epMed != null ? `<div class="small muted th-note">medián EP ${fmtPct(epMed)}</div>` : ""}</th>
        <th class="num">Jednotnost</th><th class="num">Hlasování, kde se strana rozdělila</th></tr></thead>
      <tbody>${list.map((p) => `<tr>
        <td>${entityCell(p, { name: p.name || p.short_label, href: partyUrl(p.id), sub: esc(p.short_label) })}</td>
        <td class="num">${fmtNum(p.members)}</td>
        <td class="num">${pctCell(p.total.attendance)}</td>
        <td class="num">${pctCell(p.cohesion, "všichni poslanci strany hlasovali stejně")}</td>
        <td class="num">${p.cohesion[1] ? `${fmtNum(p.splits_count)} z ${fmtNum(p.cohesion[1])}<div class="small muted">${fmtPct(p.splits_count / p.cohesion[1])}</div>` : '<span class="muted">jen 1 poslanec</span>'}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <p class="source">${sourceLine(idx)}</p>`;
}

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
  main.innerHTML = `
    <p class="small"><a href="party.html">← Všechny strany</a></p>
    ${p.logo ? `<div class="logo-row">${logoTile(p, 48)}</div>` : ""}
    <h1>${esc(p.name || p.short_label)} ${partyBadge(p.id, p.short_label, parties)}</h1>

    <h2>Poslanci</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Poslanec</th><th>Ve straně (podle EP)</th><th class="num">Účast na hlasování</th><th class="num">Hlasuje s frakcí</th></tr></thead>
      <tbody>${[...p.member_list].sort((a, b) => (pct(b.total.attendance) ?? -1) - (pct(a.total.attendance) ?? -1)).map((m) => `<tr>
        <td><div class="mep-cell"><img src="${photoUrl(m)}" alt="" loading="lazy">
          <div><a href="${mepUrl(m.id)}">${esc(displayName(m))}</a><div>${groupBadge(null, groups, m.group?.code)}</div></div></div></td>
        <td class="small">${m.party_periods.map((x) => `${fmtDate(x.start)} – ${x.end ? fmtDate(x.end) : "dosud"}`).join("<br>")}</td>
        <td class="num">${pctCell(m.total.attendance)}</td>
        <td class="num">${pctCell(m.total.group_loyalty)}</td></tr>`).join("")}</tbody>
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
  });
}

(async () => {
  try {
    const id = main.dataset.party || param("id");
    if (id && !/^\d+$/.test(id)) throw new Error("Strana nenalezena.");
    await (id ? detailPage(id) : listPage());
  } catch (e) {
    showError(main, e);
  }
})();
