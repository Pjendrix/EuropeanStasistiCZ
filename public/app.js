// Vstup pro všechny stránky EP Watch CZ: navigace, ⓘ, kopírování, motiv, animace. Funkce jsou v lib/*.js.
// Vstupní moduly (app.js, share.js, skripty stránek) se navzájem neimportují, jen lib/*.js: HTML je načítá s ?v=…,
// import bez ?v= by modul spustil podruhé (hlídá tests/test_js_modules.py).
import { ROOT, citeText, copyText } from "./lib/data.js";
import { combobox } from "./lib/search.js";
import { HAS_POPOVER, REDUCED_MOTION, fillCountdowns, infoPopFor, motion, placeInfo, setupThemeToggle, staleNotice, toast } from "./lib/ui.js";

// Přepínač „Podle stran | Podle hlasu“ (detail hlasování, statický i interaktivní).
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-cz-view]");
  if (!btn) return;
  const box = btn.closest(".cz-views");
  box.dataset.view = btn.dataset.czView;
  box.querySelectorAll("[data-cz-view]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
});

// V panelu „Více“ zvýraznit aktuální stránku.
document.querySelectorAll("#more-sheet a").forEach((a) => {
  const u = new URL(a.href, location.href);
  if (u.pathname === location.pathname && (!u.search || u.search === location.search) && !u.hash) a.setAttribute("aria-current", "page");
});

// Panel „Více“ bez Popover API: přepínání třídou, zavření klikem mimo nebo Esc.
document.addEventListener("click", (ev) => {
  if (typeof HAS_POPOVER !== "undefined" && HAS_POPOVER) return;
  const sheet = document.getElementById("more-sheet");
  if (!sheet) return;
  if (ev.target.closest(".tab-more")) { sheet.classList.toggle("open"); return; }
  if (!ev.target.closest("#more-sheet")) sheet.classList.remove("open");
});

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-copy-prompt]");
  if (!el) return;
  const ok = await copyText(el.dataset.copyPrompt);
  toast(ok ? "Dotaz je ve schránce, vložte ho do chatu (Ctrl+V)." : "Schránka není dostupná. Dotaz zkopírujte z rámečku pod tlačítky.", { bad: !ok, ms: 4000 });
  if (ok && el.tagName === "BUTTON") {
    const old = el.textContent;
    el.textContent = "Zkopírováno";
    setTimeout(() => { el.textContent = old; }, 1500);
  }
});

document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-cite]");
  if (!btn) return;
  const text = await citeText(btn.dataset.cite);
  const label = btn.querySelector("span");
  if (await copyText(text)) {
    btn.classList.add("done");
    if (label) label.textContent = "Zkopírováno";
    toast("Citace je ve schránce.");
  } else {
    toast(`Schránka není dostupná. Citace: ${text}`, { bad: true, ms: 8000 });
  }
  setTimeout(() => { btn.classList.remove("done"); if (label) label.textContent = "Citovat"; }, 2000);
});

// Stránky s <base href="../"> (p/{id}.html): odkaz „#kotva“ by vedl na úvodní stránku, proto se kotvy řeší tady.
document.addEventListener("click", (ev) => {
  const a = ev.target.closest('a[href^="#"]');
  if (!a || !document.querySelector("base")) return;
  const target = document.getElementById(a.getAttribute("href").slice(1));
  if (!target) return;
  ev.preventDefault();
  history.replaceState(null, "", location.pathname + location.search + a.getAttribute("href"));
  target.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth" });
  if (a.classList.contains("skip-link")) { target.setAttribute("tabindex", "-1"); target.focus(); }
});

if (!HAS_POPOVER) document.documentElement.classList.add("no-popover");

document.addEventListener("beforetoggle", (ev) => {
  if (!ev.target.classList?.contains("info-pop")) return;
  const btn = document.querySelector(`[popovertarget="${ev.target.id}"]`);
  if (ev.newState === "open" && btn) { btn.setAttribute("aria-expanded", "true"); requestAnimationFrame(() => placeInfo(ev.target, btn)); }
  else btn?.setAttribute("aria-expanded", "false");
}, true);

document.addEventListener("click", (ev) => {
  if (HAS_POPOVER) return;
  const btn = ev.target.closest(".info-btn, .tc-more");
  document.querySelectorAll(".info-pop.open").forEach((p) => { if (!btn || p !== infoPopFor(btn)) { p.classList.remove("open"); document.querySelector(`[popovertarget="${p.id}"]`)?.setAttribute("aria-expanded", "false"); } });
  if (btn) {
    const p = infoPopFor(btn);
    const open = p.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
    if (open) placeInfo(p, btn);
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || HAS_POPOVER) return;
  const p = document.querySelector(".info-pop.open");
  if (p) { p.classList.remove("open"); const b = document.querySelector(`[popovertarget="${p.id}"]`); b?.setAttribute("aria-expanded", "false"); b?.focus(); }
});

document.addEventListener("DOMContentLoaded", () => {
  fillCountdowns();
  staleNotice();
  setupThemeToggle();
  motion.scan(document);
  // Jeden sken na snímek místo skenu pro každý přidaný uzel (audit A5; scan je díky WeakSet idempotentní).
  let scanQueued = false;
  new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; motion.scan(document.getElementById("main") || document.body); });
  }).observe(document.body, { childList: true, subtree: true });
});

// Stav načítání čtečky oznámí jednou a sám zmizí, až se obsah nahradí.
document.querySelectorAll(".loading").forEach((el) => el.setAttribute("role", "status"));

// --- hledání v liště (B2): dialog s našeptávačem, otevře ho tlačítko s lupou, klávesa „/“ nebo Ctrl/⌘+K ----------------
// Na úvodu, dokud je vidět pole v heru, je tlačítko skryté a „/“ zaměří pole v heru.
const searchBtn = document.querySelector(".search-btn");
const heroQ = document.getElementById("hub-q");
let heroVisible = false;
if (heroQ && searchBtn && "IntersectionObserver" in window) {
  new IntersectionObserver(([e]) => {
    heroVisible = e.isIntersecting;
    searchBtn.classList.toggle("by-hero", heroVisible);
  }).observe(heroQ.closest("form") || heroQ);
}
let searchDlg = null;
function openSearch() {
  if (!searchDlg) {
    searchDlg = document.createElement("dialog");
    searchDlg.className = "search-dlg";
    searchDlg.setAttribute("aria-label", "Hledání");
    searchDlg.innerHTML = `<form class="hm-search" role="search" action="${ROOT}poslanci.html" method="get">
      <label for="site-q">${searchBtn ? searchBtn.querySelector("svg").outerHTML : ""}<span class="sr-only">Najdi poslance, stranu nebo hlasování</span>
        <input id="site-q" name="q" type="search" autocomplete="off" placeholder="Najdi poslance, stranu nebo hlasování…" role="combobox" aria-expanded="false" aria-controls="site-results" aria-autocomplete="list" aria-haspopup="listbox"></label>
      <ul id="site-results" class="hm-results" role="listbox" aria-label="Výsledky hledání" hidden></ul>
      <p class="search-hint" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> výběr · <kbd>Enter</kbd> otevřít · <kbd>Esc</kbd> zavřít</p></form>`;
    document.body.append(searchDlg);
    const input = searchDlg.querySelector("#site-q");
    combobox(input, searchDlg.querySelector("#site-results"), "site");
    // klik mimo panel (na ztmavené pozadí) dialog zavře
    searchDlg.addEventListener("click", (ev) => { if (ev.target === searchDlg) searchDlg.close(); });
    searchDlg.addEventListener("close", () => { (searchDlg.opener || searchBtn)?.focus(); });
  }
  // po zavření fokus zpět na prvek, odkud se hledalo (při „/“ odjinud na tlačítko s lupou)
  const from = document.activeElement;
  searchDlg.opener = from && from !== document.body ? from : searchBtn;
  searchDlg.showModal();
  searchDlg.querySelector("#site-q").focus();
}
searchBtn?.addEventListener("click", (ev) => { ev.preventDefault(); openSearch(); });
document.addEventListener("keydown", (ev) => {
  const inField = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
  const slash = ev.key === "/" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !inField;
  const cmdK = (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k";
  if (!slash && !cmdK) return;
  if (searchDlg?.open) return;
  ev.preventDefault();
  if (heroQ && heroVisible) heroQ.focus();
  else openSearch();
});
