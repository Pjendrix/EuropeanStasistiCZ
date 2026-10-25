// Kontrola webu v prohlížeči (U12): žádná chyba v konzoli (ani porušení CSP), nic nepřetéká do šířky (1366 / 390 / 320 px), axe-core
// (WCAG 2 A/AA, 2.1 AA) bez porušení ve světlém i tmavém režimu. Spouští se v CI (.github/workflows/web-check.yml) a lokálně:
//   NODE_PATH=/cesta/k/node_modules node tests/e2e/check-web.mjs
// Web se obslouží z kopie public/ + data/ (jako Vercel: buildCommand kopíruje data do public/data).
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, mkdtempSync, readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = join(fileURLToPath(import.meta.url), "..", "..", "..");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const site = mkdtempSync(join(tmpdir(), "epwatch-"));
cpSync(join(root, "public"), site, { recursive: true });
// stejný výběr souborů jako na Vercelu (scripts/public_data.py, V17); hlasování po jednom a duel (build_shards.py)
// jsou už v public/data zkopírovaném výše
execFileSync("python3", [join(root, "scripts", "public_data.py"), join(site, "data")], { stdio: "inherit" });
// Úvod s blokem předběžných výsledků z fixture (C4): ve skutečných datech je jen pár dní po zasedání.
execFileSync("python3", [join(root, "tests", "e2e", "preliminary_page.py"), site], { stdio: "inherit" });
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
// Stejná CSP jako na Vercelu (vercel.json): porušení se v prohlížeči hlásí jako chyba v konzoli a test selže.
const CSP = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
// Adresy bez .html jako na Vercelu (vercel.json "cleanUrls": true): /x.html a /index přesměruje 308 na /x a /,
// /x obslouží soubor x.html. Odkaz na .html by tu tedy prošel jen přes přesměrování, které test hlídá (redirects).
const redirects = [];
// Pravidla z vercel.json bez podmínek (např. /moje-shoda → /kviz); cleanUrls se na Vercelu vyhodnotí dřív.
const SIMPLE_REDIRECTS = new Map(JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")).redirects.filter((r) => !r.has).map((r) => [r.source, r.destination]));
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const path = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, "");
  const clean = path.replace(/(^|\/)index(\.html)?$/, "$1").replace(/\.html$/, "");
  if (clean !== path) { redirects.push(req.url); res.writeHead(308, { location: clean + u.search }); res.end(); return; }
  // Vercel Web Analytics obsluhuje Vercel sám (/_vercel/insights/…); lokálně prázdný skript, ať v konzoli není 404.
  if (path.startsWith("/_vercel/")) { res.writeHead(200, { "content-type": "text/javascript" }); res.end(""); return; }
  const moved = SIMPLE_REDIRECTS.get(clean);
  if (moved) { res.writeHead(301, { location: moved + u.search }); res.end(); return; }
  let file = join(site, path.endsWith("/") ? `${path}index.html` : path);
  if (!existsSync(file) && !extname(path) && existsSync(`${file}.html`)) file = `${file}.html`;
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "content-security-policy": CSP });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const kv = read("data/key_votes.json");
const voteId = kv.lists.all.laws.items[0].id;
const month = kv.votes[String(voteId)].month;
const mepId = read("data/overview.json").meps[0].id;
const partyId = read("data/parties/index.json").parties[0].id;
// Příběh zákona (z/): první stránka procedury podle čísla.
const procPage = `z/${readdirSync(join(root, "public", "z")).sort()[0].replace(/\.html$/, "")}`;
// Dílčí hlasování nemá statickou stránku: interaktivní detail z hlasování po jednom (data/votes/id/, build_shards.py).
const lastMonth = read("data/votes/index.json").months.at(-1).month;
const partialId = read(`data/votes/${lastMonth}.json`).votes.find((v) => v.vote_kind === "amendment" && v.reference).id;
// Duel (B5): dvojice s aspoň jedním rozchodem v klíčových hlasováních, ať se vykreslí všechny části stránky.
const duelPair = Object.entries(read("data/duel.json").pairs).find(([, p]) => p.agreement[1] && p.diverged_key.length)[0];
const [duelA, duelB] = duelPair.split("-");
const pages = ["", "aktualne", "poslanci", "party", "party?v=eu", "party?c=EPP", "party?c=SD", "hlasovani", "votes", "temata", "radar", `vote?id=${voteId}&m=${month}`, `vote?id=${partialId}`, "zasedani", "analyzy", "rozkol", "rozhodujici", "shoda", "kviz",
  "prace", "prace-poslanci", "prace-poslanci?pohled=ucast", "prace-poslanci?pohled=aktivita", "o-projektu", `p/${mepId}`, `s/${partyId}`, `v/${voteId}`, procPage, "duel", `duel?a=${duelB}&b=${duelA}`, `d/${duelPair}`, "predbezne-e2e"];

const problems = [];
const browser = await chromium.launch();
// Web je vždy ve světlém režimu, tmavý jen po přepnutí (uložená volba „theme“). „dark“ v kontrolách = uložená volba
// tmavého režimu; systém je nastavený stejně, aby se ověřilo, že se web podle systému neřídí jen ve světlém.
const darkPick = (ctx, scheme) => (scheme === "dark" ? ctx.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch (e) { /* bez úložiště */ } }) : null);
for (const scheme of ["light", "dark"]) {
  for (const width of [1366, 390, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
    await darkPick(ctx, scheme);
    for (const url of pages) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(base + url, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const where = `${url} [${scheme}, ${width}px]`;
      errors.forEach((e) => problems.push(`${where}: chyba v konzoli: ${e}`));
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > width) problems.push(`${where}: stránka přetéká (scrollWidth ${sw} > ${width})`);
      // R1: menu (Aktuálně + zlaté tlačítko Kvíz v hlavičce; mobilní lišta pět stejných položek s Hledat, kvíz ve „Více“, O3), logo vede na rozcestník „/“.
      const nav = await page.evaluate(() => ({ now: !!document.querySelector('.site-header nav a[data-page="now"]'), quiz: !!document.querySelector(".site-header .quiz-btn"),
        tab: [...document.querySelectorAll(".tabbar > a, .tabbar > button")].map((a) => a.textContent.trim()).join(" · ") === "Aktuálně · Poslanci · Hledat · Hlasování · Více"
          && !!document.querySelector('#more-sheet a[href$="kviz"]'), logo: new URL(document.querySelector(".site-header .brand").getAttribute("href"), document.baseURI).pathname,
        about: !!document.querySelector('.site-header nav a[data-page="about"]') }));
      if (!nav.now || !nav.quiz || !nav.tab || nav.about) problems.push(`${where}: menu neodpovídá (Aktuálně ${nav.now}, Kvíz ${nav.quiz}, lišta ${nav.tab}, O projektu v liště ${nav.about})`);
      if (nav.logo !== "/") problems.push(`${where}: logo vede na ${nav.logo}, čekám /`);
      // Odkazy na stránky bez .html (cleanUrls), i ty, které doplní JavaScript.
      const htmlLinks = await page.evaluate(() => [...document.querySelectorAll("a[href], form[action]")]
        .map((a) => new URL(a.getAttribute("href") ?? a.getAttribute("action"), document.baseURI))
        .filter((u) => u.origin === location.origin && /\.html$/.test(u.pathname)).map((u) => u.pathname));
      if (htmlLinks.length) problems.push(`${where}: odkazy s .html: ${[...new Set(htmlLinks)].slice(0, 5).join(", ")}`);
      // I1: kanonická adresa (kde je) vždy na veřejné doméně
      const canon = await page.evaluate(() => document.querySelector('link[rel="canonical"]')?.href || null);
      if (canon && !canon.startsWith("https://epwatch.cz/")) problems.push(`${where}: canonical mimo epwatch.cz: ${canon}`);
      if (!url.startsWith("o-projektu")) {
        // S1: textový rozpočet. Úvodní věta ≤ 160 znaků, žádný viditelný odstavec > 220 znaků mimo details a popover.
        const text = await page.evaluate(() => {
          const out = { lead: [], long: [] };
          document.querySelectorAll("p.lead").forEach((p) => { if (p.id !== "headline" && p.textContent.trim().length > 160 && !p.closest("[popover]") && !p.classList.contains("vote-desc")) out.lead.push(p.textContent.trim().length); });
          document.querySelectorAll("main p, main .source").forEach((p) => {
            if (p.closest("details, [popover], .table-wrap") || p.classList.contains("vote-desc") || p.querySelector(":scope > .tag") || !p.offsetParent) return;
            const c = p.cloneNode(true);
            c.querySelectorAll("[popover]").forEach((x) => x.remove());
            const t = c.textContent.trim();
            if (t.length > 220) out.long.push(`${t.length} znaků: ${t.slice(0, 60)}…`);
          });
          return out;
        });
        text.lead.forEach((n) => problems.push(`${where}: .lead má ${n} znaků (max 160)`));
        text.long.forEach((t) => problems.push(`${where}: dlouhý viditelný odstavec ${t}`));
      }
      if (width === 1366) {
        await page.evaluate(axeSource);  // ne addScriptTag: vložený skript by zablokovala CSP
        const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations
          .map((x) => `${x.id} (${x.nodes.length}×): ${x.nodes[0].target.join(" ")}`));
        v.forEach((x) => problems.push(`${where}: axe ${x}`));
      }
      await page.close();
    }
    await ctx.close();
  }
}
// Předběžné výsledky (C4): blok se štítkem jen s daty; jména se rozbalí; bez dat (skutečný úvod) blok není.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "predbezne-e2e", { waitUntil: "networkidle" });
  const tag = await page.locator(".pl-note .pl-tag").isVisible();
  if (!tag) problems.push("předběžné: štítek „Předběžné“ není vidět");
  const det = page.locator(".pl-names").first();
  await det.locator("summary").click();
  if ((await det.locator("a[href^='p/']").count()) !== 21) problems.push("předběžné: rozbalení neukazuje 21 jmen");
  await page.goto(base, { waitUntil: "networkidle" });
  const freshPrelim = read("data/freshness.json").preliminary || [];
  if (!freshPrelim.length && (await page.$("#h-prelim"))) problems.push("předběžné: blok je na úvodu bez předběžných dat");
  await ctx.close();
}
// Tabulka práce poslanců (úkol 0): přepnutí pohledů a URL, řazení kliknutím na záhlaví, seskupení podle frakce.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "prace-poslanci", { waitUntil: "networkidle" });
  await page.click("#tab-ucast");
  if (!page.url().includes("pohled=ucast")) problems.push("práce: přepnutí na Účast nezměnilo URL");
  if ((await page.getAttribute("#tab-ucast", "aria-selected")) !== "true" || !(await page.$("#work .wk-axis"))) problems.push("práce: pohled Účast nemá osu");
  await page.click('#work thead button[data-key="presence"]');
  if ((await page.getAttribute('#work thead th:has(button[data-key="presence"])', "aria-sort")) !== "descending") problems.push("práce: první klik na Docházku neřadí sestupně");
  const pres = await page.$$eval("#work tbody tr:not(.wk-gh) td:nth-child(3) .wk-num", (xs) => xs.map((x) => parseFloat(x.textContent.replace(",", "."))).filter((x) => !Number.isNaN(x)));
  if (pres.some((v, i) => i && v > pres[i - 1])) problems.push("práce: řazení podle docházky neodpovídá");
  await page.click('#work thead button[data-key="name"]');
  if ((await page.getAttribute('#work thead th:has(button[data-key="name"])', "aria-sort")) !== "ascending") problems.push("práce: první klik na jméno neřadí vzestupně");
  await page.click("#group-toggle");
  if ((await page.getAttribute("#group-toggle", "aria-pressed")) !== "true" || !(await page.$$("#work .wk-gh")).length) problems.push("práce: seskupení podle frakce nefunguje");
  await page.goto(base + "prace-poslanci?pohled=aktivita", { waitUntil: "networkidle" });
  if ((await page.getAttribute("#tab-aktivita", "aria-selected")) !== "true") problems.push("práce: ?pohled=aktivita neotevřel pohled Aktivita");
  await page.focus("#tab-aktivita");
  await page.keyboard.press("ArrowRight");
  if ((await page.getAttribute("#tab-texty", "aria-selected")) !== "true") problems.push("práce: šipka v přepínači pohledů nefunguje");
  await ctx.close();
}
// Zasedání (úkol 3, 24. 10. 2026): se zmrazeným datem den po posledním dni zasedání z programu ukáže dlaždice na úvodu
// a blok na Hlasování další blok z kalendáře („program zatím nezveřejněn“), ne skončené zasedání.
{
  const ag = read("data/home.json").agenda;
  if (ag?.following) {
    const after = new Date(Date.parse(ag.to) + 864e5).toISOString().slice(0, 10);
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(`${after}T12:00:00+01:00`));
    const fmt = (a, b) => { const d = (x) => `${Number(x.slice(8))}.\u00a0${Number(x.slice(5, 7))}.\u00a0${x.slice(0, 4)}`; return a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}.–${d(b)}` : `${d(a).slice(0, -5)} – ${d(b)}`; };
    const want = fmt(ag.following.from, ag.following.to);
    await page.goto(base, { waitUntil: "networkidle" });
    const tile = await page.evaluate(() => [...document.querySelectorAll(".pt-next")].filter((x) => !x.hidden).map((x) => x.textContent));
    if (!tile.length || !tile[0].includes(want) || !tile[0].includes("Další zasedání")) problems.push(`zasedání: dlaždice k ${after} ukazuje ${JSON.stringify(tile)}, čekám ${want}`);
    await page.goto(base + "hlasovani", { waitUntil: "networkidle" });
    const block = await page.evaluate(() => document.querySelector("#dalsi-zasedani:not([hidden])")?.textContent || "");
    if (!block.includes(want) || !block.includes("program zatím nezveřejněn")) problems.push(`zasedání: blok na Hlasování k ${after} neukazuje ${want}`);
    await ctx.close();
  }
}
// Duel (B5): prohození pořadí, neplatné ID = výběr (ne chyba), „Porovnat s…“ z profilu předvyplní poslance.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + `duel?a=${duelA}&b=${duelB}`, { waitUntil: "networkidle" });
  const left = (await page.textContent(".duel-a .duel-name")).trim();
  const rows = await page.locator(".dm-row").count();
  await page.click("text=Prohodit strany");
  await page.waitForSelector(".duel-b .duel-name");
  if ((await page.textContent(".duel-b .duel-name")).trim() !== left) problems.push("duel: Prohodit strany neprohodilo poslance");
  if ((await page.locator(".dm-row").count()) !== rows || !rows) problems.push(`duel: po prohození jiný počet řádků čísel (${rows})`);
  for (const bad of [`duel?a=${duelA}&b=${duelA}`, `duel?a=${duelA}&b=9999999`, `duel?a=${duelA}&b=%3Cx%3E`, "duel?a=1%20OR%201&b=2"]) {
    await page.goto(base + bad, { waitUntil: "networkidle" });
    if ((await page.$(".duel-head")) || !(await page.$("#pick")) || !(await page.textContent("#duel")).includes("Vyberte dva poslance")) {
      problems.push(`${bad}: neplatné ID neukázalo výběr`);
    }
  }
  await page.goto(base + `p/${duelA}`, { waitUntil: "networkidle" });
  await page.click(".compare-btn");
  // #pick-a je ve statickém HTML; čekat až skript doplní seznam poslanců (#duel ztratí .loading).
  await page.waitForSelector("#duel:not(.loading)");
  if ((await page.inputValue("#pick-a")) !== duelA) problems.push("duel: Porovnat s… z profilu nepředvyplnilo poslance");
  errors.forEach((e) => problems.push(`duel: chyba ${e}`));
  await ctx.close();
}
// S1: ⓘ se otevře klikem i klávesou a zavře Esc.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  for (const url of ["prace-poslanci", "shoda", "temata"]) {
    const page = await ctx.newPage();
    await page.goto(base + url, { waitUntil: "networkidle" });
    const btn = page.locator(".info-btn").first();
    if (!(await btn.count())) { problems.push(`${url}: chybí tlačítko ⓘ`); await page.close(); continue; }
    const visible = () => page.evaluate(() => Boolean(document.querySelector(".info-pop:popover-open, .info-pop.open")));
    await btn.click();
    if (!(await visible())) problems.push(`${url}: ⓘ se neotevřelo klikem`);
    await page.keyboard.press("Escape");
    if (await visible()) problems.push(`${url}: Esc nezavřel ⓘ`);
    await btn.focus(); await page.keyboard.press("Enter");
    if (!(await visible())) problems.push(`${url}: ⓘ se neotevřelo klávesou`);
    await page.keyboard.press("Escape");
    await page.close();
  }
  await ctx.close();
}
// N1/N2 (revize sdílení): jedno „Sdílet“ v hlavičce, panel <dialog> s živým náhledem; nic ho nepřekrývá, Esc zavře a vrátí fokus.
// Bez reducedMotion, aby běžela animace .reveal (dřív kvůli ní nabídku překrývala sticky lišta).
const pngSize = (buf) => (buf.slice(1, 4).toString() === "PNG" ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);
for (const scheme of ["light", "dark"]) {
  for (const width of [1366, 390, 360]) {
    if (scheme === "dark" && width !== 1366) continue;
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme, acceptDownloads: true });
    await darkPick(ctx, scheme);
    await ctx.addInitScript(() => { window.__alerts = 0; window.alert = () => { window.__alerts += 1; }; });
    for (const url of [`v/${voteId}`, `p/${mepId}`, `s/${partyId}`, "rozkol", `vote?id=${voteId}&m=${month}`, procPage, "zasedani"]) {
      const page = await ctx.newPage();
      await page.goto(base + url, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const where = `${url} [sdílení, ${scheme}, ${width}px]`;
      const btns = page.locator("[data-share]:visible");
      if ((await btns.count()) !== 1) { problems.push(`${where}: čekám právě jedno viditelné tlačítko Sdílet, je ${await btns.count()}`); await page.close(); continue; }
      if (await page.$(".cite-btn")) problems.push(`${where}: na stránce zůstalo ❝ (.cite-btn)`);
      await btns.first().click();
      await page.waitForSelector("dialog[open] .sd-preview img", { timeout: 15000 }).catch(() => problems.push(`${where}: panel neukázal náhled`));
      // na mobilu panel vyjíždí zespodu (280 ms): měřit až po doběhnutí animace
      await page.evaluate(() => Promise.all((document.querySelector("dialog[open]")?.getAnimations() || []).map((a) => a.finished)));
      const st = await page.evaluate(() => {
        const d = document.querySelector("dialog.share-dlg[open]");
        const img = d?.querySelector(".sd-preview img");
        // každý prvek nejdřív posunout doprostřed panelu (na mobilu se panel posouvá pod lepivou hlavičkou a lištou akcí)
        const covered = d ? [...d.querySelectorAll("button:not([hidden]), a, input")].filter((e) => {
          e.scrollIntoView({ block: "center", inline: "nearest" });
          const q = e.getBoundingClientRect();
          if (!q.width) return false;
          return !e.contains(document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2));
        }).map((e) => e.textContent.trim() || e.getAttribute("aria-label") || e.id) : [];
        d?.scrollTo(0, 0);
        return { open: Boolean(d), focus: document.activeElement?.classList.contains("sd-primary"), nw: img?.naturalWidth, nh: img?.naturalHeight,
          covered, sw: document.documentElement.scrollWidth, dw: d ? d.scrollWidth - d.clientWidth : 0 };
      });
      if (!st.open) { problems.push(`${where}: klik neotevřel dialog`); await page.close(); continue; }
      if (!st.focus) problems.push(`${where}: fokus po otevření není na hlavním tlačítku`);
      if (st.nw !== 1080 || st.nh !== 1350) problems.push(`${where}: náhled má ${st.nw}×${st.nh}, čekám 1080×1350`);
      if (st.covered.length) problems.push(`${where}: ovládací prvky panelu něco překrývá: ${st.covered.join(", ")}`);
      if (st.sw > width || st.dw > 0) problems.push(`${where}: panel přetéká do šířky`);
      if (url.startsWith("v/")) {
        // Vzhled karty: výchozí podle režimu webu, přepnutí překreslí náhled a uloží volbu.
        const pressed = await page.getAttribute('.sd-themes [aria-pressed="true"]', "data-card-theme");
        if (pressed !== scheme) problems.push(`${where}: výchozí vzhled karty je ${pressed}, čekám ${scheme} (podle režimu webu)`);
        const other = scheme === "dark" ? "light" : "dark";
        const before = await page.getAttribute(".sd-preview img", "src");
        await page.click(`[data-card-theme="${other}"]`);
        await page.waitForFunction((b) => { const i = document.querySelector(".sd-preview img"); return i && i.getAttribute("src") !== b && i.naturalWidth === 1080; }, before, { timeout: 15000 })
          .catch(() => problems.push(`${where}: po přepnutí vzhledu se náhled nepřekreslil`));
        if (!(await page.textContent(".sd-meta")).includes(other === "light" ? "světlá" : "tmavá")) problems.push(`${where}: popisek náhledu neuvádí vzhled`);
        if ((await page.evaluate(() => localStorage.getItem("ep-share-theme"))) !== other) problems.push(`${where}: volba vzhledu se neuložila`);
        await page.click(`[data-card-theme="${scheme}"]`);
        await page.waitForFunction((s) => document.querySelector(".sd-meta")?.textContent.includes(s), scheme === "light" ? "světlá" : "tmavá", { timeout: 15000 }).catch(() => {});
      }
      if (width === 1366) {
        await page.evaluate(axeSource);  // ne addScriptTag: vložený skript by zablokovala CSP
        const v = await page.evaluate(async () => (await axe.run(document.querySelector("dialog.share-dlg"), { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations
          .map((x) => `${x.id} (${x.nodes.length}×): ${x.nodes[0].target.join(" ")}`));
        v.forEach((x) => problems.push(`${where}: axe v panelu ${x}`));
      }
      if (scheme === "light" && width === 1366 && url.startsWith("v/")) {
        // Co je v náhledu, to se stáhne: PNG 1080 × 1350; story 1080 × 1920.
        const [dl] = await Promise.all([page.waitForEvent("download"), page.click(".sd-primary")]);
        const size = pngSize(await (await import("node:fs/promises")).readFile(await dl.path()));
        if (!size || size[0] !== 1080 || size[1] !== 1350) problems.push(`${where}: stažená karta není PNG 1080 × 1350 (${size})`);
        if (!dl.suggestedFilename().endsWith("-post-svetla.png")) problems.push(`${where}: název souboru ${dl.suggestedFilename()} nemá příponu -svetla`);
        await page.click('[data-size="story"]');
        await page.waitForFunction(() => document.querySelector(".sd-preview img")?.naturalHeight === 1920, null, { timeout: 15000 })
          .catch(() => problems.push(`${where}: po přepnutí na Story náhled nemá 1080 × 1920`));
        await page.click('[data-size="post"]');   // vrátit uložený rozměr
        // Kopírovat obrázek: ClipboardItem s PNG (mock schránky)
        const copied = await page.evaluate(async () => {
          let got = null;
          window.ClipboardItem = window.ClipboardItem || function (o) { this.types = Object.keys(o); };
          Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write: async (items) => { got = items[0].types; }, writeText: async () => {} } });
          document.querySelector('[data-act="copyimg"]')?.click();
          await new Promise((r) => setTimeout(r, 1500));
          return { got, toast: document.querySelector('.sd-toast[role="status"]')?.textContent || "" };
        });
        if (!copied.got || !copied.got.includes("image/png")) problems.push(`${where}: Kopírovat obrázek nezapsal PNG do schránky`);
        if (!/schránce/.test(copied.toast)) problems.push(`${where}: chybí potvrzení přes role="status"`);
      }
      if (scheme === "light" && width === 1366 && url.startsWith("p/")) {
        await page.click('[data-content="detail"]');
        await page.waitForFunction(() => document.querySelectorAll(".sd-carousel img").length === 3 && [...document.querySelectorAll(".sd-carousel img")].every((i) => i.naturalWidth === 1080 && i.naturalHeight === 1350), null, { timeout: 20000 })
          .catch(() => problems.push(`${where}: detail nemá 3 obrázky 1080 × 1350 v karuselu`));
        // na desktopu jde mezi obrázky přepínat myší: tlačítko › a tečky (vodorovné posouvání myš neumí)
        const shown = () => page.evaluate(() => {
          const car = document.querySelector(".sd-carousel"), mid = car.getBoundingClientRect().left + car.clientWidth / 2;
          const imgs = [...car.querySelectorAll("img")].map((i) => Math.abs(i.getBoundingClientRect().left + i.getBoundingClientRect().width / 2 - mid));
          return { img: imgs.indexOf(Math.min(...imgs)), dot: [...document.querySelectorAll(".sd-dots button")].findIndex((d) => d.classList.contains("on")) };
        });
        await page.click('.sd-arr[data-step="1"]'); await page.waitForTimeout(600);
        await page.click('.sd-arr[data-step="1"]'); await page.waitForTimeout(600);
        const after2 = await shown();
        if (after2.img !== 2 || after2.dot !== 2 || !(await page.isDisabled('.sd-arr[data-step="1"]'))) problems.push(`${where}: tlačítko › nepřeplo na 3. obrázek (${JSON.stringify(after2)})`);
        await page.click('.sd-dots button[data-i="0"]'); await page.waitForTimeout(600);
        if ((await shown()).img !== 0) problems.push(`${where}: tečka nepřepla na 1. obrázek`);
        // detail jako story: 3 obrázky 1080 × 1920
        await page.click('[data-size="story"]');
        await page.waitForFunction(() => document.querySelectorAll(".sd-carousel img").length === 3 && [...document.querySelectorAll(".sd-carousel img")].every((i) => i.naturalWidth === 1080 && i.naturalHeight === 1920), null, { timeout: 20000 })
          .catch(() => problems.push(`${where}: detail story nemá 3 obrázky 1080 × 1920`));
        await page.click('[data-size="post"]');
        await page.click('[data-content="single"]');
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => ({ open: Boolean(document.querySelector("dialog.share-dlg")), focus: document.activeElement?.matches("[data-share]"), alerts: window.__alerts }));
      if (after.open || !after.focus) problems.push(`${where}: Esc nezavřel panel nebo nevrátil fokus na tlačítko`);
      if (after.alerts) problems.push(`${where}: volání alert()`);
      await page.close();
    }
    await ctx.close();
  }
}
// N2: v ⓘ u čísla je „Sdílet číslo“ a otevře panel s kartou čísla.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + `p/${mepId}`, { waitUntil: "networkidle" });
  await page.click(".metric .info-wrap.corner .info-btn");
  const share = page.locator('.info-pop:popover-open [data-share^="metric:"]');
  if (!(await share.count())) problems.push("profil: v ⓘ u čísla chybí „Sdílet číslo“");
  else {
    await share.click();
    await page.waitForSelector("dialog[open] .sd-preview img", { timeout: 15000 }).catch(() => problems.push("profil: Sdílet číslo neotevřel panel s náhledem"));
    const title = await page.textContent("dialog[open] #sd-h").catch(() => "");
    if (title !== "Sdílet číslo") problems.push(`profil: panel čísla má nadpis „${title}“`);
  }
  if (!(await page.locator('.info-pop [data-cite]').count())) problems.push("profil: v ⓘ u čísla chybí „Citovat“");
  await ctx.close();
}
// Aktuálně (dřívější úvod): hemicykl a přepínač 1/5 → 5/5, střed F : A = počet teček, ⓘ. Rozcestník: „/“ zaměří
// hledání v heru, šipky + Enter otevřou položku, Esc smaže.
for (const width of [1440, 400]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base + "aktualne", { waitUntil: "networkidle" });
  const where = `aktualne [karta hlasování, ${width}px]`;
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > width) problems.push(`${where}: přetéká (${sw})`);
  const n = await page.evaluate(() => JSON.parse(document.getElementById("home-data").textContent).votes.length);
  for (let i = 0; i < n; i++) {
    const st = await page.evaluate(() => {
      const seats = [...document.querySelectorAll(".hm-seat")];
      const big = document.getElementById("hm-big").textContent.split(":").map(Number);
      return { idx: document.getElementById("hm-idx").textContent, big, f: seats.filter((x) => x.dataset.pos === "F").length, a: seats.filter((x) => x.dataset.pos === "A").length,
        prev: document.getElementById("hm-prev").disabled, next: document.getElementById("hm-next").disabled, seats: seats.length };
    });
    if (st.idx !== `${i + 1} / ${n}`) problems.push(`${where}: přepínač ukazuje ${st.idx}, čekám ${i + 1} / ${n}`);
    if (st.big[0] !== st.f || st.big[1] !== st.a) problems.push(`${where}: střed ${st.big.join(":")} nesedí s tečkami ${st.f}:${st.a}`);
    if (st.prev !== (i === 0) || st.next !== (i === n - 1)) problems.push(`${where}: tlačítka přepínače na kraji nejsou vypnutá (${i + 1}/${n})`);
    if (i < n - 1) { await page.click("#hm-next"); await page.waitForTimeout(250); }
  }
  // ⓘ u karty: vysvětlivka v popoveru webu, bez porušení axe (odkazy a štítek AI na světlém podkladu)
  await page.click(".hm-info .info-btn");
  if (!(await page.locator("#hm-about:popover-open").count())) problems.push(`${where}: ⓘ neotevřel vysvětlivku`);
  else {
    await page.evaluate(axeSource);
    const v = await page.evaluate(async () => (await axe.run(document.getElementById("hm-about"), { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => `${x.id} (${x.nodes.length}×)`));
    v.forEach((x) => problems.push(`${where}: axe ve vysvětlivce ⓘ ${x}`));
    await page.keyboard.press("Escape");
  }
  // hledání v heru je jen na rozcestníku; chvíli počkat, než IntersectionObserver (app.js) zjistí, že pole je vidět
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.mouse.click(2, 300);
  await page.keyboard.press("/");
  if (!(await page.evaluate(() => document.activeElement?.id === "hub-q"))) problems.push(`${where}: „/“ nezaměřil hledání`);
  await page.keyboard.type("ondrej");
  await page.waitForSelector("#hub-results:not([hidden]) [role=option]", { timeout: 10000 }).catch(() => problems.push(`${where}: hledání neukázalo výsledky`));
  const groupsOk = await page.evaluate(() => [...document.querySelectorAll("#hub-results .hm-g")].map((g) => g.textContent));
  if (!groupsOk.includes("Poslanci")) problems.push(`${where}: výsledky nejsou seskupené (${groupsOk})`);
  await page.keyboard.press("Escape");
  if (await page.evaluate(() => document.getElementById("hub-q").value || !document.getElementById("hub-results").hidden)) problems.push(`${where}: Esc nesmazal hledání`);
  await page.keyboard.type("ondrej");
  await page.waitForSelector("#hub-results:not([hidden]) [role=option]", { timeout: 10000 }).catch(() => {});
  await page.keyboard.press("ArrowDown");
  const target = await page.evaluate(() => document.querySelector('#hub-results [aria-selected="true"] a')?.getAttribute("href"));
  await Promise.all([page.waitForURL((u) => target && u.pathname.endsWith(target.replace(/^\.\//, "")), { timeout: 10000 }).catch(() => problems.push(`${where}: Enter neotevřel ${target}`)), page.keyboard.press("Enter")]);
  await ctx.close();
}
// R2 rozcestník: nadpis v oblouku se nepotká s tečkami, na 1366 × 900 jsou tři hlavní úkoly (první řada pod herem, audit UX 2026-10-18) vidět bez scrollu,
// po úvodní animaci tečky 1–5 přepínají hlasování a pauza zastaví přepínání; s prefers-reduced-motion statický stav.
for (const [w, h] of [[1366, 900], [390, 844]]) {
  for (const motion of ["no-preference", "reduce"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: motion });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(base, { waitUntil: "networkidle" });
    const where = `rozcestník [${w}px, ${motion}]`;
    const before = await page.textContent("#pt-k");
    await page.waitForTimeout(motion === "reduce" ? 6000 : 3200);   // úvod animace asi 2,6 s; bez pohybu se nesmí nic přepnout
    const st = await page.evaluate(() => {
      const t = document.querySelector(".pt-art h1").getBoundingClientRect();
      const seats = [...document.querySelectorAll("#pt-svg .hm-f")].map((c) => c.getBoundingClientRect());
      return { overlap: seats.filter((s) => s.right > t.left && s.left < t.right && s.bottom > t.top && s.top < t.bottom).length,
        now: document.querySelector(".pt-tasks").getBoundingClientRect().bottom, k: document.getElementById("pt-k").textContent,
        ctl: !document.getElementById("pt-ctl").hidden, paused: document.getElementById("pt-pp").getAttribute("aria-pressed"),
        pos: [...document.querySelectorAll("#pt-svg .hm-seat")].map((a) => a.dataset.pos).join(""),
        titles: [...document.querySelectorAll("#pt-svg .hm-seat title")].filter((x) => x.textContent.includes(":")).length,
        seats: document.querySelectorAll("#pt-svg .hm-seat").length };
    });
    if (st.overlap) problems.push(`${where}: nadpis se překrývá s ${st.overlap} tečkami`);
    if (w === 1366 && st.now > h) problems.push(`${where}: tři hlavní úkoly nejsou bez scrollu vidět (konec ${Math.round(st.now)} px)`);
    if (!st.ctl) problems.push(`${where}: chybí ovládání (tečky 1–5, pauza)`);
    if (st.titles !== st.seats) problems.push(`${where}: tečky bez <title> se jménem a hlasem (${st.titles}/${st.seats})`);
    if (/G/.test(st.pos) || !st.k.startsWith("Poslední hlasování")) problems.push(`${where}: po úvodu není vidět hlasování (${st.k})`);
    if (motion === "reduce" && (st.k !== before || st.paused !== "true")) problems.push(`${where}: bez pohybu se hlasování přeplo nebo neběží pauza`);
    if (motion === "no-preference") {
      const t1 = await page.textContent("#pt-t");
      await page.click('.pt-d[data-i="2"]');
      const k3 = await page.textContent("#pt-t");
      if (k3 === t1 || (await page.getAttribute('.pt-d[data-i="2"]', "aria-current")) !== "true") problems.push(`${where}: tečka 3 nepřepnula hlasování`);
      if (!(await page.textContent("#pt-live")).length) problems.push(`${where}: volba uživatele se nehlásí čtečce (aria-live)`);
      await page.click("#pt-pp");
      if ((await page.getAttribute("#pt-pp", "aria-pressed")) !== "true") problems.push(`${where}: pauza nemá aria-pressed`);
      await page.waitForTimeout(6000);
      if ((await page.textContent("#pt-t")) !== k3) problems.push(`${where}: po pauze se hlasování dál přepíná`);
    }
    errs.forEach((e) => problems.push(`${where}: chyba ${e}`));
    await ctx.close();
  }
}
// B2: hledání v liště z libovolné stránky (i z podsložek p/, v/): „/“ otevře dialog, „Kolář“ najde poslance, Enter na něj
// přejde; Esc dialog zavře a vrátí fokus na tlačítko s lupou; otevřený dialog bez porušení axe.
for (const width of [1366, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  for (const url of ["poslanci", "p/256846", `v/${voteId}`]) {
    const page = await ctx.newPage();
    const where = `${url} [hledání v liště, ${width}px]`;
    await page.goto(base + url, { waitUntil: "networkidle" });
    await page.keyboard.press("/");
    await page.waitForTimeout(150);
    if (!(await page.evaluate(() => document.querySelector("dialog.search-dlg")?.open))) { problems.push(`${where}: „/“ neotevřel dialog`); await page.close(); continue; }
    await page.evaluate(axeSource);
    const v = await page.evaluate(async () => (await axe.run(document.querySelector("dialog.search-dlg"), { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => x.id));
    v.forEach((id) => problems.push(`${where}: axe v dialogu: ${id}`));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ open: document.querySelector("dialog.search-dlg").open, focus: document.activeElement?.classList.contains("search-btn") }));
    if (after.open || !after.focus) problems.push(`${where}: Esc nezavřel dialog nebo nevrátil fokus na tlačítko`);
    await page.keyboard.press("/");
    await page.keyboard.type("Kolář");
    const hit = await page.waitForSelector("#site-results [role=option]", { timeout: 8000 }).catch(() => null);
    if (!hit) { problems.push(`${where}: „Kolář“ nic nenašel`); await page.close(); continue; }
    await Promise.all([page.waitForURL(/p\/256846$/, { timeout: 10000 }).catch(() => problems.push(`${where}: Enter nepřešel na poslance`)), page.keyboard.press("Enter")]);
    await page.close();
  }
  await ctx.close();
}
// Téma hlasování: čip na detailu (statickém = JS šablona) i v heru, odkaz na filtr, „+N“ klávesou a Esc, výměna s přepínačem.
{
  const voteCats = read("data/vote_cats.json").votes;
  const multi = Object.keys(voteCats).find((id) => voteCats[id].length >= 2 && existsSync(join(root, "public", "v", `${id}.html`)));
  for (const width of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(base + `v/${multi}`, { waitUntil: "networkidle" });
    const where = `v/${multi} [téma, ${width}px]`;
    // Funkce webu jsou v ES modulech (lib/*.js), ne globální: test si je naimportuje (stejná instance jako stránka).
    const same = await page.evaluate(async (id) => {
      const lib = (f) => import(new URL(`lib/${f}`, document.querySelector('script[src*="app.js"]').src).href);
      const [{ getJSON, loadCategories }, { topicChips }] = await Promise.all([lib("data.js"), lib("ui.js")]);
      await loadCategories();
      const cats = (await getJSON("vote_cats.json")).votes[id];
      // app.js po načtení přesouvá popovery do <body>: porovnat čipy bez popoverů a popovery podle id zvlášť
      const fresh = new DOMParser().parseFromString(topicChips(cats, { max: 4, link: true, id, root: "../", info: true }), "text/html").body.firstChild;
      const pops = [...fresh.querySelectorAll("[popover]")];
      const popsOk = pops.every((x) => document.getElementById(x.id)?.outerHTML === x.outerHTML);
      pops.forEach((x) => x.remove());
      const live = document.querySelector(".vote-meta .topic-chips")?.cloneNode(true);
      live?.querySelectorAll("[popover]").forEach((x) => x.remove());
      return popsOk && live?.outerHTML === fresh.outerHTML;
    }, multi);
    if (!same) problems.push(`${where}: čipy statické stránky se liší od topicChips() v JS`);
    // „+N“ (tady vynucené max 1) se otevře klávesou a zavře Esc
    await page.evaluate(async (id) => { const lib = (f) => import(new URL(`lib/${f}`, document.querySelector('script[src*="app.js"]').src).href); const [{ getJSON }, { topicChips }] = await Promise.all([lib("data.js"), lib("ui.js")]); const cats = (await getJSON("vote_cats.json")).votes[id]; const el = document.createElement("div"); el.id = "tc-test"; el.innerHTML = topicChips(cats, { max: 1, id: "e2e" }); document.querySelector("main").prepend(el); }, multi);
    await page.focus("#tc-test .tc-more");
    await page.keyboard.press("Enter");
    const open = await page.evaluate(() => Boolean(document.querySelector("#tc-e2e:popover-open")));
    await page.keyboard.press("Escape");
    const closed = await page.evaluate(() => !document.querySelector("#tc-e2e:popover-open"));
    if (!open || !closed) problems.push(`${where}: „+N“ se neotevřel klávesou nebo nezavřel Esc`);
    // čip vede na filtr a filtr se použije
    const href = await page.getAttribute(".vote-meta .topic-chip", "href");
    await Promise.all([page.waitForURL(/votes\?c=/), page.click(".vote-meta a.topic-chip")]);
    await page.waitForSelector("#list tr, #list .card, tbody tr", { timeout: 15000 }).catch(() => {});
    const c = new URL(page.url()).searchParams.get("c");
    const applied = await page.evaluate((c) => [...document.querySelectorAll("select")].some((sel) => sel.value === c), c);
    if (!href?.includes(`c=${c}`) || !applied) problems.push(`${where}: čip nevede na použitý filtr (${href})`);
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base + "aktualne", { waitUntil: "networkidle" });
  const home = read("data/home.json");
  for (let i = 0; i < home.votes.length; i++) {
    const got = await page.evaluate(() => [...document.querySelectorAll("#hm-cap .hm-topic .topic-chips > .topic-chip")].map((a) => a.getAttribute("href")));
    const exp = home.votes[i].topics.slice(0, 1).map((t) => `votes?c=${t.slug}`);
    if (JSON.stringify(got) !== JSON.stringify(exp)) problems.push(`aktualne: čip tématu u hlasování ${i + 1}/5 je ${got}, čekám ${exp}`);
    if (i < home.votes.length - 1) { await page.click("#hm-next"); await page.waitForTimeout(250); }
  }
  await ctx.close();
}
// Sdílení bez úložiště (soukromé okno, zakázané cookies): localStorage hází výjimku, panel funguje s výchozím vzhledem.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, colorScheme: "dark" });
  await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("MOCK zakázané úložiště", "SecurityError"); } }); });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(base + `v/${voteId}`, { waitUntil: "networkidle" });
  await page.click("[data-share]");
  await page.waitForSelector("dialog[open] .sd-preview img", { timeout: 15000 }).catch(() => problems.push("sdílení bez úložiště: panel neukázal náhled"));
  if ((await page.getAttribute('.sd-themes [aria-pressed="true"]', "data-card-theme").catch(() => null)) !== "light") problems.push("sdílení bez úložiště: výchozí vzhled karty není světlý");
  if ((await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) !== "light") problems.push("bez úložiště a s tmavým systémem: web není ve světlém režimu");
  await page.click('[data-card-theme="dark"]').catch(() => {});
  await page.waitForFunction(() => document.querySelector(".sd-meta")?.textContent.includes("tmavá"), null, { timeout: 15000 }).catch(() => problems.push("sdílení bez úložiště: přepnutí na tmavou kartu nefunguje"));
  errs.filter((e) => /share|Vzhled|theme/i.test(e)).forEach((e) => problems.push(`sdílení bez úložiště: chyba ${e}`));
  await ctx.close();
}
// N3: pravidla nových karet (metric, split, party) s MOCK daty: text se vejde, chybějící hodnota se vynechá,
// počet řádků napsaný na kartě = počet vykreslených řádků; neutrální avatar nekreslí portrét.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + `v/${voteId}`, { waitUntil: "networkidle" });
  const r = await page.evaluate(async () => {
    const lib = (f) => import(new URL(`lib/${f}`, document.querySelector('script[src*="app.js"]').src).href);
    const { isStale, sessionCountdown } = await lib("format.js");
    // share.js se stejnou adresou (s ?v=) jako na stránce: stejná instance modulu, nespustí se podruhé
    const { SHARE_FORMATS, measureText, metricCardOps, splitCardOps, splitRowsFor, partyCardOps, voteCardOps, mepBasicOps, useCardTheme, CARD_THEMES } =
      await import(document.querySelector('script[src*="share.js"]').src);
    await document.fonts.ready;
    const out = [];
    const fits = (name, ops) => ops.filter((o) => o.k === "text").forEach((o) => {
      const w = measureText(o.s, o.size, o.weight);
      const x0 = o.anchor === "right" ? o.x - w : o.anchor === "center" ? o.x - w / 2 : o.x;
      if (x0 < 50 || x0 + w > 1030) out.push(`${name}: text „${o.s.slice(0, 40)}“ přetéká (${Math.round(x0)}–${Math.round(x0 + w)})`);
    });
    const texts = (ops) => ops.filter((o) => o.k === "text").map((o) => o.s).join(" | ");
    const base = { dataDay: "2026-10-10", urlShort: "epwatch.cz/p/1#dochazka" };
    // Kontrast na světlé i tmavé kartě: text pod modrou hlavičkou ≥ 4,5 : 1 proti tělu karty, tečky hlasů ≥ 3 : 1.
    const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const contrast = (name, ops, bg) => {
      const band = ops.find((o) => o.k === "band");
      const below = (o) => !band || o.y > band.h;
      // podklad textu = poslední vyplněný obdélník pod ním (pilulka, dlaždice), jinak tělo karty
      const under = (o) => [...ops.slice(0, ops.indexOf(o))].reverse().find((r) => r.k === "rect" && /^#[0-9A-F]{6}$/i.test(r.fill || "")
        && o.y - o.size / 3 >= r.y && o.y - o.size / 3 <= r.y + r.h && o.x >= r.x && o.x <= r.x + r.w)?.fill || bg;
      ops.filter((o) => o.k === "text" && below(o) && /^#[0-9A-F]{6}$/i.test(o.fill) && ratio(o.fill, under(o)) < 4.5)
        .forEach((o) => out.push(`${name}: text „${o.s.slice(0, 30)}“ má kontrast ${ratio(o.fill, under(o)).toFixed(2)} : 1`));
      ops.filter((o) => o.k === "circ" && below(o) && o.r >= 12 && (o.fill || o.stroke) && ratio(o.fill || o.stroke, bg) < 3)
        .forEach((o) => out.push(`${name}: tečka ${o.fill || o.stroke} má kontrast ${ratio(o.fill || o.stroke, bg).toFixed(2)} : 1`));
    };
    for (const theme of CARD_THEMES) {
    const SC = useCardTheme(theme);
    for (const [fk0, f] of [["post", SHARE_FORMATS.post], ["story", SHARE_FORMATS.story]]) {
      const fk = `${fk0} ${theme}`;
      const m1 = metricCardOps({ ...base, context: "MOCK Poslanec Dlouhé Jméno · EPP · TOP09/STAN", label: "Účast na hlasování – závěrečná", pair: [588, 615], median: 0.91, medLabel: "medián EP", definition: "MOCK definice. ".repeat(20) }, f);
      fits(`metric ${fk}`, m1);
      const m2 = metricCardOps({ ...base, context: "MOCK", label: "Shoda s ostatními Čechy", pair: [10, 20], median: null, medLabel: "" }, f);
      if (/medián/.test(texts(m2))) out.push(`metric ${fk}: bez mediánu se medián nesmí kreslit`);
      const rows = Array.from({ length: 12 }, (_, i) => ({ meta: `8. 10. 2026 · pozměňovací návrh · přijato`, title: `MOCK hlasování ${i + 1} s velmi dlouhým názvem, který se musí zalomit a zkrátit, aby se vešel na kartu`, score: "10 : 9", scoreSub: "pro : proti" }));
      const sp = splitCardOps({ ...base, title: "Kde se Češi rozdělili", lead: "MOCK věta o zasedání.", total: 50, rows }, f);
      fits(`split ${fk}`, sp);
      const n = splitRowsFor(f);
      const drawn = sp.filter((o) => o.k === "text" && o.s === "10 : 9").length;
      if (drawn !== n || !texts(sp).includes(`prvních ${n} z 50`)) out.push(`split ${fk}: na kartě napsáno jinak než vykresleno (${drawn} řádků, čekám ${n})`);
      const pc = partyCardOps({ ...base, name: "MOCK strana", sub: "MOCK · 2 poslanci v mandátu", tiles: [{ label: "Účast poslanců na hlasování", pair: [9, 10] }, { label: "Jednotnost", pair: null }, { label: "Soulad s výsledkem", pair: [0, 0] }] }, f);
      fits(`party ${fk}`, pc);
      if (/Jednotnost|Soulad/.test(texts(pc))) out.push(`party ${fk}: chybějící hodnota se nevynechala`);
      [["metric", m1], ["split", sp], ["party", pc]].forEach(([n, ops]) => contrast(`${n} ${fk}`, ops, SC.bg0));
    }
    // karta hlasování s tématem a bez něj (MOCK): text se vejde, bez tématu žádný řádek tématu
    const vbase = { ...base, title: "MOCK hlasování s dlouhým názvem, který se musí zalomit a zkrátit na kartě", subtitle: "MOCK", date: "2026-10-08", kindLabel: "závěrečné hlasování",
      result: "ADOPTED", resultLabel: "přijato", sentence: "Parlament text přijal", ep: [400, 200, 30, 50], parties: [{ label: "MOCK", groups: ["EPP"], positions: ["FOR", "AGAINST"] }] };
    for (const f of [SHARE_FORMATS.post, SHARE_FORMATS.story]) {
      // strana se 7 poslanci (všechny tečky se vykreslí) a 10 stran: obsah se vejde nad patičku
      const seven = { label: "ANO 2011", groups: ["PfE"], positions: ["AGAINST", "ABSTENTION", "ABSTENTION", "ABSTENTION", "ABSTENTION", "ABSTENTION", "DID_NOT_VOTE"] };
      const full = voteCardOps({ ...vbase, topic: "Práva a občanství", trace: true, subtitle: "Návrh Komise · A10-0254/2026",
        parties: [seven, ...Array.from({ length: 9 }, (_, i) => ({ label: `MOCK ${i}`, groups: ["EPP"], positions: ["FOR", "FOR"] }))] }, f);
      fits(`vote ${theme} 7 teček`, full);
      contrast(`vote ${theme}`, full, SC.bg0);
      const foot = Math.min(...full.filter((o) => o.k === "line" && o.x1 === 72 && o.x2 === 1008).map((o) => o.y1).filter((y) => y > f.h - 200));
      const lowest = Math.max(...full.filter((o) => o.k !== "band" && "y" in o && o.y < foot - 1).map((o) => o.y + (o.r || 0)));
      if (lowest > foot) out.push(`vote ${theme} ${f.h}: obsah zasahuje do patičky (${lowest} > ${foot})`);
      const dots7 = full.filter((o) => o.k === "circ" && o.r === 13).length;
      if (dots7 < 6 + 18) out.push(`vote ${theme} ${f.h}: nevykreslily se všechny tečky stran (${dots7})`);
      const withT = voteCardOps({ ...vbase, topic: "Klima, příroda a energie (+2) a ještě mnohem delší text, který se nevejde" }, f);
      fits("vote s tématem", withT);
      if (!/Klima, příroda a energie/.test(texts(withT))) out.push("vote: chybí téma na kartě");
      if (/Klima/.test(texts(voteCardOps({ ...vbase, topic: null }, f)))) out.push("vote: bez tématu se řádek tématu vypsal");
      const tr = voteCardOps({ ...vbase, topic: "Klima, příroda a energie (+2) a ještě mnohem delší text, který se nevejde", trace: true }, f);
      fits("vote s tématem a českou stopou", tr);
      if (!/ČESKÁ STOPA/.test(texts(tr))) out.push("vote: chybí štítek česká stopa");
      if (/ČESKÁ STOPA/.test(texts(withT))) out.push("vote: štítek česká stopa bez záznamu");
    }
    }
    useCardTheme("dark");
    // odpočet a pruh o starých datech (čisté funkce v lib/format.js)
    const cd = [["2026-10-19", "2026-10-22", "2026-10-18", "zítra"], ["2026-10-19", "2026-10-22", "2026-10-16", "za 3 dny"],
      ["2026-10-19", "2026-10-22", "2026-10-12", "za 7 dní"], ["2026-10-19", "2026-10-22", "2026-10-20", "právě probíhá"]];
    cd.forEach(([a, b, t, want]) => { if (sessionCountdown(a, b, t) !== want) out.push(`odpočet ${t}: „${sessionCountdown(a, b, t)}“, čekám „${want}“`); });
    const fr = { release: "2026-10-10", stale_days: 14, sittings_after: ["2026-10-19"] };
    if (isStale(fr, "2026-10-20")) out.push("pruh: data mladší než 14 dní");
    if (!isStale(fr, "2026-10-25")) out.push("pruh: chybí po 14 dnech a zasedání");
    if (isStale({ ...fr, sittings_after: [] }, "2026-11-30")) out.push("pruh: bez zasedání od data dat se nemá ukázat");
    if (isStale({ ...fr, sittings_after: ["2026-12-01"] }, "2026-11-30")) out.push("pruh: zasedání ještě neproběhlo");
    const neutral = mepBasicOps({ ...base, name: "MOCK Poslanec", avatar: "neutral", photo: { width: 10, height: 10 }, chips: [], attendance: [1, 2], attendanceMedian: 0.9 }, SHARE_FORMATS.post);
    if (neutral.some((o) => o.k === "image" && o.img && o.img.width === 10) || /European Union/.test(texts(neutral))) out.push("mep: avatar neutral kreslí portrét");
    return out;
  });
  r.forEach((x) => problems.push(`karty: ${x}`));
  await ctx.close();
}
// Karta hlasování se jmény (zadání 20. 10. 2026, K3): hlavní hlasování posledních 3 zasedání a 20 náhodných dílčích
// (pevné semínko), obě varianty vzhledu, příspěvek i story. Nic pod patičkou, karty stran se nepřekrývají, každý poslanec
// právě jednou (jménem, v záložní variantě tečkou), názvy stran a frakcí z číselníků. Plus balanceRows a starší složení.
{
  const months = read("data/votes/index.json").months.map((m) => m.month);
  const all = months.flatMap((m) => read(`data/votes/${m}.json`).votes.map((v) => ({ id: v.id, date: v.date, main: v.is_main, month: m })));
  const days = [...new Set(all.map((v) => v.date))].sort();
  const sessions = [];
  days.forEach((d) => { const last = sessions.at(-1); if (last && (new Date(d) - new Date(last.at(-1))) / 864e5 <= 4) last.push(d); else sessions.push([d]); });
  const lastDays = new Set(sessions.slice(-3).flat());
  let seed = 20261020;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const partials = all.filter((v) => !v.main);
  const picks = [...all.filter((v) => v.main && lastDays.has(v.date)), ...Array.from({ length: 20 }, () => partials[Math.floor(rnd() * partials.length)])];
  const old = all.find((v) => v.main && v.month === "2024-11");
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  let fallbacks = 0;
  for (const v of [...new Map([...picks, old].filter(Boolean).map((x) => [x.id, x])).values()]) {
    await page.goto(base + `vote?id=${v.id}&m=${v.month}`, { waitUntil: "networkidle" });
    const r = await page.evaluate(async (isOld) => {
      const src = document.querySelector('script[src*="share.js"]').src;
      const m = await import(src);
      for (let i = 0; i < 50 && typeof window.shareContext !== "function"; i++) await new Promise((res) => setTimeout(res, 100));
      const sc = await window.shareContext("");
      await document.fonts.ready;
      const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = new URL(u, src).href; });
      const data = { ...sc.data, parties: await Promise.all(sc.data.parties.map(async (it) => (it.logo ? { ...it, logoImg: await load(it.logo) } : it))) };
      const ids = data.parties.flatMap((it) => it.members.map((x) => x.id)).sort();
      const out = [];
      let dots = 0;
      for (const theme of m.CARD_THEMES) for (const key of ["post", "story"]) {
        const SC = m.useCardTheme(theme), f = m.SHARE_FORMATS[key];
        const ops = m.cardOps("vote", data, f, key);
        const footY = f.h - 128;
        const texts = ops.filter((o) => o.k === "text");
        const body = ops.filter((o) => o.k !== "band" && !(o.k === "line" && o.y1 === footY) && !(o.k === "text" && o.y > footY));
        const low = Math.max(...body.map((o) => ("y" in o ? o.y + (o.h || 0) + (o.k === "circ" ? o.r : 0) : o.y2 || 0)));
        if (low > f.h - 150) out.push(`${theme} ${key}: obsah zasahuje do patičky (${Math.round(low)})`);
        texts.forEach((o) => { const w = m.measureText(o.s, o.size, o.weight), x0 = o.anchor === "right" ? o.x - w : o.anchor === "center" ? o.x - w / 2 : o.x; if (x0 < 50 || x0 + w > 1030) out.push(`${theme} ${key}: text „${o.s.slice(0, 30)}“ přetéká`); });
        const cards = ops.filter((o) => o.k === "rect" && o.r === 18 && o.fill === SC.tile);
        cards.forEach((a, i) => cards.slice(i + 1).forEach((b) => { if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`${theme} ${key}: karty stran se překrývají`); }));
        const seen = ops.filter((o) => o.mid != null).map((o) => o.mid).sort();
        if (JSON.stringify(seen) !== JSON.stringify(ids)) out.push(`${theme} ${key}: poslanci na kartě ${seen.length}, v datech ${ids.length}`);
        if (!cards.length && ids.length) dots += 1;
        const bad = texts.map((o) => o.s).filter((t) => ["Ind.", "PIR", "TOP09/STAN", "AUTO", "PSH", "ANO 2011", "PfE", "Greens/EFA", "The Left"].includes(t));
        if (bad.length) out.push(`${theme} ${key}: zkratky mimo číselník ${bad.join(", ")}`);
        if (isOld && !texts.some((o) => o.s === "Kovařík")) out.push("starší hlasování: chybí Kovařík (složení k datu hlasování)");
      }
      m.useCardTheme("dark");
      const blob = await m.renderCardPng(sc, "post", "light");
      if (!blob || blob.size < 1000) out.push("obrázek se nevykreslil");
      return { out, dots };
    }, v === old);
    r.out.forEach((x) => problems.push(`karta hlasování ${v.id}: ${x}`));
    fallbacks += r.dots;
  }
  const bal = await page.evaluate(async () => {
    const m = await import(document.querySelector('script[src*="share.js"]').src);
    return [m.balanceRows(Array(7).fill(100), 316, 8), m.balanceRows(Array(7).fill(100), 424, 8), m.balanceRows([100, 100, 100], 1000, 8)];
  });
  if (bal[0].at(-1) === 1 || bal[0].length !== 3) problems.push(`balanceRows: 7 jmen po 3 na řádek dalo ${bal[0].join("+")}, čekám 3 řádky bez osamoceného jména`);
  if (bal[1].join("+") !== "4+3") problems.push(`balanceRows: 7 jmen po 4 na řádek dalo ${bal[1].join("+")}, čekám 4+3`);
  if (bal[2].join("+") !== "3") problems.push(`balanceRows: 3 jména na řádek dalo ${bal[2].join("+")}`);
  console.log(`karta hlasování: ${picks.length} hlasování, záložní tečky u ${fallbacks} variant`);
  await ctx.close();
}
// Detail karty hlasování (2. a 3. obrázek, příspěvek i story) na statických stránkách v/: nic nepřetéká ani nezasahuje
// do patičky, každý obrázek má zdroj a datum, 3. obrázek jen když je kontext (česká stopa, AI shrnutí, procedura).
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const vids = readdirSync(join(root, "public", "v")).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")).sort().slice(-15);
  // Úkol 1 (karta 3/3): vždy i COD s časovou osou, COD bez událostí, usnesení RSP a hlasování bez procedury.
  const cases = { codAxis: null, codEmpty: null, rsp: null, noProc: null };
  for (const f of readdirSync(join(root, "public", "v")).filter((x) => x.endsWith(".html")).sort().reverse()) {
    const m = /<script type="application\/json" id="share-context">(.*?)<\/script>/s.exec(readFileSync(join(root, "public", "v", f), "utf8"));
    if (!m) continue;
    const all = JSON.parse(m[1]), det = (all.kind ? all : all.default)?.data?.detail;
    if (!det) continue;
    const p = det.procedure, id = f.replace(/\.html$/, "");
    if (p?.type === "COD" && p.mode === "timeline" && !cases.codAxis) cases.codAxis = id;
    else if (p?.type === "COD" && p.mode === "effect" && !cases.codEmpty) cases.codEmpty = id;
    else if (p?.type === "RSP" && !cases.rsp) cases.rsp = id;
    else if (!p && (det.summary || (det.trace || []).length) && !cases.noProc) cases.noProc = id;
    if (Object.values(cases).every(Boolean)) break;
  }
  Object.entries(cases).forEach(([k, id]) => { if (id) vids.push(id); else if (k !== "codEmpty") problems.push(`detail hlasování: v datech chybí případ ${k}`); });
  for (const id of vids) {
    await page.goto(base + `v/${id}`, { waitUntil: "networkidle" });
    const out = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="share.js"]').src;
      const m = await import(src), fmt = await import(new URL("lib/format.js", src).href);
      const all = JSON.parse(document.getElementById("share-context").textContent);
      const sc = fmt.withShareUrl(all.kind ? all : all.default);
      await document.fonts.ready;
      const res = [];
      if (!sc.data.detail) return ["chybí data detailu"];
      const formats = m.shareFormats("vote", sc.data);
      const det = formats.find((x) => x.key === "detail"), detS = formats.find((x) => x.key === "detail-story");
      if (!det || !detS || det.slides.length !== (m.voteHasContext(sc.data.detail) ? 3 : 2)) res.push("detail nemá správný počet obrázků");
      const data = { ...sc.data, dataDay: sc.data.dataDay || "2026-10-17" };
      for (const theme of m.CARD_THEMES) for (const key of [...det.slides.slice(1), ...detS.slides.slice(1)]) {
        m.useCardTheme(theme);
        const f = m.SHARE_FORMATS[key], ops = m.cardOps("vote", data, f, key), footY = f.h - 128;
        const texts = ops.filter((o) => o.k === "text");
        texts.forEach((o) => { const w = m.measureText(o.s, o.size, o.weight), x0 = o.anchor === "right" ? o.x - w : o.anchor === "center" ? o.x - w / 2 : o.x; if (x0 < 50 || x0 + w > 1030) res.push(`${theme} ${key}: text „${o.s.slice(0, 30)}“ přetéká`); });
        const body = ops.filter((o) => o.k !== "band" && !(o.k === "line" && o.y1 === footY) && !(o.k === "text" && o.y > footY));
        const low = Math.max(...body.map((o) => ("y" in o ? o.y + (o.h || 0) + (o.k === "circ" ? o.r : 0) : o.y2 || 0)));
        if (low > f.h - 150) res.push(`${theme} ${key}: obsah zasahuje do patičky (${Math.round(low)})`);
        const foot = texts.filter((o) => o.y > footY).map((o) => o.s);
        if (!foot.some((t) => /^Zdroj: .* k \d{1,2}\.\s\d{1,2}\.\s\d{4}/.test(t))) res.push(`${theme} ${key}: patička bez zdroje a data`);
        if (key.endsWith("3")) {
          if (texts.some((o) => o.s.startsWith("Celý průběh"))) res.push(`${theme} ${key}: zůstal řádek Celý průběh`);
          // kontrast textu na pozadí karty (pod hlavičkou) aspoň 4,5 : 1
          const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
          const bg = m.useCardTheme(theme).bg0;
          texts.filter((o) => o.y > 340 && /^#[0-9a-f]{6}$/i.test(o.fill)).forEach((o) => { const [a, b] = [lum(o.fill), lum(bg)].sort((x, y) => y - x); if ((a + 0.05) / (b + 0.05) < 4.5) res.push(`${theme} ${key}: nízký kontrast textu „${o.s.slice(0, 20)}“`); });
        }
      }
      m.useCardTheme("dark");
      return res;
    });
    out.forEach((x) => problems.push(`detail hlasování v/${id}: ${x}`));
  }
  await ctx.close();
}
// Sdílení strany a frakce (zadání 20. 10. 2026): všech 8 frakcí a 10 stran má formát Detail se 3 obrázky v obou vzhledech,
// nic nepřetéká, každý obrázek má zdroj a datum, logo je na bílém štítku i v tmavém vzhledu, frakce bez Čechů má prázdný stav.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const groupCodes = read("data/eugroups/index.json").groups.map((g) => g.code);
  const partyIds = read("data/parties/index.json").parties.map((p) => p.id);
  if (groupCodes.length !== 8) problems.push(`sdílení frakcí: čekám 8 frakcí, je ${groupCodes.length}`);
  for (const url of [...groupCodes.map((c) => `party?c=${c}`), ...partyIds.map((id) => `s/${id}`)]) {
    await page.goto(base + url, { waitUntil: "networkidle" });
    const r = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="share.js"]').src;
      const m = await import(src), fmt = await import(new URL("lib/format.js", src).href);
      for (let i = 0; i < 50 && typeof window.shareContext !== "function" && !document.getElementById("share-context"); i++) await new Promise((res) => setTimeout(res, 100));
      let sc = typeof window.shareContext === "function" ? await window.shareContext("") : null;
      if (!sc) { const all = JSON.parse(document.getElementById("share-context").textContent); sc = fmt.withShareUrl(all.kind ? all : all.default); }
      await document.fonts.ready;
      const out = [];
      if (!document.querySelector("[data-share]")) out.push("chybí tlačítko Sdílet");
      // obrázky přes renderCardPng (načtení log), kontrola rozložení stejnými ops s načtenými logy
      const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = new URL(u, src).href; });
      const data = { ...sc.data };
      const withImg = async (e) => (e && e.logo ? { ...e, logoImg: await load(e.logo) } : e);
      Object.assign(data, await withImg(data));
      for (const k of ["groups", "members", "former"]) if (Array.isArray(data[k])) data[k] = await Promise.all(data[k].map(withImg));
      for (const theme of m.CARD_THEMES) {
        for (const slide of ["post", "slide2", "slide3", "story2", "story3"]) {
          const blob = await m.renderCardPng(sc, slide, theme);
          if (!blob || blob.size < 1000) out.push(`${theme} ${slide}: obrázek se nevykreslil`);
          m.useCardTheme(theme);
          const f = m.SHARE_FORMATS[slide];
          const ops = m.cardOps(sc.kind, data, f, slide);
          const footY = f.h - 128;
          const texts = ops.filter((o) => o.k === "text");
          texts.forEach((o) => {
            const w = m.measureText(o.s, o.size, o.weight), x0 = o.anchor === "right" ? o.x - w : o.anchor === "center" ? o.x - w / 2 : o.x;
            if (x0 < 50 || x0 + w > 1030) out.push(`${theme} ${slide}: text „${o.s.slice(0, 30)}“ přetéká do stran`);
          });
          const body = ops.filter((o) => o.k !== "band" && !(o.k === "line" && o.y1 === footY) && !(o.k === "text" && o.y > footY));
          const low = Math.max(...body.map((o) => ("y" in o ? o.y + (o.h || 0) : o.y2 || 0)));
          if (low > footY) out.push(`${theme} ${slide}: obsah zasahuje do patičky (${Math.round(low)} > ${footY})`);
          const foot = texts.filter((o) => o.y > footY).map((o) => o.s);
          if (!foot.some((t) => /^Zdroj: .* k \d{1,2}\.\s\d{1,2}\.\s\d{4}/.test(t) && !t.endsWith("…"))) out.push(`${theme} ${slide}: patička bez zdroje a data (nebo zkrácená): ${foot.join(" | ")}`);
          if (!foot.some((t) => t.startsWith("epwatch.cz/"))) out.push(`${theme} ${slide}: chybí adresa`);
          if (slide === "post" && data.logoImg) {
            const img = ops.findIndex((o) => o.k === "image" && o.img === data.logoImg);
            const tile = img > 0 ? ops[img - 1] : null;
            if (!tile || tile.k !== "rect" || tile.fill !== "#FFFFFF") out.push(`${theme} post: logo není na bílém štítku`);
          }
          if (sc.kind === "group" && slide === "slide2" && !data.members.length && !texts.some((o) => o.s === "Žádný český poslanec")) out.push(`${theme} slide2: frakce bez Čechů nemá prázdný stav`);
          if (sc.kind === "group" && slide === "slide3" && data.countries && !texts.some((o) => /^Česko$/.test(o.s))) out.push(`${theme} slide3: chybí řádek Česko`);
        }
      }
      m.useCardTheme("dark");
      if (sc.kind === "group") {
        if (!document.querySelector(".country-bars") || document.querySelectorAll(".country-bars li").length < 6 && !document.querySelector(".country-bars .cb-cz")) out.push("stránka: chybí Frakce v Evropě s Českem");
        if (!data.members.length && !/Žádný český poslanec/.test(document.querySelector("main").textContent)) out.push("stránka: frakce bez Čechů nemá prázdný stav");
      }
      return out;
    });
    r.forEach((x) => problems.push(`sdílení ${url}: ${x}`));
  }
  await page.goto(base + "party?v=eu", { waitUntil: "networkidle" });
  if (!(await page.textContent("main")).includes("Poslanců / zemí")) problems.push("frakce: v tabulce chybí sloupec Poslanců / zemí");
  await ctx.close();
}
// Sdílení duelu (úkol 4): všechny formáty v obou vzhledech pro dvojici ze stejné frakce (Knotek–Nagyová) a z různých
// (Konečná–Zdechovský); nic nepřetéká, patička se zdrojem a adresou, portrét s © EP, žádný prvek neoznačuje vítěze.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "duel", { waitUntil: "networkidle" });
  if (await page.$("#duel [data-share]")) problems.push("sdílení duelu: tlačítko Sdílet je i bez vybrané dvojice");
  for (const [a, b] of [["197528", "256843"], ["23699", "124713"]]) {
    await page.goto(base + `duel?a=${a}&b=${b}`, { waitUntil: "networkidle" });
    const r = await page.evaluate(async () => {
      const src = document.querySelector('script[src*="share.js"]').src;
      const m = await import(src);
      for (let i = 0; i < 50 && typeof window.shareContext !== "function"; i++) await new Promise((res) => setTimeout(res, 100));
      const out = [];
      if (!document.querySelector("#duel [data-share]")) out.push("chybí tlačítko Sdílet");
      const sc = await window.shareContext("");
      if (!sc || sc.kind !== "duel") return [...out, "chybí shareContext duelu"];
      if (!/\/d\/\d+-\d+$/.test(sc.url)) out.push(`odkaz není kanonický: ${sc.url}`);
      if (m.shareFormats("duel").find((x) => x.key === "detail")?.slides.length !== 3) out.push("detail nemá 3 obrázky");
      await document.fonts.ready;
      for (const theme of m.CARD_THEMES) {
        for (const slide of ["post", "story", "slide2", "slide3", "story2", "story3"]) {
          const blob = await m.renderCardPng(sc, slide, theme);
          if (!blob || blob.size < 1000) out.push(`${theme} ${slide}: obrázek se nevykreslil`);
          m.useCardTheme(theme);
          const f = m.SHARE_FORMATS[slide], ops = m.cardOps("duel", { ...sc.data, a: { ...sc.data.a, photo: {} }, b: { ...sc.data.b, photo: {} } }, f, slide), footY = f.h - 128;
          const texts = ops.filter((o) => o.k === "text");
          texts.forEach((o) => {
            const w = m.measureText(o.s, o.size, o.weight), x0 = o.anchor === "right" ? o.x - w : o.anchor === "center" ? o.x - w / 2 : o.x;
            if (x0 < 50 || x0 + w > 1030) out.push(`${theme} ${slide}: text „${o.s.slice(0, 30)}“ přetéká do stran`);
            if (/vítěz|vyhrál|lepší/i.test(o.s) && !/bez vítěze/.test(o.s)) out.push(`${theme} ${slide}: text označuje vítěze: ${o.s}`);
          });
          const body = ops.filter((o) => o.k !== "band" && !(o.k === "line" && o.y1 === footY) && !(o.k === "text" && o.y > footY));
          const low = Math.max(...body.map((o) => ("y" in o ? o.y + (o.h || 0) : o.y2 || 0)));
          if (low > footY) out.push(`${theme} ${slide}: obsah zasahuje do patičky (${Math.round(low)} > ${footY})`);
          const foot = texts.filter((o) => o.y > footY).map((o) => o.s);
          if (!foot.some((t) => /^Zdroj: .* k \d{1,2}\.\s\d{1,2}\.\s\d{4}/.test(t) && !t.endsWith("…"))) out.push(`${theme} ${slide}: patička bez zdroje a data: ${foot.join(" | ")}`);
          if (!foot.some((t) => t.startsWith("epwatch.cz/d/"))) out.push(`${theme} ${slide}: chybí adresa`);
          if ((slide === "post" || slide === "story") && texts.filter((o) => o.s === "© European Union – Source: EP").length !== 2) out.push(`${theme} ${slide}: portréty bez © EP`);
        }
      }
      m.useCardTheme("dark");
      return out;
    });
    r.forEach((x) => problems.push(`sdílení duelu ${a}-${b}: ${x}`));
  }
  await ctx.close();
}
// Audit B1: parametry m (vote) a od (votes) nesmí dostat HTML do stránky.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const evil = encodeURIComponent(`${month}.json?x="><img src=x onerror="window.__xss=1">`);
  for (const url of [`vote?id=${voteId}&m=${evil}`, `votes?m=${evil}&od=${encodeURIComponent('"><img src=x onerror="window.__xss=1">')}`]) {
    await page.goto(base + url, { waitUntil: "networkidle" });
    const hit = await page.evaluate(() => Boolean(window.__xss) || Boolean(document.querySelector('img[src="x"]')));
    if (hit) problems.push(`XSS přes parametr URL: ${url}`);
  }
  await ctx.close();
}

// Audit UI1/UI2: hledání bez diakritiky a koncovek, zvýraznění shod, čipy aktivních filtrů a prázdný stav s akcí.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base + "votes?q=zemedelstvi", { waitUntil: "networkidle" });
  const r = await page.evaluate(() => ({
    rows: document.querySelectorAll("#votes tbody a.vote-title").length,
    marks: document.querySelectorAll("#votes tbody mark").length,
    chips: document.querySelectorAll("#chips .chip-x").length,
    live: document.getElementById("count").getAttribute("aria-live"),
  }));
  if (!r.rows) problems.push("votes: „zemedelstvi“ bez diakritiky nic nenašlo");
  if (!r.marks) problems.push("votes: shody hledání nejsou zvýrazněné");
  if (r.chips !== 1) problems.push(`votes: čekán 1 čip aktivního filtru, je ${r.chips}`);
  if (r.live !== "polite") problems.push("votes: #count nemá aria-live");
  await page.goto(base + "votes?q=xqzxqzxqz", { waitUntil: "networkidle" });
  await page.click("#votes tbody [data-act=clear]");
  const after = await page.evaluate(() => ({ q: document.getElementById("q").value, rows: document.querySelectorAll("#votes tbody a.vote-title").length }));
  if (after.q || !after.rows) problems.push("votes: „Zrušit všechny filtry“ v prázdném stavu nefunguje");
  await ctx.close();
}

// Kvíz (K1+K2) při 1366 a 390: průchod klávesami i klikem, odhalení bez jmen, výsledek, rozkliknutí řádku, záložka odpovědí,
// pokračování po reloadu (localStorage) a axe na obrazovce otázky, detailu i výsledku.
for (const [w, h] of [[1366, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const tag = `kviz ${w}`;
  const axeOn = async (label, sel = "body") => {
    await page.evaluate(axeSource);
    const v = await page.evaluate(async (s) => (await axe.run(document.querySelector(s), { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations
      .map((x) => `${x.id}: ${x.nodes.length}× (${x.nodes[0]?.target})`), sel);
    v.forEach((x) => problems.push(`${tag} ${label}: axe ${x}`));
  };
  await page.goto(base + "kviz", { waitUntil: "networkidle" });
  // O3: „Začít“ na první obrazovce, nad horním okrajem mobilní lišty (výběr varianty a délky je sbalený)
  if (w === 390) {
    const fit = await page.evaluate(() => ({ btn: document.querySelector("#qz-start")?.getBoundingClientRect().bottom,
      bar: document.querySelector(".tabbar")?.getBoundingClientRect().top ?? innerHeight }));
    if (!(fit.btn <= fit.bar)) problems.push(`${tag}: „Začít“ je pod lištou nebo mimo první obrazovku (${JSON.stringify(fit)})`);
  }
  await page.click("#qz-start");
  await page.waitForSelector(".qz-card");
  if (!page.url().endsWith("#otazka-1")) problems.push(`${tag}: adresa otázky ${page.url()}`);
  const n = await page.locator(".qz-prog button").count();
  if (n < 3) problems.push(`${tag}: jen ${n} otázek`);
  const app = await page.evaluate(() => getComputedStyle(document.querySelector(".site-header")).display === "none");
  if (app !== (w <= 760)) problems.push(`${tag}: režim aplikace (skrytá hlavička) ${app ? "zapnutý" : "vypnutý"} při šířce ${w}`);
  // 1. otázka klávesou 1 (pro): odhalení s počty, ale bez jmen poslanců
  if (w > 760) await page.keyboard.press("1"); else await page.click('.qz-ans[data-a="F"]');
  await page.waitForSelector(".qz-reveal");
  const rv = await page.evaluate(() => {
    const el = document.querySelector("#qz-rev");
    return { live: el.getAttribute("aria-live"), titles: el.querySelectorAll("title, a").length, text: el.textContent,
      pressed: document.querySelector('.qz-ans[data-a="F"]').getAttribute("aria-pressed") };
  });
  const names = await page.evaluate(async () => (await (await fetch("data/overview.json")).json()).meps.map((m) => m.family_name).filter(Boolean));
  if (rv.live !== "polite") problems.push(`${tag}: odhalení nemá aria-live`);
  if (rv.titles || names.some((x) => rv.text.includes(x))) problems.push(`${tag}: odhalení ukazuje jména poslanců`);
  if (!/Stejně hlasovalo \d+ z \d+/.test(rv.text)) problems.push(`${tag}: v odhalení chybí věta „Stejně hlasovalo x z y“`);
  if (rv.pressed !== "true") problems.push(`${tag}: odpověď nemá aria-pressed`);
  await axeOn("otázka s odhalením");
  // detail hlasování: <dialog>, Esc zavře
  await page.click("#qz-more");
  if (!(await page.locator("#qz-dlg[open]").isVisible())) problems.push(`${tag}: detail hlasování se neotevřel`);
  await axeOn("detail hlasování", "#qz-dlg");
  await page.keyboard.press("Escape");
  if (await page.locator("#qz-dlg[open]").count()) problems.push(`${tag}: Esc nezavřel detail`);
  // 2. otázka, pak reload: postup zůstane (localStorage)
  if (w > 760) await page.keyboard.press("ArrowRight"); else await page.click("#qz-next");
  await page.waitForFunction(() => location.hash === "#otazka-2");
  await page.reload({ waitUntil: "networkidle" });
  const kept = await page.evaluate(() => ({ hash: location.hash, done: document.querySelectorAll(".qz-prog .a-F").length }));
  if (kept.hash !== "#otazka-2" || kept.done !== 1) problems.push(`${tag}: po reloadu se ztratil postup ${JSON.stringify(kept)}`);
  for (let i = 1; i < n; i++) {
    const a = ["A", "F", "B", "S"][i % 4];
    if (w > 760) await page.keyboard.press({ F: "1", A: "2", B: "3", S: "0" }[a]); else await page.click(`[data-a="${a}"]`);
    await page.click("#qz-next");
  }
  await page.waitForSelector(".qz-rs");
  if (!page.url().endsWith("#vysledek")) problems.push(`${tag}: adresa výsledku ${page.url()}`);
  const res = await page.evaluate(() => ({
    pods: document.querySelectorAll(".qz-pod").length,
    rows: [...document.querySelectorAll(".qz-rp b")].map((e) => parseFloat(e.textContent.replace(",", "."))),
    review: document.getElementById("qz-pan-r").hidden && getComputedStyle(document.getElementById("qz-pan-r")).display === "none",
    header: getComputedStyle(document.querySelector(".site-header")).display !== "none",
  }));
  if (!res.rows.length || res.pods !== Math.min(3, res.rows.length)) problems.push(`${tag}: výsledek bez poslanců nebo tří karet ${JSON.stringify(res)}`);
  if (res.rows.some((x, i) => i && x > res.rows[i - 1])) problems.push(`${tag}: výsledek není seřazený podle shody`);
  if (!res.review) problems.push(`${tag}: skrytá záložka odpovědí je vidět`);
  if (!res.header) problems.push(`${tag}: u výsledku chybí hlavička (režim aplikace jen u otázek)`);
  await page.click(".qz-row summary");
  if (!(await page.locator(".qz-row[open] .qz-cmp li").count())) problems.push(`${tag}: řádek poslance nejde rozkliknout na porovnání`);
  await axeOn("výsledek");
  await page.click("#qz-tab-r");
  const rev = await page.evaluate(() => ({ cards: document.querySelectorAll(".qz-rv-card").length, sel: document.getElementById("qz-tab-r").getAttribute("aria-selected") }));
  if (rev.cards !== n || rev.sel !== "true") problems.push(`${tag}: záložka „Vaše odpovědi“ ${JSON.stringify(rev)}`);
  await axeOn("vaše odpovědi");
  await page.click("#qz-share");
  await page.waitForSelector(".sd-preview img", { timeout: 15000 }).catch(() => problems.push(`${tag}: náhled obrázku ke sdílení se nevytvořil`));
  await ctx.close();
}

// V15: na mobilu (390 px) žádný viditelný text v obsahu menší než 13 px; výjimky jsou popisky os grafů a hemicyklu.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const url of ["", "aktualne", "poslanci", "votes", `p/${mepId}`, `v/${voteId}`, "radar", "otevrena-data"]) {
    await page.goto(base + url, { waitUntil: "networkidle" });
    const tiny = await page.evaluate(() => {
      const skip = ".chart, .chart-y, .tl-svg, .hm-hemi, .vd-legend, .qz-art, .tabbar, svg, [aria-hidden='true'], .sr-only, kbd";
      const out = new Set();
      const walk = document.createTreeWalker(document.querySelector("main") || document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement;
        if (!n.textContent.trim() || !el || el.closest(skip) || !el.offsetParent) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12.95) out.add(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")} ${fs}px`);
      }
      return [...out].slice(0, 5);
    });
    if (tiny.length) problems.push(`čitelnost ${url || "/"} [390px]: písmo pod 13 px: ${tiny.join(", ")}`);
  }
  await ctx.close();
}

// Radar „Co se chystá“: filtry skrývají položky podle tématu, zákonů a české stopy a zapíšou se do adresy.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "radar", { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const items = () => [...document.querySelectorAll(".rd-list > li, .rd-procs > li")];
    const out = [];
    const total = items().length;
    const sel = document.getElementById("rd-cat");
    if (!sel) return ["chybí filtr tématu"];
    const cat = [...sel.options].map((o) => o.value).find((v) => v && items().some((li) => li.dataset.cat === v));
    if (cat) {
      sel.value = cat; sel.dispatchEvent(new Event("change"));
      if (items().some((li) => !li.hidden && li.dataset.cat !== cat)) out.push("filtr tématu nechal jiné téma");
      if (!location.search.includes(`c=${cat}`)) out.push("filtr tématu není v adrese");
      sel.value = ""; sel.dispatchEvent(new Event("change"));
    }
    const cz = document.getElementById("rd-cz");
    cz.checked = true; cz.dispatchEvent(new Event("change"));
    if (items().some((li) => !li.hidden && li.dataset.cz !== "1")) out.push("filtr české stopy nechal položku bez stopy");
    cz.checked = false; cz.dispatchEvent(new Event("change"));
    if (items().filter((li) => !li.hidden).length !== total) out.push("po vypnutí filtrů nejsou vidět všechny položky");
    return out;
  });
  r.forEach((x) => problems.push(`radar: ${x}`));
  // O8: na mobilu pod 1 500 uzlů DOM (osa procedury a odhlasované jsou v <template>, vloží se po rozbalení)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const dom = await page.evaluate(() => document.querySelectorAll("*").length);
  if (dom >= 1500) problems.push(`radar: ${dom} uzlů DOM (limit 1 500)`);
  await page.click(".rd-procs .rd-tl > summary");
  await page.waitForSelector(".rd-procs .rd-tl[open] .rd-steps", { timeout: 3000 }).catch(() => problems.push("radar: rozbalení průběhu neukázalo kroky"));
  await ctx.close();
}

// Pruh o starých datech (E3): s MOCK freshness.json se ukáže a projde axe ve světlém i tmavém režimu.
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
  await darkPick(ctx, scheme);
  const page = await ctx.newPage();
  await page.route("**/data/freshness.json", (r) => r.fulfill({ contentType: "application/json",
    body: JSON.stringify({ release: "2000-01-01", stale_days: 14, sittings_after: ["2000-01-10"] }) }));
  await page.goto(base + "votes", { waitUntil: "networkidle" });
  if (!(await page.locator(".stale-note").isVisible())) problems.push(`pruh o starých datech [${scheme}]: chybí`);
  await page.evaluate(axeSource);  // ne addScriptTag: vložený skript by zablokovala CSP
  const v = await page.evaluate(async () => (await axe.run(document.querySelector(".stale-note"), { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations
    .map((x) => `${x.id}: ${x.nodes.length}×`));
  v.forEach((x) => problems.push(`pruh o starých datech [${scheme}]: axe ${x}`));
  await ctx.close();
}
// Žádný požadavek webu nevedl přes přesměrování z .html; staré adresy (Instagram, vyhledávače) skončí na adrese bez .html.
if (redirects.length) problems.push(`web sám otevřel adresy s .html: ${[...new Set(redirects)].slice(0, 5).join(", ")}`);
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const [from, to] of [["moje-shoda", "kviz"], ["moje-shoda.html", "kviz"], [`p/${mepId}.html`, `p/${mepId}`], ["index.html", ""],
    ["o-projektu.html#kontakt", "o-projektu#kontakt"], [`mep.html?id=${mepId}`, `p/${mepId}`]]) {
    await page.goto(base + from, { waitUntil: "networkidle" });
    if (page.url() !== base + to) problems.push(`stará adresa ${from} skončila na ${page.url()}, čekám ${base + to}`);
  }
  await ctx.close();
}
// Kvíz, varianta Evropské frakce: krátký test, odhalení bez názvů frakcí, výsledek, rozkliknutí, odpovědi, sdílení, axe.
for (const width of [1366, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const where = `kvíz frakce [${width}px]`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "kviz#frakce", { waitUntil: "networkidle" });
  if (!(await page.isChecked('input[name="qz-var"][value="frakce"]'))) problems.push(`${where}: #frakce nevybralo variantu`);
  await page.click("#qz-start");
  const short = read("data/quiz_groups.json").short.length;
  const names = read("data/groups.json").map((g) => g.short_label);
  for (let i = 0; i < short; i++) {
    await page.waitForSelector(".qz-ans");
    if (i === 0 && (await page.evaluate(() => location.hash)) !== "#frakce/otazka-1") problems.push(`${where}: adresa otázky není #frakce/otazka-1`);
    await page.click(`.qz-ans.${["F", "A", "B"][i % 3]}`);
    const rev = (await page.textContent("#qz-rev")) || "";
    if (i === 0 && !/Frakce: \d+ pro · \d+ proti/.test(rev)) problems.push(`${where}: odhalení bez počtů frakcí`);
    const leak = names.filter((n) => rev.includes(n));
    if (leak.length) problems.push(`${where}: odhalení prozradilo frakce ${leak.join(", ")}`);
    await page.click("#qz-next");
  }
  await page.waitForSelector(".qz-rs h1");
  if ((await page.evaluate(() => location.hash)) !== "#frakce/vysledek") problems.push(`${where}: výsledek není na #frakce/vysledek`);
  const rs = await page.evaluate(() => ({ h1: document.querySelector(".qz-rs h1").textContent, rows: document.querySelectorAll(".qz-rlist > li").length,
    top: !!document.querySelector(".qz-gtop"), store: Object.keys(localStorage).filter((k) => k.startsWith("epw-kviz")) }));
  if (!rs.h1.startsWith("Nejblíž máte k") || !rs.top || !rs.rows || rs.rows > 8) problems.push(`${where}: výsledek ${JSON.stringify(rs)}`);
  if (rs.store.join() !== "epw-kviz-frakce") problems.push(`${where}: uložený postup ${rs.store.join(", ")}`);
  await page.click(".qz-rlist details summary");
  if (!(await page.locator(".qz-rlist details[open] .qz-cmp li").count())) problems.push(`${where}: rozkliknutí frakce bez otázek`);
  await page.click("#qz-tab-r");
  if (!(await page.locator("#qz-pan-r .qz-gchips").first().isVisible())) problems.push(`${where}: záložka Vaše odpovědi bez postojů frakcí`);
  await page.click("#qz-tab-m");
  if (width === 1366) {
    await page.evaluate(axeSource);
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => `${x.id} (${x.nodes.length}×): ${x.nodes[0].target.join(" ")}`));
    v.forEach((x) => problems.push(`${where}: axe ${x}`));
  }
  await page.click("#qz-share");
  try { await page.waitForSelector(".sd-preview img", { timeout: 15000 }); } catch { problems.push(`${where}: náhled obrázku ke sdílení se nevykreslil`); }
  errors.forEach((e) => problems.push(`${where}: chyba v konzoli: ${e}`));
  await ctx.close();
}
// O projektu: dlaždice vedou na sekce, kotva otevře definici (i při hashchange), hledání, filtr časové osy, formulář.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const err = (m) => problems.push(`o-projektu: ${m}`);
  await page.goto(base + "o-projektu", { waitUntil: "networkidle" });
  for (const id of ["zdroje", "metodika", "kontakt", "zmeny"]) {
    await page.click(`.ab-door[href="#${id}"]`);
    await page.waitForTimeout(150);
    const ok = await page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return location.hash === `#${id}` && r.top < innerHeight && r.bottom > 0; }, id);
    if (!ok) err(`dlaždice #${id} neposunula na sekci`);
  }
  // obsah stránky zvýrazní aktuální sekci
  const cur = await page.evaluate(() => document.querySelector('.ab-toc a[aria-current="true"]')?.getAttribute("href"));
  if (!cur) err("obsah stránky nezvýraznil aktuální sekci (aria-current)");
  // kotva na definici: otevřená a uprostřed obrazovky; i po hashchange
  for (const [how, id] of [["load", "attendance"], ["hashchange", "cz_unity"], ["hashchange", "moje-shoda"]]) {
    if (how === "load") await page.goto(base + `o-projektu#${id}`, { waitUntil: "networkidle" });
    else await page.evaluate((id) => { location.hash = id; }, id);
    await page.waitForTimeout(250);
    const st = await page.evaluate((id) => { const d = document.getElementById(id); const r = d.getBoundingClientRect();
      return { open: d.open, mid: r.top + r.height / 2, h: innerHeight }; }, id);
    if (!st.open) err(`#${id} (${how}): definice se neotevřela`);
    if (Math.abs(st.mid - st.h / 2) > st.h * 0.3) err(`#${id} (${how}): definice není uprostřed obrazovky (střed ${Math.round(st.mid)} px z ${st.h})`);
  }
  // hledání „frakce“: zbydou jen odpovídající pojmy, skupiny bez výsledku zmizí, při nule „Nic nenalezeno“
  await page.fill("#ab-q", "frakce");
  const s = await page.evaluate(() => {
    const vis = [...document.querySelectorAll("#definitions details")].filter((d) => !d.hidden);
    return { n: vis.length, all: document.querySelectorAll("#definitions details").length,
      bad: vis.filter((d) => !d.textContent.toLowerCase().includes("frakce")).map((d) => d.id),
      groups: [...document.querySelectorAll("#definitions .ab-group")].filter((g) => !g.hidden).length };
  });
  if (!s.n || s.n >= s.all || s.bad.length) err(`hledání „frakce“: ${s.n} z ${s.all} pojmů, neodpovídající ${s.bad.join(", ")}`);
  await page.fill("#ab-q", "xyzzy-nic");
  if (!(await page.locator("#ab-none").isVisible())) err("hledání bez výsledku neukázalo „Nic nenalezeno“");
  await page.fill("#ab-q", "");
  // filtr časové osy
  const tl = async () => page.evaluate(() => [...document.querySelectorAll("#corrections li")].filter((l) => !l.hidden).map((l) => l.dataset.kind + (l.classList.contains("ab-tl-empty") ? ":empty" : "")));
  const nFix = Number(await page.textContent('.ab-tl-filter [data-count="fix"]'));
  await page.click('.ab-tl-filter [data-f="change"]');
  const ch = await tl();
  if (!ch.length || ch.some((k) => k !== "change")) err(`filtr Změny ukazuje ${ch.join(", ")}`);
  await page.click('.ab-tl-filter [data-f="fix"]');
  const fx = await tl();
  if (nFix ? fx.some((k) => k !== "fix") : fx.join() !== "fix:empty") err(`filtr Opravy (${nFix}) ukazuje ${fx.join(", ")}`);
  if (await page.getAttribute('.ab-tl-filter [data-f="fix"]', "aria-pressed") !== "true") err("filtr nemá aria-pressed");
  await page.click('.ab-tl-filter [data-f="all"]');
  if ((await tl()).length > 5) err("časová osa ukazuje víc než 5 položek bez „Starší změny“");
  // formulář: stejná pole, odeslání POST na Formspree (požadavek se zachytí, nic se neodešle)
  let sent = null;
  const csp = [];
  page.on("console", (m) => { if (m.type() === "error") csp.push(m.text()); });
  await page.route("https://formspree.io/**", (r) => { sent = { method: r.request().method(), body: r.request().postData() || "" }; r.fulfill({ status: 200, body: "ok" }); });
  await page.fill('textarea[name="zprava"]', "MOCK zpráva z e2e testu");
  await page.evaluate(() => document.querySelector(".contact-form").requestSubmit());
  await page.waitForTimeout(1000);
  if (!sent || sent.method !== "POST" || !sent.body.includes("zprava=MOCK")) err(`odeslání formuláře neprošlo (${sent ? sent.method : "žádný požadavek"}${csp.length ? `; ${csp[0].slice(0, 160)}` : ""})`);
  await ctx.close();
  // bez JavaScriptu: definice zavřené, ale čitelné; hledání a filtr skryté
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const p2 = await nojs.newPage();
  await p2.goto(base + "o-projektu", { waitUntil: "load" });
  const nj = await p2.evaluate(() => ({ find: !!document.querySelector(".ab-find")?.offsetParent, filter: !!document.querySelector(".ab-tl-filter")?.offsetParent,
    defs: document.querySelectorAll("#definitions details").length, open: document.querySelectorAll("#definitions details[open]").length }));
  if (nj.find || nj.filter || !nj.defs || nj.open) err(`bez JS: hledání ${nj.find}, filtr ${nj.filter}, definic ${nj.defs}, otevřených ${nj.open}`);
  await nojs.close();
}
// Audit UX P2 (2026-10-18): tablet a úzký telefon (768 a 360 px), axe v mobilním rozložení (390 px), klávesnice,
// chybové stavy (výpadek dat) a prázdné výsledky.
{
  const axeRun = async (page) => { await page.evaluate(axeSource);
    return page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations
      .map((x) => `${x.id} (${x.nodes.length}×): ${x.nodes[0].target.join(" ")}`)); };
  for (const width of [768, 390, 360]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    for (const url of pages) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + url, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      const where = `${url} [${width}px]`;
      errors.forEach((e) => problems.push(`${where}: chyba ${e}`));
      if (width !== 390) {
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        if (sw > width) problems.push(`${where}: stránka přetéká (scrollWidth ${sw} > ${width})`);
      } else (await axeRun(page)).forEach((x) => problems.push(`${where}: axe ${x}`));
      await page.close();
    }
    await ctx.close();
  }
  // Klávesnice: první Tab = odkaz „Přejít na obsah“, Enter přesune fokus do <main>; dalších 25 zastávek je vidět
  // a má viditelný indikátor fokusu (outline nebo box-shadow).
  for (const width of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    for (const url of ["aktualne", "poslanci", "votes", "analyzy", "radar", `v/${voteId}`, `p/${mepId}`, procPage]) {
      const page = await ctx.newPage();
      const where = `${url} [klávesnice, ${width}px]`;
      await page.goto(base + url, { waitUntil: "networkidle" });
      await page.keyboard.press("Tab");
      const skip = await page.evaluate(() => ({ cls: document.activeElement?.className, vis: document.activeElement?.getBoundingClientRect().height > 0 }));
      if (skip.cls !== "skip-link" || !skip.vis) problems.push(`${where}: první Tab není viditelný odkaz „Přejít na obsah“ (${skip.cls})`);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");  // další zastávka po „Přejít na obsah“ musí být v obsahu, ne v hlavičce
      const inMain = await page.evaluate(() => Boolean(document.querySelector("main")?.contains(document.activeElement)));
      if (!inMain) problems.push(`${where}: po „Přejít na obsah“ nevede Tab do <main>`);
      const bad = [];
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        const st = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
          const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
          return { name: `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} „${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}“`,
            hidden: !r.width || !r.height || cs.visibility === "hidden", ring };
        });
        if (!st) continue;
        if (st.hidden) bad.push(`neviditelný prvek ve fokusu: ${st.name}`);
        else if (!st.ring) bad.push(`fokus bez indikátoru: ${st.name}`);
      }
      [...new Set(bad)].forEach((b) => problems.push(`${where}: ${b}`));
      await page.close();
    }
    await ctx.close();
  }
  // Výpadek dat: žádné nekonečné „Načítám…“, chyba je vidět a ohlášená čtečce (role="alert").
  const STATIC_CONTENT = /^(aktualne|hlasovani|p\/|s\/)/;
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
    for (const url of ["aktualne", "poslanci", "party", "hlasovani", "votes", "temata", "rozkol", "rozhodujici", "shoda", "kviz", "prace", "prace-poslanci",
      `vote?id=${voteId}&m=${month}`, `p/${mepId}`, `s/${partyId}`]) {
      const page = await ctx.newPage();
      const where = `${url} [výpadek dat]`;
      await page.route(/\/data\//, (r) => r.abort("failed"));
      await page.goto(base + url, { waitUntil: "load" });
      await page.waitForTimeout(2500);
      const st = await page.evaluate(() => ({
        loading: [...document.querySelectorAll("main .loading, main [aria-busy='true']")].filter((e) => e.offsetParent && /Načítám/.test(e.textContent)).map((e) => e.id || e.className),
        stuck: [...document.querySelectorAll("main *")].filter((e) => e.offsetParent && !e.children.length && /^\s*Načítám/.test(e.textContent)).length,
        alert: [...document.querySelectorAll("[role=alert]")].some((e) => e.offsetParent && e.textContent.trim()),
      }));
      if (st.loading.length || st.stuck) problems.push(`${where}: zůstalo „Načítám…“ (${st.loading.join(", ") || st.stuck + "×"})`);
      // statické stránky (aktualne, hlasovani, p/, s/) mají obsah v HTML; chyba doplňků je jen v konzoli
      if (!st.alert && !STATIC_CONTENT.test(url)) problems.push(`${where}: chybí viditelná chybová hláška s role="alert"`);
      await page.close();
    }
    // Prázdný výsledek má vlastní vysvětlení (ne prázdnou tabulku).
    const page = await ctx.newPage();
    await page.goto(base + "votes?q=qqzzxxqq", { waitUntil: "networkidle" });
    if (!(await page.locator(".empty-state:visible").count())) problems.push("votes?q=… [prázdný výsledek]: chybí vysvětlení „Nic jsme nenašli“");
    await ctx.close();
  }
}
// Zasedání: čip tématu nahoře vyfiltruje program, druhý klik filtr zruší.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base + "zasedani", { waitUntil: "networkidle" });
  const chip = page.locator(".zs-topic").first();
  if (!(await chip.count())) problems.push("zasedani [témata]: chybí čipy témat");
  else {
    const cat = await chip.getAttribute("data-cat");
    await chip.click();
    const st = await page.evaluate(() => ({ sel: document.getElementById("rd-cat").value, pressed: document.querySelector(".zs-topic")?.getAttribute("aria-pressed"),
      cats: [...document.querySelectorAll(".rd-list > li")].filter((li) => li.offsetParent).map((li) => li.dataset.cat) }));
    if (st.sel !== cat || st.pressed !== "true" || !st.cats.length || st.cats.some((c) => c !== cat)) problems.push(`zasedani [témata]: klik na ${cat} nevyfiltroval program (${JSON.stringify(st).slice(0, 120)})`);
    await chip.click();
    if ((await page.evaluate(() => document.getElementById("rd-cat").value)) !== "") problems.push("zasedani [témata]: druhý klik filtr nezrušil");
  }
  await ctx.close();
}
// Radar a Zasedání: filtry opravdu skryjí položky (dřív je CSS display: grid přebilo) a názvy bodů programu i procedur
// vedou na existující stránku Příběh zákona.
for (const url of ["radar", "zasedani"]) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base + url, { waitUntil: "networkidle" });
  const cat = await page.evaluate(() => [...document.querySelectorAll("#rd-cat option")].map((o) => o.value).find((v) => v && document.querySelector(`.rd-list > li[data-cat="${v}"], .rd-procs > li[data-cat="${v}"]`)));
  const visible = () => page.evaluate(() => [...document.querySelectorAll(".rd-list > li, .rd-procs > li")].filter((li) => li.offsetParent).map((li) => li.dataset.cat || ""));
  const before = (await visible()).length;
  await page.selectOption("#rd-cat", cat);
  const after = await visible();
  if (!after.length || after.length >= before || after.some((c) => c !== cat)) problems.push(`${url} [filtr]: téma ${cat} neskrylo ostatní položky (${before} → ${after.length})`);
  await page.selectOption("#rd-cat", "");
  await page.check("#rd-cz");
  const withCz = await page.evaluate(() => document.querySelectorAll('.rd-list > li[data-cz="1"], .rd-procs > li[data-cz="1"]').length);
  if ((await visible()).length !== withCz) problems.push(`${url} [filtr]: „jen s českou stopou“ ukazuje ${(await visible()).length} položek, s českou stopou je ${withCz}`);
  const links = await page.evaluate(() => [...document.querySelectorAll(".ns-title a, .rd-title a")].map((a) => new URL(a.getAttribute("href"), document.baseURI).pathname));
  if (!links.length) problems.push(`${url} [odkazy]: názvy bodů programu a procedur nevedou nikam`);
  const missing = [...new Set(links)].filter((pth) => !existsSync(join(root, "public", `${pth.replace(/^\//, "")}.html`)));
  if (missing.length) problems.push(`${url} [odkazy]: Příběh zákona neexistuje: ${missing.slice(0, 5).join(", ")}`);
  await ctx.close();
}
await browser.close();
server.close();
if (problems.length) {
  console.error(`Kontrola webu selhala (${problems.length}):\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log(`Kontrola webu v pořádku: ${pages.length} stránek × 2 režimy × 3 šířky + 768/390/360 px, klávesnice a výpadek dat.`);
