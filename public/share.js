// Sdílení (X12): tlačítko „Sdílet“ u detailu hlasování a profilu poslance. Obrázek se kreslí v prohlížeči (canvas → PNG),
// takže repo nenarůstá: příspěvek 1080 × 1350 (4 : 5) a story 1080 × 1920. Náhledy odkazů 1200 × 630 vznikají předem
// (scripts/build_cards.py) a mají stejný obsah a barvy.
//
// Pravidla karty: každá karta má datum, zdroj a adresu; u poslance vždy medián EP; žádné pořadí, žádné hodnocení barvou,
// žádná loga stran ani frakcí (jen zkratka a tečka); portrét s popiskem „© European Union – Source: EP“.
// Stránka nastaví window.shareContext = () => ({ kind: "vote" | "mep", url, text, filename, data }).
"use strict";

const SHARE_ROOT = document.currentScript ? new URL(".", document.currentScript.src).href : "";

const SHARE_FORMATS = { post: { w: 1080, h: 1350, label: "příspěvek (4 : 5)" }, story: { w: 1080, h: 1920, label: "story (9 : 16)" },
  slide2: { w: 1080, h: 1350, label: "detail 2/3" }, slide3: { w: 1080, h: 1350, label: "detail 3/3" } };
const SC = { navy: "#0F172A", navy2: "#0A1226", white: "#F8FAFC", muted: "#94A3B8", soft: "#CBD5E1", gold: "#F59E0B",
  for: "#5BE49B", against: "#E5484D", abst: "#94A3B8", absent: "#475569", track: "#334155" };
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
// Tečka hlasu se symbolem uvnitř (✓ pro, ✕ proti, – zdržel se, kroužek nehlasoval): barva + tvar, aby karta fungovala i při poruše barvocitu.
function POSDOT(cx, cy, r, pos) {
  if (pos === "DID_NOT_VOTE") return [CIRC(cx, cy, r - 2, null, SC.absent, 3)];
  const g = SC.navy2, sw = Math.max(2, r * 0.24), k = r;
  const sym = pos === "FOR" ? [LINE(cx - 0.42 * k, cy + 0.04 * k, cx - 0.12 * k, cy + 0.34 * k, g, sw), LINE(cx - 0.12 * k, cy + 0.34 * k, cx + 0.44 * k, cy - 0.32 * k, g, sw)]
    : pos === "AGAINST" ? [LINE(cx - 0.34 * k, cy - 0.34 * k, cx + 0.34 * k, cy + 0.34 * k, g, sw), LINE(cx + 0.34 * k, cy - 0.34 * k, cx - 0.34 * k, cy + 0.34 * k, g, sw)]
    : [LINE(cx - 0.4 * k, cy, cx + 0.4 * k, cy, g, sw)];
  return [CIRC(cx, cy, r, SC_POS[pos]), ...sym];
}
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

const SHARE_KEYS = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"];
const SHARE_SHORT = { FOR: "pro", AGAINST: "proti", ABSTENTION: "zdrž.", DID_NOT_VOTE: "nehl." };

// Řádky stran pro kartu z czPartyRows() (app.js); zrcadlo card_parties() v scripts/vote_parties.py.
// Když by se strany nevešly (víc než 12), sloučí se jednočlenné do „ostatní“.
function shareCardParties(rows, maxRows = 12) {
  let items = rows.map((r) => ({ label: r.label, groups: r.groups, positions: SHARE_KEYS.flatMap((k) => r.members[k].map(() => k)), total: r.total }));
  if (items.length > maxRows) {
    const keep = items.filter((i) => i.total > 1), rest = items.filter((i) => i.total === 1);
    while (keep.length >= maxRows && keep.length) rest.unshift(keep.pop());
    keep.push({ label: "ostatní", groups: rest.map((i) => i.label).sort((a, b) => a.localeCompare(b, "cs")),
      positions: rest.flatMap((i) => i.positions).sort((a, b) => SHARE_KEYS.indexOf(a) - SHARE_KEYS.indexOf(b)), total: rest.reduce((n, i) => n + i.total, 0) });
    items = keep;
  }
  return items;
}

const partySummary = (positions) => SHARE_KEYS.map((k) => [positions.filter((p) => p === k).length, SHARE_SHORT[k]]).filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(" · ");

// Karta hlasování (S5): název, výsledek větou, celý EP, Češi po stranách (barva tečky = hlas). Obsah vystředěný mezi hlavičkou a patičkou.
function voteCardOps(d, f) {
  const H = f.h, story = f.h > 1500;
  const ops = [];
  let y = 0;
  // Téma (stejná data jako čip v seznamu hlasování): jeden čip nad názvem, další jen jako „+N“; bez tématu se řádek vynechá.
  if (d.topic) {
    const t = fitText(d.topic, 26, 700, 900), tw = measureText(t, 26, 700);
    ops.push(RECT(72, y, tw + 40, 46, 23, "#1E293B", "#475569", 2), T(92, y + 32, t, 26, 700, SC.white));
    y += 66;
  }
  const title = wrapText(d.title, 58, 700, 936, 3);
  title.forEach((l, i) => ops.push(T(72, y + 58 + i * 68, l, 58, 700, SC.white)));
  y += title.length * 68 + 14;
  if (d.subtitle) {
    const sub = wrapText(d.subtitle, 28, 500, 936, 2);
    sub.forEach((l, i) => ops.push(T(72, y + 28 + i * 38, l, 28, 500, SC.soft)));
    y += sub.length * 38 + 10;
  }
  y += 22;
  const ok = d.result === "ADOPTED";
  const pill = (d.resultLabel || "").toUpperCase();
  const icon = ok || d.result === "REJECTED" ? 34 : 0;
  const pw = measureText(pill, 26, 800) + 44 + icon;
  const fg = ok ? SC.navy : SC.white;
  ops.push(RECT(72, y, pw, 52, 26, ok ? SC.white : "#334155"));
  if (icon) {   // ✓ / ✕ kreslené čarami (písmo ikonu nemusí mít)
    const cx = 72 + 34, cy = y + 26;
    if (ok) ops.push(LINE(cx - 9, cy, cx - 2, cy + 8, fg, 4), LINE(cx - 2, cy + 8, cx + 10, cy - 8, fg, 4));
    else ops.push(LINE(cx - 8, cy - 8, cx + 8, cy + 8, fg, 4), LINE(cx + 8, cy - 8, cx - 8, cy + 8, fg, 4));
  }
  ops.push(T(72 + icon + (pw - icon) / 2 + 2, y + 36, pill, 26, 800, fg, "center"));
  const sent = wrapText(d.sentence, 30, 600, 936 - pw - 20, 2);
  sent.forEach((l, i) => ops.push(T(72 + pw + 20, y + 36 + i * 38, l, 30, 600, SC.white)));
  y += Math.max(52, sent.length * 38) + 34;
  ops.push(T(72, y + 24, fitText(`Celý EP: ${fmtNum(d.ep[0])} pro · ${fmtNum(d.ep[1])} proti · ${fmtNum(d.ep[2])} zdržel se · ${fmtNum(d.ep[3])} nehlasovalo`, 28, 500, 936), 28, 500, SC.soft),
    ...barOps(72, y + 48, 936, 16, d.ep));
  y += 100;
  // Češi: souhrn s barevnými tečkami (zároveň legenda), pak mřížka stran
  const czTotal = SHARE_KEYS.map((k) => d.parties.reduce((n, g) => n + g.positions.filter((p) => p === k).length, 0));
  ops.push(T(72, y + 30, "JAK HLASOVALI ČEŠI", 22, 800, SC.gold));
  let lx = 1008;
  [...SHARE_KEYS].reverse().forEach((k) => {
    const n = czTotal[SHARE_KEYS.indexOf(k)];
    if (!n) return;
    const txt = `${n} ${SHARE_SHORT[k]}`, w = measureText(txt, 30, 700);
    ops.push(T(lx, y + 32, txt, 30, 700, k === "DID_NOT_VOTE" ? SC.soft : SC_POS[k], "right"));
    ops.push(...POSDOT(lx - w - 22, y + 22, 13, k));
    lx -= w + 56;
  });
  if (!d.parties.length) ops.push(T(1008, y + 32, "žádný poslanec v mandátu", 28, 600, SC.white, "right"));
  y += 52;
  ops.push(LINE(72, y, 1008, y, "#334155", 2));
  const cols = story ? 1 : 2, colW = cols === 1 ? 936 : 448, perCol = Math.ceil(d.parties.length / cols);
  const rowH = story ? 104 : 96;
  d.parties.forEach((g, i) => {
    const col = cols === 1 ? 0 : Math.floor(i / perCol), row = cols === 1 ? i : i % perCol;
    const x0 = 72 + col * (colW + 40), ry = y + row * rowH;
    const groups = g.groups.join(" · ");
    ops.push(T(x0, ry + 38, fitText(g.label, 30, 800, colW), 30, 800, SC.white),
      T(x0 + measureText(g.label, 30, 800) + 12, ry + 38, fitText(groups, 20, 500, colW - measureText(g.label, 30, 800) - 12), 20, 500, SC.muted));
    const r = 13;
    const right = partySummary(g.positions), rw = measureText(right, 24, 500);
    const maxDots = Math.max(Math.floor((colW - rw - 20) / (2 * r + 6)), 1);
    g.positions.slice(0, maxDots).forEach((p, j) => {
      const cx = x0 + r + j * (2 * r + 6), cy = ry + 64;
      ops.push(...POSDOT(cx, cy, r, p));
    });
    ops.push(T(x0 + colW, ry + 72, right, 24, 500, SC.soft, "right"), LINE(x0, ry + rowH - 8, x0 + colW, ry + rowH - 8, "#1E293B", 2));
  });
  y += perCol * rowH + 6;
  const top = 160, bottom = H - 150;
  return [...shareHeader(`${fmtDate(d.date)} · ${d.kindLabel}`), ...shift(ops, Math.round(top + Math.max((bottom - top - y) / 2, 0))),
    ...shareFooter(H, `Zdroj: HowTheyVote.eu (ODbL) · strana k datu hlasování · data k ${fmtDate(d.dataDay)}`, d.urlShort)];
}

// --- karta poslance (S4): základní karta + detail (2. a 3. obrázek carouselu) ----------------------------
// Bez pořadí, bez hodnocení barvou, bez log: frakce a strana jen jako tečka a zkratka. Chybějící hodnota se vynechá.

function chipOps(x, y, label, color) {
  const w = measureText(label, 28, 600) + 62;
  return { w, ops: [RECT(x, y, w, 52, 26, "#1E293B"), CIRC(x + 28, y + 26, 8, color || SC.muted), T(x + 46, y + 36, label, 28, 600, SC.white)] };
}

function sectionTitle(y, s) { return T(72, y, s, 26, 800, SC.gold); }

// Metrika s posuvníkem 60–100 % (stejná osa jako benchRow na webu), mediánem a „x z y“.
function metricOps(x, y, w, label, pair, median, medLabel) {
  const share = pair && pair[1] ? pair[0] / pair[1] : null;
  const lo = 0.6, pos = (v) => x + w * Math.min(Math.max((v - lo) / (1 - lo), 0), 1);
  const ops = [T(x, y + 30, fitText(label, 30, 600, w), 30, 600, SC.soft), T(x, y + 120, share === null ? "–" : fmtPct(share), 90, 800, SC.white),
    RECT(x, y + 152, w, 10, 5, SC.track)];
  if (share !== null) ops.push(CIRC(pos(share), y + 157, 14, SC.white));
  if (median != null) ops.push(LINE(pos(median), y + 138, pos(median), y + 176, SC.gold, 6), T(x, y + 212, `${medLabel} ${fmtPct(median)}`, 28, 700, SC.gold));
  if (pair && pair[1]) ops.push(T(x, y + (median != null ? 248 : 212), `${fmtNum(pair[0])} z ${fmtNum(pair[1])} hlasování`, 24, 500, SC.muted));
  return ops;
}

// 1/3 Základní karta: portrét, jméno, frakce · strana, mandát, dvě čísla s mediánem.
function mepBasicOps(d, f) {
  const H = f.h, story = f.h > 1500;
  const ops = [];
  const pw = 380, ph = 475, y0 = 0;
  const neutral = d.avatar === "neutral";
  if (neutral) ops.push(...neutralAvatarOps(72, y0, pw, ph, 26));
  else if (d.photo) ops.push({ k: "image", img: d.photo, x: 72, y: y0, w: pw, h: ph, r: 26 }, RECT(70, y0 - 2, pw + 4, ph + 4, 28, null, SC.gold, 4),
    T(72, y0 + ph + 32, "© European Union – Source: EP", 20, 500, SC.muted));
  const nx = d.photo || neutral ? 72 + pw + 50 : 72, nw = 1008 - nx;
  const nameLines = wrapText(d.name, 72, 800, nw, 3);
  let chips = [], cx = nx, cy = 0;
  const chipRows = [];
  (d.chips || []).forEach((c) => {
    const w = measureText(c.label, 28, 600) + 62;
    if (cx + w > 1008 && cx > nx) { cx = nx; cy += 62; }
    chipRows.push({ c, x: cx, y: cy }); cx += w + 12;
  });
  const chipH = chipRows.length ? cy + 52 : 0;
  const mand = d.mandate ? wrapText(d.mandate, 28, 500, nw, 2) : [];
  const blockH = nameLines.length * 80 + 24 + chipH + (mand.length ? 20 + mand.length * 38 : 0);
  let by = y0 + Math.max((ph - blockH) / 2, 0);
  nameLines.forEach((l, i) => ops.push(T(nx, by + 62 + i * 80, l, 72, 800, SC.white)));
  by += nameLines.length * 80 + 24;
  chipRows.forEach(({ c, x, y }) => { const r = chipOps(x, by + y, c.label, c.color); ops.push(...r.ops); });
  by += chipH + 20;
  mand.forEach((l, i) => ops.push(T(nx, by + 28 + i * 38, l, 28, 500, SC.soft)));
  let y = y0 + ph + (story ? 150 : 96);
  ops.push(...metricOps(72, y, 430, "Účast na hlasování", d.attendance, d.attendanceMedian, "medián EP"));
  if (d.loyalty && d.loyalty[1]) ops.push(...metricOps(578, y, 430, "Hlasuje s frakcí", d.loyalty, d.loyaltyMedian, "medián frakce"));
  y += 290 + (story ? 50 : 0);
  ops.push(T(72, y + 30, "Bez pořadí a hodnocení. Čísla spočítal skript z oficiálních dat.", 26, 500, SC.soft));
  y += 50;
  const top = 172, bottom = H - 150;
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...shift(ops, Math.round(top + Math.max((bottom - top - y) / 2, 0))),
    ...shareFooter(H, "Zdroj: HowTheyVote.eu (ODbL), EP Open Data · výpočet EP Watch CZ", d.urlShort)];
}

// Mini hlavička 2. a 3. obrázku: kulatý portrét, jméno, frakce · strana, „2 / 3“.
function mepMiniHead(d, n) {
  const ops = [];
  const neutral = d.avatar === "neutral";
  if (neutral) ops.push(...neutralAvatarOps(72, 190, 104, 104, 52));
  else if (d.photo) ops.push({ k: "image", img: d.photo, x: 72, y: 190, w: 104, h: 104, r: 52 }, CIRC(124, 242, 54, null, SC.gold, 4));
  const nx = d.photo || neutral ? 200 : 72;
  ops.push(T(nx, 238, fitText(d.name, 52, 800, 700), 52, 800, SC.white),
    T(nx, 280, fitText((d.chips || []).map((c) => c.label).join(" · "), 28, 500, 700), 28, 500, SC.soft), T(1008, 252, `${n} / 3`, 30, 500, SC.muted, "right"));
  return ops;
}

const SLIDE_FOOT = { 2: "Zdroj: HowTheyVote.eu (ODbL) · výpočet EP Watch CZ · bez pořadí a hodnocení", 3: "Zdroj: EP Open Data (CC BY 4.0) · počty, ne hodnocení kvality práce" };

function tileOps(x, y, w, h, label, value, sub) {
  const ops = [RECT(x, y, w, h, 28, "#16213A"), T(x + 28, y + 44, fitText(label, 26, 600, w - 56), 26, 600, SC.soft), T(x + 28, y + 118, value, 68, 800, SC.white)];
  if (sub) wrapText(sub, 22, 500, w - 56, 2).forEach((l, i) => ops.push(T(x + 28, y + 156 + i * 28, l, 22, 500, SC.muted)));
  return ops;
}

// 2/3 Jak hlasuje: rozložení hlasů, soulad s výsledkem, účast u závěrečných, s kým hlasuje nejčastěji stejně.
function mepVotingOps(d, f) {
  const ops = [...mepMiniHead(d, 2)];
  let y = 384;
  const pos = d.positions;
  if (pos) {
    const total = SHARE_KEYS.reduce((n, k) => n + (pos[k] || 0), 0);
    ops.push(sectionTitle(y, `JAK HLASOVAL · ${fmtNum(total)} HLASOVÁNÍ`), ...barOps(72, y + 28, 936, 34, SHARE_KEYS.map((k) => pos[k] || 0)));
    let lx = 72;
    const lab = { FOR: "pro", AGAINST: "proti", ABSTENTION: "zdržel se", DID_NOT_VOTE: "nehlasoval" };
    SHARE_KEYS.forEach((k) => {
      const t = `${lab[k]} ${fmtNum(pos[k] || 0)}`;
      ops.push(...POSDOT(lx + 12, y + 104, 12, k), T(lx + 34, y + 114, t, 30, 600, SC.white));
      lx += measureText(t, 30, 600) + 64;
    });
    y += 200;
  }
  const tiles = [];
  if (d.outcome && d.outcome[1]) tiles.push(["Hlasoval jako většina EP", fmtPct(d.outcome[0] / d.outcome[1]),
    `${fmtNum(d.outcome[0])} z ${fmtNum(d.outcome[1])}${d.groupOutcome && d.groupOutcome[1] ? ` · průměr frakce ${fmtPct(d.groupOutcome[0] / d.groupOutcome[1])}` : ""}`]);
  if (d.attendanceMain && d.attendanceMain[1]) tiles.push(["Účast u závěrečných hlasování", fmtPct(d.attendanceMain[0] / d.attendanceMain[1]),
    `${fmtNum(d.attendanceMain[0])} z ${fmtNum(d.attendanceMain[1])}${d.attendanceMainMedian != null ? ` · medián EP ${fmtPct(d.attendanceMainMedian)}` : ""}`]);
  if (tiles.length) {
    ops.push(sectionTitle(y, "SROVNÁNÍ"));
    tiles.forEach((t, i) => ops.push(...tileOps(72 + i * 488, y + 28, tiles.length === 1 ? 936 : 448, 200, ...t)));
    y += 290;
  }
  if (d.pairwiseTop && d.pairwiseTop.length) {
    ops.push(sectionTitle(y, "NEJČASTĚJI HLASUJE STEJNĚ JAKO"));
    d.pairwiseTop.forEach((p, i) => {
      const ry = y + 62 + i * 70;
      ops.push(T(72, ry, fitText(`${p.name}${p.party ? ` · ${p.party}` : ""}`, 32, 600, 780), 32, 600, SC.white), T(1008, ry, fmtPct(p.share), 32, 700, SC.white, "right"),
        LINE(72, ry + 20, 1008, ry + 20, "#334155", 2));
    });
  }
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...ops, ...shareFooter(f.h, SLIDE_FOOT[2], d.urlShort)];
}

const committeeShort = (n) => { const t = String(n || "").replace(/^(Výbor|Podvýbor) pro /i, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const committeeLine = (list) => list.map((c) => `${c.code} ${committeeShort(c.name)}`.trim()).join(" · ");

// 3/3 Práce na textech a v plénu: počty, ne kvalita; chybějící data se vynechají.
function mepWorkOps(d, f) {
  const ops = [...mepMiniHead(d, 3)];
  let y = 384;
  const w = d.ownWork;
  if (w) {
    ops.push(sectionTitle(y, "PRÁCE NA TEXTECH"));
    const adoptedNote = (n, adopted) => (n && adopted != null ? (adopted === n ? (n === 1 ? "Parlament přijal" : "všechny Parlament přijal") : `přijato ${fmtNum(adopted)}`) : "");
    [["Vedl zprávy", w.leadReports, adoptedNote(w.leadReports, w.leadAdopted)], ["Stanoviska výborů", w.leadOpinions, d.female ? "jako zpravodajka" : d.female === false ? "jako zpravodaj" : "jako zpravodaj/ka"],
      ["Stínové zprávy", w.shadowReports, `vyjednáv${d.female ? "ala" : d.female === false ? "al" : "al/a"} za frakci`]].forEach((t, i) => ops.push(...tileOps(72 + i * 320, y + 28, 296, 210, t[0], fmtNum(t[1]), t[2])));
    y += 300;
  }
  const pl = [];
  if (d.speeches != null) pl.push(["Projevy", fmtNum(d.speeches), d.speechesMinutes != null ? `celkem ${fmtNum(Math.round(d.speechesMinutes))} min` : ""]);
  if (d.questions != null) pl.push(["Otázky Komisi", fmtNum(d.questions), d.questionsAnswered != null ? (d.questionsAnswered === d.questions && d.questions ? "všechny zodpovězené" : `zodpovězeno ${fmtNum(d.questionsAnswered)}`) : ""]);
  if (d.presence && d.presence.days) pl.push(["Prezence", fmtPct(d.presence.present / d.presence.days), `${fmtNum(d.presence.present)} ze ${fmtNum(d.presence.days)} dnů (EP)`]);
  if (pl.length) {
    ops.push(sectionTitle(y, "V PLÉNU"));
    pl.forEach((t, i) => ops.push(...tileOps(72 + i * 320, y + 28, 296, 210, ...t)));
    y += 300;
  }
  if (d.committees && (d.committees.members.length || d.committees.substitutes.length)) {
    ops.push(sectionTitle(y, "VÝBORY (ČLEN)"));
    let cy = y + 56;
    if (d.committees.members.length) {
      wrapText(committeeLine(d.committees.members), 28, 500, 936, 2).forEach((l, i) => ops.push(T(72, cy + i * 38, l, 28, 500, SC.soft)));
      cy += 38 * Math.min(2, Math.ceil(measureText(committeeLine(d.committees.members), 28, 500) / 936)) + 8;
    }
    if (d.committees.substitutes.length) ops.push(T(72, cy, fitText(`náhradník: ${d.committees.substitutes.join(", ")}`, 28, 500, 936), 28, 500, SC.muted));
  }
  return [...shareHeader(`data k ${fmtDate(d.workDay || d.dataDay)}`), ...ops, ...shareFooter(f.h, SLIDE_FOOT[3], d.urlShort)];
}

// --- karta čísla (metric), přehledu (split) a strany (party) ---------------------------------------
// Jen čísla, která už ukazuje stránka; chybějící hodnota (null, NI bez frakce) se vynechá, nic se nedopočítává.

// Obsah vystředěný mezi hlavičkou a patičkou (stejně jako u karty hlasování).
function centered(ops, y, H, top = 172) {
  const bottom = H - 150;
  return shift(ops, Math.round(top + Math.max((bottom - top - y) / 2, 0)));
}

// Karta jednoho čísla: kontext (jméno · frakce · strana), název, hodnota, osa s mediánem, „x z y“, jedna věta definice.
function metricCardOps(d, f) {
  const H = f.h, story = H > 1500;
  const ops = [];
  let y = 0;
  wrapText(d.context || "", 30, 700, 936, 2).forEach((l, i) => ops.push(T(72, y + 30 + i * 40, l, 30, 700, SC.gold)));
  y += d.context ? Math.min(2, wrapText(d.context, 30, 700, 936, 2).length) * 40 + 30 : 0;
  const lab = wrapText(d.label, 50, 800, 936, 2);
  lab.forEach((l, i) => ops.push(T(72, y + 50 + i * 60, l, 50, 800, SC.white)));
  y += lab.length * 60 + 20;
  const share = d.pair && d.pair[1] ? d.pair[0] / d.pair[1] : null;
  ops.push(T(60, y + 220, share === null ? "–" : fmtPct(share), 230, 800, SC.white));
  y += 270;
  if (d.median != null && share !== null) {
    const lo = 0.6, w = 936, pos = (v) => 72 + w * Math.min(Math.max((v - lo) / (1 - lo), 0), 1);
    ops.push(RECT(72, y + 14, w, 12, 6, SC.track), CIRC(pos(share), y + 20, 18, SC.white),
      LINE(pos(d.median), y - 4, pos(d.median), y + 44, SC.gold, 7),
      T(72, y + 92, `${d.medLabel} ${fmtPct(d.median)}`, 32, 700, SC.gold), T(1008, y + 92, "osa 60–100 %", 22, 500, SC.muted, "right"));
    y += 110;
  }
  if (d.pair && d.pair[1]) { ops.push(T(72, y + 40, `${fmtNum(d.pair[0])} z ${fmtNum(d.pair[1])} ${d.unit || "hlasování v době mandátu"}`, 32, 600, SC.soft)); y += 64; }
  if (d.definition) {
    y += 20;
    const def = wrapText(d.definition, 28, 500, 936, story ? 6 : 4);
    def.forEach((l, i) => ops.push(T(72, y + 30 + i * 40, l, 28, 500, SC.muted)));
    y += def.length * 40 + 10;
  }
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...centered(ops, y, H), ...shareFooter(H, d.source || "Zdroj: HowTheyVote.eu (ODbL) · výpočet EP Watch CZ · bez pořadí a hodnocení", d.urlShort)];
}

// Počet řádků přehledu na kartě: příspěvek 5, story 7 (vždy výslovně napsaný na kartě).
const splitRowsFor = (f) => (f.h > 1500 ? 7 : 5);

// Karta přehledu: titulek, věta o výběru, prvních N řádků ve stejném pořadí jako na stránce.
function splitCardOps(d, f) {
  const H = f.h, n = Math.min(splitRowsFor(f), d.rows.length);
  const ops = [];
  let y = 0;
  const tl = wrapText(d.title, 64, 800, 936, 2);
  tl.forEach((l, i) => ops.push(T(72, y + 64 + i * 74, l, 64, 800, SC.white)));
  y += tl.length * 74 + 24;
  const lead = wrapText(`${d.lead ? `${d.lead} ` : ""}Na kartě ${n === d.rows.length && n === d.total ? `všech ${n}` : `prvních ${n} z ${fmtNum(d.total ?? d.rows.length)}`}, pořadí jako na webu${d.order ? ` (${d.order})` : ""}.`, 28, 500, 936, 4);
  lead.forEach((l, i) => ops.push(T(72, y + 28 + i * 38, l, 28, 500, SC.soft)));
  y += lead.length * 38 + 26;
  ops.push(LINE(72, y, 1008, y, SC.track, 2));
  d.rows.slice(0, n).forEach((r) => {
    const sw = Math.max(measureText(r.score, 56, 800), measureText(r.scoreSub || "", 18, 500)) + 24;
    ops.push(T(72, y + 40, fitText(r.meta, 20, 600, 936 - sw), 20, 600, SC.muted));
    const tt = wrapText(r.title, 28, 700, 936 - sw, 2);
    tt.forEach((l, i) => ops.push(T(72, y + 76 + i * 36, l, 28, 700, SC.white)));
    ops.push(T(1008, y + 82, r.score, 56, 800, SC.white, "right"));
    if (r.scoreSub) ops.push(T(1008, y + 108, r.scoreSub, 18, 500, SC.muted, "right"));
    const rh = Math.max(76 + (tt.length - 1) * 36 + 30, 124);
    y += rh;
    ops.push(LINE(72, y, 1008, y, "#1E293B", 2));
  });
  const rest = (d.total ?? d.rows.length) - n;
  if (rest > 0) { ops.push(T(72, y + 44, `… a dalších ${fmtNum(rest)} na webu`, 26, 600, SC.soft)); y += 64; }
  return [...shareHeader(d.dateLabel || `data k ${fmtDate(d.dataDay)}`), ...centered(ops, y, H), ...shareFooter(H, d.source || `Zdroj: HowTheyVote.eu (ODbL) · data k ${fmtDate(d.dataDay)}`, d.urlShort)];
}

// Karta strany: název, zkratka a počet poslanců, tři dlaždice „Souhrn za stranu“ (bez log, bez srovnání mezi stranami).
function partyCardOps(d, f) {
  const H = f.h, story = H > 1500;
  const ops = [];
  let y = 0;
  const nm = wrapText(d.name, 66, 800, 936, 3);
  nm.forEach((l, i) => ops.push(T(72, y + 66 + i * 76, l, 66, 800, SC.white)));
  y += nm.length * 76 + 24;
  ops.push(T(72, y + 32, fitText(d.sub, 32, 600, 936), 32, 600, SC.soft));
  y += 80;
  const tiles = (d.tiles || []).filter((t) => t.pair && t.pair[1]);
  tiles.forEach((t, i) => {
    const h = story ? 250 : 220, ty = y + i * (h + 24);
    ops.push(RECT(72, ty, 936, h, 28, "#16213A"), T(108, ty + 62, fitText(t.label, 32, 700, 520), 32, 700, SC.soft),
      T(1008 - 36, ty + h / 2 + 36, fmtPct(t.pair[0] / t.pair[1]), 104, 800, SC.white, "right"),
      T(108, ty + 112, `${fmtNum(t.pair[0])} z ${fmtNum(t.pair[1])}`, 28, 500, SC.muted));
    if (t.note) ops.push(T(108, ty + 158, fitText(t.note, 24, 500, 520), 24, 500, SC.muted));
  });
  y += tiles.length * ((story ? 250 : 220) + 24) + 10;
  ops.push(T(72, y + 30, "Bez pořadí a hodnocení. Čísla spočítal skript z oficiálních dat.", 24, 500, SC.soft));
  y += 50;
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...centered(ops, y, H), ...shareFooter(H, "Zdroj: HowTheyVote.eu (ODbL), EP Open Data · strana k datu hlasování", d.urlShort)];
}

// Neutrální silueta (stejná pro všechny) místo portrétu: jen balíček pro Instagram (avatar: "neutral").
function neutralAvatarOps(x, y, w, h, r) {
  const cx = x + w / 2;
  return [RECT(x, y, w, h, r, "#1E293B"), CIRC(cx, y + h * 0.38, w * 0.2, "#475569"),
    RECT(cx - w * 0.34, y + h * 0.64, w * 0.68, h * 0.5, w * 0.3, "#475569"), RECT(x, y + h - 2, w, 2, 0, "#1E293B")];
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
  _symbolImg = await loadImage(`${SHARE_ROOT}assets/brand/symbol-white.svg`);
  // Portrét z EP (avatar: "photo", výchozí na webu); "neutral" = stejná silueta pro všechny (balíček pro Instagram).
  if (ctx.kind === "mep" && data.avatar !== "neutral") data.photo = await loadImage(await photoDataUrl(ctx.data.photoUrl));
  const draw = { vote: voteCardOps, metric: metricCardOps, split: splitCardOps, party: partyCardOps }[ctx.kind];
  const ops = draw ? draw(data, f) : formatKey === "slide2" ? mepVotingOps(data, f) : formatKey === "slide3" ? mepWorkOps(data, f) : mepBasicOps(data, f);
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
      c.lineCap = "round";
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


// --- tlačítko a panel sdílení (N1) -------------------------------------------------------
// Jedno tlačítko „Sdílet“ otevře <dialog> s živým náhledem PNG. Co je v náhledu, to se stáhne nebo odešle (stejný blob).
// Stránka nastaví window.shareContext(kind) → { kind, url, text, filename, data, title?, subtitle?, cite?, trust? } (i jako Promise);
// kind je hodnota atributu data-share („“ = karta stránky, „metric:attendance“, „view“ …).

const SHARE_BTN_HTML = '<button type="button" class="share-btn" data-share aria-haspopup="dialog"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg><span>Sdílet</span></button>';

// Tlačítko do hlavičky stránky (stejný kód jako share_button() v build_pages.py, hlídá test).
// Varianta „view“: obrys, „Sdílet pohled“ (přehledy), kind se předá do shareContext.
function shareButton(kind = "", label = "") {
  if (!kind && !label) return SHARE_BTN_HTML;
  return SHARE_BTN_HTML.replace('class="share-btn"', `class="share-btn${kind === "view" ? " outline" : ""}"`)
    .replace("data-share", `data-share="${esc(kind)}"`).replace("<span>Sdílet</span>", `<span>${esc(label || "Sdílet")}</span>`);
}

const SD_ICON = {
  x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  down: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
  quote: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.2 6C4.9 7.2 3.5 9.4 3.5 12.3V18h6.2v-6.1H6.6c.1-1.9 1-3.3 2.6-4.2L7.2 6zm9.8 0c-2.3 1.2-3.7 3.4-3.7 6.3V18h6.2v-6.1h-3.1c.1-1.9 1-3.3 2.6-4.2L17 6z"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  wa: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/></svg>',
  xnet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
  fb: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8.5V6.8c0-.8.5-1 1-1h2.3V2.2L14.2 2C10.9 2 10 4.4 10 6v2.5H7.5V12H10v10h4V12h2.9l.4-3.5H14z"/></svg>',
  mail: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  ratio: (w, h) => `<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><rect x="${(18 - w) / 2}" y="${(22 - h) / 2}" width="${w}" height="${h}" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
};

// Formáty podle typu karty; slides = obrázky, které formát vyrobí (detail poslance = 3 obrázky 4 : 5).
function shareFormats(kind) {
  const post = { key: "post", label: "Příspěvek", ratio: "4 : 5", slides: ["post"], icon: SD_ICON.ratio(12, 15) };
  const story = { key: "story", label: "Story", ratio: "9 : 16", slides: ["story"], icon: SD_ICON.ratio(10, 18) };
  if (kind === "mep") return [{ ...post, label: "Základní" }, { key: "detail", label: "Detail", ratio: "3 × 4 : 5", slides: ["post", "slide2", "slide3"], icon: SD_ICON.ratio(12, 15) }, story];
  return [post, story];
}

const SD_TITLE = { metric: "Sdílet číslo", split: "Sdílet pohled" };
const SD_TRUST = "Karta má datum dat, zdroj a adresu stránky. Bez pořadí a hodnocení.";
const SD_FMT_KEY = "epw-share-format";

const canShareFiles = (n) => {
  try {
    return Boolean(navigator.canShare && navigator.canShare({ files: Array.from({ length: n }, (_, i) => new File([new Blob()], `x${i}.png`, { type: "image/png" })) }));
  } catch (e) { return false; }
};
const canCopyImage = () => Boolean(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

let shareDlg = null;

function closeSharePanel() {
  if (shareDlg?.open && typeof shareDlg.close === "function") shareDlg.close();
  else if (shareDlg) shareDlg.dispatchEvent(new Event("close"));
}

async function openSharePanel(trigger) {
  if (shareDlg) return;
  const kindArg = trigger.dataset.share || "";
  let ctx;
  try { ctx = await window.shareContext?.(kindArg); } catch (e) { ctx = null; }
  if (!ctx) return;
  const enc = encodeURIComponent;
  const formats = ctx.formats || shareFormats(ctx.kind);
  let saved = null;
  try { saved = localStorage.getItem(SD_FMT_KEY); } catch (e) { /* bez úložiště */ }
  let fmt = formats.find((x) => x.key === saved) || formats[0];
  const urlShort = ctx.data?.urlShort || ctx.url.replace(/^https?:\/\//, "");
  const cache = new Map();   // slide → Promise<Blob>; stejný blob pro náhled, stažení i sdílení
  const objUrls = [];
  const blobFor = (slide) => {
    if (!cache.has(slide)) cache.set(slide, renderCardPng(ctx, slide));
    return cache.get(slide);
  };

  const dlg = document.createElement("dialog");
  shareDlg = dlg;
  dlg.className = "share-dlg";
  dlg.setAttribute("aria-labelledby", "sd-h");
  dlg.innerHTML = `
    <div class="sd-grip" aria-hidden="true"></div>
    <div class="sd-head"><div><h2 id="sd-h">${esc(ctx.title || SD_TITLE[ctx.kind] || "Sdílet")}</h2>${ctx.subtitle ? `<p class="sd-sub">${esc(ctx.subtitle)}</p>` : ""}</div>
      <button type="button" class="sd-x" aria-label="Zavřít">${SD_ICON.x}</button></div>
    <div class="sd-body">
      <div class="sd-stage"><div class="sd-preview"></div><p class="sd-meta"></p></div>
      <div class="sd-ctl">
        <p class="sd-lab" id="sd-fl">Formát</p>
        <div class="sd-formats" role="radiogroup" aria-labelledby="sd-fl">${formats.map((x) => `<button type="button" role="radio" data-fmt="${x.key}">${x.icon}<span class="sd-fn">${esc(x.label)}</span><span class="sd-fr">${esc(x.ratio)}</span></button>`).join("")}</div>
        <div class="sd-actions"><button type="button" class="sd-primary"></button><button type="button" class="sd-secondary"></button></div>
        <p class="sd-lab"><label for="sd-url">Odkaz</label></p>
        <div class="sd-link"><input id="sd-url" type="text" readonly value="${esc(urlShort)}"><button type="button" class="sd-btn" data-act="link">${SD_ICON.copy}<span>Kopírovat</span></button></div>
        ${ctx.cite ? `<button type="button" class="sd-textbtn" data-act="cite">${SD_ICON.quote}<span>Kopírovat jako citaci</span></button>` : ""}
        <p class="sd-lab">Sdílet na</p>
        <div class="sd-nets">
          <a href="https://wa.me/?text=${enc(`${ctx.text} ${ctx.url}`)}" target="_blank" rel="noopener noreferrer"><span class="sd-ni">${SD_ICON.wa}</span>WhatsApp</a>
          <a href="https://twitter.com/intent/tweet?text=${enc(ctx.text)}&amp;url=${enc(ctx.url)}" target="_blank" rel="noopener noreferrer"><span class="sd-ni">${SD_ICON.xnet}</span>X</a>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${enc(ctx.url)}" target="_blank" rel="noopener noreferrer"><span class="sd-ni">${SD_ICON.fb}</span>Facebook</a>
          <a href="mailto:?subject=${enc(ctx.data?.title || ctx.data?.name || "EP Watch CZ")}&amp;body=${enc(`${ctx.text}\n\n${ctx.url}`)}" rel="noopener noreferrer"><span class="sd-ni">${SD_ICON.mail}</span>E-mail</a>
        </div>
        <p class="sd-trust">${SD_ICON.shield}<span>${esc(ctx.trust || SD_TRUST)}${ctx.kind === "mep" && ctx.data?.avatar !== "neutral" && ctx.data?.photoUrl ? " Portrét © European Union – Source: EP." : ""}</span></p>
      </div>
    </div>
    <div class="sd-toast" role="status" aria-live="polite"></div>`;
  document.body.append(dlg);

  const $ = (sel) => dlg.querySelector(sel);
  const preview = $(".sd-preview"), primary = $(".sd-primary"), secondary = $(".sd-secondary"), toastEl = $(".sd-toast");
  let toastTimer = 0, okTimer = 0, renderSeq = 0;
  const toast = (msg, bad = false) => {
    toastEl.textContent = msg;
    toastEl.classList.toggle("bad", bad);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  };
  const files = async () => (await Promise.all(fmt.slides.map(blobFor)))
    .map((b, i) => new File([b], `${ctx.filename}-${fmt.slides.length > 1 ? `${i + 1}-z-${fmt.slides.length}` : fmt.key}.png`, { type: "image/png" }));

  const setActions = () => {
    const many = fmt.slides.length > 1;
    const native = canShareFiles(fmt.slides.length);
    primary.dataset.act = native ? "native" : "download";
    primary.innerHTML = native ? `${SD_ICON.share}<span>${many ? "Sdílet 3 obrázky…" : "Sdílet obrázek…"}</span>` : `${SD_ICON.down}<span>${many ? "Stáhnout 3 obrázky" : "Stáhnout obrázek"}</span>`;
    if (native) { secondary.dataset.act = "download"; secondary.innerHTML = `${SD_ICON.down}<span>Stáhnout</span>`; secondary.hidden = false; }
    else { secondary.dataset.act = "copyimg"; secondary.innerHTML = `${SD_ICON.copy}<span>Kopírovat obrázek</span>`; secondary.hidden = many || !canCopyImage(); }
  };

  const showPreview = async () => {
    const seq = ++renderSeq;
    const f = SHARE_FORMATS[fmt.slides[0]];
    $(".sd-meta").textContent = `PNG · ${f.w} × ${f.h} px${fmt.slides.length > 1 ? ` · ${fmt.slides.length} obrázky` : ""}`;
    preview.className = `sd-preview${f.h > 1500 ? " tall" : ""}`;
    const slow = setTimeout(() => { if (seq === renderSeq) preview.classList.add("loading"); }, 150);
    preview.setAttribute("aria-busy", "true");
    try {
      const blobs = await Promise.all(fmt.slides.map(blobFor));
      if (seq !== renderSeq) return;
      const srcs = blobs.map((b) => { const u = URL.createObjectURL(b); objUrls.push(u); return u; });
      const alt = (i) => `Náhled karty: ${ctx.subtitle || ctx.text}${srcs.length > 1 ? ` (obrázek ${i + 1} z ${srcs.length})` : ""}`;
      preview.innerHTML = srcs.length > 1
        ? `<div class="sd-carousel" tabindex="0" aria-label="Náhled, 3 obrázky (šipky přepínají)">${srcs.map((u, i) => `<img src="${u}" alt="${esc(alt(i))}" width="1080" height="1350">`).join("")}</div>
           <div class="sd-dots" aria-label="Obrázek 1 z ${srcs.length}">${srcs.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>`
        : `<img src="${srcs[0]}" alt="${esc(alt(0))}" width="${f.w}" height="${f.h}">`;
      const car = preview.querySelector(".sd-carousel");
      if (car) {
        const dots = [...preview.querySelectorAll(".sd-dots i")];
        car.addEventListener("scroll", () => {
          const i = Math.round(car.scrollLeft / Math.max(car.firstElementChild.offsetWidth, 1));
          dots.forEach((d, j) => d.classList.toggle("on", j === i));
          preview.querySelector(".sd-dots").setAttribute("aria-label", `Obrázek ${i + 1} z ${dots.length}`);
        }, { passive: true });
        car.addEventListener("keydown", (ev) => {
          if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
          ev.preventDefault();
          car.scrollBy({ left: (ev.key === "ArrowRight" ? 1 : -1) * car.firstElementChild.offsetWidth, behavior: "smooth" });
        });
      }
    } catch (e) {
      if (seq === renderSeq) { preview.innerHTML = '<p class="muted small">Náhled se nepodařilo vytvořit.</p>'; toast(e?.message || "Obrázek se nepodařilo vytvořit.", true); }
    } finally {
      clearTimeout(slow);
      if (seq === renderSeq) { preview.classList.remove("loading"); preview.removeAttribute("aria-busy"); }
    }
  };

  const selectFormat = (key, focus = false) => {
    fmt = formats.find((x) => x.key === key) || formats[0];
    dlg.querySelectorAll("[data-fmt]").forEach((b) => {
      const on = b.dataset.fmt === fmt.key;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    if (fmt.key === "post" || fmt.key === "story") { try { localStorage.setItem(SD_FMT_KEY, fmt.key); } catch (e) { /* bez úložiště */ } }
    setActions();
    showPreview();
  };

  const flash = (btn, text) => {
    const old = btn.innerHTML;
    btn.classList.add("ok");
    btn.innerHTML = `<span>✓ ${esc(text)}</span>`;
    clearTimeout(okTimer);
    okTimer = setTimeout(() => { btn.classList.remove("ok"); btn.innerHTML = old; }, 1800);
  };

  const act = async (btn) => {
    const a = btn.dataset.act;
    try {
      if (a === "native") {
        const fs = await files();
        flash(btn, "Otevírám sdílení…");
        await navigator.share({ files: fs, text: ctx.text, url: ctx.url });
      } else if (a === "download") {
        (await files()).forEach((f) => downloadBlob(f, f.name));
        if (btn === primary) flash(btn, "Staženo"); else toast("Staženo");
      } else if (a === "copyimg") {
        const blob = await blobFor(fmt.slides[0]);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast("Obrázek je ve schránce");
      } else if (a === "link") {
        await navigator.clipboard.writeText(ctx.url);
        toast("Odkaz zkopírován");
      } else if (a === "cite") {
        await navigator.clipboard.writeText(await citeText(ctx.cite));
        toast("Citace zkopírována");
      }
    } catch (e) {
      if (e?.name === "AbortError") return;   // uživatel zavřel systémové sdílení
      if (a === "link") { $("#sd-url").select(); toast("Odkaz nejde zkopírovat, je označený v poli.", true); return; }
      toast(e?.message ? `Nepodařilo se: ${e.message}` : "Nepodařilo se.", true);
    }
  };

  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg) { closeSharePanel(); return; }   // klik na pozadí (::backdrop)
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.classList.contains("sd-x")) closeSharePanel();
    else if (b.dataset.fmt) selectFormat(b.dataset.fmt);
    else if (b.dataset.act) act(b);
  });
  $(".sd-formats").addEventListener("keydown", (ev) => {
    const i = formats.indexOf(fmt), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (!d) return;
    ev.preventDefault();
    selectFormat(formats[(i + d + formats.length) % formats.length].key, true);
  });
  $("#sd-url").addEventListener("focus", (ev) => ev.target.select());
  dlg.addEventListener("close", () => {
    objUrls.forEach((u) => URL.revokeObjectURL(u));
    dlg.remove();
    shareDlg = null;
    trigger.setAttribute("aria-expanded", "false");
    if (trigger.isConnected) trigger.focus();
  });

  selectFormat(fmt.key);
  trigger.setAttribute("aria-expanded", "true");
  if (typeof dlg.showModal === "function") dlg.showModal();
  else {   // bez <dialog>: pevně umístěný panel v <body>
    dlg.setAttribute("open", "");
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.classList.add("sd-fallback");
    document.addEventListener("keydown", function esc(ev) { if (ev.key === "Escape") { document.removeEventListener("keydown", esc); closeSharePanel(); } });
  }
  primary.focus();
}

document.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-share]");
  if (!btn) return;
  ev.preventDefault();
  btn.closest("[popover]")?.hidePopover?.();
  openSharePanel(btn);
});
