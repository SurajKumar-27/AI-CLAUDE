/* Nemotron 3 Super: Open, Efficient Mixture-of-Experts Hybrid Mamba-Transformer Model for Agentic Reasoning (NVIDIA, 2026) */
(function () {
  const { h, C, FONT } = PV;

  /* The layer stack: mostly Mamba + MoE pairs, a few attention "anchors". */
  PV.defineViz("hybridstack", (root, o, api) => {
    const n = 88;
    // illustrative periodic pattern: Mamba, MoE, Mamba, MoE, …, with an attention layer every ~11 layers
    const pat = Array.from({ length: n }, (_, i) => (i % 11 === 7 ? "A" : i % 2 ? "E" : "M"));
    const col = { M: C.speed, E: C.arch, A: C.reason };
    const name = { M: "Mamba-2 (fixed-size state)", E: "LatentMoE (22 of 512 experts)", A: "Attention (global anchor)" };
    let ctxLen = 64; // thousand tokens
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      const top = 64;
      const cw = (W - 40) / n;
      pat.forEach((p, i) => {
        const pulse = p === "A" ? 0.6 + 0.4 * Math.sin(t * 3 + i) : 0.85;
        PV.box(ctx, 20 + i * cw, top, Math.max(2, cw - 1.5), 64, { r: 2, fill: PV.alpha(col[p], pulse) });
      });
      PV.text(ctx, "layer 1", 20, top + 80, { size: 10.5, font: FONT.mono, color: C.ink3 });
      PV.text(ctx, "layer 88", W - 20, top + 80, { size: 10.5, font: FONT.mono, color: C.ink3, align: "right" });
      let lx = 20;
      ["M", "E", "A"].forEach((k) => {
        const cnt = pat.filter((x) => x === k).length;
        ctx.fillStyle = col[k]; ctx.fillRect(lx, top + 100, 12, 12);
        PV.text(ctx, `${name[k]} ×${cnt}`, lx + 18, top + 106, { size: 11.5, color: C.ink2 });
        lx += 30 + ctx.measureText(`${name[k]} ×${cnt}`).width;
        if (lx > W - 200) lx = 20;
      });
      // KV memory: all-attention vs hybrid, as context grows
      const kvAll = n / 2, kvHyb = pat.filter((x) => x === "A").length; // attention layers that keep a KV cache
      const by = top + 150, bw = W - 40;
      const scale = (kv) => (kv * ctxLen) / (kvAll * 1000);
      PV.text(ctx, `KV cache at ${ctxLen}k tokens of context (grows with context length)`, 20, by, { size: 12, weight: 700 });
      PV.text(ctx, "if every mixer layer were attention", 20, by + 22, { size: 11, color: C.ink3 });
      PV.box(ctx, 20, by + 30, bw, 14, { r: 4, fill: C.panel });
      PV.box(ctx, 20, by + 30, bw * scale(kvAll), 14, { r: 4, fill: C.bad });
      PV.text(ctx, "hybrid: only the attention anchors keep a KV cache", 20, by + 62, { size: 11, color: C.ink3 });
      PV.box(ctx, 20, by + 70, bw, 14, { r: 4, fill: C.panel });
      PV.box(ctx, 20, by + 70, Math.max(3, bw * scale(kvHyb)), 14, { r: 4, fill: api.color });
      cap.set("<b>Hybrid stack:</b> Mamba layers carry a fixed-size state, so they don't grow with context. A handful of attention layers keep exact long-range recall.");
    });
    const ctl = PV.controls(root);
    ctl.slider("Context", { min: 8, max: 1000, step: 8, value: ctxLen, fmt: (v) => v + "k", onInput: (v) => (ctxLen = v) });
    PV.note(root, "illustrative pattern");
    return () => st.stop();
  });

  /* Standard MoE vs LatentMoE: compress, route to more (smaller) experts, expand. */
  PV.defineViz("latentmoe", (root, o, api) => {
    let mode = "latent";
    const rnd = PV.rng(12);
    let pick = [];
    const reroll = () => {
      const N = mode === "latent" ? 512 : 128, K = mode === "latent" ? 22 : 6;
      const s = new Set();
      while (s.size < K) s.add(Math.floor(rnd() * N));
      pick = [...s];
    };
    reroll();
    let timer = 0;
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      timer += dt;
      if (timer > 1.8) { timer = 0; reroll(); }
      const latent = mode === "latent";
      const N = latent ? 512 : 128, K = latent ? 22 : 6, d = 4096, l = latent ? 1024 : 4096;
      const top = 60, bot = 120, mid = top + (H - top - bot) / 2;
      const hFull = H - top - bot;
      // token vector
      PV.box(ctx, 24, top, 22, hFull, { r: 4, fill: PV.alpha(C.glow, 0.5) });
      PV.text(ctx, "d=4096", 35, top + hFull + 14, { size: 10.5, font: FONT.mono, align: "center", color: C.ink3 });
      let x = 70;
      if (latent) {
        PV.arrow(ctx, 50, mid, 84, mid, { color: C.ink3 });
        const lh = hFull / 4;
        PV.box(ctx, 90, mid - lh / 2, 22, lh, { r: 4, fill: api.color });
        PV.text(ctx, "ℓ=1024", 101, mid + lh / 2 + 14, { size: 10.5, font: FONT.mono, align: "center", color: api.color });
        x = 130;
      }
      // experts grid
      const cols = latent ? 32 : 16, rows = N / cols;
      const gx = x + 30, gw = W - gx - 90, cs = Math.min(gw / cols, hFull / rows);
      const gy = mid - (rows * cs) / 2;
      PV.arrow(ctx, x - 14, mid, gx - 6, mid, { color: C.ink3 });
      for (let i = 0; i < N; i++) {
        const on = pick.includes(i);
        const ex = gx + (i % cols) * cs, ey = gy + Math.floor(i / cols) * cs;
        ctx.fillStyle = on ? C.glow : PV.alpha(C.arch, 0.18);
        ctx.fillRect(ex + 1, ey + 1, cs - 2, cs - 2);
      }
      PV.text(ctx, `${N} experts, ${K} active per token${latent ? " (each 4× thinner)" : ""}`, gx, gy - 12, { size: 11.5, color: C.ink2 });
      PV.arrow(ctx, gx + cols * cs + 8, mid, W - 60, mid, { color: C.ink3 });
      PV.box(ctx, W - 54, top, 22, hFull, { r: 4, fill: PV.alpha(C.glow, 0.5) });
      // accounting: traffic ~ width × K; combinations = C(N, K)
      const traffic = l * K;
      const logComb = (n2, k2) => { let s = 0; for (let i = 0; i < k2; i++) s += Math.log10((n2 - i) / (i + 1)); return s; };
      PV.text(ctx, `data sent to experts per token: ${l} × ${K} = ${traffic.toLocaleString()} numbers`, 24, H - bot + 34, { size: 12, color: C.ink });
      PV.text(ctx, `possible expert combinations: about 10^${logComb(N, K).toFixed(0)}`, 24, H - bot + 54, { size: 12, color: latent ? C.good : C.ink2, weight: 700 });
      cap.set(latent
        ? "<b>LatentMoE:</b> squeeze the token to 1,024 numbers first. Each expert is thinner, so you can afford 4× more experts and 4× more active ones for about the same memory traffic."
        : "<b>Standard MoE (same budget):</b> route the full 4,096-number token to fewer, wider experts.");
    });
    const ctl = PV.controls(root);
    ctl.toggle([["latent", "LatentMoE"], ["std", "Standard MoE"]], mode, (v) => { mode = v; reroll(); });
    PV.note(root, "standard MoE sized for equal traffic");
    return () => st.stop();
  });

  /* NVFP4: 4-bit numbers, with one shared scale per block of 16. */
  PV.defineViz("fp4", (root, o, api) => {
    const grid = [0, 0.5, 1, 1.5, 2, 3, 4, 6];
    const q = (x) => { const s = Math.sign(x), a = Math.abs(x); let best = 0; grid.forEach((g) => { if (Math.abs(g - a) < Math.abs(best - a)) best = g; }); return s * best; };
    const r = PV.rng(31);
    const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) * 0.8; };
    const blocks = [Array.from({ length: 16 }, gauss), Array.from({ length: 16 }, gauss)];
    blocks[1][5] = 9; // an outlier in the second block
    let mode = "block";
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H) => {
      const all = blocks.flat();
      const globalScale = Math.max(...all.map(Math.abs)) / 6;
      const top = 70, bot = 160, mid = top + (H - top - bot) / 2, amp = (H - top - bot) / 2 / 9.5;
      const bw = (W - 60) / 32;
      let err = 0;
      blocks.forEach((b, bi) => {
        const sc = mode === "block" ? Math.max(...b.map(Math.abs)) / 6 : globalScale;
        b.forEach((v, i) => {
          const x = 30 + (bi * 16 + i) * bw;
          const qv = q(v / sc) * sc;
          err += Math.abs(qv - v);
          PV.box(ctx, x + 1, v >= 0 ? mid - v * amp : mid, bw * 0.42, Math.abs(v * amp) + 1, { r: 1, fill: PV.alpha(C.ink2, 0.6) });
          PV.box(ctx, x + bw * 0.46, qv >= 0 ? mid - qv * amp : mid, bw * 0.42, Math.abs(qv * amp) + 1, { r: 1, fill: api.color });
        });
        PV.text(ctx, mode === "block" ? `block ${bi + 1}: own scale ${sc.toFixed(2)}` : `shared scale ${sc.toFixed(2)}`, 30 + bi * 16 * bw, top - 12, { size: 11, font: FONT.mono, color: C.ink3 });
      });
      ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(30, mid); ctx.lineTo(W - 30, mid); ctx.stroke();
      PV.text(ctx, `total rounding error: ${err.toFixed(2)}`, 30, H - bot + 30, { size: 13, weight: 700, color: mode === "block" ? C.good : C.bad });
      PV.text(ctx, "grey = original weight · coloured = stored in 4 bits", 30, H - bot + 50, { size: 11, color: C.ink3 });
      cap.set(mode === "block"
        ? "<b>NVFP4:</b> each block of 16 numbers gets its own scale, so one outlier only hurts its own block."
        : "<b>One scale for everything:</b> the outlier forces a big scale, and small weights all round to zero.");
    });
    const ctl = PV.controls(root);
    ctl.toggle([["block", "Scale per 16 (NVFP4)"], ["global", "One global scale"]], mode, (v) => (mode = v));
    ctl.note("FP4 can only store ±{0, 0.5, 1, 1.5, 2, 3, 4, 6} × scale");
    return () => st.stop();
  });

  PV.register({
    id: "nemotron",
    short: "Nemotron 3 Super",
    title: "Nemotron 3 Super: Open, Efficient Mixture-of-Experts Hybrid Mamba-Transformer Model for Agentic Reasoning",
    year: 2026, date: "2026-04",
    track: "speed", era: "frontier",
    authors: "NVIDIA (500+ authors)",
    arxiv: "2604.12374", url: "https://arxiv.org/abs/2604.12374",
    oneLiner: "A 120B-parameter open model that combines nearly every efficiency idea in this collection (Mamba layers, a new MoE, built-in speculative decoding, 4-bit training) and runs up to 7.5× faster than peers.",
    why: "It's the clearest look at what a 2026 production architecture looks like, with open weights, data and recipes.",
    signals: { impact: 4, novelty: 4, momentum: 5 },
    tags: ["hybrid", "Mamba", "LatentMoE", "NVFP4", "MTP", "agentic RL", "1M context"],
    builds: ["mamba", "mixtral", "specdec", "r1"],
    slides: [
      {
        k: "The problem",
        t: "Agents think in long bursts, and long outputs are expensive.",
        h: `<p>Agentic tasks (fixing a codebase, operating a terminal) mean <b>long contexts in</b> (files, tool outputs) and <b>long reasoning out</b>. The paper benchmarks 8k tokens in and <b>64k tokens out</b>.</p>
            <p>For a standard Transformer that's the worst case: the KV cache grows with every token, and every generated token reads all of it. NVIDIA's goal was frontier-level accuracy at much higher <b>throughput</b>.</p>`,
        analogy: "A delivery company that switched from trucks to bicycles for most streets, kept a few trucks for long hauls, and redesigned its warehouse so every picker walks less.",
      },
      {
        k: "Idea 1 · Hybrid stack",
        t: "Mostly Mamba, a little attention.",
        h: `<p>The 88-layer stack mostly alternates <b>Mamba-2</b> layers (fixed-size state, no KV cache) with <b>MoE</b> layers. A few <b>attention layers</b> are placed as global “anchors” for precise long-range lookups.</p>
            <p>Only those anchors keep a KV cache, so memory grows far more slowly with context. That's how the model supports up to <b>1M tokens</b> of context.</p>`,
        v: { type: "hybridstack" },
      },
      {
        k: "Idea 2 · LatentMoE",
        t: "Squeeze the token, then use more experts.",
        h: `<p>In serving, MoE cost is dominated by <b>reading expert weights</b> and <b>sending tokens between GPUs</b>. Both scale with the token's width <i>d</i>.</p>
            <p><b>LatentMoE</b> projects each token from 4,096 down to a 1,024-number latent before routing. Every expert works in that smaller space. The 4× saving is reinvested in <b>4× more experts (512)</b> and <b>4× more active experts (22)</b>. The cost stays about the same, but there are vastly more ways to combine experts, which improves quality.</p>`,
        v: { type: "latentmoe" },
      },
      {
        k: "Idea 3 · Built-in drafting and 4-bit training",
        t: "MTP heads for speed, NVFP4 for training.",
        h: `<p><b>Multi-token prediction (MTP):</b> extra heads trained to predict several tokens ahead act as a <b>built-in speculative-decoding drafter</b>. Nemotron 3 Super <b>shares weights</b> across its MTP heads, so one head can be run repeatedly to draft longer. It averages <b>3.45 accepted tokens</b> per verification step.</p>
            <p><b>NVFP4 pre-training:</b> most matrix multiplications during pre-training ran in <b>4-bit</b> floating point, stable over 25 trillion tokens. The trick is a separate scale factor for every block of 16 numbers. Try it on the right.</p>`,
        v: { type: "fp4" },
      },
      {
        k: "Training",
        t: "25T tokens, then RL across 21 environments.",
        h: `<ul><li><b>Pre-training:</b> 25 trillion tokens in two phases: 20T for breadth, then 5T of higher-quality data.</li>
            <li><b>SFT:</b> large agentic datasets, including software engineering, terminal use (about 85k samples) and tool use.</li>
            <li><b>RL:</b> asynchronous RL across <b>21 environments and 37 datasets</b> (maths, code, STEM, safety, chat, long context, puzzles, agentic tasks), the DeepSeek-R1 idea of verifiable rewards at industrial scale. Then a separate stage for software-engineering RL, and RLHF with a generative reward model.</li></ul>
            <p>A notable finding: training on <b>all environments together</b> gave stable gains, while training on one at a time caused regressions elsewhere.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "pt", label: "Pre-train 25T tokens", sub: "NVFP4 · 20T + 5T", x: 0.16, y: 0.16 },
            { id: "sft", label: "SFT", sub: "agentic data", x: 0.5, y: 0.16 },
            { id: "rl", label: "Multi-env RLVR", sub: "21 environments", x: 0.84, y: 0.16 },
            { id: "swe", label: "SWE RL", sub: "long-horizon coding", x: 0.84, y: 0.6 },
            { id: "hf", label: "RLHF", sub: "generative reward model", x: 0.5, y: 0.6 },
            { id: "q", label: "Quantise → NVFP4 / FP8 release", x: 0.2, y: 0.86, maxW: 0.36 },
          ],
          edges: [{ a: "pt", b: "sft" }, { a: "sft", b: "rl" }, { a: "rl", b: "swe" }, { a: "swe", b: "hf" }, { a: "hf", b: "q" }],
          steps: [
            { on: ["pt"], edges: [], text: "Pre-training in 4-bit precision, with a diversity phase then a quality phase." },
            { on: ["pt", "sft"], edges: ["pt>sft"], text: "Supervised fine-tuning on agentic trajectories, often distilled from strong open models." },
            { on: ["sft", "rl"], edges: ["sft>rl"], text: "RL with verifiable rewards across many environments at once." },
            { on: ["rl", "swe"], edges: ["rl>swe"], text: "A dedicated stage for slow, long software-engineering rollouts." },
            { on: ["swe", "hf", "q"], edges: ["swe>hf", "hf>q"], text: "RLHF for chat quality, then quantised checkpoints are released." },
          ] } },
      {
        k: "Results",
        t: "Comparable accuracy, much higher throughput.",
        h: `<p>120.6B total parameters with <b>12.7B active</b> per token. On common benchmarks it's comparable to GPT-OSS-120B and Qwen3.5-122B, while delivering up to <b>2.2×</b> and <b>7.5×</b> their throughput (8k in / 64k out, on B200 GPUs).</p>
            <p>Checkpoints (base, BF16, FP8, NVFP4), most of the training data and the RL environments are released openly.</p>`,
        v: { type: "bars",
          title: "Inference throughput, 8k input / 64k output",
          subtitle: "relative to Qwen3.5-122B = 1 · derived from the paper's 2.2× and 7.5× figures",
          items: [
            { label: "Qwen3.5-122B", value: 1 },
            { label: "GPT-OSS-120B", value: 3.4 },
            { label: "Nemotron 3 Super", value: 7.5, hi: true },
          ],
          fmt: (v) => v + "×" } },
      {
        k: "Why it matters",
        t: "The 2026 production recipe, in the open.",
        h: `<p>This one model ties together much of this collection: <b>Mamba</b> (hybrid layers), <b>Mixtral</b> (MoE, now LatentMoE), <b>speculative decoding</b> (MTP), <b>DeepSeek-R1</b> (RL with verifiable rewards), and hardware-aware design in the spirit of <b>FlashAttention</b>.</p>
            <p>Also interesting for researchers: the report documents odd side effects of 4-bit training (more exactly-zero gradients and some expert channels fading), the kind of honest detail that's rare in industry reports.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "Why do only the attention layers need a KV cache?", options: ["They are bigger", "Mamba layers keep a fixed-size state instead of storing every past token", "MoE layers store it", "KV caches are optional"], a: 1, why: "SSM layers compress history into a constant-size state, so memory doesn't grow with context." },
      { q: "What does LatentMoE do with the savings from a smaller latent width?", options: ["Removes experts", "Adds 4× more experts and 4× more active experts", "Uses a smaller vocabulary", "Nothing, it just runs faster"], a: 1, why: "Compressing d → ℓ cuts per-expert cost, which is reinvested in more and more-active experts at similar cost." },
      { q: "Why does NVFP4 use a separate scale per 16 numbers?", options: ["To use more memory", "So an outlier only affects its own small block when rounding to 4 bits", "It's required by PyTorch", "To make training slower"], a: 1, why: "Fine-grained scales stop one large value from crushing the precision of every other number." },
    ],
    terms: [
      ["Hybrid architecture", "Mixing layer types (e.g. Mamba + attention) in one stack."],
      ["LatentMoE", "MoE where tokens are compressed to a smaller latent before routing to many small experts."],
      ["NVFP4", "NVIDIA's 4-bit floating-point format with a scale per block of 16 values."],
      ["Throughput", "Tokens generated per second across all users."],
      ["All-to-all", "Communication pattern where every GPU sends tokens to every other GPU (used in MoE)."],
    ],
    next: ["mamba3", "specdec", "mixtral"],
  });
})();
