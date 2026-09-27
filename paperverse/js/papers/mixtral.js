/* Mixtral of Experts (Jiang et al., 2024) */
(function () {
  const { h, C, FONT } = PV;

  /* Router picks top-k of 8 experts for each token; counters show active parameters and load. */
  PV.defineViz("moe", (root, o, api) => {
    const E = o.experts || 8;
    let k = o.k || 2;
    const toks = o.tokens || ["def", "sort", "(", "items", "):", "The", "king", "of", "France", "2", "+", "2", "=", "4"];
    const shared = o.shared ?? 1.633, per = o.per ?? 5.633; // Mixtral: 46.7B total, 12.9B active with k=2
    const load = new Array(E).fill(0);
    let ti = 0, phase = 0, scores = [], chosen = [];
    const rnd = PV.rng(17);
    function route() {
      const tok = toks[ti % toks.length];
      let seed = 0; for (const ch of tok) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
      const r2 = PV.rng(seed + 1);
      const logits = Array.from({ length: E }, () => r2() * 3 + rnd() * 0.6);
      scores = PV.softmax(logits);
      chosen = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, k).map((x) => x[1]);
      chosen.forEach((i) => load[i]++);
    }
    route();
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      phase += dt / 1.6;
      if (phase >= 1) { phase = 0; ti++; route(); }
      const tok = toks[ti % toks.length];
      const tx = 70, ty = H * 0.45;
      const rx = W * 0.3;
      const ex = W * 0.62, eh = Math.min(34, (H - 170) / E - 6);
      const ey = (i) => 60 + i * (eh + 6);
      const ox = W - 70;
      // token
      PV.box(ctx, tx - 40, ty - 18, 80, 36, { r: 8, fill: PV.alpha(C.glow, 0.2), stroke: C.glow });
      PV.text(ctx, tok, tx, ty, { size: 14, weight: 700, align: "center" });
      // router
      PV.box(ctx, rx - 40, ty - 26, 80, 52, { r: 10, fill: C.panel2, stroke: api.color });
      PV.text(ctx, "router", rx, ty - 8, { size: 12, weight: 700, align: "center" });
      PV.text(ctx, `top-${k}`, rx, ty + 10, { size: 11, font: FONT.mono, align: "center", color: api.color });
      PV.arrow(ctx, tx + 40, ty, rx - 42, ty, { color: C.ink3 });
      for (let i = 0; i < E; i++) {
        const y = ey(i) + eh / 2;
        const on = chosen.includes(i);
        ctx.strokeStyle = on ? api.color : PV.alpha(C.line2, 0.6);
        ctx.lineWidth = on ? 2.5 : 1;
        ctx.beginPath(); ctx.moveTo(rx + 40, ty); ctx.bezierCurveTo(rx + 100, ty, ex - 110, y, ex - 70, y); ctx.stroke();
        if (on) {
          const u = Math.min(1, phase * 1.6);
          const px = PV.lerp(rx + 40, ex - 70, u), py = PV.lerp(ty, y, PV.ease(u));
          ctx.fillStyle = C.glow; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
          ctx.strokeStyle = PV.alpha(api.color, 0.8); ctx.beginPath(); ctx.moveTo(ex + 70, y); ctx.bezierCurveTo(ex + 110, y, ox - 60, ty, ox - 40, ty); ctx.stroke();
        }
        PV.box(ctx, ex - 70, ey(i), 140, eh, { r: 7, fill: on ? PV.alpha(api.color, 0.35) : C.panel, stroke: on ? api.color : C.line2 });
        PV.text(ctx, `expert ${i + 1}`, ex - 60, y, { size: 11.5, weight: on ? 700 : 400, color: on ? C.ink : C.ink3 });
        // router probability bar
        PV.box(ctx, ex + 8, y - 4, 54 * scores[i] * 2.2, 8, { r: 2, fill: on ? C.glow : C.line2 });
      }
      PV.box(ctx, ox - 40, ty - 18, 80, 36, { r: 8, fill: C.panel2, stroke: C.line2 });
      PV.text(ctx, "Σ weighted", ox, ty, { size: 11.5, align: "center" });
      // stats
      const total = shared + E * per, active = shared + k * per;
      const by = H - 108;
      PV.text(ctx, `active per token: ${active.toFixed(1)}B of ${total.toFixed(1)}B parameters (${Math.round((active / total) * 100)}%)`, 20, by, { size: 12.5, weight: 700 });
      const maxL = Math.max(1, ...load);
      load.forEach((l, i) => {
        const bw = (W - 40) / E;
        PV.box(ctx, 20 + i * bw + 2, by + 34 - (l / maxL) * 20, bw - 4, (l / maxL) * 20 + 1, { r: 2, fill: PV.alpha(api.color, 0.6) });
      });
      PV.text(ctx, "how often each expert has been picked", 20, by + 46, { size: 10.5, color: C.ink3, font: FONT.mono });
      cap.set(`Token <b>“${tok}”</b> → experts <b style="color:${api.color}">${chosen.map((c) => c + 1).join(" & ")}</b>. Only those run; the rest sit idle for this token.`);
    });
    const ctl = PV.controls(root);
    ctl.slider("Experts per token (top-k)", { min: 1, max: 4, value: k, onInput: (v) => (k = v) });
    PV.note(root, "illustrative routing");
    return () => st.stop();
  });

  PV.register({
    id: "mixtral",
    short: "Mixtral (MoE)",
    title: "Mixtral of Experts",
    year: 2024, date: "2024-01",
    track: "arch", era: "foundation",
    authors: "Jiang, Sablayrolles, Roux, Mensch, Savary, Bamford, Chaplot, de las Casas et al. (Mistral AI)",
    arxiv: "2401.04088", url: "https://arxiv.org/abs/2401.04088",
    oneLiner: "Eight expert networks per layer and a router that sends each token to just two: the knowledge of a 47B model at the running cost of a 13B one.",
    why: "It made sparse Mixture-of-Experts practical and open. Most frontier open models in 2025–26 (DeepSeek-V3, Qwen3, GPT-OSS, Nemotron 3) are MoEs.",
    signals: { impact: 5, novelty: 3, momentum: 5 },
    tags: ["mixture of experts", "router", "sparse", "top-2", "active parameters"],
    builds: ["attention", "chinchilla"],
    slides: [
      {
        k: "The problem",
        t: "Bigger models know more, but every token pays for every parameter.",
        h: `<p>In a normal (“dense”) model, generating one token uses <b>all</b> the weights. A 70B model does 70B parameters' worth of work for every word, even “the”.</p>
            <p>We'd like the knowledge capacity of a huge model with the per-token cost of a small one.</p>`,
        analogy: "A hospital doesn't send every patient to every specialist. A triage nurse (the router) sends each one to the two specialists who can help most.",
      },
      {
        k: "The big idea",
        t: "Sparse Mixture of Experts.",
        h: `<p>Mixtral keeps the Transformer's attention layers, but replaces each feed-forward block with <b>8 experts</b> (8 separate feed-forward networks) and a small <b>router</b>.</p>
            <p>For every token, at every layer, the router scores all 8 experts, picks the <b>top 2</b>, runs only those, and blends their outputs using the router's weights.</p>
            <p>Result: <b>46.7B total</b> parameters, but only <b>12.9B active</b> per token. Drag top-k to see the trade-off.</p>`,
        eq: `y = Σ_{i ∈ top-2} softmax(router(x))_i · Expert_i(x)`,
        v: { type: "moe" },
      },
      {
        k: "What do experts learn?",
        t: "Not topics: patterns.",
        h: `<p>You might expect a “maths expert” and a “biology expert”. The authors checked routing across subjects (ArXiv papers, biology, philosophy, maths, code) and found <b>no strong specialisation by topic</b>.</p>
            <p>Instead, routing follows <b>syntax and token type</b>: Python keywords like <code>self</code>, indentation tokens, or punctuation tend to go to consistent experts. Consecutive tokens often go to the same expert, especially in the top layers.</p>
            <p>“Experts” is a loose name: they're a learned division of labour, not human-readable departments.</p>`,
      },
      {
        k: "Results",
        t: "Matches Llama 2 70B with about 5× fewer active parameters.",
        h: `<p>Mixtral 8x7B matched or beat <b>Llama 2 70B</b> and <b>GPT-3.5</b> across most benchmarks, and was especially strong on maths, code and multilingual tasks, while using 12.9B active parameters per token.</p>
            <p>It was released under the permissive <b>Apache 2.0</b> licence with a 32k-token context, which made high-quality MoE available to everyone.</p>`,
        v: { type: "bars",
          title: "Active parameters per token",
          subtitle: "billions · MMLU: Llama 2 70B 69.9%, GPT-3.5 70.0%, Mixtral 70.6%",
          items: [
            { label: "Llama 2 70B (dense)", value: 70 },
            { label: "Mixtral 8x7B (total)", value: 46.7 },
            { label: "Mixtral 8x7B (active)", value: 12.9, hi: true },
          ],
          fmt: (v) => v + "B" } },
      {
        k: "Why it matters",
        t: "MoE became the default for frontier open models.",
        h: `<p>After Mixtral, MoE went mainstream and much sparser: <b>DeepSeek-V3</b> (671B total, 37B active, 256 routed experts), Qwen3 MoE, OpenAI's GPT-OSS, and in 2026 <b>Nemotron 3 Super</b> with 512 experts per layer and 22 active, using a new “LatentMoE” design.</p>
            <p>The trade-offs: all experts must sit in memory even though few run, routing needs <b>load balancing</b> so some experts aren't overloaded, and serving across GPUs means shuffling tokens between devices (all-to-all communication). A 2026 paper in this area even argues that scaling <b>embeddings</b> can beat adding more experts in some regimes.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "How many of Mixtral's 8 experts process each token?", options: ["All 8", "1", "2", "It varies randomly"], a: 2, why: "The router picks the top 2 experts per token per layer." },
      { q: "What did routing analysis show about experts?", options: ["Each expert owns a topic like maths or biology", "Routing follows syntax and token patterns more than topics", "Experts are never used", "Only one expert is ever used"], a: 1, why: "No clear topic specialisation, but consistent patterns for token types and structure." },
    ],
    terms: [
      ["Mixture of Experts (MoE)", "A layer with many sub-networks where a router activates only a few per token."],
      ["Router / gate", "A small network that scores experts and picks which to use."],
      ["Active parameters", "Parameters actually used for one token (vs total parameters)."],
      ["Load balancing", "Keeping expert usage even so none is overloaded or idle."],
      ["Sparse model", "A model that uses only part of its parameters for each input."],
    ],
    next: ["nemotron", "chinchilla", "vllm"],
  });
})();
