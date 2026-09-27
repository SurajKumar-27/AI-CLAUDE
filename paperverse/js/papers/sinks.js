/* The Spike, the Sparse and the Sink: Anatomy of Massive Activations and Attention Sinks (Sun, Canziani, LeCun, Zhu, 2026) */
(function () {
  const { h, C, FONT } = PV;

  /* A causal attention map for a "sink head", with and without an input-conditioned gate. */
  PV.defineViz("sinkmap", (root, o, api) => {
    const words = ["<s>", "The", "cat", "sat", "on", "the", "mat", "and", "then", "it", "fell", "asleep", "near", "the", "warm", "fire"];
    const n = words.length;
    let gated = false, hover = 11;
    const rowDist = (i) => {
      const logits = [];
      for (let j = 0; j <= i; j++) {
        let l = 0;
        if (j === i) l += 1.2;
        if (j === i - 1) l += 1.6;
        if (j === i - 2) l += 0.6;
        if (j === 0 && !gated) l += 3.2; // the sink
        logits.push(l);
      }
      return PV.softmax(logits);
    };
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H) => {
      const L = 70, T = 70, B = 110;
      const S = Math.min(W - L - 170, H - T - B), cs = S / n;
      const p = st && st.pointer;
      if (p && p.inside) { const r = Math.floor((p.y - T) / cs); if (r >= 0 && r < n) hover = r; }
      for (let i = 0; i < n; i++) {
        const d = rowDist(i);
        for (let j = 0; j <= i; j++) {
          ctx.fillStyle = PV.alpha(j === 0 && !gated ? C.bad : api.color, Math.min(1, d[j] * 1.3));
          ctx.fillRect(L + j * cs, T + i * cs, cs - 1, cs - 1);
        }
        PV.text(ctx, words[i], L - 6, T + i * cs + cs / 2, { size: Math.min(11, cs * 0.6), align: "right", color: i === hover ? C.glow : C.ink3 });
      }
      words.forEach((w, j) => {
        ctx.save(); ctx.translate(L + j * cs + cs / 2, T - 6); ctx.rotate(-Math.PI / 3);
        PV.text(ctx, w, 0, 0, { size: Math.min(11, cs * 0.6), color: j === 0 ? C.bad : C.ink3 });
        ctx.restore();
      });
      ctx.strokeStyle = C.glow; ctx.lineWidth = 1.5; ctx.strokeRect(L, T + hover * cs, (hover + 1) * cs, cs);
      const d = rowDist(hover);
      const sx = L + S + 20;
      PV.text(ctx, `row “${words[hover]}”`, sx, T + 6, { size: 12, weight: 700, color: C.glow });
      PV.text(ctx, `to first token: ${Math.round(d[0] * 100)}%`, sx, T + 28, { size: 12, color: d[0] > 0.3 ? C.bad : C.ink2 });
      PV.text(ctx, `to last 3 tokens: ${Math.round(d.slice(-3).reduce((a, b) => a + b, 0) * 100)}%`, sx, T + 48, { size: 12, color: C.ink2 });
      cap.set(gated
        ? "<b>With an input-conditioned gate:</b> the head can switch itself down directly, so it no longer needs a dumping ground. The sink disappears."
        : "<b>A sink head:</b> most attention lands on the first token regardless of meaning (red column). The rest goes to nearby words.");
    });
    const ctl = PV.controls(root);
    ctl.toggle([[false, "Standard attention"], [true, "Gated attention"]], false, (v) => (gated = v));
    PV.note(root, "illustrative head");
    return () => st.stop();
  });

  PV.register({
    id: "sinks",
    short: "Spikes & sinks",
    title: "The Spike, the Sparse and the Sink: Anatomy of Massive Activations and Attention Sinks",
    year: 2026, date: "2026-03",
    track: "inside", era: "frontier",
    authors: "Shangwen Sun, Alfredo Canziani, Yann LeCun, Jiachen Zhu (New York University)",
    arxiv: "2603.05498", url: "https://arxiv.org/abs/2603.05498",
    oneLiner: "Two strange quirks inside every Llama-style model, giant outlier numbers and attention piling onto the first token, turn out to be side effects of one design choice, and either can be switched off.",
    why: "These quirks break quantisation, KV-cache compression and long-context tricks. This paper explains where they come from, which tells you how to design them away.",
    signals: { impact: 4, novelty: 4, momentum: 4 },
    tags: ["massive activations", "attention sinks", "pre-norm", "RMSNorm", "gating"],
    builds: ["attention", "sae"],
    slides: [
      {
        k: "Two mysteries",
        t: "Spikes and sinks.",
        h: `<p>Researchers kept finding two odd things inside Transformer LLMs:</p>
            <ul><li><b>Massive activations (spikes):</b> for a few tokens (usually the first token or a delimiter like “.” or newline), a few channels of the hidden state hold values <b>thousands of times larger</b> than normal.</li>
            <li><b>Attention sinks:</b> many attention heads put most of their attention on the <b>first token</b>, even though it carries no useful meaning.</li></ul>
            <p>They usually show up together, on the same tokens. Is one causing the other? Are they needed?</p>`,
        v: { type: "sinkmap" },
      },
      {
        k: "The life of a spike",
        t: "Rise, plateau, fall.",
        h: `<p>Tracking the largest channels layer by layer (Llama 2 7B, Qwen3 8B), the spike follows a clear pattern:</p>
            <ol><li><b>Step-up block:</b> one or two <b>early</b> feed-forward blocks inject a huge value.</li>
            <li><b>Plateau:</b> the residual stream just <b>adds</b> things, so the spike rides along untouched through the middle layers.</li>
            <li><b>Step-down block:</b> one or two <b>late</b> blocks add the exact opposite and cancel it.</li></ol>
            <p>Why does an FFN produce such huge values? With SwiGLU it acts as a <b>directional quadratic amplifier</b>: for tokens pointing in one special direction, the output grows with the <b>square</b> of that alignment. First tokens almost always point that way.</p>`,
        v: { type: "lines",
          title: "Largest hidden-state value through the network",
          subtitle: "shape of the paper's Figure 1 (Llama 2 7B: step-up at block 4, step-down at block 62)",
          x: { label: "block (attention and FFN blocks counted separately)", min: 0, max: 64, ticks: [0, 16, 32, 48, 64] },
          y: { label: "top channel magnitude", min: 1, max: 3000, log: true },
          series: [
            { name: "spike token", color: C.bad, points: [[0, 2], [3, 3], [4, 1800], [20, 2100], [40, 2200], [60, 2000], [62, 40], [64, 8]] },
            { name: "normal token", color: C.inside, points: [[0, 1.5], [16, 8], [32, 14], [48, 20], [64, 30]], labelDy: 10 },
          ],
          note: "illustrative shape" } },
      {
        k: "From spike to sink",
        t: "Normalisation turns the spike into a constant.",
        h: `<p>Before each block, <b>RMSNorm</b> rescales a token's vector to a fixed length. For a spike token, the few giant channels dominate, so after normalisation the vector is <b>nearly the same for every spike token, in every prompt</b>: sparse and constant.</p>
            <p>A constant input gives a constant <b>key</b>. The model learns to place that key in its own region of space, so some heads can reliably send attention there. That's the sink.</p>
            <p>The authors call massive activations <b>implicit parameters</b>: the model has built itself a fixed constant vector to use.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "tok", label: "First token", x: 0.12, y: 0.5 },
            { id: "up", label: "Step-up FFN", sub: "quadratic amplifier", x: 0.34, y: 0.18 },
            { id: "res", label: "Residual stream", sub: "spike persists", x: 0.6, y: 0.18 },
            { id: "norm", label: "RMSNorm", sub: "→ near-constant vector", x: 0.86, y: 0.36 },
            { id: "key", label: "Fixed sink key", x: 0.72, y: 0.72 },
            { id: "sink", label: "Attention sink", x: 0.4, y: 0.82 },
            { id: "down", label: "Step-down block", sub: "cancels the spike", x: 0.12, y: 0.86 },
          ],
          edges: [{ a: "tok", b: "up" }, { a: "up", b: "res" }, { a: "res", b: "norm" }, { a: "norm", b: "key" }, { a: "key", b: "sink" }, { a: "res", b: "down", bend: 0.35, dashed: true }],
          steps: [
            { on: ["tok", "up"], edges: ["tok>up"], text: "An early FFN block amplifies tokens aligned with its trigger direction. The first token almost always is." },
            { on: ["up", "res"], edges: ["up>res"], text: "The residual stream adds it in, and it persists across layers." },
            { on: ["res", "norm"], edges: ["res>norm"], text: "Pre-norm divides by the vector's size: all spike tokens collapse to the same sparse vector." },
            { on: ["norm", "key", "sink"], edges: ["norm>key", "key>sink"], text: "A constant key in its own subspace → heads can dump attention there: the sink." },
            { on: ["res", "down"], edges: ["res>down"], text: "Near the end, a step-down block adds the opposite value and cancels the spike." },
          ] } },
      {
        k: "What sinks are for",
        t: "Sinks are a workaround for a missing off-switch.",
        h: `<p>Softmax forces each head's attention to sum to 100%. What does a head do when nothing is relevant? It dumps attention on the sink, whose value contributes almost nothing. <b>Sinks act as a learned gate</b> to turn heads down.</p>
            <p>Test: give heads a real <b>input-conditioned gate</b>. The sink ratio collapses from <b>46% to 4.5%</b> with no loss in perplexity. Static gates (fixed, position-based or token-based) don't remove sinks, so the gate has to depend on the input.</p>
            <p>Sinks are also mostly a <b>short-context</b> habit: train only on long sequences and they nearly vanish (46% → 1.2%).</p>`,
        v: { type: "bars",
          title: "Share of heads acting as sinks",
          subtitle: "sink ratio % · paper's Tables 7 and 8",
          items: [
            { label: "Baseline", value: 46.0 },
            { label: "Unconditional gate (per channel)", value: 42.2 },
            { label: "Input-conditioned gate (per head)", value: 6.4, hi: true },
            { label: "Input-conditioned gate (per channel)", value: 4.5, hi: true },
            { label: "Trained on long contexts only (2K–4K)", value: 1.2, hi: true },
          ],
          max: 50, fmt: (v) => v + "%" } },
      {
        k: "The takeaways",
        t: "Two phenomena, one cause, both removable.",
        h: `<ul><li><b>They're separable.</b> Changing normalisation (e.g. sandwich norm, QK-norm) removes the spikes but keeps the sinks. Adding gating removes the sinks.</li>
            <li><b>Pre-norm is the culprit</b> behind their co-occurrence: remove it and they decouple.</li>
            <li><b>Head size matters:</b> larger head dimensions give more room to separate the sink key, and the sink ratio rises from 4% (dim 8) to 46% (dim 128).</li>
            <li>Removing either doesn't hurt language modelling. They're incidental, not essential.</li></ul>`,
        v: { type: "bars",
          title: "Head dimension vs sink ratio",
          subtitle: "% of heads acting as sinks · paper's Table 6",
          items: [
            { label: "head dim 8", value: 4.1 },
            { label: "head dim 16", value: 9.8 },
            { label: "head dim 32", value: 27.9 },
            { label: "head dim 64", value: 37.7 },
            { label: "head dim 128", value: 46.0, hi: true },
          ],
          max: 50, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "Cleaner internals mean easier compression.",
        h: `<p>Huge outliers are the main enemy of <b>quantisation</b> (4-bit and 8-bit models): one giant value wrecks the scale for everything else. Sinks matter for <b>KV-cache eviction</b>: StreamingLLM keeps the first tokens forever because removing the sink breaks the model.</p>
            <p>Knowing the mechanism gives designers direct levers: add input-conditioned attention gates (as some 2025–26 models already do), use QK-norm, rethink pre-norm. It fits a broader 2026 theme of rethinking the <b>residual stream</b>, as in the <b>Attention Residuals</b> paper.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "Which architectural choice lets spikes and sinks appear together?", options: ["Tokenization", "Pre-norm (normalising before each block)", "Dropout", "Positional encoding"], a: 1, why: "Pre-norm turns spike tokens into near-constant vectors, enabling fixed sink keys. Remove it and the phenomena decouple." },
      { q: "What removes attention sinks without hurting perplexity?", options: ["Bigger vocabulary", "An input-conditioned attention gate", "More layers", "A static per-position gate"], a: 1, why: "Sinks are a workaround for turning heads off. A real, input-dependent gate makes them unnecessary." },
    ],
    terms: [
      ["Massive activation", "A few hidden channels on a few tokens with values thousands of times larger than normal."],
      ["Attention sink", "A token (usually the first) that absorbs much of a head's attention regardless of meaning."],
      ["Pre-norm", "Normalising a block's input before the block, with the residual added afterwards."],
      ["RMSNorm", "Rescaling a vector to a fixed root-mean-square size."],
      ["Gated attention", "Multiplying a head's output by a learned, input-dependent gate."],
      ["Quantisation", "Storing numbers with fewer bits (e.g. 4 or 8) to save memory and time."],
    ],
    next: ["attnres", "sae", "nemotron"],
  });
})();
