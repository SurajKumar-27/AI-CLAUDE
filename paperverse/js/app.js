/* Boots the observatory page: learning path, paper grid, glossary, deep links. */
(function () {
  const { h } = PV;

  const PATH = [
    ["primer", "What is an LLM, from zero"],
    ["attention", "The engine inside every model"],
    ["gpt3", "Why bigger models suddenly 'get it'"],
    ["instructgpt", "How a text predictor becomes an assistant"],
    ["cot", "Making models show their work"],
    ["react", "From chatbot to agent"],
    ["r1", "Teaching models to reason with RL"],
    ["rrsi", "Where it's heading: self-improving harnesses"],
  ];

  let filter = { track: "all", era: "all", q: "" };
  // decks added by the twice-weekly routine carry `added: "YYYY-MM-DD"`; flag them for two weeks
  const isNew = (p) => p.added && (Date.now() - Date.parse(p.added)) / 864e5 <= 14;

  function card(p) {
    const tr = PV.tracks[p.track];
    const total = p.slides.length + 2;
    const prog = PV.progress(p.id, total);
    const c = h("button", { class: "card", type: "button", "data-paper": p.id, style: { "--c": tr.color }, onclick: () => PV.openDeck(p.id, 0) },
      h("div", { class: "card-top" }, h("span", { class: "card-track" }, tr.name), h("span", { class: "card-year" }, p.date || String(p.year))),
      h("h3", null, p.title),
      h("p", null, p.oneLiner),
      h("div", { class: "card-foot" },
        isNew(p) ? h("span", { class: "badge new" }, "New · added " + p.added) : null,
        p.era === "frontier" ? h("span", { class: "badge new" }, "Frontier") : p.era === "primer" ? h("span", { class: "badge new" }, "Start here") : h("span", { class: "badge" }, "Foundation"),
        h("span", { class: "badge" }, `${total} slides`),
        prog > 0 ? h("span", { class: "badge", style: { color: tr.color, borderColor: tr.color } }, prog >= 1 ? "Done" : `${Math.round(prog * 100)}% seen`) : null,
        p.signals ? h("span", { class: "meter", title: "Impact (editorial)" }, [1, 2, 3, 4, 5].map((i) => h("i", { class: i <= p.signals.impact ? "on" : "" }))) : null));
    return c;
  }

  function renderGrid() {
    const grid = document.getElementById("grid");
    grid.innerHTML = "";
    const q = filter.q.trim().toLowerCase();
    const list = PV.papers
      .filter((p) => filter.track === "all" || p.track === filter.track)
      .filter((p) => filter.era === "all" || p.era === filter.era)
      .filter((p) => !q || (p.title + " " + p.oneLiner + " " + (p.short || "") + " " + (p.tags || []).join(" ")).toLowerCase().includes(q))
      .sort((a, b) => (a.era === "primer" ? -1 : b.era === "primer" ? 1 : isNew(b) - isNew(a) || (a.date || "").localeCompare(b.date || "")));
    list.forEach((p) => grid.appendChild(card(p)));
    if (!list.length) grid.appendChild(h("p", { style: { color: PV.C.ink3 } }, "No paper matches that search. Try a broader word such as “memory” or “agent”."));
    document.getElementById("count").textContent = `${list.length} of ${PV.papers.length}`;
  }
  PV.refreshProgress = renderGrid;

  function renderFilters() {
    const f = document.getElementById("filters");
    const mk = (label, val, color) => {
      const b = h("button", { class: "chip", type: "button", "aria-pressed": String(filter.track === val), style: color ? { color } : null }, color ? h("i") : null, label);
      b.addEventListener("click", () => {
        filter.track = val;
        f.querySelectorAll(".chip[data-k=t]").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        renderGrid();
      });
      b.dataset.k = "t";
      return b;
    };
    f.appendChild(mk("All tracks", "all"));
    Object.entries(PV.tracks).forEach(([k, t]) => { if (k !== "primer") f.appendChild(mk(t.name, k, t.color)); });
    const era = h("select", { class: "search", "aria-label": "Era", style: { width: "auto" } },
      h("option", { value: "all" }, "Every era"), h("option", { value: "foundation" }, "Foundations"), h("option", { value: "frontier" }, "Frontier 2025–26"));
    era.addEventListener("change", () => { filter.era = era.value; renderGrid(); });
    f.appendChild(era);
    const s = h("input", { class: "search", type: "search", id: "paper-search", placeholder: "Search: memory, agents, RL…", "aria-label": "Search papers" });
    s.addEventListener("input", () => { filter.q = s.value; renderGrid(); });
    f.appendChild(s);
  }

  function renderPath() {
    const el = document.getElementById("path");
    PATH.forEach(([id, why]) => {
      const p = PV.papers.find((x) => x.id === id);
      if (!p) return;
      el.appendChild(h("a", { href: `#${id}.1`, onclick: (e) => { e.preventDefault(); PV.openDeck(id, 0); } },
        h("b", { style: { color: PV.tracks[p.track].color } }, p.short || p.title), h("span", null, why)));
    });
  }

  function renderGlossary() {
    const seen = new Map();
    PV.papers.forEach((p) => (p.terms || []).forEach(([t, d]) => { if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), [t, d, p]); }));
    const dl = document.getElementById("glossary");
    [...seen.values()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([t, d, p]) => {
      dl.appendChild(h("div", null, h("dt", null, t), h("dd", null, d, " ", h("a", { href: `#${p.id}.1`, style: { color: PV.tracks[p.track].color }, onclick: (e) => { e.preventDefault(); PV.openDeck(p.id, 0); } }, `(${p.short || p.title})`))));
    });
    document.getElementById("gcount").textContent = seen.size;
  }

  function route() {
    const m = /^#([a-z0-9-]+)(?:\.(\d+))?$/.exec(location.hash || "");
    if (m && PV.papers.some((p) => p.id === m[1])) PV.openDeck(m[1], (+m[2] || 1) - 1);
  }

  document.addEventListener("DOMContentLoaded", () => {
    PV.initDeck();
    renderPath();
    renderFilters();
    renderGrid();
    renderGlossary();
    document.getElementById("stat-papers").textContent = PV.papers.length - 1;
    document.getElementById("stat-slides").textContent = PV.papers.reduce((n, p) => n + p.slides.length + 2, 0);
    try { PV.initGalaxy(document.getElementById("galaxy")); } catch (e) { console.error(e); }
    route();
  });
})();
