/* RRSI: Regularized Recursive Self-Improvement of Agent Harnesses (Xia et al., 2026) */
(function () {
  const { h, C, FONT } = PV;

  /* Simulated harness evolution: evolve-set score vs held-out score, unregularised vs regularised. */
  PV.defineViz("evolve", (root, o, api) => {
    const T = 20;
    let show = "both", t0 = 0;
    const budget = (t) => Math.ceil(1 + (6 - 1) * 0.5 * (1 + Math.cos((Math.PI * t) / T)));
    const r = PV.rng(9);
    const noise = Array.from({ length: T + 1 }, () => r() - 0.5);
    // illustrative trajectories shaped after the paper's Figure 1
    const unregEvolve = Array.from({ length: T + 1 }, (_, t) => 40 + 22 * (1 - Math.exp(-t / 5)) + noise[t] * 2);
    const unregHeld = Array.from({ length: T + 1 }, (_, t) => 40 + 4 * Math.sin(Math.min(t, 8) / 8 * Math.PI / 2) - Math.max(0, t - 8) * 0.55 + noise[(t + 3) % T] * 1.2);
    const rrsiEvolve = Array.from({ length: T + 1 }, (_, t) => 40 + 14 * (1 - Math.exp(-t / 6)) + noise[(t + 5) % T] * 1.4);
    const rrsiHeld = Array.from({ length: T + 1 }, (_, t) => 40 + 4.7 * (1 - Math.exp(-t / 6)) + noise[(t + 7) % T] * 0.6);
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      t0 += dt;
      const upto = Math.min(T, Math.floor(t0 * 2.2));
      if (t0 > T / 2.2 + 3) t0 = 0;
      // phones: legend moves under the plot so the plot keeps the full width
      const narrow = W < 520;
      const L = 44, R = narrow ? 50 : Math.min(190, W * 0.34), top = narrow ? 24 : 88, bot = narrow ? 240 : 170;
      const pw = W - L - R, ph = H - top - bot;
      const X = (i) => L + (i / T) * pw, Y = (v) => top + (1 - (v - 32) / 34) * ph;
      [35, 45, 55, 65].forEach((v) => {
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + pw, Y(v)); ctx.stroke();
        PV.text(ctx, String(v), L - 8, Y(v), { size: 10.5, align: "right", font: FONT.mono, color: C.ink3 });
      });
      ctx.strokeStyle = C.ink3; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(L, Y(40)); ctx.lineTo(L + pw, Y(40)); ctx.stroke(); ctx.setLineDash([]);
      PV.text(ctx, "start", L + pw + 6, Y(40), { size: 10.5, color: C.ink3 });
      const line = (arr, color, dash, label) => {
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash(dash ? [6, 5] : []);
        ctx.beginPath();
        for (let i = 0; i <= upto; i++) i ? ctx.lineTo(X(i), Y(arr[i])) : ctx.moveTo(X(i), Y(arr[i]));
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(X(upto), Y(arr[upto]), 3.5, 0, 7); ctx.fill();
      };
      const legend = [];
      if (show !== "rrsi") { line(unregEvolve, C.ink2, true); line(unregHeld, C.bad, false); legend.push([C.ink2, true, "unregularised · evolve set"], [C.bad, false, "unregularised · held-out"]); }
      if (show !== "unreg") { line(rrsiEvolve, api.color, true); line(rrsiHeld, C.good, false); legend.push([api.color, true, "RRSI · evolve set"], [C.good, false, "RRSI · held-out"]); }
      legend.forEach(([c, dash, s], i) => {
        const lx = narrow ? 14 + (i % 2) * ((W - 28) / 2) : L + pw + 10, ly = narrow ? top + ph + 40 + Math.floor(i / 2) * 18 : top + 6 + i * 18;
        ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.setLineDash(dash ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke(); ctx.setLineDash([]);
        PV.text(ctx, s, lx + 22, ly, { size: 10.5, color: c });
      });
      PV.text(ctx, "evolution round →", L + pw / 2, top + ph + 16, { size: 11, align: "center", color: C.ink3 });
      // edit budget schedule
      const by = top + ph + (narrow ? 96 : 40);
      PV.text(ctx, narrow ? "RRSI edit budget per round (cosine-annealed)" : "RRSI edit budget per round (cosine-annealed, like L0 sparsity)", narrow ? 14 : L, by, { size: 11, color: C.ink2 });
      for (let i = 0; i <= T; i++) {
        const b = budget(i), bh = b * 7;
        PV.box(ctx, X(i) - 5, by + 50 - bh, 10, bh, { r: 2, fill: i <= upto ? api.color : C.line2 });
      }
      cap.set("<b>Dashed:</b> score on the tasks the harness evolves against. <b>Solid:</b> score on unseen benchmarks. Unregularised evolution memorises; RRSI keeps changes that transfer.");
    });
    st.phoneHeight(560);
    const ctl = PV.controls(root);
    ctl.toggle([["both", "Compare"], ["unreg", "Unregularised"], ["rrsi", "RRSI"]], show, (v) => { show = v; t0 = 0; });
    ctl.button("↻ Replay", () => (t0 = 0));
    PV.note(root, "illustrative curves");
    return () => st.stop();
  });

  PV.register({
    id: "rrsi",
    short: "RRSI",
    title: "RRSI: Regularized Recursive Self-Improvement of Agent Harnesses",
    year: 2026, date: "2026-09",
    track: "reason", era: "frontier",
    authors: "Peng Xia, Rujun Han, Zifeng Wang, Yanfei Chen, Yufan Zhuang et al. (Google Cloud AI Research, Stanford, WashU, UNC)",
    arxiv: "2609.24972", url: "https://arxiv.org/abs/2609.24972",
    oneLiner: "Agents that rewrite their own harness improve on the tasks they practise on but often get worse elsewhere. Classic machine-learning regularisation (edit budgets, pruning, validation) fixes that.",
    why: "Published days ago and already on Hugging Face's trending papers list. “Recursive self-improvement” of agent harnesses is the hottest agent topic of 2026, and this paper asks the key question: does it generalise?",
    signals: { impact: 3, novelty: 5, momentum: 5 },
    tags: ["recursive self-improvement", "harness", "overfitting", "regularisation", "agents"],
    builds: ["skillopt", "react", "r1"],
    slides: [
      {
        k: "Background",
        t: "An agent's ability depends heavily on its harness.",
        h: `<p>The same frozen model can be a great or a terrible agent depending on its <b>harness</b>: the prompts, control flow, tools, memory and context management around it. It decides whether the agent reads the right file before editing, recovers from a failed command, or loses track of its work.</p>
            <p>Much recent progress in agent products came from <b>harness engineering</b>, done by hand: engineers read failed trajectories and tweak the scaffold. That's limited by how many trajectories a person can read.</p>
            <p>So in 2026 many groups <b>automated</b> it: an LLM proposes harness edits, runs them on benchmark tasks, and keeps the best. That's a practical form of <b>recursive self-improvement (RSI)</b>.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "h", label: "Harness H_t", sub: "prompts · tools · memory · control", x: 0.18, y: 0.2, maxW: 0.36 },
            { id: "run", label: "Run on evolve set", x: 0.62, y: 0.2 },
            { id: "prop", label: "Proposer LLM", sub: "suggests edits", x: 0.82, y: 0.62 },
            { id: "sel", label: "Selector", sub: "keep the best score", x: 0.4, y: 0.62 },
            { id: "next", label: "H_t+1", x: 0.14, y: 0.86 },
          ],
          edges: [{ a: "h", b: "run" }, { a: "run", b: "prop", label: "feedback" }, { a: "prop", b: "sel", label: "candidates" }, { a: "sel", b: "next" }],
          steps: [
            { on: ["h", "run"], edges: ["h>run"], text: "Run the current harness on a fixed set of tasks." },
            { on: ["run", "prop"], edges: ["run>prop"], text: "An LLM reads the trajectories and proposes harness edits." },
            { on: ["prop", "sel"], edges: ["prop>sel"], text: "Candidates are scored on the same task set…" },
            { on: ["sel", "next"], edges: ["sel>next"], text: "…and the highest scorer becomes the next harness. Repeat." },
          ] } },
      {
        k: "The problem",
        t: "Self-improvement that overfits.",
        h: `<p>Reusing the same finite task set round after round is <b>adaptive overfitting</b>. The authors identify three ways it goes wrong:</p>
            <ul><li><b>Benchmark-specific fitting:</b> edits that encode task names, answers or quirks of that benchmark.</li>
            <li><b>Noise chasing:</b> promoting a candidate that got lucky on noisy agent runs.</li>
            <li><b>Complexity accumulation:</b> piling on prompts, tools and steps that nudge the score up but cost tokens and don't transfer.</li></ul>
            <p>Result: big gains on the evolve set that <b>shrink or vanish</b> on other benchmarks. Several prior methods ended <b>below</b> the starting harness out of distribution.</p>`,
        v: { type: "evolve" },
      },
      {
        k: "The big idea",
        t: "Regularise the search, not the harness.",
        h: `<p>RRSI keeps every part of the harness editable but constrains <b>how</b> evolution moves, borrowing classic regularisers:</p>
            <p><b>Proposal side</b></p>
            <ul><li><b>L0-style edit budget:</b> cap how many independent edits one candidate can bundle, annealed on a cosine schedule from exploratory to sparse.</li>
            <li><b>Evidence-aware credit:</b> remember every tested hypothesis and its result, so rejected ideas aren't retried.</li>
            <li><b>Structured exploration:</b> when progress stalls within the noise band, spend some budget on untouched components.</li></ul>
            <p><b>Selection side</b></p>
            <ul><li><b>Leakage critic:</b> reject diffs that mention benchmark-specific names, values or answers.</li>
            <li><b>Pruner (L1-like):</b> remove changes that are too small, too costly or no longer useful.</li>
            <li><b>Complexity-aware acceptance (L2-like):</b> don't let the harness's cost footprint grow unchecked, and require gains beyond noise.</li></ul>`,
      },
      {
        k: "Results",
        t: "Gains that transfer, on fewer tokens.",
        h: `<p>Eight benchmarks across three domains (coding, agentic workspace tasks, engineering design). In each domain the harness evolves on one suite, then runs <b>unchanged</b> on held-out benchmarks such as SWE-bench Verified, JobBench, GDPval, APEX-Agents and Frontier-Eng.</p>
            <ul><li>Up to <b>+14.1</b> points on the split it evolves against.</li>
            <li>Improved <b>all six</b> held-out splits, by up to <b>+4.7</b> points out of distribution.</li>
            <li>Up to <b>22.9%</b> better than the average prior method on held-out environments.</li>
            <li>The final harness uses <b>30% fewer</b> policy tokens than unregularised evolution.</li></ul>`,
        v: { type: "bars",
          title: "RRSI's best reported gains",
          subtitle: "points over the starting harness · from the paper",
          items: [
            { label: "On the evolve split", value: 14.1, hi: true },
            { label: "Out of distribution (best)", value: 4.7, hi: true },
          ],
          max: 16, fmt: (v) => "+" + v } },
      {
        k: "Why it matters",
        t: "Self-improving AI needs the oldest lesson in ML.",
        h: `<p>September 2026 brought a burst of harness-level self-improvement papers: <b>NeoHorse-1</b> (routing-guided agentic post-training), <b>SoL-Pi</b> (auto-research loops that cut harness token costs by about a third), and RRSI. RRSI's contribution is to insist on <b>generalisation</b>: improvement you can measure on tasks you didn't optimise for.</p>
            <p>The deeper point: as AI systems start editing themselves, basic ML hygiene matters again. That means held-out evaluation, regularisation, and suspicion of gains that look too good. SkillOpt's validation gate and RRSI's critic are the same instinct.</p>
            <p>You've now gone from “what is a token” to the edge of current research.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What is the main risk RRSI addresses?", options: ["Slow models", "Harness evolution overfitting to the tasks it evolves on", "Running out of GPUs", "Tokenization errors"], a: 1, why: "Repeatedly selecting edits by score on the same finite task set rewards memorisation, noise and bloat." },
      { q: "Which classic idea does the cosine-annealed edit budget resemble?", options: ["Dropout", "An L0 sparsity constraint on how many edits a candidate may contain", "Batch normalisation", "Data augmentation"], a: 1, why: "It bounds the number of independent changes per update, shrinking over time." },
    ],
    terms: [
      ["Recursive self-improvement (RSI)", "A system using feedback about itself to improve the thing that shapes its future behaviour."],
      ["Harness evolution", "Automatically proposing and selecting edits to an agent's harness."],
      ["Evolve set", "The tasks a self-improvement loop optimises against."],
      ["Out of distribution (OOD)", "Tasks different from those used during optimisation."],
      ["Regularisation", "Constraints that favour simpler, more general solutions over memorisation."],
    ],
    next: ["skillopt", "react", "primer"],
  });
})();
