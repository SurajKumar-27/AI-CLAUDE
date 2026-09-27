/* LoRA: Low-Rank Adaptation of Large Language Models (Hu et al., 2021) */
(function () {
  const { h, C, FONT } = PV;

  PV.defineViz("lora", (root, o, api) => {
    let r = 8, d = 4096;
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      const top = 64, bot = 110;
      const S = Math.min(W * 0.4, H - top - bot);
      const x0 = 24, y0 = top + 8;
      // frozen W
      const cells = 16;
      for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
        const v = Math.sin(i * 1.7 + j * 0.9) * Math.cos(i * 0.3 - j * 1.3);
        ctx.fillStyle = PV.alpha(C.reason, 0.12 + 0.18 * Math.abs(v));
        ctx.fillRect(x0 + (i * S) / cells, y0 + (j * S) / cells, S / cells - 1, S / cells - 1);
      }
      // ΔW overlay pulses in
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
      ctx.fillStyle = PV.alpha(api.color, 0.08 + 0.12 * pulse);
      ctx.fillRect(x0, y0, S, S);
      PV.box(ctx, x0, y0, S, S, { r: 4, stroke: C.reason, lw: 1.5 });
      PV.text(ctx, "W  (frozen ❄)", x0 + S / 2, y0 - 16, { size: 13, weight: 700, align: "center", color: C.reason });
      PV.text(ctx, `${d.toLocaleString()} × ${d.toLocaleString()}`, x0 + S / 2, y0 + S + 16, { size: 11, font: FONT.mono, align: "center", color: C.ink3 });
      PV.text(ctx, "+", x0 + S + 18, y0 + S / 2, { size: 26, weight: 700, align: "center", color: C.ink2 });
      // B (d × r) and A (r × d): thickness shows the rank
      const thick = Math.max(4, (r / 64) * S * 0.28);
      const bx = x0 + S + 38;
      PV.box(ctx, bx, y0, thick, S, { r: 3, fill: PV.alpha(api.color, 0.75), stroke: api.color });
      PV.text(ctx, "B", bx + thick / 2, y0 - 16, { size: 13, weight: 700, align: "center", color: api.color });
      PV.text(ctx, `${d.toLocaleString()}×${r}`, bx + thick / 2, y0 + S + 16, { size: 10.5, font: FONT.mono, align: "center", color: C.ink3 });
      const ax = bx + thick + 18;
      PV.text(ctx, "×", ax - 9, y0 + S / 2, { size: 18, align: "center", color: C.ink2 });
      const aw = Math.min(S, W - ax - 20);
      PV.box(ctx, ax, y0, aw, thick, { r: 3, fill: PV.alpha(api.color, 0.75), stroke: api.color });
      PV.text(ctx, "A", ax + aw / 2, y0 - 16, { size: 13, weight: 700, align: "center", color: api.color });
      PV.text(ctx, `${r}×${d.toLocaleString()}`, ax + aw / 2, y0 + thick + 14, { size: 10.5, font: FONT.mono, align: "center", color: C.ink3 });
      // counts
      const full = d * d, lora = 2 * d * r;
      const by = y0 + S + 44;
      const bw = W - 48;
      PV.text(ctx, `Full fine-tune trains ${full.toLocaleString()} numbers in this one matrix`, 24, by, { size: 12, color: C.ink2 });
      PV.box(ctx, 24, by + 10, bw, 10, { r: 3, fill: C.reason });
      PV.text(ctx, `LoRA trains ${lora.toLocaleString()} (${((lora / full) * 100).toFixed(2)}%)`, 24, by + 36, { size: 12, color: C.ink2 });
      PV.box(ctx, 24, by + 46, Math.max(2, (bw * lora) / full), 10, { r: 3, fill: api.color });
      cap.set(`<b>W′ = W + B·A.</b> Only the thin matrices B and A are trained. Drag the rank.`);
    });
    const ctl = PV.controls(root);
    ctl.slider("Rank r", { min: 1, max: 64, value: 8, onInput: (v) => (r = v) });
    ctl.toggle([[4096, "d = 4,096 (7B-class)"], [12288, "d = 12,288 (GPT-3)"]], 4096, (v) => (d = v));
    return () => st.stop();
  });

  PV.register({
    id: "lora",
    short: "LoRA",
    title: "LoRA: Low-Rank Adaptation of Large Language Models",
    year: 2021, date: "2021-06",
    track: "train", era: "foundation",
    authors: "Hu, Shen, Wallis, Allen-Zhu, Li, Wang, Wang, Chen (Microsoft)",
    venue: "ICLR 2022",
    arxiv: "2106.09685", url: "https://arxiv.org/abs/2106.09685",
    oneLiner: "Freeze the giant model and train two tiny matrices beside each weight. Fine-tuning gets about 10,000× smaller to store.",
    why: "The reason ordinary people can fine-tune big models on one GPU. LoRA adapters are everywhere, from chat models to image generators.",
    signals: { impact: 5, novelty: 4, momentum: 4 },
    tags: ["fine-tuning", "adapters", "low rank", "PEFT", "frozen weights"],
    builds: ["gpt3"],
    slides: [
      {
        k: "The problem",
        t: "Fine-tuning a giant model means copying a giant model.",
        h: `<p>Full fine-tuning updates <b>every</b> parameter. For GPT-3 that's 175 billion numbers: about <b>350 GB per task</b> to store, and around 1.2 TB of GPU memory to train (the optimizer keeps extra copies of everything).</p>
            <p>Want a legal version, a medical version and a customer-support version? That's three full copies. Previous shortcuts (adapter layers, prompt tuning) either slowed the model down or used up some of its context window.</p>`,
        analogy: "To teach a concert pianist one new song, you don't rebuild their brain. You give them a small set of notes on top of everything they already know.",
      },
      {
        k: "The big idea",
        t: "The change you need is low-rank.",
        h: `<p>Keep the original weight matrix <b>W frozen</b>. Learn a correction ΔW, but force it to be the product of two thin matrices: <b>ΔW = B·A</b>, where the inner “rank” r is tiny (1 to 64) compared with the matrix size (thousands).</p>
            <p>Why would that work? The authors' hypothesis, backed by experiments, is that adapting a model to a task only needs a change in a <b>few directions</b>, even though the matrix is enormous.</p>
            <p>Drag the rank slider: even at r = 64 you train well under 5% of the numbers.</p>`,
        eq: `h = W·x + (α/r)·B·A·x<small>W is frozen. B starts at zero, so training starts exactly from the original model. α/r is a fixed scaling factor.</small>`,
        v: { type: "lora" },
      },
      {
        k: "How it works",
        t: "Train it, then merge it away.",
        h: `<ul><li>LoRA is added to the attention projection matrices (the paper found adapting the query and value matrices works well).</li>
            <li>During training only A and B get gradients, so optimizer memory shrinks massively.</li>
            <li>For serving, compute <b>W′ = W + B·A</b> once and you have a normal model: <b>zero extra latency</b>.</li>
            <li>Or keep one base model in memory and swap tiny adapters per customer or task.</li></ul>`,
        v: { type: "flow",
          nodes: [
            { id: "x", label: "input x", x: 0.5, y: 0.92 },
            { id: "w", label: "W (frozen, huge)", x: 0.25, y: 0.5, color: C.reason },
            { id: "a", label: "A (r × d)", sub: "trainable", x: 0.75, y: 0.66 },
            { id: "b", label: "B (d × r)", sub: "trainable, starts at 0", x: 0.75, y: 0.34 },
            { id: "sum", label: "+", x: 0.5, y: 0.1 },
          ],
          edges: [{ a: "x", b: "w" }, { a: "x", b: "a" }, { a: "a", b: "b", label: "r-dim bottleneck" }, { a: "w", b: "sum" }, { a: "b", b: "sum" }],
          steps: [
            { on: ["x", "w", "sum"], edges: ["x>w", "w>sum"], text: "The original path is untouched. The pre-trained knowledge is preserved." },
            { on: ["x", "a", "b", "sum"], edges: ["x>a", "a>b", "b>sum"], text: "A side path squeezes x down to r numbers, then expands back. Only this path learns." },
            { on: ["w", "a", "b", "sum"], edges: ["w>sum", "b>sum"], text: "After training, fold B·A into W and the side path disappears." },
          ] } },
      {
        k: "Results",
        t: "Same quality, a sliver of the cost.",
        h: `<p>On GPT-3 175B, LoRA <b>matched or beat full fine-tuning</b> on the tasks tested (WikiSQL, MultiNLI, SAMSum) while:</p>
            <ul><li>training about <b>10,000× fewer</b> parameters,</li><li>using about <b>3× less GPU memory</b> (1.2 TB → 350 GB),</li><li>shrinking each task checkpoint from about <b>350 GB to 35 MB</b>,</li><li>training about 25% faster.</li></ul>`,
        v: { type: "bars",
          title: "GPU memory to fine-tune GPT-3 175B",
          subtitle: "GB during training · from the paper",
          items: [{ label: "Full fine-tuning", value: 1200 }, { label: "LoRA", value: 350, hi: true }],
          fmt: (v) => v.toLocaleString() + " GB" } },
      {
        k: "Why it matters",
        t: "Fine-tuning for everyone.",
        h: `<p>LoRA is the default <b>parameter-efficient fine-tuning</b> (PEFT) method. Follow-ups made it even cheaper: <b>QLoRA</b> (2023) fine-tunes a 4-bit-quantised model, which put 65B-parameter fine-tuning on a single GPU.</p>
            <p>The same trick powers thousands of community image-style LoRAs, per-customer adapters served from one base model, and fast experiments in research labs.</p>
            <p>The deeper lesson, that <b>useful updates live in a small subspace</b>, shows up again in later work on model merging and on why fine-tuning adds skills more easily than knowledge.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What does LoRA train?", options: ["All weights", "Only the embedding table", "Two small low-rank matrices next to frozen weights", "A new tokenizer"], a: 2, why: "W is frozen. Only the thin matrices B and A learn." },
      { q: "Why is there no extra delay at inference?", options: ["LoRA uses a faster GPU kernel", "B·A can be added into W once, giving a normal-sized matrix", "It skips layers", "It's only used during training"], a: 1, why: "Merging W′ = W + BA produces a standard model with the same shape and speed." },
    ],
    terms: [
      ["LoRA", "Low-rank adaptation: fine-tune by learning ΔW = B·A with a small rank."],
      ["Rank", "Roughly, how many independent directions a matrix can express."],
      ["PEFT", "Parameter-efficient fine-tuning: training only a small set of extra parameters."],
      ["Adapter", "A small add-on module that customises a frozen model."],
      ["QLoRA", "LoRA on top of a 4-bit quantised base model."],
    ],
    next: ["instructgpt", "dpo", "skillopt"],
  });
})();
