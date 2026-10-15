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
  if (d.photo) ops.push({ k: "image", img: d.photo, x: 72, y: y0, w: pw, h: ph, r: 26 }, RECT(70, y0 - 2, pw + 4, ph + 4, 28, null, SC.gold, 4),
    T(72, y0 + ph + 32, "© European Union – Source: EP", 20, 500, SC.muted));
  const nx = d.photo ? 72 + pw + 50 : 72, nw = 1008 - nx;
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
  if (d.photo) ops.push({ k: "image", img: d.photo, x: 72, y: 190, w: 104, h: 104, r: 52 }, CIRC(124, 242, 54, null, SC.gold, 4));
  const nx = d.photo ? 200 : 72;
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
  if (ctx.kind === "mep") data.photo = await loadImage(await photoDataUrl(ctx.data.photoUrl));
  const ops = ctx.kind === "vote" ? voteCardOps(data, f) : formatKey === "slide2" ? mepVotingOps(data, f) : formatKey === "slide3" ? mepWorkOps(data, f) : mepBasicOps(data, f);
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

async function cardFile(ctx, formatKey) {
  const blob = await renderCardPng(ctx, formatKey);
  return new File([blob], `${ctx.filename}-${formatKey}.png`, { type: "image/png" });
}

function downloadFile(file) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// kind: native | download; formatKey: post | story | detail (= tři obrázky 4 : 5: základní karta + dva slidy detailu)
async function shareAction(kind, ctx, formatKey, btn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Vytvářím…";
  try {
    const keys = formatKey === "detail" ? ["post", "slide2", "slide3"] : [formatKey];
    const files = [];
    for (const k of keys) files.push(await cardFile(ctx, k));
    if (kind === "native") await navigator.share({ files, text: ctx.text, url: ctx.url });
    else files.forEach(downloadFile);
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
  const isMep = ctx.kind === "mep";
  const manyFiles = () => navigator.canShare && navigator.canShare({ files: [1, 2, 3].map((i) => new File([new Blob()], `x${i}.png`, { type: "image/png" })) });
  const items = isMep
    ? `${canNative ? '<button type="button" role="menuitem" data-act="native:post">Sdílet obrázek…</button>' : ""}
    ${canNative && manyFiles() ? '<button type="button" role="menuitem" data-act="native:detail">Sdílet detail (3 obrázky)…</button>' : ""}
    <button type="button" role="menuitem" data-act="download:post">Stáhnout – základní karta (4 : 5)</button>
    <button type="button" role="menuitem" data-act="download:detail">Stáhnout – detail, 3 obrázky (4 : 5)</button>
    <button type="button" role="menuitem" data-act="download:story">Stáhnout – story (9 : 16)</button>`
    : `${canNative ? '<button type="button" role="menuitem" data-act="native:post">Sdílet obrázek…</button>' : ""}
    <button type="button" role="menuitem" data-act="download:post">Stáhnout obrázek – ${SHARE_FORMATS.post.label}</button>
    <button type="button" role="menuitem" data-act="download:story">Stáhnout obrázek – ${SHARE_FORMATS.story.label}</button>`;
  menu.innerHTML = `
    ${items}
    <hr class="share-sep">
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
