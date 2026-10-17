// Skript stránky radar.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { setNav } from "../lib/ui.js";
setNav("votes");
setNav("votes-radar");
// Filtry radaru: skrývají položky podle data-cat / data-leg / data-cz (obsah stránky je vygenerovaný, funguje i bez JS).
(() => {
  const cat = document.getElementById("rd-cat"), leg = document.getElementById("rd-leg"), cz = document.getElementById("rd-cz");
  if (!cat) return;
  const params = new URLSearchParams(location.search);
  if (params.get("c")) cat.value = params.get("c");
  leg.checked = params.get("zakony") === "1";
  cz.checked = params.get("stopa") === "1";
  const apply = () => {
    document.querySelectorAll(".rd-list, .rd-procs").forEach((list) => {
      let shown = 0;
      list.querySelectorAll(":scope > li").forEach((li) => {
        const ok = (!cat.value || li.dataset.cat === cat.value) && (!leg.checked || li.dataset.leg === "1") && (!cz.checked || li.dataset.cz === "1");
        li.hidden = !ok;
        shown += ok;
      });
      const empty = list.parentElement.querySelector(".rd-empty");
      if (empty) empty.hidden = shown > 0;
    });
    const qs = new URLSearchParams();
    if (cat.value) qs.set("c", cat.value);
    if (leg.checked) qs.set("zakony", "1");
    if (cz.checked) qs.set("stopa", "1");
    history.replaceState(null, "", qs.toString() ? `?${qs}` : location.pathname);
  };
  [cat, leg, cz].forEach((el) => el.addEventListener("change", apply));
  apply();
})();
