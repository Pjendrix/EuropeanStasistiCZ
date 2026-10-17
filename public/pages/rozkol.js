// Skript stránky rozkol.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { getJSON, soft } from "../lib/data.js";
import { CZ_GROUP_LABEL, KIND_LABEL, RESULT_LABEL, esc, fmtDate, fmtNum, fmtPct, isActive, isFinal, siteUrl, spanText, voteSubtitle, voteTitle } from "../lib/format.js";
import { countPct, delegationTable, infoButton, kindTag, namesByPosition, resultHtml, setNav, shareButton, showError, sourceLine } from "../lib/ui.js";
setNav("analyses");
setNav("splits");
(async () => {
  const el = document.getElementById("list");
  try {
    const [d, overview, groups, dl] = await Promise.all([getJSON("splits.json"), getJSON("overview.json"), getJSON("groups.json"), getJSON("delegations.json").catch(soft(null))]);
    const meps = Object.fromEntries(overview.meps.map((m) => [m.id, m]));
    document.getElementById("source").innerHTML = sourceLine(d);
    const u = d.unity;
    if (u && u.considered) {
      if (dl && dl.peers.length) document.getElementById("peers").innerHTML = `<details class="card" id="delegace"><summary><strong>Jednotnost delegací podobné velikosti</strong></summary>${delegationTable(dl, [
        { label: "Jednotně – všechna hlasování", get: (m) => `${fmtPct(m.unity[0] / m.unity[1])}<div class="small muted">${fmtNum(m.unity[0])} z ${fmtNum(m.unity[1])}</div>` },
        { label: "Jednotně – závěrečná", get: (m) => `${fmtPct(m.unity_final[0] / m.unity_final[1])}<div class="small muted">${fmtNum(m.unity_final[0])} z ${fmtNum(m.unity_final[1])}</div>` },
      ])}<p class="small muted">${esc(dl.definition)}</p></details>`;
      const cur = overview.meps.filter(isActive);
      const nGroups = new Set(cur.map((m) => m.group?.code).filter((c) => c && c !== "NI")).size;
      const hasNI = cur.some((m) => !m.group?.code || m.group.code === "NI");
      const fin = u.considered_final
        ? `<div class="value">${countPct(u.united_final / u.considered_final)}</div>
        <div class="detail">${fmtNum(u.united_final)} z ${fmtNum(u.considered_final)} závěrečných hlasování${infoButton(`
          <p>Jednotně = všichni Češi, kteří hlasovali pro nebo proti, byli na jedné straně. Závěrečná hlasování jsou o celém textu, prozatímní dohodě s Radou nebo námitce proti aktu Komise.</p>
          <p>Ve všech ${fmtNum(u.considered)} hlasováních (většinu tvoří pozměňovací návrhy a dílčí hlasování o částech textu, kde se frakce dělí z principu) to bylo ${fmtNum(u.united)}× neboli ${fmtPct(u.united / u.considered)}. Výrazné rozdělení (menšina aspoň ${Math.round(u.strong_threshold * 100)} %): ${fmtNum(u.strong_split)}×.</p>
          ${dl && dl.peers.length ? `<p>Pro srovnání: u delegací s ${dl.seats_range[0]}–${dl.seats_range[1]} poslanci vychází jednotnost ${spanText(dl.peer_range.unity, (x) => fmtPct(x))} ve všech hlasováních a ${spanText(dl.peer_range.unity_final, (x) => fmtPct(x))} u závěrečných (<a href="#delegace">čísla jednotlivých delegací</a>).</p>` : ""}
          <p>Česká delegace sedí v ${nGroups} frakcích${hasNI ? " (část poslanců je nezařazená)" : ""} a zahrnuje vládní i opoziční strany. Jednomyslnost proto není běžná a nic neříká o „českém zájmu“. <a href="o-projektu#metodika">Jak počítáme</a>.</p>`, "Definice, srovnání a metodika")}</div>`
        : "";
      document.getElementById("unity").innerHTML = `<div class="label">Češi jednotně – závěrečná hlasování</div>${fin}`;
    }
    getJSON("decisive.json").then((dec) => {
      const fin = dec.decisive_final ?? dec.votes.filter(isFinal).length;
      document.getElementById("decisive").innerHTML = `<div class="label">Rozhodly české hlasy</div>
        <div class="value"><span data-count="${dec.votes.length}">${fmtNum(dec.votes.length)}</span></div>
        <div class="detail">těsných hlasování, která by bez českých hlasů dopadla opačně${infoButton(`<p>Z toho závěrečných ${fmtNum(fin)}. Většinou jde o pozměňovací návrhy a dílčí hlasování, ne o celý zákon.</p>`, "Podrobnosti")} · <a href="rozhodujici">seznam</a></div>`;
    }).catch(soft({}));
    const view = new URLSearchParams(location.search).get("v");
    if (view) document.querySelector(`input[value="${CSS.escape(view)}"]`)?.click();
    const PAGE = 10;
    let shown = PAGE, current = [];
    const render = () => {
      const v = document.querySelector("input[name=view]:checked").value;
      history.replaceState(null, "", `?v=${v}`);
      let list, summary;
      if (v === "last_session") {
        const ls = d.last_session;
        list = ls.split;
        summary = `Zasedání ${fmtDate(ls.from)} – ${fmtDate(ls.to)}: ${ls.votes} hlasování, Češi se rozdělili v ${ls.split_count} z nich` +
          (ls.split_count > list.length ? ` (níže ${list.length} s největším rozdělením).` : ".");
      } else {
        list = d[v];
        summary = `Za celé období se Češi rozdělili v ${fmtNum(v === "main" ? d.count_main : d.count)} ` +
          `${v === "main" ? "závěrečných " : ""}hlasováních (aspoň jeden pro a jeden proti). Níže ${list.length} s největším rozdělením.`;
      }
      document.getElementById("summary").textContent = summary;
      // Sdílet pohled: karta s prvními řádky aktuálního pohledu, ve stejném pořadí jako na stránce (podle míry rozdělení).
      const VIEW_NAME = { last_session: "poslední zasedání", main: "celé období, závěrečná hlasování", all: "celé období, všechna hlasování" };
      const lead = v === "last_session"
        ? `Zasedání ${fmtDate(d.last_session.from)} – ${fmtDate(d.last_session.to)}: ${fmtNum(d.last_session.votes)} hlasování, Češi se rozdělili v ${fmtNum(d.last_session.split_count)}.`
        : `Celé období: Češi se rozdělili v ${fmtNum(v === "main" ? d.count_main : d.count)} ${v === "main" ? "závěrečných " : ""}hlasováních.`;
      const url = siteUrl(`rozkol?v=${v}`);
      window.shareContext = () => ({
        kind: "split", url, filename: `ep-watch-rozkol-${v}`, subtitle: `Kde se Češi rozdělili · ${VIEW_NAME[v]}`,
        trust: "Karta ukazuje právě zvolený pohled, jen první řádky seznamu. Datum dat, zdroj a adresa jsou na ní.",
        text: `Kde se čeští europoslanci rozdělili (${VIEW_NAME[v]}). Zdroj: HowTheyVote.eu, EP Watch CZ`,
        data: {
          title: "Kde se Češi rozdělili", lead, total: list.length, order: "podle míry rozdělení", dataDay: overview.sources?.votes?.release || overview.period.to,
          dateLabel: v === "last_session" ? `${fmtDate(d.last_session.from)} – ${fmtDate(d.last_session.to)}` : `data k ${fmtDate(overview.sources?.votes?.release || overview.period.to)}`,
          rows: list.map((x) => ({ meta: [fmtDate(x.date), KIND_LABEL[x.vote_kind] || "", RESULT_LABEL[x.result] || ""].filter(Boolean).join(" · "),
            title: voteTitle(x), score: `${x.cz[0]} : ${x.cz[1]}`, scoreSub: "pro : proti" })),
          source: `Zdroj: HowTheyVote.eu (ODbL) · strana a frakce k datu hlasování`,
          urlShort: url.replace(/^https?:\/\//, ""),
        },
      });
      const slot = document.getElementById("share-slot");
      if (!slot.firstChild) slot.outerHTML = shareButton("view", "Sdílet pohled");
      el.className = "";
      shown = PAGE;
      current = list;
      draw();
    };
    // Po frakcích: „pro: EPP 4 · ECR 3“ (frakce k datu hlasování; starší data bez frakcí ukážou jen počty).
    const byGroup = (x, pos) => {
      if (!x.groups) return "";
      const c = {};
      Object.entries(x.positions).forEach(([id, p]) => { if (p === pos) { const g = x.groups[id] || "–"; c[g] = (c[g] || 0) + 1; } });
      return Object.entries(c).sort((a, b) => b[1] - a[1])
        .map(([g, n]) => `${esc(groups.find((y) => y.code === g) ? (CZ_GROUP_LABEL[g] || groups.find((y) => y.code === g).short_label) : g)} ${n}`).join(" · ");
    };
    const card = (x) => `<div class="card list-card">
        <div class="small muted">${fmtDate(x.date)} ${kindTag(x)}
          · výsledek <span class="result-${x.result || ""}">${resultHtml(x)}</span></div>
        <a class="vote-title" href="vote?id=${x.id}&m=${x.month}">${esc(voteTitle(x))}</a>
        <div class="small muted">${esc(voteSubtitle(x))}</div>
        <p class="split-score"><strong>${x.cz[0]} : ${x.cz[1]}</strong> <span class="small muted">Češi pro : proti${x.cz[2] ? `, ${x.cz[2]} se zdrželo` : ""}</span></p>
        ${x.groups ? `<p class="small"><span class="pos pos-FOR">pro:</span> ${byGroup(x, "FOR")}<br>
          <span class="pos pos-AGAINST">proti:</span> ${byGroup(x, "AGAINST")}</p>` : ""}
        <details class="names"><summary class="small">Jména</summary>${namesByPosition(x.positions, meps, ["FOR", "AGAINST"])}</details>
      </div>`;
    const draw = () => {
      el.innerHTML = (current.slice(0, shown).map(card).join("") || '<p class="muted">Žádné hlasování.</p>') +
        (current.length > shown ? `<button type="button" class="more-btn" id="more">Zobrazit další (${Math.min(PAGE, current.length - shown)} z ${current.length - shown})</button>` : "");
      document.getElementById("more")?.addEventListener("click", () => { shown += PAGE; draw(); });
    };
    document.querySelectorAll("input[name=view]").forEach((r) => r.addEventListener("change", render));
    render();
  } catch (e) {
    showError(el, e);
  }
})();
