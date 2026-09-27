/* DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning (DeepSeek-AI, 2025) */
(function () {
  const { h, C, FONT } = PV;

  /* GRPO on one question: sample a group, reward each, advantage = better or worse than the group. */
  PV.defineViz("grpo", (root, o, api) => {
    const G = 8;
    let pCorrect = 0.2, round = 0, phase = 0, pt = 0, group = [];
    const rnd = PV.rng(5);
    const good = ["17×24 = 17×20 + 17×4 = 340 + 68 = 408", "24×17: 24×10=240, 24×7=168, sum 408", "(20−3)×24 = 480 − 72 = 408"];
    const bad = ["17×24 ≈ 400, so 398", "17×24 = 17×2×4 = 136", "24+17 = 41… answer 41", "17×24 = 418"];
    function sample() {
      group = Array.from({ length: G }, () => {
        const ok = rnd() < pCorrect;
        const text = ok ? good[Math.floor(rnd() * good.length)] : bad[Math.floor(rnd() * bad.length)];
        return { ok, text, r: ok ? 1 : 0 };
      });
      const m = group.reduce((a, g) => a + g.r, 0) / G;
      const sd = Math.sqrt(group.reduce((a, g) => a + (g.r - m) ** 2, 0) / G) || 1;
      group.forEach((g) => (g.adv = (g.r - m) / sd));
      group.mean = m;
    }
    sample();
    const phases = ["① sample a group of answers", "② score each with a rule (is 408 correct?)", "③ advantage = how much better than the group average", "④ update: make above-average answers more likely"];
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      pt += dt;
      if (pt > 2.2) {
        pt = 0; phase++;
        if (phase === 4) { pCorrect = Math.min(0.95, pCorrect + 0.12 * (group.mean > 0 && group.mean < 1 ? 1 : 0.4)); round++; phase = 0; sample(); }
      }
      const top = 58, cols = W > 640 ? 2 : 1;
      const cw = (W - 40 - (cols - 1) * 12) / cols, chh = Math.min(40, (H - top - 150) / (G / cols) - 8);
      group.forEach((g, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = 20 + col * (cw + 12), y = top + row * (chh + 8);
        const show = phase >= 1;
        PV.box(ctx, x, y, cw, chh, { r: 8, fill: show ? PV.alpha(g.ok ? C.good : C.bad, 0.1) : C.panel, stroke: show ? (g.ok ? C.good : C.bad) : C.line2 });
        const ft = PV.fit(ctx, g.text, cw - 150, 12, { font: FONT.mono, minSize: 10 });
        PV.text(ctx, ft.text, x + 10, y + chh / 2, { size: ft.size, font: FONT.mono, color: C.ink2 });
        if (show) PV.text(ctx, g.ok ? "reward 1" : "reward 0", x + cw - 70, y + chh / 2, { size: 11, weight: 700, color: g.ok ? C.good : C.bad, align: "right" });
        if (phase >= 2) {
          const bw = Math.min(50, Math.abs(g.adv) * 26);
          const cx = x + cw - 30;
          PV.box(ctx, g.adv >= 0 ? cx : cx - bw, y + chh / 2 - 5, bw, 10, { r: 2, fill: g.adv >= 0 ? C.good : C.bad });
        }
      });
      const by = H - 108;
      PV.text(ctx, `Policy after ${round} update${round === 1 ? "" : "s"}: P(correct answer) = ${Math.round(pCorrect * 100)}%`, 20, by, { size: 12.5, weight: 700 });
      PV.box(ctx, 20, by + 12, W - 40, 12, { r: 4, fill: C.panel });
      PV.box(ctx, 20, by + 12, (W - 40) * pCorrect, 12, { r: 4, fill: api.color });
      cap.set(`<b>Q: What is 17 × 24?</b> &nbsp; ${phases[phase]}`);
    });
    const ctl = PV.controls(root);
    ctl.button("↻ Restart", () => { pCorrect = 0.2; round = 0; phase = 0; pt = 0; sample(); });
    ctl.note("No value model and no human labels: the group is its own baseline.");
    PV.note(root, "toy example");
    return () => st.stop();
  });

  PV.register({
    id: "r1",
    short: "DeepSeek-R1",
    title: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning",
    year: 2025, date: "2025-01",
    track: "reason", era: "foundation",
    authors: "DeepSeek-AI (Guo, Yang, Zhang, Song, Zhang, Xu, Zhu, Ma, Wang, Bi et al.)",
    venue: "Nature (2025)",
    arxiv: "2501.12948", url: "https://arxiv.org/abs/2501.12948",
    oneLiner: "Reward a model only for getting checkable answers right, and it teaches itself to reason at length, re-checking and correcting itself, with no human reasoning examples.",
    why: "It showed openly how o1-style reasoning can be trained, released the weights, and made GRPO and “RL with verifiable rewards” the default recipe.",
    signals: { impact: 5, novelty: 5, momentum: 5 },
    tags: ["reinforcement learning", "GRPO", "verifiable rewards", "reasoning", "aha moment", "distillation"],
    builds: ["cot", "ttc", "instructgpt", "dpo"],
    slides: [
      {
        k: "The problem",
        t: "Reasoning models existed, but how to train them was a secret.",
        h: `<p>OpenAI's o1 (Sept 2024) showed that models which “think” for a long time before answering are far better at maths and code. The recipe wasn't published.</p>
            <p>The obvious approach, supervised fine-tuning on human-written reasoning, is expensive and caps the model at human-style solutions. DeepSeek asked a bolder question: <b>can reasoning emerge from reinforcement learning alone?</b></p>`,
        analogy: "Instead of showing a child worked solutions, you give them thousands of puzzles and only say “right” or “wrong” at the end. Over time they invent their own ways of checking their work.",
      },
      {
        k: "The big idea · R1-Zero",
        t: "Pure RL on a base model, with rule-based rewards.",
        h: `<p>Start from the base model (DeepSeek-V3-Base) with <b>no supervised fine-tuning</b>. Give it maths and coding problems whose answers can be <b>checked automatically</b>:</p>
            <ul><li><b>Accuracy reward:</b> is the final answer correct (maths) or do the tests pass (code)?</li><li><b>Format reward:</b> did it put its reasoning inside <code>&lt;think&gt;</code> tags?</li></ul>
            <p>No reward model is trained, so there's nothing for the policy to <b>hack</b>. The RL algorithm is <b>GRPO</b>: sample a group of answers per question and reward each one relative to its siblings.</p>`,
        eq: `advantage_i = ( r_i − mean(r_1…r_G) ) / std(r_1…r_G)<small>GRPO: the group average is the baseline, so PPO's separate value model isn't needed.</small>`,
        v: { type: "grpo" },
      },
      {
        k: "What emerged",
        t: "Longer thinking, and an “aha moment”.",
        h: `<p>Nobody told R1-Zero to think longer. As training went on, its responses grew on their own from hundreds to <b>thousands of tokens</b>, and behaviours emerged: <b>re-checking</b> steps, trying <b>alternative approaches</b>, and <b>backtracking</b>.</p>
            <p>The authors highlight an intermediate checkpoint that stops mid-solution and says the words on the right. It re-examines its approach, in a human-like voice, purely because re-checking earned more reward.</p>
            <p>AIME 2024 accuracy (pass@1) climbed from <b>15.6% to 71.0%</b> during training, and 86.7% with majority voting.</p>`,
        v: { type: "chat", speed: 130, lines: [
          { who: "user", label: "Question", text: "If a > 1, then the sum of the real solutions of √(a − √(a + x)) = x is equal to" },
          { who: "model", label: "R1-Zero, mid-training", text: "To solve the equation √(a − √(a + x)) = x, let's start by squaring both sides… a − √(a + x) = x² … (a − x²)² = a + x … x⁴ − 2ax² − x + (a² − a) = 0 …" },
          { who: "good", label: "R1-Zero", text: "<mark>Wait, wait. Wait. That's an aha moment I can flag here.</mark> Let's reevaluate this step-by-step to identify if the correct sum can be… We started with the equation √(a − √(a + x)) = x. First, let's square both sides…" },
        ], note: "from the paper's “aha moment” table" } },
      {
        k: "From R1-Zero to R1",
        t: "Fix readability with a small warm-up, then RL again.",
        h: `<p>R1-Zero reasoned well but wrote messily, often <b>mixing languages</b> mid-thought. The released <b>DeepSeek-R1</b> adds a multi-stage pipeline:</p>
            <ol><li><b>Cold start:</b> fine-tune on a few thousand clean, long reasoning examples.</li>
            <li><b>Reasoning RL</b> with GRPO, plus a reward for staying in one language.</li>
            <li><b>Rejection sampling:</b> keep the model's own best outputs (about 600k reasoning + 200k general samples) and fine-tune on them.</li>
            <li><b>A final RL round</b> for helpfulness and harmlessness across all tasks.</li></ol>
            <p>Then <b>distillation</b>: the same 800k samples fine-tuned small Qwen and Llama models (1.5B to 70B) into strong reasoners, with no RL needed.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "base", label: "DeepSeek-V3-Base", x: 0.14, y: 0.14 },
            { id: "cold", label: "① Cold-start SFT", sub: "thousands of long CoTs", x: 0.45, y: 0.14 },
            { id: "rl1", label: "② Reasoning RL (GRPO)", x: 0.8, y: 0.14, maxW: 0.34 },
            { id: "rs", label: "③ Rejection sampling + SFT", sub: "~800k samples", x: 0.8, y: 0.55, maxW: 0.36 },
            { id: "rl2", label: "④ RL, all scenarios", x: 0.45, y: 0.55 },
            { id: "r1", label: "DeepSeek-R1", x: 0.14, y: 0.55 },
            { id: "dist", label: "Distilled 1.5B–70B", x: 0.62, y: 0.88 },
          ],
          edges: [{ a: "base", b: "cold" }, { a: "cold", b: "rl1" }, { a: "rl1", b: "rs" }, { a: "rs", b: "rl2" }, { a: "rl2", b: "r1" }, { a: "rs", b: "dist", label: "same data", dashed: true }],
          steps: [
            { on: ["base", "cold"], edges: ["base>cold"], text: "A small set of clean reasoning examples teaches readable formatting." },
            { on: ["cold", "rl1"], edges: ["cold>rl1"], text: "Large-scale RL on verifiable maths/code/logic problems." },
            { on: ["rl1", "rs"], edges: ["rl1>rs"], text: "Collect the model's best answers and fine-tune on them, adding general tasks." },
            { on: ["rs", "rl2", "r1"], edges: ["rs>rl2", "rl2>r1"], text: "A final RL pass for helpfulness and safety gives DeepSeek-R1." },
            { on: ["rs", "dist"], edges: ["rs>dist"], text: "The same samples teach small models to reason (distillation)." },
          ] } },
      {
        k: "Results",
        t: "On par with OpenAI's o1, with open weights.",
        h: `<p>DeepSeek-R1 matched <b>OpenAI-o1-1217</b> on reasoning benchmarks: <b>79.8%</b> on AIME 2024 (vs 79.2%) and 97.3% on MATH-500. Weights were released under the MIT licence.</p>
            <p>Distillation worked remarkably well. Small distilled models beat much larger non-reasoning models, and distilling from R1 worked better than running RL directly on the small model.</p>`,
        v: { type: "bars",
          title: "AIME 2024 maths competition, pass@1",
          subtitle: "% of problems solved · from the paper",
          items: [
            { label: "Base model before RL", value: 15.6 },
            { label: "R1-Zero after pure RL", value: 71.0, hi: true },
            { label: "OpenAI o1-1217", value: 79.2 },
            { label: "DeepSeek-R1", value: 79.8, hi: true },
          ],
          max: 100, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "RL with verifiable rewards became the standard recipe.",
        h: `<p>R1's release (January 2025) was a shock: frontier reasoning, open, cheaply trained, and documented. Within months, <b>GRPO and RLVR</b> (reinforcement learning from verifiable rewards) were in nearly every open post-training pipeline. The work was later published in <b>Nature</b>.</p>
            <p>In 2026 the same idea scales to <b>agentic RL</b>: Nemotron 3 Super trains across 21 environments (maths, code, terminal use, tool calling) with verifiable rewards. The open question is how far RL can go where answers <b>can't</b> be checked automatically.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What rewards did R1-Zero use?", options: ["A learned reward model from human rankings", "Rule-based checks: correct answer + correct format", "Human thumbs-up", "None"], a: 1, why: "Automatically checkable rewards avoid reward hacking and need no human labels." },
      { q: "How does GRPO estimate whether an answer is good?", options: ["With a separate value network", "By comparing its reward to others in the same sampled group", "By asking a human", "By answer length"], a: 1, why: "The group mean and standard deviation act as the baseline." },
      { q: "What is distillation here?", options: ["Removing layers", "Fine-tuning small models on the big model's reasoning outputs", "Compressing weights to 4 bits", "Merging models"], a: 1, why: "800k R1-generated samples turned small Qwen/Llama models into strong reasoners." },
    ],
    terms: [
      ["GRPO", "Group Relative Policy Optimization: RL using a sampled group as its own baseline."],
      ["RLVR", "RL from verifiable rewards: rewards from automatic checks such as tests or exact answers."],
      ["Pass@1", "Accuracy when the model gets one attempt per problem."],
      ["Distillation", "Training a smaller model to imitate a larger model's outputs."],
      ["Cold start", "A small supervised warm-up before RL."],
      ["AIME", "American Invitational Mathematics Examination, a hard competition-maths benchmark."],
    ],
    next: ["ttc", "nemotron", "skillopt"],
  });
})();
