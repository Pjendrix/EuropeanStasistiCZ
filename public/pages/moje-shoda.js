// Skript stránky moje-shoda.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { getJSON, soft } from "../lib/data.js";
import { KIND_LABEL, RESULT_LABEL, displayName, esc, fmtDate, fmtPct, isActive, procedureUrl } from "../lib/format.js";
import { avatar, infoButton, mepUrl, setNav, showError } from "../lib/ui.js";
setNav("analyses");
setNav("my-agreement");
// Kvíz „Moje shoda“: otázky a hlasy poslanců z data/quiz.json (scripts/quiz.py), srozumitelné názvy od Claude Haiku
// z data/quiz_summaries.json (scripts/quiz_summaries.py). Shoda se počítá jen tady v prohlížeči.
const ANSWERS = [["F", "Pro"], ["A", "Proti"], ["B", "Zdržel/a bych se"], ["", "Nevím"]];
const MIN_COMMON = 3; // méně společných otázek = číslo bez vypovídací hodnoty, poslanec jde do zvláštní skupiny
(async () => {
  const form = document.getElementById("quiz");
  try {
    const [quiz, overview, ai] = await Promise.all([getJSON("quiz.json"), getJSON("overview.json"), getJSON("quiz_summaries.json").catch(soft(null))]);
    const byId = new Map(quiz.questions.map((q) => [q.id, q]));
    const summaries = ai?.items || {};
    document.getElementById("len-short").textContent = `Krátký test · ${quiz.short.length}`;
    document.getElementById("len-long").textContent = `Delší test · ${quiz.long.length}`;
    document.getElementById("quiz-rule").innerHTML = "<strong>Otázky vybírá pravidlo, ne redakce:</strong> zákony, o kterých se v plénu nejvíc hlasovalo a ve kterých Češi nehlasovali jednotně."
      + infoButton(`<p>${esc(quiz.rule)} <a href="o-projektu.html#moje-shoda">Proč takhle</a>.</p>`, "Pravidlo výběru otázek");
    if (Object.keys(summaries).length) {
      const box = document.getElementById("quiz-ai");
      box.innerHTML = `<strong>Názvy a popisy otázek napsala AI (Claude Haiku, model ${esc(ai.model)}), ne redakce ani úřady.</strong> Vychází jen z úředního názvu a popisu hlasování; úřední název je u každé otázky pod „Úřední znění“.`
        + infoButton(`<p>Přesné zadání pro AI (stejné pro všechny otázky, k němu se připojí úřední název, popis a číslo procedury):</p><pre class="ai-prompt small">${esc(ai.prompt)}</pre><p><a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/quiz_summaries.py">quiz_summaries.py</a></p>`, "Zadání pro AI");
      box.hidden = false;
    }
    if (!quiz.questions.length) {
      form.innerHTML = '<p class="muted">Žádné hlasování zatím pravidlu neodpovídá.</p>';
      return;
    }
    const answers = new Map(); // id hlasování -> odpověď, zachová se i při přepnutí délky
    let qs = [];
    const go = document.getElementById("quiz-go");
    const count = document.getElementById("quiz-count");
    const update = () => {
      const n = qs.filter((q) => answers.get(q.id)).length;
      go.disabled = n < MIN_COMMON;
      count.textContent = `Odpovězeno ${n} z ${qs.length}${n < MIN_COMMON ? ` (aspoň ${MIN_COMMON})` : ""}`;
    };
    const renderForm = () => {
      const len = document.querySelector('input[name="len"]:checked').value;
      qs = quiz[len].map((id) => byId.get(id));
      form.innerHTML = qs.map((q, i) => {
        const story = procedureUrl(q.procedure);
        const sm = summaries[q.procedure];
        const head = sm ? `${esc(sm.nazev)} <span class="ai-tag">shrnutí AI</span>` : esc(q.title);
        return `<fieldset class="card quiz-q" data-id="${q.id}">
          <legend><span class="quiz-n">${i + 1}/${qs.length}</span> ${head}</legend>
          ${sm ? `<p class="quiz-sum">${esc(sm.shrnuti)}</p>` : ""}
          <p class="small muted">${fmtDate(q.date)} · ${esc(KIND_LABEL[q.vote_kind] || "závěrečné hlasování")}${story ? ` · <a href="${story}" target="_blank" rel="noopener">příběh zákona</a>` : ""}</p>
          ${sm ? `<details class="small"><summary>Úřední znění</summary><p>${esc(q.title)}${q.description ? ` · ${esc(q.description)}` : ""} (${esc(q.procedure)})</p></details>` : ""}
          <div class="quiz-opts" role="radiogroup" aria-label="Jak byste hlasovali">${ANSWERS.map(([val, label]) =>
            `<label class="quiz-opt"><input type="radio" name="q${q.id}" value="${val}"${(answers.get(q.id) || "") === val ? " checked" : ""}><span>${label}</span></label>`).join("")}</div>
          <div class="quiz-reveal small" hidden></div>
        </fieldset>`;
      }).join("");
      document.getElementById("quiz-result").hidden = true;
      update();
    };
    form.addEventListener("change", (ev) => {
      const fs = ev.target.closest(".quiz-q");
      if (fs) answers.set(Number(fs.dataset.id), ev.target.value);
      update();
    });
    document.querySelectorAll('input[name="len"]').forEach((r) => r.addEventListener("change", renderForm));
    renderForm();
    const meps = overview.meps;
    go.addEventListener("click", () => {
      // Shoda: stejná odpověď / otázky, kde jste odpověděli vy i poslanec hlasoval (pro, proti, zdržel se).
      const rows = meps.map((m) => {
        let same = 0, common = 0;
        qs.forEach((q) => {
          const a = answers.get(q.id), p = q.positions[String(m.id)];
          if (!a || !p || p === "N") return;
          common += 1;
          if (p === a) same += 1;
        });
        return { m, same, common, pct: common ? same / common : null };
      }).filter((r) => r.common);
      const byName = (x, y) => (x.m.sort_label || x.m.name).localeCompare(y.m.sort_label || y.m.name, "cs");
      // Seřazeno podle shody (u stejné shody víc společných otázek výš, pak abecedně).
      const enough = rows.filter((r) => r.common >= MIN_COMMON).sort((x, y) => y.pct - x.pct || y.common - x.common || byName(x, y));
      const few = rows.filter((r) => r.common < MIN_COMMON).sort(byName);
      const li = (r) => `<li class="quiz-row"><div class="quiz-who">${avatar(r.m, 36)}<div><a href="${mepUrl(r.m.id)}">${esc(displayName(r.m))}</a>
          <div class="small muted">${esc([r.m.party?.short_label, r.m.group?.short_label].filter(Boolean).join(" · "))}${isActive(r.m) ? "" : " · bývalý/á poslanec/kyně"}</div></div></div>
        <div class="quiz-bar" role="img" aria-label="Shoda ${fmtPct(r.pct)}"><span style="width:${(r.pct * 100).toFixed(1)}%"></span></div>
        <div class="quiz-pct"><strong>${fmtPct(r.pct)}</strong><div class="small muted">${r.same} z ${r.common}</div></div></li>`;
      document.getElementById("quiz-list").innerHTML = enough.map(li).join("")
        + (few.length ? `<li class="quiz-few small muted">Méně než ${MIN_COMMON} společné otázky (bez procenta): ${few.map((r) => `<a href="${mepUrl(r.m.id)}">${esc(displayName(r.m))}</a> (${r.same} z ${r.common})`).join(", ")}</li>` : "");
      document.getElementById("quiz-res-note").textContent =
        `Počítá se ${qs.filter((q) => answers.get(q.id)).length} vašich odpovědí. „x z y“ = stejně hlasoval v x z y otázek, ve kterých hlasoval. Seřazeno podle shody, u stejné shody podle počtu společných otázek.`;
      // Po vyhodnocení ukázat u každé otázky skutečný výsledek a odkaz na detail.
      form.querySelectorAll(".quiz-q").forEach((fs) => {
        const q = byId.get(Number(fs.dataset.id));
        const cz = Object.values(q.positions);
        const n = (l) => cz.filter((x) => x === l).length;
        const box = fs.querySelector(".quiz-reveal");
        box.innerHTML = `Parlament: <strong>${esc(RESULT_LABEL[q.result] || "výsledek neuveden")}</strong> (${q.counts[0]} pro, ${q.counts[1]} proti, ${q.counts[2]} se zdrželo) · Češi: ${n("F")} pro, ${n("A")} proti, ${n("B")} se zdrželo, ${n("N")} nehlasovalo · <a href="v/${q.id}.html">jak hlasoval kdo</a>`;
        box.hidden = false;
      });
      const res = document.getElementById("quiz-result");
      res.hidden = false;
      res.querySelector("h2").focus();
    });
    document.getElementById("quiz-reset").addEventListener("click", () => {
      answers.clear();
      renderForm();
      window.scrollTo({ top: 0 });
    });
    document.getElementById("source").innerHTML =
      `Zdroj: <a href="https://howtheyvote.eu">HowTheyVote.eu</a> (ODbL), hlasy poslanců v mandátu k datu hlasování. Výběr otázek: <a href="https://github.com/Pjendrix/ep-watch-cz-open/blob/main/scripts/quiz.py">quiz.py</a>.`;
  } catch (e) {
    showError(form, e);
  }
})();
