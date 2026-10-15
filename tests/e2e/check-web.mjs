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
const pages = ["index.html", "poslanci.html", "party.html", "votes.html", `vote.html?id=${voteId}&m=${month}`, "rozkol.html", "rozhodujici.html", "shoda.html",
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
  for (const url of ["prace-poslanci.html", "shoda.html", "votes.html"]) {
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
// S3: nabídka Sdílet není nikdy překrytá (sticky lišta, stacking context) a Esc ji zavře i s návratem fokusu.
// Bez reducedMotion, aby běžela animace .reveal, která chybu původně způsobovala.
for (const width of [1366, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  for (const url of [`p/${mepId}.html`, `vote.html?id=${voteId}&m=${month}`, `v/${voteId}.html`]) {
    const page = await ctx.newPage();
    await page.goto(base + url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const where = `${url} [sdílení, ${width}px]`;
    if (!(await page.$("[data-share]"))) { problems.push(`${where}: chybí tlačítko Sdílet`); await page.close(); continue; }
    await page.click("[data-share]");
    const covered = await page.evaluate(() => [...document.querySelectorAll(".share-menu [role=menuitem]")].filter((e) => {
      const q = e.getBoundingClientRect(); return !e.contains(document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2)); }).map((e) => e.textContent.trim()));
    if (covered.length) problems.push(`${where}: nabídku překrývá jiný prvek: ${covered.join(", ")}`);
    if (width === 1366 && url.startsWith("v/")) {  // S5: karta hlasování se na statické stránce stáhne jako PNG 1080 × 1350
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click('.share-menu [data-act="download:post"]')]);
      const buf = await (await import("node:fs/promises")).readFile(await dl.path());
      const okPng = buf.slice(1, 4).toString() === "PNG" && buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1350;
      if (!okPng) problems.push(`${where}: stažená karta není PNG 1080 × 1350`);
      await page.click("[data-share]");
    }
    await page.keyboard.press("Escape");
    const state = await page.evaluate(() => ({ open: Boolean(document.querySelector(".share-menu")), focus: document.activeElement?.matches("[data-share]") }));
    if (state.open || !state.focus) problems.push(`${where}: Esc nezavřel nabídku nebo nevrátil fokus`);
    await page.close();
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
