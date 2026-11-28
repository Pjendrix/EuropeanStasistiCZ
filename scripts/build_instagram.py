"""Balíček příspěvků pro Instagram (blok F, zadání docs/ZADANI_INSTAGRAM.md I4). Publikace zůstává ruční.

Výstup: out/instagram/<RRRR-MM-DD>/ (mimo git)
  hlasovani/  slide-1.png (1080 × 1350), story.png (1080 × 1920), popisek.txt, alt.txt, zdroje.txt
  poslanec/   slide-1.png … slide-3.png, story.png, popisek.txt, alt.txt, zdroje.txt

- Obrázky kreslí stejné šablony jako karty ke sdílení na webu (public/share.js, renderCardPng) v Chromiu přes Playwright:
  stránka v/{id}.html nebo p/{id}.html se načte z lokální kopie webu a karta se vykreslí z jejího shareContext.
- Hlasování: poslední plenární zasedání v datech (dny s hlasováním, mezera nejvýš 2 dny), jen závěrečná hlasování.
  Vybere se to, ve kterém se čeští poslanci rozdělili nejvíc (podíl menšiny mezi hlasy pro a proti, pak počet menšiny),
  při shodě novější. Pravidlo se vypíše do popisku. Žádné „nejlepší/nejhorší“.
- Poslanec: další v abecedním pořadí (sort_label) mezi poslanci v mandátu; stav rotace v data/instagram_state.json.
  Karta má jednotný neutrální avatar (rozhodnutí autora: nikdo není vizuálně zvýhodněn).
- Čísla v popiscích jsou ze stejných dat jako karty; AI se nepoužívá.
- Kontrola: každý slide má zdroj, datum dat a adresu epwatch.cz a žádný text nepřetéká, jinak skript skončí chybou.

Použití:
    python scripts/build_instagram.py [--date RRRR-MM-DD] [--out out/instagram] [--no-state]
Chromium: Playwright (CI: playwright install chromium) nebo cesta v proměnné CHROMIUM_PATH.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import functools
import http.server
import json
import os
import re
import shutil
import sys
import tempfile
import threading
from pathlib import Path

from build_pages import display_name, fmt_date, fmt_num, topic_text, vote_share_data
from categories import categories_for
from compute_stats import FormatError, active_positions, in_mandate, load_votes, require
from vote_kinds import is_final

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://epwatch.cz"
SESSION_GAP = 2
POS_CS = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdržel se", "DID_NOT_VOTE": "nehlasoval"}
ROLE_CS = {"rapporteur": "zpravodaj/ka", "co": "spoluzpravodaj/ka", "shadow": "stínový/á zpravodaj/ka"}
HASHTAGS = "#EvropskyParlament #europoslanci #EPWatchCZ"
VOTE_RULE = (
    "Proč právě toto hlasování: ze závěrečných hlasování posledního zasedání vybíráme pravidlem to, ve kterém se čeští "
    "poslanci rozdělili nejvíc (podíl menšiny mezi hlasy pro a proti), při shodě novější. Nehodnotíme, kdo hlasoval správně."
)
MEP_RULE = "Poslanci se v příspěvcích střídají v abecedním pořadí, bez výběru a bez hodnocení."


# --- výběr (čisté funkce, testované) ----------------------------------------------------


def last_session_days(votes: list[dict], gap: int = SESSION_GAP) -> list[str]:
    """Dny posledního zasedání: poslední skupina dnů s hlasováním, mezi kterými je mezera nejvýš `gap` dní."""
    days = sorted({v["date"] for v in votes})
    session: list[str] = []
    for d in days:
        if session and (dt.date.fromisoformat(d) - dt.date.fromisoformat(session[-1])).days > gap:
            session = []
        session.append(d)
    return session


def split_key(v: dict, meps_by_id: dict) -> tuple[float, int]:
    """Rozdělení české delegace: (podíl menšiny mezi hlasy pro a proti, počet menšiny). Jen poslanci v mandátu."""
    pos = [p["position"] for p in active_positions(v, meps_by_id)]
    yes, no = pos.count("FOR"), pos.count("AGAINST")
    minority = min(yes, no)
    return (minority / (yes + no) if yes + no else 0.0, minority)


def pick_vote(votes: list[dict], meps_by_id: dict) -> dict | None:
    """Závěrečné hlasování posledního zasedání s největším rozdělením Čechů; při shodě novější (čas, pak id)."""
    session = set(last_session_days(votes))
    finals = [v for v in votes if v["date"] in session and is_final(v)]
    if not finals:
        return None
    return max(finals, key=lambda v: (*split_key(v, meps_by_id), v.get("timestamp") or v["date"], v["id"]))


def mep_order(meps: list[dict], day: str) -> list[dict]:
    """Poslanci v mandátu k danému dni, abecedně podle sort_label (pak jméno a id)."""
    active = [m for m in meps if in_mandate(m["mandates"], day)]
    return sorted(active, key=lambda m: ((m.get("sort_label") or m["name"]).casefold(), m["id"]))


def next_mep(meps: list[dict], day: str, state: dict | None) -> dict:
    """Další poslanec v rotaci. Když předchozí mezitím odešel, pokračuje se abecedně za ním; po posledním znovu od začátku."""
    order = mep_order(meps, day)
    if not order:
        raise FormatError(f"k {day} není v mandátu žádný poslanec")
    last = (state or {}).get("last_mep")
    if not last:
        return order[0]
    ids = [m["id"] for m in order]
    if last.get("id") in ids:
        return order[(ids.index(last["id"]) + 1) % len(order)]
    key = ((last.get("sort_label") or "").casefold(), last.get("id") or 0)
    return next((m for m in order if ((m.get("sort_label") or m["name"]).casefold(), m["id"]) > key), order[0])


# --- texty ------------------------------------------------------------------------------


def _count_text(positions: list[str]) -> str:
    n = {k: positions.count(k) for k in POS_CS}
    parts = [f"{fmt_num(n['FOR'])} pro", f"{fmt_num(n['AGAINST'])} proti"]
    if n["ABSTENTION"]:
        parts.append(f"{n['ABSTENTION']} se zdržel{'o' if n['ABSTENTION'] >= 5 else 'i' if n['ABSTENTION'] > 1 else ''}")
    if n["DID_NOT_VOTE"]:
        parts.append(f"{n['DID_NOT_VOTE']} nehlasoval{'o' if n['DID_NOT_VOTE'] >= 5 else 'i' if n['DID_NOT_VOTE'] > 1 else ''}")
    return ", ".join(parts)


def vote_texts(v: dict, share: dict, trace: list[dict], data_day: str, session: list[str]) -> dict:
    """Popisek, alt texty a zdroje k hlasování. Čísla jen z dat (share = stejná data jako karta)."""
    url = f"{SITE}/v/{v['id']}"
    positions = [p for party in share["parties"] for p in party["positions"]]
    topic = topic_text(categories_for(v))
    lead = [f"{t['name']} ({ROLE_CS[t['role']]})" for t in trace if t.get("name")]
    rng = f"{fmt_date(session[0])} – {fmt_date(session[-1])}" if session[0] != session[-1] else fmt_date(session[0])
    lines = [
        share["title"],
        "",
        f"Hlasování {fmt_date(v['date'])} · {share['kindLabel']} · výsledek: {share['resultLabel']}.",
        f"Celý Evropský parlament: {fmt_num(share['ep'][0])} pro, {fmt_num(share['ep'][1])} proti, {fmt_num(share['ep'][2])} se zdrželo.",
        f"Čeští europoslanci (v mandátu k datu hlasování): {_count_text(positions)}.",
    ]
    if topic:
        lines.append(f"Téma: {topic}.")
    if lead:
        lines.append(f"Česká stopa: {', '.join(lead)}.")
    lines += [
        "",
        f"{VOTE_RULE} Zasedání {rng}.",
        "",
        f"Jak hlasoval každý poslanec a strana: {url.replace('https://', '')} (odkaz v bio)",
        f"Zdroj: HowTheyVote.eu (ODbL), data k {fmt_date(data_day)}.",
        "",
        HASHTAGS,
    ]
    alt = [
        f"slide-1.png: Karta hlasování EP Watch CZ. {share['title']}, {fmt_date(v['date'])}, výsledek {share['resultLabel']}. "
        f"Celý EP {fmt_num(share['ep'][0])} pro, {fmt_num(share['ep'][1])} proti. Čeští poslanci: {_count_text(positions)}, rozepsáno po stranách "
        f"barevnými tečkami. Zdroj HowTheyVote.eu, data k {fmt_date(data_day)}, {url.replace('https://', '')}.",
        "story.png: Stejná karta ve formátu story (9 : 16).",
    ]
    sources = [
        f"Hlasování: https://howtheyvote.eu/votes/{v['id']} (HowTheyVote.eu, ODbL)",
        f"Detail na webu: {url}",
        "Česká stopa: EP Open Data (CC BY 4.0)" if lead else None,
        f"Data k {fmt_date(data_day)}.",
    ]
    return {"popisek": "\n".join(lines) + "\n", "alt": "\n".join(alt) + "\n", "zdroje": "\n".join(s for s in sources if s) + "\n"}


def session_texts(data: dict) -> dict:
    """Popisek, alt texty a zdroje ke kartě zasedání (data = kontext karty ze zasedani.html, session_page.share_context)."""
    url = f"{SITE}/zasedani"
    head = "Jak dopadlo zasedání Evropského parlamentu" if data["results"] else "Tento týden v Bruselu: zasedání Evropského parlamentu"
    lines = [f"{head} {data['when']}.", ""]
    for pk in data["picks"]:
        lines.append(f"• {pk['title']}" + (f" ({pk['decision'][0].lower()}{pk['decision'][1:]})" if pk.get("decision") else ""))
        lines += [f"  {x}" for x in (pk.get("result"), pk.get("cz")) if x]
    lines += [
        "",
        "Body vybírá pravidlo, ne redakce: nejdřív česká stopa (zpravodajové), pak zákony a konečná schválení dohod s Radou.",
        "",
        f"Celý program po dnech a co se u zákonů rozhoduje: {url.replace('https://', '')} (odkaz v bio)",
        f"Zdroj: program EP (EP Open Data, CC BY 4.0), HowTheyVote.eu, data k {fmt_date(data['dataDay'])}.",
        "",
        HASHTAGS,
    ]
    alt = [
        f"slide-1.png: Karta EP Watch CZ „{head}“ {data['when']}: "
        + "; ".join(pk["title"] for pk in data["picks"])
        + f". Zdroj program EP, data k {fmt_date(data['dataDay'])}, {url.replace('https://', '')}.",
        "story.png: Stejná karta ve formátu story (9 : 16).",
    ]
    sources = [
        "Program zasedání: EP Open Data (CC BY 4.0), https://data.europarl.europa.eu",
        "Výsledky: HowTheyVote.eu (ODbL)" if data["results"] else None,
        f"Na webu: {url}",
        f"Data k {fmt_date(data['dataDay'])}.",
    ]
    return {"popisek": "\n".join(lines) + "\n", "alt": "\n".join(alt) + "\n", "zdroje": "\n".join(x for x in sources if x) + "\n"}


def sitting_texts(data: dict, n: int) -> dict:
    """Popisek, alt texty a zdroje ke karuselu zasedání (data = kontext karty ze zasedani.html, sitting_share.py)."""
    url = f"{SITE}/zasedani"
    lines = [f"Jak hlasoval Evropský parlament na zasedání {data['when']}.", ""]
    lines.append(
        f"{data['finals']} závěrečných hlasování (přijato {data['adopted']}, zamítnuto {data['rejected']})"
        + (f"; Češi jednotní v {data['united']} z {data['considered']}" if data["considered"] else "")
        + "."
    )
    lines.append("")
    for v in data["main"]:
        lines.append(f"• {v['title']}")
        lines.append(
            f"  EP: {v['resultLabel']} · Češi {v['cz'][0]} pro, {v['cz'][1]} proti, {v['cz'][2]} se zdrželo, {v['cz'][3]} nehlasovalo"
        )
    lines += [
        "",
        "Hlavní hlasování vybírá pravidlo, ne redakce: česká stopa, rozdělení Češi, rozhodující české hlasy, těsný výsledek.",
        "",
        f"Všechna hlasování zasedání: {url.replace('https://', '')} (odkaz v bio)",
        f"Zdroj: HowTheyVote.eu (ODbL), EP Open Data, data k {fmt_date(data['dataDay'])}. Strany k datu hlasování.",
        "",
        HASHTAGS,
    ]
    label = {
        "overview": "přehled zasedání (počty hlasování, kolikrát byli Češi jednotní a rozdělení, česká stopa)",
        "main": "hlavní hlasování: " + "; ".join(v["title"] for v in data["main"]),
        "split": "kde se Češi rozdělili: " + "; ".join(v["title"] for v in data["split"]),
        "trace": "česká stopa: " + "; ".join(f"{v['title']} ({', '.join(p['name'] for p in v['people'])})" for v in data["traceItems"]),
    }
    alt = [
        f"slide-{i + 1}.png: Karta EP Watch CZ {i + 1} z {n}, zasedání {data['when']}: {label[k]}."
        for i, k in enumerate(data["slides"][:n])
    ]
    alt.append("story.png: První karta (přehled) ve formátu story (9 : 16).")
    sources = [
        "Hlasování: HowTheyVote.eu (ODbL), https://howtheyvote.eu",
        "Zpravodajové a strany: EP Open Data (CC BY 4.0), https://data.europarl.europa.eu",
        f"Na webu: {url}",
        f"Data k {fmt_date(data['dataDay'])}.",
    ]
    return {"popisek": "\n".join(lines) + "\n", "alt": "\n".join(alt) + "\n", "zdroje": "\n".join(sources) + "\n"}


def _pct(pair) -> str | None:
    return f"{pair[0] / pair[1] * 100:.1f} %".replace(".", ",") if pair and pair[1] else None


def mep_texts(m: dict, data: dict, data_day: str) -> dict:
    """Popisek, alt texty a zdroje ke kartě poslance (data = shareContext karty, stejná čísla jako na webu)."""
    url = f"{SITE}/p/{m['id']}"
    name = data["name"]
    chips = " · ".join(c["label"] for c in data.get("chips") or [])
    att = _pct(data.get("attendance"))
    lines = [f"{name}", f"{chips} · {data.get('mandate', '')}".strip(" ·"), ""]
    if att:
        lines.append(f"Účast na jmenovitých hlasováních: {att} ({fmt_num(data['attendance'][0])} z {fmt_num(data['attendance'][1])}).")
    if data.get("attendanceMedian") is not None:
        lines.append(f"Medián všech poslanců EP: {_pct([data['attendanceMedian'], 1])}.")
    if _pct(data.get("loyalty")):
        lines.append(f"Hlasuje se svou frakcí: {_pct(data['loyalty'])}.")
    lines += [
        "",
        f"Další čísla (hlasování, zprávy, projevy) jsou na dalších obrázcích a na webu: {url.replace('https://', '')} (odkaz v bio)",
        MEP_RULE,
        f"Zdroj: HowTheyVote.eu (ODbL) a EP Open Data (CC BY 4.0), data k {fmt_date(data_day)}.",
        "",
        HASHTAGS,
    ]
    alt = [
        f"slide-1.png: Karta poslance EP Watch CZ, {name} ({chips}), jednotný neutrální avatar místo fotky. "
        f"{'Účast na hlasováních ' + att + '. ' if att else ''}Zdroj a datum dat v patičce, {url.replace('https://', '')}.",
        f"slide-2.png: {name}, jak hlasuje: podíl hlasů pro, proti a zdržení, shoda s frakcí a s výsledkem, s mediány EP.",
        f"slide-3.png: {name}, práce mimo hlasování: zprávy, stanoviska, projevy v plénu, otázky a výbory podle EP Open Data.",
        "story.png: Základní karta ve formátu story (9 : 16).",
    ]
    sources = [
        f"Profil na webu: {url}",
        "Hlasování: https://howtheyvote.eu (ODbL)",
        "Poslanci, výbory, zprávy a projevy: https://data.europarl.europa.eu (CC BY 4.0)",
        f"Data k {fmt_date(data_day)}.",
    ]
    return {"popisek": "\n".join(lines) + "\n", "alt": "\n".join(alt) + "\n", "zdroje": "\n".join(sources) + "\n"}


def check_slide(name: str, texts: list[str], overflow: list[str]) -> None:
    """Každý slide: zdroj, datum dat a adresa webu; žádný přetékající text."""
    joined = " | ".join(texts)
    missing = [
        what
        for what, ok in (
            ("zdroj", "Zdroj" in joined or "zdroj" in joined),
            ("datum dat", "data k " in joined),
            ("adresa epwatch.cz", "epwatch.cz" in joined),
        )
        if not ok
    ]
    if missing:
        raise FormatError(f"{name}: na slidu chybí {', '.join(missing)}")
    if overflow:
        raise FormatError(f"{name}: text přetéká: {'; '.join(overflow)}")


# --- vykreslení v Chromiu -----------------------------------------------------------------

RENDER_JS = """async ([fmt, neutral]) => {
  // Šablony karet z modulu share.js (stejná instance jako na stránce, i s ?v=…); kontext sdílení buď z window.shareContext
  // (stránky s JS), nebo ze statického <script id="share-context"> (v/, p/, zasedani – share.js staticShareContext).
  let script = null;
  for (let i = 0; i < 100 && !(script = document.querySelector('script[src*="share.js"]')); i++) await new Promise((r) => setTimeout(r, 100));
  if (!script) throw new Error("stránka nenačítá share.js");
  const m = await (await import(script.src)).loadSharePanel(), fmtLib = await import(new URL("lib/format.js", script.src).href);
  for (let i = 0; i < 50 && typeof window.shareContext !== "function" && !document.getElementById("share-context"); i++) await new Promise((r) => setTimeout(r, 100));
  let ctx = typeof window.shareContext === "function" ? await window.shareContext("") : null;
  if (!ctx && document.getElementById("share-context")) {
    const all = JSON.parse(document.getElementById("share-context").textContent);
    ctx = fmtLib.withShareUrl(all.kind ? all : all.default);
  }
  if (!ctx) throw new Error("stránka nemá kontext sdílení");
  await document.fonts.ready;
  if (neutral) ctx.data = { ...ctx.data, avatar: "neutral" };
  const blob = await m.renderCardPng(ctx, fmt);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  // kontrola textů stejnými funkcemi, jakými se kreslilo
  const f = m.SHARE_FORMATS[fmt], data = { ...ctx.data };
  if (!data.dataDay) { const ov = await (await fetch(new URL("data/overview.json", script.src))).json(); data.dataDay = ov.sources?.votes?.release || ov.period?.to; }
  const ops = m.cardOps(ctx.kind, data, f, fmt);
  const texts = [], overflow = [];
  ops.filter((o) => o.k === "text").forEach((o) => {
    texts.push(o.s);
    const w = m.measureText(o.s, o.size, o.weight), x0 = o.anchor === "right" ? o.x - w : o.anchor === "center" ? o.x - w / 2 : o.x;
    if (x0 < 50 || x0 + w > 1030) overflow.push(o.s.slice(0, 40));
  });
  return { png: btoa(bin), texts, overflow, data, kind: ctx.kind };
}"""


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(site: Path):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(site)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def render(site: Path, jobs: list[tuple[str, str, bool]]) -> list[dict]:
    """jobs = [(stránka, formát, neutrální avatar)]; vrací PNG a texty každého slidu."""
    from playwright.sync_api import sync_playwright

    srv = serve(site)
    base = f"http://127.0.0.1:{srv.server_address[1]}/"
    out = []
    try:
        with sync_playwright() as p:
            exe = os.environ.get("CHROMIUM_PATH")
            browser = p.chromium.launch(**({"executable_path": exe} if exe else {}))
            page = browser.new_page(viewport={"width": 1200, "height": 900})
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            current = None
            for url, fmt, neutral in jobs:
                if url != current:
                    page.goto(base + url, wait_until="networkidle")
                    current = url
                res = page.evaluate(RENDER_JS, [fmt, neutral])
                res["png"] = base64.b64decode(res["png"])
                out.append(res)
            browser.close()
            if errors:
                raise FormatError(f"chyba na stránce při kreslení karet: {errors[0]}")
    finally:
        srv.shutdown()
    return out


# --- sestavení ------------------------------------------------------------------------------


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_package(folder: Path, slides: list[tuple[str, dict]], texts: dict) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for name, res in slides:
        check_slide(f"{folder.name}/{name}", res["texts"], res["overflow"])
        (folder / name).write_bytes(res["png"])
    alt_names = [line.split(":", 1)[0] for line in texts["alt"].splitlines() if line]
    if sorted(alt_names) != sorted(n for n, _ in slides):
        raise FormatError(f"{folder.name}: alt.txt nemá záznam pro každý slide ({alt_names})")
    for key in ("popisek", "alt", "zdroje"):
        (folder / f"{key}.txt").write_text(texts[key], encoding="utf-8")


def build(data_dir: Path, public: Path, out_root: Path, day: str, state_path: Path | None, only_new: bool = False) -> dict | None:
    meps_doc = _read(data_dir / "meps.json")
    require(meps_doc, ["meps"], "meps.json")
    meps = meps_doc["meps"]
    meps_by_id = {m["id"]: m for m in meps}
    index, votes = load_votes(data_dir / "votes")
    data_day = (index.get("source") or {}).get("release") or max(v["date"] for v in votes)
    data_day = data_day[:10]
    parties = _read(data_dir / "parties.json")
    groups = index["groups"]
    roles_path = data_dir / "vote_roles.json"
    roles = _read(roles_path)["votes"] if roles_path.exists() else {}
    state = _read(state_path) if state_path and state_path.exists() else {}
    if only_new and state.get("last_release") == data_day:
        return None  # pro tento export už balíček je (např. pondělní pojistka po dřívější aktualizaci)

    vote = pick_vote(votes, meps_by_id)
    mep = next_mep(meps, day, state)
    if vote and not (public / "v" / f"{vote['id']}.html").exists():
        raise FormatError(f"chybí stránka v/{vote['id']}.html, spusť nejdřív build_pages.py")
    if not (public / "p" / f"{mep['id']}.html").exists():
        raise FormatError(f"chybí stránka p/{mep['id']}.html, spusť nejdřív build_pages.py")

    with tempfile.TemporaryDirectory() as tmp:  # web jako na Vercelu: public/ + data/ v public/data
        site = Path(tmp) / "site"
        shutil.copytree(public, site)
        shutil.copytree(data_dir, site / "data", dirs_exist_ok=True)
        session = (public / "zasedani.html").exists() and 'id="share-context"' in (public / "zasedani.html").read_text(encoding="utf-8")
        # po zasedání je na stránce karusel (sitting_share.py, 2–4 obrázky), před ním jedna karta programu
        sess_formats = ["post", "story"]
        if session:
            m = re.search(r'id="share-context">(.*?)</script>', (public / "zasedani.html").read_text(encoding="utf-8"), re.S)
            sctx = json.loads(m.group(1)) if m else {}
            if sctx.get("kind") == "sitting":
                n = len(sctx["data"]["slides"])
                sess_formats = ["post", *[f"slide{i}" for i in range(2, n + 1)], "story"]
        jobs = (
            ([(f"v/{vote['id']}.html", "post", False), (f"v/{vote['id']}.html", "story", False)] if vote else [])
            + [("zasedani.html", fmt, False) for fmt in sess_formats] * session
            + [(f"p/{mep['id']}.html", fmt, True) for fmt in ("post", "slide2", "slide3", "story")]
        )
        rendered = render(site, jobs)

    out = out_root / day
    if out.exists():
        shutil.rmtree(out)
    result = {"date": day, "vote": None, "mep": mep["id"], "out": str(out)}
    if vote:
        trace_roles = roles.get(str(vote["id"]), [])
        trace = [
            {"name": display_name(meps_by_id[r["mep_id"]]) if r["mep_id"] in meps_by_id else None, "role": r["role"]} for r in trace_roles
        ]
        share = vote_share_data(vote, meps_by_id, groups, parties, None, trace=bool(trace_roles))
        n_active = len(active_positions(vote, meps_by_id))
        if sum(len(p["positions"]) for p in share["parties"]) != n_active:
            raise FormatError(f"hlasování {vote['id']}: tečky na kartě nesedí s počtem poslanců v mandátu ({n_active})")
        write_package(
            out / "hlasovani",
            [("slide-1.png", rendered[0]), ("story.png", rendered[1])],
            vote_texts(vote, share, trace, data_day, last_session_days(votes)),
        )
        result["vote"] = vote["id"]
    if session:
        k = len(sess_formats)
        sess = rendered[2 if vote else 0 : (2 if vote else 0) + k]
        if sess[0].get("kind") == "sitting":
            slides = [(f"slide-{i + 1}.png", r) for i, r in enumerate(sess[:-1])]
            write_package(out / "zasedani", [*slides, ("story.png", sess[-1])], sitting_texts(sess[0]["data"], len(slides)))
            result["session"] = sess[0]["data"]["when"]
        elif sess[0]["data"].get("picks"):
            write_package(out / "zasedani", [("slide-1.png", sess[0]), ("story.png", sess[1])], session_texts(sess[0]["data"]))
            result["session"] = sess[0]["data"]["when"]
    mep_res = rendered[-4:]
    write_package(
        out / "poslanec",
        [("slide-1.png", mep_res[0]), ("slide-2.png", mep_res[1]), ("slide-3.png", mep_res[2]), ("story.png", mep_res[3])],
        mep_texts(mep, mep_res[0]["data"], data_day),
    )
    if state_path:
        state_path.write_text(
            json.dumps(
                {
                    "note": "Rotace poslanců v balíčku pro Instagram (scripts/build_instagram.py).",
                    "last_mep": {"id": mep["id"], "sort_label": mep.get("sort_label") or mep["name"]},
                    "last_date": day,
                    "last_release": data_day,
                },
                ensure_ascii=False,
                indent=1,
            )
            + "\n",
            encoding="utf-8",
        )
    return result


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--date", default=dt.datetime.now(dt.timezone.utc).date().isoformat(), help="datum balíčku (složka a rotace)")
    p.add_argument("--data-dir", type=Path, default=ROOT / "data")
    p.add_argument("--public", type=Path, default=ROOT / "public")
    p.add_argument("--out", type=Path, default=ROOT / "out" / "instagram")
    p.add_argument("--no-state", action="store_true", help="neposouvat rotaci poslanců (zkušební běh)")
    p.add_argument("--only-new", action="store_true", help="nic nedělat, když pro aktuální export dat už balíček byl")
    args = p.parse_args(argv)
    try:
        res = build(
            args.data_dir,
            args.public,
            args.out,
            args.date,
            None if args.no_state else args.data_dir / "instagram_state.json",
            args.only_new,
        )
    except FormatError as e:
        print(f"CHYBA: {e}", file=sys.stderr)
        return 2
    if res is None:
        print("balíček pro tento export dat už byl, nic nového", file=sys.stderr)
        print("built=false")
        return 0
    print("built=true")
    print(
        f"balíček {res['date']}: hlasování {res['vote'] or 'žádné závěrečné na posledním zasedání'}, poslanec {res['mep']} → {res['out']}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
