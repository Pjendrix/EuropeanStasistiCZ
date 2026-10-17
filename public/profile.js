// Profil poslance (p/{id}.html). Obsah vykresluje build (scripts/profile_page.py, audit A1); tady jsou jen interakce:
// hodnota měsíce pod grafem, přepínač „jen závěrečná hlasování“ a sbalení dlouhých tabulek.
// Panel sdílení čte kontext z <script id="share-context"> (share.js).
import { collapseTables, setNav } from "./lib/ui.js";

setNav("meps");
const main = document.getElementById("main");

// Graf účasti po měsících: klepnutí, najetí nebo fokus na sloupec ukáže jeho hodnotu (text připravil build v data-detail).
const detail = main.querySelector(".chart-detail");
const cols = [...main.querySelectorAll(".chart .col")];
const show = (btn) => {
  cols.forEach((c) => c.classList.toggle("active", c === btn));
  detail.innerHTML = btn.dataset.detail;
};
if (detail) cols.forEach((c) => ["click", "mouseenter", "focus"].forEach((ev) => c.addEventListener(ev, () => show(c))));

// Kde hlasoval(a) jinak než frakce: obě tabulky jsou v HTML, přepínač ukáže jednu.
const onlyMain = document.getElementById("against-main");
onlyMain?.addEventListener("change", () => {
  main.querySelectorAll(".against-list").forEach((el) => { el.hidden = (el.dataset.main === "1") !== onlyMain.checked; });
});

collapseTables(main);
