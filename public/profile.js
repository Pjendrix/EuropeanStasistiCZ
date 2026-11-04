// Profil poslance (p/{id}.html). Obsah vykresluje build (scripts/profile_page.py, audit A1); tady jsou jen interakce:
// hodnota měsíce pod grafem, přepínač „jen závěrečná hlasování“ a sbalení dlouhých tabulek.
// Panel sdílení čte kontext z <script id="share-context"> (share.js).
import { collapseTables, setNav } from "./lib/ui.js";

setNav("meps");
const main = document.getElementById("main");

// Graf účasti po měsících: klepnutí, najetí nebo fokus na sloupec ukáže jeho hodnotu (text připravil build
// v <template id="md-RRRR-MM">; klonuje se, žádné HTML z atributu).
const detail = main.querySelector(".chart-detail");
const cols = [...main.querySelectorAll(".chart .col")];
const show = (btn) => {
  cols.forEach((c) => c.classList.toggle("active", c === btn));
  const tpl = document.getElementById(`md-${btn.dataset.month}`);
  if (tpl) detail.replaceChildren(tpl.content.cloneNode(true));
};
if (detail) cols.forEach((c) => ["click", "mouseenter", "focus"].forEach((ev) => c.addEventListener(ev, () => show(c))));
// Na mobilu se graf posouvá do stran (sloupce aspoň 24 px kvůli dotyku); začít u posledního měsíce.
const scroller = main.querySelector(".chart-scroll");
if (scroller && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = scroller.scrollWidth;

// Kde hlasoval(a) jinak než frakce: obě tabulky jsou v HTML, přepínač ukáže jednu.
const onlyMain = document.getElementById("against-main");
onlyMain?.addEventListener("change", () => {
  main.querySelectorAll(".against-list").forEach((el) => { el.hidden = (el.dataset.main === "1") !== onlyMain.checked; });
});

collapseTables(main);
