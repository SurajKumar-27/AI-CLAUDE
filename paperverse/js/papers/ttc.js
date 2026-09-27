/* Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters (Snell et al., 2024) */
(function () {
  const { h, C, FONT } = PV;

  /* Three ways to spend thinking budget: best-of-N, beam search with a verifier, sequential revisions. */
  PV.defineViz("ttcsearch", (root, o, api) => {
    let mode = "bon", N = 8, seed = 1;
    const depth = 4;
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      const r = PV.rng(seed * 101 + N);
      const L = 60, R = 60, T = 64, B = 120;
      const rootY = T + (H - T - B) / 2;
      const X = (d) => L + (d / depth) * (W - L - R);
      PV.box(ctx, L - 44, rootY - 14, 50, 28, { r: 7, fill: C.panel2, stroke: C.line2 });
      PV.text(ctx, "Q", L - 19, rootY, { size: 13, weight: 700, align: "center" });
      const reveal = (t * 1.2) % (depth + 2.5);
      const dot = (x, y, s, on, pruned) => {
        ctx.fillStyle = pruned ? PV.alpha(C.ink3, 0.3) : PV.mix(C.bad, C.good, s);
        ctx.beginPath(); ctx.arc(x, y, on ? 7 : 5, 0, 7); ctx.fill();
        if (on) { ctx.strokeStyle = C.glow; ctx.lineWidth = 2; ctx.stroke(); }
      };
      if (mode === "bon") {
        const ys = Array.from({ length: N }, (_, i) => T + ((i + 0.5) * (H - T - B)) / N);
        const finals = ys.map(() => r());
        const best = finals.indexOf(Math.max(...finals));
        ys.forEach((y, i) => {
          let py = rootY;
          for (let d = 1; d <= depth; d++) {
            if (d > reveal) break;
            ctx.strokeStyle = i === best && reveal > depth + 0.5 ? C.glow : PV.alpha(api.color, 0.35);
            ctx.lineWidth = i === best && reveal > depth + 0.5 ? 2.5 : 1.2;
            ctx.beginPath(); ctx.moveTo(X(d - 1), py); ctx.lineTo(X(d), y); ctx.stroke();
            py = y;
          }
          if (reveal > depth) dot(X(depth), y, finals[i], i === best && reveal > depth + 0.5);
        });
        cap.set(`<b>Best-of-N:</b> write ${N} complete answers independently, let a verifier score each finished answer, keep the best. Simple, parallel, but spends as much on bad starts as on good ones.`);
      } else if (mode === "beam") {
        const beam = Math.max(2, Math.round(Math.sqrt(N)));
        let frontier = [{ y: rootY, s: 0.5 }];
        for (let d = 1; d <= depth; d++) {
          const kids = [];
          frontier.forEach((p, pi) => {
            for (let c = 0; c < beam; c++) {
              const s = PV.clamp(p.s + (r() - 0.45) * 0.5, 0, 1);
              kids.push({ py: p.y, s, pi });
            }
          });
          const n = kids.length;
          kids.forEach((k2, i) => (k2.y = T + ((i + 0.5) * (H - T - B)) / n));
          const keep = new Set(kids.map((k2, i) => [k2.s, i]).sort((a, b) => b[0] - a[0]).slice(0, beam).map((x) => x[1]));
          if (d <= reveal) {
            kids.forEach((k2, i) => {
              ctx.strokeStyle = keep.has(i) ? PV.alpha(api.color, 0.8) : PV.alpha(C.ink3, 0.18);
              ctx.lineWidth = keep.has(i) ? 1.8 : 1;
              ctx.beginPath(); ctx.moveTo(X(d - 1), k2.py); ctx.lineTo(X(d), k2.y); ctx.stroke();
              dot(X(d), k2.y, k2.s, d === depth && keep.has(i) && i === [...keep][0], !keep.has(i));
            });
          }
          frontier = kids.filter((_, i) => keep.has(i));
        }
        cap.set(`<b>Beam search with a process verifier:</b> after each reasoning <i>step</i>, a process reward model scores the partial solutions and only the best ${beam} are expanded. Budget goes to promising paths.`);
      } else {
        const n = Math.min(N, 8);
        let s = 0.3 + r() * 0.1;
        for (let i = 0; i < n; i++) {
          const x = L + (i / Math.max(1, n - 1)) * (W - L - R) * 0.95;
          if (i / n * (depth + 2) > reveal) break;
          s = PV.clamp(s + (r() - 0.25) * 0.22, 0, 1);
          PV.box(ctx, x - 24, rootY - 20, 48, 40, { r: 8, fill: PV.mix(C.bad, C.good, s), stroke: C.line2 });
          PV.text(ctx, `v${i + 1}`, x, rootY, { size: 12, weight: 700, align: "center", color: "#0b0f18" });
          if (i < n - 1) PV.arrow(ctx, x + 26, rootY, x + (W - L - R) * 0.95 / Math.max(1, n - 1) - 28, rootY, { color: C.ink3 });
        }
        PV.text(ctx, "each revision reads the previous attempt and fixes it", L, rootY + 50, { size: 12, color: C.ink2 });
        cap.set(`<b>Sequential revisions:</b> the model rewrites its own answer ${n} times, each time conditioning on earlier attempts. Great when the first try is nearly right.`);
      }
      PV.text(ctx, "colour = verifier score (red low → green high)", L - 44, H - B + 26, { size: 11, color: C.ink3, font: FONT.mono });
    });
    const ctl = PV.controls(root);
    ctl.toggle([["bon", "Best-of-N"], ["beam", "Beam + verifier"], ["rev", "Revisions"]], mode, (v) => (mode = v));
    ctl.slider("Budget N", { min: 4, max: 16, value: N, onInput: (v) => (N = v) });
    ctl.button("🎲 New question", () => seed++);
    PV.note(root, "illustrative");
    return () => st.stop();
  });

  PV.register({
    id: "ttc",
    short: "Test-time compute",
    title: "Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters",
    year: 2024, date: "2024-08",
    track: "reason", era: "foundation",
    authors: "Snell, Lee, Xu, Kumar (UC Berkeley, Google DeepMind)",
    venue: "ICLR 2025",
    arxiv: "2408.03314", url: "https://arxiv.org/abs/2408.03314",
    oneLiner: "Letting a model think longer at answer time, with the right strategy per question, can beat using a model 14× bigger.",
    why: "It gave the first careful map of “inference scaling”, the idea behind reasoning models and the “think harder” settings in today's products.",
    signals: { impact: 5, novelty: 4, momentum: 5 },
    tags: ["inference", "verifier", "PRM", "beam search", "revisions", "scaling"],
    builds: ["cot", "instructgpt"],
    slides: [
      {
        k: "The question",
        t: "Train a bigger model, or let a smaller one think longer?",
        h: `<p>Most progress came from <b>training-time</b> scaling: more parameters, more data. But people solve hard problems by spending more time on them. Can models trade <b>inference compute</b> for accuracy the same way?</p>
            <p>And if so, what's the best way to spend a fixed thinking budget: many attempts in parallel, careful step-by-step search, or repeated self-correction?</p>`,
        analogy: "A student in an exam with extra time can write several drafts and pick the best, check each step as they go, or keep revising one answer. Which is best depends on how hard the question is.",
      },
      {
        k: "Two knobs",
        t: "Search against a verifier, or refine the answer.",
        h: `<p><b>1 · Search with a verifier.</b> Generate candidates and let a <b>process reward model</b> (PRM), trained to score each reasoning step, pick or prune them. Options: best-of-N, beam search, lookahead search.</p>
            <p><b>2 · Refine the proposal.</b> Fine-tune the model to <b>revise</b> its own previous attempts, then run revisions one after another.</p>
            <p>Switch strategies on the right and change the budget.</p>`,
        v: { type: "ttcsearch" },
      },
      {
        k: "The key finding",
        t: "The best strategy depends on how hard the question is.",
        h: `<p>Easy questions: the model's first instinct is usually close, so <b>sequential revisions</b> win. Hard questions: it needs to explore different approaches, so <b>parallel sampling or search</b> wins. Beam search can even <b>hurt</b> on easy questions by over-optimising the verifier.</p>
            <p>A <b>compute-optimal</b> policy estimates difficulty first, then allocates the budget. It matched best-of-N's accuracy using about <b>4× less</b> compute.</p>`,
        v: { type: "lines",
          title: "Accuracy vs thinking budget (MATH)",
          subtitle: "shape of the paper's findings: compute-optimal needs ~4× less budget",
          x: { label: "generation budget (samples)", min: 1, max: 256, log: true, ticks: [1, 4, 16, 64, 256] },
          y: { label: "accuracy (%)", min: 10, max: 45, ticks: [10, 20, 30, 40] },
          series: [
            { name: "best-of-N", color: C.ink3, points: [[1, 14], [4, 21], [16, 28], [64, 33], [256, 36]] },
            { name: "compute-optimal", color: C.reason, points: [[1, 15], [4, 28], [16, 34], [64, 38], [256, 40]] },
          ],
          marks: [{ x: 16, y: 28, text: "same accuracy, 4× less budget →", color: C.glow, dx: -8, dy: 18, anchor: "end" }],
          note: "illustrative shape" } },
      {
        k: "The headline",
        t: "Small model + thinking can beat a 14× bigger model, sometimes.",
        h: `<p>In a <b>FLOPs-matched</b> comparison (same total compute, spent either on a bigger model or on more inference), test-time compute on a smaller model <b>outperformed a 14× larger model</b> on questions where the small model already had some chance of success.</p>
            <p>But on the <b>hardest</b> questions, where the small model basically never succeeds, more thinking didn't help, and pre-training a bigger model was the better investment. Thinking can amplify ability but can't create it from nothing.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "q", label: "New question", x: 0.12, y: 0.5 },
            { id: "est", label: "Estimate difficulty", sub: "from the verifier's scores", x: 0.42, y: 0.5, maxW: 0.34 },
            { id: "easy", label: "Easy", sub: "→ sequential revisions", x: 0.8, y: 0.14 },
            { id: "med", label: "Medium / hard", sub: "→ parallel search + verifier", x: 0.8, y: 0.5, maxW: 0.34 },
            { id: "hard", label: "Hardest", sub: "→ a bigger model is better", x: 0.8, y: 0.86 },
          ],
          edges: [{ a: "q", b: "est" }, { a: "est", b: "easy" }, { a: "est", b: "med" }, { a: "est", b: "hard", dashed: true }],
          steps: [
            { on: ["q", "est"], edges: ["q>est"], text: "The compute-optimal policy first guesses how hard the question is." },
            { on: ["est", "easy"], edges: ["est>easy"], text: "Easy: the first attempt is nearly right, so spend the budget polishing it." },
            { on: ["est", "med"], edges: ["est>med"], text: "Harder: explore different approaches in parallel and let the verifier choose." },
            { on: ["est", "hard"], edges: ["est>hard"], text: "Hardest: extra thinking barely helps. The FLOPs are better spent on pre-training a larger model." },
          ] } },
      {
        k: "Why it matters",
        t: "Inference is the new scaling axis.",
        h: `<p>Released weeks before OpenAI's o1, this paper gave the research community a vocabulary and evidence for <b>test-time scaling</b>. Since then: reasoning models trained with RL to think longer (DeepSeek-R1), “reasoning effort” controls in APIs, and verifier-guided search for maths and code.</p>
            <p>It's also why 2026 architecture papers such as Mamba-3 and Nemotron 3 Super say they're designed <b>“inference-first”</b>: if models spend most of their compute thinking at answer time, generation speed becomes the priority.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What is a process reward model (PRM)?", options: ["A model that scores each reasoning step", "A model that writes the answer", "A tokenizer", "A retrieval system"], a: 0, why: "A PRM scores partial solutions step by step, which enables search like beam search." },
      { q: "When did extra test-time compute NOT help much?", options: ["Easy questions", "Medium questions", "The hardest questions, where the small model almost never succeeds", "Never"], a: 2, why: "Test-time compute amplifies existing ability. For the hardest questions, a bigger pre-trained model wins." },
    ],
    terms: [
      ["Test-time compute", "Computation spent when answering, e.g. sampling many solutions or thinking longer."],
      ["Best-of-N", "Sample N answers and pick the best one by some score."],
      ["Beam search", "Keep the top few partial solutions at each step and expand only those."],
      ["Process reward model", "A verifier that scores intermediate reasoning steps."],
      ["Compute-optimal", "Allocating a fixed budget in the way that maximises accuracy."],
    ],
    next: ["r1", "cot", "mamba3"],
  });
})();
