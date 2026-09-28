/* Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020) */
(function () {
  const { h, C, FONT } = PV;

  /* Documents as points in embedding space; the query finds its nearest neighbours. */
  PV.defineViz("ragsearch", (root, o, api) => {
    const rnd = PV.rng(21);
    const topics = [
      { name: "space", color: C.reason, cx: 0.25, cy: 0.3, docs: ["Apollo 11 landed on the Moon in July 1969.", "Neil Armstrong was the first person to walk on the Moon.", "The Saturn V rocket launched the Apollo missions.", "Buzz Aldrin was the lunar module pilot on Apollo 11."] },
      { name: "cooking", color: C.train, cx: 0.72, cy: 0.28, docs: ["Risotto is cooked by slowly adding stock to rice.", "Sourdough uses a fermented starter instead of yeast.", "Searing meat creates flavour via the Maillard reaction."] },
      { name: "music", color: C.inside, cx: 0.3, cy: 0.72, docs: ["The piano has 88 keys.", "Beethoven wrote nine symphonies.", "A violin has four strings."] },
      { name: "sport", color: C.speed, cx: 0.74, cy: 0.7, docs: ["A marathon is 42.195 km long.", "Cricket's first Test match was played in 1877.", "Tennis scoring goes 15, 30, 40, game."] },
    ];
    const docs = [];
    topics.forEach((tp) => tp.docs.forEach((d, i) => docs.push({ text: d, color: tp.color, x: tp.cx + (rnd() - 0.5) * 0.2, y: tp.cy + (rnd() - 0.5) * 0.2, topic: tp.name })));
    const queries = [
      { q: "Who was the first person on the Moon?", x: 0.24, y: 0.27, answer: "Neil Armstrong, on Apollo 11 in July 1969 [1][2]." },
      { q: "How long is a marathon?", x: 0.76, y: 0.73, answer: "42.195 km [1]." },
      { q: "How many keys does a piano have?", x: 0.29, y: 0.7, answer: "88 keys [1]." },
    ];
    let qi = 0, t0 = 0;
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      t0 += dt;
      const q = queries[qi];
      const narrow = W < 520, ox = 14, oy = narrow ? 44 : 50;
      // phones: map on top, passages underneath; wider screens: side by side
      const mapW = narrow ? W - 28 : W * 0.56, mapH = narrow ? Math.min(170, (H - oy - 100) * 0.4) : H - 130;
      const X = (x) => ox + x * mapW, Y = (y) => oy + y * mapH;
      PV.box(ctx, ox, oy, mapW, mapH, { r: 10, stroke: C.line });
      PV.text(ctx, "document index (embedding space)", ox + 8, oy + 12, { size: 10.5, font: FONT.mono, color: C.ink3 });
      const ranked = docs.map((d, i) => ({ i, dist: Math.hypot(d.x - q.x, d.y - q.y) })).sort((a, b) => a.dist - b.dist);
      const k = 3, topSet = new Set(ranked.slice(0, k).map((r) => r.i));
      const phase = Math.min(1, t0 / 1.4);
      const radius = ranked[k - 1].dist * mapW * PV.easeOut(phase) + 4;
      docs.forEach((d, i) => {
        const hit = topSet.has(i) && phase >= 1;
        ctx.fillStyle = hit ? C.glow : PV.alpha(d.color, 0.8);
        ctx.beginPath();
        ctx.arc(X(d.x), Y(d.y), hit ? 7 : 5, 0, 7);
        ctx.fill();
      });
      ctx.strokeStyle = PV.alpha(C.glow, 0.6);
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), radius, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = api.color;
      ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), 7, 0, 7); ctx.fill();
      PV.text(ctx, "your question", X(q.x) + 10, Y(q.y) - 12, { size: 11, color: api.color, weight: 700 });
      // right: retrieved passages + generated answer
      const rx = narrow ? ox : ox + mapW + 16, rw = narrow ? W - 28 : W - rx - 14;
      const ry = narrow ? oy + mapH + 16 : oy;
      PV.text(ctx, "retrieved passages → added to the prompt", rx, ry + 6, { size: 10.5, font: FONT.mono, color: C.ink3 });
      ctx.font = `400 12px ${FONT.body}`;
      let y = ry + 20;
      ranked.slice(0, k).forEach((r, n) => {
        const appear = PV.clamp((t0 - 1.4 - n * 0.4) / 0.4, 0, 1);
        if (appear <= 0) return;
        const lines = PV.wrap(ctx, `[${n + 1}] ${docs[r.i].text}`, rw - 16);
        const bh = lines.length * 16 + 12;
        ctx.globalAlpha = appear;
        PV.box(ctx, rx, y, rw, bh, { r: 8, fill: C.panel, stroke: C.line2 });
        lines.forEach((ln, li) => PV.text(ctx, ln, rx + 8, y + 14 + li * 16, { size: 12, color: C.ink2 }));
        ctx.globalAlpha = 1;
        y += bh + 8;
      });
      if (t0 > 3.2) {
        const lines = PV.wrap(ctx, "Answer: " + q.answer, rw - 16);
        const bh = lines.length * 17 + 14;
        PV.box(ctx, rx, y + 6, rw, bh, { r: 8, fill: PV.alpha(C.good, 0.14), stroke: C.good });
        lines.forEach((ln, li) => PV.text(ctx, ln, rx + 8, y + 22 + li * 17, { size: 12.5, weight: 700 }));
      }
      cap.set(`<b>Question:</b> ${q.q}`);
    });
    const ctl = PV.controls(root);
    ctl.toggle(queries.map((q, i) => [i, ["Moon", "Marathon", "Piano"][i]]), 0, (v) => { qi = v; t0 = 0; });
    ctl.button("↻ Replay", () => (t0 = 0));
    PV.note(root, "toy index");
    return () => st.stop();
  });

  PV.register({
    id: "rag",
    short: "RAG",
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    year: 2020, date: "2020-05",
    track: "reason", era: "foundation",
    authors: "Lewis, Perez, Piktus, Petroni, Karpukhin, Goyal, Küttler, Lewis, Yih, Rocktäschel, Riedel, Kiela (Facebook AI, UCL, NYU)",
    venue: "NeurIPS 2020",
    arxiv: "2005.11401", url: "https://arxiv.org/abs/2005.11401",
    oneLiner: "Before answering, look it up: pair a language model with a search index so answers come from documents, not just memory.",
    why: "Nearly every “chat with your documents” product, AI search engine and enterprise assistant is a RAG system.",
    signals: { impact: 5, novelty: 4, momentum: 4 },
    tags: ["retrieval", "vector search", "embeddings", "grounding", "citations"],
    builds: ["attention"],
    slides: [
      {
        k: "The problem",
        t: "A model's knowledge is frozen inside its weights.",
        h: `<p>Everything a plain LLM knows was squeezed into its parameters during training. That causes three problems:</p>
            <ul><li><b>Out of date:</b> it can't know what happened after training.</li>
            <li><b>Hallucination:</b> when unsure, it produces fluent, confident, wrong answers.</li>
            <li><b>No sources:</b> it can't show where an answer came from, and you can't fix one fact without retraining.</li></ul>`,
        analogy: "A closed-book exam versus an open-book exam. RAG lets the model bring a library into the exam room.",
        v: { type: "chat", lines: [
          { who: "user", text: "What did our company's Q3 policy update say about remote work?" },
          { who: "bad", label: "Model without retrieval", text: "The Q3 update allows employees to work remotely up to three days a week, effective immediately." },
          { who: "system", text: "(It has never seen your policy. It made that up because it sounds plausible.)" },
          { who: "user", text: "Who won yesterday's match?" },
          { who: "bad", label: "Model without retrieval", text: "I don't have information past my training cutoff…" },
        ] } },
      {
        k: "The big idea",
        t: "Retrieve first, then generate.",
        h: `<p>RAG splits the job in two:</p>
            <ol><li>A <b>retriever</b> turns your question into a vector (an embedding) and finds the passages whose vectors are closest, out of <b>21 million Wikipedia passages</b> in the paper.</li>
            <li>A <b>generator</b> (a seq2seq model, BART) reads the question plus those passages and writes the answer.</li></ol>
            <p>Pick a question and watch the search, the retrieved passages, and the grounded answer with citations.</p>`,
        v: { type: "ragsearch" },
      },
      {
        k: "How it works",
        t: "Both halves are neural, and they train together.",
        h: `<p>The retriever is <b>DPR</b> (Dense Passage Retrieval): one encoder for questions and one for passages, trained so matching pairs land near each other. Search is a fast <b>maximum inner product search</b> over pre-computed passage vectors.</p>
            <p>During fine-tuning, the error signal flows back into the question encoder, so the retriever learns what the generator finds useful. The passage index is left fixed, which keeps training cheap.</p>
            <p>Two variants: <b>RAG-Sequence</b> uses the same passages for the whole answer; <b>RAG-Token</b> can draw on different passages for different words.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "q", label: "Question", x: 0.12, y: 0.5 },
            { id: "qe", label: "Question encoder", sub: "text → vector", x: 0.36, y: 0.2 },
            { id: "idx", label: "Vector index", sub: "21M Wikipedia passages", x: 0.66, y: 0.2 },
            { id: "gen", label: "Generator (BART)", sub: "question + top passages", x: 0.5, y: 0.78, maxW: 0.36 },
            { id: "a", label: "Answer", x: 0.88, y: 0.78 },
          ],
          edges: [{ a: "q", b: "qe" }, { a: "qe", b: "idx", label: "nearest vectors" }, { a: "idx", b: "gen", label: "top-k passages" }, { a: "q", b: "gen" }, { a: "gen", b: "a" }],
          steps: [
            { on: ["q", "qe"], edges: ["q>qe"], text: "Encode the question as a vector." },
            { on: ["qe", "idx"], edges: ["qe>idx"], text: "Find the k passages whose vectors are most similar (k was 5 to 10)." },
            { on: ["idx", "gen", "q"], edges: ["idx>gen", "q>gen"], text: "Feed question + passages to the generator." },
            { on: ["gen", "a"], edges: ["gen>a"], text: "Generate an answer grounded in what was retrieved." },
          ] } },
      {
        k: "A neat trick",
        t: "Update knowledge by swapping the index, not retraining.",
        h: `<p>Because facts live in the documents rather than the weights, you can change what the model knows by <b>replacing the index</b>.</p>
            <p>The authors showed this by swapping a 2016 Wikipedia snapshot for a 2018 one. Questions about world leaders who had changed in between were then answered correctly, with no retraining at all.</p>
            <p>This is exactly why companies use RAG over their own docs: update the documents and the assistant is instantly up to date.</p>`,
        v: { type: "chat", lines: [
          { who: "user", text: "Who is the president of Peru?" },
          { who: "model", label: "RAG with 2016 index", text: "Pedro Pablo Kuczynski [retrieved from the Dec 2016 snapshot]" },
          { who: "system", text: "Swap index → Wikipedia 2018. No retraining." },
          { who: "good", label: "RAG with 2018 index", text: "Martín Vizcarra [retrieved from the Dec 2018 snapshot]" },
        ], note: "illustrative of the paper's index hot-swap test" } },
      {
        k: "Results",
        t: "State of the art on open-domain question answering.",
        h: `<p>On Natural Questions (real Google search questions), RAG beat both a huge closed-book model (T5-11B, which has to answer from memory) and earlier retrieve-then-extract systems.</p>
            <p>Human raters also judged its generated text as <b>more factual and more specific</b> than a comparable model without retrieval.</p>`,
        v: { type: "bars",
          title: "Natural Questions, exact-match accuracy",
          subtitle: "% of answers exactly right · paper's Table 1",
          items: [
            { label: "T5-11B (closed book)", value: 34.5 },
            { label: "REALM", value: 40.4 },
            { label: "DPR (extractive)", value: 41.5 },
            { label: "RAG-Token", value: 44.1, hi: true },
            { label: "RAG-Sequence", value: 44.5, hi: true },
          ],
          max: 60, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "The default way to give AI your knowledge.",
        h: `<p>RAG created a whole stack: <b>embedding models</b>, <b>vector databases</b>, chunking strategies, rerankers. AI search engines, “chat with your PDF”, customer-support bots and coding assistants that read your repo all use it.</p>
            <p><b>What's changed since:</b> models now have 100k to 1M-token context windows, so sometimes you can paste everything in. Agents now retrieve with tools (search, grep) inside a ReAct-style loop, and RAG has become one tool among several. Retrieval quality is still the usual weak spot: if the right passage isn't found, the answer is wrong.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "Where does a RAG system get facts for its answer?", options: ["Only from its weights", "From documents retrieved at question time", "From the user's previous chats", "From a calculator"], a: 1, why: "The retriever finds relevant passages, and the generator conditions on them." },
      { q: "How did the authors update the model's knowledge of world leaders?", options: ["Retrained the whole model", "Fine-tuned on news", "Swapped the document index for a newer one", "Added a rule"], a: 2, why: "Knowledge lives in the index, so replacing it updates the answers without touching the weights." },
    ],
    terms: [
      ["RAG", "Retrieval-augmented generation: search documents, then generate an answer grounded in them."],
      ["Retriever", "The component that finds relevant passages for a query."],
      ["Vector database", "Storage built for fast nearest-neighbour search over embeddings."],
      ["Hallucination", "Fluent, confident output that isn't supported by facts."],
      ["Grounding", "Tying a model's answer to specific source documents."],
    ],
    next: ["react", "cot", "gpt3"],
  });
})();
