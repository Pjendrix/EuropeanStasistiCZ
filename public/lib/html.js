// Escapující šablona pro HTML řetězce: html`<a href="${url}">${name}</a>` escapuje každou vloženou hodnotu.
// Vnořené html`…` a pole z nich se vkládají beze změny, null/undefined/false jako prázdný text.
// Nový kód píše HTML přes html`` místo ručního esc(); výsledek je objekt, do DOM přes String(…) / innerHTML.
import { esc } from "./format.js";

class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

function part(v) {
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(part).join("");
  if (v === null || v === undefined || v === false) return "";
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new SafeHtml(out);
}

// Už bezpečné HTML (např. výstup starších funkcí z ui.js, které escapují samy). Nepoužívat na data.
export const trusted = (s) => new SafeHtml(String(s ?? ""));
