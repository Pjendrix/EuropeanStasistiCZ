"""Karty ke sdílení (X12): náhledy odkazů 1200 × 630 pro poslance a závěrečná hlasování.

Výstup: public/og/p/{id}.png (poslanci), public/og/duel/{a}-{b}.png (duel dvojice, data/duel.json),
public/og/v/{id}.png (závěrečná hlasování za posledních 12 měsíců
od posledního hlasování v datech), (obecný náhled s logem je public/assets/brand/og-default.png). Stránky p/ a v/ je mají v og:image
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
import multiprocessing
import os
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from build_web import vote_title
from categories import LABEL as CAT_LABEL, categories_for
from tokens import card_rgb
from compute_stats import FormatError, active_positions, load_votes, require
from vote_parties import SHORT_LABEL, card_parties, group_label, party_rows  # noqa: F401
from vote_kinds import KIND_LABELS, classify, is_final

W, H = 1200, 630
FONT_PATH = Path(__file__).resolve().parent / "fonts" / "PlusJakartaSans-VF.ttf"
CARD_MONTHS_DAYS = 365

# Barvy karet z design/tokens.json (stejné jako SC v share.js, audit UI6).
_C = card_rgb()
NAVY, NAVY_2 = _C["navy"], _C["navy2"]
WHITE, MUTED, SOFT = _C["white"], _C["muted"], _C["soft"]
GOLD = _C["gold"]
FOR_C, AGAINST_C, ABST_C, ABSENT_C = _C["for"], _C["against"], _C["abst"], _C["absent"]
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


_symbol = None


def symbol():
    """Symbol loga (oko + oblouk hvězd) v bílé, z public/assets/brand/symbol-white.svg (vykreslený do PNG)."""
    global _symbol
    if _symbol is None:
        from PIL import Image

        im = Image.open(Path(__file__).resolve().parent / "brand" / "symbol-white.png").convert("RGBA")
        _symbol = im.resize((68, 52), Image.LANCZOS)
    return _symbol


def header(img, d, right: str) -> None:
    """Hlavička karty: symbol loga a „EP Watch CZ“ (EP a CZ tučně), vpravo datum nebo typ hlasování."""
    img.paste(symbol(), (56, 26), symbol())
    x = 56 + 68 + 14
    for s, w in (("EP", 800), (" Watch ", 400), ("CZ", 800)):
        d.text((x, 38), s, font=font(30, w), fill=WHITE)
        x += text_w(d, s, font(30, w))
    d.text((W - 56, 42), right, font=font(22, 500), fill=SOFT, anchor="ra")


def footer(d, left: str, url: str | None) -> None:
    d.line([(56, H - 66), (W - 56, H - 66)], fill=(51, 65, 85), width=1)
    d.text(
        (56, H - 50),
        fit(d, left, font(18, 500), W - 112 - (int(text_w(d, url, font(18, 600))) + 24 if url else 0)),
        font=font(18, 500),
        fill=MUTED,
    )
    if url:
        d.text((W - 56, H - 50), url, font=font(18, 600), fill=SOFT, anchor="ra")


def stacked_bar(d, x: int, y: int, w: int, h: int, counts: list[int]) -> None:
    total = sum(counts) or 1
    cx = x
    for pos, n in zip(POSITIONS, counts, strict=False):
        seg = round(w * n / total)
        if n and seg:
            d.rounded_rectangle([cx, y, cx + max(seg - 2, 1), y + h], radius=3, fill=POS_COLOR[pos])
        cx += seg


def to_png(img) -> bytes:
    """PNG s paletou (menší soubor, deterministické)."""
    from PIL import Image

    buf = io.BytesIO()
    img.quantize(colors=96, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE).save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# --- karty ----------------------------------------------------------------------------


def vote_card(v: dict, meps_by_id: dict, groups: list[dict], base_url: str | None, parties: list[dict] | None = None) -> bytes:
    """OG náhled 1200 × 630 (S5): název, výsledek větou, celý EP, souhrn Čechů a jeden řádek stran (zkrácený „…“)."""
    kind, inverted = (v["vote_kind"], v.get("inverted", False)) if v.get("vote_kind") else classify(v)
    img, d = new_card()
    header(img, d, f"{fmt_date(v['date'])} · {KIND_LABELS.get(kind, 'hlasování')}")
    # Téma (stejná funkce jako čip v seznamu hlasování): jeden čip nad názvem, další jen jako „+N“; bez tématu se řádek vynechá.
    cats = categories_for(v)
    top = 100
    if cats:
        label = CAT_LABEL[cats[0]] + (f"  +{len(cats) - 1}" if len(cats) > 1 else "")
        label = fit(d, label, font(20, 700), W - 112 - 32)
        tw = int(text_w(d, label, font(20, 700)))
        d.rounded_rectangle([56, 88, 56 + tw + 32, 120], radius=16, fill=(30, 41, 59), outline=(71, 85, 105), width=2)
        d.text((56 + 16, 104), label, font=font(20, 700), fill=WHITE, anchor="lm")
        top = 140
    title = wrap(d, vote_title(v), font(50, 700), W - 112, 2)
    for i, line in enumerate(title):
        d.text((56, top + i * 62), line, font=font(50, 700), fill=WHITE)
    y = top + len(title) * 62
    sub = " · ".join(x for x in (v.get("description_cs") or v.get("description"), v.get("reference")) if x)
    if sub and y + 32 <= 296:  # podtitul jen když se vejde nad výsledek (s tématem a dvouřádkovým názvem se vynechá)
        d.text((56, y + 4), fit(d, sub, font(24, 500), W - 112), font=font(24, 500), fill=SOFT)
    c = v["counts"]
    y = 300
    ok = v.get("result") == "ADOPTED"
    pill = RESULT_LABEL.get(v.get("result"), "neuveden").upper()
    icon = 28 if v.get("result") in ("ADOPTED", "REJECTED") else 0
    pw = int(text_w(d, pill, font(22, 800))) + 36 + icon
    fg = NAVY if ok else WHITE
    d.rounded_rectangle([56, y, 56 + pw, y + 44], radius=22, fill=WHITE if ok else (51, 65, 85))
    if icon:  # ✓ / ✕ čarami (písmo ikonu nemusí mít)
        cx, cy = 56 + 28, y + 22
        if ok:
            d.line([(cx - 7, cy), (cx - 2, cy + 6), (cx + 8, cy - 6)], fill=fg, width=3)
        else:
            d.line([(cx - 6, cy - 6), (cx + 6, cy + 6)], fill=fg, width=3)
            d.line([(cx + 6, cy - 6), (cx - 6, cy + 6)], fill=fg, width=3)
    d.text((56 + icon + (pw - icon) / 2 + 2, y + 22), pill, font=font(22, 800), fill=fg, anchor="mm")
    sentence = result_sentence(kind, v.get("result"))
    d.text((56 + pw + 20, y + 22), fit(d, sentence, font(24, 600), W - 112 - pw - 20), font=font(24, 600), fill=WHITE, anchor="lm")
    d.text(
        (56, y + 66),
        f"Celý EP: {fmt_num(c['for'])} pro · {fmt_num(c['against'])} proti · {fmt_num(c['abstention'])} zdrželo se"
        f" · {fmt_num(c['did_not_vote'])} nehlasovalo",
        font=font(22, 500),
        fill=SOFT,
    )
    stacked_bar(d, 56, y + 100, W - 112, 12, [c["for"], c["against"], c["abstention"], c["did_not_vote"]])
    cz = active_positions(v, meps_by_id)
    cnt = Counter(p["position"] for p in cz)
    d.text(
        (56, 456),
        "Češi: " + (" · ".join(f"{cnt[p]} {POS_LABEL[p]}" for p in POSITIONS if cnt[p]) or "žádný poslanec v mandátu"),
        font=font(26, 700),
        fill=WHITE,
    )
    rows = card_parties(party_rows(cz, meps_by_id, parties or [], groups))
    line = "  ·  ".join(
        f"{r['label']}: " + ", ".join(f"{r['positions'].count(k)} {SHORT_LABEL[k]}" for k in POSITIONS if k in r["positions"]) for r in rows
    )
    d.text((56, 504), fit(d, line, font(21, 500), W - 112), font=font(21, 500), fill=SOFT)
    url = f"{base_url.rstrip('/').split('://', 1)[-1]}/v/{v['id']}" if base_url else None
    # Bez data exportu: výsledek hlasování se po zveřejnění nemění, karta se tak při novém exportu nepřepisuje.
    footer(d, f"Zdroj: HowTheyVote.eu (ODbL) · strana k datu hlasování · hlasování {fmt_date(v['date'])}", url)
    return to_png(img)


def text_card(right: str, kicker: str, title: str, lines: list[str], foot: str, url: str | None) -> bytes:
    """Jednoduchá textová karta (strana, příběh zákona, obecné hlasování, V12): nadpis a pár řádků čísel."""
    img, d = new_card()
    header(img, d, right)
    d.text((56, 104), fit(d, kicker, font(22, 700), W - 112), font=font(22, 700), fill=SOFT)
    rows = wrap(d, title, font(50, 700), W - 112, 3)
    for i, line in enumerate(rows):
        d.text((56, 142 + i * 62), line, font=font(50, 700), fill=WHITE)
    y = 142 + len(rows) * 62 + 24
    for line in lines:
        if y > H - 120:
            break
        d.text((56, y), fit(d, line, font(28, 600), W - 112), font=font(28, 600), fill=WHITE)
        y += 46
    footer(d, foot, url)
    return to_png(img)


def party_card(pp: dict, data_day: str, base_url: str | None) -> bytes:
    """OG náhled strany (s/{id}): počet poslanců, soudržnost a rozdělená závěrečná hlasování (čísla z data/parties)."""
    n = pp["members"] if isinstance(pp["members"], int) else len(pp["members"])
    coh = pp.get("cohesion") or [0, 0]
    coh_m = pp.get("cohesion_main") or [0, 0]
    lines = [f"{fmt_num(n)} {'poslanec' if n == 1 else 'poslanci' if 2 <= n <= 4 else 'poslanců'} v EP"]
    if coh[1]:
        lines.append(
            f"Jednotnost: {fmt_pct(coh[0] / coh[1])} hlasování" + (f" · závěrečná {fmt_pct(coh_m[0] / coh_m[1])}" if coh_m[1] else "")
        )
    if coh_m[1] and pp.get("splits_count_main") is not None:
        lines.append(f"Poslanci strany hlasovali pro i proti: {fmt_num(pp['splits_count_main'])} závěrečných hlasování")
    url = f"{base_url.rstrip('/').split('://', 1)[-1]}/s/{pp['id']}" if base_url else None
    return text_card(
        f"data k {fmt_date(data_day)}",
        "Česká strana v Evropském parlamentu",
        f"{pp['short_label']} · {pp.get('name') or ''}".strip(" ·"),
        lines,
        "Zdroj: HowTheyVote.eu (ODbL), EP Open Data (CC BY 4.0) · strana k datu hlasování",
        url,
    )


def law_card(row: dict, v: dict, meps_by_id: dict, base_url: str | None, slug_: str) -> bytes:
    """OG náhled příběhu zákona (z/{slug}): název, číslo procedury, poslední závěrečné hlasování a hlasy Čechů."""
    cnt = Counter(p["position"] for p in active_positions(v, meps_by_id))
    c = v["counts"]
    lines = [
        f"{fmt_date(v['date'])}: {RESULT_LABEL.get(v.get('result'), 'výsledek neuveden')} · {fmt_num(c['for'])} pro, {fmt_num(c['against'])} proti",
        "Češi: " + (" · ".join(f"{cnt[p]} {POS_LABEL[p]}" for p in POSITIONS if cnt[p]) or "žádný poslanec v mandátu"),
    ]
    url = f"{base_url.rstrip('/').split('://', 1)[-1]}/z/{slug_}" if base_url else None
    return text_card(
        row["label"],
        "Příběh zákona",
        row.get("title_cs") or row.get("title_en") or row["label"],
        lines,
        f"Zdroj: EP Open Data (CC BY 4.0), HowTheyVote.eu (ODbL) · hlasování {fmt_date(v['date'])}",
        url,
    )


GENERIC_VOTE = "hlasovani.png"  # og/hlasovani.png: obecná karta pro starší hlasování bez vlastní karty (V12)


def generic_vote_card(base_url: str | None) -> bytes:
    return text_card(
        "jmenovité hlasování",
        "Evropský parlament",
        "Jak hlasovali čeští europoslanci",
        ["Výsledek celého EP a hlas každého českého poslance", "k datu hlasování, s odkazem na zdroj."],
        "Zdroj: HowTheyVote.eu (ODbL)",
        base_url.rstrip("/").split("://", 1)[-1] if base_url else None,
    )


def law_cards_wanted(rows: dict, wanted: set[int]) -> dict[str, dict]:
    """{číslo procedury: poslední závěrečné hlasování} pro procedury, jejichž závěrečné hlasování má kartu (12 měsíců)."""
    out = {}
    for label, row in rows.items():
        finals = [v for v in row["votes"] if is_final(v) and v["id"] in wanted]
        if finals:
            out[label] = finals[-1]
    return out


def hex_rgb(c: str | None) -> tuple[int, int, int]:
    if c and len(c) == 7 and c.startswith("#"):
        return tuple(int(c[i : i + 2], 16) for i in (1, 3, 5))
    return MUTED


def mep_card(
    prof: dict, chips: list[tuple[str, str | None]], mandate_text: str, photo: Path | None, data_day: str, base_url: str | None
) -> bytes:
    """OG náhled 1200 × 630 = základní karta poslance na šířku: portrét vlevo, jméno, frakce · strana jako tečka a zkratka
    (bez log), dvě čísla s mediánem. Práce na textech je na detailu (3. obrázek carouselu na webu)."""
    from PIL import Image

    mep = prof["mep"]
    img, d = new_card()
    header(img, d, f"data k {fmt_date(data_day)}")
    # akcent = barva frakce (identita, jako vizitka na webu a karta v share.js); bez barvy zlatá
    acc_hex = chips[0][1] if chips and chips[0][1] and str(chips[0][1]).startswith("#") and len(chips[0][1]) == 7 else None
    accent = hex_rgb(acc_hex) if acc_hex else GOLD
    d.rectangle([8, 84, W, 87], fill=accent)
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
        d.rounded_rectangle([px - 4, py - 4, px + pw + 3, py + ph + 3], radius=21, outline=accent, width=4)
        d.text((px, py + ph + 12), "© European Union – Source: EP", font=font(15, 500), fill=MUTED)
    x0 = px + pw + 48
    d.text((x0, 96), fit(d, name, font(54, 800), W - x0 - 56), font=font(54, 800), fill=WHITE)
    cx = x0
    for label, color in chips:
        w = int(text_w(d, label, font(24, 600))) + 52
        d.rounded_rectangle([cx, 166, cx + w, 210], radius=22, fill=(30, 41, 59))
        d.ellipse([cx + 16, 180, cx + 30, 194], fill=hex_rgb(color))
        d.text((cx + 40, 188), label, font=font(24, 600), fill=WHITE, anchor="lm")
        cx += w + 10
    if mandate_text:
        d.text((x0, 226), fit(d, mandate_text, font(22, 500), W - x0 - 56), font=font(22, 500), fill=SOFT)

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
    metric(280, "Účast na hlasování", t["attendance"], ep_med, "medián EP")
    metric(390, "Hlasuje s frakcí", t["group_loyalty"] if t["group_loyalty"][1] else None, grp_med, "medián frakce")
    d.text((x0, 508), "Bez pořadí a hodnocení: čísla spočítal skript z oficiálních dat.", font=font(20, 500), fill=SOFT)
    url = f"{base_url.rstrip('/').split('://', 1)[-1]}/p/{mep['id']}" if base_url else None
    footer(d, "Zdroj: HowTheyVote.eu (ODbL), EP Open Data · výpočet EP Watch CZ", url)
    return to_png(img)


def duel_card(a: dict, b: dict, chips: dict, agreement: list[int], photos: dict, data_day: str, base_url: str | None) -> bytes:
    """OG náhled duelu 1200 × 630: dva portréty proti sobě, jména, frakce · strana (tečka a zkratka, bez log), % shody
    z data/duel.json. Žádné skóre a žádný vítěz: obě strany stejně velké, stejná barva textu."""
    from PIL import Image, ImageDraw

    img, d = new_card()
    header(img, d, f"data k {fmt_date(data_day)}")
    pw, ph, top = 180, 225, 92
    for m, cx in ((a, 300), (b, 900)):
        photo = photos.get(m["id"])
        if photo and photo.exists():
            im = Image.open(photo).convert("RGB")
            scale = max(pw / im.width, ph / im.height)
            im = im.resize((max(pw, round(im.width * scale)), max(ph, round(im.height * scale))), Image.LANCZOS)
            im = im.crop((max((im.width - pw) // 2, 0), 0, max((im.width - pw) // 2, 0) + pw, ph))
            mask = Image.new("L", (pw, ph), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=18, fill=255)
            img.paste(im, (cx - pw // 2, top), mask)
            d.rounded_rectangle([cx - pw // 2 - 3, top - 3, cx + pw // 2 + 2, top + ph + 2], radius=20, outline=GOLD, width=3)
        name = " ".join(x for x in (m.get("given_name"), m.get("family_name")) if x) or m["name"]
        d.text((cx, top + ph + 30), fit(d, name, font(36, 800), 470), font=font(36, 800), fill=WHITE, anchor="mm")
        line = " · ".join(lbl for lbl, _ in chips.get(m["id"], []))
        d.text((cx, top + ph + 70), fit(d, line, font(22, 600), 470), font=font(22, 600), fill=SOFT, anchor="mm")
    d.text((600, top + ph // 2), "vs", font=font(44, 800), fill=MUTED, anchor="mm")
    same, total = agreement
    if total:
        d.text((600, 470), f"Hlasovali stejně v {fmt_pct(same / total)} hlasování", font=font(34, 800), fill=WHITE, anchor="mm")
        d.text(
            (600, 512),
            f"{fmt_num(same)} z {fmt_num(total)} společných hlasování · čísla, ne hodnocení",
            font=font(20, 500),
            fill=SOFT,
            anchor="mm",
        )
    else:
        d.text((600, 480), "Neměli společné hlasování", font=font(30, 700), fill=WHITE, anchor="mm")
    d.text((600, 545), "Portréty © European Union – Source: EP", font=font(15, 500), fill=MUTED, anchor="mm")
    lo, hi = sorted((a["id"], b["id"]))
    url = f"{base_url.rstrip('/').split('://', 1)[-1]}/d/{lo}-{hi}" if base_url else None
    footer(d, "Zdroj: HowTheyVote.eu (ODbL), EP Open Data · výpočet EP Watch CZ", url)
    return to_png(img)


# --- celek ----------------------------------------------------------------------------


def read(path: Path):
    if not path.exists():
        raise FormatError(f"chybí {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _render(job: tuple[str, object, tuple]) -> tuple[str, bytes]:
    rel, fn, args = job
    return rel, fn(*args)


def _render_all(jobs: list[tuple[str, object, tuple]], out: Path) -> int:
    """Vykreslí karty a zapíše jen změněné. Kreslení je nejpomalejší část sestavení webu (~86 s z 92 s, revize 3. 11. 2026),
    proto běží ve více procesech (Vercel má 4 jádra); CARDS_WORKERS=1 = postupně (ladění)."""
    workers = int(os.environ.get("CARDS_WORKERS") or os.cpu_count() or 1)
    if workers > 1 and len(jobs) > 1 and "fork" in multiprocessing.get_all_start_methods():
        with ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context("fork")) as pool:
            results = list(pool.map(_render, jobs, chunksize=8))
    else:
        results = [_render(j) for j in jobs]
    written = 0
    for rel, png in results:
        f = out / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        if not f.exists() or f.read_bytes() != png:
            f.write_bytes(png)
            written += 1
    return written


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
    release = (overview.get("sources") or {}).get("votes", {}).get("release") or ""
    data_day = release if len(release) == 10 and release[4] == "-" else overview["period"]["to"]  # export HowTheyVote = „data k“
    removed = 0
    # Karty se nejdřív posbírají (soubor, funkce, argumenty) a kreslí se až na konci paralelně (_render_all).
    jobs: list[tuple[str, object, tuple]] = []

    def put(rel: str, fn, *args) -> None:
        jobs.append((rel, fn, args))

    ov = {m["id"]: m for m in overview["meps"]}
    for mid in sorted(ov):
        prof = read(data_dir / "meps" / f"{mid}.json")
        require(prof, ["mep", "total"], f"meps/{mid}.json")
        apply_name_overrides([prof["mep"]], overrides)
        g, p = ov[mid].get("group"), ov[mid].get("party")
        party = next((x for x in parties if p and str(x["id"]) == str(p["id"])), None)
        party_text = (
            "" if not p else ("nezávislý/á" if p["short_label"] == "Ind." or (party or {}).get("independent") else p["short_label"])
        )
        mandate = min((x["start"] for x in prof["mep"].get("mandates") or [] if x.get("start")), default=None)
        g_obj = next((x for x in groups if g and (x["code"] == g["code"] or x.get("ep_code") == g["code"])), None)
        chips = [(group_label(g["code"] if g else None, groups), (g_obj or {}).get("chart_color"))] if g else []
        if party_text:
            chips.append((party_text, (party or {}).get("chart_color")))
        photo = public / "assets" / "photos" / f"{mid}.jpg"
        put(f"p/{mid}.png", mep_card, prof, chips, f"v mandátu od {fmt_date(mandate)}" if mandate else "", photo, data_day, base_url)
    duel_path = data_dir / "duel.json"
    if duel_path.exists():
        duel = read(duel_path)
        require(duel, ["meps", "pairs"], "duel.json")
        dm = {m["id"]: m for m in duel["meps"]}
        chips = {}
        for m in duel["meps"]:
            g, p = m.get("group"), m.get("party")
            party = next((x for x in parties if p and str(x["id"]) == str(p["id"])), None)
            party_text = (
                "" if not p else ("nezávislý/á" if p["short_label"] == "Ind." or (party or {}).get("independent") else p["short_label"])
            )
            chips[m["id"]] = [(group_label(g["code"], groups), None)] if g else []
            if party_text:
                chips[m["id"]].append((party_text, None))
        photos = {mid: public / "assets" / "photos" / f"{mid}.jpg" for mid in dm}
        for key, pair in sorted(duel["pairs"].items()):
            lo, hi = (int(x) for x in key.split("-"))
            put(f"duel/{key}.png", duel_card, dm[lo], dm[hi], chips, pair["agreement"], photos, data_day, base_url)
    _, votes = load_votes(data_dir / "votes")
    wanted = card_vote_ids(votes)
    for v in votes:
        if v["id"] in wanted:
            put(f"v/{v['id']}.png", vote_card, v, meps_by_id, groups, base_url, parties)
    d = public / "og" / "v"
    for f in d.glob("*.png"):
        if int(f.stem) not in wanted:
            f.unlink()
            removed += 1
    put(GENERIC_VOTE, generic_vote_card, base_url)
    idx = data_dir / "parties" / "index.json"
    for p in read(idx)["parties"] if idx.exists() else []:
        put(f"s/{p['id']}.png", party_card, read(data_dir / "parties" / f"{p['id']}.json"), data_day, base_url)
    from procedure_pages import collect, slug  # až tady: procedure_pages importuje build_pages

    rows = collect(data_dir, votes)
    laws = law_cards_wanted(rows, wanted)
    for label, v in sorted(laws.items()):
        put(f"z/{slug(label)}.png", law_card, rows[label], v, meps_by_id, base_url, slug(label))
    keep = {f"{slug(lb)}.png" for lb in laws}
    for f in (public / "og" / "z").glob("*.png") if (public / "og" / "z").exists() else []:
        if f.name not in keep:
            f.unlink()
            removed += 1
    written = _render_all(jobs, public / "og")
    return {
        "meps": len(ov),
        "votes": len(wanted),
        "duel": len(duel["pairs"]) if duel_path.exists() else 0,
        "written": written,
        "removed": removed,
    }


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
