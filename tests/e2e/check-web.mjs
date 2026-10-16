// Kontrola webu v prohlížeči (U12): žádná chyba v konzoli, nic nepřetéká do šířky (1366 / 390 / 320 px), axe-core
// (WCAG 2 A/AA, 2.1 AA) bez porušení ve světlém i tmavém režimu. Spouští se v CI (.github/workflows/web-check.yml) a lokálně:
//   NODE_PATH=/cesta/k/node_modules node tests/e2e/check-web.mjs
// Web se obslouží z kopie public/ + data/ (jako Vercel: buildCommand kopíruje data do public/data).
import { createRequire } from "node:module";
import { cpSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
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
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(site, path.endsWith("/") ? `${path}index.html` : path);
  if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
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
const pages = ["index.html", "poslanci.html", "party.html", "party.html?v=eu", "party.html?c=EPP", "hlasovani.html", "votes.html", "temata.html", `vote.html?id=${voteId}&m=${month}`, "rozkol.html", "rozhodujici.html", "shoda.html",
  "prace.html", "prace-poslanci.html", "o-projektu.html", `p/${mepId}.html`, `s/${partyId}.html`, `v/${voteId}.html`];

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
        await page.addScriptTag({ content: axeSource });
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
  for (const url of ["prace-poslanci.html", "shoda.html", "temata.html"]) {
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
    for (const url of [`v/${voteId}.html`, `p/${mepId}.html`, `s/${partyId}.html`, "rozkol.html", `vote.html?id=${voteId}&m=${month}`]) {
      const page = await ctx.newPage();
      await page.goto(base + url, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const where = `${url} [sdílení, ${scheme}, ${width}px]`;
      const btns = page.locator("[data-share]:visible");
      if ((await btns.count()) !== 1) { problems.push(`${where}: čekám právě jedno viditelné tlačítko Sdílet, je ${await btns.count()}`); await page.close(); continue; }
      if (await page.$(".cite-btn")) problems.push(`${where}: na stránce zůstalo ❝ (.cite-btn)`);
      await btns.first().click();
      await page.waitForSelector("dialog[open] .sd-preview img", { timeout: 15000 }).catch(() => problems.push(`${where}: panel neukázal náhled`));
      const st = await page.evaluate(() => {
        const d = document.querySelector("dialog.share-dlg[open]");
        const img = d?.querySelector(".sd-preview img");
        const covered = d ? [...d.querySelectorAll("button:not([hidden]), a, input")].filter((e) => {
          const q = e.getBoundingClientRect();
          if (!q.width || q.bottom < 0 || q.top > innerHeight) return false;   // mimo výřez (panel se posouvá)
          return !e.contains(document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2));
        }).map((e) => e.textContent.trim() || e.getAttribute("aria-label")) : [];
        return { open: Boolean(d), focus: document.activeElement?.classList.contains("sd-primary"), nw: img?.naturalWidth, nh: img?.naturalHeight,
          covered, sw: document.documentElement.scrollWidth, dw: d ? d.scrollWidth - d.clientWidth : 0 };
      });
      if (!st.open) { problems.push(`${where}: klik neotevřel dialog`); await page.close(); continue; }
      if (!st.focus) problems.push(`${where}: fokus po otevření není na hlavním tlačítku`);
      if (st.nw !== 1080 || st.nh !== 1350) problems.push(`${where}: náhled má ${st.nw}×${st.nh}, čekám 1080×1350`);
      if (st.covered.length) problems.push(`${where}: ovládací prvky panelu něco překrývá: ${st.covered.join(", ")}`);
      if (st.sw > width || st.dw > 0) problems.push(`${where}: panel přetéká do šířky`);
      if (width === 1366) {
        await page.addScriptTag({ content: axeSource });
        const v = await page.evaluate(async () => (await axe.run(document.querySelector("dialog.share-dlg"), { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations
          .map((x) => `${x.id} (${x.nodes.length}×): ${x.nodes[0].target.join(" ")}`));
        v.forEach((x) => problems.push(`${where}: axe v panelu ${x}`));
      }
      if (scheme === "light" && width === 1366 && url.startsWith("v/")) {
        // Co je v náhledu, to se stáhne: PNG 1080 × 1350; story 1080 × 1920.
        const [dl] = await Promise.all([page.waitForEvent("download"), page.click(".sd-primary")]);
        const size = pngSize(await (await import("node:fs/promises")).readFile(await dl.path()));
        if (!size || size[0] !== 1080 || size[1] !== 1350) problems.push(`${where}: stažená karta není PNG 1080 × 1350 (${size})`);
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
  await page.goto(base + `p/${mepId}.html`, { waitUntil: "networkidle" });
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
// N3: pravidla nových karet (metric, split, party) s MOCK daty: text se vejde, chybějící hodnota se vynechá,
// počet řádků napsaný na kartě = počet vykreslených řádků; neutrální avatar nekreslí portrét.
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + `v/${voteId}.html`, { waitUntil: "networkidle" });
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    const out = [];
    const fits = (name, ops) => ops.filter((o) => o.k === "text").forEach((o) => {
      const w = measureText(o.s, o.size, o.weight);
      const x0 = o.anchor === "right" ? o.x - w : o.anchor === "center" ? o.x - w / 2 : o.x;
      if (x0 < 50 || x0 + w > 1030) out.push(`${name}: text „${o.s.slice(0, 40)}“ přetéká (${Math.round(x0)}–${Math.round(x0 + w)})`);
    });
    const texts = (ops) => ops.filter((o) => o.k === "text").map((o) => o.s).join(" | ");
    const base = { dataDay: "2026-10-10", urlShort: "epwatch.cz/p/1#dochazka" };
    for (const [fk, f] of [["post", SHARE_FORMATS.post], ["story", SHARE_FORMATS.story]]) {
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
    }
    const neutral = mepBasicOps({ ...base, name: "MOCK Poslanec", avatar: "neutral", photo: { width: 10, height: 10 }, chips: [], attendance: [1, 2], attendanceMedian: 0.9 }, SHARE_FORMATS.post);
    if (neutral.some((o) => o.k === "image" && o.img && o.img.width === 10) || /European Union/.test(texts(neutral))) out.push("mep: avatar neutral kreslí portrét");
    return out;
  });
  r.forEach((x) => problems.push(`karty: ${x}`));
  await ctx.close();
}
await browser.close();
server.close();
if (problems.length) {
  console.error(`Kontrola webu selhala (${problems.length}):\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log(`Kontrola webu v pořádku: ${pages.length} stránek × 2 režimy × 3 šířky.`);
