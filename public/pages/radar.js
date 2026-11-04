// Skript stránky radar.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { listFilters, setNav } from "../lib/ui.js";
setNav("votes");
setNav("votes-radar");
listFilters({ limit: 10 });

// Celý průběh procedury je v <template> (méně uzlů DOM, O8); vloží se při prvním rozbalení.
document.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (!d.classList?.contains("rd-tl") || !d.open) return;
  const t = d.querySelector(":scope > template");
  if (!t) return;
  t.replaceWith(t.content.cloneNode(true));
  // vložené karty projdou stejnými filtry jako ostatní
  if (d.classList.contains("rd-done")) document.getElementById("rd-cat")?.dispatchEvent(new Event("change"));
}, true);
