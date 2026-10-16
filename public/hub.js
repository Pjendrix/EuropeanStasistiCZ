// Úvodní stránka (index.html, generuje scripts/hub.py z data/home.json). Statický obsah funguje i bez tohoto skriptu:
// hemicykl ukazuje poslední závěrečné hlasování, hledání odešle formulář na Poslance. Skript přidá přepínání pěti
// nejnovějších závěrečných hlasování, tooltip u teček, našeptávač hledání a sdílení hlasování z hera.
"use strict";

setNav("");

const HOME = JSON.parse(document.getElementById("home-data")?.textContent || "null");
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- hemicykl: přepínání hlasování -------------------------------------------------------
const SYM = { F: "M-5.5 1 L-1.8 4.8 L5.8 -4.2", A: "M-4.6 -4.6 L4.6 4.6 M4.6 -4.6 L-4.6 4.6", B: "M-5.2 0 L5.2 0" };
const LEGEND = [["F", "pro"], ["A", "proti"], ["B", "zdrželo se"], ["N", "nehlasovalo"]];
const dotSvg = (k) => (k === "N" ? '<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="10.5" class="hm-n"/></svg>'
  : k === "X" ? '<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="10.5" class="hm-x"/></svg>'
    : `<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="13" class="hm-${k}"/><path class="hm-sym" d="${SYM[k]}"/></svg>`);

function captionHtml(v) {
  const ok = v.result === "ADOPTED";
  const res = ok ? "✓ Přijato" : v.result === "REJECTED" ? "✕ Zamítnuto" : esc(RESULT_LABEL[v.result] || "výsledek neuveden");
  const legend = LEGEND.filter(([k]) => v.counts[k]).map(([k, l]) => `<li>${dotSvg(k)}<span><b>${v.counts[k]}</b> ${l}</span></li>`).join("")
    + (v.counts.X ? `<li>${dotSvg("X")}<span><b>${v.counts.X}</b> mimo mandát</span></li>` : "");
  return `<div class="hm-cap-meta"><span>${fmtDate(v.date)}</span><span class="hm-tag">${esc(v.kind_label)}</span><span class="hm-res${ok ? "" : " no"}">${res}</span></div>
    <p class="hm-cap-title">${esc(v.title)}</p><ul class="hm-legend">${legend}</ul>`;
}

let vi = 0;
const hemi = document.getElementById("hm-hemi");
const seats = hemi ? [...hemi.querySelectorAll(".hm-seat")] : [];

function renderVote(i) {
  if (!HOME) return;
  vi = i;
  const v = HOME.votes[i];
  seats.forEach((a) => { a.dataset.pos = v.pos[a.dataset.id] || "X"; a.dataset.party = v.party[a.dataset.id] || ""; });
  document.getElementById("hm-big").innerHTML = `${v.counts.F}<em>:</em>${v.counts.A}`;
  const cap = document.getElementById("hm-cap");
  const upd = () => {
    cap.innerHTML = captionHtml(v);
    document.getElementById("hm-idx").textContent = `${i + 1} / ${HOME.votes.length}`;
    const more = document.getElementById("hm-more");
    more.href = `v/${v.id}.html`;
    more.setAttribute("aria-label", `Detail hlasování: ${v.title}`);
    document.getElementById("hm-prev").disabled = i === 0;
    document.getElementById("hm-next").disabled = i === HOME.votes.length - 1;
  };
  if (REDUCED) upd();
  else { cap.classList.add("swap"); setTimeout(() => { upd(); cap.classList.remove("swap"); }, 170); }
}

if (HOME && hemi) {
  document.getElementById("hm-prev").addEventListener("click", () => renderVote(Math.max(0, vi - 1)));
  document.getElementById("hm-next").addEventListener("click", () => renderVote(Math.min(HOME.votes.length - 1, vi + 1)));
  document.querySelector(".hm-step").addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") { ev.preventDefault(); if (vi > 0) renderVote(vi - 1); }
    if (ev.key === "ArrowRight") { ev.preventDefault(); if (vi < HOME.votes.length - 1) renderVote(vi + 1); }
  });
  // Tooltip: jméno, strana a hlas; tečky stejné strany zůstanou, ostatní zesvětlí.
  const tip = document.getElementById("hm-tip");
  const show = (a) => {
    const pos = HOME.votes[vi].pos[a.dataset.id] || "X";
    tip.innerHTML = `<b>${esc(HOME.names[a.dataset.id] || "")}</b><span>${esc(a.dataset.party)} · ${esc(HOME.pos_txt[pos])}</span>`;
    const r = a.getBoundingClientRect(), h = hemi.getBoundingClientRect();
    tip.style.left = `${r.left + r.width / 2 - h.left}px`;
    tip.style.top = `${r.top - h.top}px`;
    tip.classList.add("on");
    hemi.classList.add("dim");
    seats.forEach((s) => s.classList.toggle("mate", s.dataset.party === a.dataset.party));
  };
  const hide = () => { tip.classList.remove("on"); hemi.classList.remove("dim"); };
  seats.forEach((a) => {
    a.addEventListener("pointerenter", () => show(a));
    a.addEventListener("pointerleave", hide);
    a.addEventListener("focus", () => show(a));
    a.addEventListener("blur", hide);
  });
}

// Sdílení z hera: stejná karta jako na detailu hlasování (data připravená při buildu, share.js).
window.shareContext = (kind) => {
  if (kind !== "hero" || !HOME) return null;
  const v = HOME.votes[vi];
  const d = HOME.share[String(v.id)];
  if (!d) return null;
  const url = siteUrl(`v/${v.id}.html`);
  return {
    kind: "vote", url, filename: `ep-watch-hlasovani-${v.id}`, subtitle: `Hlasování · ${fmtDate(v.date)}`,
    text: `${d.title} (${fmtDate(v.date)}): ${d.sentence}. Češi: ${v.counts.F} pro, ${v.counts.A} proti. Zdroj: HowTheyVote.eu, EP Watch CZ`,
    cite: `Evropský parlament ${fmtDate(v.date)}, ${d.title} (${d.kindLabel}): ${d.resultLabel}, ${d.ep[0]} pro, ${d.ep[1]} proti, ${d.ep[2]} se zdrželo. Čeští poslanci v mandátu: ${v.counts.F} pro, ${v.counts.A} proti, ${v.counts.B} se zdrželo, ${v.counts.N} nehlasovalo. Zdroj: HowTheyVote.eu (${HTV_SOURCE}/votes/${v.id}).`,
    data: { ...d, urlShort: url.replace(/^https?:\/\//, "").replace(/\.html$/, "") },
  };
};

// --- mozaika poslanců: jméno a strana pod mozaikou ----------------------------------------
const mosaic = document.getElementById("hm-mosaic");
if (mosaic) {
  const mcap = document.getElementById("hm-mcap");
  const set = (ev) => { const a = ev.target.closest("a"); mcap.textContent = a ? a.dataset.n : ""; };
  mosaic.addEventListener("pointerover", set);
  mosaic.addEventListener("focusin", set);
  mosaic.addEventListener("pointerleave", () => { mcap.textContent = ""; });
  mosaic.addEventListener("focusout", () => { mcap.textContent = ""; });
}

// --- hledání: poslanci, strany, hlasování; seskupené, max. 4 ve skupině, bez řazení podle „relevance“ -----
const q = document.getElementById("hub-q");
const list = document.getElementById("hub-results");
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let index = null; // načte se při prvním psaní
let items = [], sel = -1;

async function loadIndex() {
  if (index) return index;
  const [ov, parties, votes, groups] = await Promise.all([getJSON("overview.json"), getJSON("parties/index.json"), loadSearch(), getJSON("groups.json").catch(() => [])]);
  const gLabel = (g) => { const x = g && groups.find((y) => y.ep_code === g.code || y.code === g.code); return x ? (CZ_GROUP_LABEL[x.code] || x.short_label) : g?.short_label; };
  const sortCs = (a, b) => a.sort.localeCompare(b.sort, "cs");
  index = {
    meps: ov.meps.map((m) => ({ href: mepUrl(m.id), label: displayName(m), sort: m.sort_label || m.name, img: m.photo_url ? photoUrl(m, true) : "",
      sub: [m.party?.short_label === "Ind." ? "nezávislý/á" : m.party?.short_label, gLabel(m.group)].filter(Boolean).join(" · ") + (isActive(m) ? "" : " · bývalý/á"),
      key: norm(`${displayName(m)} ${m.name} ${m.party?.short_label || ""}`) })).sort(sortCs),
    parties: parties.parties.map((p) => ({ href: partyUrl(p.id), label: p.name || p.short_label, sort: p.name || p.short_label, sub: `strana · ${p.short_label}`, mark: "S",
      key: norm(`${p.name || ""} ${p.short_label}`) })).sort(sortCs),
    // chronologicky od nejnovějšího
    votes: votes.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id)
      .map((v) => ({ href: isFinal(v) ? `v/${v.id}.html` : `vote.html?id=${v.id}&m=${v.month}`, label: voteTitle(v), mark: "H",
        sub: `${fmtDate(v.date)}${v.vote_kind ? ` · ${KIND_LABEL[v.vote_kind] || ""}` : ""}`,
        key: norm(`${voteTitle(v)} ${v.reference || ""} ${v.description_cs || ""}`) })),
  };
  return index;
}

function closeList() { list.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); items = []; sel = -1; }

function mark() {
  list.querySelectorAll('[role="option"]').forEach((o) => o.setAttribute("aria-selected", String(Number(o.dataset.k) === sel)));
  if (sel >= 0) { q.setAttribute("aria-activedescendant", `hub-opt-${sel}`); document.getElementById(`hub-opt-${sel}`)?.scrollIntoView({ block: "nearest" }); }
}

async function search() {
  const needle = norm(q.value.trim());
  if (needle.length < 2) { closeList(); return; }
  const idx = await loadIndex();
  if (norm(q.value.trim()) !== needle) return; // mezitím se psalo dál
  const groups = [["Poslanci", idx.meps], ["Strany", idx.parties], ["Hlasování", idx.votes]]
    .map(([label, arr]) => [label, arr.filter((x) => x.key.includes(needle)).slice(0, 4)]).filter(([, arr]) => arr.length);
  items = groups.flatMap(([, arr]) => arr);
  let k = 0;
  list.innerHTML = groups.map(([label, arr]) => `<li class="hm-g" role="presentation">${label}</li>` + arr.map((x) => {
    const i = k++;
    return `<li role="option" id="hub-opt-${i}" data-k="${i}" aria-selected="false"><a href="${esc(x.href)}" tabindex="-1">${x.img ? `<img src="${esc(x.img)}" alt="" width="34" height="34">` : `<span class="hm-ic" aria-hidden="true">${x.mark || "•"}</span>`}
      <span class="hm-rt"><span class="hm-t1">${esc(x.label)}</span><small>${esc(x.sub)}</small></span></a></li>`;
  }).join("")).join("") || '<li class="hm-none" role="presentation">Nic jsme nenašli. Zkuste jméno, zkratku strany nebo téma hlasování.</li>';
  list.hidden = false;
  q.setAttribute("aria-expanded", "true");
  sel = items.length ? 0 : -1;
  mark();
}

if (q && list) {
  q.addEventListener("input", search);
  q.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" && items.length) { ev.preventDefault(); sel = (sel + 1) % items.length; mark(); }
    else if (ev.key === "ArrowUp" && items.length) { ev.preventDefault(); sel = (sel - 1 + items.length) % items.length; mark(); }
    else if (ev.key === "Enter" && sel >= 0 && !list.hidden) { ev.preventDefault(); location.href = items[sel].href; }
    else if (ev.key === "Escape") { q.value = ""; closeList(); }
  });
  list.addEventListener("mousedown", (ev) => { const o = ev.target.closest('[role="option"]'); if (o) { ev.preventDefault(); location.href = items[Number(o.dataset.k)].href; } });
  document.addEventListener("click", (ev) => { if (!ev.target.closest(".hm-search")) closeList(); });
  // Klávesa „/“ mimo pole zaměří hledání.
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && !ev.ctrlKey && !ev.metaKey && !/^(input|textarea|select)$/i.test(document.activeElement?.tagName || "") && !document.activeElement?.isContentEditable) {
      ev.preventDefault();
      q.focus();
    }
  });
}
