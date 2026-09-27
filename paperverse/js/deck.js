/* The slide-deck viewer: one deck per paper, opened over the observatory. */
(function () {
  const { h } = PV;
  let deckEl, stage, dotsEl, countEl, titleEl, prevBtn, nextBtn;
  let paper = null, slides = [], idx = 0, cleanup = null;

  const SEEN_KEY = "pv-seen-v1";
  function loadSeen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch (e) { return {}; }
  }
  function markSeen(id, i) {
    try {
      const s = loadSeen();
      s[id] = Array.from(new Set([...(s[id] || []), i]));
      localStorage.setItem(SEEN_KEY, JSON.stringify(s));
    } catch (e) { /* storage unavailable: progress simply isn't remembered */ }
  }
  PV.progress = (id, total) => {
    const s = loadSeen()[id] || [];
    return total ? Math.min(1, s.length / total) : 0;
  };

  function meter(n, of = 5) {
    const m = h("span", { class: "meter", "aria-label": `${n} of ${of}` });
    for (let i = 0; i < of; i++) m.appendChild(h("i", { class: i < n ? "on" : "" }));
    return m;
  }
  PV.meter = meter;

  function buildSlides(p) {
    const cover = { cover: true };
    const end = { end: true };
    return [cover, ...p.slides, end];
  }

  function coverSlide(p) {
    const tr = PV.tracks[p.track];
    const copy = h("div", { class: "copy" },
      h("div", { class: "kicker" }, `${tr.name} · ${p.era === "frontier" ? "Frontier " + p.year : p.era === "primer" ? "Primer" : "Foundation " + p.year}`),
      h("h2", null, p.title),
      h("div", { class: "meta" },
        p.authors ? h("span", null, p.authors) : null,
        p.venue ? h("span", null, p.venue) : null,
        p.url ? h("a", { href: p.url, target: "_blank", rel: "noopener" }, p.arxiv ? `arXiv ${p.arxiv} ↗` : "Read the original ↗") : null),
      h("p", { class: "big" }, p.oneLiner),
      p.signals ? h("div", { class: "signals" },
        h("div", { class: "signal" }, h("span", null, "Impact"), meter(p.signals.impact)),
        h("div", { class: "signal" }, h("span", null, "New idea"), meter(p.signals.novelty)),
        h("div", { class: "signal" }, h("span", null, "Momentum"), meter(p.signals.momentum))) : null,
      p.why ? h("p", { class: "why", html: `<b>Why it's on the list:</b> ${p.why}` }) : null,
      h("p", { class: "why" }, "Use ← → or swipe to move through the slides."));
    return { copy, viz: p.hero || { type: "orbit" } };
  }

  function endSlide(p) {
    const quiz = h("div", { class: "quiz" });
    (p.quiz || []).forEach((q, qi) => {
      const why = h("div", { class: "q-why", hidden: true, html: q.why || "" });
      const opts = h("div", { class: "q-opts" });
      q.options.forEach((opt, oi) => {
        const b = h("button", { type: "button" }, opt);
        b.addEventListener("click", () => {
          opts.querySelectorAll("button").forEach((x, xi) => {
            x.classList.remove("right", "wrong");
            if (xi === q.a) x.classList.add("right");
          });
          if (oi !== q.a) b.classList.add("wrong");
          why.hidden = false;
        });
        opts.appendChild(b);
      });
      quiz.appendChild(h("div", { class: "q" }, h("b", null, `${qi + 1}. ${q.q}`), opts, why));
    });
    const left = h("div", { class: "copy" },
      h("div", { class: "kicker" }, "Check yourself"),
      h("h2", null, "Did it click?"),
      quiz);
    const right = h("div", { class: "copy" },
      h("div", { class: "kicker" }, "Words you now know"),
      h("div", { class: "terms" }, (p.terms || []).map(([t, d]) => h("div", null, h("b", null, t), h("span", null, " · " + d)))),
      h("div", { class: "kicker", style: { marginTop: "10px" } }, "Read next"),
      h("div", { class: "next-reads" }, (p.next || []).map((id) => {
        const np = PV.papers.find((x) => x.id === id);
        if (!np) return null;
        return h("button", { class: "btn", type: "button", style: { "--c": PV.tracks[np.track].color }, onclick: () => PV.openDeck(np.id, 0) },
          h("span", { style: { color: PV.tracks[np.track].color } }, "●"), np.short || np.title);
      })),
      p.url ? h("p", { class: "why" }, "Want the source? ", h("a", { href: p.url, target: "_blank", rel: "noopener" }, "Open the original paper ↗")) : null);
    return { copy: left, side: right };
  }

  function render(dir) {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    stage.innerHTML = "";
    const s = slides[idx];
    const color = PV.tracks[paper.track].color;
    const el = h("section", { class: "slide" + (dir < 0 ? " back" : ""), "aria-roledescription": "slide", "aria-label": `${idx + 1} of ${slides.length}` });
    let vizSpec = null;
    if (s.cover) {
      const c = coverSlide(paper);
      el.classList.add("cover");
      el.appendChild(c.copy);
      vizSpec = c.viz;
    } else if (s.end) {
      const e = endSlide(paper);
      el.appendChild(e.copy);
      el.appendChild(e.side);
    } else {
      const copy = h("div", { class: "copy" });
      if (s.k) copy.appendChild(h("div", { class: "kicker" }, s.k));
      if (s.t) copy.appendChild(h("h2", null, s.t));
      if (s.h) copy.appendChild(h("div", { class: "copy", style: { gap: "12px" }, html: s.h }));
      if (s.eq) copy.appendChild(h("div", { class: "eq", html: s.eq }));
      if (s.analogy) copy.appendChild(h("div", { class: "analogy", html: s.analogy }));
      el.appendChild(copy);
      vizSpec = s.v || null;
      if (!vizSpec) el.classList.add("text-only");
      if (s.layout === "full") el.classList.add("full");
    }
    if (vizSpec) {
      const vz = h("div", { class: "viz" });
      el.appendChild(vz);
      stage.appendChild(el);
      const fn = PV.viz[vizSpec.type];
      if (fn) {
        try { cleanup = fn(vz, vizSpec, { color, paper }) || null; }
        catch (err) { console.error("viz failed", vizSpec.type, err); vz.appendChild(h("div", { class: "galaxy-fallback" }, "This animation could not start in your browser.")); }
      } else {
        console.warn("missing viz", vizSpec.type);
      }
    } else {
      stage.appendChild(el);
    }
    // chrome
    countEl.textContent = `${String(idx + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === slides.length - 1;
    const seen = loadSeen()[paper.id] || [];
    [...dotsEl.children].forEach((d, i) => {
      d.setAttribute("aria-current", String(i === idx));
      d.classList.toggle("seen", seen.includes(i));
    });
    markSeen(paper.id, idx);
    try { history.replaceState(null, "", `#${paper.id}.${idx + 1}`); } catch (e) { /* sandboxed */ }
  }

  function go(i) {
    if (!paper) return;
    const n = PV.clamp(i, 0, slides.length - 1);
    if (n === idx) return;
    const dir = n > idx ? 1 : -1;
    idx = n;
    render(dir);
  }

  PV.openDeck = function (id, at = 0) {
    const p = PV.papers.find((x) => x.id === id);
    if (!p) return;
    paper = p;
    slides = buildSlides(p);
    idx = PV.clamp(at, 0, slides.length - 1);
    const color = PV.tracks[p.track].color;
    deckEl.style.setProperty("--c", color);
    titleEl.innerHTML = "";
    titleEl.append(h("span", null, PV.tracks[p.track].name), h("b", null, p.title));
    dotsEl.innerHTML = "";
    slides.forEach((s, i) => dotsEl.appendChild(h("button", { type: "button", "aria-label": `Go to slide ${i + 1}`, onclick: () => go(i) })));
    deckEl.hidden = false;
    document.body.style.overflow = "hidden";
    PV.galaxyPause && PV.galaxyPause(true);
    render(0);
    deckEl.querySelector(".close").focus({ preventScroll: true });
  };

  PV.closeDeck = function () {
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    stage.innerHTML = "";
    deckEl.hidden = true;
    document.body.style.overflow = "";
    PV.galaxyPause && PV.galaxyPause(false);
    try { history.replaceState(null, "", "#"); } catch (e) {}
    const card = document.querySelector(`[data-paper="${paper && paper.id}"]`);
    paper = null;
    PV.refreshProgress && PV.refreshProgress();
    if (card) card.focus({ preventScroll: false });
  };

  PV.initDeck = function () {
    deckEl = document.getElementById("deck");
    stage = deckEl.querySelector(".deck-stage");
    dotsEl = deckEl.querySelector(".dots");
    countEl = deckEl.querySelector(".deck-count");
    titleEl = deckEl.querySelector(".deck-title");
    prevBtn = deckEl.querySelector(".prev");
    nextBtn = deckEl.querySelector(".next");
    prevBtn.addEventListener("click", () => go(idx - 1));
    nextBtn.addEventListener("click", () => go(idx + 1));
    deckEl.querySelector(".close").addEventListener("click", PV.closeDeck);
    document.addEventListener("keydown", (e) => {
      if (deckEl.hidden) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(idx + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(idx - 1); }
      else if (e.key === "Escape") PV.closeDeck();
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(slides.length - 1);
    });
    // swipe (ignored when the gesture starts on a control or canvas)
    let sx = null, sy = null;
    stage.addEventListener("touchstart", (e) => {
      const t = e.target;
      if (t.closest("canvas, input, .viz-controls, .chat")) { sx = null; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(idx + (dx < 0 ? 1 : -1));
      sx = null;
    });
  };
})();
