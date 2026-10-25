// Sdílení (X12): tlačítko „Sdílet“ u detailu hlasování a profilu poslance. Obrázek se kreslí v prohlížeči (canvas → PNG),
// takže repo nenarůstá: příspěvek 1080 × 1350 (4 : 5) a story 1080 × 1920. Náhledy odkazů 1200 × 630 vznikají předem
// (scripts/build_cards.py) a mají stejný obsah a barvy.
//
// Pravidla karty: každá karta má datum, zdroj a adresu; u poslance vždy medián EP; žádné pořadí, žádné hodnocení barvou;
// loga stran a frakcí jen z oficiálních souborů na bílém štítku (bez loga zkratka a tečka); portrét s popiskem „© European Union – Source: EP“.
// Exporty (…Ops, SHARE_FORMATS, measureText, renderCardPng, useCardTheme) jsou jen pro e2e test karet; stránky share.js neimportují.
// Stránka nastaví window.shareContext = () => ({ kind: "vote" | "mep", url, text, filename, data }).
import { citeText, getJSON } from "./lib/data.js";
import { SHARE_KEYS } from "./lib/ui.js";
import { esc, fmtDate, fmtNum, fmtPct, withShareUrl } from "./lib/format.js";

const SHARE_ROOT = new URL(".", import.meta.url).href;

export const SHARE_FORMATS = { post: { w: 1080, h: 1350, label: "příspěvek (4 : 5)" }, story: { w: 1080, h: 1920, label: "story (9 : 16)" },
  slide2: { w: 1080, h: 1350, label: "detail 2/3" }, slide3: { w: 1080, h: 1350, label: "detail 3/3" },
  story2: { w: 1080, h: 1920, label: "detail 2/3 (story)" }, story3: { w: 1080, h: 1920, label: "detail 3/3 (story)" } };
// Barvy karty podle role (design/tokens.json → python scripts/tokens.py): tmavá = dosavadní karta, světlá = volba „Vzhled“.
const SC_THEMES = { dark: { navy: "#0F172A", navy2: "#0A1226", white: "#F8FAFC", muted: "#94A3B8", soft: "#CBD5E1", gold: "#F59E0B", for: "#5BE49B", against: "#E5484D", abst: "#94A3B8", absent: "#475569", track: "#334155", text: "#F8FAFC", accent: "#F59E0B", bg0: "#0F172A", bg1: "#0A1226", line: "#334155", rowLine: "#1E293B", chip: "#1E293B", chipLine: "#475569", tile: "#16213A", tileLine: "#16213A", silhouette: "#475569", glyph: "#0A1226", pillOk: "#F8FAFC", pillOkText: "#0F172A", pillNo: "#334155", pillNoText: "#F8FAFC" }, light: { navy: "#0F172A", navy2: "#0A1226", white: "#F8FAFC", muted: "#64748B", soft: "#334155", gold: "#F59E0B", for: "#2AA560", against: "#9F1D2B", abst: "#64748B", absent: "#8092AB", track: "#E2E8F0", text: "#0F172A", accent: "#B45309", bg0: "#F8FAFC", bg1: "#F8FAFC", line: "#E2E8F0", rowLine: "#E2E8F0", chip: "#EEF2F7", chipLine: "#CBD5E1", tile: "#FFFFFF", tileLine: "#E2E8F0", silhouette: "#94A3B8", glyph: "#FFFFFF", pillOk: "#0F172A", pillOkText: "#FFFFFF", pillNo: "#475569", pillNoText: "#FFFFFF" } };
// Hlavička karty (logo, datum, téma) je v obou variantách modrá jako hlavička webu.
const BAND = { glow: "#1E3A8A", navy: "#0F172A", navy2: "#0A1226", text: "#F8FAFC", soft: "#CBD5E1", chip: "rgba(248, 250, 252, .12)", chipLine: "rgba(248, 250, 252, .26)" };
export const CARD_THEMES = ["dark", "light"];
let THEME = "dark", SC = SC_THEMES.dark;
// Vzhled pro kreslicí funkce: renderCardPng ho nastaví před kreslením (e2e test kreslí obě varianty).
export function useCardTheme(name) { THEME = SC_THEMES[name] ? name : "dark"; SC = SC_THEMES[THEME]; return SC; }
const scPos = (k) => ({ FOR: SC.for, AGAINST: SC.against, ABSTENTION: SC.abst, DID_NOT_VOTE: SC.absent })[k];
const SC_FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

let _measureCtx = null;
export function measureText(text, size, weight) {
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
  const g = SC.glyph, sw = Math.max(2, r * 0.24), k = r;
  const sym = pos === "FOR" ? [LINE(cx - 0.42 * k, cy + 0.04 * k, cx - 0.12 * k, cy + 0.34 * k, g, sw), LINE(cx - 0.12 * k, cy + 0.34 * k, cx + 0.44 * k, cy - 0.32 * k, g, sw)]
    : pos === "AGAINST" ? [LINE(cx - 0.34 * k, cy - 0.34 * k, cx + 0.34 * k, cy + 0.34 * k, g, sw), LINE(cx + 0.34 * k, cy - 0.34 * k, cx - 0.34 * k, cy + 0.34 * k, g, sw)]
    : [LINE(cx - 0.4 * k, cy, cx + 0.4 * k, cy, g, sw)];
  return [CIRC(cx, cy, r, scPos(pos)), ...sym];
}
const shift = (ops, dy) => ops.map((o) => ({ ...o, ...("y" in o ? { y: o.y + dy } : {}), ...("y1" in o ? { y1: o.y1 + dy, y2: o.y2 + dy } : {}) }));

let _symbolImg = null; // symbol loga (assets/brand/symbol-white.svg), načte se před kreslením

// Modrá hlavička karty (obě varianty): logo, vpravo datum, pod tím čipy (téma, česká stopa). Vrací ops a výšku pásu.
// compact (karta hlasování): čipy hned pod logem v nižším pásu, aby zbylo místo na jména poslanců.
const bandHeight = (chips, compact = false) => (compact ? (chips && chips.length ? 150 : 120) : chips && chips.length ? 206 : 150);
function shareHeader(right, chips = [], compact = false) {
  const bh = bandHeight(chips, compact), x = 72 + 84 + 16, base = compact ? 72 : 98, cy = compact ? 92 : 140;
  const top = compact ? 26 : 52;
  const ops = [{ k: "band", x: 0, y: 0, w: 1080, h: bh }, LINE(0, bh, 1080, bh, SC.line, 2),
    ...(_symbolImg ? [{ k: "image", img: _symbolImg, x: 72, y: top, w: 84, h: 64, r: 0 }] : []),
    T(x, base, "EP", 34, 800, BAND.text), T(x + measureText("EP", 34, 800), base, " Watch ", 34, 400, BAND.text),
    T(x + measureText("EP", 34, 800) + measureText(" Watch ", 34, 400), base, "CZ", 34, 800, BAND.text), T(1008, base - 4, right, 24, 500, BAND.soft, "right")];
  let cx = 72;
  chips.forEach((c, i) => {
    const room = 936 - (cx - 72) - (i < chips.length - 1 ? 260 : 0);
    const s = fitText(c.label, c.strong ? 22 : 24, c.strong ? 800 : 700, room - 40), tw = measureText(s, c.strong ? 22 : 24, c.strong ? 800 : 700);
    ops.push(c.strong ? RECT(cx, cy, tw + 40, 44, 22, BAND.text) : RECT(cx, cy, tw + 40, 44, 22, BAND.chip, BAND.chipLine, 2),
      T(cx + 20, cy + 30, s, c.strong ? 22 : 24, c.strong ? 800 : 700, c.strong ? BAND.navy : BAND.text));
    cx += tw + 56;
  });
  return ops;
}

function shareFooter(H, left, url) {
  return [LINE(72, H - 128, 1008, H - 128, SC.line, 2), T(72, H - 88, fitText(left, 22, 500, 936), 22, 500, SC.muted),
    ...(url ? [T(72, H - 52, fitText(url, 24, 700, 936), 24, 700, SC.text)] : [])];
}

function barOps(x, y, w, h, counts) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let cx = x;
  const out = [];
  ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"].forEach((pos, i) => {
    const seg = Math.round((w * counts[i]) / total);
    if (counts[i] && seg) out.push(RECT(cx, y, Math.max(seg - 3, 2), h, 4, scPos(pos)));
    cx += seg;
  });
  return out;
}

const SHARE_SHORT = { FOR: "pro", AGAINST: "proti", ABSTENTION: "zdrž.", DID_NOT_VOTE: "nehl." };



// Karta hlasování (S5, zadání 20. 10. 2026 „varianta A“): název, výsledek větou, celý EP a pod tím Češi po stranách se jmény.
// Strana s 2+ poslanci = karta s logem, názvem, frakcí a souhrnem, pod tím štítky se jmény (ikona hlasu + příjmení);
// jednočlenné strany a nezávislí = jeden řádek. Barvu hlasu nese jen ikona (má i tvar), text je v barvě textu.
// Rozpočet výšky: název 2 řádky → menší písmo (do 85 %) → kompaktní jednočlenné strany → záložní tečky; nikdy se neořezává.

// Vyvážené zalomení štítků: nejmenší počet řádků, pak bez osamoceného posledního jména, pak zlomy na hranicích skupin hlasu,
// pak nejmenší rozdíl délek řádků. widths = šířky štítků v pořadí, keys = skupina (hlas) každého štítku. Vrací délky řádků.
export function balanceRows(widths, maxW, gap = 8, keys = null) {
  const n = widths.length;
  if (!n) return [];
  const rowW = (i, j) => widths.slice(i, j).reduce((a, w) => a + w, 0) + gap * (j - i - 1);
  let k = 1;
  for (let i = 0, w = 0, c = 0; i < n; i++) {   // nejmenší počet řádků hladovým plněním
    const add = (c ? gap : 0) + widths[i];
    if (c && w + add > maxW) { k += 1; w = widths[i]; c = 1; } else { w += add; c += 1; }
  }
  let best = null;
  const walk = (start, rows, acc) => {
    if (rows === 1) {
      if (rowW(start, n) > maxW && n - start > 1) return;
      const lens = [...acc, n - start];
      const ws = []; let at = 0;
      lens.forEach((l) => { ws.push(rowW(at, at + l)); at += l; });
      let breaks = 0; at = 0;
      lens.slice(0, -1).forEach((l) => { at += l; if (keys && keys[at - 1] !== keys[at]) breaks += 1; });
      // poslední kritérium: delší řádky nahoře (4 + 3, ne 3 + 4)
      const score = [lens.length > 1 && lens[lens.length - 1] === 1 ? 1 : 0, -breaks, Math.max(...ws) - Math.min(...ws), lens[0] < lens[lens.length - 1] ? 1 : 0];
      const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
      if (!best || better(score, best.score)) best = { lens, score };
      return;
    }
    for (let j = start + 1; j <= n - rows + 1; j++) {
      if (rowW(start, j) > maxW && j - start > 1) break;
      walk(j, rows - 1, [...acc, j - start]);
    }
  };
  walk(0, Math.min(k, n), []);
  return best ? best.lens : [n];
}

const VOTE_FOOT = (d, names = true) => `Zdroj: HowTheyVote.eu (ODbL) · ${names ? "strana k datu hlasování" : `jména na ${d.urlShort || "epwatch.cz"}`} · data k ${fmtDate(d.dataDay)}`;

// Horní část karty hlasování: název (tl řádků), podtitul, výsledek, celý EP. Vrací ops a výšku.
function voteTopOps(d, tl) {
  const ops = [];
  let y = 0;
  const title = wrapText(d.title, 50, 800, 936, tl);
  title.forEach((l, i) => ops.push(T(72, y + 50 + i * 56, l, 50, 800, SC.text)));
  y += title.length * 56 + 8;
  if (d.subtitle) {
    const sub = wrapText(d.subtitle, 26, 500, 936, 2);
    sub.forEach((l, i) => ops.push(T(72, y + 26 + i * 34, l, 26, 500, SC.muted)));
    y += sub.length * 34 + 6;
  }
  y += 12;
  const ok = d.result === "ADOPTED";
  const pill = (d.resultLabel || "").toUpperCase();
  const icon = ok || d.result === "REJECTED" ? 34 : 0;
  const pw = measureText(pill, 26, 800) + 44 + icon;
  const fg = ok ? SC.pillOkText : SC.pillNoText;
  ops.push(RECT(72, y, pw, 50, 25, ok ? SC.pillOk : SC.pillNo));
  if (icon) {   // ✓ / ✕ kreslené čarami (písmo ikonu nemusí mít)
    const cx = 72 + 34, cy = y + 25;
    if (ok) ops.push(LINE(cx - 9, cy, cx - 2, cy + 8, fg, 4), LINE(cx - 2, cy + 8, cx + 10, cy - 8, fg, 4));
    else ops.push(LINE(cx - 8, cy - 8, cx + 8, cy + 8, fg, 4), LINE(cx + 8, cy - 8, cx - 8, cy + 8, fg, 4));
  }
  ops.push(T(72 + icon + (pw - icon) / 2 + 2, y + 35, pill, 26, 800, fg, "center"));
  const sent = wrapText(d.sentence, 28, 600, 936 - pw - 20, 2);
  sent.forEach((l, i) => ops.push(T(72 + pw + 20, y + 35 + i * 36, l, 28, 600, SC.text)));
  y += Math.max(50, sent.length * 36) + 18;
  ops.push(T(72, y + 24, fitText(`Celý EP: ${fmtNum(d.ep[0])} pro · ${fmtNum(d.ep[1])} proti · ${fmtNum(d.ep[2])} zdržel se · ${fmtNum(d.ep[3])} nehlasovalo`, 24, 500, 936), 24, 500, SC.soft),
    ...barOps(72, y + 38, 936, 12, d.ep));
  y += 66;
  return { ops, y, titleLines: title.length, titleFull: wrapText(d.title, 50, 800, 936, 9).length };
}

// „JAK HLASOVALI ČEŠI“ a souhrnné štítky (zároveň legenda ikon): jen nenulové hlasy.
function czSummaryOps(d, y) {
  const ops = [T(72, y + 32, "JAK HLASOVALI ČEŠI", 22, 800, SC.accent)];
  const all = (d.parties || []).flatMap((g) => g.positions);
  let rx = 1008;
  [...SHARE_KEYS].reverse().forEach((k) => {
    const n = all.filter((p) => p === k).length;
    if (!n) return;
    const txt = `${n} ${SHARE_SHORT[k]}`, w = measureText(txt, 26, 700) + 62;
    ops.push(RECT(rx - w, y + 4, w, 46, 23, null, SC.chipLine, 2), ...POSDOT(rx - w + 24, y + 27, 12, k), T(rx - w + 44, y + 36, txt, 26, 700, SC.text));
    rx -= w + 12;
  });
  if (!d.parties.length) ops.push(T(1008, y + 34, "žádný poslanec v mandátu", 28, 600, SC.text, "right"));
  return { ops, y: y + 60 };
}

// Logo strany na bílém štítku (výška h, šířka podle poměru, nejvýš maxW); nezávislí neutrální silueta; bez loga tečka.
function partyMarkOps(x, y, h, it, maxW) {
  if (it.independent) {
    const w = h * 1.2;
    return { w, ops: [RECT(x, y, w, h, 8, SC.chip), CIRC(x + w / 2, y + h * 0.4, h * 0.18, SC.silhouette), RECT(x + w * 0.28, y + h * 0.62, w * 0.44, h * 0.24, h * 0.1, SC.silhouette)] };
  }
  if (it.logoImg && it.aspect) {
    const pad = Math.max(3, Math.round(h * 0.12)), lh = Math.min(h - 2 * pad, (maxW - 2 * pad) / it.aspect), lw = lh * it.aspect;
    return { w: lw + 2 * pad, ops: [RECT(x, y, lw + 2 * pad, h, 8, "#FFFFFF", SC.chipLine, 1.5), { k: "image", img: it.logoImg, x: x + pad, y: y + (h - lh) / 2, w: lw, h: lh, r: 0 }] };
  }
  return { w: h * 0.6, ops: [CIRC(x + h * 0.3, y + h / 2, h * 0.22, it.color || SC.muted)] };
}

const partySummaryText = (it) => SHARE_KEYS.map((k) => [it.positions.filter((p) => p === k).length, SHARE_SHORT[k]]).filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(" · ");

// Rozměry jedné karty strany při šířce W a měřítku s. Vrací {h, draw(x, y)}.
function partyCardLayout(it, W, s, compact) {
  const PAD = Math.round(12 * s), FS = Math.round(25 * s), CH = Math.round(40 * s), CG = Math.round(8 * s), R = Math.round(11 * s);
  const chipW = (m) => Math.round(10 * s) + 2 * R + Math.round(8 * s) + measureText(m.surname, FS, 600) + Math.round(14 * s);
  const chip = (m, x, y) => [RECT(x, y, chipW(m), CH, CH / 2, null, SC.chipLine, 2), ...POSDOT(x + Math.round(10 * s) + R, y + CH / 2, R, m.position),
    { ...T(x + Math.round(10 * s) + 2 * R + Math.round(8 * s), y + CH / 2 + FS * 0.36, m.surname, FS, 600, SC.text), mid: m.id }];
  const inner = W - 2 * PAD, LH = Math.round(36 * s), NS = Math.round(28 * s), GS = Math.round(19 * s);
  const split = new Set(it.positions).size > 1;
  if (it.members.length === 1) {
    const m = it.members[0], cw = chipW(m);
    const h = 2 * PAD + Math.max(compact ? LH : Math.round(50 * s), CH);
    return { h, fits: true, draw: (x, y) => {
      const mark = partyMarkOps(x + PAD, y + (h - LH) / 2, LH, it, Math.round(110 * s));
      const tx = x + PAD + mark.w + Math.round(12 * s), room = W - (tx - x) - cw - PAD - Math.round(10 * s);
      const out = [RECT(x, y, W, h, 18, SC.tile, SC.tileLine, 2), ...mark.ops];
      if (compact) out.push(T(tx, y + h / 2 + NS * 0.36, fitText(it.label, NS, 800, room), NS, 800, SC.text));
      else out.push(T(tx, y + h / 2 - 2, fitText(it.label, NS, 800, room), NS, 800, SC.text), T(tx, y + h / 2 + GS + 2, fitText(it.group, GS, 500, room), GS, 500, SC.soft));
      return [...out, ...chip(m, x + W - PAD - cw, y + (h - CH) / 2)];
    } };
  }
  const widths = it.members.map(chipW);
  const lens = balanceRows(widths, inner, CG, it.positions);
  const headH = Math.round(52 * s);
  const h = PAD + headH + Math.round(8 * s) + lens.length * CH + (lens.length - 1) * CG + PAD;
  return { h, rows: lens.length, draw: (x, y) => {
    const mark = partyMarkOps(x + PAD, y + PAD + (headH - LH) / 2 - 4, LH, it, Math.round(110 * s));
    const summ = partySummaryText(it), sw = measureText(summ, Math.round(22 * s), split ? 800 : 500);
    const tx = x + PAD + mark.w + Math.round(12 * s), room = W - (tx - x) - sw - PAD - Math.round(12 * s);
    const out = [RECT(x, y, W, h, 18, SC.tile, SC.tileLine, 2), ...mark.ops,
      T(tx, y + PAD + headH / 2 - 2, fitText(it.label, NS, 800, room), NS, 800, SC.text),
      T(tx, y + PAD + headH / 2 + GS + 2, fitText(it.group, GS, 500, room), GS, 500, SC.soft),
      T(x + W - PAD, y + PAD + headH / 2 + 6, summ, Math.round(22 * s), split ? 800 : 500, split ? SC.text : SC.soft, "right")];
    let i = 0, ry = y + PAD + headH + Math.round(8 * s);
    lens.forEach((l) => {
      let cx = x + PAD;
      it.members.slice(i, i + l).forEach((m) => { out.push(...chip(m, cx, ry)); cx += chipW(m) + CG; });
      i += l; ry += CH + CG;
    });
    return out;
  } };
}

// Karty stran ve dvou sloupcích (story v jednom): strana, které by v půlce šířky vyšly 3+ řádky, dostane celou šířku;
// ostatní jdou do kratšího sloupce. Vrací {ops, h}.
function partyCardsOps(items, y0, s, compact, story) {
  const GX = 18, GY = Math.round((story ? 18 : 12) * s), half = (936 - GX) / 2;
  const ops = [];
  const col = [0, 0];
  items.forEach((it) => {
    let L = story ? partyCardLayout(it, 936, s, compact) : partyCardLayout(it, half, s, compact);
    let full = story;
    if (!story && L.rows >= 3) { L = partyCardLayout(it, 936, s, compact); full = true; }
    if (full) {
      const y = Math.max(...col);
      ops.push(...L.draw(72, y0 + y));
      col[0] = col[1] = y + L.h + GY;
    } else {
      const c = col[0] <= col[1] ? 0 : 1;
      ops.push(...L.draw(72 + c * (half + GX), y0 + col[c]));
      col[c] += L.h + GY;
    }
  });
  return { ops, h: Math.max(...col, GY) - GY };
}

// Záložní varianta (když se jména nevejdou): dnešní řádky stran s tečkami, nic se neschová.
function partyDotsOps(parties, y, story) {
  const ops = [];
  const cols = story ? 1 : 2, colW = cols === 1 ? 936 : 448, perCol = Math.ceil(parties.length / cols);
  const rowH = story ? 96 : 86;
  parties.forEach((g, i) => {
    const col = cols === 1 ? 0 : Math.floor(i / perCol), row = cols === 1 ? i : i % perCol;
    const x0 = 72 + col * (colW + 40), ry = y + row * rowH;
    const right = partySummaryText(g), rw = measureText(right, 22, 500);
    const label = fitText(g.label, 28, 800, colW - rw - 24), lw = measureText(label, 28, 800);
    const groups = fitText(g.group || (g.groups || []).join(" · "), 20, 500, colW - rw - lw - 40);
    ops.push(T(x0, ry + 36, label, 28, 800, SC.text), ...(groups ? [T(x0 + lw + 12, ry + 36, groups, 20, 500, SC.muted)] : []),
      T(x0 + colW, ry + 36, right, 22, 500, SC.soft, "right"));
    const r = 13, maxDots = Math.max(Math.floor(colW / (2 * r + 6)), 1);
    // každý poslanec jednou tečkou (mid = id poslance kvůli kontrole, že nikdo nechybí)
    (g.members || g.positions.map((position) => ({ position }))).slice(0, maxDots).forEach((m, j) => {
      const dot = POSDOT(x0 + r + j * (2 * r + 6), ry + 62, r, m.position);
      dot[0] = { ...dot[0], mid: m.id };
      ops.push(...dot);
    });
    ops.push(LINE(x0, ry + rowH - 6, x0 + colW, ry + rowH - 6, SC.rowLine, 2));
  });
  return { ops, h: perCol * rowH + 6 };
}

export function voteCardOps(d, f) {
  const H = f.h, story = f.h > 1500;
  const chips = [...(d.topic ? [{ label: d.topic }] : []), ...(d.trace ? [{ label: "ČESKÁ STOPA", strong: true }] : [])];
  const top = bandHeight(chips, true) + 28, limit = H - 150 - 16;
  const parties = d.parties || [];
  const build = (tl, s, compact, dots) => {
    const head = voteTopOps(d, tl);
    const sum = czSummaryOps(d, head.y);
    const body = dots ? partyDotsOps(parties, sum.y, story) : partyCardsOps(parties, sum.y, s, compact, story);
    return { ops: [...head.ops, ...sum.ops, ...body.ops], y: sum.y + body.h, head };
  };
  let pick = null;
  // data bez jmen (starší kontext sdílení, jen tečky) rovnou do záložní varianty
  const withNames = parties.every((it) => Array.isArray(it.members));
  outer: for (const compact of withNames ? [false, true] : []) {
    for (const s of [1, 0.95, 0.9, 0.85]) {
      const r = build(2, s, compact, false);
      if (top + r.y <= limit) {
        pick = r;
        if (r.head.titleFull > 2) { const r3 = build(3, s, compact, false); if (top + r3.y <= limit) pick = r3; }
        break outer;
      }
    }
  }
  const names = Boolean(pick);
  if (!pick) pick = build(2, 1, false, true);
  return [...shareHeader(`${fmtDate(d.date)} · ${d.kindLabel}`, chips, true), ...shift(pick.ops, Math.round(top + Math.max((H - 150 - top - pick.y) / 2, 0))),
    ...shareFooter(H, VOTE_FOOT(d, names), d.urlShort)];
}

// --- detail karty hlasování (2. a 3. obrázek, zadání 20. 10. 2026) ---------------------------------------
// 2/3 Frakce v celém EP (počty z HowTheyVote) a Češi, kteří hlasovali jinak než většina své frakce; 3/3 kontext:
// česká stopa, AI shrnutí (jen když existuje, s popiskem), stav procedury. Chybějící blok se vynechá, nic se nedopočítává.

export const voteHasContext = (det) => Boolean(det && ((det.trace || []).length || det.summary || det.procedure));

function voteMiniHead(d, n, total) {
  const tl = wrapText(d.title, 40, 800, 820, 2);
  return [...tl.map((l, i) => T(72, 220 + i * 46, l, 40, 800, SC.text)), T(1008, 220, `${n} / ${total}`, 30, 500, SC.muted, "right"),
    T(72, 220 + tl.length * 46 + 6, fitText(`${fmtDate(d.date)} · ${d.resultLabel || ""}`, 24, 600, 936), 24, 600, SC.soft)];
}
const POS_VERB = { FOR: "pro", AGAINST: "proti", ABSTENTION: "zdržet se" };
const voteSlides = (d) => (voteHasContext(d.detail) ? 3 : 2);

function voteGroupsOps(d, f) {
  const det = d.detail || {}, groups = det.groups || [], div = det.diverged || [];
  const ops = [...voteMiniHead(d, 2, voteSlides(d))];
  let y = 384;
  ops.push(sectionTitle(y, "JAK HLASOVALY FRAKCE V CELÉM EP"));
  y += 22;
  const bottom = f.h - 170;
  const divH = div.length ? 70 + Math.min(div.length, 8) * 44 : 110;
  const rh = Math.min(66, Math.floor((bottom - y - divH) / Math.max(groups.length, 1)));
  groups.forEach((g, i) => {
    const ry = y + i * rh;
    ops.push(T(72, ry + rh * 0.55, fitText(g.label, 26, 700, 190), 26, 700, SC.text));
    if (g.cz) ops.push(T(72, ry + rh * 0.55 + 22, `Češi: ${fmtNum(g.cz)}`, 18, 600, SC.muted));
    ops.push(...barOps(280, ry + rh * 0.5 - 13, 520, 22, g.counts));
    ops.push(T(1008, ry + rh * 0.5 + 8, `${fmtNum(g.counts[0])} : ${fmtNum(g.counts[1])}`, 24, 700, SC.text, "right"));
    if (i < groups.length - 1) ops.push(LINE(72, ry + rh - 2, 1008, ry + rh - 2, SC.rowLine, 1));
  });
  y += groups.length * rh + 10;
  ops.push(T(1008, y + 8, "pro : proti · pruh = pro / proti / zdržel se / nehlasoval", 18, 500, SC.muted, "right"));
  y += 50;
  ops.push(sectionTitle(y, "ČEŠI, KTEŘÍ HLASOVALI JINAK NEŽ VĚTŠINA FRAKCE"));
  if (!div.length) {
    wrapText("Všichni čeští poslanci, kteří hlasovali, hlasovali jako většina své frakce (nezařazení a nehlasující se nepočítají).", 26, 500, 936, 3)
      .forEach((l, i) => ops.push(T(72, y + 50 + i * 34, l, 26, 500, SC.soft)));
  } else {
    const rows = div.length > 8 ? Math.ceil(div.length / 2) : div.length, cols = div.length > 8 ? 2 : 1, cw = cols === 1 ? 936 : 458;
    const rh2 = Math.min(44, Math.floor((bottom - y - 30) / rows));
    div.forEach((x, i) => {
      const cx = 72 + Math.floor(i / rows) * (cw + 20), cy = y + 30 + (i % rows) * rh2;
      const right = `${x.group}: většina ${POS_VERB[x.majority] || ""}`;
      ops.push(...POSDOT(cx + 12, cy + rh2 / 2, 12, x.position),
        T(cx + 34, cy + rh2 / 2 + 9, fitText(`${x.name}${x.party ? ` (${x.party})` : ""}`, 24, 700, cw - 34 - measureText(right, 20, 500) - 16), 24, 700, SC.text),
        T(cx + cw, cy + rh2 / 2 + 8, right, 20, 500, SC.muted, "right"));
    });
  }
  return [...shareHeader(`${fmtDate(d.date)} · ${d.kindLabel}`), ...ops,
    ...shareFooter(f.h, `Zdroj: HowTheyVote.eu (ODbL) · frakce k datu hlasování · data k ${fmtDate(d.dataDay)}`, d.urlShort)];
}

// 3/3 Kontext: o čem se hlasovalo (shrnutí AI), česká stopa a podle druhu procedury buď svislá časová osa (zákony a postupy
// s událostmi), nebo „CO TO ZNAMENÁ“ (usnesení, zprávy z vlastního podnětu a jednokrokové postupy; texty schválené 25. 10. 2026,
// PROCESS_EFFECT_CS v procedure_pages.py). Rozložení shora s pevnými mezerami; když se obsah nevejde, zkrátí se shrnutí, stopa a osa.
function voteContextOps(d, f) {
  const det = d.detail || {};
  const top = 372, bottom = f.h - 168;
  const layout = (dense) => {
    const ops = [];
    let y = top;
    const sumSize = dense ? 32 : 34, sumLines = dense ? 5 : 7, gap = dense ? 40 : 56;
    if (det.summary) {
      ops.push(sectionTitle(y, "O ČEM SE HLASOVALO"));
      const tl = wrapText(det.summary.text, sumSize, 600, 936, sumLines);
      tl.forEach((l, i) => ops.push(T(72, y + 52 + i * (sumSize + 12), l, sumSize, 600, SC.text)));
      y += 52 + tl.length * (sumSize + 12) - 8;
      wrapText(`Shrnutí napsala AI (Claude)${det.summary.source === "adopted_text" ? " z přijatého textu" : ""}, bez čísel a hodnocení. Plné znění na webu EP.`, 20, 500, 936, 2)
        .forEach((l, i) => ops.push(T(72, y + 26 + i * 26, l, 20, 500, SC.muted)));
      y += 60 + gap;
    }
    const trace = (det.trace || []).slice(0, dense ? 3 : 6);
    if (trace.length) {
      ops.push(sectionTitle(y, "ČESKÁ STOPA"));
      trace.forEach((t, i) => ops.push(T(72, y + 50 + i * 42, fitText(t.name, 30, 700, 560), 30, 700, SC.text), T(1008, y + 50 + i * 42, fitText(t.role, 24, 500, 360), 24, 500, SC.soft, "right")));
      y += 50 + trace.length * 42 + gap - 20;
    }
    const p = det.procedure;
    if (p && p.mode === "timeline" && (p.steps || []).length) {
      ops.push(sectionTitle(y, "PŘÍBĚH ZÁKONA"), T(72, y + 46, fitText([p.label, p.kind].filter(Boolean).join(" · "), 26, 600, 936), 26, 600, SC.soft));
      let steps = p.steps;
      if (dense && steps.length > 4) steps = [steps[0], { label: "…", state: "gap" }, ...steps.slice(-2)];
      const sy = y + 96, rh = 58;
      steps.forEach((st, i) => {
        const cy = sy + i * rh;
        if (i < steps.length - 1) ops.push(LINE(88, cy, 88, cy + rh, st.state === "next" ? SC.line : SC.soft, 4));
        if (st.state === "gap") { ops.push(T(120, cy + 10, "…", 28, 700, SC.muted)); return; }
        if (st.state === "now") ops.push(CIRC(88, cy, 14, SC.accent), T(1008, cy + 10, "teď", 24, 800, SC.accent, "right"));
        else if (st.state === "done") ops.push(CIRC(88, cy, 10, SC.soft));
        else ops.push(CIRC(88, cy, 10, SC.bg0, SC.line, 3));
        const col = st.state === "next" ? SC.muted : SC.text, w = st.state === "now" ? 640 : 700;
        ops.push(T(120, cy + 10, fitText(st.label, 28, st.state === "now" ? 800 : 600, w), 28, st.state === "now" ? 800 : 600, col));
        if (st.date) ops.push(T(st.state === "now" ? 940 : 1008, cy + 10, st.date, 24, 500, SC.muted, "right"));
      });
      y = sy + (steps.length - 1) * rh + 30;
      if (p.next) { wrapText(p.next, 26, 600, 936, 2).forEach((l, i) => ops.push(T(72, y + 34 + i * 34, l, 26, 600, SC.soft))); y += 34 * Math.min(2, wrapText(p.next, 26, 600, 936, 2).length) + 10; }
    } else if (p) {
      ops.push(sectionTitle(y, "CO TO ZNAMENÁ"));
      const kind = p.kind ? p.kind.charAt(0).toUpperCase() + p.kind.slice(1) : "";
      if (kind) ops.push(T(72, y + 52, fitText(`${kind}${p.label ? ` · ${p.label}` : ""}`, 30, 800, 936), 30, 800, SC.text));
      let ey = y + (kind ? 100 : 52);
      if (p.effect) { const el = wrapText(p.effect, 30, 600, 936, 3); el.forEach((l, i) => ops.push(T(72, ey + i * 42, l, 30, 600, SC.soft))); ey += el.length * 42; }
      if (!p.effect && p.now) { ops.push(T(72, ey, fitText(`Naposledy: ${p.now}`, 26, 500, 936), 26, 500, SC.soft)); ey += 42; }
      const signers = p.signers || [];
      if (signers.length) {
        const txt = `Čeští spolupodepisující návrhu: ${signers.map((x) => `${x.name}${x.group ? ` (${x.group})` : ""}`).join(", ")}`;
        const sl = wrapText(txt, 24, 500, 936, dense ? 2 : 3);
        sl.forEach((l, i) => ops.push(T(72, ey + 26 + i * 32, l, 24, 500, SC.muted)));
        ey += 26 + sl.length * 32;
      }
      y = ey + 10;
    }
    return { ops, y };
  };
  let out = layout(false);
  if (out.y > bottom) out = layout(true);
  const src = ["EP Open Data (CC BY 4.0)", ...(det.summary ? ["shrnutí AI"] : [])].join(", ");
  return [...shareHeader(`${fmtDate(d.date)} · ${d.kindLabel}`), ...voteMiniHead(d, 3, 3), ...out.ops,
    ...shareFooter(f.h, `Zdroj: ${src} · data k ${fmtDate(d.dataDay)}`, d.urlShort)];
}

// --- karta poslance (S4): základní karta + detail (2. a 3. obrázek carouselu) ----------------------------
// Bez pořadí, bez hodnocení barvou, bez log: frakce a strana jen jako tečka a zkratka. Chybějící hodnota se vynechá.

function chipOps(x, y, label, color) {
  const w = measureText(label, 28, 600) + 62;
  return { w, ops: [RECT(x, y, w, 52, 26, SC.chip), CIRC(x + 28, y + 26, 8, color || SC.muted), T(x + 46, y + 36, label, 28, 600, SC.text)] };
}

function sectionTitle(y, s) { return T(72, y, s, 26, 800, SC.accent); }

// Metrika s posuvníkem 60–100 % (stejná osa jako benchRow na webu), mediánem a „x z y“.
function metricOps(x, y, w, label, pair, median, medLabel) {
  const share = pair && pair[1] ? pair[0] / pair[1] : null;
  const lo = 0.6, pos = (v) => x + w * Math.min(Math.max((v - lo) / (1 - lo), 0), 1);
  const ops = [T(x, y + 30, fitText(label, 30, 600, w), 30, 600, SC.soft), T(x, y + 120, share === null ? "–" : fmtPct(share), 90, 800, SC.text),
    RECT(x, y + 152, w, 10, 5, SC.track)];
  if (share !== null) ops.push(CIRC(pos(share), y + 157, 14, SC.text));
  if (median != null) ops.push(LINE(pos(median), y + 138, pos(median), y + 176, SC.accent, 6), T(x, y + 212, `${medLabel} ${fmtPct(median)}`, 28, 700, SC.accent));
  if (pair && pair[1]) ops.push(T(x, y + (median != null ? 248 : 212), `${fmtNum(pair[0])} z ${fmtNum(pair[1])} hlasování`, 24, 500, SC.muted));
  return ops;
}

// 1/3 Základní karta: portrét, jméno, frakce · strana, mandát, dvě čísla s mediánem.
export function mepBasicOps(d, f) {
  const H = f.h, story = f.h > 1500;
  const ops = [];
  const pw = 380, ph = 475, y0 = 0;
  const neutral = d.avatar === "neutral";
  if (neutral) ops.push(...neutralAvatarOps(72, y0, pw, ph, 26));
  else if (d.photo) ops.push({ k: "image", img: d.photo, x: 72, y: y0, w: pw, h: ph, r: 26 }, RECT(70, y0 - 2, pw + 4, ph + 4, 28, null, SC.gold, 4),
    T(72, y0 + ph + 32, "© European Union – Source: EP", 20, 500, SC.muted));
  const nx = d.photo || neutral ? 72 + pw + 50 : 72, nw = 1008 - nx;
  const nameLines = wrapText(d.name, 72, 800, nw, 3);
  // Frakce a strana v jedné řadě: oficiální logo na bílé dlaždici (čitelné i na tmavé kartě, logo se neupravuje), bez loga
  // štítek s tečkou. Loga mají stejnou plochu (široké je nižší, čtvercové vyšší), aby žádné nepřebilo druhé; když se řada
  // nevejde, zmenší se všechna loga stejným poměrem.
  const TILE_H = 80, PAD = 16, GAP = 14, AREA = 4800, MAX_H = 60;
  const chips = (d.chips || []).map((c) => {
    if (!c.logoImg) return { c, w: measureText(c.label, 28, 600) + 62 };
    const h = Math.min(MAX_H, Math.sqrt(AREA / c.aspect));
    return { c, lw: h * c.aspect, lh: h };
  });
  const fixed = chips.reduce((a, x) => a + (x.lw ? 2 * PAD : x.w), 0) + GAP * Math.max(chips.length - 1, 0);
  const logos = chips.reduce((a, x) => a + (x.lw || 0), 0);
  const k = logos ? Math.min(1, (nw - fixed) / logos) : 1;
  let cx = nx;
  const chipRows = chips.map((x) => {
    const w = x.lw ? x.lw * k + 2 * PAD : x.w;
    const r = { ...x, x: cx, w, lw: (x.lw || 0) * k, lh: (x.lh || 0) * k };
    cx += w + GAP;
    return r;
  });
  const rowH = chips.some((x) => x.lw) ? TILE_H : 52;
  const chipH = chipRows.length ? rowH : 0;
  const mand = d.mandate ? wrapText(d.mandate, 28, 500, nw, 2) : [];
  const blockH = nameLines.length * 80 + 24 + chipH + (mand.length ? 20 + mand.length * 38 : 0);
  let by = y0 + Math.max((ph - blockH) / 2, 0);
  nameLines.forEach((l, i) => ops.push(T(nx, by + 62 + i * 80, l, 72, 800, SC.text)));
  by += nameLines.length * 80 + 24;
  chipRows.forEach(({ c, x, w, lw, lh }) => {
    if (lw) ops.push(RECT(x, by, w, TILE_H, 16, "#FFFFFF", SC.chipLine, 2), { k: "image", img: c.logoImg, x: x + PAD, y: by + (TILE_H - lh) / 2, w: lw, h: lh, r: 0 });
    else ops.push(...chipOps(x, by + (rowH - 52) / 2, c.label, c.color).ops);
  });
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
  ops.push(T(nx, 238, fitText(d.name, 52, 800, 700), 52, 800, SC.text),
    T(nx, 280, fitText((d.chips || []).map((c) => c.label).join(" · "), 28, 500, 700), 28, 500, SC.soft), T(1008, 252, `${n} / 3`, 30, 500, SC.muted, "right"));
  return ops;
}

const SLIDE_FOOT = { 2: "Zdroj: HowTheyVote.eu (ODbL) · výpočet EP Watch CZ · bez pořadí a hodnocení", 3: "Zdroj: EP Open Data (CC BY 4.0) · počty, ne hodnocení kvality práce" };

function tileOps(x, y, w, h, label, value, sub) {
  const ops = [RECT(x, y, w, h, 28, SC.tile, SC.tileLine, 2), T(x + 28, y + 44, fitText(label, 26, 600, w - 56), 26, 600, SC.soft), T(x + 28, y + 118, value, 68, 800, SC.text)];
  if (sub) wrapText(sub, 22, 500, w - 56, 2).forEach((l, i) => ops.push(T(x + 28, y + 156 + i * 28, l, 22, 500, SC.muted)));
  return ops;
}

// Tvar podle pohlaví z EP (d.female: true/false); když EP pohlaví neuvádí, obě podoby („hlasoval/a“).
const byG = (d, male, female, both) => (d.female ? female : d.female === false ? male : both);

// 2/3 Jak hlasuje: rozložení hlasů, soulad s výsledkem, účast u závěrečných, s kým hlasuje nejčastěji stejně.
function mepVotingOps(d, f) {
  const ops = [...mepMiniHead(d, 2)];
  let y = 384;
  const pos = d.positions;
  if (pos) {
    const total = SHARE_KEYS.reduce((n, k) => n + (pos[k] || 0), 0);
    ops.push(sectionTitle(y, `${byG(d, "JAK HLASOVAL", "JAK HLASOVALA", "JAK HLASOVAL/A")} · ${fmtNum(total)} HLASOVÁNÍ`), ...barOps(72, y + 28, 936, 34, SHARE_KEYS.map((k) => pos[k] || 0)));
    let lx = 72;
    const lab = { FOR: "pro", AGAINST: "proti", ABSTENTION: byG(d, "zdržel se", "zdržela se", "zdržel/a se"), DID_NOT_VOTE: byG(d, "nehlasoval", "nehlasovala", "nehlasoval/a") };
    SHARE_KEYS.forEach((k) => {
      const t = `${lab[k]} ${fmtNum(pos[k] || 0)}`;
      ops.push(...POSDOT(lx + 12, y + 104, 12, k), T(lx + 34, y + 114, t, 30, 600, SC.text));
      lx += measureText(t, 30, 600) + 48;
    });
    y += 200;
  }
  const tiles = [];
  if (d.outcome && d.outcome[1]) tiles.push([byG(d, "Hlasoval jako většina EP", "Hlasovala jako většina EP", "Hlasoval/a jako většina EP"), fmtPct(d.outcome[0] / d.outcome[1]),
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
      ops.push(T(72, ry, fitText(`${p.name}${p.party ? ` · ${p.party}` : ""}`, 32, 600, 780), 32, 600, SC.text), T(1008, ry, fmtPct(p.share), 32, 700, SC.text, "right"),
        LINE(72, ry + 20, 1008, ry + 20, SC.line, 2));
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
    [[byG(d, "Vedl zprávy", "Vedla zprávy", "Vedl/a zprávy"), w.leadReports, adoptedNote(w.leadReports, w.leadAdopted)], ["Stanoviska výborů", w.leadOpinions, d.female ? "jako zpravodajka" : d.female === false ? "jako zpravodaj" : "jako zpravodaj/ka"],
      ["Stínové zprávy", w.shadowReports, `vyjednáv${d.female ? "ala" : d.female === false ? "al" : "al/a"} za frakci`]].forEach((t, i) => ops.push(...tileOps(72 + i * 320, y + 28, 296, 210, t[0], fmtNum(t[1]), t[2])));
    y += 300;
  }
  const pl = [];
  if (d.speeches != null) pl.push(["Projevy", fmtNum(d.speeches), d.speechesMinutes != null ? `celkem ${fmtNum(Math.round(d.speechesMinutes))} min` : ""]);
  if (d.questions != null) pl.push(["Otázky Komisi", fmtNum(d.questions), d.questionsAnswered != null ? (d.questionsAnswered === d.questions && d.questions ? "všechny zodpovězené" : `zodpovězeno ${fmtNum(d.questionsAnswered)}`) : ""]);
  if (d.presence && d.presence.days) pl.push(["Docházka", fmtPct(d.presence.present / d.presence.days), `${fmtNum(d.presence.present)} ze ${fmtNum(d.presence.days)} dnů (EP)`]);
  if (pl.length) {
    ops.push(sectionTitle(y, "V PLÉNU"));
    pl.forEach((t, i) => ops.push(...tileOps(72 + i * 320, y + 28, 296, 210, ...t)));
    y += 300;
  }
  if (d.committees && (d.committees.members.length || d.committees.substitutes.length)) {
    ops.push(sectionTitle(y, byG(d, "VÝBORY (ČLEN)", "VÝBORY (ČLENKA)", "VÝBORY (ČLEN/KA)")));
    let cy = y + 56;
    if (d.committees.members.length) {
      wrapText(committeeLine(d.committees.members), 28, 500, 936, 2).forEach((l, i) => ops.push(T(72, cy + i * 38, l, 28, 500, SC.soft)));
      cy += 38 * Math.min(2, Math.ceil(measureText(committeeLine(d.committees.members), 28, 500) / 936)) + 8;
    }
    if (d.committees.substitutes.length) ops.push(T(72, cy, fitText(`${byG(d, "náhradník", "náhradnice", "náhradník/ice")}: ${d.committees.substitutes.join(", ")}`, 28, 500, 936), 28, 500, SC.muted));
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
export function metricCardOps(d, f) {
  const H = f.h, story = H > 1500;
  const ops = [];
  let y = 0;
  wrapText(d.context || "", 30, 700, 936, 2).forEach((l, i) => ops.push(T(72, y + 30 + i * 40, l, 30, 700, SC.accent)));
  y += d.context ? Math.min(2, wrapText(d.context, 30, 700, 936, 2).length) * 40 + 30 : 0;
  const lab = wrapText(d.label, 50, 800, 936, 2);
  lab.forEach((l, i) => ops.push(T(72, y + 50 + i * 60, l, 50, 800, SC.text)));
  y += lab.length * 60 + 20;
  const share = d.pair && d.pair[1] ? d.pair[0] / d.pair[1] : null;
  ops.push(T(60, y + 220, share === null ? "–" : fmtPct(share), 230, 800, SC.text));
  y += 270;
  if (d.median != null && share !== null) {
    const lo = 0.6, w = 936, pos = (v) => 72 + w * Math.min(Math.max((v - lo) / (1 - lo), 0), 1);
    ops.push(RECT(72, y + 14, w, 12, 6, SC.track), CIRC(pos(share), y + 20, 18, SC.text),
      LINE(pos(d.median), y - 4, pos(d.median), y + 44, SC.accent, 7),
      T(72, y + 92, `${d.medLabel} ${fmtPct(d.median)}`, 32, 700, SC.accent), T(1008, y + 92, "osa 60–100 %", 22, 500, SC.muted, "right"));
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
export const splitRowsFor = (f) => (f.h > 1500 ? 7 : 5);

// Karta přehledu: titulek, věta o výběru, prvních N řádků ve stejném pořadí jako na stránce.
export function splitCardOps(d, f) {
  const H = f.h, n = Math.min(splitRowsFor(f), d.rows.length);
  const ops = [];
  let y = 0;
  const tl = wrapText(d.title, 64, 800, 936, 2);
  tl.forEach((l, i) => ops.push(T(72, y + 64 + i * 74, l, 64, 800, SC.text)));
  y += tl.length * 74 + 24;
  const lead = wrapText(`${d.lead ? `${d.lead} ` : ""}Na kartě ${n === d.rows.length && n === d.total ? `všech ${n}` : `prvních ${n} z ${fmtNum(d.total ?? d.rows.length)}`}, pořadí jako na webu${d.order ? ` (${d.order})` : ""}.`, 28, 500, 936, 4);
  lead.forEach((l, i) => ops.push(T(72, y + 28 + i * 38, l, 28, 500, SC.soft)));
  y += lead.length * 38 + 26;
  ops.push(LINE(72, y, 1008, y, SC.track, 2));
  d.rows.slice(0, n).forEach((r) => {
    const sw = Math.max(measureText(r.score, 56, 800), measureText(r.scoreSub || "", 18, 500)) + 24;
    ops.push(T(72, y + 40, fitText(r.meta, 20, 600, 936 - sw), 20, 600, SC.muted));
    const tt = wrapText(r.title, 28, 700, 936 - sw, 2);
    tt.forEach((l, i) => ops.push(T(72, y + 76 + i * 36, l, 28, 700, SC.text)));
    ops.push(T(1008, y + 82, r.score, 56, 800, SC.text, "right"));
    if (r.scoreSub) ops.push(T(1008, y + 108, r.scoreSub, 18, 500, SC.muted, "right"));
    const rh = Math.max(76 + (tt.length - 1) * 36 + 30, 124);
    y += rh;
    ops.push(LINE(72, y, 1008, y, SC.rowLine, 2));
  });
  const rest = (d.total ?? d.rows.length) - n;
  if (rest > 0) { ops.push(T(72, y + 44, `… a dalších ${fmtNum(rest)} na webu`, 26, 600, SC.soft)); y += 64; }
  return [...shareHeader(d.dateLabel || `data k ${fmtDate(d.dataDay)}`), ...centered(ops, y, H), ...shareFooter(H, d.source || `Zdroj: HowTheyVote.eu (ODbL) · data k ${fmtDate(d.dataDay)}`, d.urlShort)];
}

// --- karta strany a frakce (party, group): základ + detail 2/3 a 3/3 (zadání 20. 10. 2026) -----------------------
// Logo jen z oficiálního souboru, vždy na bílém štítku (vnitřní okraj 12 % výšky loga, poměr stran z logo_aspect), nepřebarvené
// a neořezané; bez loga barevný štítek se zkratkou. Chybějící hodnota = dlaždice se vynechá, nic se nedopočítává.

const ENTITY_FOOT = (d, label = "data", day = d.dataDay) => `Zdroj: HowTheyVote.eu, EP Open Data · ${label} k ${fmtDate(day)} · strana k datu hlasování`;

// Logo na bílém štítku (výška loga h); bez obrázku štítek se zkratkou a tečkou v barvě. Vrací šířku, výšku a ops.
function logoMarkOps(x, y, h, e, label) {
  if (e && e.logoImg && e.aspect) {
    const pad = Math.round(h * 0.12), w = h * e.aspect;
    return { w: w + 2 * pad, h: h + 2 * pad, ops: [RECT(x, y, w + 2 * pad, h + 2 * pad, Math.min(16, pad + 6), "#FFFFFF", SC.chipLine, 2),
      { k: "image", img: e.logoImg, x: x + pad, y: y + pad, w, h, r: 0 }] };
  }
  const c = chipOps(x, y, label || "", e && e.color);
  return { w: c.w, h: 52, ops: c.ops };
}

// Logo omezené šířkou: když by široké logo přeteklo, zmenší se (poměr stran zůstane).
function fitLogoH(e, h, maxW) { return e && e.logoImg && e.aspect ? Math.min(h, (maxW - 2 * Math.round(h * 0.12)) / e.aspect) : h; }

// Hlavička 2. a 3. obrázku: malé logo na bílém štítku, název a „2 / 3“ (jako mepMiniHead).
function entityMiniHead(d, n) {
  const lh = fitLogoH(d, 56, 220);
  const mark = logoMarkOps(72, 190, lh, d, d.short);
  const nx = 72 + mark.w + 24;
  return [...mark.ops, T(nx, 238, fitText(d.name, 44, 800, 1008 - nx - 90), 44, 800, SC.text),
    T(nx, 278, fitText(d.headSub || "", 26, 500, 1008 - nx - 90), 26, 500, SC.soft), T(1008, 238, `${n} / 3`, 30, 500, SC.muted, "right")];
}

function bigTilesOps(tiles, y, story) {
  const ops = [];
  const h = story ? 230 : 176;
  tiles.forEach((t, i) => {
    const ty = y + i * (h + 18);
    ops.push(RECT(72, ty, 936, h, 28, SC.tile, SC.tileLine, 2), T(108, ty + 54, fitText(t.label, 30, 700, 560), 30, 700, SC.soft),
      T(1008 - 36, ty + h / 2 + 34, fmtPct(t.pair[0] / t.pair[1]), 96, 800, SC.text, "right"),
      T(108, ty + 98, `${fmtNum(t.pair[0])} z ${fmtNum(t.pair[1])}`, 26, 500, SC.muted));
    if (t.note) ops.push(T(108, ty + 138, fitText(t.note, 22, 500, 560), 22, 500, SC.muted));
  });
  return { ops, h: tiles.length * (h + 18) };
}

// 1/3 strana: logo strany vlevo nahoře, vedle menší logo frakce (aktuální první), název, počet poslanců, tři dlaždice.
export function partyCardOps(d, f) {
  const H = f.h, story = H > 1500;
  const ops = [];
  let y = 0;
  if (d.logoImg || d.groups?.length) {
    // logo strany větší, logo frakce menší; obě podle plochy, aby široké logo nepřerostlo vysoké
    const byArea = (e, maxH, area) => (e && e.aspect ? Math.min(maxH, Math.sqrt(area / e.aspect)) : maxH);
    const ph = fitLogoH(d, byArea(d, 104, 17000), 520), mark = logoMarkOps(72, y, ph, d, d.short);
    ops.push(...mark.ops);
    let gx = 72 + mark.w + 28;
    (d.groups || []).forEach((g) => {
      const gh = fitLogoH(g, byArea(g, 64, 7000), 1008 - gx);
      if (gx + (g.logoImg ? gh * g.aspect + 2 * Math.round(gh * 0.12) : measureText(g.label, 28, 600) + 62) > 1008) return;
      const gm = logoMarkOps(gx, y + (mark.h - (g.logoImg ? gh + 2 * Math.round(gh * 0.12) : 52)) / 2, gh, g, g.label);
      ops.push(...gm.ops);
      gx += gm.w + 16;
    });
    y += mark.h + 30;
  }
  const nm = wrapText(d.name, 62, 800, 936, 2);
  nm.forEach((l, i) => ops.push(T(72, y + 62 + i * 72, l, 62, 800, SC.text)));
  y += nm.length * 72 + 20;
  ops.push(T(72, y + 32, fitText(d.sub, 32, 600, 936), 32, 600, SC.soft));
  y += 70;
  const tiles = (d.tiles || []).filter((t) => t.pair && t.pair[1]);
  const bt = bigTilesOps(tiles, y, story);
  ops.push(...bt.ops);
  y += bt.h + 8;
  ops.push(T(72, y + 30, "Bez pořadí a hodnocení. Čísla spočítal skript z oficiálních dat.", 24, 500, SC.soft));
  y += 50;
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...centered(ops, y, H), ...shareFooter(H, ENTITY_FOOT(d), d.urlShort)];
}

// Seznam jmen pod mini hlavičkou: aktuální, pod čarou bývalí šedě s „do D. M. RRRR“. Delší seznam zmenší řádek, nic neořízne.
function nameRows(rows, former, y, bottom, draw, base = 76) {
  const ops = [];
  const n = rows.length + former.length + (former.length ? 0.6 : 0);
  const rh = Math.min(base, Math.floor((bottom - y) / Math.max(n, 1)));
  const fs = Math.max(20, Math.min(32, Math.round(rh * 0.42)));
  rows.forEach((r, i) => ops.push(...draw(r, y + i * rh, rh, fs, false)));
  y += rows.length * rh;
  if (former.length) {
    ops.push(LINE(72, y + rh * 0.3, 1008, y + rh * 0.3, SC.line, 2));
    y += rh * 0.6;
    former.forEach((r, i) => ops.push(...draw(r, y + i * rh, rh, fs, true)));
    y += former.length * rh;
  }
  return { ops, y, rh };
}

const pairPct = (p) => (p && p[1] ? fmtPct(p[0] / p[1]) : "–");
const pairSub = (p) => (p && p[1] ? `${fmtNum(p[0])} z ${fmtNum(p[1])}` : "");

// 2/3 strana: současní poslanci abecedně, účast na hlasování a hlasování s frakcí; bývalí pod čarou.
function partyMembersOps(d, f) {
  const ops = [...entityMiniHead({ ...d, headSub: d.sub }, 2)];
  let y = 360;
  ops.push(sectionTitle(y, "POSLANCI STRANY"), T(780, y, "ÚČAST", 22, 800, SC.accent, "right"), T(1008, y, "S FRAKCÍ", 22, 800, SC.accent, "right"));
  y += 24;
  const draw = (r, ry, rh, fs, old) => {
    const out = [T(72, ry + rh * 0.55, fitText(r.name, fs, 700, old ? 760 : 520), fs, 700, old ? SC.muted : SC.text)];
    if (old) out.push(T(1008, ry + rh * 0.55, r.end ? `do ${fmtDate(r.end)}` : "", Math.round(fs * 0.8), 500, SC.muted, "right"));
    else {
      out.push(T(780, ry + rh * 0.5, pairPct(r.attendance), fs, 800, SC.text, "right"), T(780, ry + rh * 0.5 + fs * 0.8, pairSub(r.attendance), Math.round(fs * 0.6), 500, SC.muted, "right"),
        T(1008, ry + rh * 0.5, pairPct(r.loyalty), fs, 800, SC.text, "right"), T(1008, ry + rh * 0.5 + fs * 0.8, pairSub(r.loyalty), Math.round(fs * 0.6), 500, SC.muted, "right"));
    }
    out.push(LINE(72, ry + rh - 4, 1008, ry + rh - 4, SC.rowLine, 2));
    return out;
  };
  if (!(d.members || []).length) {
    ops.push(T(72, y + 56, "Strana teď v EP nemá žádného poslance.", 30, 600, SC.soft));
    y += 80;
  }
  ops.push(...nameRows(d.members || [], d.former || [], y, f.h - 190, draw, 92).ops);
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...ops, ...shareFooter(f.h, ENTITY_FOOT(d), d.urlShort)];
}

// 3/3 strana: jak hlasuje (pruh všech hlasů poslanců), kolikrát se poslanci rozdělili, poslední rozdělené závěrečné hlasování.
function partyVotesOps(d, f) {
  const ops = [...entityMiniHead({ ...d, headSub: d.sub }, 3)];
  let y = 384;
  const pos = d.positions;
  if (pos) {
    const total = SHARE_KEYS.reduce((n, k) => n + (pos[k] || 0), 0);
    ops.push(sectionTitle(y, `JAK HLASOVALI POSLANCI STRANY · ${fmtNum(total)} HLASŮ`), ...barOps(72, y + 28, 936, 34, SHARE_KEYS.map((k) => pos[k] || 0)));
    let lx = 72;
    const lab = { FOR: "pro", AGAINST: "proti", ABSTENTION: "zdržel se", DID_NOT_VOTE: "nehlasoval" };
    SHARE_KEYS.forEach((k) => {
      const t = `${lab[k]} ${fmtNum(pos[k] || 0)}`;
      ops.push(...POSDOT(lx + 12, y + 104, 12, k), T(lx + 34, y + 114, t, 28, 600, SC.text));
      lx += measureText(t, 28, 600) + 58;
    });
    y += 180;
  }
  ops.push(sectionTitle(y, "KDY HLASOVALI POSLANCI STRANY JINAK"));
  y += 20;
  if (d.single) {
    const msg = d.membersEver === 1 ? "Strana má v EP jednoho poslance, jednotnost se nepočítá." : "Strana neměla v žádném hlasování víc než jednoho hlasujícího poslance, jednotnost se nepočítá.";
    wrapText(msg, 32, 600, 936, 3).forEach((l, i) => ops.push(T(72, y + 48 + i * 44, l, 32, 600, SC.soft)));
  } else {
    const line = (p, what) => `Hlasovali jinak v ${fmtNum(p[0])} ${what} z ${fmtNum(p[1])}`;
    if (d.splits) ops.push(T(72, y + 48, fitText(line(d.splits, "hlasováních"), 34, 700, 936), 34, 700, SC.text));
    if (d.splitsMain) ops.push(T(72, y + 98, fitText(line(d.splitsMain, "závěrečných hlasováních"), 30, 600, 936), 30, 600, SC.soft));
    y += 140;
    if (d.lastSplit) {
      ops.push(sectionTitle(y + 20, "POSLEDNÍ ZÁVĚREČNÉ HLASOVÁNÍ, KDE SE STRANA ROZDĚLILA"));
      const tl = wrapText(`${fmtDate(d.lastSplit.date)} · ${d.lastSplit.title || ""}`, 30, 700, 936, 3);
      tl.forEach((l, i) => ops.push(T(72, y + 70 + i * 40, l, 30, 700, SC.text)));
      y += 70 + tl.length * 40 + 10;
      const ps = d.lastSplit.positions || [];
      const cols = ps.length > 4 ? 2 : 1, colW = cols === 1 ? 936 : 448, per = Math.ceil(ps.length / cols);
      const rh = Math.min(52, Math.floor((f.h - 200 - y) / Math.max(per, 1)));
      ps.forEach((p, i) => {
        const cx = 72 + Math.floor(i / per) * (colW + 40), cy = y + (i % per) * rh;
        ops.push(...POSDOT(cx + 14, cy + rh / 2, 14, p.position), T(cx + 42, cy + rh / 2 + 10, fitText(p.name, 28, 600, colW - 50), 28, 600, SC.text));
      });
    } else ops.push(T(72, y + 40, "V závěrečných hlasováních hlasovali všichni stejně.", 30, 600, SC.soft));
  }
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...ops, ...shareFooter(f.h, ENTITY_FOOT(d), d.urlShort)];
}

const groupSub = (d) => [d.seats ? `${fmtNum(d.seats)} ${d.seats === 1 ? "poslanec" : d.seats < 5 ? "poslanci" : "poslanců"} ${[2, 3, 4, 7, 17].includes(d.nCountries) || (d.nCountries >= 70 && d.nCountries < 80) ? "ze" : "z"} ${fmtNum(d.nCountries)} zemí` : "",
  d.czCount ? `${fmtNum(d.czCount)} ${d.czCount === 1 ? "český poslanec" : d.czCount < 5 ? "čeští poslanci" : "českých poslanců"}` : "žádný český poslanec"].filter(Boolean).join(" · ");

// 1/3 frakce: logo, český název, „X poslanců z Y zemí“, počet Čechů, účast skupiny a hlasování s většinou frakce.
export function groupCardOps(d, f) {
  const H = f.h, story = H > 1500;
  const ops = [];
  let y = 0;
  const mark = logoMarkOps(72, y, fitLogoH(d, 120, 936), d, d.short);
  ops.push(...mark.ops);
  y += mark.h + 30;
  const nm = wrapText(d.name, 58, 800, 936, 3);
  nm.forEach((l, i) => ops.push(T(72, y + 58 + i * 68, l, 58, 800, SC.text)));
  y += nm.length * 68 + 20;
  ops.push(T(72, y + 32, fitText(groupSub(d), 32, 600, 936), 32, 600, SC.soft));
  y += 70;
  const bt = bigTilesOps((d.tiles || []).filter((t) => t.pair && t.pair[1]), y, story);
  ops.push(...bt.ops);
  y += bt.h + 8;
  ops.push(T(72, y + 30, "Celá skupina v EP, ne jen Češi. Bez pořadí a hodnocení.", 24, 500, SC.soft));
  y += 50;
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...centered(ops, y, H), ...shareFooter(H, ENTITY_FOOT(d), d.urlShort)];
}

// 2/3 frakce: čeští poslanci (jméno a logo strany), bývalí pod čarou; bez Čechů prázdný stav s vysvětlením.
function groupMembersOps(d, f) {
  const ops = [...entityMiniHead({ ...d, headSub: groupSub(d) }, 2)];
  let y = 360;
  const members = d.members || [], former = d.former || [];
  if (!members.length) {
    ops.push(T(540, y + 220, d.noCz?.title || "Žádný český poslanec", 64, 800, SC.text, "center"));
    wrapText(d.noCz?.text || "", 32, 500, 860, 3).forEach((l, i) => ops.push(T(540, y + 290 + i * 44, l, 32, 500, SC.soft, "center")));
    if (former.length) {
      const prev = `Dříve: ${former.map((m) => `${m.name}${m.partyLabel ? ` (${m.partyLabel})` : ""}, do ${fmtDate(m.end)}`).join("; ")}`;
      wrapText(prev, 26, 500, 860, 4).forEach((l, i) => ops.push(T(540, y + 420 + i * 36, l, 26, 500, SC.muted, "center")));
    }
  } else {
    ops.push(sectionTitle(y, "ČEŠTÍ POSLANCI VE FRAKCI"));
    y += 24;
    const draw = (r, ry, rh, fs, old) => {
      const out = [T(72, ry + rh * 0.62, fitText(r.name, fs, 700, 560), fs, 700, old ? SC.muted : SC.text)];
      const right = old ? `${r.partyLabel ? `${r.partyLabel} · ` : ""}do ${fmtDate(r.end)}` : null;
      if (right) out.push(T(1008, ry + rh * 0.62, fitText(right, Math.round(fs * 0.8), 500, 380), Math.round(fs * 0.8), 500, SC.muted, "right"));
      else if (r.label) {
        const lh = fitLogoH(r, Math.min(44, rh - 26), 300);
        const w = r.logoImg && r.aspect ? lh * r.aspect + 2 * Math.round(lh * 0.12) : measureText(r.label, 28, 600) + 62;
        out.push(...logoMarkOps(1008 - w, ry + (rh - (r.logoImg && r.aspect ? lh + 2 * Math.round(lh * 0.12) : 52)) / 2, lh, r, r.label).ops);
      }
      out.push(LINE(72, ry + rh - 4, 1008, ry + rh - 4, SC.rowLine, 2));
      return out;
    };
    ops.push(...nameRows(members, former, y, f.h - 190, draw, 88).ops);
  }
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...ops, ...shareFooter(f.h, ENTITY_FOOT(d), d.urlShort)];
}

// 3/3 frakce: složení podle zemí (prvních 5 a Česko zvýrazněné) a předsednictví podle EP.
function groupEuropeOps(d, f) {
  const ops = [...entityMiniHead({ ...d, headSub: groupSub(d) }, 3)];
  let y = 384;
  const c = d.countries;
  if (c) {
    ops.push(sectionTitle(y, "FRAKCE V EVROPĚ"), T(72, y + 46, `${fmtNum(c.nCountries)} zemí · ${fmtNum(c.seats)} poslanců · k ${fmtDate(c.asOf)}`, 30, 600, SC.soft));
    y += 80;
    const max = Math.max(...c.rows.map((r) => r.n), 1);
    c.rows.forEach((r, i) => {
      const ry = y + i * 74;
      if (r.extra) ops.push(LINE(72, ry - 6, 1008, ry - 6, SC.line, 2));
      const color = r.cz ? SC.accent : SC.text;
      ops.push(T(72, ry + 42, fitText(r.cz && !r.n ? "Česko" : r.cs || r.cc, 30, r.cz ? 800 : 600, 250), 30, r.cz ? 800 : 600, color),
        RECT(340, ry + 18, 560, 32, 8, SC.track));
      if (r.n) ops.push(RECT(340, ry + 18, Math.max(560 * (r.n / max), 8), 32, 8, r.cz ? SC.gold : SC.soft));
      ops.push(T(1008, ry + 44, fmtNum(r.n), 32, 800, color, "right"));
    });
    y += c.rows.length * 74 + 30;
  }
  if (d.chairs && d.chairs.length) {
    ops.push(sectionTitle(y + 20, (d.chairsHeading || "Předsednictví").toUpperCase()));
    d.chairs.forEach((ch, i) => ops.push(T(72, y + 72 + i * 48, fitText(`${ch.name} · ${ch.country || ""}`, 32, 700, 700), 32, 700, SC.text),
      T(1008, y + 72 + i * 48, ch.role, 26, 500, SC.muted, "right")));
    y += 72 + d.chairs.length * 48;
  }
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...ops, ...shareFooter(f.h, c ? ENTITY_FOOT(d, "složení", c.asOf) : ENTITY_FOOT(d), d.urlShort)];
}

// Karta Příběhu zákona (z/…, procedure_pages.py): název, druh procedury, kde je teď, kdy je na programu a poslední
// závěrečné hlasování s hlasy Čechů v mandátu. Čísla jen z dat stránky.
export function lawCardOps(d, f) {
  const H = f.h, story = H > 1500;
  const ops = [];
  let y = 0;
  ops.push(T(72, y + 30, fitText(`Příběh zákona · ${d.label}`, 26, 800, 936), 26, 800, SC.accent));
  y += 60;
  const nm = wrapText(d.title, 54, 800, 936, story ? 5 : 4);
  nm.forEach((l, i) => ops.push(T(72, y + 54 + i * 64, l, 54, 800, SC.text)));
  y += nm.length * 64 + 24;
  if (d.kind) { ops.push(T(72, y + 30, fitText(d.kind, 28, 600, 936), 28, 600, SC.soft)); y += 64; }
  const row = (label, value) => {
    ops.push(LINE(72, y, 1008, y, SC.line, 2), T(72, y + 46, label, 24, 600, SC.muted), T(72, y + 88, fitText(value, 32, 700, 936), 32, 700, SC.text));
    y += 118;
  };
  if (d.now) row("Kde je teď", d.now);
  if (d.agenda) row("Na programu pléna", d.agenda);
  if (d.final) {
    row(`Závěrečné hlasování ${d.final.date}`, d.final.result);
    if (d.final.cz && d.final.cz.some(Boolean)) {
      ops.push(...barOps(72, y, 936, 22, d.final.cz));
      const [a, b, c, n] = d.final.cz;
      ops.push(T(72, y + 64, `Čeští poslanci: ${a} pro · ${b} proti · ${c} zdrž. · ${n} nehl.`, 26, 600, SC.soft));
      y += 96;
    }
  }
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...centered(ops, y, H),
    ...shareFooter(H, "Zdroj: EP Open Data, HowTheyVote.eu · Češi v mandátu k datu hlasování", d.urlShort)];
}

// Karta zasedání pléna (zasedani.html, session_page.py): „Tento týden v Bruselu“ s body vybranými pravidlem, u každého co se
// rozhoduje a česká stopa; po zasedání „Jak to dopadlo“ s výsledkem a hlasy Čechů. Čísla jen z dat stránky.
export function sessionCardOps(d, f) {
  const H = f.h, story = H > 1500, max = story ? 5 : 4;
  const ops = [];
  let y = 0;
  ops.push(T(72, y + 64, d.results ? "Jak to dopadlo" : "Tento týden v Bruselu", 64, 800, SC.text));
  y += 104;
  ops.push(T(72, y + 30, fitText(`Zasedání Evropského parlamentu · ${d.when}`, 30, 600, 936), 30, 600, SC.soft));
  y += 72;
  (d.picks || []).slice(0, max).forEach((pk) => {
    ops.push(LINE(72, y, 1008, y, SC.line, 2));
    y += 44;
    if (pk.decision) { ops.push(T(72, y, fitText(pk.decision, 24, 700, 936), 24, 700, SC.accent)); y += 42; }
    const lines = wrapText(pk.title, 34, 700, 936, 2);
    lines.forEach((l, i) => ops.push(T(72, y + i * 44, l, 34, 700, SC.text)));
    y += lines.length * 44;
    if (pk.result) { ops.push(T(72, y + 4, fitText(pk.result, 26, 700, 936), 26, 700, SC.text)); y += 40; }
    if (pk.cz) { ops.push(T(72, y + 4, fitText(pk.cz, 24, 500, 936), 24, 500, SC.soft)); y += 38; }
    y += 18;
  });
  ops.push(T(72, y + 34, "Výběr pravidlem, ne redakcí: česká stopa, pak zákony.", 24, 500, SC.soft));
  y += 54;
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...centered(ops, y, H),
    ...shareFooter(H, "Zdroj: program EP (EP Open Data, CC BY 4.0), HowTheyVote.eu (ODbL)", d.urlShort)];
}

// Karta výsledku kvízu (kviz.html): tři nejvyšší shody (portrét, jméno, strana · frakce, %, „x z y“), počet odpovědí, datum.
// Bez pořadových čísel a medailí; spočítal prohlížeč z odpovědí uživatele (lib/quiz.js), nic se neodesílá.
export function quizCardOps(d, f) {
  const H = f.h, story = H > 1500;
  const ops = [];
  let y = 0;
  const tl = wrapText("Moje shoda s českými europoslanci", 62, 800, 936, 2);
  tl.forEach((l, i) => ops.push(T(72, y + 62 + i * 72, l, 62, 800, SC.text)));
  y += tl.length * 72 + 24;
  const lead = wrapText(`V kvízu EP Watch CZ jsem odpověděl/a na ${fmtNum(d.answered)} ${d.answered === 1 ? "otázku" : d.answered < 5 ? "otázky" : "otázek"} ze skutečných hlasování Evropského parlamentu. Nejčastěji stejně jako já hlasovali:`, 28, 500, 936, 4);
  lead.forEach((l, i) => ops.push(T(72, y + 28 + i * 40, l, 28, 500, SC.soft)));
  y += lead.length * 40 + 30;
  const rh = story ? 236 : 196, ph = story ? 150 : 128;
  (d.top || []).forEach((r, i) => {
    const ty = y + i * (rh + 20), cy = ty + rh / 2;
    ops.push(RECT(72, ty, 936, rh, 28, SC.tile, SC.tileLine, 2));
    const px = 104;
    if (r.photo) ops.push({ k: "image", img: r.photo, x: px, y: cy - ph / 2, w: ph, h: ph, r: ph / 2 }, CIRC(px + ph / 2, cy, ph / 2 + 2, null, SC.gold, 4));
    else ops.push(...neutralAvatarOps(px, cy - ph / 2, ph, ph, ph / 2));
    const nx = px + ph + 32, pw = Math.max(measureText(r.pct, 76, 800), measureText(r.pair, 24, 500)) + 24, nw = 1008 - 36 - pw - nx;
    const nm = wrapText(r.name, 40, 800, nw, 2);
    const top = cy - (nm.length * 48 + 38) / 2;
    nm.forEach((l, k) => ops.push(T(nx, top + 40 + k * 48, l, 40, 800, SC.text)));
    if (r.sub) ops.push(T(nx, top + nm.length * 48 + 32, fitText(r.sub, 26, 500, nw), 26, 500, SC.muted));
    ops.push(T(1008 - 36, cy + 18, r.pct, 76, 800, SC.text, "right"), T(1008 - 36, cy + 56, r.pair, 24, 500, SC.muted, "right"));
  });
  y += (d.top || []).length * (rh + 20);
  if ((d.top || []).some((r) => r.photo)) { ops.push(T(72, y + 22, "Portréty © European Union – Source: EP", 20, 500, SC.muted)); y += 34; }
  const def = wrapText("Shoda = podíl otázek, kde poslanec hlasoval stejně, z otázek, na které jsem odpověděl/a a ve kterých hlasoval. Není to doporučení, koho volit.", 24, 500, 936, 3);
  def.forEach((l, i) => ops.push(T(72, y + 40 + i * 34, l, 24, 500, SC.soft)));
  y += def.length * 34 + 40;
  return [...shareHeader(fmtDate(d.date)), ...centered(ops, y, H), ...shareFooter(H, "Zdroj hlasů: HowTheyVote.eu (ODbL) · shodu spočítal prohlížeč, nic se neodesílá", d.urlShort)];
}

// Karta výsledku kvízu „Evropské frakce“: nejbližší frakce (logo na bílé dlaždici nebo barevná tečka, název, %, „x z y“),
// české strany ve frakci dnes, pruhy dalších dvou frakcí, počet odpovědí, datum. Spočítal prohlížeč (lib/quiz.js), nic se neodesílá.
export function quizGroupsCardOps(d, f) {
  const H = f.h, story = H > 1500;
  const ops = [];
  let y = 0;
  const tl = wrapText(d.title || "Ke které evropské frakci mám nejblíž", 62, 800, 936, 2);
  tl.forEach((l, i) => ops.push(T(72, y + 62 + i * 72, l, 62, 800, SC.text)));
  y += tl.length * 72 + 24;
  const lead = wrapText(`V kvízu EP Watch CZ jsem odpověděl/a na ${fmtNum(d.answered)} ${d.answered === 1 ? "otázku" : d.answered < 5 ? "otázky" : "otázek"} ze skutečných hlasování Evropského parlamentu. Nejblíž mám k:`, 28, 500, 936, 4);
  lead.forEach((l, i) => ops.push(T(72, y + 28 + i * 40, l, 28, 500, SC.soft)));
  y += lead.length * 40 + 30;
  const b = d.best;
  if (b) {
    const th = story ? 300 : 264, lw = 220, lh = 120;
    ops.push(RECT(72, y, 936, th, 28, SC.tile, SC.tileLine, 2), RECT(72, y, 12, th, 6, b.color || SC.gold));
    const lx = 112, ly = y + 36;
    if (b.logoImg) {
      const a = b.logoAspect || b.logoImg.width / b.logoImg.height;
      const hh = Math.min(lh - 24, (lw - 24) / a), ww = hh * a;
      ops.push(RECT(lx, ly, lw, lh, 18, "#FFFFFF"), { k: "image", img: b.logoImg, x: lx + (lw - ww) / 2, y: ly + (lh - hh) / 2, w: ww, h: hh, r: 0 });
    } else ops.push(CIRC(lx + 40, ly + 40, 30, b.color || SC.gold));
    const pw = Math.max(measureText(b.pct, 96, 800), measureText(b.pair, 24, 500)) + 24;
    ops.push(T(1008 - 36, ly + 92, b.pct, 96, 800, SC.text, "right"), T(1008 - 36, ly + 130, b.pair, 24, 500, SC.muted, "right"));
    const nx = b.logoImg ? lx + lw + 28 : lx + 100, nw = 1008 - 36 - pw - nx;
    ops.push(T(nx, ly + 52, fitText(b.name, 48, 800, nw), 48, 800, SC.text));
    wrapText(b.full || "", 24, 500, nw, 2).forEach((l, i) => ops.push(T(nx, ly + 90 + i * 32, l, 24, 500, SC.muted)));
    const cz = wrapText(b.parties?.length ? `Čeští poslanci ve frakci dnes: ${b.parties.join(", ")}` : "Dnes ve frakci není žádný český poslanec.", 26, 600, 864, 2);
    cz.forEach((l, i) => ops.push(T(112, y + th - 36 - (cz.length - 1 - i) * 36, l, 26, 600, SC.soft)));
    y += th + 30;
  }
  (d.rest || []).forEach((r) => {
    const w = 936 - 200;
    ops.push(T(72, y + 30, fitText(r.name, 30, 700, 300), 30, 700, SC.text), T(1008, y + 30, r.pct, 30, 700, SC.text, "right"),
      RECT(72, y + 48, w + 200, 14, 7, SC.track), RECT(72, y + 48, Math.max(14, (w + 200) * (r.share || 0)), 14, 7, r.color || SC.soft));
    y += 90;
  });
  const def = wrapText("Shoda = podíl otázek, kde se moje odpověď shoduje s většinou hlasujících členů frakce. Není to doporučení, koho volit.", 24, 500, 936, 3);
  def.forEach((l, i) => ops.push(T(72, y + 30 + i * 34, l, 24, 500, SC.soft)));
  y += def.length * 34 + 30;
  return [...shareHeader(fmtDate(d.date)), ...centered(ops, y, H), ...shareFooter(H, "Zdroj hlasů: HowTheyVote.eu (ODbL) · shodu spočítal prohlížeč, nic se neodesílá", d.urlShort)];
}

// Neutrální silueta (stejná pro všechny) místo portrétu: jen balíček pro Instagram (avatar: "neutral").
function neutralAvatarOps(x, y, w, h, r) {
  const cx = x + w / 2;
  // hlava a ramena celé uvnitř dlaždice (i kulaté): nic nepřesahuje okraj
  const head = Math.min(w, h) * 0.19;
  return [RECT(x, y, w, h, r, SC.chip), CIRC(cx, y + h * 0.4, head, SC.silhouette),
    RECT(cx - w * 0.28, y + h * 0.62, w * 0.56, h * 0.26, Math.min(w * 0.28, h * 0.13), SC.silhouette)];
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

// Story verze 2. a 3. obrázku detailu: stejné rozložení jako 4 : 5, vystředěné na výšku 9 : 16 (hlavička nahoře,
// patička dole, obsah uprostřed). Jedna logika pro všechny karty, žádné zvláštní rozložení.
// --- duel poslanců (hromadné zadání 24. 10. 2026, úkol 4) ------------------------------------------
// Čísla vedle sebe bez vítěze: žádné zvýraznění vyšší hodnoty, stejná barva obou stran, proužky od středu na stejné škále.
// Data připraví pages/duel.js z data/duel.json (stejná čísla jako stránka duelu). Barva frakce jen jako tónovaný podklad.
const tint = (hex, a) => (/^#[0-9a-f]{6}$/i.test(hex || "") ? `${hex}${a}` : SC.chip);
const DUEL_FOOT = (d) => `Zdroj: HowTheyVote.eu, EP Open Data · frakce k datu hlasování · data k ${fmtDate(d.dataDay)}`;

function duelSideOps(m, x, w, y0, tintA) {
  const ops = [RECT(x - 16, y0 - 24, w + 32, 760, 28, tint(m.group?.color, tintA))];
  const pw = 300, ph = 375, px = x + (w - pw) / 2;
  if (m.photo) ops.push({ k: "image", img: m.photo, x: px, y: y0, w: pw, h: ph, r: 22 }, T(x + w / 2, y0 + ph + 30, "© European Union – Source: EP", 18, 500, SC.muted, "center"));
  else ops.push(...neutralAvatarOps(px, y0, pw, ph, 22));
  let y = y0 + ph + 92;
  wrapText(m.name, 44, 800, w, 2).forEach((l, i) => ops.push(T(x + w / 2, y + i * 52, l, 44, 800, SC.text, "center")));
  y += Math.min(2, wrapText(m.name, 44, 800, w, 2).length) * 52 + 10;
  const g = chipOps(0, 0, m.group?.label || "bez frakce", m.group?.color);
  ops.push(...shift(g.ops.map((o) => ({ ...o, ...("x" in o ? { x: o.x + x + (w - g.w) / 2 } : {}) })), y));
  y += 78;
  if (m.party?.logoImg && m.party.aspect) {
    const lh = Math.min(48, 220 / m.party.aspect), lw = lh * m.party.aspect;
    ops.push(RECT(x + (w - lw) / 2 - 14, y - 6, lw + 28, lh + 12 + 6, 12, "#FFFFFF", SC.chipLine, 2), { k: "image", img: m.party.logoImg, x: x + (w - lw) / 2, y: y + 3, w: lw, h: lh, r: 0 });
  } else if (m.party?.label) ops.push(T(x + w / 2, y + 30, fitText(m.party.label, 28, 600, w), 28, 600, SC.soft, "center"));
  return ops;
}

// 1/3 Tale of the tape: dva portréty stejně velké proti sobě, jména, frakce a strana, pod tím shoda a počet společných hlasování.
export function duelCardOps(d, f) {
  const ops = [...duelSideOps(d.a, 88, 420, 40, "2E"), ...duelSideOps(d.b, 572, 420, 40, d.sameGroup ? "17" : "2E"),
    T(540, 330, "vs", 40, 800, SC.muted, "center")];
  let y = 860;
  const [same, total] = d.agreement || [0, 0];
  if (total) {
    ops.push(T(540, y + 70, fmtPct(same / total), 96, 800, SC.text, "center"),
      T(540, y + 118, `stejně hlasovali ve ${fmtNum(same)} z ${fmtNum(total)} společných hlasování`, 30, 600, SC.soft, "center"));
  } else ops.push(T(540, y + 70, "Neměli žádné společné hlasování", 40, 800, SC.text, "center"));
  ops.push(T(540, y + 170, "Čísla vedle sebe, bez hodnocení a bez vítěze.", 26, 500, SC.muted, "center"));
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...centered(ops, y + 190, f.h), ...shareFooter(f.h, DUEL_FOOT(d), d.urlShort)];
}

function duelMiniHead(d, n) {
  const ops = [];
  [[d.a, 72], [d.b, 160]].forEach(([m, x]) => {
    if (m.photo) ops.push({ k: "image", img: m.photo, x, y: 190, w: 80, h: 80, r: 40 });
    else ops.push(...neutralAvatarOps(x, 190, 80, 80, 40));
  });
  const title = measureText(`${d.a.name} vs ${d.b.name}`, 40, 800) <= 640 ? `${d.a.name} vs ${d.b.name}` : `${d.a.short} vs ${d.b.short}`;
  ops.push(T(264, 228, fitText(title, 40, 800, 640), 40, 800, SC.text),
    T(264, 268, fitText("Čísla vedle sebe, ne kvalita práce", 26, 500, 640), 26, 500, SC.soft), T(1008, 240, `${n} / 3`, 30, 500, SC.muted, "right"));
  return ops;
}

// 2/3 Čísla proti sobě: metrika uprostřed, hodnoty po stranách, proužky od středu ven na stejné škále. null = „–“.
function duelNumbersOps(d, f) {
  const ops = [...duelMiniHead(d, 2), T(72, 340, fitText(d.a.name, 26, 700, 420), 26, 700, SC.soft), T(1008, 340, fitText(d.b.name, 26, 700, 420), 26, 700, SC.soft, "right")];
  const rows = (d.metrics || []).slice(0, 8);
  const rh = Math.min(118, Math.floor((f.h - 150 - 390) / Math.max(rows.length, 1)));
  rows.forEach((r, i) => {
    const y = 390 + i * rh;
    ops.push(T(540, y + 30, fitText(r.label, 28, 700, 520), 28, 700, SC.text, "center"),
      T(72, y + 34, r.a.text, 40, 800, r.a.text === "–" ? SC.muted : SC.text), T(1008, y + 34, r.b.text, 40, 800, r.b.text === "–" ? SC.muted : SC.text, "right"),
      RECT(72, y + 54, 936, 12, 6, SC.track));
    const half = 452;
    if (r.a.w) ops.push(RECT(540 - 6 - half * r.a.w, y + 54, half * r.a.w, 12, 6, SC.soft));
    if (r.b.w) ops.push(RECT(546, y + 54, half * r.b.w, 12, 6, SC.soft));
    if (r.a.sub || r.b.sub) ops.push(T(72, y + 92, fitText(r.a.sub || "", 22, 500, 420), 22, 500, SC.muted), T(1008, y + 92, fitText(r.b.sub || "", 22, 500, 420), 22, 500, SC.muted, "right"));
  });
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...ops, ...shareFooter(f.h, DUEL_FOOT(d), d.urlShort)];
}

// 3/3 Kde se rozešli: až 4 klíčová hlasování, kde jeden PRO a druhý PROTI; jinak věta a shoda podle 3 témat.
function duelDivergedOps(d, f) {
  const ops = [...duelMiniHead(d, 3)];
  const rows = (d.diverged || []).slice(0, 4);
  if (rows.length) {
    ops.push(sectionTitle(360, "KDE SE ROZEŠLI · KLÍČOVÁ HLASOVÁNÍ"),
      T(830, 410, fitText(d.a.short, 22, 700, 120), 22, 700, SC.soft, "center"), T(950, 410, fitText(d.b.short, 22, 700, 120), 22, 700, SC.soft, "center"));
    rows.forEach((r, i) => {
      const y = 440 + i * 170;
      wrapText(r.title, 32, 700, 680, 2).forEach((l, j) => ops.push(T(72, y + 38 + j * 42, l, 32, 700, SC.text)));
      ops.push(T(72, y + 128, fitText(r.meta, 24, 500, 680), 24, 500, SC.muted), ...POSDOT(830, y + 60, 26, r.a), ...POSDOT(950, y + 60, 26, r.b),
        LINE(72, y + 156, 1008, y + 156, SC.line, 2));
    });
    ops.push(T(72, 440 + rows.length * 170 + 40, "✓ pro · ✕ proti · frakce k datu hlasování", 24, 500, SC.muted));
  } else {
    ops.push(T(72, 420, "V klíčových hlasováních se nerozešli", 44, 800, SC.text));
    const topics = (d.topics || []).slice(0, 3);
    if (topics.length) ops.push(sectionTitle(510, "SHODA PODLE TÉMAT"));
    topics.forEach((t, i) => {
      const y = 560 + i * 110;
      ops.push(T(72, y + 30, fitText(t.label, 30, 700, 760), 30, 700, SC.text), T(1008, y + 30, fmtPct(t.share), 34, 800, SC.text, "right"),
        RECT(72, y + 52, 936, 12, 6, SC.track), RECT(72, y + 52, 936 * t.share, 12, 6, SC.soft));
    });
  }
  return [...shareHeader(`data k ${fmtDate(d.dataDay)}`), ...ops, ...shareFooter(f.h, DUEL_FOOT(d), d.urlShort)];
}

function storyOps(ops, from = 1350, to = 1920) {
  const extra = to - from, mid = Math.round(extra / 2), footY = from - 140;
  const yOf = (o) => ("y" in o ? o.y : o.y1);
  return ops.map((o) => {
    if (o.k === "band" || yOf(o) < 340) return o;   // hlavička a mini hlavička (jméno, název) zůstávají nahoře
    const dy = yOf(o) >= footY ? extra : mid;
    return { ...o, ...("y" in o ? { y: o.y + dy } : {}), ...("y1" in o ? { y1: o.y1 + dy, y2: o.y2 + dy } : {}) };
  });
}

// Operace kreslení karty podle druhu (a u poslance podle slidu); stejná funkce pro web i balíček pro Instagram.
export function cardOps(kind, data, f, formatKey) {
  if (formatKey === "story2" || formatKey === "story3") {
    const k = formatKey === "story2" ? "slide2" : "slide3";
    return storyOps(cardOps(kind, data, SHARE_FORMATS[k], k), SHARE_FORMATS[k].h, f.h);
  }
  if (kind === "vote" && formatKey === "slide2") return voteGroupsOps(data, f);
  if (kind === "vote" && formatKey === "slide3") return voteContextOps(data, f);
  if (kind === "party") return formatKey === "slide2" ? partyMembersOps(data, f) : formatKey === "slide3" ? partyVotesOps(data, f) : partyCardOps(data, f);
  if (kind === "group") return formatKey === "slide2" ? groupMembersOps(data, f) : formatKey === "slide3" ? groupEuropeOps(data, f) : groupCardOps(data, f);
  if (kind === "duel") return formatKey === "slide2" ? duelNumbersOps(data, f) : formatKey === "slide3" ? duelDivergedOps(data, f) : duelCardOps(data, f);
  const draw = { vote: voteCardOps, metric: metricCardOps, split: splitCardOps, quiz: quizCardOps, "quiz-groups": quizGroupsCardOps, session: sessionCardOps, law: lawCardOps }[kind];
  return draw ? draw(data, f) : formatKey === "slide2" ? mepVotingOps(data, f) : formatKey === "slide3" ? mepWorkOps(data, f) : mepBasicOps(data, f);
}

export async function renderCardPng(ctx, formatKey, theme = "dark") {
  const f = SHARE_FORMATS[formatKey];
  await Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(`${w} 20px ${SC_FONT}`, "Příliš žluťoučký kůň")));
  const data = { ...ctx.data };
  // Datum dat (export HowTheyVote) se do statických stránek nepíše, doplní se tady z overview.json.
  if (!data.dataDay) {
    try { const ov = await getJSON("overview.json"); data.dataDay = ov.sources?.votes?.release || ov.period?.to || data.date; } catch (e) { data.dataDay = data.date; }
  }
  _symbolImg = await loadImage(`${SHARE_ROOT}assets/brand/symbol-white.svg`);
  // Portrét z EP (avatar: "photo", výchozí na webu); "neutral" = stejná silueta pro všechny (balíček pro Instagram).
  if (ctx.kind === "mep" && data.avatar !== "neutral") data.photo = await loadImage(await photoDataUrl(ctx.data.photoUrl));
  // loga frakce a strany (soubory webu, data/manual/logos.json); když se nenačte, zůstane štítek s tečkou
  if (ctx.kind === "mep") data.chips = await Promise.all((data.chips || []).map(async (c) => (c.logo ? { ...c, logoImg: await loadImage(`${SHARE_ROOT}${c.logo}`).catch(() => null) } : c)));
  // logo strany/frakce a loga frakcí (strana) nebo stran (čeští poslanci frakce); když se nenačte, zůstane štítek se zkratkou
  if (ctx.kind === "vote") data.parties = await Promise.all((data.parties || []).map(async (it) => (it.logo ? { ...it, logoImg: await loadImage(`${SHARE_ROOT}${it.logo}`) } : it)));
  if (ctx.kind === "party" || ctx.kind === "group") {
    const withImg = async (e) => (e && e.logo ? { ...e, logoImg: await loadImage(`${SHARE_ROOT}${e.logo}`) } : e);
    Object.assign(data, await withImg(data));
    for (const key of ["groups", "members", "former"]) if (Array.isArray(data[key])) data[key] = await Promise.all(data[key].map(withImg));
  }
  if (ctx.kind === "duel") {
    for (const side of ["a", "b"]) {
      const m = { ...data[side] };
      m.photo = m.photoUrl ? await loadImage(await photoDataUrl(m.photoUrl)).catch(() => null) : null;
      if (m.party?.logo) m.party = { ...m.party, logoImg: await loadImage(`${SHARE_ROOT}${m.party.logo}`).catch(() => null) };
      data[side] = m;
    }
  }
  if (ctx.kind === "quiz-groups" && data.best?.logo) data.best = { ...data.best, logoImg: await loadImage(`${SHARE_ROOT}${data.best.logo}`) };
  if (ctx.kind === "quiz") data.top = await Promise.all((data.top || []).map(async (r) => ({ ...r, photo: r.photoUrl ? await loadImage(await photoDataUrl(r.photoUrl)) : null })));
  useCardTheme(theme);
  const ops = cardOps(ctx.kind, data, f, formatKey);
  const canvas = document.createElement("canvas");
  canvas.width = f.w;
  canvas.height = f.h;
  const c = canvas.getContext("2d");
  const g = c.createLinearGradient(0, 0, 0, f.h);
  g.addColorStop(0, SC.bg0);
  g.addColorStop(1, SC.bg1);
  c.fillStyle = g;
  c.fillRect(0, 0, f.w, f.h);
  for (const o of ops) {
    if (o.k === "band") {   // modrá hlavička: záře vpravo nahoře jako hlavička webu
      const rg = c.createRadialGradient(o.w * 0.85, -o.h * 0.4, 0, o.w * 0.85, -o.h * 0.4, 900);
      rg.addColorStop(0, BAND.glow);
      rg.addColorStop(0.62, BAND.navy);
      rg.addColorStop(1, BAND.navy2);
      c.fillStyle = rg;
      c.fillRect(o.x, o.y, o.w, o.h);
    } else if (o.k === "text") {
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
  c.fillStyle = SC.gold;   // zlatý proužek vlevo přes hlavičku i tělo karty
  c.fillRect(0, 0, 12, f.h);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Obrázek se nepodařilo vytvořit."))), "image/png"));
}


// --- tlačítko a panel sdílení (N1) -------------------------------------------------------
// Jedno tlačítko „Sdílet“ otevře <dialog> s živým náhledem PNG. Co je v náhledu, to se stáhne nebo odešle (stejný blob).
// Stránka nastaví window.shareContext(kind) → { kind, url, text, filename, data, title?, subtitle?, cite?, trust? } (i jako Promise);
// kind je hodnota atributu data-share („“ = karta stránky, „metric:attendance“, „view“ …).


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

// Formáty = obsah (jeden obrázek / detail) × rozměr (4 : 5 / 9 : 16); slides = obrázky, které formát vyrobí.
// Detail mají poslanec, strana, frakce a závěrečné hlasování (data.detail); u hlasování bez kontextu jen 2 obrázky.
export function shareFormats(kind, data = {}) {
  const out = [{ key: "post", content: "single", size: "post", slides: ["post"] }, { key: "story", content: "single", size: "story", slides: ["story"] }];
  const n = kind === "vote" ? (data?.detail ? (voteHasContext(data.detail) ? 3 : 2) : 0) : ["mep", "party", "group", "duel"].includes(kind) ? 3 : 0;
  if (n) {
    out.push({ key: "detail", content: "detail", size: "post", slides: ["post", "slide2", "slide3"].slice(0, n) },
      { key: "detail-story", content: "detail", size: "story", slides: ["story", "story2", "story3"].slice(0, n) });
  }
  return out;
}
const SD_SIZES = { post: { label: "Příspěvek", ratio: "4 : 5", icon: SD_ICON.ratio(12, 15) }, story: { label: "Story", ratio: "9 : 16", icon: SD_ICON.ratio(10, 18) } };
const SD_CONTENT_KEY = "epw-share-content";

const SD_TITLE = { metric: "Sdílet číslo", split: "Sdílet pohled", quiz: "Sdílet výsledek kvízu", "quiz-groups": "Sdílet výsledek kvízu" };
const SD_TRUST = "Karta má datum dat, zdroj a adresu stránky. Bez pořadí a hodnocení.";
const SD_FMT_KEY = "epw-share-format";
const SD_THEME_KEY = "ep-share-theme";
const SD_THEME_LABEL = { dark: "Tmavý", light: "Světlý" };
const SD_THEME_FILE = { dark: "tmava", light: "svetla" };

// Výchozí vzhled karty: uložená volba, jinak podle režimu webu (výchozí je světlý).
// Úložiště může chybět nebo házet výjimku (soukromé okno, zakázané cookies): pak jen výchozí hodnota.
export function cardThemeDefault() {
  let saved = null;
  try { saved = localStorage.getItem(SD_THEME_KEY); } catch (e) { /* bez úložiště */ }
  if (CARD_THEMES.includes(saved)) return saved;
  const site = document.documentElement.dataset.theme;
  if (CARD_THEMES.includes(site)) return site;
  return "light";
}

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

// Statické stránky (v/, p/) mají kontext jako JSON v <script type="application/json" id="share-context"> (bez inline skriptu, CSP):
// buď jeden kontext ({kind, path, …}), nebo víc podle tlačítka ({default: …, "metric:attendance": …}).
function staticShareContext(kindArg = "") {
  const el = document.getElementById("share-context");
  if (!el) return null;
  const all = JSON.parse(el.textContent);
  return withShareUrl(all.kind ? all : all[kindArg || "default"]);
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
  try { ctx = await (window.shareContext || staticShareContext)(kindArg); } catch (e) { ctx = null; }
  if (!ctx) return;
  const enc = encodeURIComponent;
  const formats = ctx.formats || shareFormats(ctx.kind, ctx.data);
  let saved = null, savedContent = null;
  try { saved = localStorage.getItem(SD_FMT_KEY); savedContent = localStorage.getItem(SD_CONTENT_KEY); } catch (e) { /* bez úložiště */ }
  const pickFmt = (content, size) => formats.find((x) => x.content === content && x.size === size) || formats.find((x) => x.size === size) || formats[0];
  let fmt = pickFmt(savedContent === "detail" ? "detail" : "single", saved === "story" ? "story" : "post");
  const hasDetail = formats.some((x) => x.content === "detail");
  const detailN = formats.find((x) => x.content === "detail")?.slides.length || 0;
  let theme = cardThemeDefault();
  const urlShort = ctx.data?.urlShort || ctx.url.replace(/^https?:\/\//, "");
  const cache = new Map();   // vzhled:slide → Promise<Blob>; stejný blob pro náhled, stažení i sdílení
  const objUrls = [];
  const blobFor = (slide) => {
    const key = `${theme}:${slide}`;
    if (!cache.has(key)) cache.set(key, renderCardPng(ctx, slide, theme));
    return cache.get(key);
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
        ${hasDetail ? `<p class="sd-lab" id="sd-cl">Obsah</p>
        <div class="sd-formats sd-content" role="radiogroup" aria-labelledby="sd-cl"><button type="button" role="radio" data-content="single">${SD_ICON.ratio(12, 15)}<span class="sd-fn">Jeden obrázek</span><span class="sd-fr">základní karta</span></button><button type="button" role="radio" data-content="detail"><span class="sd-stack" aria-hidden="true">${SD_ICON.ratio(12, 15)}${SD_ICON.ratio(12, 15)}</span><span class="sd-fn">Detail</span><span class="sd-fr">${detailN} obrázky</span></button></div>` : ""}
        <p class="sd-lab" id="sd-fl">Rozměr</p>
        <div class="sd-formats sd-size" role="radiogroup" aria-labelledby="sd-fl">${["post", "story"].map((k) => `<button type="button" role="radio" data-size="${k}">${SD_SIZES[k].icon}<span class="sd-fn">${SD_SIZES[k].label}</span><span class="sd-fr">${SD_SIZES[k].ratio}</span></button>`).join("")}</div>
        <p class="sd-lab" id="sd-tl">Vzhled</p>
        <div class="sd-themes" role="group" aria-labelledby="sd-tl">${CARD_THEMES.map((x) => `<button type="button" data-card-theme="${x}" aria-pressed="false"><span class="sd-sw sd-sw-${x}" aria-hidden="true"><i></i><i></i></span><span class="sd-fn">${SD_THEME_LABEL[x]}</span></button>`).join("")}</div>
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
        <p class="sd-trust">${SD_ICON.shield}<span>${esc(ctx.trust || SD_TRUST)}${(ctx.kind === "mep" && ctx.data?.avatar !== "neutral" && ctx.data?.photoUrl) || ctx.kind === "duel" ? " Portrét © European Union – Source: EP." : ""}</span></p>
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
    .map((b, i) => new File([b], `${ctx.filename}-${fmt.slides.length > 1 ? `${i + 1}-z-${fmt.slides.length}${fmt.size === "story" ? "-story" : ""}` : fmt.key}-${SD_THEME_FILE[theme]}.png`, { type: "image/png" }));

  const setActions = () => {
    const many = fmt.slides.length > 1;
    const native = canShareFiles(fmt.slides.length);
    primary.dataset.act = native ? "native" : "download";
    const n = fmt.slides.length;
    primary.innerHTML = native ? `${SD_ICON.share}<span>${many ? `Sdílet ${n} obrázky…` : "Sdílet obrázek…"}</span>` : `${SD_ICON.down}<span>${many ? `Stáhnout ${n} obrázky` : "Stáhnout obrázek"}</span>`;
    if (native) { secondary.dataset.act = "download"; secondary.innerHTML = `${SD_ICON.down}<span>Stáhnout</span>`; secondary.hidden = false; }
    else { secondary.dataset.act = "copyimg"; secondary.innerHTML = `${SD_ICON.copy}<span>Kopírovat obrázek</span>`; secondary.hidden = many || !canCopyImage(); }
  };

  const showPreview = async () => {
    const seq = ++renderSeq;
    const f = SHARE_FORMATS[fmt.slides[0]];
    $(".sd-meta").textContent = `PNG · ${f.w} × ${f.h} px${fmt.slides.length > 1 ? ` · ${fmt.slides.length} obrázky` : ""} · ${theme === "light" ? "světlá" : "tmavá"}`;
    preview.className = `sd-preview${f.h > 1500 ? " tall" : ""}`;
    const slow = setTimeout(() => { if (seq === renderSeq) preview.classList.add("loading"); }, 150);
    preview.setAttribute("aria-busy", "true");
    try {
      const blobs = await Promise.all(fmt.slides.map(blobFor));
      if (seq !== renderSeq) return;
      const srcs = blobs.map((b) => { const u = URL.createObjectURL(b); objUrls.push(u); return u; });
      const names = ctx.kind === "vote" && ctx.data?.parties?.length && ctx.data.parties[0].members
        ? `; jména poslanců podle stran: ${ctx.data.parties.map((p) => `${p.label}: ${p.members.map((m) => `${m.surname} ${SHARE_SHORT[m.position]}`).join(", ")}`).join("; ")}` : "";
      const alt = (i) => `Náhled karty: ${ctx.subtitle || ctx.text}${names}${srcs.length > 1 ? ` (obrázek ${i + 1} z ${srcs.length})` : ""}`;
      preview.innerHTML = srcs.length > 1
        ? `<div class="sd-carousel" tabindex="0" aria-label="Náhled, ${srcs.length} obrázky (šipky přepínají)">${srcs.map((u, i) => `<img src="${u}" alt="${esc(alt(i))}" width="${f.w}" height="${f.h}">`).join("")}</div>
           <div class="sd-nav"><button type="button" class="sd-arr" data-step="-1" aria-label="Předchozí obrázek" disabled>‹</button>
             <span class="sd-dots" role="group" aria-label="Obrázek 1 z ${srcs.length}">${srcs.map((_, i) => `<button type="button" class="${i ? "" : "on"}" data-i="${i}" aria-label="Obrázek ${i + 1}"${i ? "" : ' aria-current="true"'}></button>`).join("")}</span>
             <button type="button" class="sd-arr" data-step="1" aria-label="Další obrázek">›</button></div>`
        : `<img src="${srcs[0]}" alt="${esc(alt(0))}" width="${f.w}" height="${f.h}">`;
      const car = preview.querySelector(".sd-carousel");
      if (car) {
        // Přepínání obrázků: vodorovné posouvání (dotyk, touchpad), šipky na klávesnici, tlačítka ‹ › a tečky (myš na desktopu).
        const imgs = [...car.children], dots = [...preview.querySelectorAll(".sd-dots button")], arrows = [...preview.querySelectorAll(".sd-arr")];
        let cur = 0;
        const current = () => {
          const mid = car.scrollLeft + car.clientWidth / 2;
          return imgs.reduce((best, im, j) => (Math.abs(im.offsetLeft + im.offsetWidth / 2 - mid) < Math.abs(imgs[best].offsetLeft + imgs[best].offsetWidth / 2 - mid) ? j : best), 0);
        };
        const mark = (i) => {
          cur = i;
          dots.forEach((d, j) => { d.classList.toggle("on", j === i); d.toggleAttribute("aria-current", j === i); });
          preview.querySelector(".sd-dots").setAttribute("aria-label", `Obrázek ${i + 1} z ${dots.length}`);
          arrows[0].disabled = i === 0;
          arrows[1].disabled = i === imgs.length - 1;
        };
        const goTo = (i) => {
          const im = imgs[Math.max(0, Math.min(imgs.length - 1, i))];
          car.scrollTo({ left: im.offsetLeft - (car.clientWidth - im.offsetWidth) / 2, behavior: "smooth" });
          mark(imgs.indexOf(im));
        };
        car.addEventListener("scroll", () => mark(current()), { passive: true });
        car.addEventListener("keydown", (ev) => {
          if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
          ev.preventDefault();
          goTo(cur + (ev.key === "ArrowRight" ? 1 : -1));
        });
        preview.querySelector(".sd-nav").addEventListener("click", (ev) => {
          const b = ev.target.closest("button");
          if (b) goTo(b.dataset.i != null ? Number(b.dataset.i) : cur + Number(b.dataset.step));
        });
      }
    } catch (e) {
      if (seq === renderSeq) { preview.innerHTML = '<p class="muted small">Náhled se nepodařilo vytvořit.</p>'; toast(e?.message || "Obrázek se nepodařilo vytvořit.", true); }
    } finally {
      clearTimeout(slow);
      if (seq === renderSeq) { preview.classList.remove("loading"); preview.removeAttribute("aria-busy"); }
    }
  };

  // Obsah a rozměr jsou dva nezávislé přepínače (radiogroup); volba se pamatuje v prohlížeči.
  const selectFormat = (content, size, focusAttr = null) => {
    fmt = pickFmt(content, size);
    for (const [attr, val] of [["content", fmt.content], ["size", fmt.size]]) {
      dlg.querySelectorAll(`[data-${attr}]`).forEach((b) => {
        const on = b.dataset[attr] === val;
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focusAttr === attr) b.focus();
      });
    }
    try { localStorage.setItem(SD_FMT_KEY, fmt.size); localStorage.setItem(SD_CONTENT_KEY, fmt.content); } catch (e) { /* bez úložiště */ }
    setActions();
    showPreview();
  };

  const selectTheme = (name) => {
    theme = CARD_THEMES.includes(name) ? name : theme;
    dlg.querySelectorAll("[data-card-theme]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cardTheme === theme)));
    try { localStorage.setItem(SD_THEME_KEY, theme); } catch (e) { /* bez úložiště */ }
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
    else if (b.dataset.content) selectFormat(b.dataset.content, fmt.size);
    else if (b.dataset.size) selectFormat(fmt.content, b.dataset.size);
    else if (b.dataset.cardTheme) { if (b.dataset.cardTheme !== theme) selectTheme(b.dataset.cardTheme); }
    else if (b.dataset.act) act(b);
  });
  dlg.querySelectorAll(".sd-content, .sd-size").forEach((grp) => grp.addEventListener("keydown", (ev) => {
    if (!{ ArrowRight: 1, ArrowDown: 1, ArrowLeft: 1, ArrowUp: 1 }[ev.key]) return;
    ev.preventDefault();
    if (grp.classList.contains("sd-content")) selectFormat(fmt.content === "detail" ? "single" : "detail", fmt.size, "content");
    else selectFormat(fmt.content, fmt.size === "story" ? "post" : "story", "size");
  }));
  $("#sd-url").addEventListener("focus", (ev) => ev.target.select());
  dlg.addEventListener("close", () => {
    objUrls.forEach((u) => URL.revokeObjectURL(u));
    dlg.remove();
    shareDlg = null;
    trigger.setAttribute("aria-expanded", "false");
    if (trigger.isConnected) trigger.focus();
  });

  dlg.querySelectorAll("[data-card-theme]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cardTheme === theme)));
  selectFormat(fmt.content, fmt.size);
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
