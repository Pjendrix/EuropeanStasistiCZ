// Stránka Novinky (aktualne.html, generuje scripts/news_page.py). Statický obsah funguje i bez tohoto skriptu (vidět je vše);
// skript přidá filtr typu (Vše / Hlasování / Zprávy / Změny frakcí) nad bloky s data-type a uloží ho do adresy (?typ=…).
import { setNav } from "./lib/ui.js";

setNav("now");

const filter = document.querySelector(".nv-filter");
const blocks = [...document.querySelectorAll("#nv-timeline [data-type]")];
const empty = document.querySelector(".nv-empty");
if (filter) {
  const buttons = [...filter.querySelectorAll("button[data-typ]")];
  const apply = (typ, push) => {
    if (!buttons.some((b) => b.dataset.typ === typ)) typ = "";
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.typ === typ)));
    let shown = 0;
    blocks.forEach((el) => { el.hidden = Boolean(typ) && el.dataset.type !== typ; shown += !el.hidden; });
    if (empty) empty.hidden = shown > 0;
    if (push) {
      const qs = new URLSearchParams(location.search);
      if (typ) qs.set("typ", typ); else qs.delete("typ");
      history.replaceState(null, "", `${location.pathname}${qs.toString() ? `?${qs}` : ""}${location.hash}`);
    }
  };
  filter.hidden = false;
  filter.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-typ]");
    if (b) apply(b.dataset.typ, true);
  });
  apply(new URLSearchParams(location.search).get("typ") || "", false);
}

// Odkaz na kotvu sbaleného zasedání (#zasedani-RRRR-MM-DD) ho rovnou rozbalí.
const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
target?.querySelector("details")?.setAttribute("open", "");
