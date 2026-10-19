// Skript stránky prace.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { getJSON } from "../lib/data.js";
import { CZ_GROUP_LABEL, displayName, esc, fmtDate, fmtMonth, fmtNum, fmtPct } from "../lib/format.js";
import { infoButton, mepUrl, setNav, showError } from "../lib/ui.js";
setNav("work");
setNav("work-overview");
(async () => {
  const kpis = document.getElementById("kpis");
  try {
    const [h, ov, groups] = await Promise.all([getJSON("work_hub.json"), getJSON("overview.json"), getJSON("groups.json")]);
    const meps = Object.fromEntries(ov.meps.map((m) => [m.id, m]));
    const t = h.totals;
    const card = (label, value, details) => `<div class="card metric"><div class="label">${label}</div><div class="value">${value}</div>${details.filter(Boolean).map((d) => `<div class="detail">${d}</div>`).join("")}</div>`;
    kpis.innerHTML = [
      card("Zprávy, které vedou", fmtNum(t.reports_lead), ["zpravodajové z ČR, každý text jednou", `${fmtNum(t.opinions)} stanovisek výborů (zpravodaj i stínoví)`]),
      card("Zprávy, které vyjednávají", fmtNum(t.reports_shadow), [`stínoví zpravodajové za frakci; z vedených a stínových zpráv přijal Parlament ${fmtNum(t.reports_adopted)}`]),
      t.speeches != null ? card("Ústní projevy v plénu", fmtNum(t.speeches), [`celkem asi ${fmtNum(t.speeches_minutes)} min`, `${fmtNum(t.written_statements)} písemných prohlášení zvlášť`]) : "",
      card("Otázky Komisi a Radě", fmtNum(t.questions), ["písemné, přednostní i ústní"]),
      t.presence ? card("Docházka na zasedání", fmtPct(t.presence[0] / t.presence[1]), [`${fmtNum(t.presence[0])} z ${fmtNum(t.presence[1])} poslaneckých dnů jednání podle prezenční listiny EP`]) : "",
    ].join("");

    // časová osa: dvě řady pod sebou, stejná stavba jako graf účasti na profilu
    const max = (k) => Math.max(1, ...h.timeline.map((x) => x[k]));
    const series = (k, label) => `<h3 style="margin:.2rem 0 .3rem">${label}</h3><div class="chart-wrap"><div class="chart-y"><span>${fmtNum(max(k))}</span><span></span><span>0</span></div>
      <div class="chart" role="img" aria-label="${esc(label)} po měsících">${h.timeline.map((x, i) => {
        const [y, m] = x.month.split("-");
        return `<span class="col" title="${esc(`${fmtMonth(x.month)}: ${x[k]}`)}"><span class="bar-fill ${x[k] ? "" : "zero"}" style="height:${(x[k] / max(k)) * 100}%"></span>
          <span class="col-label${i === 0 || m === "01" || Number(m) % 3 === 1 ? "" : " col-sparse"}" aria-hidden="true">${Number(m)}${i === 0 || m === "01" ? `<br><b>${y.slice(2)}</b>` : ""}</span></span>`;
      }).join("")}</div></div>`;
    document.getElementById("timeline").className = "";
    // období a co znamená sloupec (audit UX 2026-10-18)
    const tl = h.timeline;
    document.getElementById("timeline").innerHTML = series("speeches", "Ústní projevy") + series("questions", "Otázky Komisi a Radě") +
      (tl.length ? `<p class="chart-ctx small muted">Období: ${fmtMonth(tl[0].month)} – ${fmtMonth(tl.at(-1).month)} · Sloupec = počet za měsíc za všechny české poslance dohromady (projevy jen v době mandátu; otázka se počítá jednou, i když ji podepsalo víc poslanců).</p>` : "");

    document.querySelector("#proc tbody").innerHTML = h.by_process.map((r) => `<tr><td>${esc(r.label)} <span class="small muted">${esc(r.process_type)}</span></td>
      <td class="num" data-label="Vedou">${fmtNum(r.reports_lead)}</td><td class="num" data-label="Stínoví">${fmtNum(r.reports_shadow)}</td><td class="num" data-label="Přijato">${fmtNum(r.adopted)}</td></tr>`).join("");

    const who = (ids) => ids.map((id) => meps[id] ? `<a href="${mepUrl(id)}">${esc(displayName(meps[id]))}</a>` : "").filter(Boolean).join(", ");
    const recent = document.getElementById("recent");
    recent.className = "";
    recent.innerHTML = `<div class="hub-lists hub-cards">${h.recent_adopted.map((r) => `<div class="card hub-vote"><div class="small muted">${fmtDate(r.date)} · ${esc(r.report || "")}${r.legislative ? " · legislativní" : ""}</div>
      <a class="vote-title" href="vote?id=${r.vote_id}&m=${esc((r.date || "").slice(0, 7))}">${esc(r.title || r.report)}</a>
      <div class="small">${r.lead.length ? `Zpravodaj/ka: ${who(r.lead)}` : ""}${r.lead.length && r.shadow.length ? " · " : ""}${r.shadow.length ? `stínoví: ${who(r.shadow)}` : ""}</div></div>`).join("")}</div>`;

    document.querySelector("#groups tbody").innerHTML = h.by_group.map((g) => {
      const go = groups.find((x) => x.ep_code === g.code);
      const avg = (n) => `<div class="small muted">Ø ${(n / g.meps).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} na poslance</div>`;
      return `<tr><td><strong>${esc(go ? (CZ_GROUP_LABEL[go.code] || go.short_label) : g.short_label)}</strong></td><td class="num" data-label="Poslanců">${fmtNum(g.meps)}</td>
        <td class="num" data-label="Zprávy – vedou">${fmtNum(g.reports_lead)}${avg(g.reports_lead)}</td><td class="num" data-label="Zprávy – stínové">${fmtNum(g.reports_shadow)}${avg(g.reports_shadow)}</td>
        <td class="num" data-label="Stanoviska">${fmtNum(g.opinions)}${avg(g.opinions)}</td><td class="num" data-label="Projevy">${fmtNum(g.speeches)}${avg(g.speeches)}</td><td class="num" data-label="Otázky">${fmtNum(g.questions)}${avg(g.questions)}</td></tr>`;
    }).join("");
    document.getElementById("source").innerHTML = `Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> · <a href="https://howtheyvote.eu">HowTheyVote.eu</a> · aktualizováno ${fmtDate(h.updated)}${h.complete ? "" : " (data nejsou úplná)"}` + infoButton(
      `<p>EP Open Data (CC BY 4.0), výsledky hlasování HowTheyVote.eu (ODbL). Počty spočítal skript <a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/work_hub.py">work_hub.py</a>. Pozměňovací návrhy ve výborech tu nejsou: strojově čitelná data jsou naposledy z února 2026.</p>`, "Zdroj a metodika");
  } catch (e) {
    showError(kpis, e);
  }
})();
