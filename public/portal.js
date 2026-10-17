// Rozcestník (index.html, generuje scripts/portal.py). Bez skriptu je v oblouku statický stav posledního závěrečného
// hlasování; skript ho oživí: hvězdy loga se rozletí do křesel → barvy frakcí → 5 nejnovějších závěrečných hlasování
// (každé asi 5 s). Tečky 1–5 a pauza (WCAG 2.2.2); s prefers-reduced-motion rovnou statický stav bez přepínání.
import { combobox } from "./lib/search.js";
import { todayCZ } from "./lib/format.js";
import { paintSeats, rovingSeats, seatLabel } from "./lib/hemi.js";

const PD = JSON.parse(document.getElementById("portal-data")?.textContent || "null");
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ICON = {
  pause: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
};
const STEP_MS = 5200;

const svg = document.getElementById("pt-svg");
if (PD && svg) {
  const seats = [...svg.querySelectorAll(".hm-seat")];
  const ctl = document.getElementById("pt-ctl"), pp = document.getElementById("pt-pp");
  const dots = [...ctl.querySelectorAll(".pt-d")];
  const live = document.getElementById("pt-live");
  const num = document.getElementById("pt-num"), numU = document.getElementById("pt-num-u");
  let cur = 0, paused = REDUCED, loop = 0, finishIntro = () => {};
  const timers = [];
  rovingSeats(svg, seats);

  const caption = (c, announce) => {
    document.getElementById("pt-k").textContent = c.k;
    const t = document.getElementById("pt-t");
    t.textContent = c.t;
    t.href = c.href;
    document.getElementById("pt-c").innerHTML = c.c;
    // Automatické přepínání se nehlásí (bylo by to rušivé), jen volba uživatele.
    if (announce) live.textContent = `${c.k}. ${c.t}`;
  };
  const votePhase = (i, announce = false) => {
    cur = i;
    const v = PD.votes[i];
    paintSeats(seats, v, { names: PD.names, posTxt: PD.pos_txt });
    num.innerHTML = `${v.counts.F}<tspan class="hm-num-c" dx="3" dy="-6">:</tspan><tspan dx="3" dy="6">${v.counts.A}</tspan>`;
    numU.textContent = "PRO : PROTI";
    caption(v.cap, announce);
    dots.forEach((d, k) => d.setAttribute("aria-current", String(k === i)));
  };
  const groupPhase = () => {
    seats.forEach((a) => {
      a.dataset.pos = "G";
      seatLabel(a, `${PD.names[a.dataset.id] || ""}, ${a.dataset.party}: frakce ${PD.group_of[a.dataset.id] || ""}`);
    });
    num.textContent = String(seats.length);
    numU.textContent = "POSLANCŮ";
    caption(PD.groups, false);
    dots.forEach((d) => d.setAttribute("aria-current", "false"));
  };
  const auto = () => {
    clearInterval(loop);
    if (!paused) loop = setInterval(() => votePhase((cur + 1) % PD.votes.length), STEP_MS);
  };
  const setPaused = (p) => {
    paused = p;
    pp.innerHTML = p ? ICON.play : ICON.pause;
    pp.setAttribute("aria-label", p ? "Spustit přehrávání hlasování" : "Pozastavit přehrávání hlasování");
    pp.setAttribute("aria-pressed", String(p));
    auto();
  };
  ctl.hidden = false;
  ctl.addEventListener("click", (ev) => {
    const d = ev.target.closest(".pt-d");
    if (d) { finishIntro(); votePhase(Number(d.dataset.i), true); auto(); return; }
    if (ev.target.closest(".pt-pp")) setPaused(!paused);
  });
  // Na skryté kartě prohlížeče nepřepínat (šetří baterii, po návratu pokračuje).
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInterval(loop); else auto(); });

  if (REDUCED) setPaused(true);
  else {
    // Úvod animace: logo uprostřed oblouku, tečky začínají na jeho hvězdách a rozletí se do křesel.
    const [lx, ly, ls] = PD.logo;
    const logo = document.createElementNS("http://www.w3.org/2000/svg", "g");
    logo.setAttribute("class", "pt-logo");
    logo.setAttribute("aria-hidden", "true");
    logo.setAttribute("transform", `translate(${lx} ${ly}) scale(${ls})`);
    logo.innerHTML = '<path d="M-137,0 C-110,-70 20,-70 47,0 C20,70 -110,70 -137,0 Z"/><circle cx="-45" cy="2" r="40"/>';
    svg.prepend(logo);
    seats.forEach((a, i) => {
      const [x, y] = a.parentNode.getAttribute("transform").match(/[-\d.]+/g).map(Number);
      const s = PD.stars[Math.round((i * (PD.stars.length - 1)) / Math.max(1, seats.length - 1))];
      a.style.transition = "none";
      a.style.transform = `translate(${s[0] - x}px, ${s[1] - y}px) scale(.35)`;
      a.dataset.pos = "G";
    });
    svg.classList.add("pt-intro");
    svg.getBoundingClientRect();   // vynutit vykreslení výchozí polohy před přechodem
    const fly = (ms) => {
      seats.forEach((a, i) => { a.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2, .8, .2, 1) ${i * 28}ms` : "none"; a.style.transform = ""; });
      logo.classList.add("gone");
    };
    // Klik na tečku 1–5 během úvodu: úvod se hned dokončí (tečky v křeslech), pak se ukáže zvolené hlasování.
    finishIntro = () => { timers.forEach(clearTimeout); fly(0); svg.classList.remove("pt-intro"); finishIntro = () => {}; };
    timers.push(setTimeout(() => { fly(900); groupPhase(); }, 450));
    timers.push(setTimeout(() => { svg.classList.remove("pt-intro"); finishIntro = () => {}; votePhase(0); auto(); }, 2600));
    setPaused(false);
    clearInterval(loop);   // přepínání začne až po úvodu
  }
}

// Štítek „zasedání za N dní“ v dlaždici Aktuálně: počítá prohlížeč (web se kvůli tomu nepřestavuje).
document.querySelectorAll(".pt-badge[data-from]").forEach((el) => {
  const n = Math.round((Date.parse(el.dataset.from) - Date.parse(todayCZ())) / 864e5);
  if (n < 0) return;
  el.textContent = n === 0 ? "zasedání dnes" : n === 1 ? "zasedání zítra" : `zasedání za ${n} ${n < 5 ? "dny" : "dní"}`;
  el.hidden = false;
});

// Hledání v heru: stejný našeptávač jako v liště (lib/search.js); klávesu „/“ obsluhuje app.js.
const q = document.getElementById("hub-q");
const list = document.getElementById("hub-results");
if (q && list) combobox(q, list, "hub");
