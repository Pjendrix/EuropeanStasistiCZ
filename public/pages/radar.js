// Skript stránky radar.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
import { listFilters, setNav } from "../lib/ui.js";
setNav("votes");
setNav("votes-radar");
listFilters();
