/* Gated DeltaNet-2: Decoupling Erase and Write in Linear Attention (Hatamizadeh, Choi, Kautz, 2026) */
(function () {
  const { h, C, FONT } = PV;

  /* A real (tiny) fast-weight memory: store key→value facts in a fixed matrix and read them back. */
  PV.defineViz("deltamem", (root, o, api) => {
    const d = 12, F = 8;
    const r = PV.rng(2026);
    const unit = () => { const v = Array.from({ length: d }, () => r() * 2 - 1); const n = Math.hypot(...v); return v.map((x) => x / n); };
    const keys = Array.from({ length: F + 4 }, unit);
    const vals = Array.from({ length: F }, unit);
    const newVals = { 2: unit(), 5: unit() };
    // stream: store 8 facts, update facts 2 and 5, then 4 unrelated writes
    const stream = [...Array.from({ length: F }, (_, i) => ({ k: i, v: vals[i], label: `store fact ${i + 1}` })),
      { k: 2, v: newVals[2], label: "UPDATE fact 3" }, { k: 5, v: newVals[5], label: "UPDATE fact 6" },
      ...[8, 9, 10, 11].map((i) => ({ k: i, v: unit(), label: "unrelated write" }))];
    let rule = "delta", t0 = 0;
    const run = (upto) => {
      const S = Array.from({ length: d }, () => new Array(d).fill(0));
      for (let s = 0; s < upto; s++) {
        const { k, v } = stream[s];
        const key = keys[k];
        if (rule === "gated") for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) S[i][j] *= 0.88;
        // read what the memory currently returns for this key
        const read = new Array(d).fill(0);
        for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) read[j] += S[i][j] * key[i];
        const beta = 1;
        for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
          const target = rule === "linear" ? v[j] : beta * (v[j] - read[j]); // delta rule writes the correction
          S[i][j] += key[i] * target;
        }
      }
      return S;
    };
    const recall = (S, f) => {
      const key = keys[f], want = newVals[f] || vals[f];
      const out = new Array(d).fill(0);
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) out[j] += S[i][j] * key[i];
      const n = Math.hypot(...out) || 1;
      return out.reduce((a, x, j) => a + (x / n) * want[j], 0);
    };
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      t0 += dt;
      const step = Math.min(stream.length, Math.floor(t0 / 0.8));
      if (t0 > 0.8 * (stream.length + 5)) t0 = 0;
      const S = run(step);
      // wide: memory matrix left, recall bars right. phones: matrix on top, bars underneath
      const narrow = W < 520;
      const top = narrow ? 30 : 84, bot = 110;
      const cs = narrow ? Math.min((W - 40) / d, 15) : Math.min((W * 0.42) / d, (H - top - bot) / d);
      let mx = 0.01; S.forEach((row) => row.forEach((v) => (mx = Math.max(mx, Math.abs(v)))));
      const mx0 = narrow ? (W - d * cs) / 2 : 20;
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
        const v = S[i][j] / mx;
        ctx.fillStyle = v >= 0 ? PV.alpha(api.color, Math.abs(v)) : PV.alpha(C.reason, Math.abs(v));
        ctx.fillRect(mx0 + j * cs, top + i * cs, cs - 1, cs - 1);
      }
      PV.text(ctx, "memory matrix S (fixed size)", narrow ? 14 : 20, top - 12, { size: 11, font: FONT.mono, color: C.ink3 });
      PV.text(ctx, step < stream.length ? `next: ${stream[step].label}` : "done", narrow ? 14 : 20, top + d * cs + 18, { size: 12, weight: 700, color: C.glow });
      // recall bars
      const bx = narrow ? 14 : 40 + d * cs, bw = narrow ? W - 28 : W - bx - 24;
      const btop = narrow ? top + d * cs + 58 : top;
      PV.text(ctx, narrow ? "can it recall each fact's current value?" : "can it recall each fact's CURRENT value?", bx, btop - 12, { size: 11, font: FONT.mono, color: C.ink3 });
      const rowH = narrow ? 26 : (H - top - bot) / F;
      const labW = narrow ? 118 : 110;
      for (let f = 0; f < F; f++) {
        const y = btop + f * rowH;
        const written = stream.slice(0, step).some((st2) => st2.k === f);
        const c = written ? recall(S, f) : 0;
        const good = c > 0.9;
        PV.text(ctx, `fact ${f + 1}${newVals[f] ? " (updated)" : ""}`, bx, y + rowH / 2, { size: 11.5, color: written ? C.ink : C.ink3 });
        const x0 = bx + labW, trackW = bw - labW - 44, len = Math.max(0, c) * trackW;
        PV.box(ctx, x0, y + rowH * 0.25, trackW, rowH * 0.5, { r: 3, fill: C.panel });
        if (written) PV.box(ctx, x0, y + rowH * 0.25, len, rowH * 0.5, { r: 3, fill: good ? C.good : c > 0.7 ? C.arch : C.bad });
        if (written) PV.text(ctx, c.toFixed(2), x0 + len + 6, y + rowH / 2, { size: 11, font: FONT.mono });
      }
      const msg = {
        linear: "<b>Plain linear attention:</b> only ever adds. Updated facts come back as a blend of old and new, and memories interfere.",
        delta: "<b>Delta rule:</b> read what's stored under the key, write only the correction. Updates overwrite cleanly.",
        gated: "<b>Gated delta rule:</b> decay everything a little each step (clears clutter), then apply the delta. Older facts fade, which is the trade-off.",
      }[rule];
      cap.set(msg + " (1.00 = perfect recall)");
    });
    st.phoneHeight(540);
    const ctl = PV.controls(root);
    ctl.toggle([["linear", "Linear attention"], ["delta", "Delta rule"], ["gated", "Gated delta"]], rule, (v) => { rule = v; t0 = 0; });
    ctl.button("↻ Replay", () => (t0 = 0));
    PV.note(root, "real computation, 12-dim toy memory");
    return () => st.stop();
  });

  PV.register({
    id: "gdn2",
    short: "Gated DeltaNet-2",
    title: "Gated DeltaNet-2: Decoupling Erase and Write in Linear Attention",
    year: 2026, date: "2026-05",
    track: "arch", era: "frontier",
    authors: "Ali Hatamizadeh, Yejin Choi, Jan Kautz (NVIDIA)",
    arxiv: "2605.22791", url: "https://arxiv.org/abs/2605.22791",
    oneLiner: "A fixed-size memory needs to erase and write carefully. Give it separate, per-channel knobs for “what to erase” and “what to write”, and long-context recall jumps.",
    why: "Delta-rule layers (Gated DeltaNet, Kimi Delta Attention) are already in shipping hybrid models. This is the newest step, and it beats Mamba-3 head-to-head.",
    signals: { impact: 3, novelty: 4, momentum: 4 },
    tags: ["linear attention", "delta rule", "fast weights", "memory editing", "long context"],
    builds: ["mamba", "mamba3"],
    slides: [
      {
        k: "Background",
        t: "Linear attention is a memory matrix.",
        h: `<p>Instead of storing every past token (the KV cache), linear attention keeps one fixed-size matrix <b>S</b>. Each token <b>writes</b> an association “key → value” into it, and a query <b>reads</b> by multiplying: <i>output = Sᵀq</i>.</p>
            <p>That's constant memory and linear time. But plain linear attention only ever <b>adds</b>. Nothing is removed, so old facts pile up and interfere, and changing a stored fact is impossible.</p>`,
        eq: `write: S ← S + k·vᵀ      read: o = Sᵀ·q`,
        analogy: "A whiteboard of fixed size. Plain linear attention keeps writing on top of old notes without erasing, until it's unreadable.",
      },
      {
        k: "A short history of forgetting",
        t: "Decay, then delta, then both.",
        h: `<ul><li><b>Mamba-2:</b> multiply the whole memory by a decay factor each step, a <b>global fade</b>.</li>
            <li><b>DeltaNet:</b> before writing, <b>read</b> what's stored under this key and write only the <b>difference</b>. This is exactly one step of online learning (“fast weights”).</li>
            <li><b>Gated DeltaNet:</b> fade + delta together.</li>
            <li><b>Kimi Delta Attention (KDA):</b> the fade becomes <b>per-channel</b>.</li></ul>
            <p>The simulation on the right is real maths on a tiny 12×12 memory. Switch rules and watch what happens to the two facts that get updated.</p>`,
        eq: `delta rule: S ← S + β·k·(v − Sᵀk)ᵀ`,
        v: { type: "deltamem" },
      },
      {
        k: "The big idea",
        t: "Erasing and writing are different jobs.",
        h: `<p>In all of those rules, one scalar <b>β</b> controls two decisions at once:</p>
            <ul><li><b>Erase</b>: which parts of the old content (on the <b>key</b> side) to remove.</li>
            <li><b>Write</b>: which parts of the new value (on the <b>value</b> side) to commit.</li></ul>
            <p>These live on <b>different axes</b> of the memory matrix, so tying them together is a needless restriction. Gated DeltaNet-2 replaces β with a <b>channel-wise erase gate bₜ</b> and a <b>channel-wise write gate wₜ</b>. When both collapse to one scalar you get KDA back, and with scalar decay too you get Gated DeltaNet.</p>
            <p>The paper also derives an efficient chunked training algorithm, so the extra flexibility doesn't slow training down.</p>`,
        eq: `e_t = b_t ⊙ k_t   (what to erase)     z_t = w_t ⊙ v_t   (what to write)<br>S_t = D_t·S_{t−1} + k_t·( z_t − (D_t·S_{t−1})ᵀ·e_t )ᵀ`,
        v: { type: "flow",
          nodes: [
            { id: "old", label: "Memory S", sub: "fixed size", x: 0.14, y: 0.5 },
            { id: "decay", label: "Decay D", sub: "per-channel fade", x: 0.38, y: 0.5 },
            { id: "erase", label: "Erase gate b", sub: "key channels", x: 0.64, y: 0.18 },
            { id: "write", label: "Write gate w", sub: "value channels", x: 0.64, y: 0.82 },
            { id: "new", label: "Updated S", x: 0.88, y: 0.5 },
          ],
          edges: [{ a: "old", b: "decay" }, { a: "decay", b: "erase" }, { a: "decay", b: "write" }, { a: "erase", b: "new", label: "remove stale" }, { a: "write", b: "new", label: "commit new" }],
          steps: [
            { on: ["old", "decay"], edges: ["old>decay"], text: "Broad clean-up: each channel of the memory fades at its own learned rate." },
            { on: ["decay", "erase"], edges: ["decay>erase"], text: "Targeted erase: remove only selected parts of what's stored under this key." },
            { on: ["decay", "write"], edges: ["decay>write"], text: "Selective write: commit only the value channels worth keeping." },
            { on: ["erase", "write", "new"], edges: ["erase>new", "write>new"], text: "Two separate decisions, where older layers forced them to share one knob." },
          ] } },
      {
        k: "Results",
        t: "Biggest win: finding needles among many keys.",
        h: `<p>At 1.3B parameters trained on 100B FineWeb-Edu tokens, Gated DeltaNet-2 had the best average on language modelling and commonsense reasoning among recurrent models: <b>53.11</b> vs 52.39 (Mamba-3 MIMO), 52.28 (KDA), 52.07 (Gated DeltaNet), 51.82 (Mamba-2).</p>
            <p>The clearest gain is on the <b>multi-key needle-in-a-haystack</b> test, where the memory must keep several competing associations apart. That's exactly the interference problem this design targets.</p>`,
        v: { type: "bars",
          title: "Multi-key needle-in-a-haystack (RULER MK-NIAH-1)",
          subtitle: "% retrieved correctly · recurrent 1.3B models · paper's Table 3",
          series: [
            { name: "1K context", color: C.line2, values: [29.0, 58.0, 54.0, 49.4, 72.6] },
            { name: "4K context", color: C.arch, values: [21.4, 27.8, 28.0, 18.0, 37.8] },
          ],
          categories: ["Mamba-2", "Gated DeltaNet", "KDA", "Mamba-3 (MIMO)", "Gated DeltaNet-2"],
          max: 80, fmt: (v) => v.toFixed(1) } },
      {
        k: "Why it matters",
        t: "Memory editing is the frontier of efficient models.",
        h: `<p>The pressure point for any fixed-size memory is <b>interference</b>: too many compressed associations colliding. Better editing rules directly buy longer, more reliable context at constant cost.</p>
            <p>These layers ship inside hybrids: Qwen3-Next uses Gated DeltaNet, Kimi Linear uses KDA, and NVIDIA's Nemotron line uses Mamba. With Mamba-3 (the SSM view) and Gated DeltaNet-2 (the delta-rule, “test-time regression” view) published two months apart, 2026 is a real race between the two perspectives.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What does the delta rule write into memory?", options: ["The whole value, added on top", "Only the difference between the new value and what's currently stored for that key", "Nothing, it only reads", "A random vector"], a: 1, why: "It reads the current association and writes the correction: one step of online regression." },
      { q: "What does Gated DeltaNet-2 split apart?", options: ["Keys and queries", "The erase decision (key side) and the write decision (value side)", "Training and inference", "Heads and layers"], a: 1, why: "One scalar β used to control both. Now each gets its own channel-wise gate." },
    ],
    terms: [
      ["Linear attention", "Attention computed through a fixed-size state matrix, giving linear time."],
      ["Delta rule", "Update memory by writing only the error between the target and the current readout."],
      ["Fast weights", "A memory matrix updated on the fly during a sequence, like weights learned at test time."],
      ["Needle in a haystack", "A test that hides a fact in long context and asks the model to retrieve it."],
      ["Interference", "Stored associations corrupting each other in a shared memory."],
    ],
    next: ["mamba3", "nemotron", "mamba"],
  });
})();
