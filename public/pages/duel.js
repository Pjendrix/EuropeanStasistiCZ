// Skript stránky duel.html: dva čeští poslanci vedle sebe (data/duel.json ze scripts/duel.py).
// Žádný vítěz: obě strany mají stejnou škálu, žádné zvýraznění vyšší hodnoty, žádné skóre.
import { getJSON, loadSearch, param } from "../lib/data.js";
import { CZ_GROUP_LABEL, EP_SOURCE, HTV_SOURCE, displayName, fmtDate, fmtNum, fmtPct, groupColor, isActive, positionFor, voteSubtitle, voteTitle } from "../lib/format.js";
import { html, trusted } from "../lib/html.js";
import { METRICS, POS_GLYPH, barWidths, shareMetricRows, mandateSpan, metricValue, orient, pairKey, pickPair, samplePairs, sameMandate, voteHref } from "../lib/duel.js";
import { SHARE_BTN_HTML, infoButton, mepUrl, partyBadge, photoUrl, setNav, showError } from "../lib/ui.js";
setNav("analyses");
setNav("duel");

const BASE = "https://epwatch.cz/";
const SRC = { htv: html`<a href="${HTV_SOURCE}">HowTheyVote.eu</a> (ODbL)`, ep: html`<a href="${EP_SOURCE}">EP Open Data</a> (CC BY 4.0)` };
const ALL_PAGE = 50;
const CARD_MAX = 4;

(async () => {
  const root = document.getElementById("duel");
  try {
    const [d, groups, parties, fresh] = await Promise.all([
      getJSON("duel.json"), getJSON("groups.json"), getJSON("parties.json"), getJSON("freshness.json").catch(() => null),
    ]);
    const byId = new Map(d.meps.map((m) => [m.id, m]));
    const group = (m) => groups.find((g) => g.code === m.group?.code || g.ep_code === m.group?.code) || null;
    const groupName = (m) => { const g = group(m); return g ? CZ_GROUP_LABEL[g.code] || g.short_label : m.group?.short_label || "bez frakce"; };
    const party = (m) => parties.find((p) => String(p.id) === String(m.party?.id)) || null;

    const selA = document.getElementById("pick-a"), selB = document.getElementById("pick-b");
    const options = d.meps.map((m) => html`<option value="${m.id}">${displayName(m)}${isActive(m) ? "" : " (mandát skončil)"}</option>`);
    for (const sel of [selA, selB]) sel.insertAdjacentHTML("beforeend", String(html`${options}`));
    document.getElementById("pick").addEventListener("submit", (e) => {
      e.preventDefault();
      if (selA.value && selB.value && selA.value !== selB.value) location.href = `duel?a=${selA.value}&b=${selB.value}`;
    });

    document.getElementById("source").innerHTML = String(html`Zdroj: ${SRC.htv} a ${SRC.ep}${fresh?.release ? html` · hlasování k ${fmtDate(fresh.release)}` : ""}.
      Srovnání ukazuje čísla, ne kvalitu práce. <a href="o-projektu#metodika">Jak počítáme</a>.`);

    // Sdílená stránka d/{a}-{b} (build_pages.py) nemá parametry: dvojice je v data-pair, pořadí kanonické.
    const fromPath = (document.getElementById("main").dataset.pair || "").split("-");
    const pair = pickPair(param("a") ?? fromPath[0], param("b") ?? fromPath[1], d.meps);
    if (!pair) {
      // „Porovnat s…“ z profilu: ?a= předvyplní prvního poslance, druhého vybere uživatel.
      const pre = param("a");
      if (pre && d.meps.some((m) => String(m.id) === pre)) { selA.value = pre; selB.focus(); }
      root.classList.remove("loading");
      root.innerHTML = String(pickerView(d));
      return;
    }
    selA.value = pair.a; selB.value = pair.b;
    const A = byId.get(pair.a), B = byId.get(pair.b), key = pairKey(pair.a, pair.b), P = d.pairs[key];
    document.title = `${displayName(A)} vs ${displayName(B)} – Duel poslanců – EP Watch CZ`;
    const canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.href = `${BASE}d/${key}`;

    // Akcent strany = barva frakce; stejná frakce u obou: B tlumeně a navíc barva strany jako druhý rozlišovač.
    const accA = groupColor(group(A)), sameGroup = group(A) && group(A) === group(B);
    const accB = sameGroup ? `color-mix(in srgb, ${groupColor(group(B))} 60%, var(--bg))` : groupColor(group(B));
    const stripe = (m) => (sameGroup ? party(m)?.color || party(m)?.chart_color || "transparent" : "transparent");

    root.classList.remove("loading");
    root.style.setProperty("--acc-a", accA);
    root.style.setProperty("--acc-b", accB);
    root.innerHTML = String(html`
      <section class="duel-head" aria-label="Poslanci">
        ${side(A, "a", stripe(A))}
        <div class="duel-vs" aria-hidden="true">vs</div>
        ${side(B, "b", stripe(B))}
      </section>
      <p class="duel-actions"><a class="link-btn" href="duel?a=${pair.b}&amp;b=${pair.a}">Prohodit strany</a>
        · <a class="link-btn" href="duel">Vybrat jinou dvojici</a> ${trusted(SHARE_BTN_HTML)}</p>
      ${metricsView(A, B)}
      ${agreementView(A, B, P)}
      ${divergedView(A, B, P)}
      <p class="small muted duel-note">Srovnání ukazuje čísla, ne kvalitu práce. Počty závisí na délce mandátu, výborech a velikosti frakce;
        nic se nesčítá do skóre a nikdo „nevyhrává“.</p>`);
    root.querySelector("#all-diverged")?.addEventListener("click", (e) => showAll(e.currentTarget, A, B, key));
    root.querySelector("#card-pick")?.addEventListener("click", () => openPicker());

    // Sdílení (úkol 4): karty 1/3–3/3 kreslí share.js (duelCardOps…); odkaz je kanonická sdílená stránka d/{menší}-{větší}
    // (má vlastní náhled odkazu og/duel). Čísla stejná jako na stránce, bez vítěze.
    const shareUrl = `${BASE}d/${key}`;
    const cardSide = (m) => {
      const p = party(m), g = group(m);
      return { name: displayName(m), short: m.family_name || displayName(m), photoUrl: photoUrl(m),
        group: { label: groupName(m), color: groupColor(g) }, party: m.party ? { label: m.party.short_label === "Ind." ? "nezávislý/á" : m.party.short_label, logo: p && !p.independent ? p.logo : null, aspect: p?.logo_aspect || null } : null };
    };
    // Karta 3/3: výchozí = prvních CARD_MAX klíčových hlasování (pravidlo). Volitelně vlastní výběr v panelu „Vybrat
    // hlasování na kartu“ (openPicker); stránka sama se výběrem nemění.
    const cardRow = (r, v) => ({ title: voteTitle(v), meta: [voteSubtitle(v), fmtDate(v.date)].filter(Boolean).join(" · "), a: r.a, b: r.b });
    const keyRows = P.diverged_key.map((r) => orient(r, A.id, B.id)).filter((r) => d.votes[String(r.id)]);
    const divDefault = keyRows.slice(0, CARD_MAX).map((r) => { const v = d.votes[String(r.id)]; return { title: voteTitle(v), meta: fmtDate(v.date), a: r.a, b: r.b }; });
    let divCustom = null; // Map id → řádek karty, nebo null = výchozí výběr
    const topicCard = d.topics.filter((t) => P.topics[t.code] && t.label).map((t) => ({ label: t.label, share: P.topics[t.code][0] / P.topics[t.code][1], n: P.topics[t.code][1] }))
      .sort((x, y) => y.n - x.n).slice(0, 3);
    window.shareContext = () => ({
      kind: "duel", url: shareUrl, filename: `ep-watch-duel-${key}`, subtitle: `${displayName(A)} vs ${displayName(B)}`,
      trust: "Čísla vedle sebe, bez vítěze a hodnocení. Karta má datum dat, zdroj a adresu stránky.",
      text: P.agreement[1] ? `${displayName(A)} vs. ${displayName(B)}: shoda ${fmtPct(P.agreement[0] / P.agreement[1])} ve ${fmtNum(P.agreement[1])} společných hlasováních. Čísla vedle sebe, bez hodnocení. ${shareUrl}`
        : `${displayName(A)} vs. ${displayName(B)}: čísla vedle sebe, bez hodnocení. ${shareUrl}`,
      data: { a: cardSide(A), b: cardSide(B), sameGroup: Boolean(sameGroup), agreement: P.agreement, metrics: shareMetricRows(A, B), diverged: divCustom ? [...divCustom.values()] : divDefault, divergedCustom: Boolean(divCustom), topics: topicCard,
        dataDay: fresh?.release || null, urlShort: shareUrl.replace(/^https?:\/\//, "") },
    });

    function side(m, cls, stripeColor) {
      const g = group(m);
      const span = mandateSpan(m);
      const mandate = isActive(m) ? html`v mandátu od ${fmtDate(span.from)}` : html`mandát ${fmtDate(span.from)} – ${fmtDate(span.to)} (skončil)`;
      const committees = m.committees.length
        ? html`${m.committees.map((c, i) => html`${i ? ", " : ""}<abbr title="${c.name}">${c.code}</abbr>`)}`
        : html`<span class="muted">bez výboru</span>`;
      const photo = photoUrl(m)
        ? html`<figure class="duel-photo"><img src="${photoUrl(m)}" alt="${displayName(m)}" width="160" height="200"><figcaption>© European Union – Source: EP</figcaption></figure>`
        : html`<div class="duel-photo duel-initials" aria-hidden="true">${(m.given_name || "?")[0]}${(m.family_name || "")[0] || ""}</div>`;
      return html`<div class="duel-side duel-${cls}" style="--stripe:${stripeColor}">
        ${photo}
        <h2 class="duel-name"><a href="${mepUrl(m.id)}">${displayName(m)}</a></h2>
        <div class="duel-badges">${trusted(partyBadge(m.party?.id, m.party?.short_label, parties, m))}
          <span class="badge" style="--badge-dot:${groupColor(g)}" title="${g?.name_cs || ""}">${groupName(m)}</span></div>
        <div class="small muted">${mandate}</div>
        <div class="small muted">Výbory: ${committees}</div>
      </div>`;
    }

    function cell(metric, v, side) {
      if (v.n === null) return html`<span class="dm-val" title="zdroj neuvádí">–<span class="sr-only"> zdroj neuvádí</span></span>`;
      const main = v.share !== null && !metric.count ? fmtPct(v.share) : fmtNum(v.n);
      const sub = v.share !== null ? (metric.count ? fmtPct(v.share) : `${fmtNum(v.n)} z ${fmtNum(v.total)}`) : "";
      return html`<span class="dm-val">${metric.pos ? html`<span class="pos pos-${metric.pos}" aria-hidden="true">${POS_GLYPH[metric.pos]} </span>` : ""}${main}${sub ? html`<small>${sub}</small>` : ""}</span>`;
    }

    function metricsView(a, b) {
      const groupsOrder = [...new Set(METRICS.map((x) => x.group))];
      const diffMandate = !sameMandate(a, b);
      return html`<section class="duel-metrics" aria-labelledby="dm-h"><h2 id="dm-h">Čísla vedle sebe</h2>
        <p class="small muted">Proužky rostou od středu na stejné škále pro oba. Delší proužek neznamená lepší práci.</p>
        ${groupsOrder.map((gname) => html`<h3 class="dm-group">${gname}</h3><div class="dm-list">
          ${METRICS.filter((x) => x.group === gname).map((metric) => {
            const va = metricValue(metric, a.metrics), vb = metricValue(metric, b.metrics);
            const isShare = metric.pair && !metric.count;
            const [wa, wb] = barWidths(isShare ? va.share : va.n, isShare ? vb.share : vb.n, isShare);
            const defText = d.definitions[metric.def] || "";
            return html`<div class="dm-row">
              <div class="dm-a">${cell(metric, va, "a")}<span class="dm-bar" style="width:${wa}%"></span></div>
              <div class="dm-label">${metric.label}${trusted(infoButton(String(html`<p>${defText}</p><p>Zdroj: ${SRC[metric.src]}.</p>`), `Definice: ${metric.label}`))}</div>
              <div class="dm-b">${cell(metric, vb, "b")}<span class="dm-bar" style="width:${wb}%"></span></div>
            </div>`;
          })}
        </div>
        ${gname === "Hlasování" ? [a, b].filter((m) => m.group_short).map((m) => html`<p class="small muted dm-period">${displayName(m)}: ve frakci ${m.group_short.since ? `od ${fmtDate(m.group_short.since)}` : "krátce"} (${fmtNum(m.group_short.votes)} hlasování), „proti většině frakce“ se bude měnit.</p>`) : ""}
        ${diffMandate ? html`<p class="small muted dm-period">Počty jsou za dobu mandátu: ${displayName(a)} ${periodText(a)}, ${displayName(b)} ${periodText(b)}. Nepřepočítáváme je na měsíc.</p>` : ""}`)}
      </section>`;
    }

    function periodText(m) {
      const s = mandateSpan(m);
      return s.to ? `${fmtDate(s.from)} – ${fmtDate(s.to)}` : `od ${fmtDate(s.from)}`;
    }

    function agreementView(a, b, p) {
      const [same, total] = p.agreement;
      if (!total) return html`<section class="duel-agree" aria-labelledby="da-h"><h2 id="da-h">Jak často hlasovali stejně</h2>
        <p>Neměli žádné společné hlasování (jejich mandáty se nepřekrývají).</p></section>`;
      const topics = d.topics.filter((t) => p.topics[t.code]).map((t) => ({ ...t, c: p.topics[t.code] }));
      return html`<section class="duel-agree" aria-labelledby="da-h"><h2 id="da-h">Jak často hlasovali stejně</h2>
        <div class="card metric"><div class="label">Shoda${trusted(infoButton(String(html`<p>${d.definitions.pairwise || ""} Počítají se jen hlasování, kdy byli oba v mandátu.</p><p>Zdroj: ${SRC.htv}. <a href="shoda?id=${a.id}">Shoda se všemi Čechy</a>.</p>`), "Definice shody"))}</div><div class="value">${fmtPct(same / total)}</div>
          <div class="detail">${fmtNum(same)} z ${fmtNum(total)} společných hlasování, kde oba hlasovali (pro, proti nebo se zdrželi)</div></div>
        ${topics.length ? html`<h3 class="dm-group">Podle témat</h3><ul class="plain duel-topics">${topics.map((t) => html`<li>
          <span class="dt-label">${t.label || html`Téma ${t.code} <span class="small muted">(zdroj neuvádí název)</span>`}</span><span class="dt-bar"><span style="width:${Math.round((t.c[0] / t.c[1]) * 1000) / 10}%"></span></span>
          <span class="dt-val">${fmtPct(t.c[0] / t.c[1])} <small>z ${fmtNum(t.c[1])}</small></span></li>`)}</ul>` : ""}
      </section>`;
    }

    function posCell(pos, grp, m) {
      return html`<span class="pos pos-${pos}"><span aria-hidden="true">${POS_GLYPH[pos]} </span>${positionFor(pos, m)}</span>
        <div class="small muted">frakce ${grp === "NI" ? "nezařazení" : grp}</div>`;
    }

    function divRows(rows, a, b, lookup) {
      return html`<div class="table-wrap"><table class="compact cards duel-div"><thead><tr><th>Hlasování</th><th>${displayName(a)}</th><th>${displayName(b)}</th></tr></thead><tbody>
        ${rows.map((r) => { const v = lookup(r.id); return html`<tr><td><a href="${voteHref(v)}">${voteTitle(v)}</a><div class="small muted">${[voteSubtitle(v), fmtDate(v.date)].filter(Boolean).join(" · ")}</div></td>
          <td data-label="${displayName(a)}">${posCell(r.a, r.ga, a)}</td><td data-label="${displayName(b)}">${posCell(r.b, r.gb, b)}</td></tr>`; })}
      </tbody></table></div>`;
    }

    function divergedView(a, b, p) {
      const rows = p.diverged_key.map((r) => orient(r, a.id, b.id));
      const all = p.diverged_all
        ? html`<p><button type="button" class="link-btn" id="all-diverged">Všechna hlasování, kde se rozešli (${fmtNum(p.diverged_all)})</button></p><div id="all-list"></div>`
        : "";
      return html`<section class="duel-div-sec" aria-labelledby="dd-h"><h2 id="dd-h">Kde se rozešli</h2>
        <p class="small muted">Klíčová hlasování (výběr pravidlem, <a href="hlasovani">jak vybíráme</a>), kde jeden hlasoval pro a druhý proti. Nejvýš 10, od nejnovějších; frakce k datu hlasování.</p>
        ${rows.length ? divRows(rows, a, b, (id) => d.votes[String(id)]) : html`<p class="muted">V klíčových hlasováních se pro a proti nerozešli.</p>`}
        ${all}
        ${p.diverged_all ? html`<p class="small"><button type="button" class="link-btn" id="card-pick" aria-haspopup="dialog">Vybrat hlasování na kartu ke sdílení</button>
          <span class="muted" id="card-pick-state"></span></p>` : ""}</section>`;
    }

    async function showAll(btn, a, b, k) {
      const box = document.getElementById("all-list");
      btn.disabled = true;
      box.textContent = "Načítám…";
      try {
        const [shard, search] = await Promise.all([getJSON(`duel/${k}.json`), loadSearch()]);
        const votes = new Map(search.map((v) => [v.id, v]));
        const rows = shard.rows.map((r) => orient(r, a.id, b.id)).filter((r) => votes.has(r.id));
        let shown = 0;
        const more = () => {
          shown = Math.min(rows.length, shown + ALL_PAGE);
          box.innerHTML = String(html`${divRows(rows.slice(0, shown), a, b, (id) => votes.get(id))}
            <p class="small muted">${fmtNum(shown)} z ${fmtNum(rows.length)} hlasování (všechna, nejen závěrečná), od nejnovějších.</p>
            ${shown < rows.length ? html`<p><button type="button" class="link-btn" id="all-more">Zobrazit dalších ${fmtNum(Math.min(ALL_PAGE, rows.length - shown))}</button></p>` : ""}`);
          box.querySelector("#all-more")?.addEventListener("click", more);
        };
        more();
      } catch (e) {
        showError(box, e, () => showAll(btn, a, b, k));
      }
    }

    // Volitelný panel: výběr nejvýš CARD_MAX hlasování (z klíčových, případně ze všech rozchodů) pro kartu 3/3.
    let allRows = null; // řádky ze shardu duel/{key}.json, načtené až na požádání
    let allShown = ALL_PAGE;
    async function openPicker() {
      let dlg = document.getElementById("duel-pick-dlg");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "duel-pick-dlg";
        dlg.className = "qz-dlg";
        dlg.setAttribute("aria-labelledby", "duel-pick-h");
        document.body.append(dlg);
        dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
      }
      const sel = new Map(divCustom || []);
      if (!divCustom) keyRows.slice(0, CARD_MAX).forEach((r) => sel.set(r.id, cardRow(r, d.votes[String(r.id)])));
      const render = () => {
        // Vybraná hlasování vždy nahoře (i když v aktuálně zobrazené části seznamu nejsou), aby šla odškrtnout.
        const picked = [...sel].map(([id, c]) => ({ r: { id, a: c.a, b: c.b }, v: null, c }));
        const base = (allRows ? allRows.slice(0, allShown) : keyRows.map((r) => ({ r, v: d.votes[String(r.id)] }))).filter((x) => !sel.has(x.r.id));
        const rows = [...picked, ...base];
        dlg.innerHTML = String(html`<form method="dialog" class="qz-dlg-in">
          <button type="button" class="qz-icon qz-dlg-x" aria-label="Zavřít" value="close">✕</button>
          <h2 id="duel-pick-h">Hlasování na kartu ke sdílení</h2>
          <p class="small muted">Vyberte nejvýš ${CARD_MAX} hlasování, kde jeden hlasoval pro a druhý proti. Výběr se projeví jen na kartě 3/3;
            karta pak místo „klíčová hlasování“ uvede „vybraná hlasování“.</p>
          <p class="small" aria-live="polite" id="duel-pick-n">Vybráno ${sel.size} z ${CARD_MAX}.</p>
          <ul class="plain duel-pick-list">${rows.map(({ r, v, c }) => html`<li><label><input type="checkbox" value="${r.id}"${sel.has(r.id) ? " checked" : ""}>
            <span>${v ? voteTitle(v) : c.title}<span class="small muted"> · ${v ? [voteSubtitle(v), fmtDate(v.date)].filter(Boolean).join(" · ") : c.meta} · ${displayName(A)} ${positionFor(r.a, A)}, ${displayName(B)} ${positionFor(r.b, B)}</span></span></label></li>`)}</ul>
          ${allRows && allShown < allRows.length ? html`<p><button type="button" class="link-btn" id="duel-pick-more">Zobrazit dalších ${fmtNum(Math.min(ALL_PAGE, allRows.length - allShown))}</button>
            <span class="small muted">(${fmtNum(allShown)} z ${fmtNum(allRows.length)}, od nejnovějších)</span></p>` : ""}
          ${allRows ? "" : html`<p><button type="button" class="link-btn" id="duel-pick-all">Zobrazit všechna hlasování, kde se rozešli (${fmtNum(P.diverged_all)})</button></p>`}
          <p class="duel-pick-act"><button type="button" class="btn" id="duel-pick-ok">Použít a sdílet</button>
            <button type="button" class="link-btn" id="duel-pick-reset">Vrátit výchozí výběr</button></p>
        </form>`);
        const lookup = new Map(rows.map((x) => [x.r.id, x]));
        dlg.querySelector(".qz-dlg-x").addEventListener("click", () => dlg.close());
        dlg.querySelectorAll("input[type=checkbox]").forEach((box) => box.addEventListener("change", () => {
          const id = Number(box.value);
          if (box.checked && sel.size >= CARD_MAX) { box.checked = false; dlg.querySelector("#duel-pick-n").textContent = `Na kartu se vejdou nejvýš ${CARD_MAX} hlasování.`; return; }
          if (box.checked) { const x = lookup.get(id); sel.set(id, x.c || cardRow(x.r, x.v)); } else sel.delete(id);
          dlg.querySelector("#duel-pick-n").textContent = `Vybráno ${sel.size} z ${CARD_MAX}.`;
        }));
        dlg.querySelector("#duel-pick-all")?.addEventListener("click", async (e) => {
          e.currentTarget.disabled = true;
          try {
            const [shard, search] = await Promise.all([getJSON(`duel/${key}.json`), loadSearch()]);
            const votes = new Map(search.map((v) => [v.id, v]));
            allRows = shard.rows.map((x) => orient(x, A.id, B.id)).filter((x) => votes.has(x.id)).map((x) => ({ r: x, v: votes.get(x.id) }));
            render();
          } catch (err) { showError(dlg.querySelector(".qz-dlg-in"), err); }
        });
        dlg.querySelector("#duel-pick-more")?.addEventListener("click", () => {
          const y = dlg.scrollTop; allShown += ALL_PAGE; render(); dlg.scrollTop = y;
        });
        dlg.querySelector("#duel-pick-reset").addEventListener("click", () => { divCustom = null; pickState(); dlg.close(); });
        dlg.querySelector("#duel-pick-ok").addEventListener("click", () => {
          const same = sel.size === divDefault.length && keyRows.slice(0, CARD_MAX).every((r) => sel.has(r.id));
          divCustom = same ? null : new Map(sel);
          pickState();
          dlg.close();
          root.querySelector("[data-share]")?.click();
        });
      };
      render();
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    }
    function pickState() {
      const el = document.getElementById("card-pick-state");
      if (el) el.textContent = divCustom ? ` · na kartě váš výběr (${divCustom.size})` : "";
    }

    function pickerView(dd) {
      const s = samplePairs(dd, isActive);
      const link = (row) => { const [x, y] = row.key.split("-").map(Number); return html`<li><a href="duel?a=${x}&amp;b=${y}">${displayName(byId.get(x))} vs ${displayName(byId.get(y))}</a> <span class="small muted">shoda ${fmtPct(row.share)}</span></li>`; };
      return html`<p>Vyberte dva poslance nahoře, nebo začněte jednou z dvojic níže.</p>
        <p class="small muted">Dvojice vybírá pravidlo, ne redakce: mezi současnými poslanci s aspoň 500 společnými hlasováními
          dvě s nejvyšší a dvě s nejnižší shodou.</p>
        <div class="grid-2"><section><h2>Nejčastěji hlasují stejně</h2><ul class="plain">${s.high.map(link)}</ul></section>
        <section><h2>Nejčastěji hlasují jinak</h2><ul class="plain">${s.low.map(link)}</ul></section></div>`;
    }
  } catch (e) {
    showError(root, e);
  }
})();
