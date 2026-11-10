// Strany: seznam (party.html), evropské frakce (?v=eu, ?c=) a interakce na detailu strany (s/{id}.html).
import { getJSON, param, soft } from "./lib/data.js";
import { CZ_GROUP_LABEL, byGender, capFirst, chairRole, chairsHeading, displayName, esc, fmtDate, fmtNum, fmtPct, fromCountriesCs, pct, seatsCs, siteUrl, topCountries } from "./lib/format.js";
import { SHARE_BTN_HTML, collapseTables, countPct, czCountsHtml, emptyState, entityCell, groupBadge, infoButton, logoTile, mepUrl, notFound, noteLine, partyUrl, pctCell, photoUrl, setNav, showError, sourceLine, splitBar, voteRow } from "./lib/ui.js";

setNav("parties");
const MIN_VOTERS_EU = 10;
let PARTIES = [];
const groupPageUrl = (code) => `party?c=${encodeURIComponent(code)}`;
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
  return `<a class="flag-switch" href="party${to === "eu" ? "?v=eu" : ""}" title="${to === "eu" ? "Přepnout na evropské frakce" : "Přepnout na české strany"}">${FLAGS[to]}<span>${to === "eu" ? "Evropské frakce" : "České strany"}</span></a>`;
}

async function euListPage() {
  const [idx, bench] = await Promise.all([getJSON("eugroups/index.json"), getJSON("benchmarks.json").catch(soft(null))]);
  main.innerHTML = `
    <div class="page-head"><h1>Evropské frakce v Evropském parlamentu</h1>${viewSwitch("eu")}</div>
    <div class="lead-row"><p class="lead">Souhrn hlasování celých politických skupin EP, ve kterých sedí čeští poslanci.</p>${infoButton(`<p>Čísla jsou za všechny poslance skupiny v celém Evropském parlamentu, ne jen za české. <strong>Účast</strong> = podíl hlasů pro, proti nebo zdržel se z hlasů všech členů skupiny. <strong>Soudržnost</strong> = podíl hlasů pro a proti, které odpovídají většině skupiny (v hlasováních, kde hlasovalo pro nebo proti aspoň ${MIN_VOTERS_EU} členů). <strong>Výrazně rozdělená hlasování</strong> = menšina mezi hlasy pro a proti tvoří aspoň 30 % (stejný práh jako u české delegace). Nezařazení poslanci nejsou skupina, proto tu nejsou. Žádné pořadí ani hodnocení. <a href="o-projektu#metodika">Jak počítáme</a>.</p>`)}</div>
    <div class="table-wrap"><table class="cards">
      <thead><tr><th>Skupina</th><th class="num">Čeští poslanci</th><th class="num">Poslanců / zemí</th><th class="num">Účast skupiny${bench?.ep?.attendance != null ? `<div class="small muted th-note">medián EP ${fmtPct(bench.ep.attendance)}</div>` : ""}</th>
        <th class="num">Soudržnost</th><th class="num">Výrazně rozdělená hlasování</th></tr></thead>
      <tbody>${idx.groups.map((g) => `<tr>
        <td>${entityCell(g, { name: capFirst(g.name_cs || g.label), href: groupPageUrl(g.code), sub: esc(CZ_GROUP_LABEL[g.code] || g.short_label) })}</td>
        <td class="num" data-label="Čeští poslanci">${g.cz_members ? fmtNum(g.cz_members) : '<span class="muted">žádný</span>'}</td>
        <td class="num" data-label="Poslanců / zemí">${g.seats ? `${fmtNum(g.seats)} / ${fmtNum(g.n_countries)}` : "–"}</td>
        <td class="num" data-label="Účast skupiny">${pctCell(g.attendance)}</td>
        <td class="num" data-label="Soudržnost">${pctCell(g.majority, "podíl hlasů pro a proti odpovídajících většině skupiny")}</td>
        <td class="num" data-label="Výrazně rozdělená">${g.considered ? `${fmtNum(g.splits)} z ${fmtNum(g.considered)}<div class="small muted">${fmtPct(g.splits / g.considered)}</div>` : "–"}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="source">${sourceLine(idx)}</p>`;
}

// Prázdný stav frakce bez českých poslanců: stejný text na stránce i na kartě (zadání 20. 10. 2026).
const NO_CZ_TITLE = "Žádný český poslanec";
const NO_CZ_TEXT = "Za Česko v této frakci nyní nesedí žádný europoslanec.";
const czCountCs = (n) => (n ? `${fmtNum(n)} ${n === 1 ? "český poslanec" : n < 5 ? "čeští poslanci" : "českých poslanců"}` : "žádný český poslanec");
const formerParty = (m) => (m.party_then ? (m.party_then.short_label === "Ind." ? byGender(m, "nezávislý", "nezávislá") : m.party_then.short_label) : "");

// Frakce v Evropě: prvních 5 zemí a Česko (sloupce s textem), celá tabulka zemí a předsednictví se zdrojem.
function europeHtml(g) {
  const c = g.countries;
  if (!c) return "";
  const max = Math.max(...c.by_country.map((x) => x.n), 1);
  const rows = topCountries(c).map((x) => `<li class="cb-row${x.cz ? " cb-cz" : ""}"><span class="cb-name">${esc(x.cs || x.cc)}</span>
      <span class="cb-track" aria-hidden="true"><span style="width:${((x.n / max) * 100).toFixed(1)}%"></span></span><span class="cb-n">${fmtNum(x.n)}</span></li>`).join("");
  const chairs = g.chairs || [];
  const src = g.chairs_source;
  return `<h2>Frakce v Evropě</h2>
    <p class="small muted">${fmtNum(c.n_countries)} zemí · ${seatsCs(c.seats)} · k ${fmtDate(c.as_of)} (poslanci u posledního hlasování v datech)</p>
    <ol class="country-bars" aria-label="Počet poslanců frakce podle zemí: prvních pět zemí a Česko">${rows}</ol>
    <details class="links-more"><summary>Zobrazit všechny země</summary>
      <div class="table-wrap"><table class="cards"><caption class="sr-only">Poslanci frakce podle zemí</caption>
        <thead><tr><th>Země</th><th class="num">Poslanců</th></tr></thead>
        <tbody>${c.by_country.map((x) => `<tr${x.cc === "CZ" ? ' class="cb-cz"' : ""}><td>${esc(x.cs || x.cc)}</td><td class="num" data-label="Poslanců">${fmtNum(x.n)}</td></tr>`).join("")}</tbody></table></div>
    </details>
    ${chairs.length ? `<p>Předsednictví: ${chairs.map((x) => `${esc(x.name)} (${esc(x.country_cs || x.country || "")}), ${chairRole(x)}`).join("; ")}</p>` : ""}
    <p class="source">Složení: <a href="https://github.com/HowTheyVote/data">HowTheyVote.eu</a> (ODbL), data k ${fmtDate(c.as_of)}${src ? ` · předsednictví: <a href="${esc(src.url)}">EP Open Data</a> (CC BY 4.0), stav k ${fmtDate(src.updated)}` : ""}</p>`;
}

// Karta frakce ke sdílení (share.js, kind „group“): jen čísla a jména, která ukazuje stránka.
function groupShareContext(g, now, former, groups) {
  const path = `party?c=${encodeURIComponent(g.code)}`;
  const url = siteUrl(path);
  const name = g.name_cs || g.label;
  const partyLogo = (p) => (p ? PARTIES?.find((x) => String(x.id) === String(p.id)) : null);
  const chip = (p, m) => {
    const e = partyLogo(p);
    const label = p ? (p.short_label === "Ind." ? byGender(m, "nezávislý", "nezávislá") : p.short_label) : "";
    return { label, logo: e?.logo || null, aspect: e?.logo_aspect || null, color: e?.color || null };
  };
  const release = g.sources?.votes?.release;
  return {
    kind: "group", url, path, filename: `ep-watch-frakce-${g.code.toLowerCase()}`, subtitle: `Frakce · ${CZ_GROUP_LABEL[g.code] || g.short_label}`,
    text: `${name} v Evropském parlamentu: ${g.seats ? `${seatsCs(g.seats)} ${fromCountriesCs(g.n_countries)}, ` : ""}${czCountCs(g.cz_members)}. Zdroj: HowTheyVote.eu, EP Open Data, EP Watch CZ`,
    data: {
      name, short: CZ_GROUP_LABEL[g.code] || g.short_label, logo: g.logo, aspect: g.logo_aspect, color: g.color,
      seats: g.seats, nCountries: g.n_countries, czCount: g.cz_members, dataDay: release,
      tiles: [
        { label: "Účast skupiny na hlasování", pair: g.attendance, note: "hlasy pro, proti nebo zdržel se ze všech hlasů členů" },
        { label: "Hlasuje s většinou frakce", pair: g.majority, note: "hlasy pro a proti shodné s většinou skupiny" },
      ],
      members: now.map((m) => ({ name: displayName(m), ...chip(m.party, m), current: true })),
      former: former.map((m) => ({ name: displayName(m), ...chip(m.party_then, m), end: m.end, partyLabel: formerParty(m) })),
      noCz: { title: NO_CZ_TITLE, text: NO_CZ_TEXT },
      countries: g.countries ? { asOf: g.countries.as_of, seats: g.countries.seats, nCountries: g.countries.n_countries, rows: topCountries(g.countries) } : null,
      chairs: (g.chairs || []).map((x) => ({ name: x.name, country: x.country_cs || x.country, role: chairRole(x) })),
      chairsHeading: (g.chairs || []).length ? chairsHeading(g.chairs) : null,
      urlShort: url.replace(/^https?:\/\//, ""),
    },
  };
}

async function euDetailPage(code) {
  const [g, groups, parties] = await Promise.all([getJSON(`eugroups/${code}.json`).catch((e) => { throw e.status === 404 ? notFound("Frakci jsme nenašli.", "Zkratka frakce v adrese neodpovídá žádné politické skupině Evropského parlamentu.", [["party?v=eu", "Evropské frakce"], ["party", "České strany"]]) : e; }), getJSON("groups.json"), getJSON("parties.json").catch(soft([]))]);
  PARTIES = parties;
  document.title = `${capFirst(g.name_cs || g.label)} – EP Watch CZ`;
  const now = g.member_list.filter((m) => m.current !== false).sort((a, b) => (a.sort_label || a.name).localeCompare(b.sort_label || b.name, "cs"));
  const former = g.member_list.filter((m) => m.current === false);
  const rows = (list) => list.length ? `<div class="table-wrap"><table class="stack">
      <thead><tr><th class="num">Datum</th><th>Hlasování</th><th>Skupina</th><th>Výsledek</th></tr></thead>
      <tbody>${list.map((v) => voteRow(v, `<td class="extra cz">${splitBar(v.gc)}<div class="small">${czCountsHtml(v.gc)}</div></td>`)).join("")}</tbody></table></div>`
    : emptyState("Skupina se v žádném takovém hlasování nerozdělila.", "Zkuste zrušit filtr „jen závěrečná“.");
  main.innerHTML = `
    <div class="page-head"><p class="small"><a href="party?v=eu">← Všechny frakce</a></p><div class="head-acts">${SHARE_BTN_HTML}${viewSwitch("eu")}</div></div>
    ${g.logo ? `<div class="logo-row">${logoTile(g, 48)}</div>` : ""}
    <h1>${esc(capFirst(g.name_cs || g.label))} ${groupBadge(g.code, groups)}</h1>
    <p class="small">${g.seats ? `${seatsCs(g.seats)} ${fromCountriesCs(g.n_countries)} · ` : ""}${czCountCs(g.cz_members)}${g.web ? ` · <a class="ext" href="${esc(g.web)}" rel="noopener" title="Adresu webu uvádí Wikidata (CC0)">oficiální web</a>` : ""}</p>

    <h2>Čeští poslanci ve skupině</h2>
    ${now.length ? `<div class="table-wrap"><table class="cards">
      <thead><tr><th>Poslanec</th><th>Strana</th><th class="num">Účast na hlasování</th><th class="num">Hlasuje s frakcí</th></tr></thead>
      <tbody>${now.map((m) => `<tr>
        <td><div class="mep-cell"><img src="${photoUrl(m, true)}" alt="" loading="lazy" width="40" height="40"><a href="${mepUrl(m.id)}">${esc(displayName(m))}</a></div></td>
        <td class="wide" data-label="Strana">${m.party ? esc(m.party.short_label === "Ind." ? byGender(m, "nezávislý", "nezávislá") : m.party.short_label) : ""}</td>
        <td class="num" data-label="Účast na hlasování">${pctCell(m.total.attendance)}</td><td class="num" data-label="Hlasuje s frakcí">${pctCell(m.total.group_loyalty)}</td></tr>`).join("")}</tbody>
    </table></div>` : `<div class="empty-state"><p><strong>${NO_CZ_TITLE}</strong> ${NO_CZ_TEXT}</p></div>`}
    ${former.length ? `<p class="small muted">Dříve ve skupině: ${former.map((m) => `<a href="${mepUrl(m.id)}">${esc(displayName(m))}</a>${formerParty(m) ? ` (${esc(formerParty(m))})` : ""}, do ${fmtDate(m.end)}`).join(" · ")}</p>` : ""}

    ${europeHtml(g)}

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
  window.shareContext = () => groupShareContext(g, now, former, groups);
  document.getElementById("split-main")?.addEventListener("change", (e) => {
    document.getElementById("splits").innerHTML = rows(e.target.checked ? g.splits_list_main : g.splits_list);
    collapseTables(document.getElementById("splits"));
  });
  collapseTables(document.getElementById("splits"));
}

async function listPage() {
  const [idx, bench] = await Promise.all([getJSON("parties/index.json"), getJSON("benchmarks.json").catch(soft(null))]);
  // Nejdřív strany s nejvíc poslanci (pořadí podle ID nic neříká).
  const list = [...idx.parties].sort((a, b) => b.members - a.members || (a.name || a.short_label).localeCompare(b.name || b.short_label, "cs"));
  const epMed = bench?.ep?.attendance;
  main.innerHTML = `
    <div class="page-head"><h1>České strany v Evropském parlamentu</h1>${viewSwitch("cz")}</div>
    <div class="lead-row"><p class="lead">Souhrnné metriky poslanců jednotlivých stran v 10. volebním období.</p>${infoButton(`<p>Příslušnost ke straně se bere k datu hlasování. Nezávislí poslanci nejsou strana, a proto tu nejsou. Strany jsou řazené podle počtu poslanců. U stran s více poslanci je jednotnost přirozeně nižší: víc lidí, víc možností se rozejít. <a href="o-projektu#metodika">Jak počítáme</a>.</p>`)}</div>
    <div class="table-wrap"><table class="cards">
      <thead><tr><th>Strana</th><th class="num">Poslanců</th><th class="num">Účast na hlasování${epMed != null ? `<div class="small muted th-note">medián EP ${fmtPct(epMed)}</div>` : ""}</th>
        <th class="num">Jednotnost</th><th class="num">Hlasování, kde se strana rozdělila</th></tr></thead>
      <tbody>${list.map((p) => `<tr>
        <td>${entityCell(p, { name: p.name || p.short_label, href: partyUrl(p.id), sub: esc(p.short_label) })}</td>
        <td class="num" data-label="Poslanců">${p.members_now == null || p.members_now === p.members ? fmtNum(p.members)
          : `${p.members_now ? fmtNum(p.members_now) : "nikdo"}<div class="small muted">nyní · za období ${fmtNum(p.members)}</div>`}</td>
        <td class="num" data-label="Účast na hlasování">${pctCell(p.total.attendance)}</td>
        <td class="num" data-label="Jednotnost">${pctCell(p.cohesion, "všichni poslanci strany hlasovali stejně")}</td>
        <td class="num" data-label="Strana se rozdělila">${p.cohesion[1] ? `${fmtNum(p.splits_count)} z ${fmtNum(p.cohesion[1])}<div class="small muted">${fmtPct(p.splits_count / p.cohesion[1])}</div>` : '<span class="muted">vždy jen 1 poslanec</span>'}</td>
      </tr>`).join("")}</tbody>
    </table></div>
    <p class="source">${sourceLine(idx)}</p>`;
}

// Detail strany (s/{id}.html) vykresluje build (scripts/party_page.py, audit A1); tady jen přepínač a sbalení tabulek.
function detailIslands() {
  const onlyMain = document.getElementById("split-main");
  onlyMain?.addEventListener("change", () => {
    main.querySelectorAll(".split-list").forEach((el) => { el.hidden = (el.dataset.main === "1") !== onlyMain.checked; });
  });
  const splits = document.getElementById("splits");
  if (splits) collapseTables(splits);
}

(async () => {
  try {
    const code = param("c");
    if (code) {
      if (!/^[A-Z_]+$/.test(code)) throw new Error("Skupina nenalezena.");
      return await euDetailPage(code);
    }
    if (main.dataset.party) return detailIslands();
    if (param("v") === "eu") return await euListPage();
    await listPage();
  } catch (e) {
    showError(main, e);
  }
})();
