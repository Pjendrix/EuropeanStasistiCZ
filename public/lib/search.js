// Hledání poslanců, stran a hlasování (B2): stejný index, výsledky i klávesy v heru na úvodu (hub.js) i v dialogu z lišty
// (app.js). Výsledky seskupené, max. 4 ve skupině, bez řazení podle „relevance“; hlasování od nejnovějšího.
import { ROOT, getJSON, loadSearch, soft } from "./data.js";
import { CZ_GROUP_LABEL, KIND_LABEL, displayName, esc, fmtDate, isActive, isFinal, norm, voteTitle } from "./format.js";
import { mepUrl, partyUrl, photoUrl } from "./ui.js";

let index = null; // načte se při prvním psaní

// Odkazy od kořene webu (ROOT), aby fungovaly i z podsložek v/ a z/; p/ a s/ mají <base href="../"> a ROOT prázdný.
export async function loadSearchIndex() {
  if (index) return index;
  const [ov, parties, votes, groups] = await Promise.all([getJSON("overview.json"), getJSON("parties/index.json"), loadSearch(), getJSON("groups.json").catch(soft([]))]);
  const gLabel = (g) => { const x = g && groups.find((y) => y.ep_code === g.code || y.code === g.code); return x ? (CZ_GROUP_LABEL[x.code] || x.short_label) : g?.short_label; };
  const sortCs = (a, b) => a.sort.localeCompare(b.sort, "cs");
  index = {
    meps: ov.meps.map((m) => ({ href: ROOT + mepUrl(m.id), label: displayName(m), sort: m.sort_label || m.name, img: m.photo_url ? ROOT + photoUrl(m, true) : "",
      sub: [m.party?.short_label === "Ind." ? "nezávislý/á" : m.party?.short_label, gLabel(m.group)].filter(Boolean).join(" · ") + (isActive(m) ? "" : " · bývalý/á"),
      key: norm(`${displayName(m)} ${m.name} ${m.party?.short_label || ""}`) })).sort(sortCs),
    parties: parties.parties.map((p) => ({ href: ROOT + partyUrl(p.id), label: p.name || p.short_label, sort: p.name || p.short_label, sub: `strana · ${p.short_label}`, mark: "S",
      key: norm(`${p.name || ""} ${p.short_label}`) })).sort(sortCs),
    votes: votes.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id)
      .map((v) => ({ href: ROOT + (isFinal(v) ? `v/${v.id}` : `vote?id=${v.id}`), label: voteTitle(v), mark: "H",
        sub: `${fmtDate(v.date)}${v.vote_kind ? ` · ${KIND_LABEL[v.vote_kind] || ""}` : ""}`,
        key: norm(`${voteTitle(v)} ${v.reference || ""} ${v.description_cs || ""}`) })),
  };
  return index;
}

// Našeptávač (combobox podle ARIA): input s role="combobox", list s role="listbox". prefix = jedinečná id voleb.
export function combobox(q, list, prefix) {
  let items = [], sel = -1;
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
    const groups = [["Poslanci", idx.meps], ["Strany", idx.parties], ["Hlasování", idx.votes]]
      .map(([label, arr]) => [label, arr.filter((x) => x.key.includes(needle)).slice(0, 4)]).filter(([, arr]) => arr.length);
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
