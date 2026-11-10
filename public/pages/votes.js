// Skript stránky votes.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { CATEGORY_META, getJSON, loadCategories, loadSearch, loadTopicText, soft } from "../lib/data.js";
import { DAY_RE, KIND_LABEL, POSITION_LABEL, RESULT_LABEL, RESULT_NOTE, debounce, displayName, esc, fmtDate, fmtMonth, highlight, isActive, isFinal, matchesAll, norm, positionFor, searchTerms, voteDesc, voteSubtitle, voteTitle } from "../lib/format.js";
import { catChip, csvButton, czCountsHtml, infoButton, kindTag, resultHtml, setNav, showError, splitBar } from "../lib/ui.js";
setNav("votes");
setNav("votes-list");
(async () => {
  const tbody = document.querySelector("#votes tbody");
  try {
    // Výchozí pohled (jen závěrečná) stačí s malým search-final.json; celý search.json (1,7 MB) se stáhne, až když je
    // potřeba typ „hlavní“ nebo „všechna“ (O7).
    const wantsAll = () => ["all", "main"].includes(new URLSearchParams(location.search).get("f")) || new URLSearchParams(location.search).get("all") === "1";
    const FINAL_FILE = "votes/search-final.json", FULL_FILE = "votes/search.json";
    const [index, rows0, overview, roles] = await Promise.all([getJSON("votes/index.json"), loadSearch(wantsAll() ? FULL_FILE : FINAL_FILE), getJSON("overview.json"), getJSON("vote_roles.json").catch(soft(null))]);
    let all = rows0, full = wantsAll() ? rows0 : null;
    const finalRows = full ? null : rows0;
    // Česká stopa: český poslanec byl zpravodajem nebo stínovým zpravodajem zprávy, o které se hlasovalo (vote_roles.json z own_work).
    const trace = new Set(Object.keys(roles?.votes || {}).map(Number));
    const stopa = document.getElementById("stopa");
    stopa.closest("label").hidden = !trace.size;
    all.reverse(); // nejnovější nahoře
    await loadCategories();
    const doc = await getJSON(full ? FULL_FILE : FINAL_FILE);
    const monthSel = document.getElementById("month");
    const kindSel = document.getElementById("kind");
    const topicSel = document.getElementById("topic");
    const catSel = document.getElementById("cat");
    catSel.innerHTML += Object.entries(CATEGORY_META).map(([k, c]) => `<option value="${esc(k)}">${esc(c.label)}</option>`).join("");
    catSel.closest("label").hidden = !Object.keys(CATEGORY_META).length;
    const q = document.getElementById("q");
    const mepSel = document.getElementById("mep");
    const sortedMeps = [...overview.meps].sort((a, b) => (a.sort_label || a.name).localeCompare(b.sort_label || b.name, "cs"));
    const opt = (m) => `<option value="${m.id}">${esc(displayName(m))}</option>`;
    mepSel.innerHTML += sortedMeps.filter(isActive).map(opt).join("") +
      `<optgroup label="Bývalí poslanci">${sortedMeps.filter((m) => !isActive(m)).map(opt).join("")}</optgroup>`;
    // Filtr „Poslanec“: hlasy vybraného poslance (data/meps/{id}_votes.json); sloupec Češi se změní na jeho hlas.
    let mepVotes = null; // Map hlasování → písmeno F/A/B/N
    const LETTER = { F: "FOR", A: "AGAINST", B: "ABSTENTION", N: "DID_NOT_VOTE" };
    const loadMepVotes = async () => {
      mepVotes = null;
      if (!mepSel.value) return;
      const d = await getJSON(`meps/${mepSel.value}_votes.json`);
      mepVotes = new Map(d.ids.map((id, i) => [id, d.positions[i]]));
    };
    monthSel.innerHTML = index.months.slice().reverse()
      .map((m) => `<option value="${m.month}">${fmtMonth(m.month)} (${m.votes})</option>`).join("");
    // Témata jen v novějších datech (pole topics v search.json).
    const topicLabels = doc.topic_labels || {};
    const topicCodes = Object.keys(topicLabels).filter((c) => c.includes("."))
      .sort((a, b) => (topicLabels[a] || a).localeCompare(topicLabels[b] || b, "cs"));
    topicSel.innerHTML += topicCodes.map((c) => `<option value="${esc(c)}">${esc(topicLabels[c] || c)}</option>`).join("");
    topicSel.closest("label").hidden = !topicCodes.length;
    const params = new URLSearchParams(location.search);
    // Měsíc jen když v datech existuje: neznámý (?m=2030-01 ze starého nebo ručně upraveného odkazu) by nechal výběr prázdný
    // a stránka ukázala „0 z 0 hlasování“; zůstane poslední měsíc.
    if (index.months.some((m) => m.month === params.get("m"))) monthSel.value = params.get("m");
    if (params.get("q")) q.value = params.get("q");
    if (params.get("mep") && /^\d+$/.test(params.get("mep"))) { mepSel.value = params.get("mep"); await loadMepVotes(); }
    // ?all=1 ze starších odkazů = všechna hlasování
    kindSel.value = params.get("f") || (params.get("all") === "1" ? "all" : "final");
    if (!kindSel.value) kindSel.value = "final"; // neznámá hodnota ?f= z ručně upraveného odkazu
    if (params.get("t")) topicSel.value = params.get("t");
    if (params.get("c")) catSel.value = params.get("c");
    if (params.get("stopa") === "1") stopa.checked = true;
    let since = DAY_RE.test(params.get("od") || "") ? params.get("od") : null; // od data (např. poslední zasedání z úvodní stránky)
    document.getElementById("source").innerHTML =
      `Zdroj: <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (export ${esc(index.source.release || "")}, ODbL)` + infoButton(
        `<p>Do počtů Čechů se berou jen poslanci v mandátu. Každé hlasování odkazuje na originál. Názvy témat jsou ruční český překlad témat Legislativní observatoře EP.</p>`, "Zdroj a metodika");

    // Hledaný text se normalizuje jednou (bez diakritiky, malá písmena), ne při každém stisku klávesy. Hledá se i v názvech
    // témat a v ručních synonymech (stejně jako našeptávač v liště, lib/search.js).
    const topicText = await loadTopicText(full ? FULL_FILE : FINAL_FILE);
    const prep = (rows) => { for (const v of rows) v._hay = norm([voteTitle(v), v.title, v.reference, v.description, v.description_cs].join(" ")) + " " + topicText(v); return rows; };
    prep(all);
    // Typ jiný než „závěrečná“ potřebuje celý seznam: stáhne se jednou, pak se jen přepíná.
    const ensureRows = async () => {
      if (kindSel.value === "final") { all = finalRows || full; return; }
      if (!full) { full = prep((await loadSearch(FULL_FILE)).reverse()); }
      all = full;
    };
    const filters = document.getElementById("filters");
    if (matchMedia("(max-width: 760px)").matches) filters.open = false;
    const chips = document.getElementById("chips");
    const kindOk = (v) => kindSel.value === "all" || (kindSel.value === "final" ? isFinal(v) : v.is_main);
    const LIMIT = 300;
    let current = [];
    const render = () => { ensureRows().then(draw).catch((e) => showError(tbody.closest(".table-wrap"), e)); };
    const draw = () => {
      const month = monthSel.value;
      const terms = searchTerms(q.value);
      const needle = terms.length > 0;
      const topic = topicSel.value, cat = catSel.value;
      // Při hledání nebo výběru tématu se prochází celé období, jinak jen vybraný měsíc.
      const onlyTrace = stopa.checked;
      const wide = Boolean(needle || topic || cat || mepVotes || onlyTrace);
      monthSel.disabled = wide;
      const pool = wide ? all : all.filter((v) => v.month === month && (!since || v.date >= since));
      const matches = pool.filter((v) => kindOk(v) &&
        (!topic || (v.topics || []).includes(topic)) && (!cat || (v.cats || []).includes(cat)) && (!mepVotes || mepVotes.has(v.id)) && (!onlyTrace || trace.has(v.id)) &&
        matchesAll(v._hay, terms));
      const list = matches.slice(0, LIMIT);
      current = matches;
      renderScope();
      document.getElementById("count").textContent = wide
        ? `${matches.length} nalezeno v celém období${matches.length > LIMIT ? `, zobrazeno prvních ${LIMIT}` : ""}`
        : `${matches.length} z ${pool.length} hlasování${since ? ` od ${fmtDate(since)}` : ""}`;
      const qs = new URLSearchParams({ m: month, f: kindSel.value });
      if (topic) qs.set("t", topic);
      if (cat) qs.set("c", cat);
      if (needle) qs.set("q", q.value.trim());
      if (mepVotes) qs.set("mep", mepSel.value);
      if (onlyTrace) qs.set("stopa", "1");
      const mp = mepVotes ? overview.meps.find((m) => String(m.id) === mepSel.value) : null;
      document.getElementById("cz-head").textContent = mp ? displayName(mp) : "Češi";
      renderChips();
      if (since && !wide) qs.set("od", since);
      history.replaceState(null, "", `?${qs}`);
      tbody.innerHTML = list.map((v) => {
        const counts = v.cz;
        return `<tr>
          <td class="num date">${fmtDate(v.date)}</td>
          <td class="title">${catChip(v)}<a class="vote-title" href="vote?id=${v.id}&m=${v.month}">${highlight(voteTitle(v), terms)}</a>
            <div class="small muted">${trace.has(v.id) ? '<span class="cz-badge" title="Český poslanec byl zpravodajem nebo stínovým zpravodajem">česká stopa</span> ' : ""}<span class="vt-doc">${kindSel.value === "final" && v.vote_kind === "final" ? "" : kindTag(v)}${esc(voteSubtitle(v))}</span></div></td>
          <td class="result result-${v.result || ""}" title="${esc(RESULT_NOTE[v.result ?? null] || "")}">${resultHtml(v, true)}</td>
          ${mepVotes ? (() => { const pos = LETTER[mepVotes.get(v.id)];
            return `<td class="extra pos pos-${pos}">${positionFor(pos, mp)}</td>`; })()
            : `<td class="extra cz">${splitBar(counts)}<div class="small">${czCountsHtml(counts)}</div></td>`}
        </tr>`;
      }).join("") || `<tr><td colspan="4" class="empty-state"><p><strong>Nic jsme nenašli.</strong>${needle ? " Zkuste psát bez koncovek (např. „ukrajin“) nebo méně slov." : ""}</p>
        <div class="empty-acts">${!wide && kindSel.value !== "all" ? '<button type="button" class="more-btn" data-act="kind-all">Ukázat všechna hlasování</button>' : ""}${activeFilters().length ? '<button type="button" class="more-btn" data-act="clear">Zrušit všechny filtry</button>' : ""}</div></td></tr>`;
    };
    // Zvolený rozsah typu hlasování je vidět vždy (audit UX P1): výchozí pohled jsou jen závěrečná hlasování.
    const SCOPE = {
      final: ["Zobrazena jen <strong>závěrečná hlasování</strong> (o celém textu nebo dohodě s Radou).", "all", "Zobrazit všechna hlasování"],
      main: ["Zobrazena <strong>všechna hlavní hlasování</strong> (závěrečná, návrhy na zamítnutí, mandáty, naléhavý postup).", "all", "Zobrazit všechna hlasování"],
      all: ["Zobrazena <strong>všechna hlasování</strong> včetně pozměňovacích návrhů a dílčích hlasování.", "final", "Jen závěrečná"],
    };
    const scope = document.getElementById("scope");
    function renderScope() {
      const [text, to, label] = SCOPE[kindSel.value] || SCOPE.final;
      scope.innerHTML = `${text} <button type="button" class="link-btn" data-kind="${to}">${label}</button>`;
    }
    scope.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-kind]");
      if (!b) return;
      kindSel.value = b.dataset.kind;
      render();
      scope.querySelector("button")?.focus();
    });
    // Aktivní filtry jako čipy s ×; počet i v nadpisu sbalených filtrů (mobil).
    const selText = (sel) => sel.options[sel.selectedIndex]?.text || sel.value;
    const activeFilters = () => [
      q.value.trim() && { label: `„${q.value.trim()}“`, clear: () => { q.value = ""; } },
      kindSel.value !== "final" && { label: selText(kindSel), clear: () => { kindSel.value = "final"; } },
      catSel.value && { label: selText(catSel), clear: () => { catSel.value = ""; } },
      topicSel.value && { label: selText(topicSel), clear: () => { topicSel.value = ""; } },
      mepSel.value && { label: selText(mepSel), clear: () => { mepSel.value = ""; mepVotes = null; } },
      stopa.checked && { label: "česká stopa", clear: () => { stopa.checked = false; } },
      since && { label: `od ${fmtDate(since)}`, clear: () => { since = null; } },
    ].filter(Boolean);
    let chipList = [];
    function renderChips() {
      chipList = activeFilters();
      document.getElementById("filter-n").textContent = chipList.length ? `(${chipList.length})` : "";
      chips.hidden = !chipList.length;
      chips.innerHTML = chipList.map((c, i) => `<button type="button" class="chip-x" data-chip="${i}" aria-label="Zrušit filtr ${esc(c.label)}">${esc(c.label)} <span aria-hidden="true">×</span></button>`).join("")
        + (chipList.length > 1 ? '<button type="button" class="chip-clear" data-act="clear">Zrušit vše</button>' : "");
    }
    const onAct = (ev) => {
      const chip = ev.target.closest("[data-chip]"), act = ev.target.closest("[data-act]");
      if (chip) chipList[Number(chip.dataset.chip)]?.clear();
      else if (act?.dataset.act === "clear") activeFilters().forEach((c) => c.clear());
      else if (act?.dataset.act === "kind-all") kindSel.value = "all";
      else return;
      render();
      q.focus();
    };
    chips.addEventListener("click", onAct);
    tbody.addEventListener("click", onAct);
    monthSel.addEventListener("change", () => { since = null; render(); });
    document.querySelector("#votes").closest(".table-wrap").before(csvButton("hlasovani.csv", () => [
      ["id", "datum", "nazev", "reference", "popis", "typ", "vysledek", "cesi_pro", "cesi_proti", "cesi_zdrzel", "cesi_nehlasoval", "hlas_poslance", "zdroj"],
      ...current.map((v) => [v.id, v.date, voteTitle(v), v.reference, voteDesc(v), v.vote_kind ? KIND_LABEL[v.vote_kind] : (v.is_main ? "hlavní" : ""),
        RESULT_LABEL[v.result] || "", ...v.cz, mepVotes ? (POSITION_LABEL[LETTER[mepVotes.get(v.id)]] || "") : "", `https://howtheyvote.eu/votes/${v.id}`]),
    ], "Stáhnout vybraná hlasování (CSV)"));
    kindSel.addEventListener("change", render);
    topicSel.addEventListener("change", render);
    catSel.addEventListener("change", render);
    stopa.addEventListener("change", render);
    mepSel.addEventListener("change", async () => { await loadMepVotes(); render(); });
    q.addEventListener("input", debounce(render, 150));
    render();
  } catch (e) {
    showError(tbody.closest(".table-wrap"), e);
  }
})();
