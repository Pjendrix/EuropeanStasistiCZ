// Strojový překlad stránky (načítá se jen při zapnutém překladu, scripts/layout.py ← data/manual/site.json).
// Tlačítko v hlavičce a položka v panelu Více jsou obyčejné odkazy: bez JS vedou na návod (o-projektu#preklad),
// tady se přepíšou na Google Translate v jazyce prohlížeče (když je v seznamu z data-translate, jinak první z něj).
// Žádný skript třetí strany, nic se neodesílá; jazyk si čtenář může změnit v liště Google Translate.
import { BASE_URL } from "./lib/format.js";

// Jazyk překladu: první jazyk prohlížeče, který je v seznamu (de-AT → de), jinak první ze seznamu.
export function pickLanguage(prefs, langs) {
  for (const p of prefs || []) {
    const code = String(p).toLowerCase().split("-")[0];
    if (langs.includes(code)) return code;
  }
  return langs[0];
}

// Adresa pro Google Translate: kanonická doména (náhledy a localhost proxy nepřeloží), cesta, parametry i kotva.
export function translateUrl(loc, lang) {
  const page = new URL(loc.pathname + loc.search + loc.hash, BASE_URL).href;
  return `https://translate.google.com/translate?sl=cs&tl=${encodeURIComponent(lang)}&u=${encodeURIComponent(page)}`;
}

const NAMES = { en: "English", de: "Deutsch", pl: "Polski", uk: "Українська", fr: "Français", sk: "Slovenčina" };

function setup() {
  const links = [...document.querySelectorAll("a[data-translate]")];
  // Stránka už je přeložená (proxy *.translate.goog): tlačítko by překládalo překlad, schovat.
  if (location.hostname.endsWith(".translate.goog")) { links.forEach((a) => { a.hidden = true; }); return; }
  links.forEach((a) => {
    const langs = a.dataset.translate.split(/\s+/).filter(Boolean);
    const lang = pickLanguage(navigator.languages || [navigator.language], langs);
    const update = () => { a.href = translateUrl(location, lang); };
    update();
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = `Translate this page into ${NAMES[lang] || lang} (Google Translate) / Přeložit stránku`;
    const code = a.querySelector(".tr-code");
    if (code) code.textContent = lang.toUpperCase();
    // kvíz a další stránky mění kotvu za běhu: odkaz vždy na aktuální adresu
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    a.addEventListener("click", update);   // i z klávesnice; href se přepíše před výchozí navigací
  });
}

if (typeof document !== "undefined") setup();
