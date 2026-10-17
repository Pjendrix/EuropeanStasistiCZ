// Skript stránky mep.html (dřív vložený v HTML; kvůli CSP je v samostatném souboru).
// Stará adresa profilu: přesměrovat na p/{id} (na Vercelu to dělá už vercel.json).
(function () {
  var id = new URLSearchParams(location.search).get("id");
  if (/^\d+$/.test(id || "")) location.replace("p/" + id + location.hash);
  else document.getElementById("main").innerHTML = '<p>Poslanec nenalezen. <a href="poslanci">Zpět na přehled</a>.</p>';
})();
