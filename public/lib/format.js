// Čisté funkce a texty bez DOM (formátování, popisky, hledání). Testuje node --test (tests/js).

// Veřejná adresa webu pro sdílení a citace (stejná jako data/manual/site.json, hlídá test).
export const BASE_URL = "https://epwatch.cz/";

// Adresa stránky bez koncovky .html (vercel.json cleanUrls): p/1.html → p/1, votes.html?c=x → votes?c=x, index.html → ""
// (kořen webu). Kotvy a parametry zůstávají. Stejná funkce je page_path ve scripts/web_ui.py.
export function pagePath(path) {
  return String(path).replace(/^\/+/, "").replace(/(^|\/)index\.html(?=[?#]|$)/, "$1").replace(/\.html(?=[?#]|$)/, "");
}

// Absolutní adresa stránky na veřejné doméně (i když běží náhled nebo lokální server).
export function siteUrl(path) { return BASE_URL + pagePath(path); }

// Kontext panelu sdílení připravený buildem ({kind, path, …}) doplní o plnou adresu a její krátký tvar na kartu.
export function withShareUrl(ctx) {
  if (!ctx) return null;
  const url = siteUrl(ctx.path);
  return { ...ctx, url, data: ctx.data && { ...ctx.data, urlShort: url.replace(/^https?:\/\//, "") } };
}

export const HTV_SOURCE = "https://howtheyvote.eu";

export const EP_SOURCE = "https://data.europarl.europa.eu";

export const POSITION_LABEL = {
  FOR: "pro",
  AGAINST: "proti",
  ABSTENTION: "zdržel/a se",
  DID_NOT_VOTE: "nehlasoval/a",
};

// Tvar podle pohlaví z EP (gender MALE / FEMALE); když chybí, obecný tvar „hlasoval/a“.
export function byGender(mep, male, female) {
  if (mep?.gender === "FEMALE") return female;
  if (mep?.gender === "MALE") return male;
  return female.startsWith(male) ? `${male}/${female.slice(male.length)}` : `${male} / ${female}`;
}

// Volba konkrétního poslance v jeho rodě.
export function positionFor(position, mep) {
  if (position === "ABSTENTION") return byGender(mep, "zdržel se", "zdržela se");
  if (position === "DID_NOT_VOTE") return byGender(mep, "nehlasoval", "nehlasovala");
  return POSITION_LABEL[position];
}

export const RESULT_LABEL = { ADOPTED: "přijato", REJECTED: "zamítnuto", LAPSED: "propadlo", WITHDRAWN: "staženo" };

export const RESULT_NOTE = {
  LAPSED: "Návrh propadl: bylo přijato jiné znění, které ho vylučuje, takže se o něm už nehlasovalo jako o samostatném.",
  WITHDRAWN: "Návrh byl stažen.",
  null: "Zdroj (HowTheyVote.eu) u tohoto hlasování výsledek neuvádí. Výsledek ověř v originálu (odkaz „Originál na HowTheyVote.eu“).",
};

// Typ hlasování (vote_kind) určuje build_web.py pevnými pravidly (scripts/vote_kinds.py).
export const KIND_LABEL = {
  final: "závěrečné hlasování",
  provisional_agreement: "prozatímní dohoda s Radou",
  objection: "námitka proti aktu Komise",
  rejection: "návrh na zamítnutí",
  mandate: "mandát k jednání s Radou",
  urgency: "naléhavý postup",
  amendment: "pozměňovací návrh",
  split_part: "dílčí hlasování",
  procedural: "procedurální hlasování",
  other: "ostatní",
};

export const FINAL_KINDS = ["final", "provisional_agreement", "objection"];

// Co znamená hlas PRO u typů, kde to není zřejmé (stejné texty jako KIND_NOTES ve vote_kinds.py).
export const KIND_NOTE = {
  rejection: "Hlasovalo se o návrhu na zamítnutí: hlas PRO = text zamítnout, hlas PROTI = text ponechat.",
  objection: "Hlasovalo se o usnesení, kterým Parlament vznáší námitku proti aktu Komise (čl. 114 nebo 115 jednacího řádu): hlas PRO = vznést námitku (nesouhlas s aktem), hlas PROTI = námitku nevznášet.",
};

// Co znamenal hlas PRO a PROTI podle typu hlasování (audit UX P1): [o čem se hlasovalo, PRO, PROTI].
// Pevná pravidla jednacího řádu EP, žádná AI; stejné texty jako VOTE_MEANING ve scripts/web_ui.py (hlídá test).
export const VOTE_MEANING = {
  final: ["Hlasovalo se o celém textu (postoji k návrhu zákona, usnesení nebo rozhodnutí).", "text přijmout", "text nepřijmout"],
  provisional_agreement: ["Hlasovalo se o dohodě, kterou Parlament vyjednal s Radou; schválením je zákon v praxi přijatý v dohodnutém znění.", "dohodu schválit", "dohodu neschválit"],
  objection: ["Hlasovalo se o usnesení, kterým Parlament vznáší námitku proti aktu Komise (čl. 114 nebo 115 jednacího řádu).", "vznést námitku (nesouhlas s aktem)", "námitku nevznášet"],
  rejection: ["Hlasovalo se o návrhu na zamítnutí celého textu.", "text zamítnout", "text ponechat"],
  mandate: ["Hlasovalo se o tom, zda výbor může na základě své zprávy zahájit jednání s Radou.", "zahájit jednání s Radou", "nezahájit jednání; o zprávě pak hlasuje plénum, kde ji lze měnit pozměňovacími návrhy"],
  urgency: ["Hlasovalo se o žádosti projednat návrh naléhavým (zrychleným) postupem; o obsahu se tím nerozhoduje.", "naléhavý postup", "běžný postup"],
  amendment: ["Hlasovalo se o pozměňovacím návrhu, tedy o změně části textu; o celém textu se hlasuje zvlášť.", "změnu do textu vložit", "ponechat původní znění"],
  split_part: ["Hlasovalo se odděleně jen o části textu (odstavci, bodu, článku); o celém textu se hlasuje zvlášť.", "tuto část v textu ponechat", "tuto část z textu vypustit"],
  procedural: ["Procedurální žádost (např. odložení hlasování nebo vrácení věci výboru); o obsahu textu se nerozhoduje.", "žádosti vyhovět", "žádost zamítnout"],
};

export const SHORT_MANDATE_NOTE = "Mandát kratší než 60 dní: procenta jsou z velmi malého počtu hlasování.";

export const INDEPENDENT_NOTE = "EP Open Data uvádí poslance jako nezávislého (Independent, zkratka Ind.), tedy bez národní strany.";

export const NO_PARTY_NOTE = "Evropský parlament u tohoto poslance pro 10. období českou stranu neuvádí.";

// Česká zkratka tam, kde zdroj dává anglický popis místo zkratky.
export const CZ_GROUP_LABEL = { NI: "nezařazení" };

// Barva identity frakce nebo strany je v datech (groups.json / parties.json z data/manual/colors.json):
// oficiální brand_color, jinak chart_color zvolená kvůli rozlišitelnosti. V JS žádné barvy dat.
export function groupColor(g) {
  return (g && (g.color || g.chart_color)) || "var(--muted)";
}

// Logo na bílé dlaždici (funguje i v tmavém režimu bez úpravy loga); jen na místech s dost místa, ne v drobných štítcích.
// Dlaždice má pevnou výšku `size`; samotné logo se zmenší podle poměru stran (logo_aspect z compute_stats.py),
// aby široká slovní loga (PATRIOTS.EU, renew europe) měla zhruba stejnou plochu jako čtvercová (ECR, S&D).
// Logo se jen zmenšuje, kresba se nemění.
export function logoHeight(aspect, size) {
  if (!aspect || aspect <= 1) return size;
  return Math.round(size * Math.max(0.42, Math.pow(aspect, -0.4)) * 10) / 10;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function pct(pair) {
  if (!pair || !pair[1]) return null;
  return pair[0] / pair[1];
}

export function fmtPct(value) {
  return value === null ? "–" : (value * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "\u00a0%";
}

export function fmtNum(n) {
  return Number(n).toLocaleString("cs-CZ");
}

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}.\u00a0${Number(m)}.\u00a0${y}`; // pevné mezery: datum se nezalomí (O11)
}

export function fmtMonth(ym) {
  const months = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
  const [y, m] = ym.split("-");
  return `${months[Number(m) - 1]} ${y}`;
}

// „1 poslanec“, „3 poslanci“, „5 poslanců“.
export function mepsCount(n) {
  return `${fmtNum(n)} ${n === 1 ? "poslanec" : n >= 2 && n <= 4 ? "poslanci" : "poslanců"}`;
}

export function displayName(mep) {
  // EP píše příjmení verzálkami, na webu je zobrazíme normálně.
  if (mep.given_name && mep.family_name) return `${mep.given_name} ${mep.family_name}`;
  return mep.name;
}

export function isActive(mep) {
  const today = todayCZ();
  return mep.mandates.some((m) => m.start <= today && (!m.end || today <= m.end));
}

// Počty Čechů: pro a proti výrazně, zdržení a nehlasování menším písmem.
export function czCountsText(cz) {
  return `${cz[0]} pro · ${cz[1]} proti · ${cz[2]} se zdrželo · ${cz[3]} nehlasovalo`;
}

// Dnešní den v pražském čase (RRRR-MM-DD). toISOString() vrací UTC, takže kolem půlnoci ukazoval včerejšek (audit A8).
export function todayCZ() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
}

// Hledání bez ohledu na diakritiku a velikost písmen (audit UI2), stejné na všech stránkách.
export const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Slova dotazu: delší slova bez posledních 1–2 písmen, aby „ukrajina“ našla i „ukrajinu“, „migrace“ i „migraci“.
export function searchTerms(query) {
  return norm(query).split(/\s+/).filter(Boolean).map((w) => (w.length > 5 ? w.slice(0, w.length > 7 ? -2 : -1) : w));
}

export function matchesAll(hay, terms) {
  return terms.every((t) => hay.includes(t));
}

// Zvýrazní shody dotazu v textu (<mark>); text se escapuje, pozice se hledají v normalizované podobě (stejná délka jako originál po NFD bez diakritiky).
export function highlight(text, terms) {
  const src = String(text ?? "");
  if (!terms.length) return esc(src);
  // Mapa pozic: norm() maže kombinující znaky, proto si pamatujeme, kam patří každý znak normalizovaného textu.
  let flat = "", pos = [];
  [...src].forEach((ch, i) => {
    const n = norm(ch);
    for (const c of n) { flat += c; pos.push(i); }
  });
  const chars = [...src], hit = new Array(chars.length).fill(false);
  for (const t of terms) {
    let from = 0, at;
    while (t && (at = flat.indexOf(t, from)) !== -1) {
      for (let k = at; k < at + t.length; k++) hit[pos[k]] = true;
      from = at + t.length;
    }
  }
  let out = "", open = false;
  chars.forEach((ch, i) => {
    if (hit[i] !== open) { out += open ? "</mark>" : "<mark>"; open = hit[i]; }
    out += esc(ch);
  });
  return open ? `${out}</mark>` : out;
}

export function debounce(fn, ms) {
  let tid;
  return (...args) => { clearTimeout(tid); tid = setTimeout(() => fn(...args), ms); };
}

// Stránka „Příběh zákona“ k číslu procedury: 2023/0447(COD) -> z/2023-0447-COD (scripts/procedure_pages.py).
export function procedureUrl(ref, root = "") {
  const m = /^(\d{4})\/(\d{4})\(([A-Z]{3})\)$/.exec(ref || "");
  return m ? `${root}z/${m[1]}-${m[2]}-${m[3]}` : null;
}

// Tvar parametrů z URL (měsíc, den): cokoli jiného se ignoruje.
export const MONTH_RE = /^\d{4}-\d{2}$/;

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Oficiální český název procedury (title_cs z EP Open Data, build_web.vote_title), jinak anglický z HowTheyVote.
export function voteTitle(v) {
  let t = v.title_cs || v.title || v.procedure?.title || v.reference || `Hlasování ${v.id}`;
  return t;
}

// Popis toho, o čem se hlasovalo: česky, když ho pravidla umí přeložit, jinak originál ze zdroje.
export function voteDesc(v) {
  return v.description_cs || v.description || "";
}

export function voteSubtitle(v) {
  const parts = [];
  if (v.reference) parts.push(v.reference);
  const desc = voteDesc(v);
  if (desc) parts.push(desc);
  else if (/^\d+$/.test(String(v.amendment_number || ""))) parts.push(`PN ${v.amendment_number}`);
  return parts.join(" · ");
}

// Výsledek slovy; u návrhu na zamítnutí a námitky i co to znamená.
export function resultText(v) {
  const base = RESULT_LABEL[v.result] || "neuveden";
  if (v.inverted || v.vote_kind === "rejection") {
    if (v.result === "ADOPTED") return `${base} = text zamítnut`;
    if (v.result === "REJECTED") return `${base} = text nezamítnut`;
  }
  if (v.vote_kind === "objection") {
    if (v.result === "ADOPTED") return `${base} = Parlament vznesl námitku`;
    if (v.result === "REJECTED") return `${base} = námitka neprošla`;
  }
  return base;
}

// Výsledek jako věta podle typu hlasování (nadpis výsledkové karty na detailu).
export function resultSentence(kind, result) {
  const ok = result === "ADOPTED", no = result === "REJECTED";
  if (!ok && !no) return RESULT_LABEL[result] ? RESULT_LABEL[result][0].toUpperCase() + RESULT_LABEL[result].slice(1) : "Výsledek neuveden";
  const S = {
    rejection: ["Návrh na zamítnutí prošel – text je zamítnut", "Návrh na zamítnutí neprošel – text zůstává"],
    objection: ["Parlament vznesl námitku proti aktu Komise", "Námitka neprošla – akt Komise platí"],
    amendment: ["Pozměňovací návrh byl přijat", "Pozměňovací návrh byl zamítnut"],
    split_part: ["Tato část textu byla přijata", "Tato část textu byla zamítnuta"],
    final: ["Parlament text přijal", "Parlament text zamítl"],
    provisional_agreement: ["Parlament dohodu s Radou schválil", "Parlament dohodu s Radou zamítl"],
    mandate: ["Mandát k jednání s Radou schválen", "Mandát k jednání s Radou neschválen"],
    urgency: ["Naléhavý postup schválen", "Naléhavý postup zamítnut"],
  }[kind];
  return S ? S[ok ? 0 : 1] : (ok ? "Přijato" : "Zamítnuto");
}

// Většina frakce z počtů [pro, proti, zdržel se, nehlasoval]: jednoznačně nejvíc hlasů, jinak null (stejné pravidlo jako compute_stats.majority).
export function groupMajorityLabel(row) {
  const v = row.slice(0, 3);
  const max = Math.max(...v);
  const winners = v.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0);
  return max > 0 && winners.length === 1 ? ["pro", "proti", "zdržet se"][winners[0]] : null;
}

// Slovo hlasu ve správném rodě a čísle (zrcadlo position_phrase v scripts/build_pages.py).
export function positionPhrase(position, members) {
  if (position === "FOR") return "pro";
  if (position === "AGAINST") return "proti";
  if (members.length === 1) return positionFor(position, members[0]);
  const fem = members.every((m) => m.gender === "FEMALE");
  if (position === "ABSTENTION") return fem ? "zdržely se" : "zdrželi se";
  return fem ? "nehlasovaly" : "nehlasovali";
}

// Závěrečné hlasování o textu (nebo o prozatímní dohodě); starší data jen podle is_main.
export function isFinal(v) {
  if (v.is_final !== undefined) return v.is_final;
  return v.vote_kind ? FINAL_KINDS.includes(v.vote_kind) : Boolean(v.is_main);
}

// Přijatý text v češtině (PDF z EP Open Data) podle texts_adopted_reference „P10_TA(2026)0230“.
export function adoptedTextUrl(ref) {
  const m = /^P(\d+)_TA\((\d{4})\)(\d{4})$/.exec(ref || "");
  return m ? `https://data.europarl.europa.eu/distribution/doc/TA-${m[1]}-${m[2]}-${m[3]}_cs.pdf` : null;
}

// --- citace a export ---------------------------------------------------------

// „Vysvětlit s AI“: web sám AI nevolá. Připraví neutrální dotaz s odkazy na oficiální zdroje a otevře ho
// v AI nástroji podle volby čtenáře. Claude a ChatGPT dotaz převezmou z odkazu (?q=), Gemini oficiálně ne:
// dotaz se zkopíruje do schránky a Gemini se otevře. Odpověď AI není součást webu a web za ni neručí.
// Odkaz na text dokumentu na webu EP (A = zpráva výboru, B = návrh usnesení, RC = společný návrh usnesení).
// HTML verze, kterou AI nástroje umí přečíst líp než PDF; C (postoje Rady) na webu EP v této podobě nejsou.
export function epDocUrl(ref) {
  const m = /^(RC-B|A|B)(\d+)-(\d{4})\/(\d{4})/.exec(ref || "");
  return m ? `https://www.europarl.europa.eu/doceo/document/${m[1] === "RC-B" ? "RC" : m[1]}-${m[2]}-${m[4]}-${m[3]}_CS.html` : null;
}

export function adoptedTextHtmlUrl(ref) {
  const m = /^P(\d+)_TA\((\d{4})\)(\d{4})$/.exec(ref || "");
  return m ? `https://www.europarl.europa.eu/doceo/document/TA-${m[1]}-${m[2]}-${m[3]}_CS.html` : null;
}

// Odpočet do příštího zasedání (blok „Další zasedání“): počítá prohlížeč z data, web se kvůli tomu nepřestavuje.
// „19.–22. 10. 2026“, přes měsíc „30. 9. – 2. 10. 2026“ (dvojče _range v scripts/hub.py).
export function fmtRange(a, b) {
  if (a === b) return fmtDate(a);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8))}.–${fmtDate(b)}`;
  if (a.slice(0, 4) !== b.slice(0, 4)) return `${fmtDate(a)} – ${fmtDate(b)}`;
  return `${fmtDate(a).slice(0, -5)} – ${fmtDate(b)}`;
}

// Které zasedání ukázat k dnešku (úkol 3, 24. 10. 2026; dvojče agenda.effective v Pythonu). Stránky se nepřestavují denně:
// skončil-li blok z programu, přepne se na další blok z kalendáře (after*), bez něj „gone“ (blok se skryje).
export function rollSession(from, to, afterFrom, afterTo, today = todayCZ()) {
  if (today > to) {
    if (!afterFrom || today > afterTo) return { state: "gone" };
    return { state: today >= afterFrom ? "current" : "upcoming", from: afterFrom, to: afterTo, switched: true };
  }
  return { state: today >= from ? "current" : "upcoming", from, to, switched: false };
}

export function sessionCountdown(from, to, today = todayCZ()) {
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  if (today > to) return "zasedání skončilo, výsledky budou po zveřejnění dat";
  if (today >= from) return "právě probíhá";
  const n = days(today, from);
  return n === 1 ? "zítra" : `za ${n} ${n < 5 ? "dny" : "dní"}`;
}

// Pruh „data mohou být neaktuální“ (data/freshness.json z build_web.py): export starší než stale_days dní
// a od té doby už proběhlo zasedání EP (jinak nová hlasování být nemohou). Počítá prohlížeč, web se nepřestavuje.
export function isStale(fresh, today = todayCZ()) {
  if (!fresh?.release) return false;
  const age = Math.round((Date.parse(today) - Date.parse(fresh.release)) / 864e5);
  return age >= (fresh.stale_days ?? 14) && (fresh.sittings_after || []).some((d) => d < today);
}

// --- srovnání s delegacemi podobné velikosti (data/delegations.json, scripts/delegations.py) -------

export const COUNTRY_CS = {
  AUT: "Rakousko", BEL: "Belgie", BGR: "Bulharsko", HRV: "Chorvatsko", CYP: "Kypr", CZE: "Česko", DNK: "Dánsko", EST: "Estonsko",
  FIN: "Finsko", FRA: "Francie", GRC: "Řecko", HUN: "Maďarsko", IRL: "Irsko", ITA: "Itálie", LVA: "Lotyšsko", LTU: "Litva",
  LUX: "Lucembursko", MLT: "Malta", NLD: "Nizozemsko", POL: "Polsko", PRT: "Portugalsko", ROU: "Rumunsko", SVK: "Slovensko",
  SVN: "Slovinsko", ESP: "Španělsko", SWE: "Švédsko", DEU: "Německo",
};

export function spanText(range, fmt) {
  return range && range.min != null ? (range.min === range.max ? fmt(range.min) : `${fmt(range.min)}–${fmt(range.max)}`) : "–";
}

// Role ve vedení frakce podle EP API (data/eugroups/*.json chairs): předseda/předsedkyně, u více záznamů
// spolupředseda/spolupředsedkyně; když API pohlaví neuvádí, obecné „předsednictví“ (zadání 20. 10. 2026).
export function chairRole(c) {
  if (!c.gender) return "předsednictví";
  const co = c.role === "CHAIR_CO";
  return c.gender === "F" ? (co ? "spolupředsedkyně" : "předsedkyně") : co ? "spolupředseda" : "předseda";
}

// Nadpis bloku vedení: jeden předseda/předsedkyně, víc lidí = spolupředsedové (bez pohlaví „Předsednictví“).
export function chairsHeading(chairs) {
  if (chairs.length > 1) return "Spolupředsedové";
  const r = chairRole(chairs[0]);
  return r.charAt(0).toUpperCase() + r.slice(1);
}

// Řádky složení frakce: prvních 5 zemí a Česko vždy jako 6. řádek (zvýrazněné), pokud v první pětici není (i s 0).
export function topCountries(countries, n = 5) {
  const all = countries?.by_country || [];
  const top = all.slice(0, n).map((c) => ({ ...c, cz: c.cc === "CZ" }));
  if (!top.some((c) => c.cz)) top.push({ ...(all.find((c) => c.cc === "CZ") || { cc: "CZ", n: 0, cs: "Česko" }), cz: true, extra: true });
  return top;
}

export const seatsCs = (n) => `${fmtNum(n)} ${n === 1 ? "poslanec" : n >= 2 && n <= 4 ? "poslanci" : "poslanců"}`;
// „z 13 zemí“, „ze 17 zemí“ (ze před čísly, která se čtou se s/z/dv/tř/čt: 2–4, 7, 17, 70–79).
export const fromCountriesCs = (n) => `${[2, 3, 4, 7, 17].includes(n) || (n >= 70 && n < 80) ? "ze" : "z"} ${fmtNum(n)} ${n === 1 ? "země" : "zemí"}`;
