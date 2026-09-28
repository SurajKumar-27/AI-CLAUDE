/* Chain-of-Thought Prompting Elicits Reasoning in Large Language Models (Wei et al., 2022) */
(function () {
  const { h, C, FONT } = PV;

  /* Each generated token = one full pass through the network. More tokens, more thinking. */
  PV.defineViz("passes", (root, o, api) => {
    const direct = ["The", "answer", "is", "27."];
    const cot = ["23", "−", "20", "=", "3.", "3", "+", "6", "=", "9.", "The", "answer", "is", "9."];
    PV.caption(root, "<b>Every token the model writes costs one full trip through all its layers.</b> Writing the steps out buys more computation and a written-down scratchpad.");
    const st = PV.canvasLoop(root, (ctx, W, H, t) => {
      // tokens wrap onto extra rows on narrow screens instead of shrinking to unreadable boxes
      const cw = Math.max(40, Math.min(46, (W - 40) / cot.length));
      const perRow = Math.max(1, Math.floor((W - 40) / cw));
      const rowH = 62;
      const lane = (y, toks, label, color, ok) => {
        const n = toks.length;
        const cyc = 9, u = (t % cyc) / cyc;
        const shown = Math.min(n, Math.floor(u * 1.3 * n) + 1);
        PV.text(ctx, label, 20, y - 44, { size: 12, font: FONT.mono, color: C.ink3 });
        for (let i = 0; i < shown; i++) {
          const x = 20 + (i % perRow) * cw, yy = y + Math.floor(i / perRow) * rowH;
          // the stack of layers used to produce this token
          for (let l = 0; l < 5; l++) {
            ctx.fillStyle = PV.alpha(color, 0.18 + l * 0.1);
            ctx.fillRect(x + 2, yy - 34 + l * 5, cw - 4, 4);
          }
          PV.box(ctx, x + 1, yy + 4, cw - 2, 24, { r: 5, fill: C.panel, stroke: C.line2 });
          PV.text(ctx, toks[i], x + cw / 2, yy + 16, { size: 12, align: "center", weight: 700 });
        }
        const by = y + (Math.ceil(n / perRow) - 1) * rowH + 46;
        PV.text(ctx, `${shown} passes through the network`, 20, by, { size: 12, color: C.ink2 });
        if (shown === n) PV.text(ctx, ok ? "✓ correct" : "✗ wrong", W - 20, by, { size: 13, weight: 700, align: "right", color: ok ? C.good : C.bad });
        return by;
      };
      const top = W < 520 ? 150 : H * 0.3;
      const end1 = lane(top, direct, "Direct answer", C.ink3, false);
      lane(Math.max(end1 + 90, W < 520 ? 0 : H * 0.68), cot, "Chain of thought", api.color, true);
    });
    PV.note(root, "illustrative");
    return () => st.stop();
  });

  PV.register({
    id: "cot",
    short: "Chain-of-Thought",
    title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
    year: 2022, date: "2022-01",
    track: "reason", era: "foundation",
    authors: "Wei, Wang, Schuurmans, Bosma, Ichter, Xia, Chi, Le, Zhou (Google Research, Brain)",
    venue: "NeurIPS 2022",
    arxiv: "2201.11903", url: "https://arxiv.org/abs/2201.11903",
    oneLiner: "Show the model worked examples that include the reasoning steps, and it starts reasoning step by step too, solving problems it failed before.",
    why: "The seed of today's “thinking” models. o1, DeepSeek-R1 and Claude's extended thinking are all trained versions of this idea.",
    signals: { impact: 5, novelty: 5, momentum: 5 },
    tags: ["reasoning", "prompting", "step by step", "GSM8K", "emergence"],
    builds: ["gpt3"],
    slides: [
      {
        k: "The problem",
        t: "Big models flunked grade-school word problems.",
        h: `<p>Models that could write essays still failed simple multi-step maths like the one on the right. Asked for the answer directly, they blurt out a number, often wrong.</p>
            <p>Making the model bigger helped surprisingly little on these tasks. The authors wondered whether the knowledge was there but the <b>format</b> was the problem.</p>`,
        v: { type: "chat", lines: [
          { who: "user", text: "Q: The cafeteria had 23 apples. If they used 20 to make lunch and bought 6 more, how many apples do they have?" },
          { who: "bad", label: "Standard prompting", text: "A: The answer is 27." },
        ], note: "example from the paper's Figure 1" } },
      {
        k: "The big idea",
        t: "Put the reasoning into the examples.",
        h: `<p>Keep few-shot prompting (from GPT-3), but in each example write out the <b>intermediate steps</b> before the answer. That's the whole method: no training and no new model.</p>
            <p>The model imitates the format and writes its own chain of thought for the new question. Suddenly it gets the answer right.</p>`,
        v: { type: "chat", lines: [
          { who: "user", label: "Example in the prompt", text: "Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls. Each can has 3 tennis balls. How many tennis balls does he have now?\nA: Roger started with 5 balls. 2 cans of 3 tennis balls each is 6 tennis balls. 5 + 6 = 11. The answer is 11." },
          { who: "user", label: "New question", text: "Q: The cafeteria had 23 apples. If they used 20 to make lunch and bought 6 more, how many apples do they have?" },
          { who: "good", label: "Chain-of-thought prompting", text: "A: The cafeteria had 23 apples originally. They used 20 to make lunch. So they had <mark>23 − 20 = 3</mark>. They bought 6 more apples, so they have <mark>3 + 6 = 9</mark>. The answer is 9." },
        ], note: "example from the paper's Figure 1" } },
      {
        k: "Why it works",
        t: "Thinking out loud buys computation.",
        h: `<p>A model does a fixed amount of work per token: one pass through its layers. Answering “27” immediately means the whole problem must be solved in a few passes.</p>
            <p>Writing steps gives it <b>more passes</b>, and each step is written down where later steps can read it, like a scratchpad. Mistakes also become visible, which matters for debugging and for training later.</p>`,
        analogy: "Doing long division in your head versus on paper. Same brain, much better results when you can write the intermediate numbers down.",
        v: { type: "passes" },
      },
      {
        k: "The twist",
        t: "It only works in big models.",
        h: `<p>Chain-of-thought is an <b>emergent ability</b>. For small models (around 10B parameters or less), it doesn't help, and can even hurt: they produce fluent but illogical chains.</p>
            <p>Around 100B parameters the effect switches on sharply. The paper shows this for three model families (LaMDA, GPT-3, PaLM).</p>`,
        v: { type: "lines",
          title: "Maths word problems (GSM8K) vs model size",
          subtitle: "PaLM family · the 540B points are the paper's numbers, smaller sizes approximate",
          x: { label: "parameters (billions)", min: 8, max: 540, log: true, ticks: [8, 62, 540], fmt: (v) => v + "B" },
          y: { label: "solve rate (%)", min: 0, max: 60, ticks: [0, 20, 40, 60] },
          series: [
            { name: "chain of thought", color: C.reason, points: [[8, 4], [62, 29], [540, 56.9]], dots: true },
            { name: "standard", color: C.ink3, points: [[8, 5], [62, 10], [540, 17.9]], dots: true, labelDy: 8 },
          ] } },
      {
        k: "Results",
        t: "From 18% to 57% with just a prompt.",
        h: `<p>With 8 chain-of-thought examples, PaLM 540B went from <b>17.9% to 56.9%</b> on GSM8K. That beat the previous best, a GPT-3 model fine-tuned on the task and paired with a verifier (55%).</p>
            <p>Gains also appeared on commonsense reasoning (e.g. StrategyQA, sports understanding) and symbolic tasks such as concatenating the last letters of words.</p>`,
        v: { type: "bars",
          title: "GSM8K grade-school maths",
          subtitle: "% solved",
          items: [
            { label: "PaLM 540B, standard prompt", value: 17.9 },
            { label: "Prior best: fine-tuned GPT-3 + verifier", value: 55 },
            { label: "PaLM 540B, chain of thought", value: 56.9, hi: true },
          ],
          max: 100, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "The start of the reasoning era.",
        h: `<p>Follow-ups came fast: <b>“Let's think step by step”</b> (zero-shot CoT, 2022) showed you don't even need examples; <b>self-consistency</b> samples many chains and takes a majority vote; <b>ReAct</b> mixes reasoning with tool use.</p>
            <p>Then the big shift: instead of prompting for chains of thought, <b>train</b> models to produce long ones with reinforcement learning. That's o1 (2024), DeepSeek-R1 (2025) and every “thinking” model since. It also connects to <b>test-time compute</b>: spending more tokens at inference can beat using a bigger model.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What does chain-of-thought prompting change?", options: ["The model's weights", "The examples in the prompt now include reasoning steps", "The tokenizer", "The training data"], a: 1, why: "It's a pure prompting method. The examples demonstrate step-by-step reasoning." },
      { q: "Which models benefited from chain-of-thought in the paper?", options: ["Only small ones", "All sizes equally", "Mainly very large ones (~100B+)", "None"], a: 2, why: "CoT is emergent: small models write illogical chains, and large models benefit a lot." },
    ],
    terms: [
      ["Chain of thought (CoT)", "Intermediate reasoning steps written out before the final answer."],
      ["GSM8K", "A benchmark of about 8,500 grade-school maths word problems."],
      ["Self-consistency", "Sample many reasoning chains and take the majority answer."],
      ["Scratchpad", "Text the model writes to itself to hold intermediate results."],
    ],
    next: ["react", "ttc", "r1"],
  });
})();
