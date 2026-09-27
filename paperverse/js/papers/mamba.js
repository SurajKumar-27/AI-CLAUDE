/* Mamba: Linear-Time Sequence Modeling with Selective State Spaces (Gu & Dao, 2023) */
(function () {
  const { h, C, FONT } = PV;

  /* A stream of tokens; a fixed-size state that either writes selectively (Mamba) or blindly (older SSMs). */
  PV.defineViz("selective", (root, o, api) => {
    const key = [C.train, C.reason, C.speed, C.inside, C.arch];
    const rnd = PV.rng(8);
    const stream = [];
    let ki = 0;
    for (let i = 0; i < 44; i++) {
      const important = i % 9 === 3 && ki < key.length;
      stream.push(important ? { c: key[ki++], imp: true } : { c: C.ink3, imp: false });
    }
    let mode = "mamba", t0 = 0;
    const slots = 5;
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      t0 += dt;
      const speed = 5.5;
      const seen = Math.min(stream.length, Math.floor(t0 * speed));
      if (t0 * speed > stream.length + 14) t0 = 0;
      // compute state from what's been seen so far
      const state = Array.from({ length: slots }, () => ({ r: 22, g: 34, b: 58, w: 0 }));
      let next = 0;
      const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      for (let i = 0; i < seen; i++) {
        const s = stream[i], [r, g, b] = rgb(s.c);
        if (mode === "mamba") {
          // input-dependent step size: big for important tokens, ~0 for filler
          const delta = s.imp ? 1 : 0.02;
          const target = s.imp ? next++ % slots : Math.floor(rnd() * slots);
          const st2 = state[target];
          st2.r = st2.r * (1 - delta) + r * delta; st2.g = st2.g * (1 - delta) + g * delta; st2.b = st2.b * (1 - delta) + b * delta; st2.w = Math.min(1, st2.w * (1 - delta) + delta);
        } else {
          // time-invariant: every token is written into every slot with the same weight
          state.forEach((st2) => { const d = 0.18; st2.r = st2.r * (1 - d) + r * d; st2.g = st2.g * (1 - d) + g * d; st2.b = st2.b * (1 - d) + b * d; st2.w = Math.min(1, st2.w + d); });
        }
      }
      // stream strip
      const top = 88, cw = Math.min(18, (W - 40) / stream.length);
      PV.text(ctx, "input stream (coloured = worth remembering, grey = filler)", 20, top - 12, { size: 11, font: FONT.mono, color: C.ink3 });
      stream.forEach((s, i) => {
        const x = 20 + i * cw;
        ctx.globalAlpha = i < seen ? 1 : 0.25;
        PV.box(ctx, x, top, cw - 3, 22, { r: 3, fill: s.imp ? s.c : PV.alpha(C.ink3, 0.35) });
        ctx.globalAlpha = 1;
      });
      if (seen < stream.length) { ctx.strokeStyle = C.glow; ctx.lineWidth = 2; ctx.strokeRect(20 + seen * cw - 1, top - 3, cw + 1, 28); }
      // fixed-size state
      const sy = top + 70;
      PV.text(ctx, mode === "mamba" ? "Mamba's state: fixed size, selective writes" : "Older SSM's state: fixed size, writes everything equally", 20, sy - 12, { size: 12, weight: 700, color: api.color });
      const sw = Math.min(90, (W - 60) / slots - 10);
      state.forEach((s2, i) => {
        const x = 20 + i * (sw + 10);
        PV.box(ctx, x, sy, sw, sw * 0.7, { r: 8, fill: `rgb(${s2.r | 0},${s2.g | 0},${s2.b | 0})`, stroke: C.line2 });
      });
      // KV cache comparison
      const ky = sy + sw * 0.7 + 50;
      PV.text(ctx, "Transformer's KV cache for the same stream: grows with every token", 20, ky - 12, { size: 12, weight: 700, color: C.ink2 });
      const maxW = W - 40;
      PV.box(ctx, 20, ky, maxW, 16, { r: 4, fill: C.panel });
      PV.box(ctx, 20, ky, (maxW * seen) / stream.length, 16, { r: 4, fill: PV.alpha(C.train, 0.7) });
      PV.box(ctx, 20, ky + 26, maxW, 16, { r: 4, fill: C.panel });
      PV.box(ctx, 20, ky + 26, (maxW * slots) / stream.length, 16, { r: 4, fill: api.color });
      PV.text(ctx, `KV cache: ${seen} entries`, 26 + (maxW * seen) / stream.length, ky + 8, { size: 11, font: FONT.mono });
      PV.text(ctx, `SSM state: ${slots} slots, forever`, 26 + (maxW * slots) / stream.length, ky + 34, { size: 11, font: FONT.mono });
      cap.set(mode === "mamba"
        ? "<b>Selective:</b> the step size Δ depends on the token. Important tokens get written in and filler is ignored, so the state keeps clean memories."
        : "<b>Not selective:</b> every token gets the same treatment, so the fixed state turns into a muddy average and the model can't recall the coloured tokens.");
    });
    const ctl = PV.controls(root);
    ctl.toggle([["mamba", "Selective (Mamba)"], ["lti", "Fixed (S4-style)"]], "mamba", (v) => { mode = v; t0 = 0; });
    PV.note(root, "illustrative");
    return () => st.stop();
  });

  PV.register({
    id: "mamba",
    short: "Mamba",
    title: "Mamba: Linear-Time Sequence Modeling with Selective State Spaces",
    year: 2023, date: "2023-12",
    track: "arch", era: "foundation",
    authors: "Albert Gu (Carnegie Mellon), Tri Dao (Princeton)",
    venue: "COLM 2024",
    arxiv: "2312.00752", url: "https://arxiv.org/abs/2312.00752",
    oneLiner: "A recurrent model with a fixed-size memory that decides, token by token, what to keep. Linear time and constant memory, matching Transformers on language.",
    why: "It restarted the search for a successor (or partner) to attention. In 2026 hybrid Mamba–Transformer models are shipping at scale.",
    signals: { impact: 5, novelty: 5, momentum: 5 },
    tags: ["state space", "selective", "linear time", "recurrent", "scan"],
    builds: ["attention", "flash"],
    slides: [
      {
        k: "The problem",
        t: "Attention's memory grows with every token.",
        h: `<p>A Transformer keeps every past token's keys and values (the KV cache) and compares each new token with all of them. Double the text and you double the memory and roughly quadruple the attention work.</p>
            <p>Recurrent models do the opposite: they carry a <b>fixed-size state</b>, so each new token costs the same no matter how long the text is. Earlier efficient versions called <b>state space models</b> (SSMs, like S4) were fast but did poorly on language. Why?</p>`,
        analogy: "A Transformer keeps a transcript of the whole meeting and rereads it for every sentence. An SSM keeps notes on one index card. That's cheap, but only works if you choose carefully what goes on the card.",
      },
      {
        k: "The big idea",
        t: "Make the memory selective.",
        h: `<p>In older SSMs, the rules for updating the state were <b>fixed</b>: every token was treated the same way. That's fine for audio waveforms, but language needs <b>content-based</b> decisions: remember the name, ignore “um”.</p>
            <p>Mamba makes the SSM's parameters (Δ, B, C) <b>functions of the current token</b>. A big Δ means “reset and focus on this token”, and a small Δ means “ignore it and keep what I have”.</p>
            <p>Toggle between selective and fixed on the right: same state size, very different memory.</p>`,
        eq: `h_t = exp(Δ_t·A) · h_{t−1} + Δ_t · B_t · x_t     y_t = C_t · h_t<small>Δ_t, B_t, C_t are computed from the current input x_t. That's the “selective” part.</small>`,
        v: { type: "selective" },
      },
      {
        k: "The catch, and the fix",
        t: "Selectivity broke the old speed trick, so they wrote a new kernel.",
        h: `<p>Older SSMs were fast because fixed parameters let the whole sequence be computed as one big convolution. Input-dependent parameters rule that out.</p>
            <p>Mamba instead uses a <b>parallel scan</b> (a parallel way to run a recurrence) implemented in a fused GPU kernel that keeps the expanded state in fast on-chip SRAM, the same IO-aware thinking as FlashAttention.</p>
            <p>The architecture is also simpler: one repeated <b>Mamba block</b> replaces both attention and the MLP.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "x", label: "input", x: 0.5, y: 0.92 },
            { id: "lin", label: "Linear expand", x: 0.3, y: 0.7 },
            { id: "gate", label: "Linear (gate)", x: 0.72, y: 0.55 },
            { id: "conv", label: "Short conv", x: 0.3, y: 0.5 },
            { id: "ssm", label: "Selective SSM", sub: "Δ, B, C from input", x: 0.3, y: 0.28 },
            { id: "mul", label: "× gate", x: 0.5, y: 0.12 },
            { id: "out", label: "output", x: 0.86, y: 0.12 },
          ],
          edges: [{ a: "x", b: "lin" }, { a: "x", b: "gate" }, { a: "lin", b: "conv" }, { a: "conv", b: "ssm" }, { a: "ssm", b: "mul" }, { a: "gate", b: "mul" }, { a: "mul", b: "out" }],
          steps: [
            { on: ["x", "lin", "conv"], edges: ["x>lin", "lin>conv"], text: "Expand the input and mix nearby tokens with a short convolution." },
            { on: ["conv", "ssm"], edges: ["conv>ssm"], text: "The selective SSM scans the sequence, keeping a fixed-size state." },
            { on: ["x", "gate", "ssm", "mul", "out"], edges: ["x>gate", "gate>mul", "ssm>mul", "mul>out"], text: "A gate multiplies the result, and the block's output goes to the next layer." },
          ] } },
      {
        k: "Results",
        t: "Transformer quality, 5× the generation throughput.",
        h: `<ul><li><b>Mamba-3B</b> beat Transformers of the same size and matched Transformers <b>twice its size</b> on language modelling and downstream tasks.</li>
            <li>About <b>5× higher generation throughput</b> than a similar-size Transformer, because there's no KV cache to read.</li>
            <li>Quality kept improving on real data up to <b>million-token</b> sequences, and results were strong on DNA and audio too.</li></ul>`,
        v: { type: "bars",
          title: "Generation throughput",
          subtitle: "relative to a Transformer of similar size · from the paper",
          items: [{ label: "Transformer", value: 1 }, { label: "Mamba", value: 5, hi: true }],
          fmt: (v) => v + "×" } },
      {
        k: "Why it matters",
        t: "The linear-model renaissance.",
        h: `<p>Mamba set off a wave: <b>Mamba-2</b> (2024) linked SSMs and attention mathematically and sped up training; <b>Gated DeltaNet</b> and <b>Kimi Delta Attention</b> brought in the “delta rule”; and in 2026 <b>Mamba-3</b> and <b>Gated DeltaNet-2</b> pushed quality further.</p>
            <p>The winning recipe in practice turned out to be <b>hybrids</b>: mostly Mamba-style layers plus a few attention layers for precise recall. Jamba, Nemotron-H, Qwen3-Next and <b>Nemotron 3 Super</b> all take this route.</p>
            <p>Known weak spot: pure SSMs struggle with exact copying and retrieval from far back, since a fixed state can only hold so much. That's why the attention layers stay.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What does “selective” mean in Mamba?", options: ["It picks which layers to run", "The state-update parameters depend on the current token", "It selects the best answer", "It skips tokens"], a: 1, why: "Δ, B and C are computed from each input, so the model decides what to write and what to forget." },
      { q: "What is Mamba's main advantage during generation?", options: ["Bigger vocabulary", "No growing KV cache: constant memory and cost per token", "Better tokenization", "Uses less training data"], a: 1, why: "A fixed-size state means each new token costs the same, however long the context." },
    ],
    terms: [
      ["State space model (SSM)", "A sequence model that updates a fixed-size hidden state with each input."],
      ["Selective SSM", "An SSM whose update rules depend on the input (Mamba)."],
      ["Linear time", "Cost grows in proportion to sequence length, not its square."],
      ["Parallel scan", "An algorithm to compute a recurrence in parallel on GPUs."],
      ["Hybrid model", "A model that mixes attention layers with SSM or linear-attention layers."],
    ],
    next: ["mamba3", "gdn2", "nemotron"],
  });
})();
