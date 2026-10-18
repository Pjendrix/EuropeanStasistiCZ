// Kvíz „Moje shoda“ jako aplikace (kviz.html): úvod → jedna otázka na obrazovce → výsledek. Krok je v #hash
// (#otazka-3, #vysledek), postup v localStorage (epw-kviz: délka, index, odpovědi, přepínač odhalení).
// Otázky a hlasy z data/quiz.json (scripts/quiz.py), srozumitelné názvy od Claude Haiku z data/quiz_summaries.json.
// Shodu počítá jen tenhle prohlížeč (lib/quiz.js), nic se neodesílá.
import { CATEGORY_META, getJSON, loadCategories, soft } from "../lib/data.js";
import { KIND_LABEL, displayName, esc, fmtDate, fmtNum, fmtPct, isActive, procedureUrl, siteUrl, todayCZ } from "../lib/format.js";
import {
  ANSWER_LABEL, MIN_COMMON, POSITION_TEXT, STORE_KEY, agreement, answeredCount, compareRows, czCounts, hemiPoints, orderIds, parseState,
  realCount, resumeIndex,
} from "../lib/quiz.js";
import { REDUCED_MOTION, avatar, mepUrl, photoUrl, setNav, showError } from "../lib/ui.js";

setNav("quiz");

const SVG = (d, w = 2.2) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  arrow: SVG('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  left: SVG('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  check: SVG('<path d="M5 12.5l4 4L19 7"/>', 3),
  x: SVG('<path d="M6 6l12 12M18 6L6 18"/>', 3),
  minus: SVG('<path d="M6 12h12"/>', 3),
  close: SVG('<path d="M6 6l12 12M18 6L6 18"/>', 2),
  info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>', 2),
  chev: '<svg class="qz-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  rule: SVG('<path d="M4 6h16M4 12h10M4 18h6"/>', 2),
  spark: SVG('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>', 2),
  lock: SVG('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 2),
  share: SVG('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', 2),
};
const GLYPH = { F: IC.check, A: IC.x, B: IC.minus };
const RES_VERB = { ADOPTED: "přijal", REJECTED: "zamítl" };
const OEIL = (ref) => `https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference=${encodeURIComponent(ref)}`;
const HTV = '<a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL)';

const root = document.getElementById("qz");
const dlg = document.getElementById("qz-dlg");

(async () => {
  try {
    const [quiz, overview, ai] = await Promise.all([getJSON("quiz.json"), getJSON("overview.json"), getJSON("quiz_summaries.json").catch(soft(null)), loadCategories()]);
    run(quiz, overview, ai);
  } catch (e) {
    showError(root, e);
  }
})();

function run(quiz, overview, ai) {
  const byId = new Map(quiz.questions.map((q) => [String(q.id), q]));
  const meps = overview.meps;
  const mepById = new Map(meps.map((m) => [m.id, m]));
  const sm = ai?.items || {};
  const title = (q) => sm[q.procedure]?.nazev || q.title;
  const summary = (q) => sm[q.procedure]?.shrnuti || "";
  const topic = (q) => CATEGORY_META[q.topic]?.label || "";
  const st = load();
  let phase = "intro", dir = 1, tab = "meps";

  document.getElementById("source").innerHTML = `Zdroj hlasů: ${HTV}, poslanci v mandátu k datu hlasování. Výběr otázek <a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/quiz.py">quiz.py</a>, shodu počítá <a href="lib/quiz.js">quiz.js</a> v prohlížeči, <a href="o-projektu#moje-shoda">jak počítáme</a>.`;
  if (!quiz.questions.length) {
    root.innerHTML = '<h1>Jak byste hlasovali vy?</h1><p class="muted">Žádné hlasování zatím pravidlu výběru neodpovídá.</p>';
    return;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { /* bez úložiště funguje vše, jen bez pokračování */ }
    return parseState(raw, quiz);
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ len: st.len, idx: st.idx, answers: st.answers, reveal: st.reveal })); } catch (e) { /* bez úložiště */ }
  }
  const list = () => quiz[st.len].map((id) => byId.get(String(id))).filter(Boolean);

  // --- krok v adrese ---------------------------------------------------------------------------
  function fromHash() {
    const h = location.hash;
    const m = /^#otazka-(\d+)$/.exec(h);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= list().length) { phase = "q"; st.idx = Number(m[1]) - 1; }
    else if (h === "#vysledek") phase = "result";
    else phase = "intro";
  }
  function toHash(push) {
    const h = phase === "q" ? `#otazka-${st.idx + 1}` : phase === "result" ? "#vysledek" : "";
    if (location.hash === h || (!h && !location.hash)) return;
    const url = location.pathname + location.search + h;
    if (push) history.pushState(null, "", url); else history.replaceState(null, "", url);
  }
  function go(next, { push = true, focus = true } = {}) {
    phase = next;
    save();
    toHash(push);
    render(focus);
  }
  window.addEventListener("popstate", () => { closeDetail(); fromHash(); render(true); });

  function render(focus) {
    // ≤760 px „režim aplikace“: hlavička, spodní lišta i patička zmizí jen u otázek (CSS body.qz-app).
    document.body.classList.toggle("qz-app", phase === "q");
    if (phase === "q") renderQ();
    else if (phase === "result") renderResult();
    else renderIntro();
    if (focus) {
      const target = root.querySelector(phase === "q" ? ".qz-card" : "h1");
      target?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  // --- úvod ------------------------------------------------------------------------------------
  function renderIntro() {
    const qs = list(), done = answeredCount(qs, st.answers);
    const resume = done > 0 && done < qs.length, finished = done === qs.length;
    const pv = quiz.short.slice(0, 3).map((id) => byId.get(String(id))).filter(Boolean);
    const len = (key, name, minutes) => `<label class="qz-len-opt"><input type="radio" name="qz-len" value="${key}"${st.len === key ? " checked" : ""}><span><b>${name}</b><small>${quiz[key].length} otázek · asi ${minutes} minut${minutes < 5 ? "y" : ""}</small></span></label>`;
    root.innerHTML = `<div class="qz-intro">
      <div>
        <p class="qz-eyebrow">Kvíz · Moje shoda</p>
        <h1 tabindex="-1">Jak byste <b>hlasovali vy?</b></h1>
        <p class="qz-lead">Projděte skutečná hlasování Evropského parlamentu jedno po druhém. Na konci uvidíte, jak často s vámi hlasoval každý český europoslanec.</p>
        <div class="qz-len" role="radiogroup" aria-label="Délka kvízu">${len("short", "Rychlý", Math.max(1, Math.round(quiz.short.length / 4)))}${len("long", "Delší", Math.max(1, Math.round(quiz.long.length / 4)))}</div>
        <label class="qz-sw"><input type="checkbox" id="qz-rev"${st.reveal ? " checked" : ""}> Po každé odpovědi ukázat, jak hlasovali Češi</label>
        <div class="qz-go">${resume
          ? `<button type="button" class="qz-btn gold" id="qz-resume">Pokračovat · ${done} z ${qs.length} ${IC.arrow}</button><button type="button" class="qz-btn" id="qz-new">Začít znovu</button>`
          : finished
            ? `<button type="button" class="qz-btn gold" id="qz-show">Ukázat výsledek ${IC.arrow}</button><button type="button" class="qz-btn" id="qz-new">Začít znovu</button>`
            : `<button type="button" class="qz-btn gold" id="qz-start">Začít ${IC.arrow}</button>`}</div>
        <ul class="qz-notes">
          <li>${IC.rule}<span><b>Otázky vybírá pravidlo, ne redakce.</b> Zákony, o kterých se v plénu nejvíc hlasovalo a ve kterých Češi nehlasovali jednotně.
            <details><summary>Celé pravidlo</summary><p>${esc(quiz.rule)} <a href="o-projektu#moje-shoda">Proč takhle</a>.</p></details></span></li>
          ${Object.keys(sm).length ? `<li>${IC.spark}<span><b>Názvy a popisy otázek napsala AI</b> (Claude Haiku, model ${esc(ai.model)}), ne redakce ani úřady. Vychází jen z úředního názvu a popisu hlasování; úřední znění je u každé otázky pod „Více o hlasování“.
            <details><summary>Přesné zadání pro AI</summary><pre class="ai-prompt small">${esc(ai.prompt)}</pre><p><a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/quiz_summaries.py">quiz_summaries.py</a></p></details></span></li>` : ""}
          <li>${IC.lock}<span><b>Nic se neodesílá.</b> Odpovědi se počítají jen ve vašem prohlížeči.</span></li>
        </ul>
      </div>
      <div class="qz-art" aria-hidden="true">${pv.map((q, i) => `<div class="qz-pc"><div class="qz-pc-m">${esc(topic(q))}${topic(q) ? " · " : ""}${fmtDate(q.date)}</div><p class="qz-pc-h">${esc(title(q))}</p>${i === pv.length - 1 ? `<p class="qz-pc-s">${esc(summary(q))}</p><div class="qz-pc-o"><span class="sel">Pro</span><span>Proti</span><span>Zdržet se</span></div>` : ""}</div>`).join("")}</div>
    </div>`;
    root.querySelectorAll('input[name="qz-len"]').forEach((r) => r.addEventListener("change", () => { st.len = r.value; st.idx = 0; save(); renderIntro(); root.querySelector(`input[value="${r.value}"]`).focus(); }));
    root.querySelector("#qz-rev").addEventListener("change", (e) => { st.reveal = e.target.checked; save(); });
    const start = (reset) => { if (reset) { st.answers = {}; st.idx = 0; } else st.idx = resumeIndex(list(), st.answers); dir = 1; go("q"); };
    root.querySelector("#qz-start")?.addEventListener("click", () => start(true));
    root.querySelector("#qz-new")?.addEventListener("click", () => start(true));
    root.querySelector("#qz-resume")?.addEventListener("click", () => start(false));
    root.querySelector("#qz-show")?.addEventListener("click", () => go("result"));
  }

  // --- otázka ----------------------------------------------------------------------------------
  // Mini půlkruh českých hlasů: tečky seřazené podle frakce k datu hlasování. names = false při odhalení (jména až ve výsledku).
  function miniHemi(q, names) {
    const ids = orderIds(q, mepById), pts = hemiPoints(ids.length);
    const c = czCounts(q.positions);
    const label = `Čeští poslanci: ${c.F} pro, ${c.A} proti, ${c.B} se zdrželo, ${c.N} nehlasovalo`;
    return `<svg class="qz-hemi" viewBox="0 0 240 122" role="img" aria-label="${esc(label)}">${ids.map((id, i) => {
      const p = q.positions[id], m = mepById.get(Number(id));
      const tip = names && m ? `<title>${esc(displayName(m))}: ${esc(POSITION_TEXT[p] || "")}</title>` : "";
      return `<circle class="qz-dot p-${p}" cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}" r="8.5">${tip}</circle>`;
    }).join("")}</svg>`;
  }

  function revealHtml(q, a) {
    const c = czCounts(q.positions), voted = c.F + c.A + c.B;
    return `<div class="qz-reveal">
      ${miniHemi(q, false)}
      <p class="qz-rv-l">Parlament <b>${esc(RES_VERB[q.result] || "rozhodl")}</b> · ${fmtNum(q.counts[0])} pro · ${fmtNum(q.counts[1])} proti · ${fmtNum(q.counts[2])} se zdrželo</p>
      <p class="qz-rv-l">Čeští poslanci: <b>${c.F} pro · ${c.A} proti · ${c.B} se zdrželo</b> · ${c.N} nehlasovalo</p>
      <p class="qz-rv-you">${a === "S" ? "Přeskočeno, do shody se nepočítá." : `Vy: ${ANSWER_LABEL[a]}. Stejně hlasovalo ${c[a]} z ${voted} českých poslanců, kteří hlasovali.`}</p>
      <p class="qz-rv-hint">Jména uvidíte až ve výsledku, aby neovlivnila další odpovědi.</p>
    </div>`;
  }

  function renderQ() {
    const qs = list(), q = qs[st.idx], a = st.answers[q.id];
    const last = st.idx === qs.length - 1;
    const kind = KIND_LABEL[q.vote_kind] || "závěrečné hlasování";
    const hasAi = Boolean(sm[q.procedure]);
    const seg = (x, i) => {
      const ax = st.answers[x.id];
      return `<button type="button" class="${ax ? `a-${ax}` : ""}${i === st.idx ? " cur" : ""}" data-j="${i}" aria-label="Otázka ${i + 1} z ${qs.length}${ax ? `, odpověď: ${ANSWER_LABEL[ax]}` : ", bez odpovědi"}"${i === st.idx ? ' aria-current="step"' : ""}></button>`;
    };
    const ans = (v, label, short) => `<button type="button" class="qz-ans ${v}" data-a="${v}" aria-pressed="${a === v}"><span class="qz-gl">${GLYPH[v]}</span>${short ? `<span class="qz-l-long">${label}</span><span class="qz-l-short">${short}</span>` : label}<kbd aria-hidden="true">${{ F: 1, A: 2, B: 3 }[v]}</kbd></button>`;
    root.innerHTML = `<div class="qz-q">
      <div class="qz-top">
        <button type="button" class="qz-icon" id="qz-x" aria-label="Ukončit a vrátit se na úvod kvízu (postup zůstane uložený)">${IC.close}</button>
        <div class="qz-prog" role="group" aria-label="Průběh kvízu, kliknutím přejdete na otázku">${qs.map(seg).join("")}</div>
        <span class="qz-n">${st.idx + 1} / ${qs.length}</span>
      </div>
      <article class="qz-card${REDUCED_MOTION || !dir ? "" : dir > 0 ? " in-next" : " in-prev"}" tabindex="-1" aria-labelledby="qz-qh">
        <div class="qz-meta">${topic(q) ? `<span class="qz-chip">${esc(topic(q))}</span>` : ""}<span>${fmtDate(q.date)} · ${esc(kind)}</span></div>
        <h1 class="qz-qh" id="qz-qh"><span class="sr-only">Otázka ${st.idx + 1} z ${qs.length}: </span>${esc(title(q))}${hasAi ? ' <span class="qz-ai" title="Název a shrnutí napsala AI (Claude Haiku) z úředního názvu">AI</span>' : ""}</h1>
        ${summary(q) ? `<p class="qz-sum">${esc(summary(q))}</p>` : ""}
        <button type="button" class="qz-more" id="qz-more" aria-haspopup="dialog">${IC.info} Více o hlasování</button>
      </article>
      <div class="qz-ask${a ? " done" : ""}">
        <p class="qz-ask-h" id="qz-ask-h">Jak byste hlasovali?</p>
        <div class="qz-answers" role="group" aria-labelledby="qz-ask-h">${ans("F", "Pro")}${ans("A", "Proti")}${ans("B", "Zdržel/a bych se", "Zdržet se")}</div>
        <button type="button" class="qz-skip" data-a="S" aria-pressed="${a === "S"}">Nevím, přeskočit <kbd aria-hidden="true">0</kbd></button>
      </div>
      <div id="qz-rev" aria-live="polite">${a && st.reveal ? revealHtml(q, a) : ""}</div>
      <div class="qz-nav">
        <button type="button" class="qz-btn" id="qz-prev"${st.idx === 0 ? " disabled" : ""}>${IC.left}<span>Předchozí</span></button>
        ${a ? `<button type="button" class="qz-btn primary" id="qz-next">${last ? "Ukázat výsledek" : "Další otázka"} ${IC.arrow}</button>`
          : `<span class="qz-kbd" aria-hidden="true"><span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> odpověď</span><span><kbd>0</kbd> přeskočit</span><span><kbd>I</kbd> detail</span><span><kbd>←</kbd> zpět</span></span>`}
      </div>
    </div>`;
    root.querySelector(".qz-prog").addEventListener("click", (e) => { const b = e.target.closest("[data-j]"); if (b) goTo(Number(b.dataset.j)); });
    root.querySelector("#qz-x").addEventListener("click", () => go("intro"));
    root.querySelector("#qz-more").addEventListener("click", () => openDetail(q));
    root.querySelectorAll(".qz-ans, .qz-skip").forEach((b) => b.addEventListener("click", () => answer(b.dataset.a)));
    root.querySelector("#qz-prev").addEventListener("click", () => goTo(st.idx - 1));
    root.querySelector("#qz-next")?.addEventListener("click", next);
  }

  function answer(v) {
    const q = list()[st.idx];
    st.answers[q.id] = v;
    save();
    if (!st.reveal) { next(); return; }
    dir = 0;
    renderQ();
    const btn = root.querySelector("#qz-next");
    btn?.focus({ preventScroll: true });
    root.querySelector("#qz-rev").scrollIntoView({ block: "nearest", behavior: REDUCED_MOTION ? "auto" : "smooth" });
  }
  function goTo(j) {
    if (j < 0 || j >= list().length) return;
    dir = j >= st.idx ? 1 : -1;
    st.idx = j;
    go("q", { push: false });
  }
  function next() {
    if (st.idx >= list().length - 1) { tab = "meps"; go("result"); return; }
    goTo(st.idx + 1);
  }

  // --- detail hlasování (<dialog>: desktop panel vpravo, ≤560 px spodní list) ------------------
  function openDetail(q) {
    const story = procedureUrl(q.procedure);
    const s = summary(q);
    dlg.innerHTML = `<div class="qz-dlg-in">
      <span class="qz-grip" aria-hidden="true"></span>
      <button type="button" class="qz-icon qz-dlg-x" aria-label="Zavřít detail">${IC.close}</button>
      <p class="qz-eyebrow">Více o hlasování</p>
      <h2 id="qz-dlg-h">${esc(title(q))}</h2>
      ${s ? `<section><h3>Shrnutí <span class="qz-ai">AI</span></h3><p>${esc(s)}</p><p class="small muted">Napsala AI (Claude Haiku, model ${esc(ai.model)}) jen z úředního názvu a popisu hlasování.</p></section>` : ""}
      <section><h3>Úřední znění</h3><p>${esc(q.title)}${q.description ? ` · ${esc(q.description)}` : ""}</p>${q.title_en && q.title_en !== q.title ? `<p class="small muted" lang="en">${esc(q.title_en)}</p>` : ""}</section>
      <section><h3>Hlasování</h3><p>${fmtDate(q.date)} · ${esc(KIND_LABEL[q.vote_kind] || "závěrečné hlasování")}${topic(q) ? ` · ${esc(topic(q))}` : ""}</p>
        ${q.roll_calls ? `<p>O tomto zákonu se v plénu jmenovitě hlasovalo <b>${fmtNum(q.roll_calls)}×</b> (víc hlasování znamená víc sporů o text, proto je v kvízu). V kvízu je jen závěrečné hlasování.</p>` : ""}</section>
      <section><h3>Procedura ${esc(q.procedure)}</h3><p>${story ? `<a href="${story}">Příběh zákona na EP Watch</a> · ` : ""}<a href="${OEIL(q.procedure)}">Legislativní observatoř EP</a></p></section>
      <section><h3>Zdroj</h3><p>${HTV}, hlasy poslanců v mandátu k datu hlasování.</p></section>
    </div>`;
    dlg.querySelector(".qz-dlg-x").addEventListener("click", closeDetail);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    dlg.querySelector(".qz-dlg-x").focus();
  }
  function closeDetail() {
    if (!dlg.open) return;
    if (typeof dlg.close === "function") dlg.close(); else { dlg.removeAttribute("open"); dlg.dispatchEvent(new Event("close")); }
  }
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeDetail(); });   // klik na pozadí
  dlg.addEventListener("close", () => root.querySelector("#qz-more")?.focus({ preventScroll: true }));

  document.addEventListener("keydown", (e) => {
    if (phase !== "q" || dlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable], summary, a")) return;
    const k = e.key.toLowerCase();
    const map = { 1: "F", 2: "A", 3: "B", 0: "S" };
    const q = list()[st.idx];
    if (map[k]) { e.preventDefault(); answer(map[k]); }
    else if (k === "arrowleft") { e.preventDefault(); goTo(st.idx - 1); }
    else if ((k === "arrowright" || k === "enter") && st.answers[q.id]) {
      if (k === "enter" && e.target.closest("button")) return;   // Enter na tlačítku = jeho vlastní akce
      e.preventDefault();
      next();
    } else if (k === "i") { e.preventDefault(); openDetail(q); }
  });

  // --- výsledek --------------------------------------------------------------------------------
  const subLine = (m) => esc([m.party?.short_label, m.group?.short_label].filter(Boolean).join(" · ")) + (isActive(m) ? "" : " · bývalý/á poslanec/kyně");

  function renderResult() {
    const qs = list(), n = realCount(qs, st.answers);
    if (n < MIN_COMMON) {
      root.innerHTML = `<div class="qz-rs"><div class="qz-rs-head"><p class="qz-eyebrow">Výsledek</p>
        <h1 tabindex="-1">Na výsledek je potřeba <b>aspoň ${MIN_COMMON} odpovědi</b></h1>
        <p>Odpověděli jste na ${n} z ${qs.length} otázek (přeskočené se nepočítají).</p></div>
        <div class="qz-actions"><button type="button" class="qz-btn gold" id="qz-back">Zpět k otázkám</button></div></div>`;
      root.querySelector("#qz-back").addEventListener("click", () => {
        const i = qs.findIndex((q) => !st.answers[q.id] || st.answers[q.id] === "S");
        st.idx = Math.max(0, i);
        dir = 1;
        go("q");
      });
      return;
    }
    const { enough, few } = agreement(qs, st.answers, meps);
    const top = enough.slice(0, 3);
    const cmp = (m) => `<ul class="qz-cmp">${compareRows(qs, st.answers, m.id).map((r) => {
      const [cls, sym, txt] = r.state === "ok" ? ["ok", "✓", "stejně"] : r.state === "no" ? ["no", "✕", "jinak"] : ["na", "–", r.state === "na" ? "nehlasoval/a" : "nebyl/a v mandátu"];
      return `<li><span class="${cls}" aria-hidden="true">${sym}</span><span>${esc(title(r.q))}</span><span class="qz-pair"><span class="sr-only">${txt}: </span>vy ${ANSWER_LABEL[r.a].toLowerCase()} · ${r.p && r.p !== "N" ? POSITION_TEXT[r.p] : txt}</span></li>`;
    }).join("")}</ul>`;
    const row = (r) => `<li><details class="qz-row"><summary>
        <span class="qz-who">${avatar(r.m, 36)}<span><b>${esc(displayName(r.m))}</b><small>${subLine(r.m)}</small></span></span>
        <span class="qz-bar" role="img" aria-label="Shoda ${fmtPct(r.pct)}"><span style="width:${(r.pct * 100).toFixed(1)}%"></span></span>
        <span class="qz-rp"><b>${fmtPct(r.pct)}</b><small>${r.same} z ${r.common}</small></span>${IC.chev}</summary>
        ${cmp(r.m)}<p class="small"><a href="${mepUrl(r.m.id)}">Profil poslance</a></p></details></li>`;
    const review = qs.map((q) => {
      const a = st.answers[q.id] || "S";
      const ids = orderIds(q, mepById);
      const grp = (p, l) => {
        const xs = ids.filter((id) => q.positions[id] === p);
        return xs.length ? `<div><span class="qz-pl">${l} (${xs.length})</span>${xs.map((id) => { const m = mepById.get(Number(id)); return m ? `<a href="${mepUrl(m.id)}">${esc(displayName(m))}</a>` : ""; }).join("")}</div>` : "";
      };
      return `<div class="qz-rv-card"><h3>${esc(title(q))}</h3>${miniHemi(q, true)}<div><span class="qz-you ${a}">Vy: ${ANSWER_LABEL[a]}</span> <span class="small muted">${fmtDate(q.date)}</span></div>
        <details><summary>Kdo jak hlasoval</summary><div class="qz-posg">${grp("F", "Pro")}${grp("A", "Proti")}${grp("B", "Zdrželi se")}${grp("N", "Nehlasovali")}</div>
        <p class="small muted"><a href="v/${q.id}">Detail hlasování</a> · zdroj ${HTV}</p></details></div>`;
    }).join("");
    const extra = st.len === "short" ? quiz.long.filter((id) => !quiz.short.includes(id)).length : 0;
    root.innerHTML = `<div class="qz-rs">
      <div class="qz-rs-head"><p class="qz-eyebrow">Výsledek · ${n} ${n < 5 ? "odpovědi" : "odpovědí"} z ${qs.length} otázek</p>
        <h1 tabindex="-1">Nejčastěji stejně jako vy <b>hlasovali</b></h1>
        <p>Shoda = podíl otázek, ve kterých poslanec hlasoval stejně jako vy, z otázek, na které jste odpověděli a ve kterých poslanec hlasoval (pro, proti nebo se zdržel). „x z y“ = stejně v x z y takových otázek.</p></div>
      ${top.length ? `<ul class="qz-podium">${top.map((r, i) => `<li class="qz-pod" style="--n:${i}">${avatar(r.m, 76)}<a class="qz-nm" href="${mepUrl(r.m.id)}">${esc(displayName(r.m))}</a><span class="qz-sub">${subLine(r.m)} · ${r.same} z ${r.common}</span><span class="qz-pp">${fmtPct(r.pct)}</span></li>`).join("")}</ul>`
        : `<p class="muted">Žádný poslanec s vámi nemá aspoň ${MIN_COMMON} společné otázky.</p>`}
      <div class="qz-tabs" role="tablist" aria-label="Zobrazení výsledku">
        <button type="button" role="tab" id="qz-tab-m" aria-selected="${tab === "meps"}" aria-controls="qz-pan-m" tabindex="${tab === "meps" ? 0 : -1}">Všichni poslanci</button>
        <button type="button" role="tab" id="qz-tab-r" aria-selected="${tab === "rev"}" aria-controls="qz-pan-r" tabindex="${tab === "rev" ? 0 : -1}">Vaše odpovědi</button>
      </div>
      <div id="qz-pan-m" role="tabpanel" aria-labelledby="qz-tab-m"${tab === "meps" ? "" : " hidden"}>
        <ol class="qz-rlist">${enough.map(row).join("")}</ol>
        ${few.length ? `<p class="qz-few">Méně než ${MIN_COMMON} společné otázky (bez procenta): ${few.map((r) => `<a href="${mepUrl(r.m.id)}">${esc(displayName(r.m))}</a> (${r.same} z ${r.common})`).join(", ")}</p>` : ""}
        <p class="small muted">Klikněte na řádek: porovnání otázka po otázce. Seřazeno podle shody, u stejné shody podle počtu společných otázek, pak abecedně.</p>
      </div>
      <div id="qz-pan-r" class="qz-review" role="tabpanel" aria-labelledby="qz-tab-r"${tab === "rev" ? "" : " hidden"}>${review}</div>
      <div class="qz-actions">
        ${top.length ? `<button type="button" class="qz-btn gold" id="qz-share" data-share="quiz" aria-haspopup="dialog">${IC.share}<span>Sdílet výsledek</span></button>` : ""}
        ${extra ? `<button type="button" class="qz-btn" id="qz-long">Pokračovat delším testem (+${extra})</button>` : ""}
        <button type="button" class="qz-btn" id="qz-again">Začít znovu</button>
      </div>
    </div>`;
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const setTab = (t, focus) => { tab = t; renderResult(); if (focus) root.querySelector(t === "meps" ? "#qz-tab-m" : "#qz-tab-r").focus(); };
    tabs.forEach((b) => {
      b.addEventListener("click", () => setTab(b.id === "qz-tab-m" ? "meps" : "rev", true));
      b.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setTab(tab === "meps" ? "rev" : "meps", true); } });
    });
    root.querySelector("#qz-long")?.addEventListener("click", () => { st.len = "long"; st.idx = resumeIndex(list(), st.answers); dir = 1; go("q"); });
    root.querySelector("#qz-again").addEventListener("click", () => { st.answers = {}; st.idx = 0; go("intro"); });
    // Kontext pro panel sdílení (share.js): jen to, co je na obrazovce; obrázek se kreslí v prohlížeči.
    const url = siteUrl("kviz");
    window.shareContext = () => ({
      kind: "quiz", url, filename: "ep-watch-moje-shoda", subtitle: `Tři nejvyšší shody z ${n} odpovědí`,
      trust: "Obrázek vznikne jen ve vašem prohlížeči, nic se neodesílá. Má datum, zdroj a adresu kvízu. Není to doporučení, koho volit.",
      text: `Moje shoda s českými europoslanci v kvízu EP Watch CZ (${n} otázek): ${top.map((r) => `${displayName(r.m)} ${fmtPct(r.pct)}`).join(", ")}.`,
      data: {
        answered: n, date: todayCZ(), urlShort: url.replace(/^https?:\/\//, ""), title: "Moje shoda s českými europoslanci",
        top: top.map((r) => ({ name: displayName(r.m), sub: [r.m.party?.short_label, r.m.group?.short_label].filter(Boolean).join(" · "), pct: fmtPct(r.pct), pair: `${r.same} z ${r.common} otázek`, photoUrl: photoUrl(r.m) || null })),
      },
    });
  }

  fromHash();
  if (phase === "q" && !Object.keys(st.answers).length && st.idx > 0) st.idx = 0;
  render(false);
}
