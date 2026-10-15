"""Karty ke sdílení (X12): náhledy odkazů 1200 × 630 pro poslance a závěrečná hlasování.

Výstup: public/og/p/{id}.png (poslanci), public/og/v/{id}.png (závěrečná hlasování za posledních 12 měsíců
od posledního hlasování v datech), public/og/default.png (obecná karta webu). Stránky p/ a v/ je mají v og:image
(scripts/build_pages.py). Starší hlasování mají obecný obrázek, aby repo nenarůstalo.

Pravidla karty (viz docs/REVIZE_2026-10-15.md, X12): každá karta má zdroj, adresu stránky a datum; u poslance vždy
i medián EP; žádné pořadí a žádné hodnocení barvou u metrik poslance; žádná loga stran ani frakcí (jen zkratka a tečka);
portrét s popiskem „© European Union – Source: EP“. Čísla se jen berou z data/ (spočítal compute_stats.py a build_web.py),
nic se tu nepočítá nově kromě skládání hlasů do počtů.

Obrázky jsou deterministické (stejný vstup = stejné bajty), takže nezměněná karta nezpůsobí změnu v gitu.
Písmo: Plus Jakarta Sans (SIL OFL 1.1), scripts/fonts/.

Použití:
    python scripts/build_cards.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import sys
from collections import Counter
from pathlib import Path

from build_web import vote_title
from compute_stats import FormatError, active_positions, load_votes, require
from vote_kinds import KIND_LABELS, classify, is_final

W, H = 1200, 630
FONT_PATH = Path(__file__).resolve().parent / "fonts" / "PlusJakartaSans-VF.ttf"
CARD_MONTHS_DAYS = 365

# Barvy jako na webu (public/style.css, tmavý režim): pro / proti / zdržel se / nehlasoval
NAVY, NAVY_2 = (15, 23, 42), (10, 18, 38)
WHITE, MUTED, SOFT = (248, 250, 252), (148, 163, 184), (203, 213, 225)
GOLD = (245, 158, 11)
FOR_C, AGAINST_C, ABST_C, ABSENT_C = (96, 165, 250), (251, 146, 60), (148, 163, 184), (71, 85, 105)
POS_COLOR = {"FOR": FOR_C, "AGAINST": AGAINST_C, "ABSTENTION": ABST_C, "DID_NOT_VOTE": ABSENT_C}
POS_LABEL = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdržel se", "DID_NOT_VOTE": "nehlasoval"}
POSITIONS = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"]

RESULT_LABEL = {"ADOPTED": "přijato", "REJECTED": "zamítnuto", "LAPSED": "propadlo", "WITHDRAWN": "staženo"}
# Výsledek jako věta podle typu hlasování (stejné texty jako resultSentence() v public/app.js).
RESULT_SENTENCE = {
    "rejection": ("Návrh na zamítnutí prošel – text je zamítnut", "Návrh na zamítnutí neprošel – text zůstává"),
    "objection": ("Parlament vznesl námitku proti aktu Komise", "Námitka neprošla – akt Komise platí"),
    "amendment": ("Pozměňovací návrh byl přijat", "Pozměňovací návrh byl zamítnut"),
    "split_part": ("Tato část textu byla přijata", "Tato část textu byla zamítnuta"),
    "final": ("Parlament text přijal", "Parlament text zamítl"),
    "provisional_agreement": ("Parlament dohodu s Radou schválil", "Parlament dohodu s Radou zamítl"),
    "mandate": ("Mandát k jednání s Radou schválen", "Mandát k jednání s Radou neschválen"),
    "urgency": ("Naléhavý postup schválen", "Naléhavý postup zamítnut"),
}

NBSP = " "


def fmt_date(iso: str) -> str:
    y, m, d = iso[:10].split("-")
    return f"{int(d)}. {int(m)}. {y}"


def fmt_pct(x: float | None) -> str:
    return "–" if x is None else f"{x * 100:.1f}".replace(".", ",") + f"{NBSP}%"


def fmt_num(n: int) -> str:
    return f"{n:,}".replace(",", NBSP)


def result_sentence(kind: str, result: str | None) -> str:
    s = RESULT_SENTENCE.get(kind)
    if result in ("ADOPTED", "REJECTED") and s:
        return s[0 if result == "ADOPTED" else 1]
    return RESULT_LABEL.get(result, "výsledek neuveden").capitalize()


def card_vote_ids(votes: list[dict]) -> set[int]:
    """Závěrečná hlasování, která mají kartu: za posledních 12 měsíců od posledního hlasování v datech."""
    if not votes:
        return set()
    last = dt.date.fromisoformat(max(v["date"] for v in votes))
    since = (last - dt.timedelta(days=CARD_MONTHS_DAYS)).isoformat()
    return {v["id"] for v in votes if is_final(v) and v["date"] >= since}


# --- kreslení -------------------------------------------------------------------------

_fonts: dict = {}


def font(size: int, weight: int = 400):
    from PIL import ImageFont
    key = (size, weight)
    if key not in _fonts:
        f = ImageFont.truetype(str(FONT_PATH), size)
        f.set_variation_by_axes([weight])
        _fonts[key] = f
    return _fonts[key]


def text_w(draw, s: str, f) -> float:
    return draw.textlength(s, font=f)


def fit(draw, s: str, f, max_w: int) -> str:
    """Zkrátí text na šířku max_w a přidá „…“."""
    if text_w(draw, s, f) <= max_w:
        return s
    while s and text_w(draw, s + "…", f) > max_w:
        s = s[:-1]
    return s.rstrip() + "…"


def wrap(draw, s: str, f, max_w: int, max_lines: int) -> list[str]:
    """Zalomí text do nejvýš max_lines řádků; poslední se případně zkrátí s „…“."""
    words, lines, cur = s.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if text_w(draw, trial, f) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = fit(draw, lines[-1] + " …", f, max_w)
    return [fit(draw, ln, f, max_w) for ln in lines]


def new_card():
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    # jemný přechod: tmavší spodek
    for y in range(H):
        t = y / H
        c = tuple(int(NAVY[i] * (1 - t) + NAVY_2[i] * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    d.rectangle([0, 0, 8, H], fill=GOLD)
    return img, d


def header(d, right: str) -> None:
    d.text((56, 38), "EP WATCH", font=font(26, 800), fill=GOLD)
    d.text((56 + text_w(d, "EP WATCH ", font(26, 800)), 38), "CZ", font=font(26, 800), fill=WHITE)
    d.text((W - 56, 42), right, font=font(22, 500), fill=SOFT, anchor="ra")


def footer(d, left: str, url: str | None) -> None:
    d.line([(56, H - 66), (W - 56, H - 66)], fill=(51, 65, 85), width=1)
    d.text((56, H - 50), fit(d, left, font(18, 500), W - 112 - (int(text_w(d, url, font(18, 600))) + 24 if url else 0)),
           font=font(18, 500), fill=MUTED)
    if url:
        d.text((W - 56, H - 50), url, font=font(18, 600), fill=SOFT, anchor="ra")


def stacked_bar(d, x: int, y: int, w: int, h: int, counts: list[int]) -> None:
    total = sum(counts) or 1
    cx = x
    for pos, n in zip(POSITIONS, counts):
        seg = round(w * n / total)
        if n and seg:
            d.rounded_rectangle([cx, y, cx + max(seg - 2, 1), y + h], radius=3, fill=POS_COLOR[pos])
        cx += seg


def to_png(img) -> bytes:
    """PNG s paletou (menší soubor, deterministické)."""
    from PIL import Image
    buf = io.BytesIO()
    img.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# --- karty ----------------------------------------------------------------------------

def group_label(code: str | None, groups: list[dict]) -> str:
    if not code:
        return "bez frakce"
    g = next((x for x in groups if x["code"] == code or x.get("ep_code") == code), None)
    if g and g["code"] == "NI":
        return "nezařazení"
    return g["short_label"] if g else code


def vote_card(v: dict, meps_by_id: dict, groups: list[dict], base_url: str | None) -> bytes:
    kind, inverted = (v["vote_kind"], v.get("inverted", False)) if v.get("vote_kind") else classify(v)
    img, d = new_card()
    header(d, f"{fmt_date(v['date'])} · {KIND_LABELS.get(kind, 'hlasování')}")
    for i, line in enumerate(wrap(d, vote_title(v), font(46, 700), W - 112, 3)):
        d.text((56, 92 + i * 58), line, font=font(46, 700), fill=WHITE)
    # výsledek a celý EP
    c = v["counts"]
    y = 296
    ok = v.get("result") == "ADOPTED"
    pill = RESULT_LABEL.get(v.get("result"), "neuveden").upper()
    pw = int(text_w(d, pill, font(22, 800))) + 36
    d.rounded_rectangle([56, y, 56 + pw, y + 40], radius=20, fill=WHITE if ok else (51, 65, 85))
    d.text((56 + pw / 2, y + 20), pill, font=font(22, 800), fill=NAVY if ok else WHITE, anchor="mm")
    d.text((56 + pw + 18, y + 20), fit(d, result_sentence(kind, v.get("result")), font(24, 600), W - 112 - pw - 18),
           font=font(24, 600), fill=WHITE, anchor="lm")
    d.text((56, y + 58), f"Celý EP: {fmt_num(c['for'])} pro · {fmt_num(c['against'])} proti · {fmt_num(c['abstention'])} zdržel se",
           font=font(22, 500), fill=SOFT)
    stacked_bar(d, 56, y + 96, W - 112, 12, [c["for"], c["against"], c["abstention"], c["did_not_vote"]])
    # Češi: tečky podle frakcí, barva = hlas
    cz = active_positions(v, meps_by_id)
    cnt = Counter(p["position"] for p in cz)
    d.text((56, 428), "JAK HLASOVALI ČEŠI", font=font(18, 800), fill=GOLD)
    d.text((56 + text_w(d, "JAK HLASOVALI ČEŠI   ", font(18, 800)), 424),
           " · ".join(f"{cnt[p]} {POS_LABEL[p]}" for p in POSITIONS if cnt[p]) or "žádný poslanec v mandátu",
           font=font(24, 600), fill=WHITE)
    by_group: dict[str, list[dict]] = {}
    for p in cz:
        by_group.setdefault(p["group_code"] or "", []).append(p)
    order = sorted(by_group, key=lambda g: (-len(by_group[g]), group_label(g or None, groups)))
    x, r = 56, 15
    for g in order:
        for p in sorted(by_group[g], key=lambda p: POSITIONS.index(p["position"])):
            if p["position"] == "DID_NOT_VOTE":
                d.ellipse([x, 470, x + 2 * r, 470 + 2 * r], outline=ABSENT_C, width=3)
            else:
                d.ellipse([x, 470, x + 2 * r, 470 + 2 * r], fill=POS_COLOR[p["position"]])
            x += 2 * r + 6
        x += 16
    lines = []
    for g in order:
        gc = Counter(p["position"] for p in by_group[g])
        lines.append(f"{group_label(g or None, groups)} " + ", ".join(f"{gc[p]} {POS_LABEL[p]}" for p in POSITIONS if gc[p]))
    summary = "  ·  ".join(lines)
    for i, line in enumerate(wrap(d, summary, font(21, 500), W - 112, 2)):
        d.text((56, 516 + i * 28), line, font=font(21, 500), fill=SOFT)
    url = f"{base_url.rstrip('/').split('://', 1)[-1]}/v/{v['id']}" if base_url else None
    footer(d, "Zdroj: HowTheyVote.eu (ODbL), EP Open Data · výpočet EP Watch CZ", url)
    return to_png(img)


def mep_card(prof: dict, group_text: str, party_text: str, photo: Path | None, data_day: str,
             base_url: str | None) -> bytes:
    from PIL import Image
    mep = prof["mep"]
    img, d = new_card()
    header(d, f"data k {fmt_date(data_day)}")
    name = " ".join(x for x in (mep.get("given_name"), mep.get("family_name")) if x) or mep["name"]
    px, py, pw, ph = 56, 100, 210, 262
    if photo and photo.exists():
        im = Image.open(photo).convert("RGB")
        scale = max(pw / im.width, ph / im.height)
        im = im.resize((max(pw, round(im.width * scale)), max(ph, round(im.height * scale))), Image.LANCZOS)
        im = im.crop((max((im.width - pw) // 2, 0), 0, max((im.width - pw) // 2, 0) + pw, ph))
        mask = Image.new("L", (pw, ph), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=18, fill=255)
        img.paste(im, (px, py), mask)
        d.rounded_rectangle([px - 3, py - 3, px + pw + 2, py + ph + 2], radius=20, outline=GOLD, width=3)
        d.text((px, py + ph + 12), "© European Union – Source: EP", font=font(15, 500), fill=MUTED)
    x0 = px + pw + 48
    d.text((x0, 96), fit(d, name, font(54, 800), W - x0 - 56), font=font(54, 800), fill=WHITE)
    sub = " · ".join(x for x in (group_text, party_text) if x)
    d.text((x0, 168), fit(d, sub, font(26, 600), W - x0 - 56), font=font(26, 600), fill=SOFT)

    t, b = prof["total"], prof.get("benchmarks") or {}

    def metric(y: int, label: str, pair: list[int] | None, med: float | None, med_label: str) -> None:
        share = pair[0] / pair[1] if pair and pair[1] else None
        d.text((x0, y), label, font=font(22, 600), fill=SOFT)
        d.text((x0, y + 28), fmt_pct(share), font=font(44, 800), fill=WHITE)
        bx, bw = x0 + 250, W - x0 - 250 - 56
        lo = 0.6  # osa 60–100 %, stejně jako benchRow na webu
        pos = lambda v: bx + bw * min(max((v - lo) / (1 - lo), 0), 1)
        d.rounded_rectangle([bx, y + 52, bx + bw, y + 58], radius=3, fill=(51, 65, 85))
        if share is not None:
            d.ellipse([pos(share) - 9, y + 55 - 9, pos(share) + 9, y + 55 + 9], fill=WHITE)
        if med is not None:
            d.line([(pos(med), y + 40), (pos(med), y + 70)], fill=GOLD, width=4)
            d.text((bx, y + 76), f"{med_label} {fmt_pct(med)}", font=font(18, 600), fill=GOLD)
        if pair and pair[1]:
            d.text((bx + bw, y + 76), f"{fmt_num(pair[0])} z {fmt_num(pair[1])} hlasování", font=font(18, 500), fill=MUTED, anchor="ra")

    ep_med = (b.get("ep") or {}).get("attendance")
    grp_med = (b.get("group") or {}).get("group_loyalty")
    metric(222, "Účast na hlasování", t["attendance"], ep_med, "medián EP")
    metric(332, "Hlasuje s frakcí", t["group_loyalty"] if t["group_loyalty"][1] else None, grp_med, "medián frakce")
    roles = (prof.get("own_work") or {}).get("roles")
    if roles:
        txt = (f"Práce na textech: zprávy {roles['lead_reports']} · stínové {roles['shadow_reports']} · "
               f"stanoviska {roles['lead_opinions'] + roles['shadow_opinions']}")
        d.text((x0, 448), fit(d, txt, font(24, 600), W - x0 - 56), font=font(24, 600), fill=WHITE)
    d.text((x0, 490), "Bez pořadí a hodnocení: čísla spočítal skript z oficiálních dat.", font=font(20, 500), fill=SOFT)
    url = f"{base_url.rstrip('/').split('://', 1)[-1]}/p/{mep['id']}" if base_url else None
    footer(d, "Zdroj: HowTheyVote.eu (ODbL), EP Open Data · výpočet EP Watch CZ", url)
    return to_png(img)


def default_card(base_url: str | None, data_day: str) -> bytes:
    img, d = new_card()
    header(d, f"data k {fmt_date(data_day)}")
    d.text((56, 190), "Jak hlasují čeští", font=font(76, 800), fill=WHITE)
    d.text((56, 280), "europoslanci", font=font(76, 800), fill=GOLD)
    d.text((56, 400), "Každé jmenovité hlasování v Evropském parlamentu,", font=font(30, 500), fill=SOFT)
    d.text((56, 442), "účast na hlasování a spolupráce napříč frakcemi.", font=font(30, 500), fill=SOFT)
    footer(d, "Nezávislý projekt · data: HowTheyVote.eu, EP Open Data · čísla počítá skript, ne AI", base_url.split("://", 1)[-1] if base_url else None)
    return to_png(img)


# --- celek ----------------------------------------------------------------------------

def read(path: Path):
    if not path.exists():
        raise FormatError(f"chybí {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def build(data_dir: Path, public: Path) -> dict[str, int]:
    from overrides import apply_name_overrides
    overview = read(data_dir / "overview.json")
    require(overview, ["meps", "period"], "overview.json")
    groups = read(data_dir / "groups.json")
    parties = read(data_dir / "parties.json")
    meps_doc = read(data_dir / "meps.json")
    overrides = data_dir / "manual" / "overrides.json"
    apply_name_overrides(meps_doc["meps"], overrides)
    meps_by_id = {m["id"]: m for m in meps_doc["meps"]}
    site = data_dir / "manual" / "site.json"
    base_url = read(site).get("base_url") if site.exists() else None
    data_day = overview["period"]["to"]
    written = removed = 0

    def put(rel: str, png: bytes) -> None:
        nonlocal written
        f = public / "og" / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        if not f.exists() or f.read_bytes() != png:
            f.write_bytes(png)
            written += 1

    put("default.png", default_card(base_url, data_day))
    ov = {m["id"]: m for m in overview["meps"]}
    for mid in sorted(ov):
        prof = read(data_dir / "meps" / f"{mid}.json")
        require(prof, ["mep", "total"], f"meps/{mid}.json")
        apply_name_overrides([prof["mep"]], overrides)
        g, p = ov[mid].get("group"), ov[mid].get("party")
        party = next((x for x in parties if p and str(x["id"]) == str(p["id"])), None)
        party_text = "" if not p else ("nezávislý/á" if p["short_label"] == "Ind." or (party or {}).get("independent") else p["short_label"])
        mandate = min((x["start"] for x in prof["mep"].get("mandates") or [] if x.get("start")), default=None)
        extra = f"v mandátu od {fmt_date(mandate)}" if mandate and mandate > "2024-07-16" else ""
        sub_party = " · ".join(x for x in (party_text, extra) if x)
        photo = public / "assets" / "photos" / f"{mid}.jpg"
        put(f"p/{mid}.png", mep_card(prof, group_label(g["code"] if g else None, groups), sub_party, photo, data_day, base_url))
    _, votes = load_votes(data_dir / "votes")
    wanted = card_vote_ids(votes)
    for v in votes:
        if v["id"] in wanted:
            put(f"v/{v['id']}.png", vote_card(v, meps_by_id, groups, base_url))
    d = public / "og" / "v"
    for f in d.glob("*.png"):
        if int(f.stem) not in wanted:
            f.unlink()
            removed += 1
    return {"meps": len(ov), "votes": len(wanted), "written": written, "removed": removed}


def main(argv=None) -> int:
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data-dir", type=Path, default=root / "data")
    p.add_argument("--public", type=Path, default=root / "public")
    args = p.parse_args(argv)
    try:
        res = build(args.data_dir, args.public)
    except FormatError as e:
        print(f"CHYBA FORMÁTU: {e}", file=sys.stderr)
        return 2
    print(f"karty ke sdílení: {res}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
