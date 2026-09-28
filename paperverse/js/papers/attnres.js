/* Attention Residuals (Kimi Team, 2026) */
(function () {
  const { h, C, FONT } = PV;

  /* How layer l mixes all earlier layer outputs: fixed equal sum vs learned softmax weights. */
  PV.defineViz("depthattn", (root, o, api) => {
    const L = 12;
    let mode = "attn", target = 9;
    // illustrative learned pseudo-query preferences for each target layer
    const logitsFor = (l) => {
      const r = PV.rng(l * 7 + 3);
      return Array.from({ length: l }, (_, i) => (i === 0 ? 1.6 : 0) + (i === l - 1 ? 2.0 : 0) + (i === Math.floor(l / 2) ? 1.2 : 0) + r() * 1.3);
    };
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      // wide: layer stack left, weights chart right. phones: stack on top, chart underneath
      const narrow = W < 520;
      const top = narrow ? 20 : 78, bot = narrow ? H - 280 : 110;
      const lh = (H - top - bot) / L;
      const sx = narrow ? 14 : 30, sw = narrow ? 84 : Math.min(140, W * 0.2);
      // layer stack
      for (let i = 0; i < L; i++) {
        const y = H - bot - (i + 1) * lh;
        const isT = i === target;
        PV.box(ctx, sx, y + 2, sw, lh - 4, { r: 5, fill: isT ? PV.alpha(api.color, 0.35) : C.panel, stroke: isT ? api.color : C.line2 });
        PV.text(ctx, i === 0 ? "embedding" : `layer ${i}`, sx + sw / 2, y + lh / 2, { size: Math.min(11.5, lh * 0.45), align: "center", color: isT ? C.ink : C.ink2 });
      }
      // weights from each earlier layer into the target
      const w = mode === "attn" ? PV.softmax(logitsFor(target)) : new Array(target).fill(1);
      const maxW = mode === "attn" ? Math.max(...w) : 1;
      const tx = sx + sw, ty = H - bot - (target + 0.5) * lh;
      for (let i = 0; i < target; i++) {
        const y = H - bot - (i + 0.5) * lh;
        const a = w[i] / maxW;
        ctx.strokeStyle = PV.alpha(C.glow, 0.15 + 0.75 * a);
        ctx.lineWidth = 0.8 + 5 * a;
        ctx.beginPath(); ctx.moveTo(tx, y); ctx.bezierCurveTo(tx + 60 + (target - i) * 6, y, tx + 60 + (target - i) * 6, ty, tx + 4, ty); ctx.stroke();
      }
      // bar chart of weights
      const bx = narrow ? 14 : tx + 130, bw = narrow ? W - 28 : W - bx - 24;
      const barTop = narrow ? H - bot + 36 : top + 8;
      if (bw > 120) {
        PV.text(ctx, `what layer ${target} receives from each earlier layer`, bx, barTop - 18, { size: 11, font: FONT.mono, color: C.ink3 });
        const rowH = Math.min(22, ((narrow ? H - barTop - 10 : H - top - bot)) / target);
        for (let i = 0; i < target; i++) {
          const y = barTop + i * rowH;
          PV.text(ctx, i === 0 ? "emb" : `L${i}`, bx, y + rowH / 2, { size: 11, font: FONT.mono, color: C.ink3 });
          const val = mode === "attn" ? w[i] : 1;
          const len = mode === "attn" ? (bw - 90) * val / maxW : (bw - 90) * 0.35;
          PV.box(ctx, bx + 36, y + 3, len, rowH - 6, { r: 3, fill: mode === "attn" ? PV.alpha(C.glow, 0.3 + 0.7 * val / maxW) : C.line2 });
          PV.text(ctx, mode === "attn" ? (val * 100).toFixed(0) + "%" : "× 1", bx + 42 + len, y + rowH / 2, { size: 10.5, font: FONT.mono });
        }
      }
      cap.set(mode === "attn"
        ? `<b>Attention Residuals:</b> layer ${target} uses a learned query to pick <i>which</i> earlier layers it listens to. Weights sum to 100%, so nothing grows without bound.`
        : `<b>Standard residuals:</b> layer ${target} gets the plain sum of every earlier output, each with weight 1. The pile grows with depth, and each layer's voice gets diluted.`);
    });
    st.phoneHeight(560);
    const ctl = PV.controls(root);
    ctl.toggle([["attn", "Attention Residuals"], ["sum", "Standard residual"]], mode, (v) => (mode = v));
    ctl.slider("Target layer", { min: 2, max: L - 1, value: target, onInput: (v) => (target = v) });
    PV.note(root, "illustrative weights");
    return () => st.stop();
  });

  PV.register({
    id: "attnres",
    short: "Attention Residuals",
    title: "Attention Residuals",
    year: 2026, date: "2026-03",
    track: "arch", era: "frontier",
    authors: "Kimi Team (Moonshot AI): Chen, Zhang, Su, Xu et al.",
    arxiv: "2603.15031", url: "https://arxiv.org/abs/2603.15031",
    oneLiner: "Transformers replaced recurrence over words with attention. This paper does the same over layers: each layer learns which earlier layers to listen to, instead of summing them all equally.",
    why: "The residual connection had been fixed since 2015. Here it becomes learned, at 48B-parameter scale, with clear benchmark gains and a follow-up paper within two months.",
    signals: { impact: 4, novelty: 5, momentum: 5 },
    tags: ["residual stream", "depth", "PreNorm dilution", "softmax over layers", "Kimi"],
    builds: ["attention", "sinks"],
    slides: [
      {
        k: "Background",
        t: "The residual stream: every layer adds to a running total.",
        h: `<p>In a Transformer, each layer <b>adds</b> its output to a shared vector, the <b>residual stream</b>: <i>h<sub>l+1</sub> = h<sub>l</sub> + f<sub>l</sub>(h<sub>l</sub>)</i>. Unroll it and layer <i>l</i>'s input is just the <b>equal-weight sum</b> of the embedding and every earlier layer's output.</p>
            <p>Originally this was a trick (ResNet, 2015) to let gradients flow through deep networks. But it also fixes <b>how information mixes across depth</b>, with no way for a layer to pick what it needs.</p>`,
        analogy: "A meeting where every speaker's words are poured into one bucket. By speaker 40 the bucket is huge, early voices are buried, and each new speaker has to shout louder to be heard.",
      },
      {
        k: "The problem",
        t: "PreNorm dilution.",
        h: `<p>With the standard pre-norm design, the hidden state's size grows roughly <b>in proportion to depth</b>. Consequences the paper highlights:</p>
            <ul><li><b>No selective access:</b> attention and MLP layers all receive the same blended sum.</li>
            <li><b>Irreversible loss:</b> once blended, early-layer information can't be pulled back out cleanly.</li>
            <li><b>Output growth:</b> later layers learn to produce bigger outputs just to matter. Many deep layers can be pruned with little loss, a hint that they aren't pulling their weight.</li></ul>
            <p>Sound familiar? It's the same problem RNNs had over <b>time</b>: squeezing everything into one running state.</p>`,
      },
      {
        k: "The big idea",
        t: "Attention over depth.",
        h: `<p>The authors point out a <b>duality</b>: a residual stream over layers works like an RNN over tokens. Transformers fixed RNNs by letting each token <b>attend</b> to all earlier tokens. So let each layer attend to all earlier <b>layer outputs</b>:</p>
            <p>Each layer gets one learned <b>pseudo-query</b> vector <i>w<sub>l</sub></i>. It scores every earlier layer's output (normalised by RMSNorm) and takes a softmax-weighted mix. It costs just one extra vector per layer, and depth is small (under 1,000), so attention over depth is cheap.</p>
            <p>They also show standard residuals are a form of depth-wise <b>linear</b> attention, and AttnRes upgrades it to <b>softmax</b> attention.</p>`,
        eq: `h_l = Σ_{i&lt;l} α_{i→l} · v_i    α_{i→l} = softmax_i( w_lᵀ · RMSNorm(v_i) )`,
        v: { type: "depthattn" },
      },
      {
        k: "Making it scale",
        t: "Block AttnRes: attend over about 8 summaries.",
        h: `<p>Attending over every layer's output means keeping all of them in memory and, in pipeline-parallel training, shipping them between GPUs.</p>
            <p><b>Block AttnRes</b> groups layers into <i>N</i> blocks. Inside a block, outputs are summed normally, and across blocks, each layer attends over just the <i>N</i> block summaries (plus the embedding). Memory drops from <i>O(L·d)</i> to <i>O(N·d)</i>, and <b>N ≈ 8 recovers most of the gain</b>.</p>
            <p>With caching between pipeline stages and a two-phase inference scheme, it's a drop-in replacement with <b>under 2% inference latency overhead</b>.</p>`,
      },
      {
        k: "Results",
        t: "Worth about 1.25× more compute, and big reasoning gains.",
        h: `<p>In scaling-law experiments, Block AttnRes matched a baseline trained with <b>1.25× more compute</b>, consistently across sizes.</p>
            <p>They then built it into <b>Kimi Linear</b> (48B total / 3B active parameters) and pre-trained on 1.4T tokens. Hidden-state size stayed bounded across depth, gradients spread more evenly, and every benchmark improved, most on multi-step reasoning:</p>`,
        v: { type: "bars",
          title: "Kimi Linear 48B: baseline vs Attention Residuals",
          subtitle: "accuracy % · paper's Table 3",
          series: [
            { name: "baseline", color: C.line2, values: [73.5, 36.9, 53.5, 59.1] },
            { name: "with AttnRes", color: C.arch, values: [74.6, 44.4, 57.1, 62.2] },
          ],
          categories: ["MMLU", "GPQA-Diamond", "Math", "HumanEval"],
          max: 100, fmt: (v) => v.toFixed(1) } },
      {
        k: "Why it matters",
        t: "The last fixed piece of the Transformer is becoming learned.",
        h: `<p>Attention made mixing across <b>tokens</b> learned. MoE made choosing <b>which weights</b> learned. AttnRes makes mixing across <b>depth</b> learned.</p>
            <p>Momentum is real: within two months, <b>Delta Attention Residuals</b> (May 2026) found that attending over each layer's <b>change</b> (<i>h<sub>i+1</sub> − h<sub>i</sub></i>) instead of the cumulative state gives much sharper routing (max weight about 0.6 instead of 0.2) and 1.7–8.2% perplexity gains. NCP-ArchPreview uses learned cross-layer connections too.</p>
            <p>It also connects to the <b>attention sinks</b> paper: both show that the plain additive residual stream plus pre-norm is behind several strange behaviours.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What does a standard residual connection do across layers?", options: ["Picks the best earlier layer", "Adds every earlier layer's output with equal weight", "Multiplies layer outputs", "Skips every other layer"], a: 1, why: "Unrolled, each layer's input is an unweighted sum of all earlier outputs." },
      { q: "How does a layer choose what to read in AttnRes?", options: ["Randomly", "A learned pseudo-query scores earlier outputs, then softmax", "Only the previous layer", "By a fixed schedule"], a: 1, why: "One learned vector per layer turns depth-mixing into softmax attention." },
    ],
    terms: [
      ["Residual stream", "The running vector that every layer reads from and adds to."],
      ["PreNorm dilution", "Hidden-state growth with depth that shrinks each layer's relative influence."],
      ["Pseudo-query", "A learned vector a layer uses to score earlier layers (not computed from the input)."],
      ["Block AttnRes", "Attending over a few block summaries instead of every layer, to save memory."],
      ["Pipeline parallelism", "Splitting a model's layers across GPUs that pass activations along."],
    ],
    next: ["sinks", "ncp", "mamba3"],
  });
})();
