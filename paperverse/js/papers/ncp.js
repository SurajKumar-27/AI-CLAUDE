/* NCP-ArchPreview: Moving towards Latent Space Language Models through Next Concept Prediction (Intern-NCP Team, 2026) */
(function () {
  const { h, C, FONT } = PV;

  /* Tokens → concepts (groups of 4) → quantised codes → predict next concept → feed back to tokens. */
  PV.defineViz("ncpflow", (root, o, api) => {
    const toks = ["The", " heart", " pumps", " blood", " through", " the", " body", " to", " every", " organ", " and", " ?"];
    const k = 4, M = toks.length / k;
    let phase = 0, pt = 0;
    const phases = [
      "<b>① Token encoder</b> (16 layers) reads tokens as usual.",
      "<b>② Pool:</b> every 4 token states are averaged into one <b>concept</b> vector.",
      "<b>③ Quantise:</b> each concept is split into 32 segments, and each segment snaps to 1 of 128 codewords (product quantisation).",
      "<b>④ Concept module</b> (8 layers) predicts the <b>next concept</b> from the concepts so far.",
      "<b>⑤ Inject:</b> the predicted concept is added back into the token stream (shifted, so no peeking), and the token decoder (16 layers) predicts the next token.",
    ];
    const cap = PV.caption(root, phases[0]);
    const r = PV.rng(77);
    const codes = Array.from({ length: M + 1 }, () => Array.from({ length: 8 }, () => Math.floor(r() * 128)));
    const palette = [C.arch, C.train, C.reason, C.speed, C.inside];
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      pt += dt;
      if (pt > 3 && !PV.reduceMotion) { pt = 0; phase = (phase + 1) % phases.length; cap.set(phases[phase]); }
      const top = 70, tw = (W - 40) / toks.length;
      const yT = top, yC = top + 90, yQ = top + 160, yP = top + 240;
      // tokens
      toks.forEach((tk, i) => {
        const g = Math.floor(i / k);
        const on = phase >= 1;
        PV.box(ctx, 20 + i * tw + 1, yT, tw - 2, 30, { r: 5, fill: on ? PV.alpha(palette[g % 5], 0.25) : C.panel, stroke: on ? palette[g % 5] : C.line2 });
        const ft = PV.fit(ctx, tk.trim(), tw - 6, 12, { weight: 700 });
        PV.text(ctx, ft.text, 20 + i * tw + tw / 2, yT + 15, { size: ft.size, align: "center", weight: 700 });
      });
      PV.text(ctx, "tokens", 20, yT - 12, { size: 10.5, font: FONT.mono, color: C.ink3 });
      // concepts
      if (phase >= 1) {
        for (let m = 0; m < M; m++) {
          const x = 20 + m * k * tw, w = k * tw;
          ctx.strokeStyle = PV.alpha(palette[m % 5], 0.6);
          ctx.beginPath(); ctx.moveTo(x + w / 2, yT + 32); ctx.lineTo(x + w / 2, yC - 4); ctx.stroke();
          PV.box(ctx, x + 6, yC, w - 12, 34, { r: 8, fill: PV.alpha(palette[m % 5], 0.35), stroke: palette[m % 5] });
          PV.text(ctx, `concept ${m + 1}`, x + w / 2, yC + 17, { size: 12, weight: 700, align: "center" });
        }
        PV.text(ctx, "concepts (mean of 4 token states)", 20, yC - 12, { size: 10.5, font: FONT.mono, color: C.ink3 });
      }
      // quantised codes
      if (phase >= 2) {
        for (let m = 0; m < M; m++) {
          const x = 20 + m * k * tw + 8, w = k * tw - 16, sw = w / 8;
          codes[m].forEach((c, s) => {
            PV.box(ctx, x + s * sw + 1, yQ, sw - 2, 30, { r: 3, fill: PV.alpha(palette[c % 5], 0.25 + (c / 128) * 0.6) });
            if (sw > 22) PV.text(ctx, String(c), x + s * sw + sw / 2, yQ + 15, { size: 9.5, font: FONT.mono, align: "center" });
          });
        }
        PV.text(ctx, "codes: 8 of the 32 segments shown, each one of 128 codewords", 20, yQ - 12, { size: 10.5, font: FONT.mono, color: C.ink3 });
      }
      // concept module predicting next
      if (phase >= 3) {
        const x = 20 + (M - 1) * k * tw + 8, w = k * tw - 16;
        const bx = Math.min(W - w - 20, x);
        PV.box(ctx, 20, yP, W - 40, 40, { r: 10, fill: C.panel2, stroke: api.color });
        PV.text(ctx, "Concept module: concepts 1…2 → predict concept 3", 34, yP + 20, { size: 12.5, weight: 700 });
        const glowA = 0.5 + 0.5 * Math.sin(t * 4);
        ctx.shadowColor = C.glow; ctx.shadowBlur = 14 * glowA;
        PV.box(ctx, bx, yP + 50, w, 26, { r: 6, fill: PV.alpha(C.glow, 0.25), stroke: C.glow });
        ctx.shadowBlur = 0;
        PV.text(ctx, PV.fit(ctx, "ĉ₃ = weighted mix of codewords", w - 8, 11).text, bx + w / 2, yP + 63, { size: 11, align: "center", color: C.glow });
      }
      if (phase >= 4) {
        const x = 20 + (M - 1) * k * tw;
        for (let i = 0; i < k; i++) {
          const tx = x + i * tw + tw / 2;
          PV.arrow(ctx, tx, yP + 48, tx, yT + 34, { color: PV.alpha(C.glow, 0.7), lw: 1.5 });
        }
        PV.text(ctx, "added to these token positions to guide the next words", x, yP + 94, { size: 11.5, color: C.glow });
      }
    });
    const ctl = PV.controls(root);
    ctl.button("◀", () => { phase = (phase + phases.length - 1) % phases.length; pt = -20; cap.set(phases[phase]); });
    ctl.button("▶ next step", () => { phase = (phase + 1) % phases.length; pt = -20; cap.set(phases[phase]); });
    PV.note(root, "schematic");
    return () => st.stop();
  });

  PV.register({
    id: "ncp",
    short: "Next Concept Prediction",
    title: "NCP-ArchPreview: Moving towards Latent Space Language Models through Next Concept Prediction",
    year: 2026, date: "2026-09",
    track: "arch", era: "frontier",
    authors: "Intern-NCP Team (Shanghai AI Lab, LUMIA Lab at Shanghai Jiao Tong University)",
    arxiv: "2609.10715", url: "https://arxiv.org/abs/2609.10715",
    oneLiner: "Besides predicting the next token, the model predicts the next concept (a 4-token chunk in a learned, quantised latent space). It reaches OLMo-3-7B's final loss on about half the data.",
    why: "Published this month and trending. It's the largest demonstration yet of a “latent-space” language model, an idea that researchers from JEPA to Large Concept Models have pushed for years.",
    signals: { impact: 3, novelty: 5, momentum: 5 },
    tags: ["latent space", "concepts", "vector quantisation", "product quantisation", "efficiency"],
    builds: ["attention", "llada", "attnres", "specdec"],
    slides: [
      {
        k: "The problem",
        t: "Next-token prediction supervises one tiny piece at a time.",
        h: `<p>Standard LLMs learn only one thing directly: the next token. Higher-level structure (ideas, plans, the gist of the next phrase) has to emerge <b>indirectly</b>, because no objective asks for it.</p>
            <p>Other fields found that learning in a compact <b>latent space</b> pays off. Image generators got much better once they worked in a compressed representation instead of raw pixels (latent diffusion). Can language models also learn at a level above tokens without giving up normal token-by-token generation?</p>`,
        analogy: "Learning to write by predicting one letter at a time, versus also being quizzed on “what's the next idea?”. The second gives you a much stronger signal about structure.",
      },
      {
        k: "The big idea",
        t: "Predict the next concept too.",
        h: `<p>NCP-ArchPreview (built from OLMo-3-7B, 8.9B parameters) has three parts:</p>
            <ol><li><b>Token encoder</b> (16 layers): normal token processing.</li>
            <li><b>Concept module</b> (8 layers): every 4 token states are averaged into a <b>concept</b>, snapped to a learned discrete vocabulary, and the module predicts the <b>next concept</b>.</li>
            <li><b>Token decoder</b> (16 layers): the predicted concept is added back into the token stream, guiding next-token prediction.</li></ol>
            <p>Both losses (next token and next concept) train together, end to end. Output is still ordinary token-by-token text.</p>`,
        v: { type: "ncpflow" },
      },
      {
        k: "The concept vocabulary",
        t: "Product quantisation: 32 small codebooks, astronomically many concepts.",
        h: `<p>A single codebook with enough entries to name every possible concept would be enormous. Instead, each concept vector is split into <b>32 segments</b>, and each segment picks one of <b>128 codewords</b>.</p>
            <p>That gives 128³² possible concepts (about 10⁶⁷) from tiny codebooks. The concept module predicts a probability over codewords for each segment and takes a <b>weighted mix</b>, which keeps everything differentiable and anchored to the learned vocabulary instead of drifting freely.</p>`,
        analogy: "Describing any face with 32 features (eye shape, nose width, …), each chosen from 128 options. Small lists, but together they cover almost any face.",
        eq: `concept = [ seg₁ | seg₂ | … | seg₃₂ ],   segᵢ ∈ {128 codewords}   →   128³² combinations`,
      },
      {
        k: "Results",
        t: "Same loss with about half the tokens.",
        h: `<p>Trained on the same 5.73T tokens (Dolma 3) as OLMo-3-7B, the largest latent-space LM demonstration to date:</p>
            <ul><li>Reached OLMo-3-7B's <b>final</b> pre-training loss after only <b>51.3%</b> of the tokens (1.95× faster convergence).</li>
            <li>After full pre-training: <b>+2.45 points</b> on the downstream average, including <b>+5.99 on GSM8K</b>.</li>
            <li>Controlled ablations (matched compute and matched parameters) show the gains come from the latent hierarchy and the NCP objective, not just extra size.</li></ul>`,
        v: { type: "bars",
          title: "Tokens needed to reach OLMo-3-7B's final loss",
          subtitle: "trillions of training tokens · from the paper",
          items: [{ label: "OLMo-3-7B", value: 5.73 }, { label: "NCP-ArchPreview", value: 2.94, hi: true }],
          fmt: (v) => v.toFixed(2) + "T" } },
      {
        k: "Bonus uses",
        t: "The concept space is useful after training.",
        h: `<ul><li><b>Cheap domain adaptation:</b> updating only the <b>17M-parameter</b> quantisation module (about 0.2% of the model) adapts it to a new domain.</li>
            <li><b>Faster decoding:</b> feeding concept representations into a speculative-decoding drafter raised its mean accepted length by <b>4.17%</b>, with negligible overhead.</li></ul>
            <p>Checkpoints every 100k steps, drafter models and final weights are released.</p>`,
      },
      {
        k: "Why it matters",
        t: "A step toward models that think above the token level.",
        h: `<p>Several threads meet here: <b>JEPA</b>-style latent prediction (LeCun), Meta's <b>Large Concept Models</b>, <b>multi-token prediction</b>, and hierarchical models like H-Net. NCP shows the latent-space idea holding up at a real scale (8.9B, 5.7T tokens) while staying compatible with ordinary autoregressive generation and serving.</p>
            <p>Caveat: it's labelled an “ArchPreview”, a first large demonstration rather than a finished product. Watch for scaling beyond 10B and for whether reasoning (RL) benefits too.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What is a “concept” in NCP-ArchPreview?", options: ["A single word", "A quantised summary of a chunk of 4 token states", "A whole sentence embedding from another model", "A topic label written by humans"], a: 1, why: "Every 4 token states are mean-pooled and snapped to a product-quantised codebook." },
      { q: "Does NCP stop generating token by token?", options: ["Yes, it outputs concepts", "No, it still generates tokens and uses predicted concepts as extra guidance", "It generates in parallel like diffusion", "Only at inference"], a: 1, why: "NTP and NCP are trained jointly. Output stays standard autoregressive text." },
    ],
    terms: [
      ["Latent space", "A learned, compressed representation space where a model can make predictions."],
      ["Next concept prediction", "Predicting a representation of the next chunk of text, not just the next token."],
      ["Vector quantisation (VQ)", "Snapping a continuous vector to the nearest entry in a learned codebook."],
      ["Product quantisation", "Splitting a vector into segments, each quantised with its own small codebook."],
      ["JEPA", "Joint-embedding predictive architecture: learning by predicting representations instead of raw data."],
    ],
    next: ["llada", "attnres", "chinchilla"],
  });
})();
