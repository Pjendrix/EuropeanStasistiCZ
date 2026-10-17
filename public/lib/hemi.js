// Oblouk českých poslanců (tečky z hub.py seats_svg): přebarvení podle hlasování a pohyb mezi tečkami šipkami.
// Sdílí ho karta „Poslední hlasování“ na Aktuálně (hub.js) a rozcestník (portal.js).

// Přebarví tečky podle hlasování v = { pos: {id: "F"|"A"|"B"|"N"} } a doplní popisek (aria-label, případně <title>).
// names a posTxt jsou z dat stránky; party = {id: strana} (jinak zůstane data-party z HTML).
export function paintSeats(seats, v, { names, posTxt, party }) {
  seats.forEach((a) => {
    const id = a.dataset.id, pos = v.pos[id] || "X";
    a.dataset.pos = pos;
    if (party) a.dataset.party = party[id] || "";
    seatLabel(a, `${names[id] || ""}, ${a.dataset.party}: ${posTxt[pos] || ""}`);
  });
}

export function seatLabel(a, text) {
  a.setAttribute("aria-label", text);
  const t = a.querySelector("title");
  if (t) t.textContent = text;
}

// Roving tabindex: oblouk je jedna zastávka tabulátoru, mezi tečkami šipky, Home/End na kraj.
export function rovingSeats(container, seats) {
  container.addEventListener("keydown", (ev) => {
    const cur = seats.indexOf(ev.target.closest(".hm-seat"));
    if (cur < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    const next = ev.key === "Home" ? 0 : ev.key === "End" ? seats.length - 1 : step ? Math.min(seats.length - 1, Math.max(0, cur + step)) : -1;
    if (next < 0) return;
    ev.preventDefault();
    seats.forEach((s, k) => s.setAttribute("tabindex", k === next ? "0" : "-1"));
    seats[next].focus();
  });
}
