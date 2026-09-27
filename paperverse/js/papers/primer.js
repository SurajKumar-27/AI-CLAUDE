/* Primer: LLMs from zero. Not a paper, the on-ramp every other deck assumes. */
(function () {
  const { h, C, FONT } = PV;

  /* Tokenizer playground: a toy sub-word splitter that behaves like BPE on common English. */
  const COMMON = ["the", "ing", "tion", "er", "ed", "and", "re", "un", "able", "ly", "ment", "ness", "pre", "ation", "est", "er", "s"];
  const WHOLE = new Set("the a an and of to in is it you that he was for on are as with his they i at be this have from or one had by word but not what all were we when your can said there use each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did get come made may part language model models large learn learning cat sat mat dog".split(" "));
  function toyTokenize(text) {
    const out = [];
    const parts = text.match(/\s*[A-Za-z]+|\s*\d|\s*[^\sA-Za-z\d]/g) || [];
    parts.forEach((p) => {
      const lead = p.match(/^\s*/)[0];
      const word = p.slice(lead.length);
      const lw = word.toLowerCase();
      if (!/[a-z]/i.test(word) || WHOLE.has(lw) || word.length <= 4) { out.push(lead + word); return; }
      // peel known suffixes, then split the stem into chunks of up to 5 letters
      let stem = word, tail = [];
      for (const suf of ["ation", "tion", "ment", "ness", "able", "ing", "est", "ed", "ly", "er", "s"]) {
        if (stem.toLowerCase().endsWith(suf) && stem.length - suf.length >= 3) { tail.unshift(stem.slice(-suf.length)); stem = stem.slice(0, -suf.length); break; }
      }
      const chunks = [];
      for (let i = 0; i < stem.length; i += 5) chunks.push(stem.slice(i, i + 5));
      chunks[0] = lead + chunks[0];
      out.push(...chunks, ...tail);
    });
    return out;
  }
  const hash = (s) => { let x = 2166136261; for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return (x >>> 0) % 50000; };

  PV.defineViz("tokenizer", (root, o, api) => {
    const wrap = h("div", { class: "dom-viz" });
    root.appendChild(wrap);
    const inp = h("input", { type: "text", id: "tok-input", value: "Tokenization turns unbelievable sentences into pieces!", "aria-label": "Text to tokenize" });
    const row = h("div", { class: "tokrow" });
    const ids = h("div", { class: "tokrow" });
    const stat = h("p", { style: { margin: 0, color: C.ink2, fontSize: "0.85rem" } });
    wrap.append(h("h4", null, "Type anything"), inp, h("h4", null, "What the model sees: tokens"), row, h("h4", null, "…which are really just numbers (token IDs)"), ids, stat);
    const palette = [C.arch, C.train, C.reason, C.speed, C.inside];
    const run = () => {
      const toks = toyTokenize(inp.value);
      row.innerHTML = ""; ids.innerHTML = "";
      toks.forEach((t, i) => {
        const c = palette[i % palette.length];
        row.appendChild(h("span", { class: "tok", style: { borderColor: c, background: PV.alpha(c, 0.14) } }, t.replace(/ /g, "·")));
        ids.appendChild(h("span", { class: "tok", style: { color: c } }, String(hash(t))));
      });
      const words = (inp.value.match(/\S+/g) || []).length;
      stat.innerHTML = `<b style="color:${C.ink}">${words}</b> words became <b style="color:${C.ink}">${toks.length}</b> tokens. Common words stay whole; rare words get split into reusable pieces. (“·” marks a space.)`;
    };
    inp.addEventListener("input", run);
    run();
    PV.note(root, "Toy tokenizer, simplified");
    return () => {};
  });

  /* Next-token predictor with a temperature knob. */
  PV.defineViz("nexttoken", (root, o, api) => {
    const prompts = o.prompts;
    let pi = 0, temp = 1, sampled = null, flash = 0;
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      const pr = prompts[pi];
      const probs = PV.softmax(pr.logits, temp);
      const top = 70, left = Math.min(150, W * 0.28), right = 70, bh = Math.min(30, (H - top - 80) / probs.length - 6);
      cap.set(`<b>Prompt:</b> “${pr.text} <span style="color:${api.color}">___</span>”`);
      flash = Math.max(0, flash - dt);
      probs.forEach((p, i) => {
        const y = top + i * (bh + 8);
        const w = (W - left - right) * p;
        const isS = sampled === i;
        PV.text(ctx, pr.words[i], left - 10, y + bh / 2, { size: 14, weight: 700, align: "right", color: isS ? C.glow : C.ink2 });
        PV.box(ctx, left, y, W - left - right, bh, { r: 6, fill: C.panel });
        PV.box(ctx, left, y, Math.max(3, w), bh, { r: 6, fill: isS ? C.glow : PV.alpha(api.color, 0.35 + 0.65 * p) });
        PV.text(ctx, (p * 100).toFixed(1) + "%", left + Math.max(3, w) + 8, y + bh / 2, { size: 12, font: FONT.mono, color: C.ink });
      });
      if (sampled != null) {
        const y = top + probs.length * (bh + 8) + 20;
        PV.text(ctx, `Picked: “${pr.words[sampled]}”  →  ${pr.text} ${pr.words[sampled]}`, left, y, { size: 14, weight: 700, color: C.glow, alpha: 0.5 + 0.5 * Math.min(1, 1 - flash) });
      }
    });
    const ctl = PV.controls(root);
    ctl.toggle(prompts.map((p, i) => [i, p.label]), 0, (v) => { pi = v; sampled = null; });
    ctl.slider("Temperature", { min: 0.1, max: 2.5, step: 0.1, value: 1, fmt: (v) => v.toFixed(1), onInput: (v) => (temp = v) });
    ctl.button("🎲 Sample a word", () => {
      const probs = PV.softmax(prompts[pi].logits, temp);
      let r = Math.random(), i = 0;
      while (i < probs.length - 1 && (r -= probs[i]) > 0) i++;
      sampled = i; flash = 1;
    });
    return () => st.stop();
  });

  /* A tiny neural-network picture: numbers flowing through weighted connections. */
  PV.defineViz("neurons", (root, o, api) => {
    const layers = [4, 6, 6, 4];
    const rnd = PV.rng(5);
    const W8 = layers.slice(1).map((n, li) => Array.from({ length: n }, () => Array.from({ length: layers[li] }, () => rnd() * 2 - 1)));
    PV.caption(root, "<b>A neural network is layers of numbers.</b> Each line is a weight; training nudges billions of them.");
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      const xs = layers.map((_, i) => 60 + (i * (W - 120)) / (layers.length - 1));
      const ys = layers.map((n) => Array.from({ length: n }, (_, j) => 70 + ((j + 0.5) * (H - 150)) / n));
      for (let li = 1; li < layers.length; li++) {
        for (let j = 0; j < layers[li]; j++) for (let k = 0; k < layers[li - 1]; k++) {
          const w = W8[li - 1][j][k];
          ctx.strokeStyle = w > 0 ? PV.alpha(api.color, Math.abs(w) * 0.6) : PV.alpha(C.reason, Math.abs(w) * 0.6);
          ctx.lineWidth = 0.5 + Math.abs(w) * 2;
          ctx.beginPath();
          ctx.moveTo(xs[li - 1], ys[li - 1][k]);
          ctx.lineTo(xs[li], ys[li][j]);
          ctx.stroke();
        }
      }
      const wave = (t * 0.6) % 1.4;
      layers.forEach((n, li) => ys[li].forEach((y, j) => {
        const on = Math.max(0, 1 - Math.abs(wave * (layers.length - 1) - li) * 1.4);
        ctx.fillStyle = on > 0.05 ? PV.mix(C.panel2, C.glow, on) : C.panel2;
        ctx.strokeStyle = C.line2;
        ctx.beginPath();
        ctx.arc(xs[li], y, 11, 0, 7);
        ctx.fill();
        ctx.stroke();
      }));
      ["input", "hidden", "hidden", "output"].forEach((l, i) => PV.text(ctx, l, xs[i], H - 70, { size: 11, font: FONT.mono, color: C.ink3, align: "center" }));
    });
    return () => st.stop();
  });

  PV.register({
    id: "primer",
    short: "LLMs from zero",
    title: "How a Large Language Model Works, From Zero",
    year: 2026, date: "2026-09",
    track: "primer", era: "primer",
    authors: "Paperverse primer",
    oneLiner: "Tokens, embeddings, next-word prediction, training, and the harness around it: the minimum you need before any paper.",
    tags: ["tokens", "embeddings", "weights", "training", "sampling", "harness"],
    hero: { type: "stack3d", words: ["I", "love", "learning", "about", "AI"], output: "→ “!”" },
    slides: [
      {
        k: "The one-sentence version",
        t: "An LLM is a machine that guesses the next word, extremely well.",
        h: `<p>That's genuinely it. ChatGPT, Claude, Gemini and Llama all do one thing at their core: read some text and predict what comes next, one small piece at a time.</p>
            <p>Everything that looks like intelligence, answering questions, writing code, reasoning, comes from doing this one trick at a huge scale, on a huge amount of text, with a lot of clever training on top.</p>
            <p>This deck gives you the <b>six ideas</b> every paper in this collection assumes you know.</p>`,
        analogy: "Your phone's keyboard suggests the next word. An LLM is that same idea, scaled up about a billion times and trained on a large share of everything humans have written.",
        v: { type: "stack3d", words: ["The", "capital", "of", "France", "is"], output: "→ Paris (94%)" },
      },
      {
        k: "Idea 1 · Tokens",
        t: "Models don't read words. They read tokens.",
        h: `<p>Before anything else, text is chopped into <b>tokens</b>: whole common words, or pieces of rarer ones. “unbelievable” might become <code>un</code> + <code>believ</code> + <code>able</code>.</p>
            <p>Each token maps to a number. A model has a fixed <b>vocabulary</b>, usually 32,000 to 200,000 tokens. Prices and context limits (“128k tokens”) are counted in tokens.</p>
            <p>Rule of thumb: <b>1 token ≈ ¾ of an English word</b>.</p>`,
        v: { type: "tokenizer" },
      },
      {
        k: "Idea 2 · Embeddings",
        t: "Each token becomes a point in a space of meaning.",
        h: `<p>A token ID is just a label. The model looks it up in a table and gets a list of numbers, a <b>vector</b>, often 4,000+ numbers long. That vector is the token's <b>embedding</b>.</p>
            <p>Training arranges these points so that <b>similar meanings sit close together</b>, and directions carry meaning. Going from “man” to “woman” is roughly the same move as “king” to “queen”.</p>
            <p>The 3D view on the right squashes thousands of dimensions down to three so you can see the idea.</p>`,
        v: { type: "embed3d" },
      },
      {
        k: "Idea 3 · The network",
        t: "Layers of weights turn those vectors into a prediction.",
        h: `<p>The vectors flow through dozens of <b>layers</b>. Each layer mixes information between tokens (that's <b>attention</b>, the next deck) and then transforms each token's vector.</p>
            <p>All of this is multiplication by big grids of numbers called <b>weights</b> or <b>parameters</b>. “A 70B model” means 70 billion of them.</p>
            <p>At the top, the model outputs a score for every token in its vocabulary: how likely is each one to come next?</p>`,
        v: { type: "neurons" },
      },
      {
        k: "Idea 4 · Prediction and sampling",
        t: "The output is a probability for every possible next token.",
        h: `<p>The model never “knows” the answer. It produces a <b>probability distribution</b>. Then we <b>sample</b>: pick one token, add it to the text, and run the whole thing again. Word by word, an answer appears.</p>
            <p><b>Temperature</b> controls the randomness. Low temperature almost always picks the top choice, which is safe but repetitive. High temperature picks surprising words, which is more creative but riskier.</p>
            <p>Try the slider, then sample a few times.</p>`,
        v: {
          type: "nexttoken",
          prompts: [
            { label: "Capital", text: "The capital of France is", words: ["Paris", "a", "located", "the", "Lyon", "beautiful"], logits: [6.2, 2.4, 2.0, 1.6, 0.9, 0.7] },
            { label: "Story", text: "Once upon a time, there was a", words: ["little", "young", "king", "girl", "dragon", "robot"], logits: [3.1, 2.6, 2.3, 2.1, 1.6, 0.8] },
            { label: "Code", text: "for i in", words: ["range(", "items", "list", "enumerate(", "x", "zip("], logits: [5.0, 2.2, 1.7, 1.9, 1.0, 0.8] },
          ],
        },
      },
      {
        k: "Idea 5 · Training",
        t: "Training is millions of tiny corrections.",
        h: `<p>Start with random weights, so the model predicts gibberish. Show it real text with the next word hidden, measure how wrong its guess was (the <b>loss</b>), and nudge every weight slightly in the direction that would have made it less wrong. That nudge is <b>gradient descent</b>.</p>
            <p>Repeat trillions of times. Modern models train on 10 to 30+ <b>trillion tokens</b> using thousands of GPUs for months. This first phase is called <b>pre-training</b>.</p>`,
        analogy: "You're blindfolded on a hilly landscape and want to reach the lowest valley. You feel which way the ground slopes and take a small step downhill. Again and again.",
        v: { type: "landscape3d" },
      },
      {
        k: "Idea 6 · From predictor to assistant",
        t: "Three stages turn raw text-prediction into a helpful assistant.",
        h: `<ol>
              <li><b>Pre-training:</b> learn language and world knowledge by predicting the next token on huge amounts of text. Result: a “base model” that autocompletes and doesn't follow instructions.</li>
              <li><b>Supervised fine-tuning (SFT):</b> train on examples of good conversations so it learns to answer like an assistant.</li>
              <li><b>Reinforcement learning (RLHF / RL):</b> let it try, score the attempts (by humans, a reward model, or automatic checks like “did the code pass the tests?”), and reinforce what worked.</li>
            </ol>
            <p>Most papers in this collection improve one of these three stages, or make the model faster to run.</p>`,
        v: {
          type: "flow",
          nodes: [
            { id: "web", label: "Internet-scale text", sub: "trillions of tokens", x: 0.16, y: 0.12 },
            { id: "base", label: "Base model", sub: "great autocomplete", x: 0.5, y: 0.12 },
            { id: "sft", label: "SFT", sub: "learn from example chats", x: 0.84, y: 0.45 },
            { id: "rl", label: "RL / RLHF", sub: "reward what works", x: 0.5, y: 0.78 },
            { id: "chat", label: "Assistant", sub: "helpful, safer", x: 0.16, y: 0.78 },
          ],
          edges: [{ a: "web", b: "base", label: "pre-train" }, { a: "base", b: "sft" }, { a: "sft", b: "rl" }, { a: "rl", b: "chat" }],
          steps: [
            { on: ["web", "base"], edges: ["web>base"], text: "Pre-training: predict the next token on everything. Costs the most compute by far." },
            { on: ["base", "sft"], edges: ["base>sft"], text: "SFT: show it thousands of ideal question → answer examples." },
            { on: ["sft", "rl"], edges: ["sft>rl"], text: "RL: sample answers, score them, push the model toward the high-scoring ones." },
            { on: ["rl", "chat"], edges: ["rl>chat"], text: "Result: the assistant you chat with." },
          ],
        },
      },
      {
        k: "Bonus · The harness",
        t: "An agent is a model inside a harness.",
        h: `<p>On its own, a model only turns text into more text. An <b>agent</b> wraps it in a <b>harness</b>, the code around the model that:</p>
            <ul>
              <li>writes the <b>system prompt</b> and instructions,</li>
              <li>gives it <b>tools</b> (search, run code, edit files) and feeds the results back,</li>
              <li>manages <b>memory and context</b> (what the model sees at each step),</li>
              <li>decides <b>when to stop</b>.</li>
            </ul>
            <p>Claude Code and Codex are harnesses. In 2026 some of the most interesting papers (SkillOpt, RRSI) are about letting AI <b>improve its own harness</b>.</p>`,
        v: {
          type: "flow",
          nodes: [
            { id: "user", label: "Your task", x: 0.12, y: 0.15 },
            { id: "harness", label: "Harness", sub: "prompts · memory · control", x: 0.5, y: 0.15, maxW: 0.34 },
            { id: "model", label: "LLM", sub: "frozen weights", x: 0.5, y: 0.55 },
            { id: "tools", label: "Tools", sub: "shell · browser · files", x: 0.86, y: 0.55 },
            { id: "done", label: "Result", x: 0.12, y: 0.85 },
          ],
          edges: [{ a: "user", b: "harness" }, { a: "harness", b: "model", label: "context" }, { a: "model", b: "tools", label: "tool call", bend: -0.2 }, { a: "tools", b: "harness", label: "output", bend: -0.25 }, { a: "harness", b: "done" }],
          steps: [
            { on: ["user", "harness"], edges: ["user>harness"], text: "The harness packs your task, instructions and relevant memory into the model's context." },
            { on: ["harness", "model"], edges: ["harness>model"], text: "The model reads it all and decides what to do next." },
            { on: ["model", "tools"], edges: ["model>tools"], text: "It asks for a tool: run a test, open a file, search the web." },
            { on: ["tools", "harness"], edges: ["tools>harness"], text: "The harness runs it and feeds the result back. Loop until done." },
            { on: ["harness", "done"], edges: ["harness>done"], text: "When the model says it's finished, the harness returns the result." },
          ],
        },
      },
    ],
    quiz: [
      { q: "What is an LLM fundamentally trained to do?", options: ["Search the internet for answers", "Predict the next token", "Store facts in a database", "Translate between languages"], a: 1, why: "Everything else emerges from next-token prediction at scale plus fine-tuning on top." },
      { q: "Raising the temperature makes the model…", options: ["Smarter", "Faster", "More random and surprising", "Use fewer tokens"], a: 2, why: "Temperature flattens the probability distribution, so less likely tokens get picked more often." },
      { q: "What is a harness?", options: ["The model's weights", "The code around a model that gives it prompts, tools and memory", "A type of GPU", "The training dataset"], a: 1, why: "Same model, different harness, very different agent. That's why harness research is booming." },
    ],
    terms: [
      ["Token", "A chunk of text (word or word-piece) the model reads and writes."],
      ["Embedding", "The vector of numbers that represents a token's meaning."],
      ["Parameters / weights", "The learned numbers inside the network. “70B” means 70 billion of them."],
      ["Loss", "A score of how wrong the model's prediction was. Training pushes it down."],
      ["Gradient descent", "Nudging every weight a little in the direction that lowers the loss."],
      ["Temperature", "A knob that makes sampling more (high) or less (low) random."],
      ["Pre-training", "The first, most expensive phase: next-token prediction on huge text corpora."],
      ["Harness", "Prompts, tools, memory and control flow wrapped around a model to make an agent."],
    ],
    next: ["attention", "gpt3", "instructgpt"],
  });
})();
