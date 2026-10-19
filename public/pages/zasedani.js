// Skript stránky zasedani.html (session_page.py): filtry programu a čipy témat nahoře (klik = filtr tématu, znovu = zrušit);
// odpočet zasedání doplní app.js (fillCountdowns).
import { listFilters, setNav } from "../lib/ui.js";
setNav("votes");
setNav("votes-session");
listFilters();
const sel = document.getElementById("rd-cat");
const chips = [...document.querySelectorAll(".zs-topic")];
const mark = () => chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.cat === sel?.value)));
if (sel) {
  // s JS je čip přepínač filtru (tlačítko se stavem), bez JS obyčejný odkaz ?c=…
  chips.forEach((c) => c.setAttribute("role", "button"));
  chips.forEach((c) => c.addEventListener("click", (ev) => {
    ev.preventDefault();
    sel.value = sel.value === c.dataset.cat ? "" : c.dataset.cat;
    sel.dispatchEvent(new Event("change"));
    document.getElementById("program")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }));
  sel.addEventListener("change", mark);
  mark();
}
