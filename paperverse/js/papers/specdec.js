/* Fast Inference from Transformers via Speculative Decoding (Leviathan, Kalman, Matias, 2022) */
(function () {
  const { h, C, FONT } = PV;

  PV.defineViz("specdec", (root, o, api) => {
    const words = "Speculative decoding lets a small fast model guess ahead while the big model checks many guesses at once and keeps the good ones".split(" ");
    let alpha = 0.75, k = 4, rounds = [], pos = 0, timer = 0, calls = 0, produced = 0;
    const rnd = PV.rng(99);
    function step() {
      if (pos >= words.length) { rounds = []; pos = 0; calls = 0; produced = 0; }
      const draft = [];
      let accepted = 0;
      for (let i = 0; i < k; i++) {
        if (accepted === i && rnd() < alpha) accepted++;
      }
      for (let i = 0; i < k && pos + i < words.length; i++) draft.push({ w: words[pos + i], ok: i < accepted, rej: i === accepted });
      const gained = Math.min(accepted + 1, words.length - pos); // accepted drafts + 1 token from the big model
      rounds.push({ draft, gained, start: pos });
      pos += gained;
      calls += 1;
      produced += gained;
      if (rounds.length > 6) rounds.shift();
    }
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      timer += dt;
      if (timer > 1.3) { timer = 0; step(); }
      const top = W < 520 ? 30 : 56, rowH = Math.min(52, (H - top - 150) / 6);
      rounds.forEach((r, ri) => {
        const narrow = W < 520;
        const y = top + ri * rowH;
        // phones: the call label sits above its row of draft tokens
        PV.text(ctx, `big-model call #${calls - rounds.length + ri + 1}`, 14, narrow ? y - 2 : y + 14, { size: 10.5, font: FONT.mono, color: C.ink3 });
        let x = narrow ? 14 : 150;
        const yb = narrow ? y + 8 : y;
        ctx.font = `700 12px ${FONT.body}`;
        r.draft.forEach((d, i) => {
          const w = ctx.measureText(d.w).width + 16;
          const col = d.ok ? C.good : d.rej ? C.bad : C.line2;
          if (x + w > W - 44) return; // no room left on this row
          PV.box(ctx, x, yb + 2, w, 24, { r: 6, fill: PV.alpha(col, d.ok ? 0.25 : 0.12), stroke: col });
          PV.text(ctx, d.w, x + w / 2, yb + 14, { size: 12, align: "center", weight: 700, color: d.ok ? C.ink : C.ink3 });
          if (d.rej) { ctx.strokeStyle = C.bad; ctx.beginPath(); ctx.moveTo(x + 4, yb + 14); ctx.lineTo(x + w - 4, yb + 14); ctx.stroke(); }
          x += w + 5;
        });
        PV.text(ctx, `+${r.gained}`, W - 14, yb + 14, { size: 13, weight: 700, align: "right", color: api.color });
      });
      const exp = alpha === 1 ? k + 1 : (1 - Math.pow(alpha, k + 1)) / (1 - alpha);
      const by = H - 118;
      if (W < 520) {
        PV.text(ctx, `Tokens per big-model call so far: ${(produced / Math.max(1, calls)).toFixed(2)}`, 14, by - 34, { size: 12, color: C.ink });
        PV.text(ctx, `expected ${exp.toFixed(2)} · normal decoding 1.00`, 14, by - 14, { size: 12, color: C.ink2 });
      } else PV.text(ctx, `Tokens per big-model call so far: ${(produced / Math.max(1, calls)).toFixed(2)}   ·   expected: ${exp.toFixed(2)}   ·   normal decoding: 1.00`, 14, by, { size: 12, color: C.ink });
      PV.box(ctx, 14, by + 12, W - 28, 10, { r: 3, fill: C.panel });
      PV.box(ctx, 14, by + 12, ((W - 28) * exp) / (k + 1), 10, { r: 3, fill: api.color });
      cap.set(`<b>Grey→green:</b> draft guesses the big model agreed with. <b style="color:${C.bad}">Red:</b> first disagreement; everything after it is thrown away and the big model's own token is used.`);
    });
    st.phoneHeight(580);
    const ctl = PV.controls(root);
    ctl.slider("Draft agreement α", { min: 0.3, max: 0.95, step: 0.05, value: alpha, fmt: (v) => Math.round(v * 100) + "%", onInput: (v) => (alpha = v) });
    ctl.slider("Draft length k", { min: 1, max: 8, value: k, onInput: (v) => (k = v) });
    return () => st.stop();
  });

  PV.register({
    id: "specdec",
    short: "Speculative decoding",
    title: "Fast Inference from Transformers via Speculative Decoding",
    year: 2022, date: "2022-11",
    track: "speed", era: "foundation",
    authors: "Leviathan, Kalman, Matias (Google Research)",
    venue: "ICML 2023",
    arxiv: "2211.17192", url: "https://arxiv.org/abs/2211.17192",
    oneLiner: "A small model drafts several tokens and the big model checks them all in one pass. Output is 2–3× faster and mathematically identical.",
    why: "It's one of the few free lunches in AI: faster generation with no quality loss. Modern models now build the drafter in (MTP heads).",
    signals: { impact: 4, novelty: 5, momentum: 5 },
    tags: ["decoding", "draft model", "latency", "verification", "MTP"],
    builds: ["attention"],
    slides: [
      {
        k: "The problem",
        t: "Generating text is one slow step per token.",
        h: `<p>A model writes one token, appends it, and runs again. Each step has to read <b>all</b> of the model's weights from memory, gigabytes of them, just to produce one token.</p>
            <p>The GPU's maths units are mostly idle during this: generation is <b>memory-bound</b>. Checking 5 tokens in one pass costs almost the same time as generating 1, because the expensive part is loading the weights.</p>
            <p>So: can we get the big model to check several tokens at once?</p>`,
        analogy: "A senior editor who is slow to write but fast to read. Let a junior writer draft the next sentence; the editor approves most of it at a glance and only rewrites from the first mistake.",
      },
      {
        k: "The big idea",
        t: "Draft fast, verify in parallel.",
        h: `<ol><li>A small, fast <b>draft model</b> guesses the next <i>k</i> tokens, one at a time. That's cheap.</li>
            <li>The big <b>target model</b> scores all <i>k</i> positions in <b>one forward pass</b>.</li>
            <li>Keep the drafts up to the <b>first disagreement</b>. At that point, use the big model's own choice. You always gain at least one token.</li></ol>
            <p>Play with the sliders: the better the draft agrees with the big model (α), and the longer it drafts (k), the more tokens you get per expensive call.</p>`,
        eq: `expected tokens per big-model call = (1 − α^(k+1)) / (1 − α)`,
        v: { type: "specdec" },
      },
      {
        k: "The guarantee",
        t: "Same output distribution, not an approximation.",
        h: `<p>With sampling (not just greedy decoding), the paper uses a clever acceptance rule, <b>speculative sampling</b>:</p>
            <ul><li>If the big model likes a draft token at least as much as the draft model did, accept it.</li>
            <li>Otherwise accept it with probability <i>p_big / p_draft</i>, and if rejected, sample a replacement from the “leftover” distribution.</li></ul>
            <p>The maths works out so the final text is distributed <b>exactly</b> as if the big model had generated it alone. No retraining and no change to the big model. A DeepMind team (Chen et al., 2023) independently found the same rule.</p>`,
        eq: `accept draft token x with prob  min(1, p_target(x) / p_draft(x))`,
      },
      {
        k: "Results",
        t: "2–3× faster with identical outputs.",
        h: `<p>On T5-XXL (11B) the authors measured <b>2× to 3×</b> speed-ups on translation and summarisation, using a small T5 as the drafter, with outputs guaranteed unchanged.</p>
            <p>The speed-up depends on how predictable the text is. Code and boilerplate get high acceptance, while creative writing gets lower acceptance.</p>`,
        v: { type: "bars",
          title: "Acceptance length with built-in drafters (2026)",
          subtitle: "avg tokens accepted per verification step, draft length 7 · Nemotron 3 Super report, SPEED-Bench",
          items: [
            { label: "DeepSeek-R1 (MTP)", value: 2.70 },
            { label: "Qwen3-Next (MTP)", value: 3.33 },
            { label: "Nemotron 3 Super (shared MTP)", value: 3.45, hi: true },
          ],
          max: 4, fmt: (v) => v.toFixed(2) } },
      {
        k: "Why it matters",
        t: "Now standard in serving, and built into the model.",
        h: `<p>Speculative decoding is in vLLM, TensorRT-LLM, SGLang and most production stacks. Variants removed the separate draft model:</p>
            <ul><li><b>Medusa / EAGLE:</b> small extra heads on the big model predict ahead.</li>
            <li><b>Multi-token prediction (MTP):</b> train the model to predict several future tokens, then use those heads as the drafter (DeepSeek-V3, Nemotron 3 Super).</li></ul>
            <p>The 2026 papers here keep coming back to it: Nemotron 3 Super's shared-weight MTP, and NCP's concepts improving a drafter's acceptance by 4%.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "Why can the big model verify k tokens almost as fast as generating 1?", options: ["It skips layers", "Generation is memory-bound, so loading the weights once and scoring k positions costs about the same", "It uses a smaller vocabulary", "It caches the answers"], a: 1, why: "The expensive part is reading weights from memory. Scoring several positions in one pass reuses that read." },
      { q: "Does speculative decoding change what the big model would output?", options: ["Yes, slightly", "No, the output distribution is exactly the same", "Only for code", "It depends on the temperature"], a: 1, why: "The acceptance rule guarantees samples come from the target model's distribution." },
    ],
    terms: [
      ["Draft model", "A small, fast model that proposes tokens for the big model to check."],
      ["Memory-bound", "Limited by memory bandwidth rather than by computation."],
      ["Speculative sampling", "The accept/reject rule that keeps the output distribution exact."],
      ["MTP", "Multi-token prediction: training heads that predict several future tokens."],
      ["Acceptance length", "Average number of draft tokens accepted per verification step."],
    ],
    next: ["vllm", "nemotron", "flash"],
  });
})();
