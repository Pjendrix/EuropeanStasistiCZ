// Hledání poslanců, stran a hlasování (B2): stejný index, výsledky i klávesy v heru na úvodu (hub.js) i v dialogu z lišty
// (app.js). Výsledky seskupené, max. 4 ve skupině. Hlasování se hledají i podle témat a synonym (audit UX P1, stejná slova
// jako v databázi hlasování votes.js): nahoře shoda v názvu, pak shoda jen v tématu, v obou skupinách závěrečná hlasování
// před dílčími a od nejnovějšího;
// když je jich víc, poslední volba vede na všechny výsledky v databázi hlasování.
import { ROOT, getJSON, loadSearch, loadTopicText, soft } from "./data.js";
import { CZ_GROUP_LABEL, KIND_LABEL, displayName, esc, fmtDate, isActive, isFinal, matchesAll, norm, searchTerms, voteTitle } from "./format.js";
import { mepUrl, partyUrl, photoUrl } from "./ui.js";

let index = null; // načte se při zaměření pole nebo prvním psaní (revize 3. 11. 2026: dřív až při psaní, ~2 s na pomalém mobilu)
let loading = null; // rozběhnuté stahování sdílí zaměření i psaní

// Odkazy od kořene webu (ROOT), aby fungovaly i z podsložek v/ a z/; p/ a s/ mají <base href="../"> a ROOT prázdný.
export async function loadSearchIndex() {
  if (index) return index;
  loading ||= buildSearchIndex().finally(() => { loading = null; });
  return loading;
}

async function buildSearchIndex() {
  const [ov, parties, votes, groups, topicText] = await Promise.all([getJSON("overview.json"), getJSON("parties/index.json"), loadSearch(),
    getJSON("groups.json").catch(soft([])), loadTopicText()]);
  const gLabel = (g) => { const x = g && groups.find((y) => y.ep_code === g.code || y.code === g.code); return x ? (CZ_GROUP_LABEL[x.code] || x.short_label) : g?.short_label; };
  const sortCs = (a, b) => a.sort.localeCompare(b.sort, "cs");
  index = {
    meps: ov.meps.map((m) => ({ href: ROOT + mepUrl(m.id), label: displayName(m), sort: m.sort_label || m.name, img: m.photo_url ? ROOT + photoUrl(m, true) : "",
      sub: [m.party?.short_label === "Ind." ? "nezávislý/á" : m.party?.short_label, gLabel(m.group)].filter(Boolean).join(" · ") + (isActive(m) ? "" : " · bývalý/á"),
      key: norm(`${displayName(m)} ${m.name} ${m.party?.short_label || ""}`) })).sort(sortCs),
    parties: parties.parties.map((p) => ({ href: ROOT + partyUrl(p.id), label: p.name || p.short_label, sort: p.name || p.short_label, sub: `strana · ${p.short_label}`, mark: "S",
      key: norm(`${p.name || ""} ${p.short_label}`) })).sort(sortCs),
    votes: votes.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id)
      .map((v) => ({ href: ROOT + (isFinal(v) ? `v/${v.id}` : `vote?id=${v.id}`), label: voteTitle(v), mark: "H", final: isFinal(v),
        sub: `${fmtDate(v.date)}${v.vote_kind ? ` · ${KIND_LABEL[v.vote_kind] || ""}` : ""}`,
        key: norm(`${voteTitle(v)} ${v.title || ""} ${v.reference || ""} ${v.description || ""} ${v.description_cs || ""}`), topics: topicText(v) })),
  };
  return index;
}

// Našeptávač (combobox podle ARIA): input s role="combobox", list s role="listbox". prefix = jedinečná id voleb.
export function combobox(q, list, prefix) {
  let items = [], sel = -1;
  // Index se začne stahovat hned při zaměření pole, ne až po prvních dvou písmenech.
  q.addEventListener("focus", () => { loadSearchIndex().catch(() => {}); }, { once: true });
  const close = () => { list.hidden = true; q.setAttribute("aria-expanded", "false"); q.removeAttribute("aria-activedescendant"); items = []; sel = -1; };
  const mark = () => {
    list.querySelectorAll('[role="option"]').forEach((o) => o.setAttribute("aria-selected", String(Number(o.dataset.k) === sel)));
    if (sel >= 0) { q.setAttribute("aria-activedescendant", `${prefix}-opt-${sel}`); document.getElementById(`${prefix}-opt-${sel}`)?.scrollIntoView({ block: "nearest" }); }
  };
  const search = async () => {
    const needle = norm(q.value.trim());
    if (needle.length < 2) { close(); return; }
    const idx = await loadSearchIndex();
    if (norm(q.value.trim()) !== needle) return; // mezitím se psalo dál
    const terms = searchTerms(q.value);
    // pořadí: shoda v názvu před shodou jen v tématu, v každé skupině závěrečná hlasování před dílčími, pak od nejnovějšího
    const inTitle = idx.votes.filter((x) => matchesAll(x.key, terms));
    const inTopic = idx.votes.filter((x) => !matchesAll(x.key, terms) && matchesAll(`${x.key} ${x.topics}`, terms));
    const finalFirst = (arr) => arr.filter((x) => x.final).concat(arr.filter((x) => !x.final));
    const votes = finalFirst(inTitle).concat(finalFirst(inTopic));
    const shown = votes.slice(0, 4);
    if (votes.length > shown.length) {
      shown.push({ href: `${ROOT}votes?${new URLSearchParams({ q: q.value.trim(), f: "all" })}`, label: `Všech ${votes.length} hlasování →`,
        sub: "výsledky v databázi hlasování, i podle témat", mark: "→" });
    }
    const groups = [["Poslanci", idx.meps.filter((x) => x.key.includes(needle)).slice(0, 4)], ["Strany", idx.parties.filter((x) => x.key.includes(needle)).slice(0, 4)],
      ["Hlasování", shown]].filter(([, arr]) => arr.length);
    items = groups.flatMap(([, arr]) => arr);
    let k = 0;
    list.innerHTML = groups.map(([label, arr]) => `<li class="hm-g" role="presentation">${label}</li>` + arr.map((x) => {
      const i = k++;
      return `<li role="option" id="${prefix}-opt-${i}" data-k="${i}" aria-selected="false"><a href="${esc(x.href)}" tabindex="-1">${x.img ? `<img src="${esc(x.img)}" alt="" width="34" height="34">` : `<span class="hm-ic" aria-hidden="true">${x.mark || "•"}</span>`}
        <span class="hm-rt"><span class="hm-t1">${esc(x.label)}</span><small>${esc(x.sub)}</small></span></a></li>`;
    }).join("")).join("") || '<li class="hm-none" role="presentation">Nic jsme nenašli. Zkuste jméno, zkratku strany nebo téma hlasování.</li>';
    list.hidden = false;
    q.setAttribute("aria-expanded", "true");
    sel = items.length ? 0 : -1;
    mark();
  };
  q.addEventListener("input", search);
  q.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" && items.length) { ev.preventDefault(); sel = (sel + 1) % items.length; mark(); }
    else if (ev.key === "ArrowUp" && items.length) { ev.preventDefault(); sel = (sel - 1 + items.length) % items.length; mark(); }
    else if (ev.key === "Enter" && sel >= 0 && !list.hidden) { ev.preventDefault(); location.href = items[sel].href; }
    else if (ev.key === "Escape" && !list.hidden) { ev.stopPropagation(); q.value = ""; close(); }
  });
  list.addEventListener("mousedown", (ev) => { const o = ev.target.closest('[role="option"]'); if (o) { ev.preventDefault(); location.href = items[Number(o.dataset.k)].href; } });
  document.addEventListener("click", (ev) => { if (!q.form?.contains(ev.target)) close(); });
  return { close };
}
