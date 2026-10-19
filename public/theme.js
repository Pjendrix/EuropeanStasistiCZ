// Režim (světlý/tmavý) a příznak JS nastavit ještě před vykreslením, ať stránka neproblikne.
// Výchozí je vždy světlý, nastavení systému se neřídí; tmavý jen po přepnutí (uložená volba).
// Klasický skript v <head> (ne modul): musí běžet hned, ne až po načtení stránky. Bez vložených skriptů kvůli CSP.
(function () {
  var d = document.documentElement; d.classList.add("js");
  try { var t = localStorage.getItem("theme"); if (t === "dark" || t === "light") d.dataset.theme = t; } catch {}
})();
