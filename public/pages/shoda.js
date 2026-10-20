// Skript stránky shoda.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { getJSON, param } from "../lib/data.js";
import { displayName, esc, fmtNum, fmtPct, isActive, pct } from "../lib/format.js";
import { csvButton, groupLink, mepUrl, setNav, showError, sourceLine } from "../lib/ui.js";
setNav("analyses");
setNav("agreement");
const LIMIT = 50;
(async () => {
  const el = document.getElementById("matrix");
  try {
    const [d, groups] = await Promise.all([getJSON("agreement.json"), getJSON("groups.json")]);
    document.getElementById("source").innerHTML = sourceLine(d);
    const former = document.getElementById("former");
    const anchor = document.getElementById("anchor");
    anchor.innerHTML += d.meps.map((m) => `<option value="${m.id}">${esc(displayName(m))}</option>`).join("");
    const pre = param("id");
    if (pre && d.meps.some((m) => String(m.id) === pre)) anchor.value = pre;
    if (pre && !d.meps.find((m) => String(m.id) === pre && isActive(m)) && d.meps.some((m) => String(m.id) === pre)) former.checked = true;
    const cell = (a, b) => (d.matrix[String(a.id)] || {})[String(b.id)];
    const render = () => {
      let list = d.meps.filter((m) => former.checked || isActive(m));
      const a = d.meps.find((m) => String(m.id) === anchor.value);
      if (a) {
        list = list.filter((m) => m.id !== a.id).sort((x, y) => (pct(cell(a, y) || [0, 0]) ?? -1) - (pct(cell(a, x) || [0, 0]) ?? -1));
        list.unshift(a);
      }
      history.replaceState(null, "", a ? `?id=${a.id}` : "?");
      const td = (r, c) => {
        if (r.id === c.id) return '<td class="mx-self">—</td>';
        const v = cell(r, c);
        if (!v || !v[1]) return '<td class="mx-none">–</td>';
        const p = v[0] / v[1];
        const weak = v[1] < LIMIT;
        const shade = Math.max(0, (p - 0.3) / 0.7); // barva rozlišuje hlavně rozsah 30–100 %
        return `<td class="mx ${weak ? "mx-weak" : ""}" style="--p:${weak ? 0 : shade.toFixed(3)}" title="${esc(displayName(r))} a ${esc(displayName(c))}: ${fmtPct(p)} (${v[0]} z ${v[1]})">
          ${Math.round(p * 100)}<small>${fmtNum(v[1])}</small></td>`;
      };
      el.className = "table-wrap";
      el.innerHTML = `<table class="matrix"><thead><tr><th class="sticky-col">Poslanec</th>${list.map((c) =>
        `<th class="mx-head"><a href="${mepUrl(c.id)}" title="${esc(displayName(c))}">${esc(c.family_name || c.name)}</a></th>`).join("")}</tr></thead>
        <tbody>${list.map((r) => `<tr><th class="sticky-col mx-row"><a href="${mepUrl(r.id)}">${esc(displayName(r))}</a>
          <div>${groupLink(null, groups, r.group?.code)}</div></th>${list.map((c) => td(r, c)).join("")}</tr>`).join("")}</tbody></table>`;
    };
    former.addEventListener("change", render);
    anchor.addEventListener("change", render);
    render();
    el.before(csvButton("shoda-cesi.csv", () => {
      const ms = d.meps.filter((m) => former.checked || isActive(m));
      return [["poslanec_id", "poslanec", ...ms.map((m) => displayName(m))],
        ...ms.map((r) => [r.id, displayName(r), ...ms.map((c) => {
          const v = r.id === c.id ? null : cell(r, c);
          return v && v[1] ? `${v[0]}/${v[1]}` : "";
        })])];
    }, "Stáhnout matici (CSV: stejně/oba hlasovali)"));
  } catch (e) {
    showError(el, e);
  }
})();
