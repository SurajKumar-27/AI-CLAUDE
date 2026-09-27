/* FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness (Dao et al., 2022) */
(function () {
  const { h, C, FONT } = PV;

  /* Memory traffic between slow HBM and fast on-chip SRAM, standard vs Flash. */
  PV.defineViz("flashio", (root, o, api) => {
    const N = 6; // blocks per side of the attention matrix
    let t0 = 0;
    const cap = PV.caption(root, "<b>Left:</b> standard attention writes the whole N×N score matrix to slow memory and reads it back. <b>Right:</b> FlashAttention works tile by tile in fast memory and never stores it.");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      t0 += dt;
      const colW = (W - 36) / 2;
      const dur = 8;
      const u = Math.min(1, (t0 % (dur + 2)) / dur);
      const drawSide = (x0, flash) => {
        const title = flash ? "FlashAttention" : "Standard attention";
        PV.text(ctx, title, x0 + colW / 2, 58, { size: 14, weight: 700, align: "center", color: flash ? api.color : C.ink2 });
        // SRAM (small, fast)
        const sx = x0 + colW * 0.25, sw = colW * 0.5, sy = 78, sh = 58;
        PV.box(ctx, sx, sy, sw, sh, { r: 8, fill: PV.alpha(C.speed, 0.1), stroke: C.speed });
        PV.text(ctx, "SRAM · on-chip", sx + sw / 2, sy + 14, { size: 10.5, font: FONT.mono, align: "center", color: C.speed });
        PV.text(ctx, "~20 MB, ~19 TB/s", sx + sw / 2, sy + 30, { size: 10.5, align: "center", color: C.ink3 });
        // HBM (big, slow)
        const hx = x0 + 6, hw = colW - 12, hy = sy + sh + 60, hh = H - hy - 120;
        PV.box(ctx, hx, hy, hw, hh, { r: 10, fill: PV.alpha(C.reason, 0.06), stroke: C.reason });
        PV.text(ctx, "HBM · GPU main memory · 40–80 GB, ~1.5–2 TB/s", hx + 10, hy + 14, { size: 10.5, font: FONT.mono, color: C.reason });
        // Q K V stored in HBM
        ["Q", "K", "V"].forEach((s, i) => {
          PV.box(ctx, hx + 10 + i * 34, hy + 30, 28, 44, { r: 4, fill: C.panel2, stroke: C.line2 });
          PV.text(ctx, s, hx + 24 + i * 34, hy + 52, { size: 13, weight: 700, align: "center" });
        });
        PV.box(ctx, hx + 118, hy + 30, 28, 44, { r: 4, fill: u > 0.95 ? PV.alpha(C.good, 0.4) : C.panel2, stroke: C.line2 });
        PV.text(ctx, "O", hx + 132, hy + 52, { size: 13, weight: 700, align: "center" });
        // the N×N matrix
        const gx = hx + 164, gy = hy + 30, gs = Math.min(hw - 180, hh - 44);
        const cs = gs / N;
        const tile = Math.floor(u * N * N);
        let traffic = 0;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const k = i * N + j;
          if (!flash) {
            // standard: S written, then read, P written, then read
            // standard: the whole score matrix lands in HBM, then gets re-read and re-written
            const phase = u * 4;
            if (phase >= 1 || k < phase * N * N) {
              ctx.fillStyle = PV.alpha(phase < 2 ? C.train : C.bad, 0.55);
              ctx.fillRect(gx + j * cs + 1, gy + i * cs + 1, cs - 2, cs - 2);
            }
          } else {
            ctx.strokeStyle = C.line2;
            ctx.strokeRect(gx + j * cs + 1, gy + i * cs + 1, cs - 2, cs - 2);
          }
        }
        if (!flash) {
          const phase = Math.min(3.999, u * 4);
          const label = ["① write scores S to HBM", "② read S back, softmax", "③ write P to HBM", "④ read P back, multiply by V"][Math.floor(phase)];
          PV.text(ctx, label, gx, gy + gs + 14, { size: 11, color: C.ink2 });
          traffic = 2 + 4 * PV.clamp(u, 0, 1) * N; // QKV in, then 4 full passes over N² matrix
          const arrowY = sy + sh + 8;
          PV.arrow(ctx, sx + sw * 0.35, arrowY, sx + sw * 0.35, hy - 4, { color: C.bad, lw: 2 + 2 * Math.sin(t * 6) });
          PV.arrow(ctx, sx + sw * 0.65, hy - 4, sx + sw * 0.65, arrowY, { color: C.bad, lw: 2 + 2 * Math.cos(t * 6) });
        } else {
          // tile currently in SRAM
          const i = Math.floor(tile / N) % N, j = tile % N;
          if (u < 1) {
            ctx.fillStyle = PV.alpha(api.color, 0.8);
            ctx.fillRect(gx + j * cs + 1, gy + i * cs + 1, cs - 2, cs - 2);
            ctx.fillStyle = PV.alpha(api.color, 0.8);
            ctx.fillRect(sx + sw / 2 - 12, sy + 38, 24, 14);
          }
          PV.text(ctx, "tile lives only in SRAM", gx, gy + gs + 14, { size: 11, color: C.ink2 });
          traffic = 2 + 1.2 * PV.clamp(u, 0, 1) * 2;
          PV.arrow(ctx, sx + sw * 0.5, sy + sh + 8, sx + sw * 0.5, hy - 4, { color: api.color, lw: 1.5 });
        }
        // traffic meter
        const my = H - 96;
        PV.text(ctx, "slow-memory traffic", x0 + 6, my, { size: 11, color: C.ink3 });
        const maxT = 2 + 4 * N;
        PV.box(ctx, x0 + 6, my + 10, colW - 12, 12, { r: 4, fill: C.panel });
        PV.box(ctx, x0 + 6, my + 10, Math.max(4, ((colW - 12) * traffic) / maxT), 12, { r: 4, fill: flash ? api.color : C.bad });
      };
      drawSide(12, false);
      drawSide(24 + colW, true);
    });
    const ctl = PV.controls(root);
    ctl.button("↻ Replay", () => (t0 = 0));
    PV.note(root, "schematic");
    return () => st.stop();
  });

  PV.register({
    id: "flash",
    short: "FlashAttention",
    title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness",
    year: 2022, date: "2022-05",
    track: "speed", era: "foundation",
    authors: "Dao, Fu, Ermon, Rudra, Ré (Stanford, University at Buffalo)",
    venue: "NeurIPS 2022",
    arxiv: "2205.14135", url: "https://arxiv.org/abs/2205.14135",
    oneLiner: "Attention was slow because of memory traffic, not maths. Compute it in small tiles that stay in fast on-chip memory, and it gets several times faster with exactly the same result.",
    why: "It's inside PyTorch and almost every training and serving stack. It also made “design the algorithm around the hardware” a mainstream research idea.",
    signals: { impact: 5, novelty: 5, momentum: 4 },
    tags: ["GPU", "memory", "tiling", "SRAM", "exact attention"],
    builds: ["attention"],
    slides: [
      {
        k: "The problem",
        t: "GPUs spend most of attention's time moving data.",
        h: `<p>A GPU has two kinds of memory:</p>
            <ul><li><b>HBM</b> (main memory): large (40–80 GB) but comparatively slow, about 1.5–2 TB/s on an A100.</li>
            <li><b>SRAM</b> (on-chip): tiny (about 20 MB spread across the chip) but roughly 10× faster.</li></ul>
            <p>Standard attention computes the full N×N score matrix, <b>writes it to HBM</b>, reads it back for softmax, writes the result, and reads it again. For long sequences that matrix is huge, and the GPU's maths units sit idle waiting for memory.</p>`,
        analogy: "A chef with a tiny, fast countertop and a big, slow pantry down the hall. Standard attention carries every half-finished dish back to the pantry between steps. FlashAttention finishes each small batch on the counter.",
      },
      {
        k: "The big idea",
        t: "Be IO-aware: tile it and never store the big matrix.",
        h: `<p>FlashAttention splits Q, K and V into <b>blocks</b> small enough to fit in SRAM. For each block of queries it streams through the blocks of keys and values, updating the output as it goes.</p>
            <p>The N×N matrix is <b>never written to main memory</b>. Memory use drops from growing with N² to growing with N.</p>
            <p>Crucially it's <b>exact</b>: the same numbers as standard attention, not an approximation. Earlier “fast attention” methods traded accuracy for speed and rarely delivered real wall-clock gains.</p>`,
        v: { type: "flashio" },
      },
      {
        k: "The clever bit",
        t: "Softmax without seeing the whole row: keep a running tally.",
        h: `<p>Softmax needs the maximum and the sum over a <b>whole row</b> of scores, but FlashAttention only sees one block at a time. The fix, <b>online softmax</b>, keeps a running maximum <i>m</i> and running sum <i>ℓ</i>. When a new block arrives with a bigger maximum, it rescales what it has accumulated so far.</p>
            <p>For the backward pass (training), instead of storing the big matrix it <b>recomputes</b> it from Q, K, V block by block. That's more arithmetic but less memory traffic, and it's faster overall.</p>`,
        eq: `m_new = max(m, m_block)<br>ℓ_new = e^(m − m_new)·ℓ + e^(m_block − m_new)·ℓ_block<br>O_new = rescale(O) + e^(m_block − m_new)·P_block·V_block`,
      },
      {
        k: "Results",
        t: "Faster training and longer contexts.",
        h: `<ul><li><b>3×</b> faster GPT-2 training (sequence length 1K) than the HuggingFace baseline.</li>
            <li><b>15%</b> faster BERT-large training than the MLPerf 1.1 speed record.</li>
            <li><b>2.4×</b> speed-up on the Long-Range Arena benchmark (1K–4K tokens).</li>
            <li>Long context unlocked: the first Transformer to beat chance on <b>Path-X</b> (16K tokens, 61.4%) and <b>Path-256</b> (64K tokens, 63.1%).</li></ul>`,
        v: { type: "bars",
          title: "Speed-up from FlashAttention",
          subtitle: "× faster than the baseline in each setting",
          items: [
            { label: "BERT-large vs MLPerf record", value: 1.15, hi: true },
            { label: "Long-Range Arena", value: 2.4, hi: true },
            { label: "GPT-2 (seq 1K)", value: 3.0, hi: true },
          ],
          fmt: (v) => v + "×" } },
      {
        k: "Why it matters",
        t: "Hardware-aware algorithms became the norm.",
        h: `<p>FlashAttention is built into PyTorch's <code>scaled_dot_product_attention</code> and powers most LLM training and inference. <b>FlashAttention-2</b> (2023) and <b>-3</b> (2024, for H100's new features) pushed utilisation further. Long context windows (100k to 1M tokens) would be impractical without it.</p>
            <p>The lasting lesson: count <b>bytes moved</b>, not just FLOPs. The same thinking runs through vLLM (memory management), Mamba (a fused scan in SRAM) and Mamba-3 (raising arithmetic intensity during decoding). Tri Dao, the first author here, is also an author of Mamba and Mamba-3.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What made standard attention slow on GPUs?", options: ["Too many multiplications", "Reading and writing the huge N×N matrix to slow memory", "Softmax is hard to compute", "Tokenization"], a: 1, why: "The bottleneck was memory IO between HBM and the compute units." },
      { q: "Is FlashAttention an approximation?", options: ["Yes, it drops small scores", "No, it computes exactly the same result", "Only during training", "Only for short sequences"], a: 1, why: "It reorganises the computation (tiling + online softmax) without changing the maths." },
    ],
    terms: [
      ["HBM", "High-bandwidth memory: the GPU's large main memory."],
      ["SRAM", "Small, very fast on-chip memory."],
      ["IO-aware", "Designed to minimise data movement between memory levels."],
      ["Tiling", "Splitting a big computation into blocks that fit in fast memory."],
      ["Online softmax", "Computing softmax incrementally with a running max and sum."],
      ["Recomputation", "Recalculating values instead of storing them, to save memory."],
    ],
    next: ["vllm", "mamba", "specdec"],
  });
})();
