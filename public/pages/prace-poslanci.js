// Skript stránky prace-poslanci.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { getJSON } from "../lib/data.js";
import { byGender, CZ_GROUP_LABEL, displayName, esc, fmtDate, fmtNum, fmtPct, isActive, nameHtml, pct } from "../lib/format.js";
import { avatar, csvButton, logoTile, mepUrl, setNav, showError, sortable } from "../lib/ui.js";
setNav("work");
setNav("work-table");
(async () => {
  const tbody = document.querySelector("#work tbody");
  try {
    const [w, groups, parties] = await Promise.all([getJSON("work.json"), getJSON("groups.json"), getJSON("parties.json")]);
    const KEYS = ["lead_reports", "lead_opinions", "shadow_reports", "shadow_opinions"];
    const TIER = { top: ["▲", "horní třetina delegace"], mid: ["●", "střední třetina delegace"], low: ["▼", "dolní třetina delegace"] };
    const rows = w.meps.map((m) => ({ m, d: m.delegation }));
    const current = rows.filter((r) => r.d);
    const former = rows.filter((r) => !r.d && !isActive(r.m) && (KEYS.some((k) => r.m[k]) || r.m.motions_signed));
    const columns = { name: (r) => r.m.sort_label || r.m.name, motions_signed: (r) => r.m.motions_signed, attendance: (r) => pct(r.m.attendance), speeches: (r) => r.m.speeches ?? -1, presence: (r) => (r.m.presence && r.m.presence.days ? r.m.presence.present / r.m.presence.days : -1) };
    const FN = { committee: { CHAIR: ["předseda", "předsedkyně"], CHAIR_VICE: ["místopředseda", "místopředsedkyně"] },
      group: { CHAIR: ["předseda", "předsedkyně"], CHAIR_VICE: ["místopředseda", "místopředsedkyně"], MEMBER_BUREAU: ["člen předsednictva", "členka předsednictva"] } };
    const fnLabel = (m, f) => `${byGender(m, ...FN[f.kind][f.role])} ${f.kind === "committee" ? `výboru <abbr title="${esc(f.name_cs || "")}">${esc(f.code)}</abbr>` : "frakce"}`;
    const fnLine = (m) => (m.functions || []).length ? `<div class="small fn-line">${m.functions.map((f) => fnLabel(m, f)).join(" · ")}</div>` : "";
    const epMedian = w.attendance_ep_median;
    KEYS.forEach((k) => { columns[k] = (r) => r.m[k]; });
    const adopted = { lead_reports: "lead_adopted", shadow_reports: "shadow_adopted" };
    const TIER_LABEL = { lead_reports: "Zprávy – vede", lead_opinions: "Stanoviska – vede", shadow_reports: "Zprávy – za frakci", shadow_opinions: "Stanoviska – za frakci" };
    const GRP = new Set(["lead_reports", "shadow_reports"]);
    const tierCell = (r, k) => {
      const t = r.d.tiers[k];
      const skipped = r.d.tiers_skipped;
      const chip = skipped ? '<span class="tier tier-none" title="kratší mandát, nesrovnává se">–<span class="sr-only"> kratší mandát, nesrovnává se</span></span>'
        : t ? `<span class="tier tier-${t}" title="${TIER[t][1]}"><span aria-hidden="true">${TIER[t][0]}</span><span class="sr-only">${TIER[t][1]}</span></span>`
        : '<span class="tier tier-none" aria-hidden="true">–</span>';
      const passed = adopted[k] && r.m[k] ? `<div class="small muted">prošlo ${fmtNum(r.m[adopted[k]])}</div>` : "";
      return `<td class="num${GRP.has(k) ? " grp-start" : ""}" data-label="${TIER_LABEL[k]}"><span class="count">${fmtNum(r.m[k])}</span>${chip}${passed}</td>`;
    };
    const partyLogo = (r) => { const p = parties.find((x) => x.id === r.m.party?.id); const t = p && !p.independent ? logoTile(p, 22) : "";
      return t ? `<span class="logo-slot sm mep-party-logo">${t}</span>` : ""; };
    const cell = (r) => `<td><div class="mep-cell wide">${avatar(r.m, 40)}<div><a href="${mepUrl(r.m.id)}">${nameHtml(r.m)}</a>
        <div class="small muted">${esc((() => { const g = groups.find((x) => x.ep_code === r.m.group?.code); return g ? (CZ_GROUP_LABEL[g.code] || g.short_label) : (r.m.group?.short_label || ""); })())}${r.m.party ? ` · ${esc(r.m.party.short_label === "Ind." ? byGender(r.m, "nezávislý", "nezávislá") : r.m.party.short_label)}` : ""}${r.d?.mandate_from ? ` · mandát od ${fmtDate(r.d.mandate_from)}` : ""}</div>${fnLine(r.m)}</div>${partyLogo(r)}</div></td>`;
    const render = (list) => {
      tbody.innerHTML = list.map((r) => `<tr>${cell(r)}${KEYS.map((k) => tierCell(r, k)).join("")}
        <td class="num secondary grp-start" data-label="Účast na hlasování">${fmtPct(pct(r.m.attendance))}${epMedian ? `<div class="small muted">medián EP ${fmtPct(epMedian)}</div>` : ""}</td>
        <td class="num secondary" data-label="Prezence na zasedání">${r.m.presence && r.m.presence.days ? `${fmtPct(r.m.presence.present / r.m.presence.days)}<div class="small muted">${fmtNum(r.m.presence.present)} z ${fmtNum(r.m.presence.days)} dnů</div>` : "–"}</td>
        <td class="num secondary" data-label="Podepsané návrhy">${fmtNum(r.m.motions_signed)}</td>
        <td class="num secondary" data-label="Projevy v plénu">${r.m.speeches == null ? "–" : `${fmtNum(r.m.speeches)}<div class="small muted">${fmtNum(Math.round(r.m.speeches_minutes))} min</div>`}</td></tr>`).join("");
    };
    const table = sortable(document.getElementById("work"), columns, () => current, render, { key: "name", dir: 1 });
    const sortSel = document.getElementById("sort");
    sortSel.addEventListener("change", () => { const [k, d] = sortSel.value.split(":"); table.set(k, Number(d)); });
    const d0 = current[0]?.d;
    document.getElementById("notes").innerHTML = d0 ? `Třetiny se počítají mezi ${fmtNum(d0.of)} současnými poslanci
      (v mandátu k poslednímu hlasování v datech), u každé kategorie zvlášť: horní třetina = aspoň dvě třetiny kolegů mají méně,
      shodný počet = shodná třetina, nula třetinu nemá. Počítají se všechny přidělené texty, i ty, o kterých se ještě nehlasovalo;
      „prošlo“ = Parlament text přijal ve jmenovitém hlasování. Náhradníci, kteří nastoupili později, mají kratší dobu
      a u jména je uvedeno, odkdy mandát mají. <strong>Podepsané návrhy usnesení</strong> do srovnání nevstupují: návrh obvykle
      podepisují desítky poslanců za celou frakci a společné návrhy sepisují jen některé frakce, takže počet vypovídá hlavně o frakci.
      <strong>Účast na hlasování</strong> = podíl jmenovitých hlasování v plénu v době mandátu; medián EP je prostřední hodnota všech poslanců EP.
      <strong>Funkce</strong> (předsednictví výboru, vedení frakce) uvádíme podle EP jako kontext: zabírají čas, který pak chybí na vlastní texty.
      <strong>Velikost frakce</strong>: zprávy a stanoviska si frakce rozdělují podle bodů úměrných své velikosti, takže poslanci malých frakcí
      a nezařazení jich dostávají méně bez ohledu na vlastní snahu; čísla proto neupravujeme, ale srovnávejte s tím na paměti.
      <strong>Prezence na zasedání</strong> = dny jednání v plénu v době mandátu, ve kterých byl poslanec v prezenční listině EP (jen dny, ke kterým už listina existuje);
      jiná metrika než účast na hlasování, bez mediánu EP. <strong>Projevy v plénu</strong> jsou ústní projevy v rozpravách v době mandátu podle EP (zdroj: EP Open Data, endpoint speeches); minuty jsou součet
      délek z časových značek zdroje. Písemná prohlášení se do projevů nesčítají (dají se psát hromadně). Počet projevů neříká nic o kvalitě ani vlivu a nevstupuje do třetin.
      Pozměňovací návrhy ve výborech tu nejsou: strojově čitelná data (Parltrack) jsou naposledy z února 2026, takže by byla za část období; otázky najdete na profilu každého poslance.` : "";
    document.getElementById("former").innerHTML = former.length ? `<details class="card own-list"><summary><strong>Bývalí poslanci</strong> (bez srovnání)</summary>
      <ul class="plain">${former.map((r) => `<li><a href="${mepUrl(r.m.id)}">${nameHtml(r.m)}</a>
        <span class="small muted">zpravodaj/ka: zprávy ${fmtNum(r.m.lead_reports)}, stanoviska ${fmtNum(r.m.lead_opinions)} ·
        stínový/á: zprávy ${fmtNum(r.m.shadow_reports)}, stanoviska ${fmtNum(r.m.shadow_opinions)} ·
        podepsané návrhy usnesení ${fmtNum(r.m.motions_signed)}</span></li>`).join("")}</ul></details>` : "";
    document.getElementById("source").innerHTML = `Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0), výsledky hlasování
      <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL). Aktualizováno ${fmtDate(w.updated)}${w.complete ? "" : " (stahování ještě neskončilo, data nejsou úplná)"}.
      Počty spočítal skript <a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/own_work.py">own_work.py</a>. Podrobnosti u každého poslance na jeho profilu.`;
    const tierLabel = (t) => ({ top: "horni", mid: "stredni", low: "dolni" })[t] || "";
    document.getElementById("source").before(csvButton("vlastni-prace.csv", () => [
      ["poslanec_id", "poslanec", "frakce", "strana", "zpravy_zpravodaj", "zpravy_zpravodaj_prijate", "zpravy_zpravodaj_tretina",
        "stanoviska_zpravodaj", "stanoviska_zpravodaj_tretina", "zpravy_stinovy", "zpravy_stinovy_prijate", "zpravy_stinovy_tretina",
        "stanoviska_stinovy", "stanoviska_stinovy_tretina", "ucast_na_hlasovani", "podepsane_navrhy_usneseni", "prezence_dny", "prezence_z_dnu", "prezence_omluven", "projevy_v_plenu", "projevy_minuty", "pisemna_prohlaseni", "funkce", "mandat_od"],
      ...current.map((r) => [r.m.id, displayName(r.m), r.m.group?.short_label || "", r.m.party?.short_label || "",
        r.m.lead_reports, r.m.lead_adopted, tierLabel(r.d.tiers.lead_reports), r.m.lead_opinions, tierLabel(r.d.tiers.lead_opinions),
        r.m.shadow_reports, r.m.shadow_adopted, tierLabel(r.d.tiers.shadow_reports), r.m.shadow_opinions, tierLabel(r.d.tiers.shadow_opinions),
        pct(r.m.attendance) === null ? "" : pct(r.m.attendance).toFixed(4), r.m.motions_signed,
        r.m.presence?.present ?? "", r.m.presence?.days ?? "", r.m.presence?.excused ?? "",
        r.m.speeches ?? "", r.m.speeches_minutes ?? "", r.m.written_statements ?? "",
        (r.m.functions || []).map((f) => `${f.role} ${f.kind === "committee" ? f.code : "frakce"}`).join("; "), r.d.mandate_from || ""]),
    ], "Stáhnout tabulku (CSV)"));
  } catch (e) {
    showError(tbody.closest(".table-wrap"), e);
  }
})();
