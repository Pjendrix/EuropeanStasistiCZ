// Skript stránky temata.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { CATEGORY_META, getJSON, loadCategories } from "../lib/data.js";
import { esc, fmtNum, fmtPct } from "../lib/format.js";
import { czCountsHtml, setNav, showError, sortable, sourceLine, splitBar } from "../lib/ui.js";
setNav("votes");
setNav("votes-topics");
(async () => {
  const tbody = document.querySelector("#topics tbody");
  try {
    const [d] = await Promise.all([getJSON("category_stats.json"), loadCategories()]);
    const ratio = (p) => (p && p[1] ? p[0] / p[1] : null);
    const rows = d.categories.map((c) => ({ ...c, united: ratio(c.cz_united_final), attendance: ratio(c.cz_attendance) }));
    const icon = (k) => (CATEGORY_META[k] ? `<span class="cat-ico sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CATEGORY_META[k].icon}</svg></span>` : "");
    const render = (list) => {
      tbody.innerHTML = list.map((c) => {
        const link = c.key === "none" ? "" : `<a href="votes.html?c=${c.key}&f=final">Seznam závěrečných</a>`;
        const cz = c.cz_final;
        return `<tr>
          <td class="title"><span class="cat-inline">${icon(c.key)}<strong>${esc(c.label)}</strong></span></td>
          <td class="num" data-label="Hlasování">${fmtNum(c.votes)}</td>
          <td class="num" data-label="Závěrečná">${fmtNum(c.final)}${c.final_trace ? `<div class="small"><a href="votes.html?c=${c.key}&f=final&stopa=1" title="Závěrečná hlasování, u kterých byl zpravodajem nebo stínovým zpravodajem poslanec z ČR">z toho ${fmtNum(c.final_trace)} s českou stopou</a></div>` : ""}</td>
          <td class="num" data-label="Češi jednotně">${c.united === null ? "–" : `${fmtPct(c.united)}<div class="small muted">${fmtNum(c.cz_united_final[0])} z ${fmtNum(c.cz_united_final[1])}</div>`}</td>
          <td class="extra cz wide" data-label="Jak hlasovali Češi (závěrečná)">${cz.some(Boolean) ? `${splitBar(cz)}<div class="small">${czCountsHtml(cz)}</div>` : "–"}</td>
          <td class="num" data-label="Účast Čechů">${c.attendance === null ? "–" : fmtPct(c.attendance)}</td>
          <td class="link-cell wide">${link}</td></tr>`;
      }).join("");
    };
    const columns = { label: (c) => c.label, votes: (c) => c.votes, final: (c) => c.final, united: (c) => c.united, attendance: (c) => c.attendance };
    sortable(document.getElementById("topics"), columns, () => rows, render, { key: "votes", dir: -1 });
    document.getElementById("source").innerHTML = sourceLine(d);
  } catch (e) {
    showError(tbody.closest(".table-wrap"), e);
  }
})();
