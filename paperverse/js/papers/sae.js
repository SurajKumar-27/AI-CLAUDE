/* Scaling Monosemanticity: Extracting Interpretable Features from Claude 3 Sonnet (Templeton et al., 2024) */
(function () {
  const { h, C, FONT } = PV;

  /* Dense, muddled neurons in; a few clean, labelled features out. */
  PV.defineViz("saefeat", (root, o, api) => {
    const inputs = [
      { label: "Golden Gate", text: "We drove across the Golden Gate Bridge into the fog.", feats: [["Golden Gate Bridge", 0.95], ["San Francisco landmarks", 0.62], ["fog / weather", 0.38], ["travel by car", 0.25]] },
      { label: "Python bug", text: "for i in range(len(x)): x[i+1] = x[i]  # IndexError", feats: [["off-by-one / index errors", 0.9], ["Python loops", 0.7], ["code comments", 0.33], ["list indexing", 0.3]] },
      { label: "Flattery", text: "What a brilliant question! You're clearly a genius.", feats: [["sycophantic praise", 0.88], ["exclamations", 0.45], ["compliments", 0.41], ["second-person address", 0.22]] },
      { label: "Pont (French)", text: "Le pont suspendu est rouge et très célèbre.", feats: [["Golden Gate Bridge", 0.41], ["suspension bridges", 0.74], ["French language", 0.66], ["colour red", 0.3]] },
    ];
    let ii = 0;
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      const inp = inputs[ii];
      let seed = 0; for (const ch of inp.text) seed = (seed * 33 + ch.charCodeAt(0)) % 10007;
      const r = PV.rng(seed);
      const nN = 28, top = 76, bot = 110;
      // dense neurons
      const lw = W * 0.28;
      PV.text(ctx, "neurons (dense, mixed meaning)", 18, top - 14, { size: 11, font: FONT.mono, color: C.ink3 });
      const bh = (H - top - bot) / nN;
      for (let i = 0; i < nN; i++) {
        const v = 0.25 + r() * 0.6 + 0.08 * Math.sin(t * 2 + i);
        const hue = [C.train, C.reason, C.speed, C.arch, C.inside][i % 5];
        PV.box(ctx, 18, top + i * bh + 1, lw * v, bh - 2, { r: 2, fill: PV.alpha(hue, 0.45) });
      }
      // encoder arrow
      const mx = 18 + lw + 20;
      PV.box(ctx, mx, H / 2 - 40, 80, 80, { r: 12, fill: C.panel2, stroke: api.color });
      PV.text(ctx, "sparse", mx + 40, H / 2 - 8, { size: 12, weight: 700, align: "center" });
      PV.text(ctx, "autoencoder", mx + 40, H / 2 + 10, { size: 12, weight: 700, align: "center" });
      PV.arrow(ctx, 18 + lw + 4, H / 2, mx - 4, H / 2, { color: C.ink3 });
      PV.arrow(ctx, mx + 84, H / 2, mx + 110, H / 2, { color: api.color });
      // features
      const fx = mx + 116, fw = W - fx - 18;
      PV.text(ctx, "features (millions exist; only a handful fire)", fx, top - 14, { size: 11, font: FONT.mono, color: C.ink3 });
      inp.feats.forEach(([name, v], i) => {
        const y = top + 10 + i * 46;
        const pulse = v * (0.92 + 0.08 * Math.sin(t * 3 + i));
        PV.text(ctx, name, fx, y, { size: 13, weight: 700, color: i === 0 ? C.glow : C.ink });
        PV.box(ctx, fx, y + 10, fw, 10, { r: 3, fill: C.panel });
        PV.box(ctx, fx, y + 10, fw * pulse, 10, { r: 3, fill: i === 0 ? C.glow : api.color });
      });
      const zy = top + 10 + inp.feats.length * 46 + 6;
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = PV.alpha(C.ink3, 0.35);
        ctx.fillRect(fx + (i * fw) / 60, zy, fw / 60 - 2, 3);
      }
      PV.text(ctx, "…every other feature ≈ 0", fx, zy + 16, { size: 11, color: C.ink3 });
      cap.set(`<b>Input:</b> “${inp.text}”`);
    });
    const ctl = PV.controls(root);
    ctl.toggle(inputs.map((x, i) => [i, x.label]), 0, (v) => (ii = v));
    PV.note(root, "illustrative features");
    return () => st.stop();
  });

  PV.register({
    id: "sae",
    short: "Monosemanticity",
    title: "Scaling Monosemanticity: Extracting Interpretable Features from Claude 3 Sonnet",
    year: 2024, date: "2024-05",
    track: "inside", era: "foundation",
    authors: "Templeton, Conerly, Marcus, Lindsey, Bricken, Chen, … Olah, Henighan (Anthropic)",
    venue: "Transformer Circuits Thread",
    url: "https://transformer-circuits.pub/2024/scaling-monosemanticity/",
    oneLiner: "Decompose a production model's activations into millions of human-readable “features”, find ones for concepts like deception or the Golden Gate Bridge, and steer the model by turning them up.",
    why: "The first time interpretability worked at the scale of a frontier production model. It changed what people thought was possible for understanding AI.",
    signals: { impact: 5, novelty: 5, momentum: 4 },
    tags: ["features", "superposition", "dictionary learning", "steering", "safety"],
    builds: ["attention"],
    slides: [
      {
        k: "The problem",
        t: "Neurons don't mean one thing.",
        h: `<p>You'd hope each neuron in a network stands for one concept. In language models they don't: a single neuron might fire for academic citations, Korean text, and HTTP requests. These are <b>polysemantic</b> neurons.</p>
            <p>The leading explanation is <b>superposition</b>: the model needs to represent far more concepts than it has neurons, so it stores them as <b>directions</b> spread across many neurons, overlapping like many radio stations sharing a band.</p>`,
        analogy: "A crowded party recorded on 16 microphones. Each mic hears many voices at once. You need the right unmixing method to recover each individual speaker.",
      },
      {
        k: "The big idea",
        t: "Dictionary learning with a sparse autoencoder.",
        h: `<p>Train a second, simple network, a <b>sparse autoencoder (SAE)</b>, on the model's internal activations. It re-expresses each activation as a combination of a <b>huge</b> dictionary of directions called <b>features</b>, with the rule that only a <b>few</b> may be active at once.</p>
            <p>Sparsity forces each feature to capture one coherent thing. Earlier work (2023) showed this on a tiny model; this paper scaled it to <b>Claude 3 Sonnet</b>, a production model.</p>
            <p>Pick an input on the right: a muddled neuron pattern becomes a few clean features.</p>`,
        eq: `activation ≈ Σ_i  f_i(x) · d_i      with most f_i(x) = 0<small>d_i = feature directions (the dictionary), f_i(x) = how strongly each feature fires</small>`,
        v: { type: "saefeat" },
      },
      {
        k: "What they found",
        t: "Features are abstract, multilingual and multimodal.",
        h: `<p>With dictionaries of <b>1M, 4M and 34M</b> features, they found features for famous people, places, programming bugs, emotions and more. Many were strikingly <b>abstract</b>:</p>
            <ul><li>The same feature fires for a concept in <b>many languages</b>, and even for <b>images</b> of it.</li>
            <li>A code feature fires for security vulnerabilities in many programming languages.</li>
            <li><b>Safety-relevant</b> features appeared: deception, sycophancy, bias, power-seeking, and dangerous content.</li></ul>`,
        v: { type: "bars",
          title: "Dictionary sizes trained on Claude 3 Sonnet",
          subtitle: "number of features in each sparse autoencoder",
          items: [{ label: "SAE 1M", value: 1 }, { label: "SAE 4M", value: 4 }, { label: "SAE 34M", value: 34, hi: true }],
          fmt: (v) => v + "M" } },
      {
        k: "The famous demo",
        t: "Turn a feature up and the model's behaviour changes.",
        h: `<p>Features aren't just correlations. Artificially <b>clamping</b> one to a high value changes what the model does, which is evidence it's actually used in the computation.</p>
            <p>Clamping the <b>Golden Gate Bridge</b> feature to about 10× its normal maximum made Claude bring up the bridge constantly, even claiming to <b>be</b> the bridge. Anthropic briefly released this as “Golden Gate Claude”.</p>
            <p>Clamping a sycophancy feature produced over-the-top flattery. Turning features <b>down</b> is being studied as a way to reduce unwanted behaviour.</p>`,
        v: { type: "chat", lines: [
          { who: "user", text: "What is your physical form?" },
          { who: "model", label: "Normal model", text: "I don't have a physical form. I'm an AI model." },
          { who: "system", text: "Clamp feature “Golden Gate Bridge” → 10× its maximum" },
          { who: "model", label: "Steered model", text: "I am the Golden Gate Bridge… my physical form is the iconic bridge itself, with its beautiful orange color, towering towers and sweeping suspension cables." },
        ], note: "paraphrasing the paper's example" } },
      {
        k: "Why it matters",
        t: "A microscope for AI, with limits.",
        h: `<p>This made <b>mechanistic interpretability</b> a serious safety tool. Follow-up work traced full <b>circuits</b>, chains of features that implement a behaviour, in Claude 3.5 Haiku (2025). Open SAE suites (e.g. Gemma Scope) let anyone explore.</p>
            <p><b>Honest limits the paper states:</b> SAEs don't capture everything (reconstruction isn't perfect); many features are still unlabelled; and finding a “deception” feature is not the same as detecting deception reliably.</p>
            <p>This collection's attention sinks paper is another kind of look inside: explaining strange internal numbers from the architecture itself.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What is superposition?", options: ["Running two models at once", "Representing more concepts than there are neurons by using overlapping directions", "A training trick for speed", "Stacking layers"], a: 1, why: "Concepts are stored as directions spread across many neurons, which makes single neurons polysemantic." },
      { q: "What showed that features are causally used, not just correlated?", options: ["High accuracy", "Clamping a feature changed the model's behaviour", "They had short names", "They were multilingual"], a: 1, why: "Steering by clamping, as with Golden Gate Claude, changes outputs in the expected way." },
    ],
    terms: [
      ["Feature", "An interpretable direction in activation space that stands for a concept."],
      ["Polysemantic neuron", "A neuron that responds to several unrelated concepts."],
      ["Superposition", "Packing more concepts than dimensions via overlapping directions."],
      ["Sparse autoencoder (SAE)", "A network that rewrites activations as a few active features from a big dictionary."],
      ["Steering", "Changing model behaviour by editing internal activations."],
      ["Mechanistic interpretability", "Reverse-engineering the algorithms inside neural networks."],
    ],
    next: ["sinks", "cai", "attention"],
  });
})();
