// Sdílení (X12): tlačítko „Sdílet“ (atribut data-share) otevře panel s kartou ke sdílení.
// Panel a šablony karet jsou v lib/share-panel.js a načtou se až při najetí na tlačítko nebo kliknutí (revize 3. 11. 2026:
// dřív ~26 kB gz na každé stránce, i když nikdo nesdílel).
// Stránka nastaví window.shareContext = () => ({ kind: "vote" | "mep", url, text, filename, data }), statické stránky mají
// JSON v <script id="share-context">. Testy a build_instagram.py berou šablony přes loadSharePanel() (stejná instance modulu).
export const loadSharePanel = () => import("./lib/share-panel.js");

let warm = null;
const prefetch = () => { warm ||= loadSharePanel().catch((e) => { warm = null; throw e; }); return warm; };
const onShareButton = (ev) => { if (ev.target.closest?.("[data-share]")) prefetch().catch(() => {}); };
document.addEventListener("pointerover", onShareButton, { passive: true });
document.addEventListener("focusin", onShareButton);

document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-share]");
  if (!btn) return;
  ev.preventDefault();
  btn.closest("[popover]")?.hidePopover?.();
  btn.setAttribute("aria-busy", "true");
  try {
    (await prefetch()).openSharePanel(btn);
  } catch (e) {
    console.warn(e);   // bez sítě se panel neotevře; stránka funguje dál
  } finally {
    btn.removeAttribute("aria-busy");
  }
});
