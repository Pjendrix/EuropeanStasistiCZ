// Kontrola webu v prohlížeči (U12): žádná chyba v konzoli (ani porušení CSP), nic nepřetéká do šířky (1366 / 390 / 320 px), axe-core
// (WCAG 2 A/AA, 2.1 AA) bez porušení ve světlém i tmavém režimu. Spouští se v CI (.github/workflows/web-check.yml) a lokálně:
//   NODE_PATH=/cesta/k/node_modules node tests/e2e/check-web.mjs
// Web se obslouží z kopie public/ + data/ (jako Vercel: buildCommand kopíruje data do public/data).
import { createRequire } from "node:module";
import { cpSync, mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
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
cpSync(join(root, "data"), join(site, "data"), { recursive: true });
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
// Stejná CSP jako na Vercelu (vercel.json): porušení se v prohlížeči hlásí jako chyba v konzoli a test selže.
const CSP = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
// Adresy bez .html jako na Vercelu (vercel.json "cleanUrls": true): /x.html a /index přesměruje 308 na /x a /,
// /x obslouží soubor x.html. Odkaz na .html by tu tedy prošel jen přes přesměrování, které test hlídá (redirects).
const redirects = [];
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const path = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, "");
  const clean = path.replace(/(^|\/)index(\.html)?$/, "$1").replace(/\.html$/, "");
  if (clean !== path) { redirects.push(req.url); res.writeHead(308, { location: clean + u.search }); res.end(); return; }
  let file = join(site, path.endsWith("/") ? `${path}index.html` : path);
  if (!existsSync(file) && !extname(path) && existsSync(`${file}.html`)) file = `${file}.html`;
  if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
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
const pages = ["", "aktualne", "poslanci", "party", "party?v=eu", "party?c=EPP", "hlasovani", "votes", "temata", "radar", `vote?id=${voteId}&m=${month}`, `vote?id=${partialId}`, "rozkol", "rozhodujici", "shoda", "moje-shoda",
  "prace", "prace-poslanci", "o-projektu", `p/${mepId}`, `s/${partyId}`, `v/${voteId}`, procPage];

const problems = [];
const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  for (const width of [1366, 390, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
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
      // R1: nové menu (Aktuálně + zlaté tlačítko Kvíz, na mobilu Kvíz uprostřed lišty), logo vede na rozcestník „/“.
      const nav = await page.evaluate(() => ({ now: !!document.querySelector('.site-header nav a[data-page="now"]'), quiz: !!document.querySelector(".site-header .quiz-btn"),
        tab: !!document.querySelector(".tabbar .tab-quiz"), logo: new URL(document.querySelector(".site-header .brand").getAttribute("href"), document.baseURI).pathname,
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
    await ctx.addInitScript(() => { window.__alerts = 0; window.alert = () => { window.__alerts += 1; }; });
    for (const url of [`v/${voteId}`, `p/${mepId}`, `s/${partyId}`, "rozkol", `vote?id=${voteId}&m=${month}`]) {
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
        await page.click('[data-fmt="story"]');
        await page.waitForFunction(() => document.querySelector(".sd-preview img")?.naturalHeight === 1920, null, { timeout: 15000 })
          .catch(() => problems.push(`${where}: po přepnutí na Story náhled nemá 1080 × 1920`));
        await page.click('[data-fmt="post"]');   // vrátit uložený formát
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
        await page.click('[data-fmt="detail"]');
        await page.waitForFunction(() => document.querySelectorAll(".sd-carousel img").length === 3 && [...document.querySelectorAll(".sd-carousel img")].every((i) => i.naturalWidth === 1080 && i.naturalHeight === 1350), null, { timeout: 20000 })
          .catch(() => problems.push(`${where}: detail nemá 3 obrázky 1080 × 1350 v karuselu`));
        await page.click('[data-fmt="post"]');
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
// R2 rozcestník: nadpis v oblouku se nepotká s tečkami, na 1366 × 900 je první řada dlaždic vidět bez scrollu,
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
        now: document.querySelector(".pt-now").getBoundingClientRect().bottom, k: document.getElementById("pt-k").textContent,
        ctl: !document.getElementById("pt-ctl").hidden, paused: document.getElementById("pt-pp").getAttribute("aria-pressed"),
        pos: [...document.querySelectorAll("#pt-svg .hm-seat")].map((a) => a.dataset.pos).join(""),
        titles: [...document.querySelectorAll("#pt-svg .hm-seat title")].filter((x) => x.textContent.includes(":")).length,
        seats: document.querySelectorAll("#pt-svg .hm-seat").length };
    });
    if (st.overlap) problems.push(`${where}: nadpis se překrývá s ${st.overlap} tečkami`);
    if (w === 1366 && st.now > h) problems.push(`${where}: první řada dlaždic není bez scrollu vidět (konec ${Math.round(st.now)} px)`);
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
  if ((await page.getAttribute('.sd-themes [aria-pressed="true"]', "data-card-theme").catch(() => null)) !== "dark") problems.push("sdílení bez úložiště: výchozí vzhled není podle režimu (tmavý)");
  await page.click('[data-card-theme="light"]').catch(() => {});
  await page.waitForFunction(() => document.querySelector(".sd-meta")?.textContent.includes("světlá"), null, { timeout: 15000 }).catch(() => problems.push("sdílení bez úložiště: přepnutí na světlou kartu nefunguje"));
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
      if (dots7 < 6 + 18 + 3) out.push(`vote ${theme} ${f.h}: nevykreslily se všechny tečky stran (${dots7})`);
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

// N5 Moje shoda: po 3 odpovědích jde vyhodnotit, výsledek je seřazený podle shody a u otázek se ukáže skutečný výsledek.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base + "moje-shoda", { waitUntil: "networkidle" });
  const n = await page.locator(".quiz-q").count();
  if (n < 3) problems.push(`moje-shoda: jen ${n} otázek`);
  else {
    if (!(await page.locator("#quiz-go").isDisabled())) problems.push("moje-shoda: vyhodnocení jde bez odpovědí");
    for (let i = 0; i < 3; i++) await page.locator(".quiz-q").nth(i).locator(".quiz-opt").first().click();
    await page.click("#quiz-go");
    const r = await page.evaluate(() => ({
      rows: [...document.querySelectorAll(".quiz-row .quiz-pct strong")].map((e) => parseFloat(e.textContent.replace(",", "."))),
      reveal: document.querySelectorAll(".quiz-reveal:not([hidden])").length,
    }));
    if (!r.rows.length) problems.push("moje-shoda: žádný poslanec ve výsledku");
    if (r.rows.some((x, i) => i && x > r.rows[i - 1])) problems.push("moje-shoda: výsledek není seřazený podle shody");
    if (r.reveal !== n) problems.push("moje-shoda: po vyhodnocení chybí skutečné výsledky u otázek");
    // Delší test: víc otázek, odpovědi z krátkého zůstanou.
    await page.locator('input[name="len"][value="long"]').check();
    const longN = await page.locator(".quiz-q").count();
    const kept = await page.locator('.quiz-q input[value="F"]:checked').count();
    if (longN <= n) problems.push(`moje-shoda: delší test nemá víc otázek (${longN})`);
    if (!kept) problems.push("moje-shoda: po přepnutí délky se ztratily odpovědi");
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
  await ctx.close();
}

// Pruh o starých datech (E3): s MOCK freshness.json se ukáže a projde axe ve světlém i tmavém režimu.
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
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
  for (const [from, to] of [["moje-shoda.html", "moje-shoda"], [`p/${mepId}.html`, `p/${mepId}`], ["index.html", ""],
    ["o-projektu.html#kontakt", "o-projektu#kontakt"], [`mep.html?id=${mepId}`, `p/${mepId}`]]) {
    await page.goto(base + from, { waitUntil: "networkidle" });
    if (page.url() !== base + to) problems.push(`stará adresa ${from} skončila na ${page.url()}, čekám ${base + to}`);
  }
  await ctx.close();
}
await browser.close();
server.close();
if (problems.length) {
  console.error(`Kontrola webu selhala (${problems.length}):\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log(`Kontrola webu v pořádku: ${pages.length} stránek × 2 režimy × 3 šířky.`);
