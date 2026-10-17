// Úvodní stránka (index.html, generuje scripts/hub.py z data/home.json). Statický obsah funguje i bez tohoto skriptu:
// hemicykl ukazuje poslední závěrečné hlasování, hledání odešle formulář na Poslance. Skript přidá přepínání pěti
// nejnovějších závěrečných hlasování, tooltip u teček, našeptávač hledání a sdílení hlasování z hera.
import { combobox } from "./lib/search.js";
import { esc, fmtDate, todayCZ, withShareUrl } from "./lib/format.js";
import { setNav } from "./lib/ui.js";

setNav("");

const HOME = JSON.parse(document.getElementById("home-data")?.textContent || "null");
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- hemicykl: přepínání hlasování -------------------------------------------------------
// Štítek „Další hlasování“ v hlavičce: odpočet počítá prohlížeč (web se kvůli tomu nepřestavuje).
// Po posledním dni hlasování štítek zmizí a vrátí se běžný nadpis (program je starý, nový přijde s další aktualizací).
(function nextVote() {
  const el = document.querySelector(".hm-nx[data-from]");
  if (!el) return;
  const today = todayCZ(), { from, to } = el.dataset;
  const out = el.querySelector(".hm-nx-c");
  if (today > to) {
    el.outerHTML = '<p class="hm-eyebrow"><i aria-hidden="true"></i>10. volební období · od 16. 7. 2024</p>';
    return;
  }
  if (today >= from) {
    el.classList.add("live");
    el.querySelector(".hm-nx-l").textContent = "Právě se hlasuje";
    el.querySelector("strong").textContent = today === to ? "poslední den" : `do ${fmtDate(to).slice(0, -5)}`;
    return;
  }
  const n = Math.round((Date.parse(from) - Date.parse(today)) / 864e5);
  out.textContent = n === 1 ? "· zítra" : `· za ${n} ${n < 5 ? "dny" : "dní"}`;
})();

let vi = 0;
const hemi = document.getElementById("hm-hemi");
const seats = hemi ? [...hemi.querySelectorAll(".hm-seat")] : [];

function renderVote(i) {
  if (!HOME) return;
  vi = i;
  const v = HOME.votes[i];
  seats.forEach((a) => {
    a.dataset.pos = v.pos[a.dataset.id] || "X";
    a.dataset.party = v.party[a.dataset.id] || "";
    a.setAttribute("aria-label", `${HOME.names[a.dataset.id] || ""}, ${a.dataset.party}: ${HOME.pos_txt[a.dataset.pos] || ""}`);
  });
  // Číslo „pro : proti“ je <text> ve stejném SVG jako tečky (hub.py hemi_number), obsah i velikost připravil build.
  const big = document.getElementById("hm-big");
  big.innerHTML = v.num[0];
  big.setAttribute("font-size", v.num[1]);
  document.getElementById("hm-svg").setAttribute("aria-label", v.aria);
  const cap = document.getElementById("hm-cap");
  const leg = document.getElementById("hm-leg");
  const upd = () => {
    cap.innerHTML = v.cap;
    sumToggle();
    leg.innerHTML = v.leg;
    document.getElementById("hm-idx").textContent = `${i + 1} / ${HOME.votes.length}`;
    const more = document.getElementById("hm-more");
    more.href = `v/${v.id}`;
    more.setAttribute("aria-label", `Detail hlasování: ${v.title}`);
    document.getElementById("hm-prev").disabled = i === 0;
    document.getElementById("hm-next").disabled = i === HOME.votes.length - 1;
  };
  if (REDUCED) upd();
  else { cap.classList.add("swap"); leg.classList.add("swap"); setTimeout(() => { upd(); cap.classList.remove("swap"); leg.classList.remove("swap"); }, 170); }
}

// Shrnutí AI má nejvýš 2 řádky; „víc“ ho rozbalí. Když se vejde, tlačítko zmizí (řádek s odkazem na přijatý text
// má pevnou výšku, takže se nic neposune).
function sumToggle() {
  const sum = document.getElementById("hm-sum");
  const btn = document.querySelector("#hm-cap .hm-sum-more");
  if (!sum || !btn) return;
  btn.classList.toggle("idle", sum.scrollHeight <= sum.clientHeight + 1);
  btn.addEventListener("click", () => {
    const open = sum.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "méně" : "víc";
  });
}
sumToggle();
window.addEventListener("resize", () => {
  const sum = document.getElementById("hm-sum");
  if (sum && !sum.classList.contains("open")) document.querySelector("#hm-cap .hm-sum-more")?.classList.toggle("idle", sum.scrollHeight <= sum.clientHeight + 1);
}, { passive: true });

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
  // Roving tabindex: půlkruh je jedna zastávka tabulátoru, mezi sedadly šipky, Home/End na kraj.
  hemi.addEventListener("keydown", (ev) => {
    const cur = seats.indexOf(ev.target.closest(".hm-seat"));
    if (cur < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    const next = ev.key === "Home" ? 0 : ev.key === "End" ? seats.length - 1 : step ? Math.min(seats.length - 1, Math.max(0, cur + step)) : -1;
    if (next < 0) return;
    ev.preventDefault();
    seats.forEach((s, k) => s.setAttribute("tabindex", k === next ? "0" : "-1"));
    seats[next].focus();
  });
  seats.forEach((a) => {
    a.addEventListener("pointerenter", () => show(a));
    a.addEventListener("pointerleave", hide);
    a.addEventListener("focus", () => show(a));
    a.addEventListener("blur", hide);
  });
}

// Sdílení z hera: stejná karta jako na detailu hlasování (data připravená při buildu, share.js).
window.shareContext = (kind) => (kind === "hero" && HOME ? withShareUrl(HOME.votes[vi].share) : null);

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

// --- hledání v heru: stejný našeptávač jako v liště (lib/search.js); klávesu „/“ obsluhuje app.js -----------------
const q = document.getElementById("hub-q");
const list = document.getElementById("hub-results");
if (q && list) combobox(q, list, "hub");
