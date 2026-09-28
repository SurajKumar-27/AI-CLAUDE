/* Large Language Diffusion Models (Nie et al., 2025) — LLaDA */
(function () {
  const { h, C, FONT } = PV;

  /* Left-to-right generation vs masked diffusion (parallel, any order, with remasking). */
  PV.defineViz("diffusion", (root, o, api) => {
    const target = ["Diffusion", "models", "write", "the", "whole", "answer", "at", "once", "and", "refine", "it", "."];
    const n = target.length;
    let steps = 4, t0 = 0;
    const rnd = PV.rng(4);
    const conf = target.map(() => rnd()); // how confident the model is about each position
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      t0 += dt;
      const period = 1.1;
      const k = Math.floor(t0 / period);
      if (k > n + 3) t0 = 0;
      const lane = (y, label, revealed, flicker) => {
        PV.text(ctx, label, 20, y - 30, { size: 12, font: FONT.mono, color: C.ink3 });
        ctx.font = `700 12.5px ${FONT.body}`;
        // phones: two rows of six so every word stays readable
        const perRow = W < 520 ? 6 : n;
        const cw = (W - 40) / perRow - 5;
        for (let i = 0; i < n; i++) {
          const on = revealed[i];
          const fl = flicker && flicker[i];
          const x = 20 + (i % perRow) * (cw + 5), yy = y + Math.floor(i / perRow) * 38;
          PV.box(ctx, x, yy - 14, cw, 30, { r: 6, fill: on ? PV.alpha(api.color, 0.3) : fl ? PV.alpha(C.bad, 0.2) : C.panel, stroke: on ? api.color : C.line2 });
          const word = on ? PV.fit(ctx, target[i], cw - 6, 12.5, { weight: 700 }) : { text: "▒", size: 12 };
          PV.text(ctx, word.text, x + cw / 2, yy + 1, { size: word.size, align: "center", weight: 700, color: on ? C.ink : C.ink3, noFit: true });
        }
      };
      // autoregressive: one token per step, strictly left to right
      const ar = target.map((_, i) => i < k);
      lane(H * 0.34, W < 520 ? `Autoregressive: step ${Math.min(k, n)}/${n} · 1 token per step` : `Autoregressive: step ${Math.min(k, n)} of ${n} (one token per step, left → right)`, ar);
      // diffusion: in `steps` rounds, unmask the most confident masked positions; low-confidence ones may be remasked
      const perStep = Math.ceil(n / steps);
      const dk = Math.min(steps, k);
      const order = target.map((_, i) => i).sort((a, b) => conf[b] - conf[a]);
      const shown = new Set(order.slice(0, dk * perStep));
      const flicker = {};
      if (dk < steps && dk > 0) {
        const last = order.slice((dk - 1) * perStep, dk * perStep);
        const weakest = last[last.length - 1];
        if (Math.sin(t * 6) > 0.3) { shown.delete(weakest); flicker[weakest] = true; }
      }
      const df = target.map((_, i) => shown.has(i));
      lane(H * 0.68, W < 520 ? `Diffusion: step ${dk}/${steps} · ${perStep} tokens per step` : `Diffusion (LLaDA): step ${dk} of ${steps} (${perStep} tokens per step, most-confident first)`, df, flicker);
      cap.set(`Same sentence. Autoregressive needs <b>${n}</b> steps. Diffusion takes <b>${steps}</b>, filling positions in any order and re-masking shaky guesses (red flash).`);
    });
    const ctl = PV.controls(root);
    ctl.slider("Diffusion steps", { min: 2, max: 12, value: steps, onInput: (v) => { steps = v; t0 = 0; } });
    ctl.button("↻ Replay", () => (t0 = 0));
    PV.note(root, "illustrative");
    return () => st.stop();
  });

  PV.register({
    id: "llada",
    short: "LLaDA (diffusion LM)",
    title: "Large Language Diffusion Models",
    year: 2025, date: "2025-02",
    track: "arch", era: "frontier",
    authors: "Nie, Zhu, You, Zhang, Ou, Hu, Zhou, Lin, Wen, Li (Renmin University, Ant Group)",
    arxiv: "2502.09992", url: "https://arxiv.org/abs/2502.09992",
    oneLiner: "An 8B language model that writes by un-masking a whole draft in parallel, like image diffusion, instead of word by word, and it holds up against LLaMA 3 8B.",
    why: "It's the strongest evidence yet that next-token prediction isn't the only road to LLMs. Diffusion LMs are now a fast-growing branch (Gemini Diffusion, Mercury, LLaDA-MoE).",
    signals: { impact: 4, novelty: 5, momentum: 5 },
    tags: ["diffusion", "masking", "parallel decoding", "reversal curse", "non-autoregressive"],
    builds: ["attention", "gpt3"],
    slides: [
      {
        k: "The assumption",
        t: "Every LLM writes left to right. Does it have to?",
        h: `<p>GPT, Claude, Llama: all are <b>autoregressive</b>. They predict token 1, then token 2 given token 1, and so on. That has costs:</p>
            <ul><li><b>Sequential:</b> 1,000 tokens means 1,000 steps, no matter how fast your GPU is.</li>
            <li><b>No going back:</b> an early mistake can't be revised.</li>
            <li><b>The reversal curse:</b> a model trained on “A is B” often can't answer “B is A”.</li></ul>
            <p>Image generators work differently. They start from noise and refine the <b>whole picture</b> at once. Can text work like that at LLM scale?</p>`,
        analogy: "Autoregressive is writing with a pen, one word at a time and no eraser. Diffusion is sketching the whole page lightly, then going over it again and again, fixing and filling in.",
      },
      {
        k: "The big idea",
        t: "Masked diffusion: learn to fill in blanks at every masking level.",
        h: `<p><b>Training:</b> take a text, pick a random masking ratio <i>t</i> between 0 and 1, replace that fraction of tokens with [MASK], and train a Transformer (with no causal mask, so it sees both directions) to predict the masked tokens. The loss is a bound on the true likelihood, so this is a principled generative model rather than a trick.</p>
            <p><b>Generating:</b> start from an answer that's <b>all masks</b>. Each step, predict every masked token, keep the confident ones, and <b>re-mask</b> the least confident to try again later.</p>`,
        eq: `loss = − E_t [ (1/t) · Σ_{masked i} log p(x_i | x_masked) ]`,
        v: { type: "diffusion" },
      },
      {
        k: "Bonus",
        t: "Breaking the reversal curse.",
        h: `<p>Autoregressive models learn facts in the direction they read them. Famous example: models that know “Tom Cruise's mother is Mary Lee Pfeiffer” often can't answer “Who is Mary Lee Pfeiffer's son?”.</p>
            <p>Because LLaDA learns to predict masked tokens from <b>both sides</b>, it treats both directions evenly. On a task of completing classical poems <b>backwards</b> (given a line, produce the previous one), LLaDA 8B beat <b>GPT-4o</b>.</p>`,
        v: { type: "chat", lines: [
          { who: "user", text: "Who is Tom Cruise's mother?" },
          { who: "model", label: "Typical autoregressive LLM", text: "Mary Lee Pfeiffer." },
          { who: "user", text: "Who is Mary Lee Pfeiffer's son?" },
          { who: "bad", label: "Typical autoregressive LLM", text: "I'm not sure who that is." },
          { who: "system", text: "This asymmetry is the “reversal curse” (Berglund et al., 2023). LLaDA's bidirectional training treats forward and reverse questions alike." },
        ], note: "illustration of the reversal curse" } },
      {
        k: "Results",
        t: "Competitive with LLaMA 3 8B, on far less data.",
        h: `<p>LLaDA 8B was pre-trained <b>from scratch</b> on 2.3 trillion tokens (0.13 million H800 GPU-hours), then fine-tuned on 4.5 million instruction pairs.</p>
            <ul><li>It scaled as well as the authors' matched autoregressive baselines.</li>
            <li>It was competitive with <b>LLaMA 3 8B</b> on in-context learning benchmarks, which was trained on over 15T tokens.</li>
            <li>After fine-tuning it followed instructions and held multi-turn conversations.</li></ul>`,
        v: { type: "bars",
          title: "Pre-training tokens",
          subtitle: "trillions · LLaDA 8B was competitive with LLaMA 3 8B",
          items: [{ label: "LLaMA 3 8B", value: 15 }, { label: "LLaDA 8B", value: 2.3, hi: true }],
          fmt: (v) => v + "T" } },
      {
        k: "Why it matters",
        t: "A second road to language models.",
        h: `<p>Diffusion LMs promise <b>parallel decoding</b> (many tokens per step), the ability to <b>revise</b>, and natural <b>infilling</b> (fill in the middle of a document or function). Commercial systems (Google's Gemini Diffusion, Inception's Mercury) have shown very fast generation, and follow-ups scaled LLaDA with MoE and RL.</p>
            <p><b>Open problems:</b> a fixed output length must be chosen up front, the KV cache trick doesn't apply directly (every step re-reads everything), and quality per step drops if you unmask too many tokens at once.</p>
            <p>Related frontier idea in this collection: <b>Next Concept Prediction</b>, which keeps autoregression but predicts in a latent concept space.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "How does LLaDA generate text?", options: ["Strictly left to right", "Starting from all masks and un-masking in parallel over several steps", "By retrieving sentences", "By translating from images"], a: 1, why: "Each step predicts all masked tokens, keeps confident ones and re-masks uncertain ones." },
      { q: "Why does LLaDA handle reversal questions better?", options: ["It's bigger", "It learns to predict masked tokens using context on both sides", "It uses a search engine", "It was trained on reversed text"], a: 1, why: "Bidirectional training treats both directions of a fact evenly." },
    ],
    terms: [
      ["Autoregressive", "Generating one token at a time, each conditioned on all previous tokens."],
      ["Masked diffusion", "Training by masking random fractions of text and learning to restore it."],
      ["Remasking", "Putting low-confidence predictions back to [MASK] to be re-predicted later."],
      ["Reversal curse", "Knowing “A is B” but failing to infer “B is A”."],
      ["Infilling", "Filling in a missing middle section given text on both sides."],
    ],
    next: ["ncp", "attention", "specdec"],
  });
})();
