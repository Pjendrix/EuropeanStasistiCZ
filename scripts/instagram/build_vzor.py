#!/usr/bin/env python3
"""Vzorové Instagram šablony EP Watch CZ. Čísla jen z data/*.json, nic se nedopočítává ručně.
Použití: python3 build.py <cesta k EuropeanStasistiCZ-main> <výstupní složka>"""
import json, sys, html, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(sys.argv[1]).resolve()
OUT = pathlib.Path(sys.argv[2]).resolve(); OUT.mkdir(parents=True, exist_ok=True)
PUB = ROOT / "public"
J = lambda p: json.load(open(ROOT / p, encoding="utf-8"))
URL = "epwatch.cz"
NB = " "

meps = {m["id"]: m for m in J("data/meps.json")["meps"]}
parties = {p["id"]: p for p in J("data/parties.json")}
stats = J("data/stats.json"); bench = J("data/benchmarks.json")
votes = J("data/votes/2026-10.json")["votes"]
VOTE_ID = 197509
v = next(x for x in votes if x["id"] == VOTE_ID)
cz = v["cz_positions"]
DATA_DATE = "10. 10. 2026"   # release HowTheyVote z stats.sources

def pct(x, d=1): return f"{x*100:.{d}f}".replace(".", ",") + NB + "%"
def num(n): return f"{n:,}".replace(",", NB)
def d_cs(s): y, m, d = s.split("-"); return f"{int(d)}. {int(m)}. {y}"
def esc(s): return html.escape(str(s))

FONT = f"file://{PUB}/assets/fonts/plus-jakarta-sans-latin.woff2"
FONTX = f"file://{PUB}/assets/fonts/plus-jakarta-sans-latin-ext.woff2"
BR = f"file://{PUB}/assets/brand"

CSS = f"""
@font-face{{font-family:J;src:url({FONTX}) format('woff2');font-weight:200 800;unicode-range:U+0100-02AF,U+1E00-1EFF,U+2020,U+20A0-20AB,U+20AD-20CF,U+2113,U+2C60-2C7F,U+A720-A7FF}}
@font-face{{font-family:J;src:url({FONT}) format('woff2');font-weight:200 800;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{width:1080px;height:1350px;font-family:J,sans-serif;overflow:hidden}}
.s{{position:relative;width:1080px;height:1350px;padding:64px 72px;display:flex;flex-direction:column}}
.light{{--bg:#F8FAFC;--text:#0F172A;--muted:#64748B;--card:#fff;--line:rgba(15,23,42,.1);--track:#E2E8F0;--for:#2BA862;--against:#9F1D2B;--abst:#64748B;--dnv:#94A3B8;--acc:#2563EB;background:var(--bg);color:var(--text)}}
.dark{{--bg:#0F172A;--text:#F8FAFC;--muted:#94A3B8;--card:rgba(30,41,59,.7);--line:rgba(148,163,184,.2);--track:rgba(148,163,184,.2);--for:#34C77B;--against:#F0506E;--abst:#94A3B8;--dnv:#CBD5E1;--acc:#93C5FD;color:var(--text);
 background:radial-gradient(900px 700px at 100% 0%,rgba(30,58,138,.75),transparent 70%),radial-gradient(700px 500px at 0% 100%,rgba(30,58,138,.35),transparent 70%),#0F172A}}
.top{{display:flex;align-items:center;justify-content:space-between;height:56px;flex:none}}
.brand{{display:flex;align-items:center;gap:16px;font-weight:700;font-size:30px;letter-spacing:-.01em}}
.brand img{{height:44px}}
.cnt{{font-size:26px;color:var(--muted);font-weight:600}}
.foot{{margin-top:auto;flex:none;padding-top:22px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:24px;font-size:23px;color:var(--muted);line-height:1.35}}
.foot b{{color:var(--text);font-weight:600}}
.chip{{display:inline-flex;align-items:center;gap:12px;padding:10px 22px;border-radius:99px;font-size:26px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}}
.chip.gold{{background:#F59E0B;color:#0F172A}}
.chip.line{{border:2px solid var(--line);color:var(--muted);text-transform:none;letter-spacing:0;font-weight:600}}
.chip.ok{{background:var(--for);color:#0B1220}}
.chip.no{{background:var(--against);color:#fff}}
.dot{{display:inline-block;border-radius:50%;flex:none}}
.for{{background:var(--for)}}.against{{background:var(--against)}}.abst{{background:var(--abst)}}
.dnv{{background:transparent;border:5px solid var(--dnv)}}
h1{{font-weight:800;letter-spacing:-.025em;line-height:1.04}}
.muted{{color:var(--muted)}}
.legend{{display:flex;flex-wrap:wrap;gap:12px 30px;font-size:30px;font-weight:600}}
.legend span{{display:inline-flex;align-items:center;gap:12px}}
.legend .dot{{width:28px;height:28px}}.legend .dnv{{border-width:4px}}
.bar{{display:flex;height:52px;border-radius:14px;overflow:hidden;background:var(--track);gap:3px}}
.bar i{{display:block;height:100%}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:28px;padding:34px 38px}}
"""

def page(body): return f"<!doctype html><meta charset=utf-8><style>{CSS}</style><body>{body}</body>"

def top(theme, idx=None, tot=None):
    logo = "symbol-white.svg" if theme == "dark" else "symbol-black.svg"
    c = f'<div class="cnt">{idx}/{tot}</div>' if idx else ""
    return f'<div class="top"><div class="brand"><img src="{BR}/{logo}">EP Watch CZ</div>{c}</div>'

def foot(left, right=""):
    return f'<div class="foot"><div>{left}</div><div style="text-align:right">{right}</div></div>'

SRC = f"Zdroj: HowTheyVote.eu · data k {DATA_DATE}"
POS = ["FOR", "AGAINST", "ABSTENTION", "DID_NOT_VOTE"]
CLS = {"FOR": "for", "AGAINST": "against", "ABSTENTION": "abst", "DID_NOT_VOTE": "dnv"}
WORD = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdrželo se", "DID_NOT_VOTE": "nehlasovalo"}
SHORT = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdrž.", "DID_NOT_VOTE": "nehl."}

def dots(positions, size, gap, per_row=None):
    ds = "".join(f'<span class="dot {CLS[p]}" style="width:{size}px;height:{size}px"></span>' for p in positions)
    st = f"display:flex;flex-wrap:wrap;gap:{gap}px"
    if per_row: st += f";width:{per_row*(size+gap)-gap}px"
    return f'<div style="{st}">{ds}</div>'

def legend(counts):
    return '<div class="legend">' + "".join(
        f'<span><i class="dot {CLS[p]}"></i>{counts[p]} {WORD[p] if p!="FOR" else "pro"}</span>' for p in POS if counts[p]) + "</div>"

czc = {p: sum(1 for c in cz if c["position"] == p) for p in POS}
ordered = [c["position"] for c in sorted(cz, key=lambda c: POS.index(c["position"]))]
CZ_TITLE = "Konzulární ochrana občanů Unie bez zastoupení ve třetích zemích"  # překlad (v produkci Claude Haiku z title, bez čísel)
shots = {}

def add(name, html_): shots[name] = page(html_)

# ---------- A. Hlasování týdne (5 slidů) ----------
vurl = f"{URL}/v/{VOTE_ID}.html"
vfoot = lambda: foot(f"{SRC}<br><b>{vurl}</b>", "Bez hodnocení.<br>Strana k datu hlasování.")
N = 5
add("A1-hlasovani-cover", f"""<div class="s dark">{top('dark',1,N)}
<div style="margin-top:56px;display:flex;gap:14px;flex-wrap:wrap"><span class="chip gold">Hlasování týdne</span><span class="chip line">{d_cs(v['date'])} · závěrečné hlasování</span></div>
<h1 style="font-size:92px;margin-top:44px">{esc(CZ_TITLE)}</h1>
<p class="muted" style="font-size:30px;margin-top:26px;line-height:1.35">{esc(v['title'])} · {esc(v['reference'])}</p>
<div style="margin-top:44px"><span class="chip ok">Přijato</span></div>
<div style="margin-top:auto;padding-bottom:30px">
<p style="font-size:34px;font-weight:700;margin-bottom:26px">Jak hlasovali čeští poslanci</p>
{dots(ordered,64,12,11)}
<div style="margin-top:30px">{legend(czc)}</div></div>
{foot(SRC, "Přejeď →")}</div>""")

def stripe(counts, total):
    col = {"FOR": "var(--for)", "AGAINST": "var(--against)", "ABSTENTION": "var(--abst)", "DID_NOT_VOTE": "var(--dnv)"}
    return '<div class="bar">' + "".join(f'<i style="width:{counts[p]/total*100:.2f}%;background:{col[p]}"></i>' for p in POS if counts[p]) + "</div>"

epc = {"FOR": v["counts"]["for"], "AGAINST": v["counts"]["against"], "ABSTENTION": v["counts"]["abstention"], "DID_NOT_VOTE": v["counts"]["did_not_vote"]}
ept = sum(epc.values())
def panel(title, counts, total, sub):
    rows = "".join(f'<div style="display:flex;align-items:baseline;gap:14px"><i class="dot {CLS[p]}" style="width:26px;height:26px"></i><span style="font-size:60px;font-weight:300;letter-spacing:-.02em">{num(counts[p])}</span><span style="font-size:30px;font-weight:600" class="muted">{WORD[p]}</span></div>' for p in POS)
    return f'<div class="card" style="margin-top:28px"><p style="font-size:38px;font-weight:700">{title}</p><p class="muted" style="font-size:26px;margin:4px 0 22px">{sub}</p>{stripe(counts,total)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 30px;margin-top:26px">{rows}</div></div>'
add("A2-ep-vs-cesi", f"""<div class="s light">{top('light',2,N)}
<h1 style="font-size:64px;margin-top:44px">Návrh prošel: {v['counts']['for']} pro, {v['counts']['against']} proti</h1>
<p class="muted" style="font-size:30px;margin-top:14px">Závěrečné hlasování, {d_cs(v['date'])}. Přijato.</p>
{panel('Celý Evropský parlament', epc, ept, f'{ept} poslanců')}
{panel('Čeští poslanci', czc, len(cz), f'{len(cz)} poslanců')}
{vfoot()}</div>""")

# podle stran
by = {}
for c in cz: by.setdefault(c["national_party_id"], []).append(c)
rows = []
for pid, lst in sorted(by.items(), key=lambda kv: (-len(kv[1]), parties[kv[0]]["short_label"])):
    pp = parties[pid]; grp = sorted({x["group_code"] for x in lst})
    GL = {"PFE": "PfE", "EPP": "EPP", "ECR": "ECR", "NI": "NI", "ESN": "ESN", "GREEN_EFA": "Zelení/EFA", "RENEW": "Renew", "SD": "S&D", "GUE_NGL": "Levice"}
    pos = [x["position"] for x in sorted(lst, key=lambda x: POS.index(x["position"]))]
    if len(set(pos)) == 1: txt = {"FOR": "pro", "AGAINST": "proti", "ABSTENTION": "zdrž.", "DID_NOT_VOTE": "nehl."}[pos[0]]; txt = ("všichni " if len(pos) > 1 else "") + txt
    else: txt = " · ".join(f"{pos.count(p)}× {SHORT[p]}" for p in POS if pos.count(p))
    rows.append(f'''<div style="display:flex;align-items:center;height:86px;border-bottom:1px solid var(--line)">
<div style="width:300px;display:flex;align-items:center;gap:16px"><i style="width:14px;height:50px;border-radius:5px;background:{pp['chart_color']}"></i><div><div style="font-size:34px;font-weight:700;line-height:1.05">{esc(pp['short_label'])}</div><div class="muted" style="font-size:22px">{' · '.join(GL.get(g,g) for g in grp)}</div></div></div>
<div style="width:318px">{dots(pos,34,8)}</div><div style="font-size:25px;font-weight:600;color:var(--muted);line-height:1.15">{txt}</div></div>''')
add("A3-podle-stran", f"""<div class="s light">{top('light',3,N)}
<h1 style="font-size:64px;margin-top:34px">Jak hlasovali Češi podle stran</h1>
<div style="margin:22px 0 14px">{legend(czc)}</div>
<div style="border-top:1px solid var(--line)">{''.join(rows)}</div>
{vfoot()}</div>""")

# jmenovitě
def nm(mid): m = meps[mid]; return f"{m['given_name']} {m['family_name']}"
blocks = ""
for p in POS:
    names = " · ".join(nm(c["member_id"]) for c in sorted(cz, key=lambda c: meps[c["member_id"]]["sort_label"]) if c["position"] == p)
    blocks += f'<div style="margin-top:34px"><div style="display:flex;align-items:center;gap:14px;font-size:42px;font-weight:800"><i class="dot {CLS[p]}" style="width:30px;height:30px"></i>{WORD[p] if p!="FOR" else "pro"} <span class="muted" style="font-weight:600">({czc[p]})</span></div><p style="font-size:38px;line-height:1.45;margin-top:10px">{esc(names)}</p></div>'
add("A4-jmenovite", f"""<div class="s light">{top('light',4,N)}
<h1 style="font-size:64px;margin-top:34px">Kdo jak hlasoval</h1>{blocks}
{vfoot()}</div>""")

add("A5-cta", f"""<div class="s dark">{top('dark',5,N)}
<div style="margin:auto 0">
<h1 style="font-size:84px">Chceš vidět, jak hlasoval konkrétní poslanec?</h1>
<p class="muted" style="font-size:38px;line-height:1.4;margin-top:34px">Každé číslo má na webu odkaz na zdroj. Najdeš tam i metodiku, profily poslanců a další hlasování.</p>
<div style="margin-top:50px;display:inline-block;padding:22px 36px;border-radius:22px;background:#F8FAFC;color:#0F172A;font-size:36px;font-weight:800">{vurl}</div>
<p style="font-size:34px;font-weight:700;margin-top:56px">Ulož si to · Pošli dál · Odkaz najdeš v bio</p></div>
{foot('Nezávislý projekt. Oficiální data, bez hodnocení a pořadí.', '')}</div>""")

# ---------- B. Úvod (5 slidů) ----------
NI_ = 5
add("B1-uvod-cover", f"""<div class="s dark" style="align-items:flex-start">
<div class="top"><div></div></div>
<div style="margin:auto 0;width:100%">
<img src="{BR}/logo-horizontal-white.svg" style="height:92px;margin-bottom:60px">
<h1 style="font-size:118px">Jak hlasují čeští europoslanci.</h1>
<p style="font-size:44px;line-height:1.35;margin-top:44px;color:#CBD5E1">Oficiální data. Bez hodnocení. Bez pořadí.</p></div>
<div style="width:100%">{dots(ordered,44,10)}<div class="foot" style="margin-top:28px"><div>Nezávislý projekt o práci českých poslanců v Evropském parlamentu</div><div>Přejeď →</div></div></div></div>""")

add("B2-tecka", f"""<div class="s light">{top('light',2,NI_)}
<h1 style="font-size:84px;margin-top:70px">Jedna tečka = jeden poslanec.</h1>
<p class="muted" style="font-size:38px;margin-top:26px;line-height:1.35">Barva ukazuje, jak hlasoval. Ne jestli to bylo dobře nebo špatně.</p>
<div style="margin-top:56px;display:grid;gap:26px">""" + "".join(
 f'<div class="card" style="display:flex;align-items:center;gap:30px;padding:28px 36px"><i class="dot {CLS[p]}" style="width:70px;height:70px"></i><div><div style="font-size:46px;font-weight:800">{t}</div><div class="muted" style="font-size:28px">{s}</div></div></div>'
 for p, t, s in [("FOR","Pro","hlasoval pro návrh"),("AGAINST","Proti","hlasoval proti návrhu"),("ABSTENTION","Zdržel se","nehlasoval ani pro, ani proti"),("DID_NOT_VOTE","Nehlasoval","při hlasování nebyl zaznamenán")]) +
f"""</div>{foot(SRC, '')}</div>""")

nvotes = stats["votes_total"]; ncur = len(cz)
add("B3-cisla", f"""<div class="s dark">{top('dark',3,NI_)}
<h1 style="font-size:76px;margin-top:70px">Co sledujeme</h1>
<div style="margin-top:56px;display:grid;gap:34px">
<div><div style="font-size:150px;font-weight:300;letter-spacing:-.03em;line-height:1">{num(nvotes)}</div><div style="font-size:38px;font-weight:600;color:#CBD5E1">hlasování od 17. 7. 2024</div></div>
<div><div style="font-size:150px;font-weight:300;letter-spacing:-.03em;line-height:1">{ncur}</div><div style="font-size:38px;font-weight:600;color:#CBD5E1">českých poslanců v 10. volebním období</div></div>
<div><div style="font-size:150px;font-weight:300;letter-spacing:-.03em;line-height:1">{len(by)}</div><div style="font-size:38px;font-weight:600;color:#CBD5E1">stran a nezávislých, za které sedí</div></div></div>
{foot(SRC, '')}</div>""")

add("B4-nehodnotime", f"""<div class="s light">{top('light',4,NI_)}
<h1 style="font-size:84px;margin-top:70px">Co tu nenajdeš</h1>
<div style="margin-top:50px;display:grid;gap:26px">""" + "".join(
 f'<div class="card"><div style="font-size:50px;font-weight:800">{t}</div><div class="muted" style="font-size:30px;margin-top:6px;line-height:1.35">{s}</div></div>'
 for t, s in [("Žádné pořadí poslanců","Čísla ukazujeme, ale nikoho neřadíme od nejlepšího po nejhoršího."),("Žádné známky ani skóre","Pracovitost nejde vměstnat do jednoho čísla. Ukazujeme role a počty."),("Žádná čísla od AI","Statistiky počítá ověřený kód. AI smí jen shrnout a přeložit text."),("Žádné vymyšlené údaje","Co zdroj nemá, tam je prázdno.")]) +
f"""</div>{foot('Pravidla najdeš na webu v části „O projektu“.', '')}</div>""")

add("B5-zdroje", f"""<div class="s dark">{top('dark',5,NI_)}
<h1 style="font-size:84px;margin-top:70px">Odkud jsou data</h1>
<div style="margin-top:50px;display:grid;gap:26px">""" + "".join(
 f'<div class="card"><div style="font-size:44px;font-weight:800">{t}</div><div style="font-size:28px;color:#CBD5E1;margin-top:6px;line-height:1.35">{s}</div></div>'
 for t, s in [("HowTheyVote.eu","hlasování Evropského parlamentu (licence ODbL)"),("EP Open Data","poslanci, strany, frakce, výbory (CC BY 4.0)"),("Portréty","© European Union – Source: EP")]) +
f"""</div><p style="font-size:40px;font-weight:700;margin-top:50px;line-height:1.3">Každé číslo má odkaz na zdroj.<br><span style="color:#93C5FD">{URL}</span></p>
{foot('Aktualizace jednou týdně.', '')}</div>""")

# ---------- C. Karta poslance ----------
mid = sorted([m for m in meps.values() if not m["mandates"][-1].get("end")], key=lambda m: m["sort_label"])[0]["id"]
m = meps[mid]; st = stats["meps"][str(mid)]["total"]
grp = m["groups"][-1]; par = m["parties"][-1]
gcode = grp["code"]
att = st["attendance"][0]/st["attendance"][1]; gl = st["group_loyalty"][0]/st["group_loyalty"][1]
epm = bench["ep"]["attendance"]; grm = bench["groups"][gcode]["group_loyalty"]
def numblock(label, val, ratio, base_txt, base):
    lo = 0.6; w = lambda x: max(0, min(100, (x - lo) / (1 - lo) * 100))
    return f'''<div style="flex:1"><p class="muted" style="font-size:30px;font-weight:600">{label}</p>
<p style="font-size:112px;font-weight:300;letter-spacing:-.03em;line-height:1.1;margin:6px 0 14px">00,0{NB}%</p>
<div style="position:relative;height:22px;border-radius:99px;background:var(--track)"><i style="position:absolute;left:0;top:0;height:100%;width:60%;border-radius:99px;background:#1E3A8A;opacity:.35"></i><i style="position:absolute;left:78%;top:-8px;width:5px;height:38px;background:#B45309;border-radius:3px;opacity:.5"></i></div>
<p style="font-size:27px;margin-top:16px;color:#B45309;font-weight:700">{base_txt} 00,0{NB}%</p>
<p class="muted" style="font-size:26px;margin-top:4px">0 000 z 0 000 hlasování</p></div>'''
GLN = {"ECR": "ECR", "PFE": "PfE", "EPP": "EPP", "NI": "NI"}
since = d_cs(m["mandates"][0]["start"])
add("C1-poslanec-karta", f"""<div class="s light">{top('light')}
<div style="display:flex;gap:44px;margin-top:44px">
<div style="flex:none"><svg viewBox="0 0 360 450" width="360" height="450" style="display:block;border-radius:26px;background:#E2E8F0"><circle cx="180" cy="170" r="72" fill="#94A3B8"/><path d="M50 450 C50 330 110 275 180 275 C250 275 310 330 310 450 Z" fill="#94A3B8"/></svg></div>
<div style="display:flex;flex-direction:column;justify-content:center">
<p style="font-size:40px;font-weight:600" class="muted">Jméno</p>
<h1 style="font-size:84px;margin:0 0 30px">Příjmení</h1>
<div style="display:flex;flex-direction:column;gap:12px;align-items:flex-start"><span class="chip line" style="font-size:28px">Frakce</span><span class="chip line" style="font-size:28px"><i class="dot" style="width:18px;height:18px;background:{parties[int(par['org_id'])]['chart_color']}"></i>Strana</span></div>
<p class="muted" style="font-size:28px;margin-top:26px">Poslanec od 00. 0. 0000</p></div></div>
<div class="card" style="margin-top:40px;display:flex;gap:44px;padding:36px 42px">
{numblock('Účast na hlasování', att, st['attendance'], 'medián EP', epm)}
{numblock('Hlasuje s frakcí', gl, st['group_loyalty'], 'medián frakce', grm)}</div>
<p class="muted" style="font-size:27px;margin-top:22px;line-height:1.35">Čísla nejsou známka. Bez pořadí a hodnocení; slabší účast může mít různé důvody.</p>
{foot(f"{SRC}<br><b>{URL}/p/…</b>", "Vzor karty · stejný avatar<br>pro všechny poslance")}</div>""")

# ---------- D. Avatar + highlighty ----------
add("D0-avatar", f"""<div class="s dark" style="align-items:center;justify-content:center;padding:0"><img src="{BR}/symbol-white.svg" style="width:640px"></div>""")
hl = [("Jak číst", "?"), ("Zdroje", "§"), ("Opravy", "!"), ("Poslanci", None), ("Rozkoly", "≠")]
for i, (t, g) in enumerate(hl):
    ic = f'<div style="font-size:300px;font-weight:300;line-height:1">{g}</div>' if g else dots(["FOR","AGAINST","ABSTENTION","FOR","AGAINST","DID_NOT_VOTE","FOR","FOR","ABSTENTION"],62,18,3)
    add(f"D{i+1}-highlight-{t.lower().replace(' ','-')}", f"""<div class="s dark" style="align-items:center;justify-content:center;padding:0;gap:30px">{ic}<div style="font-size:70px;font-weight:800">{t}</div></div>""")

# ---------- render ----------
SIZE = {"D": (1080, 1080)}
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium" if pathlib.Path("/opt/pw-browsers/chromium").exists() else None)
    for name, h in shots.items():
        w_, h_ = SIZE.get(name[0], (1080, 1350))
        pg = b.new_page(viewport={"width": w_, "height": h_})
        f = OUT / f"{name}.html"; f.write_text(h, encoding="utf-8")
        pg.goto(f"file://{f}"); pg.wait_for_timeout(250)
        pg.screenshot(path=str(OUT / f"{name}.png"))
        pg.close()
    b.close()
print("MEP:", m["family_name"], att, gl, epm, grm, "| CZ", czc)
