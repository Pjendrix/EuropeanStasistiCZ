// Skript stránky vote.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { getJSON, loadCategories, param, soft } from "../lib/data.js";
import { KIND_LABEL, POSITION_LABEL, RESULT_LABEL, RESULT_NOTE, adoptedTextUrl, czCountsText, displayName, esc, fmtDate, fmtMonth, groupColor, groupMajorityLabel, isFinal, procedureUrl, resultSentence, resultText, siteUrl, voteTitle } from "../lib/format.js";
import { askAiBox, compareCard, csvButton, czDots, czGeoTag, czPartyRows, czPartyRowsHtml, groupBadge, kindTag, logoTile, mepUrl, partyBadge, resultHtml, setNav, shareButton, shareCardParties, showError, splitBar, topicChips, topicText, voteMeaningHtml } from "../lib/ui.js";
setNav("votes");
const main = document.getElementById("main");
const KEYS = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];

(async () => {
  try {
    // Parametry z URL jen v očekávaném tvaru (audit B1: m se jinak dostal do cesty k souboru i do HTML).
    if (!/^\d+$/.test(param("id") || "")) throw new Error("Hlasování nenalezeno.");
    const id = Number(param("id"));
    const [shard, mepsDoc, groups, parties] = await Promise.all([
      // Jedno hlasování (≈ 7 kB) místo celého měsíce (audit A4); soubory vznikají při sestavení webu (build_shards.py).
      getJSON(`votes/id/${id}.json`).catch(() => { throw new Error("Hlasování nenalezeno."); }),
      getJSON("overview.json"), getJSON("groups.json"), getJSON("parties.json"),
    ]);
    const v = shard.vote, foundMonth = v.month;
    document.title = `${voteTitle(v)} – EP Watch CZ`; // nadpis stránky se upřesní níže
    const meps = Object.fromEntries(mepsDoc.meps.map((m) => [m.id, m]));
    const cz = v.cz_positions.filter((p) => {
      const m = meps[p.member_id];
      return m && m.mandates.some((x) => x.start <= v.date && (!x.end || v.date <= x.end));
    });
    const c = v.counts;
    const total = [c.for, c.against, c.abstention, c.did_not_vote];
    const czCounts = KEYS.map((k) => cz.filter((p) => p.position === k).length);
    const czGroups = new Set(cz.map((p) => p.group_code));
    const groupRows = Object.entries(v.group_counts).sort((a, b) => (b[1].reduce((x, y) => x + y) - a[1].reduce((x, y) => x + y)));
    const topics = [...v.topics.oeil.map((t) => t.label), ...v.topics.eurovoc.map((t) => t.label), ...v.topics.geo.map((t) => t.label)];
    const kind = v.vote_kind;
    const inverted = v.inverted ?? kind === "rejection";
    const desc = v.description_cs || v.description;
    const kv = { ...v, vote_kind: kind, inverted, description_cs: desc };
    const final = isFinal({ ...v, vote_kind: kind });
    // Nadpis = o čem se hlasovalo; název zákona/zprávy jako podtitul.
    const heading = final ? voteTitle(v) : (desc || (kind ? KIND_LABEL[kind] : "") || voteTitle(v));
    // U dílčích hlasování odkaz na závěrečné hlasování téže reference (pokud proběhlo; připravil build_shards.py).
    const finalVote = final ? null : shard.final_vote;
    const adopted = adoptedTextUrl(v.texts_adopted_reference);
    // Česká stopa: kdo z českých poslanců byl zpravodajem a kdo stínovým zpravodajem zprávy (data/vote_roles.json z own_work.json).
    const roles = ((await getJSON("vote_roles.json").catch(soft(null)))?.votes || {})[String(v.id)] || [];
    const roleLinks = (kinds) => roles.filter((r) => kinds.includes(r.role)).map((r) => meps[r.mep_id])
      .filter(Boolean).map((m) => `<a href="${mepUrl(m.id)}">${esc(displayName(m))}</a>`).join(", ");
    const trace = roles.length ? `<p class="small" id="ceska-stopa"><strong>Česká stopa:</strong>
      ${roleLinks(["rapporteur", "co"]) ? `zpravodaj/ka ${roleLinks(["rapporteur", "co"])}` : ""}${roleLinks(["rapporteur", "co"]) && roleLinks(["shadow"]) ? " · " : ""}
      ${roleLinks(["shadow"]) ? `stínoví zpravodajové z ČR: ${roleLinks(["shadow"])}` : ""}
      <span class="muted">(zpráva ${esc([...new Set(roles.map((r) => r.report).filter(Boolean))].join(", "))}; zdroj EP Open Data)</span></p>` : "";

    // Kontext pro tlačítko „Sdílet“ (share.js): stejná čísla jako na stránce, nic nového.
    const pageUrl = siteUrl(final ? `v/${v.id}` : `vote?id=${v.id}&m=${foundMonth}`);
    const dataDay = (await getJSON("overview.json").catch(soft(null)))?.sources?.votes?.release || v.date;
    const cardParties = shareCardParties(czPartyRows(cz, meps, parties, groups));
    // Téma: stejná data jako čip v seznamu hlasování (data/vote_cats.json z categories_for).
    await loadCategories();
    const cats = ((await getJSON("vote_cats.json").catch(soft(null)))?.votes || {})[String(v.id)] || [];
    const topic = topicText(cats);
    const citeSentence = `Evropský parlament ${fmtDate(v.date)}, ${voteTitle(v)}${kind ? ` (${KIND_LABEL[kind]}${topic ? `, téma ${topic}` : ""})` : (topic ? ` (téma ${topic})` : "")}${desc && !final ? `, ${desc}` : ""}: ${resultText(kv)}, ${c.for} pro, ${c.against} proti, ${c.abstention} se zdrželo. Čeští poslanci v mandátu: ${czCounts[0]} pro, ${czCounts[1]} proti, ${czCounts[2]} se zdrželo, ${czCounts[3]} nehlasovalo. Zdroj: HowTheyVote.eu (${v.source_url}).`;
    window.shareContext = () => ({
      kind: "vote", url: pageUrl, filename: `ep-watch-hlasovani-${v.id}`, subtitle: `Hlasování · ${fmtDate(v.date)}${topic ? ` · ${topic}` : ""}`, cite: citeSentence,
      text: `${voteTitle(v)} (${fmtDate(v.date)}): ${resultSentence(kind || (final ? "final" : ""), v.result)}. Češi: ${czCountsText(czCounts)}. Zdroj: HowTheyVote.eu, EP Watch CZ`,
      data: {
        title: heading, subtitle: [final ? desc : voteTitle(v), v.reference].filter(Boolean).join(" · "), date: v.date, kindLabel: kind ? KIND_LABEL[kind] : "hlasování",
        result: v.result, resultLabel: RESULT_LABEL[v.result] || "neuveden", sentence: resultSentence(kind || (final ? "final" : ""), v.result),
        ep: [c.for, c.against, c.abstention, c.did_not_vote], parties: cardParties, dataDay,
        urlShort: pageUrl.replace(/^https?:\/\//, ""), topic: topic || null, ...(roles.length ? { trace: true } : {}),
      },
    });
    main.innerHTML = `
      <div class="back-row"><p class="small"><a href="votes?m=${encodeURIComponent(foundMonth)}">← Hlasování v měsíci ${fmtMonth(foundMonth)}</a></p>${shareButton()}</div>
      <p class="muted vote-meta" style="margin-bottom:.3rem"><span>${fmtDate(v.date)}</span>${topicChips(cats, { max: 4, link: true, id: String(v.id), info: true })}${czGeoTag(v)}${kind ? kindTag(kv) : (v.is_main ? '<span class="tag">hlavní hlasování</span>' : "<span>dílčí hlasování</span>")}</p>
      <h1>${esc(heading)}</h1>
      ${final ? (desc ? `<p class="muted vote-desc">${esc(desc)}${v.reference ? ` · ${esc(v.reference)}` : ""}</p>` : "") :
        `<p class="lead vote-desc" style="margin-bottom:.5rem">${esc(voteTitle(v))}${v.reference ? ` <span class="small">(${esc(v.reference)})</span>` : ""}</p>`}
      ${v.title_cs ? "" : v.procedure?.title && v.procedure.title !== voteTitle(v) ? `<p class="vote-desc">${esc(v.procedure.title)}</p>` : ""}
      ${procedureUrl(v.procedure?.reference) ? `<p class="small story-link"><a href="${procedureUrl(v.procedure.reference)}">Příběh zákona: celý průběh a všechna hlasování k ${esc(v.procedure.reference)} <span aria-hidden="true">→</span></a></p>` : ""}
      ${voteMeaningHtml(kind || (inverted ? "rejection" : v.is_main ? "final" : ""))}
      ${finalVote ? `<p class="small">Toto je ${esc(KIND_LABEL[kind] || "dílčí hlasování")}. Závěrečné hlasování o celém textu:
        <a href="v/${finalVote.id}">${fmtDate(finalVote.date)}, ${RESULT_LABEL[finalVote.result] || "výsledek neuveden"}</a>.</p>` : ""}
      <details class="links-more"><summary>zdroje a odkazy</summary><p class="small">
        ${final ? `<a href="v/${v.id}">Trvalý odkaz</a> · ` : ""}
        <a href="${esc(v.source_url)}">Originál na HowTheyVote.eu</a>
        ${adopted ? ` · <a href="${esc(adopted)}">Přijatý text (PDF, EP)</a>` : ""}
        ${v.procedure?.reference ? ` · <a href="https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference=${encodeURIComponent(v.procedure.reference)}">Legislativní observatoř (${esc(v.procedure.reference)})</a>` : ""}
      </p>
      ${v.title_cs && v.title && v.title !== v.title_cs ? `<p class="small muted">Český název je oficiální název procedury z EP Open Data. Původní název hlasování (HowTheyVote.eu): ${esc(v.title)}</p>` : ""}</details>

      ${trace}
      ${askAiBox({ v, kind, final, desc, adopted, c })}

      <div class="metrics">
        <div class="card metric"><div class="label">Výsledek</div>
          <div class="value-sentence">${esc(resultSentence(kind || (final ? "final" : ""), v.result))}</div>
          <div class="detail">${resultHtml(kv)}</div>
          ${RESULT_NOTE[v.result ?? null] ? `<div class="detail">${esc(RESULT_NOTE[v.result ?? null])}</div>` : ""}
          <div class="detail">celý parlament · <a href="${esc(v.source_url)}">zdroj</a></div>
</div>
        ${compareCard(total, czCounts, v.source_url)}
      </div>

      <h2>Jak hlasovali Češi</h2>
      <div class="cz-views" data-view="party">
        <div class="view-switch" role="group" aria-label="Způsob zobrazení"><button type="button" data-cz-view="party" aria-pressed="true">Podle stran</button><button type="button" data-cz-view="vote" aria-pressed="false">Podle hlasu</button></div>
        <div class="cz-by-party">${czPartyRowsHtml(czPartyRows(cz, meps, parties, groups))}</div>
        <div class="cz-by-vote">
          ${czDots(cz, meps, groups)}
          <div class="positions-grid">
            ${KEYS.filter((k) => czCounts[KEYS.indexOf(k)] > 0).map((k) => {
              const list = cz.filter((p) => p.position === k)
                .sort((a, b) => displayName(meps[a.member_id]).localeCompare(displayName(meps[b.member_id]), "cs"));
              return `<div class="card"><h3 class="pos pos-${k}">${POSITION_LABEL[k]} (${list.length})</h3>
                <ul class="plain">${list.map((p) => `<li><a href="${mepUrl(p.member_id)}">${esc(displayName(meps[p.member_id]))}</a>
                  <div>${groupBadge(p.group_code, groups)} ${p.national_party_id ? partyBadge(p.national_party_id, p.national_party, parties, meps[p.member_id]) : ""}</div></li>`).join("")}</ul></div>`;
            }).join("")}
          </div>
          ${KEYS.some((k, i) => !czCounts[i]) ? `<p class="small muted">Nikdo z Čechů: ${KEYS.filter((k, i) => !czCounts[i]).map((k) => POSITION_LABEL[k]).join(", ")}.</p>` : ""}
        </div>
      </div>
      <div class="legend" aria-hidden="true">
        <span><i style="background:var(--for)"></i>pro</span><span><i style="background:var(--against)"></i>proti</span>
        <span><i style="background:var(--abst)"></i>zdržel/a se</span><span><i class="absent"></i>nehlasoval/a</span>
      </div>
      <div id="cz-csv"></div>
      <p class="source">Strana a frakce k datu hlasování, jen poslanci v mandátu. Zdroj: <a href="${esc(v.source_url)}">HowTheyVote.eu</a>.</p>

      <details class="explain wide"><summary><strong>Jak hlasovaly frakce</strong> · ${groupRows.length} frakcí, zvýrazněné ty s Čechy</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Frakce</th><th class="num">Pro</th><th class="num">Proti</th><th class="num">Zdrž.</th><th class="num">Nehl.</th><th>Většina frakce</th><th>Rozložení</th></tr></thead>
        <tbody>${groupRows.map(([code, row]) => `<tr class="${czGroups.has(code) ? "cz-row" : ""}"><td><span class="dot" style="background:${groupColor(groups.find((x) => x.code === code))}"></span> <span class="logo-row" style="margin:0;flex-wrap:nowrap"><span class="logo-slot">${logoTile(groups.find((x) => x.code === code), 20)}</span>${groupBadge(code, groups)}</span></td>
          ${row.map((n) => `<td class="num">${n}</td>`).join("")}<td>${groupMajorityLabel(row) || '<span class="muted">bez jasné většiny</span>'}</td><td>${splitBar(row)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="small muted">Zvýrazněné řádky jsou frakce, ve kterých sedí čeští poslanci. Většina frakce = jednoznačně nejvíc hlasů pro, proti nebo zdržet se.</p>
      <p class="source">Počty spočítané z hlasování jednotlivých poslanců. Zdroj: <a href="${esc(v.source_url)}">HowTheyVote.eu</a>.</p></details>

      ${topics.length ? `<h2>Témata</h2><p>${topics.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</p>
        <p class="source">Témata (OEIL, EuroVoc) přebíráme z HowTheyVote.eu v angličtině.</p>` : ""}
    `;
    document.getElementById("cz-csv").appendChild(csvButton(`hlasovani-${v.id}-cesi.csv`, () => [
      ["hlasovani_id", "datum", "poslanec_id", "poslanec", "volba", "frakce", "strana"],
      ...cz.map((p) => [v.id, v.date, p.member_id, displayName(meps[p.member_id]), p.position, p.group_code, p.national_party || ""]),
    ], "Stáhnout hlasy Čechů (CSV)"));
  } catch (e) {
    showError(main, e);
  }
})();
