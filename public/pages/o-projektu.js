// Skript stránky o-projektu.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { getJSON } from "../lib/data.js";
import { fmtDate } from "../lib/format.js";
import { setNav, showError } from "../lib/ui.js";
setNav("about");
(async () => {
  const el = document.getElementById("release");
  try {
    const stats = await getJSON("overview.json");
    // Definice metrik jsou v HTML statické (scripts/build_pages.py: sync_definitions); tady jen aktuální data.
    const rel = stats.sources.votes?.release;
    document.getElementById("release").textContent =
      `Aktuální data: export HowTheyVote ${rel || ""}, hlasování ${fmtDate(stats.period.from)} – ${fmtDate(stats.period.to)}.`;
  } catch (e) {
    showError(el, e);
  }
})();
