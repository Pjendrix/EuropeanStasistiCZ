// Úvodní stránka (index.html, generuje scripts/hub.py): jen vyhledávání a přepínač období klíčových hlasování.
// Obsah stránky je statický, bez tohoto skriptu zůstane vše čitelné a odkazy fungují.
"use strict";

setNav("");

// --- přepínač období -------------------------------------------------------------------
document.querySelectorAll('input[name="kv-period"]').forEach((r) => {
  r.addEventListener("change", () => {
    document.querySelectorAll(".kv-period").forEach((el) => { el.hidden = el.dataset.period !== r.value; });
  });
});

// --- vyhledávání poslanců, stran a hlasování ---------------------------------------------
const q = document.getElementById("hub-q");
const list = document.getElementById("hub-results");
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let index = null; // { meps, parties, votes } načte se při prvním použití

async function loadIndex() {
  if (index) return index;
  const [ov, parties, votes] = await Promise.all([getJSON("overview.json"), getJSON("parties/index.json"), loadSearch()]);
  index = {
    meps: ov.meps.map((m) => ({ href: mepUrl(m.id), label: displayName(m), sub: [m.group?.short_label, m.party?.short_label].filter(Boolean).join(" · "), key: norm(`${displayName(m)} ${m.name}`) })),
    parties: parties.parties.map((p) => ({ href: partyUrl(p.id), label: p.name || p.short_label, sub: p.short_label, key: norm(`${p.name || ""} ${p.short_label}`) })),
    // nejnovější nahoře, závěrečná hlasování první
    votes: votes.slice().reverse().sort((a, b) => Number(isFinal(b)) - Number(isFinal(a)))
      .map((v) => ({ href: isFinal(v) ? `v/${v.id}.html` : `vote.html?id=${v.id}&m=${v.month}`, label: voteTitle(v), sub: `${fmtDate(v.date)}${v.vote_kind ? ` · ${KIND_LABEL[v.vote_kind] || ""}` : ""}`,
        key: norm(`${voteTitle(v)} ${v.reference || ""} ${v.description_cs || ""}`) })),
  };
  return index;
}

let active = -1;
function show(items) {
  list.innerHTML = items.map((it, i) => `<li role="option" id="hub-opt-${i}" aria-selected="false"><a href="${esc(it.href)}"><span class="hub-kind">${esc(it.kind)}</span>
    <span class="hub-label">${esc(it.label)}</span><span class="small muted">${esc(it.sub || "")}</span></a></li>`).join("") ||
    '<li class="muted hub-none" role="option" aria-selected="false">Nic nenalezeno.</li>';
  list.hidden = false;
  q.setAttribute("aria-expanded", "true");
  active = -1;
}

async function search() {
  const needle = norm(q.value.trim());
  if (needle.length < 2) { list.hidden = true; q.setAttribute("aria-expanded", "false"); return; }
  const idx = await loadIndex();
  const hit = (arr, n, kind) => arr.filter((x) => x.key.includes(needle)).slice(0, n).map((x) => ({ ...x, kind }));
  show([...hit(idx.meps, 5, "Poslanec"), ...hit(idx.parties, 3, "Strana"), ...hit(idx.votes, 6, "Hlasování")]);
}

function move(delta) {
  const opts = [...list.querySelectorAll('li[role="option"] a')];
  if (!opts.length) return;
  active = (active + delta + opts.length) % opts.length;
  opts.forEach((a, i) => { a.parentElement.setAttribute("aria-selected", String(i === active)); a.classList.toggle("on", i === active); });
  q.setAttribute("aria-activedescendant", `hub-opt-${active}`);
  opts[active].scrollIntoView({ block: "nearest" });
}

q.addEventListener("input", search);
q.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); }
  else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
  else if (ev.key === "Enter") {
    const a = list.querySelector("a.on") || (active < 0 ? list.querySelector("a") : null);
    if (a) { ev.preventDefault(); location.href = a.getAttribute("href"); }
  } else if (ev.key === "Escape") { list.hidden = true; q.setAttribute("aria-expanded", "false"); }
});
document.addEventListener("click", (ev) => { if (!ev.target.closest(".hub-search")) { list.hidden = true; q.setAttribute("aria-expanded", "false"); } });
