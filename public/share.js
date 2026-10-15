// Sdílení (X12): tlačítko „Sdílet“ u detailu hlasování a profilu poslance. Obrázek se kreslí v prohlížeči (canvas → PNG),
// takže repo nenarůstá: příspěvek 1080 × 1350 (4 : 5) a story 1080 × 1920. Náhledy odkazů 1200 × 630 vznikají předem
// (scripts/build_cards.py) a mají stejný obsah a barvy.
//
// Pravidla karty: každá karta má datum, zdroj a adresu; u poslance vždy medián EP; žádné pořadí, žádné hodnocení barvou,
// žádná loga stran ani frakcí (jen zkratka a tečka); portrét s popiskem „© European Union – Source: EP“.
// Stránka nastaví window.shareContext = () => ({ kind: "vote" | "mep", url, text, filename, data }).
"use strict";

const SHARE_FORMATS = { post: { w: 1080, h: 1350, label: "příspěvek (4 : 5)" }, story: { w: 1080, h: 1920, label: "story (9 : 16)" } };
const SC = { navy: "#0F172A", navy2: "#0A1226", white: "#F8FAFC", muted: "#94A3B8", soft: "#CBD5E1", gold: "#F59E0B",
  for: "#60A5FA", against: "#FB923C", abst: "#94A3B8", absent: "#475569", track: "#334155" };
const SC_POS = { FOR: SC.for, AGAINST: SC.against, ABSTENTION: SC.abst, DID_NOT_VOTE: SC.absent };
const SC_FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

let _measureCtx = null;
function measureText(text, size, weight) {
  _measureCtx = _measureCtx || document.createElement("canvas").getContext("2d");
  _measureCtx.font = `${weight} ${size}px ${SC_FONT}`;
  return _measureCtx.measureText(text).width;
}

function fitText(text, size, weight, maxW) {
  if (measureText(text, size, weight) <= maxW) return text;
  let s = text;
  while (s && measureText(`${s}…`, size, weight) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function wrapText(text, size, weight, maxW, maxLines) {
  const lines = [];
  let cur = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const trial = cur ? `${cur} ${word}` : word;
    if (measureText(trial, size, weight) <= maxW || !cur) cur = trial;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  const cut = lines.slice(0, maxLines);
  if (lines.length > maxLines) cut[maxLines - 1] = fitText(`${cut[maxLines - 1]} …`, size, weight, maxW);
  return cut.map((l) => fitText(l, size, weight, maxW));
}

// Karta se skládá z jednoduchých kreslicích příkazů (text, obdélník, kruh, čára, obrázek) a kreslí se přímo na canvas
// písmem stránky (document.fonts), takže se text vždy vykreslí správně. Souřadnice y se posouvá o „dy“ (vystředění obsahu).
const T = (x, y, s, size, weight, fill, anchor = "left") => ({ k: "text", x, y, s, size, weight, fill, anchor });
const RECT = (x, y, w, h, r, fill, stroke, sw) => ({ k: "rect", x, y, w, h, r, fill, stroke, sw });
const CIRC = (x, y, r, fill, stroke, sw) => ({ k: "circ", x, y, r, fill, stroke, sw });
const LINE = (x1, y1, x2, y2, stroke, sw) => ({ k: "line", x1, y1, x2, y2, stroke, sw });
const shift = (ops, dy) => ops.map((o) => ({ ...o, ...("y" in o ? { y: o.y + dy } : {}), ...("y1" in o ? { y1: o.y1 + dy, y2: o.y2 + dy } : {}) }));

let _symbolImg = null; // symbol loga (assets/brand/symbol-white.svg), načte se před kreslením

function shareHeader(right) {
  const x = 72 + 102 + 18;
  return [...(_symbolImg ? [{ k: "image", img: _symbolImg, x: 72, y: 66, w: 102, h: 78, r: 0 }] : []),
    T(x, 118, "EP", 38, 800, SC.white), T(x + measureText("EP", 38, 800), 118, " Watch ", 38, 400, SC.white),
    T(x + measureText("EP", 38, 800) + measureText(" Watch ", 38, 400), 118, "CZ", 38, 800, SC.white), T(1008, 112, right, 26, 500, SC.soft, "right")];
}

function shareFooter(H, left, url) {
  return [LINE(72, H - 128, 1008, H - 128, "#334155", 2), T(72, H - 88, fitText(left, 22, 500, 936), 22, 500, SC.muted),
    ...(url ? [T(72, H - 52, fitText(url, 24, 700, 936), 24, 700, SC.soft)] : [])];
}

function barOps(x, y, w, h, counts) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let cx = x;
  const out = [];
  ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"].forEach((pos, i) => {
    const seg = Math.round((w * counts[i]) / total);
    if (counts[i] && seg) out.push(RECT(cx, y, Math.max(seg - 3, 2), h, 4, SC_POS[pos]));
    cx += seg;
  });
  return out;
}

// Karta hlasování: obsah ve svislém toku, vystředěný mezi hlavičkou a patičkou.
function voteCardOps(d, f) {
  const H = f.h;
  const ops = [];
  let y = 0;
  const title = wrapText(d.title, 58, 700, 936, 4);
  title.forEach((l, i) => ops.push(T(72, y + 58 + i * 72, l, 58, 700, SC.white)));
  y += title.length * 72 + 24;
  if (d.subtitle) {
    const sub = wrapText(d.subtitle, 28, 500, 936, 2);
    sub.forEach((l, i) => ops.push(T(72, y + 28 + i * 38, l, 28, 500, SC.soft)));
    y += sub.length * 38 + 20;
  }
  y += 28;
  const ok = d.result === "ADOPTED";
  const pill = (d.resultLabel || "").toUpperCase();
  const pw = measureText(pill, 26, 800) + 44;
  ops.push(RECT(72, y, pw, 52, 26, ok ? SC.white : "#334155"), T(72 + pw / 2, y + 36, pill, 26, 800, ok ? SC.navy : SC.white, "center"));
  const sent = wrapText(d.sentence, 30, 600, 936 - pw - 20, 2);
  sent.forEach((l, i) => ops.push(T(72 + pw + 20, y + 36 + i * 38, l, 30, 600, SC.white)));
  y += Math.max(52, sent.length * 38) + 36;
  ops.push(T(72, y + 24, `Celý EP: ${fmtNum(d.ep[0])} pro · ${fmtNum(d.ep[1])} proti · ${fmtNum(d.ep[2])} zdržel se`, 28, 500, SC.soft), ...barOps(72, y + 48, 936, 16, d.ep));
  y += 112;
  // Češi: tečky podle frakcí, barva = hlas
  const KEYS4 = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];
  const czTotal = KEYS4.map((k) => d.groups.reduce((n, g) => n + g.positions.filter((p) => p === k).length, 0));
  ops.push(T(72, y + 22, "JAK HLASOVALI ČEŠI", 22, 800, SC.gold),
    T(72, y + 62, fitText(czCountsText(czTotal) || "žádný poslanec v mandátu", 32, 600, 936), 32, 600, SC.white));
  y += 100;
  const r = 20;
  let x = 72;
  d.groups.forEach((g) => {
    g.positions.forEach((p) => {
      if (x + 2 * r > 1008) { x = 72; y += 2 * r + 12; }
      ops.push(p === "DID_NOT_VOTE" ? CIRC(x + r, y + r, r - 2, null, SC.absent, 4) : CIRC(x + r, y + r, r, SC_POS[p]));
      x += 2 * r + 8;
    });
    x += 18;
  });
  y += 2 * r + 28;
  const lines = d.groups.map((g) => `${g.label} ${KEYS4.map((k) => [g.positions.filter((p) => p === k).length, POSITION_LABEL[k].replace("/a", "")])
    .filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(", ")}`);
  const summary = wrapText(lines.join("  ·  "), 24, 500, 936, f.h > 1500 ? 4 : 3);
  summary.forEach((l, i) => ops.push(T(72, y + 24 + i * 34, l, 24, 500, SC.soft)));
  y += summary.length * 34 + 8;
  const top = 172, bottom = H - 150;
  return [...shareHeader(`${fmtDate(d.date)} · ${d.kindLabel}`), ...shift(ops, Math.round(top + Math.max((bottom - top - y) / 2, 0))),
    ...shareFooter(H, "Zdroj: HowTheyVote.eu (ODbL), EP Open Data · výpočet EP Watch CZ", d.urlShort)];
}

// Karta poslance: portrét, účast na hlasování a hlasuje s frakcí s mediánem, práce na textech. Bez pořadí a hodnocení.
function mepCardOps(d, f) {
  const H = f.h;
  const ops = [];
  let y = 0;
  const pw = 300, ph = 375;
  if (d.photo) {
    ops.push({ k: "image", img: d.photo, x: 72, y, w: pw, h: ph, r: 26 }, RECT(70, y - 2, pw + 4, ph + 4, 28, null, SC.gold, 4),
      T(72, y + ph + 34, "© European Union – Source: EP", 20, 500, SC.muted));
  }
  const nx = d.photo ? 72 + pw + 44 : 72;
  const nameLines = wrapText(d.name, 56, 800, 1008 - nx, 3);
  nameLines.forEach((l, i) => ops.push(T(nx, y + 62 + i * 64, l, 56, 800, SC.white)));
  const sub = wrapText(d.subtitle, 28, 600, 1008 - nx, 3);
  sub.forEach((l, i) => ops.push(T(nx, y + 62 + nameLines.length * 64 + 8 + i * 38, l, 28, 600, SC.soft)));
  y += Math.max(ph + 70, 62 + nameLines.length * 64 + sub.length * 38 + 30) + 30;
  const metric = (label, pair, median, medLabel) => {
    const share = pair && pair[1] ? pair[0] / pair[1] : null;
    const bx = 72, bw = 936, lo = 0.6;
    const pos = (v) => bx + bw * Math.min(Math.max((v - lo) / (1 - lo), 0), 1);
    ops.push(T(72, y + 30, label, 30, 600, SC.soft), T(72, y + 100, share === null ? "–" : fmtPct(share), 72, 800, SC.white),
      RECT(bx, y + 126, bw, 10, 5, SC.track));
    if (share !== null) ops.push(CIRC(pos(share), y + 131, 14, SC.white));
    if (median != null) ops.push(LINE(pos(median), y + 112, pos(median), y + 150, SC.gold, 6), T(bx, y + 186, `${medLabel} ${fmtPct(median)}`, 24, 700, SC.gold));
    if (pair && pair[1]) ops.push(T(bx + bw, y + 186, `${fmtNum(pair[0])} z ${fmtNum(pair[1])} hlasování`, 24, 500, SC.muted, "right"));
    y += 220;
  };
  metric("Účast na hlasování", d.attendance, d.attendanceMedian, "medián EP");
  metric("Hlasuje s frakcí", d.loyalty && d.loyalty[1] ? d.loyalty : null, d.loyaltyMedian, "medián frakce");
  if (d.work) {
    const wl = wrapText(d.work, 30, 600, 936, 2);
    wl.forEach((l, i) => ops.push(T(72, y + 32 + i * 40, l, 30, 600, SC.white)));
    y += wl.length * 40 + 24;
  }
  ops.push(T(72, y + 28, "Bez pořadí a hodnocení: čísla spočítal skript z oficiálních dat.", 24, 500, SC.soft));
  y += 50;
  const top = 172, bottom = H - 150;
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...shift(ops, Math.round(top + Math.max((bottom - top - y) / 2, 0))),
    ...shareFooter(H, "Zdroj: HowTheyVote.eu (ODbL), EP Open Data · výpočet EP Watch CZ", d.urlShort)];
}

// --- kreslení na canvas → PNG ---------------------------------------------------------

function roundRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r || 0, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function loadImage(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

async function photoDataUrl(url) {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  } catch (e) { return null; }
}

async function renderCardPng(ctx, formatKey) {
  const f = SHARE_FORMATS[formatKey];
  await Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(`${w} 20px ${SC_FONT}`, "Příliš žluťoučký kůň")));
  const data = { ...ctx.data };
  _symbolImg = await loadImage("assets/brand/symbol-white.svg");
  if (ctx.kind === "mep") data.photo = await loadImage(await photoDataUrl(ctx.data.photoUrl));
  const ops = ctx.kind === "vote" ? voteCardOps(data, f) : mepCardOps(data, f);
  const canvas = document.createElement("canvas");
  canvas.width = f.w;
  canvas.height = f.h;
  const c = canvas.getContext("2d");
  const g = c.createLinearGradient(0, 0, 0, f.h);
  g.addColorStop(0, SC.navy);
  g.addColorStop(1, SC.navy2);
  c.fillStyle = g;
  c.fillRect(0, 0, f.w, f.h);
  c.fillStyle = SC.gold;
  c.fillRect(0, 0, 12, f.h);
  for (const o of ops) {
    if (o.k === "text") {
      c.font = `${o.weight} ${o.size}px ${SC_FONT}`;
      c.fillStyle = o.fill;
      c.textAlign = o.anchor;
      c.textBaseline = "alphabetic";
      c.fillText(o.s, o.x, o.y);
    } else if (o.k === "rect") {
      roundRectPath(c, o.x, o.y, o.w, o.h, o.r);
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.sw; c.stroke(); }
    } else if (o.k === "circ") {
      c.beginPath();
      c.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.sw; c.stroke(); }
    } else if (o.k === "line") {
      c.beginPath();
      c.moveTo(o.x1, o.y1);
      c.lineTo(o.x2, o.y2);
      c.strokeStyle = o.stroke;
      c.lineWidth = o.sw;
      c.stroke();
    } else if (o.k === "image" && o.img) {
      c.save();
      roundRectPath(c, o.x, o.y, o.w, o.h, o.r);
      c.clip();
      const s = o.r ? Math.max(o.w / o.img.width, o.h / o.img.height) : Math.min(o.w / o.img.width, o.h / o.img.height); // portrét vyplní a ořízne, logo se vejde celé
      c.drawImage(o.img, o.x + (o.w - o.img.width * s) / 2, o.y, o.img.width * s, o.img.height * s);
      c.restore();
    }
  }
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Obrázek se nepodařilo vytvořit."))), "image/png"));
}

// --- tlačítko a nabídka ---------------------------------------------------------------

const SHARE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

function shareButton() {
  return `<button type="button" class="more-btn share-btn" data-share aria-haspopup="menu" aria-expanded="false">${SHARE_ICON} Sdílet</button>`;
}

let shareTrigger = null;
let shareClosedAt = 0;

function closeShareMenu(restoreFocus = false) {
  document.querySelectorAll(".share-menu").forEach((m) => m.remove());
  if (shareTrigger) {
    shareTrigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) shareTrigger.focus();
  }
  shareClosedAt = Date.now();
}

// Nabídka žije v top layer (Popover API), případně jako position: fixed přímo v <body>:
// nikdy ji tak nezakryje sticky lišta ani jiný stacking context (S3).
function placeShareMenu(menu, trigger) {
  const r = trigger.getBoundingClientRect();
  const w = Math.min(menu.offsetWidth || 272, window.innerWidth - 16);
  menu.style.top = menu.style.left = menu.style.right = menu.style.bottom = "";
  if (window.innerWidth < 640) {
    menu.classList.add("sheet");
    return;
  }
  menu.classList.remove("sheet");
  const below = r.bottom + 6;
  const fitsBelow = below + menu.offsetHeight <= window.innerHeight - 8;
  menu.style.top = `${Math.max(8, fitsBelow ? below : r.top - 6 - menu.offsetHeight)}px`;
  menu.style.left = `${Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8)}px`;
}

async function shareAction(kind, ctx, formatKey, btn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Vytvářím…";
  try {
    const blob = await renderCardPng(ctx, formatKey);
    const file = new File([blob], `${ctx.filename}-${formatKey}.png`, { type: "image/png" });
    if (kind === "native") {
      await navigator.share({ files: [file], text: ctx.text, url: ctx.url });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch (e) {
    if (e?.name !== "AbortError") alert(e?.message || "Sdílení se nepodařilo.");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function openShareMenu(trigger) {
  const ctx = window.shareContext?.();
  if (!ctx) return;
  closeShareMenu();
  shareTrigger = trigger;
  const enc = encodeURIComponent;
  const canNative = Boolean(navigator.canShare && navigator.canShare({ files: [new File([new Blob()], "x.png", { type: "image/png" })] }));
  const menu = document.createElement("div");
  menu.className = "share-menu card";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    ${canNative ? '<button type="button" role="menuitem" data-act="native:post">Sdílet obrázek…</button>' : ""}
    <button type="button" role="menuitem" data-act="download:post">Stáhnout obrázek – ${SHARE_FORMATS.post.label}</button>
    <button type="button" role="menuitem" data-act="download:story">Stáhnout obrázek – ${SHARE_FORMATS.story.label}</button>
    <button type="button" role="menuitem" data-act="link">Kopírovat odkaz</button>
    <a role="menuitem" href="https://twitter.com/intent/tweet?text=${enc(ctx.text)}&url=${enc(ctx.url)}" target="_blank" rel="noopener noreferrer">Sdílet na X</a>
    <a role="menuitem" href="https://www.facebook.com/sharer/sharer.php?u=${enc(ctx.url)}" target="_blank" rel="noopener noreferrer">Sdílet na Facebooku</a>
    <a role="menuitem" href="https://wa.me/?text=${enc(`${ctx.text} ${ctx.url}`)}" target="_blank" rel="noopener noreferrer">Sdílet na WhatsAppu</a>
    <p class="small muted">Obrázek má datum, zdroj a adresu stránky. Žádná loga stran, žádné pořadí.</p>`;
  document.body.append(menu);
  if (typeof menu.showPopover === "function") {
    menu.setAttribute("popover", "auto");
    menu.showPopover();
    menu.addEventListener("toggle", (ev) => { if (ev.newState === "closed" && menu.isConnected) closeShareMenu(true); });
  }
  trigger.setAttribute("aria-expanded", "true");
  placeShareMenu(menu, trigger);
  menu.querySelector("button, a")?.focus();
  menu.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const [act, fmt] = el.dataset.act.split(":");
    if (act === "link") {
      try { await navigator.clipboard.writeText(ctx.url); el.textContent = "Odkaz zkopírován"; } catch (e) { el.textContent = ctx.url; }
    } else {
      await shareAction(act, ctx, fmt, el);
    }
  });
}

document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-share]");
  if (btn) {
    ev.preventDefault();
    // Popover se při kliknutí mimo zavře sám; klik na tlačítko hned po tom nesmí nabídku znovu otevřít.
    if (btn.getAttribute("aria-expanded") === "true") closeShareMenu(true);
    else if (Date.now() - shareClosedAt > 250 || btn !== shareTrigger) openShareMenu(btn);
  } else if (!ev.target.closest(".share-menu")) {
    closeShareMenu();
  }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && document.querySelector(".share-menu")) closeShareMenu(true); });
window.addEventListener("resize", () => { const m = document.querySelector(".share-menu"); if (m && shareTrigger) placeShareMenu(m, shareTrigger); });
