// Panel sdílení a šablony karet (X12, N1). Načítá ho až share.js při prvním kliknutí na „Sdílet“ (revize 3. 11. 2026:
// šablony a plátno mají ~26 kB gz a dřív se stahovaly na každé stránce). Obrázek se kreslí v prohlížeči (canvas → PNG):
// příspěvek 1080 × 1350 (4 : 5) a story 1080 × 1920; náhledy odkazů 1200 × 630 vznikají předem (scripts/build_cards.py).
//
// Pravidla karty: každá karta má datum, zdroj a adresu; u poslance vždy medián EP; žádné pořadí, žádné hodnocení barvou;
// loga stran a frakcí jen z oficiálních souborů na bílém štítku (bez loga zkratka a tečka); portrét s popiskem „© European Union – Source: EP“.
// Exporty (…Ops, SHARE_FORMATS, measureText, renderCardPng, useCardTheme) jsou pro e2e test karet a build_instagram.py
// (načítají je přes loadSharePanel() ze share.js, aby šlo o stejnou instanci modulu).
import { citeText } from "./data.js";
import { esc, withShareUrl } from "./format.js";
import { CARD_THEMES, SHARE_FORMATS, SHARE_SHORT } from "./share-canvas.js";
import { renderCardPng, voteHasContext } from "./share-cards.js";
export { useCardTheme, measureText, balanceRows } from "./share-canvas.js";
export { voteCardOps, mepBasicOps, metricCardOps, splitRowsFor, splitCardOps, partyCardOps, groupCardOps, lawCardOps, sessionCardOps, quizCardOps, quizGroupsCardOps, duelCardOps, cardOps } from "./share-cards.js";
export { SHARE_FORMATS, CARD_THEMES, voteHasContext, renderCardPng };

// Kód pro vložení do článku (V2): jen u stránky hlasování (v/) a poslance (p/); karta /embed/… nese zdroj a datum.
export function embedCode(url, title = "") {
  const m = /^(https?:\/\/[^/]+)\/(v|p)\/(\d+)$/.exec(url || "");
  if (!m) return "";
  return `<iframe src="${m[1]}/embed/${m[2]}/${m[3]}" title="${esc(title || "EP Watch CZ")}" width="100%" height="${m[2] === "v" ? 240 : 200}" style="border:0;max-width:640px" loading="lazy"></iframe>`;
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

export async function openSharePanel(trigger) {
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
        ${embedCode(ctx.url, ctx.title) ? `<button type="button" class="sd-textbtn" data-act="embed">${SD_ICON.copy}<span>Kopírovat kód pro vložení na web</span></button>` : ""}
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
      } else if (a === "embed") {
        await navigator.clipboard.writeText(embedCode(ctx.url, ctx.title));
        toast("Kód <iframe> zkopírován");
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
