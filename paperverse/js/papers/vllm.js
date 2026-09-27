/* Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., 2023) */
(function () {
  const { h, C, FONT } = PV;

  /* GPU memory simulator: contiguous reservation vs paged blocks. */
  PV.defineViz("paged", (root, o, api) => {
    const COLS = 16, ROWS = 10, CAP = COLS * ROWS, MAXLEN = 20;
    const palette = [C.arch, C.train, C.reason, C.speed, C.inside, "#ff9ad5", "#9be15d", "#ffd166"];
    let mode = "paged", reqs = [], nextId = 0, timer = 0, served = 0;
    const rnd = PV.rng(3);
    const newReq = () => ({ id: nextId++, len: 1, target: 4 + Math.floor(rnd() * 14), color: palette[nextId % palette.length], cells: [], start: -1 });
    let cells = new Array(CAP).fill(null); // null | {id, used}
    let queue = [];
    function reset() { reqs = []; nextId = 0; cells = new Array(CAP).fill(null); queue = []; served = 0; }
    function tryAdmit() {
      while (queue.length) {
        const r = queue[0];
        if (mode === "contig") {
          // needs MAXLEN contiguous free cells reserved up front
          let start = -1;
          for (let s = 0; s + MAXLEN <= CAP; s++) {
            let ok = true;
            for (let j = 0; j < MAXLEN; j++) if (cells[s + j]) { ok = false; break; }
            if (ok) { start = s; break; }
          }
          if (start < 0) return;
          for (let j = 0; j < MAXLEN; j++) cells[start + j] = { id: r.id, used: j < r.len };
          r.start = start;
        } else {
          const free = cells.indexOf(null);
          if (free < 0) return;
          cells[free] = { id: r.id, used: true };
          r.cells = [free];
        }
        reqs.push(queue.shift());
      }
    }
    function tick() {
      // arrivals
      while (queue.length < 6) queue.push(newReq());
      // each running request generates one more block of tokens
      for (const r of [...reqs]) {
        if (r.len >= r.target) {
          // finished: free its memory
          for (let i = 0; i < CAP; i++) if (cells[i] && cells[i].id === r.id) cells[i] = null;
          reqs.splice(reqs.indexOf(r), 1);
          served++;
          continue;
        }
        r.len++;
        if (mode === "contig") cells[r.start + r.len - 1].used = true;
        else {
          const free = cells.indexOf(null);
          if (free >= 0) { cells[free] = { id: r.id, used: true }; r.cells.push(free); }
          else r.len--; // out of memory: wait
        }
      }
      tryAdmit();
    }
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      timer += dt;
      if (timer > 0.35) { timer = 0; tick(); }
      const top = 52, gw = Math.min(W - 40, (H - top - 150) * (COLS / ROWS)), cs = gw / COLS;
      const x0 = (W - gw) / 2;
      const colorOf = (id) => (reqs.find((r) => r.id === id) || { color: C.ink3 }).color;
      let used = 0, reserved = 0;
      for (let i = 0; i < CAP; i++) {
        const x = x0 + (i % COLS) * cs, y = top + Math.floor(i / COLS) * cs;
        const c = cells[i];
        if (!c) { PV.box(ctx, x + 1, y + 1, cs - 2, cs - 2, { r: 3, stroke: C.line }); continue; }
        if (c.used) { used++; PV.box(ctx, x + 1, y + 1, cs - 2, cs - 2, { r: 3, fill: PV.alpha(colorOf(c.id), 0.8) }); }
        else {
          reserved++;
          PV.box(ctx, x + 1, y + 1, cs - 2, cs - 2, { r: 3, fill: PV.alpha(C.bad, 0.12), stroke: PV.alpha(C.bad, 0.5) });
          ctx.strokeStyle = PV.alpha(C.bad, 0.5);
          ctx.beginPath(); ctx.moveTo(x + 3, y + cs - 3); ctx.lineTo(x + cs - 3, y + 3); ctx.stroke();
        }
      }
      const by = top + ROWS * cs + 16;
      PV.text(ctx, `running requests: ${reqs.length}   ·   waiting: ${queue.length}   ·   finished: ${served}`, x0, by, { size: 12, color: C.ink });
      PV.text(ctx, `memory holding real tokens: ${Math.round((used / CAP) * 100)}%   ·   reserved but empty (wasted): ${Math.round((reserved / CAP) * 100)}%`, x0, by + 20, { size: 12, color: reserved ? C.bad : C.good });
      cap.set(mode === "contig"
        ? `<b>Old way:</b> each request grabs a contiguous slab big enough for the longest possible answer. Red hatching = reserved but unused.`
        : `<b>PagedAttention:</b> memory is handed out one small block at a time, anywhere it's free, like pages in an operating system.`);
    });
    const ctl = PV.controls(root);
    ctl.toggle([["paged", "PagedAttention (vLLM)"], ["contig", "Contiguous (before)"]], "paged", (v) => { mode = v; reset(); });
    ctl.button("↻ Reset", reset);
    PV.note(root, "toy simulation · 1 cell = 1 block of tokens");
    return () => st.stop();
  });

  PV.register({
    id: "vllm",
    short: "vLLM / PagedAttention",
    title: "Efficient Memory Management for Large Language Model Serving with PagedAttention",
    year: 2023, date: "2023-09",
    track: "speed", era: "foundation",
    authors: "Kwon, Li, Zhuang, Sheng, Zheng, Yu, Gonzalez, Zhang, Stoica (UC Berkeley, Stanford, UC San Diego)",
    venue: "SOSP 2023",
    arxiv: "2309.06180", url: "https://arxiv.org/abs/2309.06180",
    oneLiner: "Borrow virtual memory from operating systems: store each chat's KV cache in small pages instead of one big slab, and serve 2–4× more users on the same GPUs.",
    why: "vLLM became one of the most-used open-source LLM serving engines. If you've used an open model through an API, it probably ran on this idea.",
    signals: { impact: 5, novelty: 4, momentum: 4 },
    tags: ["serving", "KV cache", "paging", "throughput", "memory"],
    builds: ["attention", "flash"],
    slides: [
      {
        k: "Background",
        t: "The KV cache: the model's short-term memory for a chat.",
        h: `<p>When generating token 500, attention needs the keys and values of tokens 1–499. Recomputing them every step would be wasteful, so servers <b>cache</b> them. This is the <b>KV cache</b>.</p>
            <p>It's big. For a 13B model it's roughly <b>0.8 MB per token</b>, so one 2,000-token conversation needs about 1.6 GB. And it grows as the answer is written, by an amount nobody knows in advance.</p>
            <p>How many users a GPU can serve at once is mostly limited by <b>how much KV cache fits</b>.</p>`,
        analogy: "Every conversation needs a notebook that grows as you talk. The question is how to hand out shelf space for notebooks when you don't know how long each one will get.",
      },
      {
        k: "The problem",
        t: "60–80% of that memory was being wasted.",
        h: `<p>Serving systems of the time (FasterTransformer, Orca) stored each request's KV cache as one <b>contiguous</b> slab, reserved for the <b>maximum</b> possible length.</p>
            <ul><li><b>Reservation waste:</b> space held for tokens that may never be generated.</li>
            <li><b>Fragmentation:</b> gaps between slabs too small for the next request.</li>
            <li><b>No sharing:</b> ten samples from the same prompt stored that prompt ten times.</li></ul>
            <p>The authors measured that only <b>20–38%</b> of KV cache memory held actual tokens. Toggle to “Contiguous” on the right to see the waste build up.</p>`,
        v: { type: "paged" },
      },
      {
        k: "The big idea",
        t: "Pages, just like an operating system.",
        h: `<p><b>PagedAttention</b> splits each KV cache into fixed-size <b>blocks</b> (e.g. 16 tokens). Blocks can live <b>anywhere</b> in GPU memory. A per-request <b>block table</b> maps the logical order to physical locations, exactly like virtual memory pages.</p>
            <ul><li>Memory is allocated one block at a time, <b>on demand</b>. Waste is at most one half-empty block per request.</li>
            <li>Requests with the same prompt can <b>share</b> blocks, copying only when they diverge (copy-on-write). That makes parallel sampling and beam search much cheaper.</li></ul>
            <p>The attention kernel was rewritten to gather keys and values from scattered blocks.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "seq", label: "Request: “The cat sat on the mat …”", x: 0.5, y: 0.1, maxW: 0.6 },
            { id: "l0", label: "logical block 0", x: 0.2, y: 0.42 },
            { id: "l1", label: "logical block 1", x: 0.5, y: 0.42 },
            { id: "l2", label: "logical block 2", x: 0.8, y: 0.42 },
            { id: "p7", label: "physical #7", x: 0.8, y: 0.85, color: C.speed },
            { id: "p1", label: "physical #1", x: 0.2, y: 0.85, color: C.speed },
            { id: "p3", label: "physical #3", x: 0.5, y: 0.85, color: C.speed },
          ],
          edges: [{ a: "seq", b: "l0" }, { a: "seq", b: "l1" }, { a: "seq", b: "l2" }, { a: "l0", b: "p7", label: "block table" }, { a: "l1", b: "p1" }, { a: "l2", b: "p3" }],
          steps: [
            { on: ["seq", "l0", "l1", "l2"], edges: ["seq>l0", "seq>l1", "seq>l2"], text: "The request's tokens are split into fixed-size logical blocks, in order." },
            { on: ["l0", "l1", "l2", "p7", "p1", "p3"], edges: ["l0>p7", "l1>p1", "l2>p3"], text: "A block table maps each one to any free physical block. They don't need to be next to each other." },
          ] } },
      {
        k: "Results",
        t: "2–4× more throughput, under 4% waste.",
        h: `<p>At the same latency, vLLM served <b>2–4× more requests per second</b> than FasterTransformer and Orca. The gains were larger with longer sequences, bigger models and more complex decoding (parallel sampling, beam search), because that's where sharing and waste matter most.</p>
            <p>KV cache waste dropped to <b>under 4%</b>.</p>`,
        v: { type: "bars",
          title: "Share of KV-cache memory holding real tokens",
          subtitle: "higher is better · from the paper",
          items: [
            { label: "Previous systems (worst)", value: 20 },
            { label: "Previous systems (best)", value: 38 },
            { label: "vLLM", value: 96, hi: true },
          ],
          max: 100, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "Serving is a systems problem, and systems ideas transfer.",
        h: `<p>vLLM grew into one of the most widely used open-source inference engines, and paged KV caches became standard across serving stacks (TensorRT-LLM, SGLang, Hugging Face TGI). SGLang's <b>RadixAttention</b> extended prefix sharing into a tree, so agents that resend the same long system prompt get it almost free.</p>
            <p>The lesson: a decades-old operating-systems idea (virtual memory paging) solved a brand-new AI bottleneck. Together with FlashAttention and speculative decoding, this is why tokens got so much cheaper.</p>
            <p>And the KV cache is exactly what the linear-time models (Mamba, Mamba-3, GDN-2, hybrids) try to shrink or eliminate.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What is the KV cache?", options: ["The model's weights", "Stored keys and values of previous tokens, reused during generation", "A cache of user prompts", "The tokenizer vocabulary"], a: 1, why: "Caching keys and values avoids recomputing attention inputs for past tokens at every step." },
      { q: "Which OS idea does PagedAttention borrow?", options: ["Process scheduling", "Virtual memory paging", "File permissions", "Interrupts"], a: 1, why: "Fixed-size pages plus a table mapping logical to physical locations." },
    ],
    terms: [
      ["KV cache", "Stored attention keys and values for past tokens, reused during generation."],
      ["Throughput", "How many requests or tokens a server handles per second."],
      ["Fragmentation", "Wasted memory from gaps that are too small to use."],
      ["Block table", "A map from a sequence's logical blocks to physical memory blocks."],
      ["Copy-on-write", "Share memory until someone modifies it, then copy."],
    ],
    next: ["specdec", "mamba", "nemotron"],
  });
})();
