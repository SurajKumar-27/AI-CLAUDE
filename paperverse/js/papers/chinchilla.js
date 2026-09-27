/* Training Compute-Optimal Large Language Models (Hoffmann et al., 2022) — "Chinchilla" */
(function () {
  const { h, C, FONT } = PV;
  // The paper's fitted loss (Approach 3): L(N, D) = E + A/N^α + B/D^β
  const E = 1.69, A = 406.4, B = 410.7, al = 0.34, be = 0.28;
  const loss = (N, D) => E + A / Math.pow(N, al) + B / Math.pow(D, be);

  PV.defineViz("isoflop", (root, o, api) => {
    let logC = Math.log10(5.76e23), view = "curve";
    const cap = PV.caption(root, "");
    const models = [
      { name: "GPT-3", N: 175e9, D: 300e9, color: C.ink2, dy: -14 },
      { name: "Gopher", N: 280e9, D: 300e9, color: C.train, dy: 16 },
      { name: "Chinchilla", N: 70e9, D: 1.4e12, color: C.glow, dy: -16, left: true },
    ];
    const later = [
      { name: "Llama 2 70B", N: 70e9, D: 2e12 },
      { name: "Llama 3 8B", N: 8e9, D: 15e12 },
      { name: "Llama 3 70B", N: 70e9, D: 15e12 },
    ];
    const st = PV.canvasLoop(root, (ctx, W, H) => {
      const Lx = 60, R = 24, T = 56, Bm = 110;
      const pw = W - Lx - R, ph = H - T - Bm;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      if (view === "curve") {
        const Cf = Math.pow(10, logC);
        const xmin = 8, xmax = 12.3;
        const pts = [];
        for (let i = 0; i <= 200; i++) {
          const lx = xmin + ((xmax - xmin) * i) / 200, N = Math.pow(10, lx), D = Cf / (6 * N);
          pts.push([lx, loss(N, D), N, D]);
        }
        const best = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
        const ymin = best[1] - 0.05, ymax = best[1] + 0.9;
        const X = (lx) => Lx + ((lx - xmin) / (xmax - xmin)) * pw;
        const Y = (l) => T + (1 - (l - ymin) / (ymax - ymin)) * ph;
        for (let lx = 8; lx <= 12; lx++) {
          ctx.beginPath(); ctx.moveTo(X(lx), T); ctx.lineTo(X(lx), T + ph); ctx.stroke();
          PV.text(ctx, ["100M", "1B", "10B", "100B", "1T"][lx - 8], X(lx), T + ph + 14, { size: 10.5, font: FONT.mono, align: "center", color: C.ink3 });
        }
        PV.text(ctx, "model size (parameters) → the rest of the budget goes to data", Lx + pw / 2, T + ph + 34, { size: 11.5, align: "center", color: C.ink2 });
        PV.text(ctx, "loss ↓ better", 10, T - 14, { size: 11, color: C.ink2 });
        ctx.save();
        ctx.beginPath(); ctx.rect(Lx, T, pw, ph); ctx.clip();
        ctx.strokeStyle = api.color; ctx.lineWidth = 3;
        ctx.beginPath();
        pts.forEach(([lx, l], i) => (i ? ctx.lineTo(X(lx), Y(l)) : ctx.moveTo(X(lx), Y(l))));
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.glow;
        ctx.beginPath(); ctx.arc(X(best[0]), Y(best[1]), 7, 0, 7); ctx.fill();
        PV.text(ctx, "sweet spot", X(best[0]), Y(best[1]) + 20, { size: 12, weight: 700, align: "center", color: C.glow });
        // reference models that sit on roughly this budget
        models.forEach((m) => {
          const cm = 6 * m.N * m.D;
          if (Math.abs(Math.log10(cm) - logC) > 0.35) return;
          const lm = loss(m.N, Cf / (6 * m.N));
          const x = X(Math.log10(m.N)), y = Y(lm);
          if (y < T || y > T + ph) return;
          ctx.fillStyle = m.color;
          ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
          PV.text(ctx, m.name, m.left ? x - 8 : x + 8, y + (m.dy || -10), { size: 11.5, weight: 700, color: m.color, align: m.left ? "right" : "left" });
        });
        const fmt = (v) => (v >= 1e12 ? (v / 1e12).toFixed(1) + "T" : v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : (v / 1e6).toFixed(0) + "M");
        cap.set(`Budget <b>${Cf.toExponential(1)} FLOPs</b> → best: <b style="color:${C.glow}">${fmt(best[2])} params on ${fmt(best[3])} tokens</b> (${(best[3] / best[2]).toFixed(0)} tokens per parameter)`);
      } else {
        const xmin = 9.5, xmax = 12, ymin = 11, ymax = 13.5;
        const X = (v) => Lx + ((Math.log10(v) - xmin) / (xmax - xmin)) * pw;
        const Y = (v) => T + (1 - (Math.log10(v) - ymin) / (ymax - ymin)) * ph;
        [10, 11, 12].forEach((e) => { ctx.beginPath(); ctx.moveTo(X(10 ** e), T); ctx.lineTo(X(10 ** e), T + ph); ctx.stroke(); PV.text(ctx, ["10B", "100B", "1T"][e - 10], X(10 ** e), T + ph + 14, { size: 10.5, font: FONT.mono, align: "center", color: C.ink3 }); });
        [11, 12, 13].forEach((e) => { ctx.beginPath(); ctx.moveTo(Lx, Y(10 ** e)); ctx.lineTo(Lx + pw, Y(10 ** e)); ctx.stroke(); PV.text(ctx, ["100B", "1T", "10T"][e - 11], Lx - 6, Y(10 ** e), { size: 10.5, font: FONT.mono, align: "right", color: C.ink3 }); });
        PV.text(ctx, "parameters", Lx + pw / 2, T + ph + 34, { size: 11.5, align: "center", color: C.ink2 });
        PV.text(ctx, "training tokens", 10, T - 14, { size: 11, color: C.ink2 });
        ctx.strokeStyle = C.glow; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(10 ** 9.5), Y(20 * 10 ** 9.5)); ctx.lineTo(X(10 ** 12), Y(20 * 10 ** 12)); ctx.stroke(); ctx.setLineDash([]);
        PV.text(ctx, "≈ 20 tokens per parameter", X(10 ** 10.6), Y(20 * 10 ** 10.6) - 14, { size: 11.5, color: C.glow, weight: 700 });
        [...models, ...later.map((m) => ({ ...m, color: C.speed }))].forEach((m) => {
          ctx.fillStyle = m.color;
          ctx.beginPath(); ctx.arc(X(m.N), Y(m.D), 6, 0, 7); ctx.fill();
          PV.text(ctx, m.name, X(m.N) + 9, Y(m.D) + 1, { size: 11.5, weight: 700, color: m.color });
        });
        cap.set(`<b>Below the line:</b> too little data for the size (GPT-3, Gopher). <b style="color:${C.speed}">Far above it:</b> later models deliberately over-train small models, because they're cheaper to run.`);
      }
    });
    const ctl = PV.controls(root);
    ctl.toggle([["curve", "Fixed budget"], ["map", "Real models"]], "curve", (v) => (view = v));
    ctl.slider("Compute", { min: 20, max: 25, step: 0.05, value: logC, fmt: (v) => "10^" + v.toFixed(1), onInput: (v) => (logC = v) });
    return () => st.stop();
  });

  PV.register({
    id: "chinchilla",
    short: "Chinchilla",
    title: "Training Compute-Optimal Large Language Models",
    year: 2022, date: "2022-03",
    track: "train", era: "foundation",
    authors: "Hoffmann, Borgeaud, Mensch, Buchatskaya, Cai, Rutherford et al. (DeepMind)",
    venue: "NeurIPS 2022",
    arxiv: "2203.15556", url: "https://arxiv.org/abs/2203.15556",
    oneLiner: "For a fixed compute budget, grow the model and the data equally, about 20 tokens per parameter. Most big models of the time were far too data-starved.",
    why: "It rewrote how every lab budgets a training run, and it made data, not parameter count, the thing everyone competes on.",
    signals: { impact: 5, novelty: 4, momentum: 3 },
    tags: ["scaling laws", "compute", "tokens", "parameters", "data"],
    builds: ["gpt3"],
    slides: [
      {
        k: "The problem",
        t: "You have one giant GPU budget. How do you spend it?",
        h: `<p>Training compute is roughly <b>6 × parameters × tokens</b>. With a fixed budget you can train a <b>bigger model on less data</b>, or a <b>smaller model on more data</b>.</p>
            <p>An influential 2020 study (Kaplan et al.) suggested putting most extra compute into model size. So labs built giants: GPT-3 (175B), Gopher (280B), Megatron-Turing (530B), all trained on only about 300 billion tokens.</p>`,
        analogy: "A fixed study budget: hire a more brilliant student who reads only a few books, or a slightly less brilliant one who reads the whole library? Chinchilla says balance them.",
        eq: `Compute ≈ 6 · N · D<small>N = number of parameters, D = number of training tokens</small>`,
      },
      {
        k: "The experiment",
        t: "Train 400+ models and find the sweet spot.",
        h: `<p>DeepMind trained over <b>400 models</b>, from 70 million to 16 billion parameters, on 5 to 500 billion tokens. They then fitted a formula for loss as a function of size and data:</p>
            <p>Each budget gives a U-shaped curve (an <b>IsoFLOP curve</b>): too small a model can't learn enough, and too big a model doesn't see enough data. The bottom of the U is the compute-optimal model.</p>
            <p>Drag the compute slider. The curve on the right uses the paper's own fitted formula. This particular fit (the paper's Approach 3) prefers somewhat smaller models than the other two methods, which gave the famous rule of about 20 tokens per parameter.</p>`,
        eq: `L(N, D) = 1.69 + 406.4 / N^0.34 + 410.7 / D^0.28<small>the paper's fitted loss (Approach 3)</small>`,
        v: { type: "isoflop" },
      },
      {
        k: "The finding",
        t: "Scale parameters and data equally.",
        h: `<p>All three of the paper's methods agree: when compute grows 10×, the ideal model grows about <b>3.2×</b> and the data grows about <b>3.2×</b>. The rule of thumb that fell out is about <b>20 training tokens per parameter</b>.</p>
            <p>Switch to “Real models” on the right: GPT-3 and Gopher sit far below the line, meaning they were <b>undertrained</b>. With the same compute, they should have been about 4× smaller and trained on 4× more data.</p>`,
        v: { type: "isoflop" },
      },
      {
        k: "Results",
        t: "A 70B model beat a 280B one on the same budget.",
        h: `<p>To prove it, they trained <b>Chinchilla</b>: 70B parameters on 1.4 trillion tokens, the same compute as their own 280B Gopher (300B tokens).</p>
            <p>Chinchilla beat Gopher, GPT-3 and Megatron-Turing NLG on a wide range of benchmarks. On MMLU (57 school and professional subjects) it scored <b>67.5%</b>, a 7.5-point jump over Gopher. Being 4× smaller, it's also 4× cheaper to run.</p>`,
        v: { type: "bars",
          title: "MMLU, 5-shot accuracy",
          subtitle: "same training compute, very different allocation",
          items: [
            { label: "Gopher 280B · 300B tokens", value: 60.0 },
            { label: "Chinchilla 70B · 1.4T tokens", value: 67.5, hi: true },
          ],
          max: 100, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "Data became the bottleneck.",
        h: `<p>After Chinchilla, the race shifted from “most parameters” to <b>“most good tokens”</b>. That kicked off massive investment in data collection, filtering and synthetic data.</p>
            <p><b>The plot twist:</b> Chinchilla optimises <b>training</b> cost only. A model is trained once but served billions of times, so labs now deliberately train smaller models far <b>past</b> the Chinchilla point. Llama 3 8B saw about 15 trillion tokens, roughly 1,900 per parameter. Those extra tokens make a small model that's cheap to run.</p>
            <p>That same inference-first thinking drives Mamba-3, Nemotron 3 Super and NCP later in this collection.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What did Chinchilla find about the ideal model size vs data?", options: ["Mostly grow the model", "Mostly grow the data", "Grow both in roughly equal proportion", "Data doesn't matter"], a: 2, why: "Compute-optimal training scales parameters and tokens about equally, around 20 tokens per parameter." },
      { q: "Why do labs now train small models on far more than 20 tokens per parameter?", options: ["Chinchilla was wrong", "It makes models cheaper to serve, which matters more than training cost", "It's required by law", "Small models can't learn otherwise"], a: 1, why: "Chinchilla minimises training compute. Serving cost dominates for popular models, so over-training a small model pays off." },
    ],
    terms: [
      ["Scaling law", "A formula predicting loss from model size, data and compute."],
      ["Compute-optimal", "The size/data split that gives the lowest loss for a given training budget."],
      ["FLOPs", "Floating-point operations, the standard unit of training compute."],
      ["IsoFLOP curve", "Loss across model sizes when total compute is held fixed."],
      ["Undertrained", "A model that would have been better if trained on more data."],
    ],
    next: ["instructgpt", "mixtral", "ncp"],
  });
})();
