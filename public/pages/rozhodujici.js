// Skript stránky rozhodujici.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { getJSON, soft } from "../lib/data.js";
import { COUNTRY_CS, HTV_SOURCE, KIND_LABEL, RESULT_LABEL, esc, fmtDate, fmtNum, isFinal, siteUrl, spanText, voteSubtitle, voteTitle } from "../lib/format.js";
import { delegationTable, infoButton, kindTag, namesByPosition, resultHtml, setNav, shareButton, showError, sourceLine } from "../lib/ui.js";
setNav("analyses");
setNav("decisive");
(async () => {
  const el = document.getElementById("list");
  try {
    const [d, overview, dl] = await Promise.all([getJSON("decisive.json"), getJSON("overview.json"), getJSON("delegations.json").catch(soft(null))]);
    const meps = Object.fromEntries(overview.meps.map((m) => [m.id, m]));
    document.getElementById("summary").textContent =
      `Těsných hlasování: ${fmtNum(d.close_count)} (z toho závěrečných ${fmtNum(d.close_count_main)}). ` +
      `Rozhodly české hlasy: ${fmtNum(d.votes.length)}, z toho závěrečných ${fmtNum(d.decisive_final ?? d.votes.filter(isFinal).length)}.`;
    const finals = d.decisive_final ?? d.votes.filter(isFinal).length;
    document.getElementById("headline").textContent = finals
      ? `České hlasy rozhodly ${fmtNum(finals)} ${finals === 1 ? "závěrečné hlasování" : finals < 5 ? "závěrečná hlasování" : "závěrečných hlasování"} o celém textu nebo prozatímní dohodě.`
      : "Žádné závěrečné hlasování o celém textu české hlasy nerozhodly.";
    if (dl && dl.peers.length) {
      const r = dl.peer_range, names = dl.peers.map((c) => COUNTRY_CS[c] || c).join(", ");
      document.getElementById("peers").innerHTML = `<div class="card note"><p><strong>Pro srovnání:</strong> u delegací s ${dl.seats_range[0]}–${dl.seats_range[1]} poslanci vychází takových hlasování ${spanText(r.decisive, fmtNum)}, z toho závěrečných ${spanText(r.decisive_final, fmtNum)}. U české delegace ${fmtNum(d.votes.length)}, z toho ${fmtNum(finals)}.${infoButton(`<p>Porovnáváme delegace: ${esc(names)}. Stejně by se dalo spočítat pro kteroukoli skupinu 21 poslanců. Neznamená to, že čeští poslanci měli větší vliv než jiné delegace.</p>`)}</p>
        <details><summary>Čísla jednotlivých delegací</summary>${delegationTable(dl, [
          { label: "Rozhodující hlasování", get: (m) => fmtNum(m.decisive.all) },
          { label: "z toho závěrečných", get: (m) => fmtNum(m.decisive.final) },
        ])}<p class="small muted">${esc(dl.definition)}</p></details></div>`;
    }
    document.getElementById("source").innerHTML = sourceLine(d);
    // Sdílet pohled: prvních pár hlasování ve stejném pořadí jako na stránce.
    const day = overview.sources?.votes?.release || overview.period.to;
    const url = siteUrl("rozhodujici");
    window.shareContext = () => ({
      kind: "split", url, filename: "ep-watch-rozhodujici", subtitle: "Kde rozhodly české hlasy",
      trust: "Karta ukazuje jen první řádky seznamu. Datum dat, zdroj a adresa jsou na ní.",
      text: "Těsná hlasování v Evropském parlamentu, která by bez českých hlasů dopadla opačně. Zdroj: HowTheyVote.eu, EP Watch CZ",
      data: {
        title: "Kde rozhodly české hlasy", total: d.votes.length, dataDay: day,
        lead: `Těsná hlasování, která by bez českých hlasů pro a proti dopadla opačně: ${fmtNum(d.votes.length)}, z toho závěrečných ${fmtNum(d.decisive_final ?? d.votes.filter(isFinal).length)}.`,
        rows: d.votes.map((v) => ({ meta: [fmtDate(v.date), KIND_LABEL[v.vote_kind] || "", RESULT_LABEL[v.result] || ""].filter(Boolean).join(" · "),
          title: voteTitle(v), score: `${v.counts.for} : ${v.counts.against}`, scoreSub: `celý EP · Češi ${v.cz[0]} : ${v.cz[1]}` })),
        urlShort: url.replace(/^https?:\/\//, ""),
      },
    });
    if (d.votes.length) document.getElementById("share-slot").outerHTML = shareButton("view", "Sdílet pohled");
    el.className = "";
    const PAGE = 10;
    let shown = PAGE;
    const card = (v) => {
      const c = v.counts;
      return `<div class="card list-card">
        <div class="small muted">${fmtDate(v.date)} ${kindTag(v)}</div>
        <a class="vote-title" href="vote?id=${v.id}&m=${v.month}">${esc(voteTitle(v))}</a>
        <div class="small muted">${esc(voteSubtitle(v))}</div>
        <p class="small">Výsledek: <span class="result-${v.result}">${resultHtml(v)}</span>
          (${c.for} pro : ${c.against} proti, rozdíl ${Math.abs(c.for - c.against)}).
          Bez Čechů (${v.cz[0]} pro, ${v.cz[1]} proti) by to bylo ${c.for - v.cz[0]} : ${c.against - v.cz[1]},
          tedy <span class="result-${v.alternative_result}">${RESULT_LABEL[v.alternative_result]}</span>.
          <a href="${HTV_SOURCE}/votes/${v.id}">zdroj</a></p>
        <details class="names"><summary class="small">Jak hlasovali Češi (${v.cz[0]} pro, ${v.cz[1]} proti)</summary>${namesByPosition(v.positions, meps, ["FOR", "AGAINST"])}</details>
      </div>`;
    };
    const draw = () => {
      el.innerHTML = d.votes.length ? d.votes.slice(0, shown).map(card).join("") +
        (d.votes.length > shown ? `<button type="button" class="more-btn" id="more">Zobrazit další (${Math.min(PAGE, d.votes.length - shown)} z ${d.votes.length - shown})</button>` : "")
        : '<p class="muted">Žádné rozhodující hlasování.</p>';
      document.getElementById("more")?.addEventListener("click", () => { shown += PAGE; draw(); });
    };
    draw();
  } catch (e) {
    showError(el, e);
  }
})();
