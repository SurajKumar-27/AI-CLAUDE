/* Attention Is All You Need (Vaswani et al., 2017) */
(function () {
  const { h, C, FONT } = PV;

  /* RNN (one word at a time) vs Transformer (all words at once). */
  PV.defineViz("rnnvs", (root, o, api) => {
    const words = ["The", "animal", "didn't", "cross", "the", "street", "because", "it", "was", "tired"];
    PV.caption(root, "<b>Top:</b> an RNN reads one word per step and squeezes everything into one memory. <b>Bottom:</b> a Transformer looks at all words at once.");
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      const n = words.length, pad = 26, gap = (W - pad * 2) / n;
      const cyc = 7, u = (t % cyc) / cyc;
      // RNN lane
      const y1 = H * 0.3, y2 = H * 0.68;
      PV.text(ctx, "RNN (before 2017)", pad, y1 - 48, { size: 12, font: FONT.mono, color: C.ink3 });
      const cur = Math.min(n - 1, Math.floor(u * n * 1.15));
      for (let i = 0; i < n; i++) {
        const x = pad + gap * (i + 0.5);
        const done = i <= cur;
        // how much of word i survives in the memory at current step (fades with distance)
        const keep = done ? Math.pow(0.72, cur - i) : 0;
        PV.box(ctx, x - gap * 0.44, y1 - 14, gap * 0.88, 28, { r: 6, fill: done ? PV.alpha(api.color, 0.12 + keep * 0.6) : C.panel, stroke: i === cur ? C.glow : C.line2 });
        PV.text(ctx, words[i], x, y1, { size: Math.min(13, gap * 0.22), align: "center", color: done ? C.ink : C.ink3, weight: 700 });
        if (i < n - 1) PV.arrow(ctx, x + gap * 0.44, y1, x + gap * 0.56, y1, { color: i < cur ? api.color : C.line2, head: 5 });
      }
      const mx = pad + gap * (cur + 0.5);
      ctx.fillStyle = C.glow;
      ctx.shadowColor = C.glow; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(mx, y1 + 30, 6, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      PV.text(ctx, `step ${cur + 1} of ${n}: later words can't start until earlier ones finish, and early words fade from memory`, pad, y1 + 54, { size: 11.5, color: C.ink2 });
      // Transformer lane
      PV.text(ctx, "Transformer (2017)", pad, y2 - 48, { size: 12, font: FONT.mono, color: C.ink3 });
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const xi = pad + gap * (i + 0.5), xj = pad + gap * (j + 0.5);
        const strong = (i === 7 && j === 1) || (i === 1 && j === 7);
        ctx.strokeStyle = strong ? PV.alpha(C.glow, 0.5 + 0.5 * pulse) : PV.alpha(api.color, 0.07);
        ctx.lineWidth = strong ? 2.5 : 1;
        ctx.beginPath();
        ctx.moveTo(xi, y2 - 14);
        ctx.quadraticCurveTo((xi + xj) / 2, y2 - 14 - Math.abs(i - j) * 7, xj, y2 - 14);
        ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const x = pad + gap * (i + 0.5);
        PV.box(ctx, x - gap * 0.44, y2 - 14, gap * 0.88, 28, { r: 6, fill: PV.alpha(api.color, 0.35), stroke: api.color });
        PV.text(ctx, words[i], x, y2, { size: Math.min(13, gap * 0.22), align: "center", weight: 700 });
      }
      PV.text(ctx, "1 parallel step: every word sees every other word directly (“it” ↔ “animal” highlighted)", pad, y2 + 32, { size: 11.5, color: C.ink2 });
    });
    return () => st.stop();
  });

  /* Interactive attention map. Weights are hand-set to show the idea (illustrative). */
  const SENT = ["The", "animal", "didn't", "cross", "the", "street", "because", "it", "was", "too", "tired"];
  function headLogits(head, ending) {
    const n = SENT.length;
    const L = Array.from({ length: n }, () => Array(n).fill(0));
    const set = (i, j, v) => (L[i][j] = v);
    if (head === "prev") {
      for (let i = 0; i < n; i++) { set(i, Math.max(0, i - 1), 4); }
    } else if (head === "meaning") {
      for (let i = 0; i < n; i++) set(i, i, 1.2);
      const it = 7, animal = 1, street = 5;
      const tiredLike = ending === "tired";
      set(it, animal, tiredLike ? 3.6 : 1.0); set(it, street, tiredLike ? 1.0 : 3.6); set(it, 10, 1.6);
      set(10, it, 2.4); set(10, tiredLike ? animal : street, 3.0);
      set(3, street, 2.8); set(3, animal, 2.2); set(1, 3, 2.0); set(5, 3, 2.0); set(2, 3, 2.5);
      set(6, 10, 1.8); set(6, 3, 1.4); set(8, it, 2.2); set(8, 10, 2.0); set(9, 10, 3.0);
      set(0, 1, 2.5); set(4, 5, 2.8);
    } else {
      // "sentence glue": everything looks at the verbs and the linking word
      for (let i = 0; i < n; i++) { set(i, 3, 2.2); set(i, 6, 1.8); set(i, 8, 1.2); set(i, i, 0.8); }
    }
    return L;
  }
  PV.defineViz("attnmap", (root, o, api) => {
    let q = 7, head = o.head || "meaning", ending = "tired";
    const cap = PV.caption(root, "");
    const words = () => SENT.map((w, i) => (i === 10 ? ending : w));
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      const ws = words();
      const n = ws.length, top = 56, bot = 104, rowH = (H - top - bot) / n;
      const xl = W * 0.26, xr = W * 0.74;
      const logits = headLogits(head, ending);
      const w = PV.softmax(logits[q], 0.9);
      // hover selects query
      const p = st && st.pointer;
      if (p && p.inside && p.x < W * 0.45) {
        const hi = Math.floor((p.y - top) / rowH);
        if (hi >= 0 && hi < n) q = hi;
      }
      PV.text(ctx, "looking FROM", xl, top - 18, { size: 10.5, font: FONT.mono, color: C.ink3, align: "center" });
      PV.text(ctx, "…paying attention TO", xr, top - 18, { size: 10.5, font: FONT.mono, color: C.ink3, align: "center" });
      for (let j = 0; j < n; j++) {
        const y1 = top + (q + 0.5) * rowH, y2 = top + (j + 0.5) * rowH;
        ctx.strokeStyle = PV.alpha(api.color, 0.08 + w[j] * 0.92);
        ctx.lineWidth = 0.5 + w[j] * 16;
        ctx.beginPath();
        ctx.moveTo(xl + 44, y1);
        ctx.bezierCurveTo((xl + xr) / 2, y1, (xl + xr) / 2, y2, xr - 44, y2);
        ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const y = top + (i + 0.5) * rowH;
        const sel = i === q;
        PV.box(ctx, xl - 42, y - rowH * 0.36, 84, rowH * 0.72, { r: 6, fill: sel ? PV.alpha(api.color, 0.3) : C.panel, stroke: sel ? api.color : C.line2 });
        PV.text(ctx, ws[i], xl, y, { size: 13, align: "center", weight: sel ? 700 : 400, color: sel ? C.ink : C.ink2 });
        PV.box(ctx, xr - 42, y - rowH * 0.36, 84, rowH * 0.72, { r: 6, fill: PV.alpha(C.glow, w[i] * 0.55), stroke: C.line2 });
        PV.text(ctx, ws[i], xr, y, { size: 13, align: "center", color: C.ink });
        PV.text(ctx, Math.round(w[i] * 100) + "%", xr + 50, y, { size: 11, font: FONT.mono, color: w[i] > 0.15 ? C.glow : C.ink3 });
      }
      const best = w.indexOf(Math.max(...w));
      cap.set(`Hover a word on the left. <b>“${ws[q]}”</b> pays most attention to <b style="color:${C.glow}">“${ws[best]}”</b>.`);
    });
    const ctl = PV.controls(root);
    ctl.toggle([["meaning", "Head A: meaning"], ["prev", "Head B: previous word"], ["glue", "Head C: verbs"]], head, (v) => (head = v));
    ctl.toggle([["tired", "…too tired"], ["wide", "…too wide"]], "tired", (v) => (ending = v));
    PV.note(root, "illustrative weights");
    return () => st.stop();
  });

  /* Query · Key · Value, step by step for the word "it". */
  PV.defineViz("qkv", (root, o, api) => {
    const ws = ["animal", "street", "because", "it", "tired"];
    const scores = [3.4, 1.1, 0.4, 1.3, 1.9];
    const wts = PV.softmax(scores);
    const valColors = [C.train, C.reason, C.ink3, C.inside, C.speed];
    let phase = 0, pt = 0;
    const phases = [
      "<b>1 · Query.</b> “it” asks a question: <i>“which noun am I referring to?”</i>",
      "<b>2 · Keys.</b> Every word holds up a label describing what it offers. The query is compared with each key (a dot product).",
      "<b>3 · Softmax.</b> Scores become percentages that add up to 100%.",
      "<b>4 · Values.</b> Each word's content (its value) is blended by those percentages. “it” now carries mostly “animal”.",
    ];
    const cap = PV.caption(root, phases[0]);
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      pt += dt;
      if (pt > 3.2 && !PV.reduceMotion) { pt = 0; phase = (phase + 1) % 4; cap.set(phases[phase]); }
      const colX = (i) => W * 0.14 + (i * (W * 0.72)) / (ws.length - 1);
      const yQ = H * 0.2, yK = H * 0.42, yS = H * 0.6, yV = H * 0.78;
      // query
      PV.box(ctx, W / 2 - 70, yQ - 16, 140, 32, { r: 8, fill: PV.alpha(api.color, 0.3), stroke: api.color, lw: 2 });
      PV.text(ctx, "Query from “it”", W / 2, yQ, { size: 13, weight: 700, align: "center" });
      ws.forEach((w, i) => {
        const x = colX(i);
        const a1 = phase >= 1 ? 1 : 0.25;
        PV.box(ctx, x - 44, yK - 14, 88, 28, { r: 7, fill: C.panel, stroke: C.line2 });
        PV.text(ctx, "key: " + w, x, yK, { size: 11.5, align: "center", alpha: a1 });
        if (phase >= 1) {
          ctx.strokeStyle = PV.alpha(C.glow, 0.25 + 0.15 * Math.sin(t * 4 + i));
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(W / 2, yQ + 16); ctx.lineTo(x, yK - 14); ctx.stroke();
          PV.text(ctx, "score " + scores[i].toFixed(1), x, yK + 24, { size: 10.5, font: FONT.mono, align: "center", color: C.ink3 });
        }
        if (phase >= 2) {
          const bh = wts[i] * (H * 0.2);
          PV.box(ctx, x - 16, yS + 30 - bh, 32, bh, { r: 4, fill: C.glow });
          PV.text(ctx, Math.round(wts[i] * 100) + "%", x, yS + 44, { size: 11, font: FONT.mono, align: "center", color: C.ink });
        }
        if (phase >= 3) {
          PV.box(ctx, x - 30, yV - 10, 60, 20, { r: 5, fill: PV.alpha(valColors[i], 0.25 + wts[i]), stroke: valColors[i] });
          PV.text(ctx, "value", x, yV, { size: 10.5, align: "center" });
        }
      });
      if (phase >= 3) {
        // blended output
        const bx = W / 2 - 110, by = H - 56, bw = 220;
        let acc = 0;
        ws.forEach((w, i) => {
          PV.box(ctx, bx + acc * bw, by, Math.max(1, wts[i] * bw), 20, { r: 2, fill: valColors[i] });
          acc += wts[i];
        });
        PV.text(ctx, "new meaning of “it” = weighted blend of values", W / 2, by - 12, { size: 11.5, align: "center", color: C.ink2 });
      }
    });
    const ctl = PV.controls(root);
    ctl.button("◀", () => { phase = (phase + 3) % 4; pt = -20; cap.set(phases[phase]); });
    ctl.button("▶ next step", () => { phase = (phase + 1) % 4; pt = -20; cap.set(phases[phase]); });
    PV.note(root, "illustrative numbers");
    return () => st.stop();
  });

  /* Sinusoidal positional encodings as a heatmap. */
  PV.defineViz("posenc", (root, o, api) => {
    let hover = 12;
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H) => {
      const P = 40, D = 64, left = 50, top = 50, right = 20, bot = 70;
      const cw = (W - left - right) / D, ch = (H - top - bot) / P;
      const p = st && st.pointer;
      if (p && p.inside) { const r = Math.floor((p.y - top) / ch); if (r >= 0 && r < P) hover = r; }
      for (let pos = 0; pos < P; pos++) for (let i = 0; i < D; i++) {
        const k = Math.floor(i / 2), ang = pos / Math.pow(10000, (2 * k) / D);
        const v = i % 2 ? Math.cos(ang) : Math.sin(ang);
        ctx.fillStyle = v > 0 ? PV.alpha(api.color, v * 0.9) : PV.alpha(C.reason, -v * 0.9);
        ctx.fillRect(left + i * cw, top + pos * ch, cw + 0.5, ch + 0.5);
      }
      ctx.strokeStyle = C.glow; ctx.lineWidth = 2;
      ctx.strokeRect(left, top + hover * ch, W - left - right, ch);
      PV.text(ctx, "position in sentence ↓", 8, top - 16, { size: 11, color: C.ink3, font: FONT.mono });
      PV.text(ctx, "dimension →   (fast waves on the left, slow waves on the right)", left, H - bot + 18, { size: 11, color: C.ink3, font: FONT.mono });
      cap.set(`Word #${hover} gets this unique stripe pattern added to its embedding, so the model knows <b>where</b> it is.`);
    });
    return () => st.stop();
  });

  PV.register({
    id: "attention",
    short: "Transformer",
    title: "Attention Is All You Need",
    year: 2017, date: "2017-06",
    track: "arch", era: "foundation",
    authors: "Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (Google)",
    venue: "NeurIPS 2017",
    arxiv: "1706.03762", url: "https://arxiv.org/abs/1706.03762",
    oneLiner: "Throw away recurrence; let every word look directly at every other word. This is the Transformer, the architecture inside every modern LLM.",
    why: "It's the ancestor of everything else in this observatory. The “T” in GPT stands for Transformer.",
    signals: { impact: 5, novelty: 5, momentum: 4 },
    tags: ["attention", "Q·K·V", "multi-head", "parallel", "encoder", "decoder"],
    hero: { type: "stack3d", words: ["it", "was", "too", "tired"], output: "→ attention everywhere" },
    builds: ["primer"],
    slides: [
      {
        k: "The problem",
        t: "Before 2017, models read text one word at a time.",
        h: `<p>The best language models were <b>recurrent neural networks</b> (RNNs, LSTMs). They read a sentence left to right, carrying a single “memory” vector forward.</p>
            <p>Two problems:</p>
            <ul><li><b>Slow:</b> word 50 can't be processed until words 1–49 are done, so you can't use a GPU's thousands of cores in parallel.</li>
            <li><b>Forgetful:</b> by the end of a long paragraph, the memory of the beginning has faded.</li></ul>`,
        analogy: "Reading a book through a keyhole, one word at a time, while trying to remember everything in your head, versus laying every page out on a big table and looking wherever you need.",
        v: { type: "rnnvs" },
      },
      {
        k: "The big idea",
        t: "Attention: every word decides which other words matter to it.",
        h: `<p>In “The animal didn't cross the street because <b>it</b> was too tired”, what does <b>it</b> refer to? You know it's the animal because of “tired”.</p>
            <p>Self-attention lets the word “it” <b>look at every other word</b> and assign each a weight. Change “tired” to “wide” and the right answer flips to “street”. Try it with the toggle.</p>
            <p>Each <b>head</b> learns a different kind of relationship. Some track meaning, some track grammar, and some just look at the previous word.</p>`,
        v: { type: "attnmap" },
      },
      {
        k: "How it works",
        t: "Query, Key, Value: a soft lookup table.",
        h: `<p>Each word's vector is turned into three smaller vectors:</p>
            <ul><li><b>Query</b>: what am I looking for?</li><li><b>Key</b>: what do I contain?</li><li><b>Value</b>: what will I hand over if you pick me?</li></ul>
            <p>Compare one word's query with every key (a dot product), turn the scores into percentages with <b>softmax</b>, and take the weighted average of the values. That's one attention head.</p>`,
        eq: `Attention(Q, K, V) = softmax( Q·Kᵀ / √d ) · V<small>√d keeps the scores from getting too large as vectors get longer.</small>`,
        v: { type: "qkv" },
      },
      {
        k: "The missing piece",
        t: "If everything happens at once, how does it know word order?",
        h: `<p>Attention on its own treats the sentence as a bag of words: “dog bites man” and “man bites dog” would look identical.</p>
            <p>The fix is to add a <b>positional encoding</b> to each word's embedding: a unique pattern of sine and cosine waves at different speeds. Nearby positions get similar patterns, so the model can learn “3 words back”.</p>
            <p>Modern models use a successor called <b>RoPE</b> (rotary embeddings), which rotates the query and key vectors by an angle that depends on position. Mamba-3 reuses the same trick.</p>`,
        v: { type: "posenc" },
      },
      {
        k: "The full block",
        t: "Stack the same block many times.",
        h: `<p>A Transformer layer is two sub-steps, repeated N times (6 in the paper, around 100 in today's largest models):</p>
            <ol><li><b>Multi-head attention</b>: words exchange information.</li>
            <li><b>Feed-forward network</b>: each word thinks on its own, processing what it just gathered.</li></ol>
            <p>Each sub-step is wrapped in a <b>residual connection</b> (add the input back to the output) and <b>normalisation</b>. That residual “stream” turns out to be crucial. The 2026 papers on Attention Residuals and attention sinks are all about it.</p>`,
        v: {
          type: "flow",
          nodes: [
            { id: "emb", label: "Token embeddings", sub: "+ position", x: 0.5, y: 0.92 },
            { id: "att", label: "Multi-head attention", sub: "words talk", x: 0.5, y: 0.66, maxW: 0.4 },
            { id: "add1", label: "Add & Norm", x: 0.84, y: 0.52 },
            { id: "ffn", label: "Feed-forward", sub: "each word thinks", x: 0.5, y: 0.36 },
            { id: "add2", label: "Add & Norm", x: 0.84, y: 0.22 },
            { id: "out", label: "Next layer ×N → prediction", x: 0.5, y: 0.04, maxW: 0.45 },
          ],
          edges: [{ a: "emb", b: "att" }, { a: "att", b: "add1" }, { a: "emb", b: "add1", label: "residual", bend: 0.25, dashed: true }, { a: "add1", b: "ffn" }, { a: "ffn", b: "add2" }, { a: "add1", b: "add2", label: "residual", bend: -0.3, dashed: true }, { a: "add2", b: "out" }],
          steps: [
            { on: ["emb"], edges: [], text: "Each token becomes a vector, plus its position signal." },
            { on: ["emb", "att"], edges: ["emb>att"], text: "Attention: every token gathers information from the tokens it cares about." },
            { on: ["att", "add1", "emb"], edges: ["att>add1", "emb>add1"], text: "Residual: add the original back in, so nothing is lost, then normalise." },
            { on: ["add1", "ffn"], edges: ["add1>ffn"], text: "Feed-forward: a small neural net processes each token separately. This is where much of the model's knowledge is stored." },
            { on: ["ffn", "add2", "out"], edges: ["ffn>add2", "add1>add2", "add2>out"], text: "Add & norm again, then pass to the next identical layer." },
          ],
        },
      },
      {
        k: "Results",
        t: "Better translations, far less training compute.",
        h: `<p>The paper tested machine translation. The big Transformer set a new state of the art on English→German (<b>28.4 BLEU</b>) and English→French (<b>41.8 BLEU</b>).</p>
            <p>It needed a small fraction of the compute of the previous best systems, because it trains in parallel. The base model trained in <b>12 hours on 8 GPUs</b>.</p>
            <p>The chart shows estimated training cost from the paper's Table 2 (EN→DE).</p>`,
        v: {
          type: "bars",
          title: "Training cost, English→German",
          subtitle: "×10¹⁸ floating-point operations · lower is cheaper",
          items: [
            { label: "GNMT + RL (ensemble)", value: 180 },
            { label: "ConvS2S (ensemble)", value: 77 },
            { label: "Transformer (big)", value: 23, hi: true },
            { label: "Transformer (base)", value: 3.3, hi: true },
          ],
          fmt: (v) => v + "×10¹⁸",
        },
      },
      {
        k: "Why it matters",
        t: "It became the universal engine of AI.",
        h: `<p>GPT, BERT, Claude, Gemini, Llama, image models (ViT), speech (Whisper) and protein structure prediction all use Transformer blocks. It won because it's simple, parallel, and <b>keeps getting better as you scale it up</b>.</p>
            <p><b>The catch that drives half this collection:</b> every token attends to every other token, so cost grows with the <b>square</b> of the text length. A 100k-token document means 10 billion attention pairs per head per layer. That's why FlashAttention, vLLM, Mamba, Mamba-3, Gated DeltaNet-2 and hybrid models exist.</p>`,
        v: {
          type: "lines",
          title: "Why long context is expensive",
          subtitle: "Attention pairs grow with the square of length (illustrative)",
          x: { label: "context length (tokens)", min: 1000, max: 128000, log: true, ticks: [1000, 10000, 100000] },
          y: { label: "relative cost", min: 1, max: 20000, log: true },
          series: [
            { name: "attention ∝ n²", color: C.train, points: [[1000, 1], [4000, 16], [16000, 256], [64000, 4096], [128000, 16384]] },
            { name: "linear ∝ n", color: C.speed, points: [[1000, 1], [4000, 4], [16000, 16], [64000, 64], [128000, 128]] },
          ],
        },
      },
    ],
    quiz: [
      { q: "What was the main speed problem with RNNs?", options: ["They used too much memory", "They had to process words one after another", "They needed labelled data", "They couldn't run on GPUs at all"], a: 1, why: "Sequential processing blocks parallelism. Transformers process all positions at once." },
      { q: "In attention, what does the softmax step do?", options: ["Picks exactly one word", "Turns similarity scores into weights that sum to 100%", "Adds position information", "Removes unimportant words from the text"], a: 1, why: "Softmax turns raw query·key scores into a probability-like distribution used to blend the values." },
      { q: "Why do we need positional encodings?", options: ["To make training faster", "Because attention alone ignores word order", "To reduce memory", "To pick the next token"], a: 1, why: "Without position signals, attention treats the input as an unordered set." },
    ],
    terms: [
      ["Transformer", "A neural network built from stacked attention + feed-forward layers."],
      ["Self-attention", "Each token computes weighted connections to every other token."],
      ["Query / Key / Value", "The three projections used for attention's soft lookup."],
      ["Attention head", "One independent attention pattern; models run many in parallel."],
      ["Positional encoding", "A signal added to embeddings so the model knows word order."],
      ["Residual connection", "Adding a layer's input to its output, creating a “residual stream”."],
      ["RNN", "Recurrent neural network: reads one token at a time with a running memory."],
    ],
    next: ["gpt3", "flash", "mamba"],
  });
})();
