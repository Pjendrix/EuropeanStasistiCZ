// Karty ke sdílení: plátno, téma barev, měření a zalamování textu, kreslicí primitiva (rozděleno ze share.js, O13).

export const SHARE_ROOT = new URL("..", import.meta.url).href; // kořen webu (modul je v lib/)

export const SHARE_FORMATS = { post: { w: 1080, h: 1350, label: "příspěvek (4 : 5)" }, story: { w: 1080, h: 1920, label: "story (9 : 16)" },
  slide2: { w: 1080, h: 1350, label: "detail 2/3" }, slide3: { w: 1080, h: 1350, label: "detail 3/3" },
  story2: { w: 1080, h: 1920, label: "detail 2/3 (story)" }, story3: { w: 1080, h: 1920, label: "detail 3/3 (story)" },
  slide4: { w: 1080, h: 1350, label: "detail 4/4" }, story4: { w: 1080, h: 1920, label: "detail 4/4 (story)" } };
// Barvy karty podle role (design/tokens.json → python scripts/tokens.py): tmavá = dosavadní karta, světlá = volba „Vzhled“.
const SC_THEMES = { dark: { navy: "#0F172A", navy2: "#0A1226", white: "#F8FAFC", muted: "#94A3B8", soft: "#CBD5E1", gold: "#F59E0B", for: "#5BE49B", against: "#E5484D", abst: "#94A3B8", absent: "#475569", track: "#334155", text: "#F8FAFC", accent: "#F59E0B", bg0: "#0F172A", bg1: "#0A1226", line: "#334155", rowLine: "#1E293B", chip: "#1E293B", chipLine: "#475569", tile: "#16213A", tileLine: "#16213A", silhouette: "#475569", glyph: "#0A1226", pillOk: "#F8FAFC", pillOkText: "#0F172A", pillNo: "#334155", pillNoText: "#F8FAFC" }, light: { navy: "#0F172A", navy2: "#0A1226", white: "#F8FAFC", muted: "#64748B", soft: "#334155", gold: "#F59E0B", for: "#2AA560", against: "#9F1D2B", abst: "#64748B", absent: "#8092AB", track: "#E2E8F0", text: "#0F172A", accent: "#B45309", bg0: "#F8FAFC", bg1: "#F8FAFC", line: "#E2E8F0", rowLine: "#E2E8F0", chip: "#EEF2F7", chipLine: "#CBD5E1", tile: "#FFFFFF", tileLine: "#E2E8F0", silhouette: "#94A3B8", glyph: "#FFFFFF", pillOk: "#0F172A", pillOkText: "#FFFFFF", pillNo: "#475569", pillNoText: "#FFFFFF" } };
// Hlavička karty (logo, datum, téma) je v obou variantách modrá jako hlavička webu.
export const BAND = { glow: "#1E3A8A", navy: "#0F172A", navy2: "#0A1226", text: "#F8FAFC", soft: "#CBD5E1", chip: "rgba(248, 250, 252, .12)", chipLine: "rgba(248, 250, 252, .26)" };
export const CARD_THEMES = ["dark", "light"];
export let THEME = "dark", SC = SC_THEMES.dark;
// Vzhled pro kreslicí funkce: renderCardPng ho nastaví před kreslením (e2e test kreslí obě varianty).
export function useCardTheme(name) { THEME = SC_THEMES[name] ? name : "dark"; SC = SC_THEMES[THEME]; return SC; }
export const scPos = (k) => ({ FOR: SC.for, AGAINST: SC.against, ABSTENTION: SC.abst, DID_NOT_VOTE: SC.absent })[k];
export const SC_FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

export let _measureCtx = null;
export function measureText(text, size, weight) {
  _measureCtx = _measureCtx || document.createElement("canvas").getContext("2d");
  _measureCtx.font = `${weight} ${size}px ${SC_FONT}`;
  return _measureCtx.measureText(text).width;
}

export function fitText(text, size, weight, maxW) {
  if (measureText(text, size, weight) <= maxW) return text;
  let s = text;
  while (s && measureText(`${s}…`, size, weight) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

export function wrapText(text, size, weight, maxW, maxLines) {
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
export const T = (x, y, s, size, weight, fill, anchor = "left") => ({ k: "text", x, y, s, size, weight, fill, anchor });
export const RECT = (x, y, w, h, r, fill, stroke, sw) => ({ k: "rect", x, y, w, h, r, fill, stroke, sw });
export const CIRC = (x, y, r, fill, stroke, sw) => ({ k: "circ", x, y, r, fill, stroke, sw });
export const LINE = (x1, y1, x2, y2, stroke, sw) => ({ k: "line", x1, y1, x2, y2, stroke, sw });
// Tečka hlasu se symbolem uvnitř (✓ pro, ✕ proti, – zdržel se, kroužek nehlasoval): barva + tvar, aby karta fungovala i při poruše barvocitu.
export function POSDOT(cx, cy, r, pos) {
  if (pos === "DID_NOT_VOTE") return [CIRC(cx, cy, r - 2, null, SC.absent, 3)];
  const g = SC.glyph, sw = Math.max(2, r * 0.24), k = r;
  const sym = pos === "FOR" ? [LINE(cx - 0.42 * k, cy + 0.04 * k, cx - 0.12 * k, cy + 0.34 * k, g, sw), LINE(cx - 0.12 * k, cy + 0.34 * k, cx + 0.44 * k, cy - 0.32 * k, g, sw)]
    : pos === "AGAINST" ? [LINE(cx - 0.34 * k, cy - 0.34 * k, cx + 0.34 * k, cy + 0.34 * k, g, sw), LINE(cx + 0.34 * k, cy - 0.34 * k, cx - 0.34 * k, cy + 0.34 * k, g, sw)]
    : [LINE(cx - 0.4 * k, cy, cx + 0.4 * k, cy, g, sw)];
  return [CIRC(cx, cy, r, scPos(pos)), ...sym];
}
export const shift = (ops, dy) => ops.map((o) => ({ ...o, ...("y" in o ? { y: o.y + dy } : {}), ...("y1" in o ? { y1: o.y1 + dy, y2: o.y2 + dy } : {}) }));

export let _symbolImg = null; // symbol loga (assets/brand/symbol-white.svg), načte se před kreslením (setSymbolImg)
export function setSymbolImg(img) { _symbolImg = img; }

// Modrá hlavička karty (obě varianty): logo, vpravo datum, pod tím čipy (téma, česká stopa). Vrací ops a výšku pásu.
// compact (karta hlasování): čipy hned pod logem v nižším pásu, aby zbylo místo na jména poslanců.
export const bandHeight = (chips, compact = false) => (compact ? (chips && chips.length ? 150 : 120) : chips && chips.length ? 206 : 150);
export function shareHeader(right, chips = [], compact = false) {
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

export function shareFooter(H, left, url) {
  return [LINE(72, H - 128, 1008, H - 128, SC.line, 2), T(72, H - 88, fitText(left, 22, 500, 936), 22, 500, SC.muted),
    ...(url ? [T(72, H - 52, fitText(url, 24, 700, 936), 24, 700, SC.text)] : [])];
}

export function barOps(x, y, w, h, counts) {
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

export const SHARE_SHORT = { FOR: "pro", AGAINST: "proti", ABSTENTION: "zdrž.", DID_NOT_VOTE: "nehl." };



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


// --- kreslení na canvas → PNG ---------------------------------------------------------

export function roundRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r || 0, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

export function loadImage(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

export async function photoDataUrl(url) {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  } catch (e) { return null; }
}

