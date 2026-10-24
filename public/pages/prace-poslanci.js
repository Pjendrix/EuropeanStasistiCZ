// Skript stránky prace-poslanci.html: tři pohledy (Práce na textech, Účast, Aktivita a návrhy), řazení kliknutím na záhlaví,
// seskupení podle frakce, proužky hodnota / maximum v delegaci, na mobilu karty (hromadné zadání 24. 10. 2026, úkol 0).
// Čísla jen z data/work.json; výpočty pro proužky a osu v lib/work.js (testy tests/js/work.test.mjs). CSV beze změny formátu.
import { getJSON } from "../lib/data.js";
import { CZ_GROUP_LABEL, byGender, displayName, fmtDate, fmtNum, fmtPct, isActive, pct } from "../lib/format.js";
import { html, trusted } from "../lib/html.js";
import { GROUP_ORDER } from "../lib/quiz.js";
import { avatar, csvButton, mepUrl, setNav, showError } from "../lib/ui.js";
import { COLUMNS, VIEWS, axisPos, axisRange, barPct, groupRows, maxOf, metric, nextSort, parseView, sortRows, vsMedian } from "../lib/work.js";
setNav("work");
setNav("work-table");
(async () => {
  const table = document.getElementById("work");
  try {
    const [w, groups] = await Promise.all([getJSON("work.json"), getJSON("groups.json")]);
    const all = w.meps;
    const current = all.filter((m) => m.delegation);
    const former = all.filter((m) => !m.delegation && !isActive(m) && (["lead_reports", "lead_opinions", "shadow_reports", "shadow_opinions"].some((k) => m[k]) || m.motions_signed));
    const epMedian = w.attendance_ep_median;
    const groupOf = (m) => groups.find((g) => g.ep_code === m.group?.code || g.code === m.group?.code) || null;
    const groupCode = (m) => groupOf(m)?.code || "NI";
    const groupName = (code) => { const g = groups.find((x) => x.code === code); return code === "NI" ? "nezařazení" : CZ_GROUP_LABEL[code] || g?.short_label || code; };
    const range = axisRange(current);
    const maxes = Object.fromEntries(Object.values(COLUMNS).flat().map((c) => [c.key, maxOf(current, c.key)]));

    const state = { view: parseView(location.search), sort: null, grouped: false };
    state.sort = { key: VIEWS[state.view].default, dir: -1 };

    const FN = { committee: { CHAIR: ["předseda", "předsedkyně"], CHAIR_VICE: ["místopředseda", "místopředsedkyně"] },
      group: { CHAIR: ["předseda", "předsedkyně"], CHAIR_VICE: ["místopředseda", "místopředsedkyně"], MEMBER_BUREAU: ["člen předsednictva", "členka předsednictva"] } };
    const fnText = (m) => (m.functions || []).map((f) => `${byGender(m, ...FN[f.kind][f.role])} ${f.kind === "committee" ? `výboru ${f.code}` : "frakce"}`).join(" · ");
    const partyText = (m) => (m.party ? (m.party.short_label === "Ind." ? byGender(m, "nezávislý", "nezávislá") : m.party.short_label) : "");
    const gchip = (m) => {
      const g = groupOf(m), code = groupCode(m);
      return html`<span class="gchip" style="--gc:${g?.color || g?.chart_color || "var(--muted)"}"><i aria-hidden="true"></i>${groupName(code)}</span>`;
    };
    const since = (m) => (m.delegation?.mandate_from ? html`<span class="since-chip">od ${fmtDate(m.delegation.mandate_from)}</span>` : "");

    const who = (m) => html`<div class="wk-who">${trusted(avatar(m, 40))}<div class="wk-who-t">
        <a href="${mepUrl(m.id)}">${displayName(m)}</a>
        <div class="wk-meta">${gchip(m)}${partyText(m) ? html` <span class="muted">${partyText(m)}</span>` : ""} ${since(m)}</div>
        ${fnText(m) ? html`<div class="small fn-line">${fnText(m)}</div>` : ""}</div></div>`;

    // Číslo + proužek (hodnota / maximum v delegaci). Zprávy: světlý proužek = přiděleno, tmavá část zleva = prošlo plénem.
    const bar = (m, col, thin = false) => {
      const v = metric(m, col.key);
      const w1 = barPct(v, maxes[col.key]);
      const done = col.adopted && v ? barPct(m[col.adopted], maxes[col.key]) : 0;
      const zero = !v;
      const num = v === null ? "–" : fmtNum(v);
      const sub = col.adopted && v ? html`<span class="small muted wk-sub">prošlo ${fmtNum(m[col.adopted])}</span>`
        : col.key === "speeches" && v !== null ? html`<span class="small muted wk-sub">${fmtNum(Math.round(m.speeches_minutes || 0))} min</span>` : "";
      return html`<div class="wk-cell${zero ? " zero" : ""}${col.muted ? " soft" : ""}"><span class="wk-num">${num}</span>${sub}
        <span class="wk-bar${thin ? " thin" : ""}" aria-hidden="true"><i style="width:${w1.toFixed(1)}%"></i>${done ? html`<b style="width:${done.toFixed(1)}%"></b>` : ""}</span></div>`;
    };
    const attCell = (m) => {
      const a = metric(m, "attendance");
      return html`<div class="wk-cell"><span class="wk-num">${a === null ? "–" : fmtPct(a)}</span><span class="small muted wk-sub">${vsMedian(a, epMedian)}</span></div>`;
    };
    const presCell = (m) => {
      const p = m.presence;
      return p && p.days ? html`<div class="wk-cell"><span class="wk-num">${fmtPct(p.present / p.days)}</span><span class="small muted wk-sub">${fmtNum(p.present)} z ${fmtNum(p.days)} dnů</span></div>`
        : html`<div class="wk-cell zero"><span class="wk-num">–</span></div>`;
    };
    const axis = (m) => {
      const a = metric(m, "attendance"), p = metric(m, "presence");
      const label = `Účast ${a === null ? "–" : fmtPct(a)}, docházka ${p === null ? "–" : fmtPct(p)}${epMedian ? `, medián EP ${fmtPct(epMedian)}` : ""}`;
      return html`<div class="wk-axis" role="img" aria-label="${label}">${epMedian ? html`<span class="wk-med" style="left:${axisPos(epMedian, range).toFixed(1)}%"></span>` : ""}
        ${p !== null ? html`<span class="wk-ring" style="left:${axisPos(p, range).toFixed(1)}%"></span>` : ""}
        ${a !== null ? html`<span class="wk-dot" style="left:${axisPos(a, range).toFixed(1)}%"></span>` : ""}</div>`;
    };
    const cellsFor = (m, view, thin) => (view === "ucast"
      ? [{ label: "Účast na hlasování", body: attCell(m) }, { label: "Docházka", body: presCell(m) }, { label: "Osa", body: axis(m), axis: true }]
      : COLUMNS[view].map((c) => ({ label: `${c.group ? `${c.group} – ` : ""}${c.label}`, body: bar(m, c, thin), col: c })));

    const head = () => {
      const cols = state.view === "ucast" ? [...COLUMNS.ucast, { key: null, label: `Osa ${Math.round(range[0] * 100)}–100 %`, group: "" }] : COLUMNS[state.view];
      const th = (c) => {
        if (!c.key) return html`<th class="wk-axis-h">${c.label}</th>`;
        const sorted = state.sort.key === c.key ? (state.sort.dir > 0 ? "ascending" : "descending") : "none";
        return html`<th class="num${c.muted ? " soft" : ""}" aria-sort="${sorted}"><button type="button" data-key="${c.key}">${c.label}</button>${c.note ? html`<small>${c.note}</small>` : ""}</th>`;
      };
      const groupsRow = cols.some((c) => c.group) ? html`<tr class="group-row"><th></th>${groupSpans(cols).map(([g, n]) => html`<th colspan="${n}" class="group">${g}</th>`)}</tr>` : "";
      const nameSort = state.sort.key === "name" ? (state.sort.dir > 0 ? "ascending" : "descending") : "none";
      return html`${groupsRow}<tr><th class="wk-name-h" aria-sort="${nameSort}"><button type="button" data-key="name">Poslanec</button></th>${cols.map(th)}</tr>`;
    };
    const groupSpans = (cols) => cols.reduce((acc, c) => { const last = acc.at(-1); if (last && last[0] === (c.group || "")) last[1] += 1; else acc.push([c.group || "", 1]); return acc; }, []);
    const nCols = () => 1 + (state.view === "ucast" ? 3 : COLUMNS[state.view].length);

    const rowHtml = (m) => html`<tr><th scope="row" class="wk-name">${who(m)}</th>${cellsFor(m, state.view, false).map((c) => html`<td class="${c.axis ? "wk-axis-td" : "num"}">${c.body}</td>`)}</tr>`;
    const cardHtml = (m) => html`<li class="wk-card"><a class="wk-card-link" href="${mepUrl(m.id)}" aria-label="${displayName(m)}, profil"></a>
      <div class="wk-card-head">${trusted(avatar(m, 40))}<div><strong>${displayName(m)}</strong><div class="wk-meta">${gchip(m)}${partyText(m) ? html` <span class="muted">${partyText(m)}</span>` : ""} ${since(m)}</div></div><span class="wk-go" aria-hidden="true">›</span></div>
      <dl class="wk-grid${state.view === "ucast" ? " two" : ""}">${cellsFor(m, state.view, true).map((c) => (c.axis ? html`<div class="wk-g-axis">${c.body}</div>` : html`<div><dt>${c.label}</dt><dd>${c.body}</dd></div>`))}</dl></li>`;

    const render = () => {
      const rows = sortRows(current, state.sort.key, state.sort.dir);
      const blocks = state.grouped ? groupRows(rows, GROUP_ORDER, groupCode) : [{ code: null, rows }];
      table.querySelector("thead").innerHTML = String(head());
      table.querySelector("tbody").innerHTML = String(html`${blocks.map((b) => html`${b.code ? html`<tr class="wk-gh"><th colspan="${nCols()}" scope="rowgroup">${groupName(b.code)} <span class="muted">(${b.rows.length})</span></th></tr>` : ""}${b.rows.map(rowHtml)}`)}`);
      document.getElementById("work-cards").innerHTML = String(html`${blocks.map((b) => html`${b.code ? html`<li class="wk-card-gh">${groupName(b.code)} <span class="muted">(${b.rows.length})</span></li>` : ""}${b.rows.map(cardHtml)}`)}`);
      table.classList.toggle("view-ucast", state.view === "ucast");
      const note = document.getElementById("axis-note");
      note.hidden = state.view !== "ucast";
      note.innerHTML = String(html`<span class="wk-key"><span class="wk-dot static"></span> účast na hlasování</span> <span class="wk-key"><span class="wk-ring static"></span> docházka na zasedání</span>
        ${epMedian ? html`<span class="wk-key"><span class="wk-med static"></span> medián EP (účast) ${fmtPct(epMedian)}</span>` : ""} · osa od ${Math.round(range[0] * 100)} do 100 % (od nejnižší hodnoty v delegaci)`);
      document.querySelectorAll(".wk-tabs [role=tab]").forEach((t) => {
        const on = t.dataset.view === state.view;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        if (on) document.getElementById("work-panel").setAttribute("aria-labelledby", t.id);
      });
      fillSort();
    };

    // Mobilní <select> řazení: sloupce aktuálního pohledu + jméno.
    const sortSel = document.getElementById("sort");
    const fillSort = () => {
      const opts = [["name:1", "abecedně"], ...COLUMNS[state.view].map((c) => [`${c.key}:-1`, `${c.group ? `${c.group} – ` : ""}${c.label}`])];
      sortSel.innerHTML = String(html`${opts.map(([v, l]) => html`<option value="${v}">${l}</option>`)}`);
      sortSel.value = `${state.sort.key}:${state.sort.dir}`;
      if (sortSel.selectedIndex < 0) sortSel.selectedIndex = 0;
    };
    sortSel.addEventListener("change", () => { const [k, d] = sortSel.value.split(":"); state.sort = { key: k, dir: Number(d) }; render(); });
    table.querySelector("thead").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-key]");
      if (!b) return;
      state.sort = nextSort(state.sort, b.dataset.key);
      render();
      table.querySelector(`thead button[data-key="${b.dataset.key}"]`)?.focus();
    });
    const tabs = [...document.querySelectorAll(".wk-tabs [role=tab]")];
    const setView = (v, focus) => {
      state.view = v;
      state.sort = { key: VIEWS[v].default, dir: -1 };
      const u = new URL(location.href);
      if (v === "texty") u.searchParams.delete("pohled"); else u.searchParams.set("pohled", v);
      history.replaceState(null, "", u);
      render();
      if (focus) tabs.find((t) => t.dataset.view === v)?.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => setView(t.dataset.view, false));
      t.addEventListener("keydown", (e) => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        setView(tabs[(i + d + tabs.length) % tabs.length].dataset.view, true);
      });
    });
    const gt = document.getElementById("group-toggle");
    gt.addEventListener("click", () => { state.grouped = !state.grouped; gt.setAttribute("aria-pressed", String(state.grouped)); render(); });
    render();

    const d0 = current[0]?.delegation;
    document.getElementById("notes").innerHTML = String(html`
      <section><h3>Vede text a za frakci</h3><p><strong>Zpravodaj/ka</strong> píše zprávu výboru, který věc vede, nebo stanovisko dalšího výboru;
        <strong>stínový/á zpravodaj/ka</strong> text vyjednává za frakci. Počítají se všechny přidělené texty, i ty, o kterých se ještě nehlasovalo;
        tmavá část proužku = Parlament text přijal ve jmenovitém hlasování. Proužek = počet / nejvyšší počet v delegaci${d0 ? ` (${fmtNum(d0.of)} současných poslanců)` : ""}.
        Celkové pořadí ani skóre nepočítáme: zpráva a stanovisko nejsou stejná práce.</p></section>
      <section><h3>Velikost frakce a funkce</h3><p>Frakce si texty dělí podle bodů úměrných své velikosti, takže poslanci malých frakcí a nezařazení
        jich dostávají méně bez ohledu na vlastní snahu. Funkce (předsednictví výboru, vedení frakce) uvádíme podle EP jako kontext.
        Náhradníci mají u jména, odkdy mandát mají.</p></section>
      <section><h3>Účast a docházka</h3><p><strong>Účast na hlasování</strong> = podíl jmenovitých hlasování v plénu v době mandátu, medián EP je prostřední
        hodnota všech poslanců EP. <strong>Docházka</strong> = dny jednání v plénu, kdy byl poslanec v prezenční listině EP (jen dny, ke kterým listina existuje);
        jiná metrika, bez mediánu EP.</p></section>
      <section><h3>Projevy a pozměňovací návrhy</h3><p><strong>Projevy</strong> = ústní projevy v rozpravách v plénu podle EP, minuty z časových značek zdroje;
        písemná prohlášení se nesčítají. <strong>PN ve výborech</strong> = pozměňovací návrhy, pod kterými je poslanec mezi autory, z dokumentů v registru EP${w.amendments_source ? ` (do ${fmtDate(w.amendments_source.coverage.committee_to)})` : ""};
        kompromisní PN a PN frakcí se nepočítají. <strong>PN v plénu</strong> = spolupodepsané hromadné návrhy (nejméně 36 podpisů). <strong>Návrhy usnesení</strong>
        obvykle podepisují desítky poslanců za frakci, počet vypovídá spíš o frakci. Počty nevypovídají o kvalitě ani vlivu.
        <a href="o-projektu#metodika">Jak počítáme</a>.</p></section>`);
    document.getElementById("former").innerHTML = former.length ? String(html`<details class="card own-list"><summary><strong>Bývalí poslanci</strong> (bez srovnání)</summary>
      <ul class="plain">${former.map((m) => html`<li><a href="${mepUrl(m.id)}">${displayName(m)}</a>
        <span class="small muted">zpravodaj/ka: zprávy ${fmtNum(m.lead_reports)}, stanoviska ${fmtNum(m.lead_opinions)} ·
        stínový/á: zprávy ${fmtNum(m.shadow_reports)}, stanoviska ${fmtNum(m.shadow_opinions)} ·
        podepsané návrhy usnesení ${fmtNum(m.motions_signed)}</span></li>`)}</ul></details>`) : "";
    document.getElementById("source").innerHTML = `Zdroj: <a href="https://data.europarl.europa.eu">EP Open Data</a> (CC BY 4.0), výsledky hlasování
      <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL). Aktualizováno ${fmtDate(w.updated)}${w.complete ? "" : " (stahování ještě neskončilo, data nejsou úplná)"}.
      Počty spočítal skript <a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/own_work.py">own_work.py</a>. Podrobnosti u každého poslance na jeho profilu.`;
    const tierLabel = (t) => ({ top: "horni", mid: "stredni", low: "dolni" })[t] || "";
    document.getElementById("source").before(csvButton("vlastni-prace.csv", () => [
      ["poslanec_id", "poslanec", "frakce", "strana", "zpravy_zpravodaj", "zpravy_zpravodaj_prijate", "zpravy_zpravodaj_tretina",
        "stanoviska_zpravodaj", "stanoviska_zpravodaj_tretina", "zpravy_stinovy", "zpravy_stinovy_prijate", "zpravy_stinovy_tretina",
        "stanoviska_stinovy", "stanoviska_stinovy_tretina", "ucast_na_hlasovani", "podepsane_navrhy_usneseni", "prezence_dny", "prezence_z_dnu", "prezence_omluven", "projevy_v_plenu", "projevy_minuty", "pisemna_prohlaseni", "pn_vybory", "pn_plenum_spolupodepsane", "funkce", "mandat_od"],
      ...current.map((m) => [m.id, displayName(m), m.group?.short_label || "", m.party?.short_label || "",
        m.lead_reports, m.lead_adopted, tierLabel(m.delegation.tiers.lead_reports), m.lead_opinions, tierLabel(m.delegation.tiers.lead_opinions),
        m.shadow_reports, m.shadow_adopted, tierLabel(m.delegation.tiers.shadow_reports), m.shadow_opinions, tierLabel(m.delegation.tiers.shadow_opinions),
        pct(m.attendance) === null ? "" : pct(m.attendance).toFixed(4), m.motions_signed,
        m.presence?.present ?? "", m.presence?.days ?? "", m.presence?.excused ?? "",
        m.speeches ?? "", m.speeches_minutes ?? "", m.written_statements ?? "", m.amendments ?? "", m.amendments_cosigned ?? "",
        (m.functions || []).map((f) => `${f.role} ${f.kind === "committee" ? f.code : "frakce"}`).join("; "), m.delegation.mandate_from || ""]),
    ], "Stáhnout tabulku (CSV)"));
  } catch (e) {
    showError(table.closest(".table-wrap"), e);
  }
})();
