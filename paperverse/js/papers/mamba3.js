/* Mamba-3: Improved Sequence Modeling using State Space Principles (Lahoti et al., 2026) */
(function () {
  const { h, C, FONT } = PV;

  /* Parity with a rotating state vs a real, decaying one. */
  PV.defineViz("parity", (root, o, api) => {
    let bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0];
    let t0 = 0;
    const cap = PV.caption(root, "");
    const bitRects = [];
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      t0 += dt;
      const per = 0.9, n = bits.length;
      const k = Math.min(n, Math.floor(t0 / per));
      if (t0 > per * (n + 4)) t0 = 0;
      const frac = Math.min(1, (t0 - k * per) / (per * 0.6));
      // bit row (clickable)
      const bw = Math.min(40, (W - 40) / n - 6), top = 58;
      bitRects.length = 0;
      bits.forEach((b, i) => {
        const x = 20 + i * (bw + 6);
        bitRects.push([x, top, bw, 34, i]);
        PV.box(ctx, x, top, bw, 34, { r: 6, fill: i < k ? PV.alpha(b ? api.color : C.ink3, 0.35) : C.panel, stroke: i === k ? C.glow : C.line2 });
        PV.text(ctx, String(b), x + bw / 2, top + 17, { size: 16, weight: 700, align: "center", font: FONT.mono });
      });
      PV.text(ctx, "click bits to flip them", 20, top + 50, { size: 10.5, color: C.ink3, font: FONT.mono });
      // count ones processed so far (with smooth animation of the current step)
      let ones = 0; for (let i = 0; i < k; i++) ones += bits[i];
      const curOne = k < n && bits[k] ? frac : 0;
      const R = Math.min(W * 0.18, (H - top - 190) / 2);
      const cy = Math.max(top + 60 + (H - top - 170) / 2, top + 100 + R);
      const lab = (str, x, y, o2) => { const f = PV.fit(ctx, str, W * 0.44, o2.size, { weight: o2.weight }); PV.text(ctx, f.text, x, y, { ...o2, size: f.size, align: "center" }); };
      // panel A: complex / rotation
      const ax = W * 0.27;
      ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.arc(ax, cy, R, 0, 7); ctx.stroke();
      const ang = -Math.PI / 2 + Math.PI * (ones + curOne);
      PV.arrow(ctx, ax, cy, ax + Math.cos(ang) * R, cy + Math.sin(ang) * R, { color: api.color, lw: 3.5, head: 12 });
      lab("Mamba-3: complex state", ax, cy - R - 24, { size: 13, weight: 700, color: api.color });
      lab("each 1 rotates the state by 180°", ax, cy + R + 22, { size: 11.5, color: C.ink2 });
      const up = Math.sin(ang) < 0;
      if (k === n) lab(`points ${up ? "up → even" : "down → odd"} ✓`, ax, cy + R + 42, { size: 13, weight: 700, color: C.good });
      // panel B: real decay
      const bx = W * 0.73;
      let hreal = 0; for (let i = 0; i < k; i++) hreal = 0.6 * hreal + bits[i];
      const len = Math.min(1, hreal / 2.5) * R;
      ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(bx, cy - R); ctx.lineTo(bx, cy + R); ctx.stroke();
      PV.arrow(ctx, bx, cy, bx, cy - Math.max(4, len), { color: C.ink3, lw: 3.5, head: 12 });
      lab("Real-valued state (Mamba-2)", bx, cy - R - 24, { size: 13, weight: 700, color: C.ink2 });
      lab("can only grow or shrink, never flip", bx, cy + R + 22, { size: 11.5, color: C.ink2 });
      if (k === n) lab("parity can't be read off ✗", bx, cy + R + 42, { size: 13, weight: 700, color: C.bad });
      cap.set(`<b>Task: is the number of 1s even or odd?</b> Processed ${k}/${n} bits · ones so far: ${ones}`);
    }, {
      onDown: (x, y) => {
        for (const [bx, by, bw, bh, i] of bitRects) if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) { bits[i] = 1 - bits[i]; t0 = 0; }
      },
    });
    const ctl = PV.controls(root);
    ctl.button("🎲 Random bits", () => { bits = bits.map(() => (Math.random() < 0.5 ? 1 : 0)); t0 = 0; });
    ctl.button("↻ Replay", () => (t0 = 0));
    return () => st.stop();
  });

  /* Euler vs trapezoid: approximating the area under the input between two time steps. */
  PV.defineViz("trapezoid", (root, o, api) => {
    let mode = "trap";
    const f = (x) => 1.2 + Math.sin(x * 1.3) * 0.8 + 0.3 * Math.sin(x * 3.1);
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H) => {
      const L = 40, R = 20, T = 60, B = 110, x0 = 0, x1 = 6, steps = 6;
      const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
      const Y = (y) => H - B - (y / 2.6) * (H - T - B);
      let err = 0;
      for (let i = 0; i < steps; i++) {
        const a = x0 + (i * (x1 - x0)) / steps, b = a + (x1 - x0) / steps;
        let exact = 0; for (let j = 0; j < 100; j++) exact += f(a + ((j + 0.5) * (b - a)) / 100) * ((b - a) / 100);
        let approx;
        ctx.beginPath();
        if (mode === "euler") {
          approx = f(b) * (b - a);
          ctx.moveTo(X(a), Y(0)); ctx.lineTo(X(a), Y(f(b))); ctx.lineTo(X(b), Y(f(b))); ctx.lineTo(X(b), Y(0));
        } else {
          approx = ((f(a) + f(b)) / 2) * (b - a);
          ctx.moveTo(X(a), Y(0)); ctx.lineTo(X(a), Y(f(a))); ctx.lineTo(X(b), Y(f(b))); ctx.lineTo(X(b), Y(0));
        }
        ctx.closePath();
        ctx.fillStyle = PV.alpha(mode === "euler" ? C.ink3 : api.color, 0.25);
        ctx.fill();
        ctx.strokeStyle = mode === "euler" ? C.ink3 : api.color; ctx.lineWidth = 1.5; ctx.stroke();
        err += Math.abs(approx - exact);
      }
      ctx.strokeStyle = C.glow; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const x = x0 + ((x1 - x0) * i) / 200; i ? ctx.lineTo(X(x), Y(f(x))) : ctx.moveTo(X(x), Y(f(x))); }
      ctx.stroke();
      PV.text(ctx, "input signal over time", X(0.1), Y(2.45), { size: 11.5, color: C.glow });
      PV.text(ctx, `total approximation error: ${err.toFixed(3)}`, L, H - B + 24, { size: 13, weight: 700, color: mode === "euler" ? C.bad : C.good });
      cap.set(mode === "euler"
        ? "<b>Euler (Mamba-1/2):</b> each interval uses only its right-hand value, like a staircase."
        : "<b>Trapezoid (Mamba-3):</b> blends both ends of each interval, i.e. the current <i>and previous</i> token. Much closer to the true curve.");
    });
    const ctl = PV.controls(root);
    ctl.toggle([["trap", "Trapezoid (Mamba-3)"], ["euler", "Euler (Mamba-2)"]], "trap", (v) => (mode = v));
    return () => st.stop();
  });

  PV.register({
    id: "mamba3",
    short: "Mamba-3",
    title: "Mamba-3: Improved Sequence Modeling using State Space Principles",
    year: 2026, date: "2026-03",
    track: "arch", era: "frontier",
    authors: "Lahoti, Li, Chen, Wang, Bick, Kolter, Dao, Gu (CMU, Princeton, Together AI, Cartesia AI)",
    arxiv: "2603.15569", url: "https://arxiv.org/abs/2603.15569",
    oneLiner: "Three ideas from classic signal processing (a better discretisation, complex-valued states, multi-input/multi-output) make linear models smarter and put idle GPU compute to work.",
    why: "Designed “inference-first” for an era of agents and long reasoning. It beats Gated DeltaNet and Transformers at 1.5B and solves state-tracking tasks earlier linear models can't.",
    signals: { impact: 4, novelty: 5, momentum: 5 },
    tags: ["SSM", "state tracking", "complex numbers", "MIMO", "inference-first"],
    builds: ["mamba", "attention"],
    slides: [
      {
        k: "Why now",
        t: "Inference is where compute goes now.",
        h: `<p>Reasoning models and agents generate huge numbers of tokens: long chains of thought, many parallel attempts, tool loops that run for hours. The cost of <b>generating</b> tokens now dominates.</p>
            <p>Linear models like Mamba-2 and Gated DeltaNet have constant memory per token, which is great for generation. But the authors point out two problems:</p>
            <ul><li><b>Capability gaps:</b> they fail simple <b>state-tracking</b> tasks, like whether a bit string has an even number of 1s.</li>
            <li><b>Wasted hardware:</b> decoding does about <b>2.5 FLOPs per byte</b> of memory read, while an H100 can do about <b>295</b>. The maths units sit mostly idle.</li></ul>`,
        v: { type: "bars",
          title: "Arithmetic intensity: compute per byte of memory traffic",
          subtitle: "FLOPs per byte · from the paper's Table 2 discussion",
          items: [
            { label: "Mamba decode step (SISO)", value: 2.5 },
            { label: "H100 capability (bf16 matmul)", value: 295, hi: true },
          ],
          fmt: (v) => String(v) } },
      {
        k: "Idea 1 · Better discretisation",
        t: "Look at the previous token too: the trapezoid rule.",
        h: `<p>SSMs are defined in continuous time and have to be converted (“discretised”) to work on tokens. The authors show that Mamba-1 and -2 used a rule that's equivalent to <b>Euler's method</b>, which approximates each interval using only the newest input.</p>
            <p>Mamba-3 uses a generalised <b>trapezoidal rule</b>: a learned, data-dependent blend of the current and previous token's input. That's more accurate, and it acts like a tiny built-in convolution, so Mamba-3 can drop the separate short-convolution layer that most linear models needed.</p>`,
        eq: `h_t = α_t·h_{t−1} + β_t·B_{t−1}·x_{t−1} + γ_t·B_t·x_t<small>Mamba-2 is the special case β = 0 (only the newest input).</small>`,
        v: { type: "trapezoid" },
      },
      {
        k: "Idea 2 · Complex state",
        t: "Let the memory rotate, not just fade.",
        h: `<p>Mamba-2's state can only be <b>scaled</b> by a positive number each step: it grows or decays. It can never <b>flip</b>. Tracking parity (even or odd number of 1s) needs exactly that: “each 1 flips my answer.”</p>
            <p>If the state is <b>complex-valued</b>, each step can also <b>rotate</b> it. Rotate 180° per 1 and parity is trivial. The authors prove this equals applying a <b>data-dependent rotary embedding (RoPE)</b>, the same trick Transformers use for positions, so it's cheap to compute.</p>
            <p>Flip bits on the right and watch the rotating arrow track parity while the real one can't.</p>`,
        v: { type: "parity" },
      },
      {
        k: "Idea 3 · MIMO",
        t: "Do 4× the maths in the same time.",
        h: `<p>Since decoding is <b>memory-bound</b> (waiting to read the state), extra arithmetic is almost free, as long as memory traffic doesn't grow.</p>
            <p>Mamba-3 switches from single-input single-output (<b>SISO</b>) to multi-input multi-output (<b>MIMO</b>): the state update becomes a small matrix multiplication (rank R) instead of an outer product. With R = 4 it does up to <b>4× more FLOPs per decode step with similar wall-clock latency</b>, and the model gets better.</p>`,
        analogy: "A delivery van making the same trip to the warehouse, but now carrying four parcels instead of one. The drive (memory access) is the slow part, so the extra parcels are nearly free.",
      },
      {
        k: "Results",
        t: "Best linear model at 1.5B, with half the state.",
        h: `<p>All models trained on 100B tokens of FineWeb-Edu with identical recipes. At 1.5B parameters, average downstream accuracy:</p>
            <ul><li>Transformer 55.4 · Mamba-2 55.7 · Gated DeltaNet 55.8</li>
            <li><b>Mamba-3 (SISO) 56.4</b> · <b>Mamba-3 (MIMO) 57.6</b></li></ul>
            <p>Mamba-3 with state size 64 matches Mamba-2's perplexity at state size 128, which is the <b>same quality at half the state</b>. On arithmetic state-tracking tasks it's near-perfect, while Mamba-2 is at chance.</p>`,
        v: { type: "bars",
          title: "Gain over a Transformer, 1.5B scale",
          subtitle: "points of average downstream accuracy · paper's Table 3",
          items: [
            { label: "Mamba-2", value: 0.3 },
            { label: "Gated DeltaNet", value: 0.4 },
            { label: "Mamba-3 SISO", value: 1.0, hi: true },
            { label: "Mamba-3 MIMO (R=4)", value: 2.2, hi: true },
          ],
          fmt: (v) => "+" + v.toFixed(1) } },
      {
        k: "Why it matters",
        t: "Classic control theory is paying off again.",
        h: `<p>Mamba-3's improvements come from treating the layer as a <b>signal-processing system</b>. These ideas weren't obvious from the “linear attention” view of the same layers. The authors release fast training and inference kernels.</p>
            <p>These layers go into <b>hybrid</b> models (mostly linear layers plus a few attention layers) that are now shipping in production, like Nemotron 3 Super. Two months later, <b>Gated DeltaNet-2</b> compared itself directly against Mamba-3, and the race between the SSM view and the delta-rule view is one of the liveliest in architecture research.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "Why can't a real, positive-decay state track parity?", options: ["It's too small", "It can only grow or shrink, never flip direction", "It forgets instantly", "Parity needs attention"], a: 1, why: "Parity needs a “flip” for every 1. Complex states can rotate by 180°, while real positive scaling can't." },
      { q: "Why is MIMO almost free at decode time?", options: ["It uses fewer parameters", "Decoding is memory-bound, so extra arithmetic hides behind memory reads", "It skips tokens", "It runs on the CPU"], a: 1, why: "Arithmetic intensity rises without increasing the state (memory) that must be read." },
    ],
    terms: [
      ["State tracking", "Keeping an exact running summary (e.g. parity, position in a game) across a sequence."],
      ["Discretisation", "Converting a continuous-time system into step-by-step updates."],
      ["Arithmetic intensity", "FLOPs performed per byte of memory moved."],
      ["MIMO", "Multi-input multi-output: a matrix-valued state update that uses more compute per memory read."],
      ["RoPE", "Rotary position embedding: rotating vectors by position-dependent angles."],
    ],
    next: ["gdn2", "nemotron", "mamba"],
  });
})();
