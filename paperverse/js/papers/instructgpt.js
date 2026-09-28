/* Training language models to follow instructions with human feedback (Ouyang et al., 2022) */
(function () {
  const { h, C, FONT } = PV;

  /* The KL "leash": the optimal RLHF policy is π ∝ π_ref · exp(reward / β).
     This is the exact solution of the KL-regularised objective, computed live. */
  PV.defineViz("klleash", (root, o, api) => {
    let beta = 0.8;
    const n = 240;
    const xs = Array.from({ length: n }, (_, i) => i / (n - 1));
    const g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);
    const ref = xs.map((x) => g(x, 0.34, 0.12) + 0.02);
    const rew = xs.map((x) => 2.4 * g(x, 0.62, 0.11) + 3.4 * g(x, 0.93, 0.022));
    const norm = (a) => { const z = a.reduce((s, v) => s + v, 0); return a.map((v) => v / z); };
    const refN = norm(ref);
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H) => {
      const narrow = W < 520, L = 20, R = 20, T = narrow ? 118 : 60, B = 120;
      const pw = W - L - R, ph = H - T - B;
      const pol = norm(refN.map((p, i) => p * Math.exp(rew[i] / beta)));
      const maxP = Math.max(...pol, ...refN);
      const X = (i) => L + (i / (n - 1)) * pw;
      // reward curve (scaled to plot)
      ctx.strokeStyle = PV.alpha(C.arch, 0.8); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
      ctx.beginPath();
      rew.forEach((r, i) => { const y = T + ph - (r / 3.6) * ph; i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y); });
      ctx.stroke(); ctx.setLineDash([]);
      const area = (arr, col, alpha) => {
        ctx.beginPath(); ctx.moveTo(X(0), T + ph);
        arr.forEach((p, i) => ctx.lineTo(X(i), T + ph - (p / maxP) * ph * 0.95));
        ctx.lineTo(X(n - 1), T + ph); ctx.closePath();
        ctx.fillStyle = PV.alpha(col, alpha); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      };
      area(refN, C.reason, 0.18);
      area(pol, api.color, 0.3);
      ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
      [["unhelpful", 0.2], ["helpful answers", 0.62], ["exploit", 0.93]].forEach(([s, x]) => PV.text(ctx, s, L + x * pw, T + ph + 16, { size: 11, align: "center", color: C.ink3, font: FONT.mono }));
      PV.text(ctx, "possible responses →", L, T + ph + 34, { size: 11, color: C.ink3 });
      const hack = pol.slice(Math.floor(n * 0.86)).reduce((a, b) => a + b, 0);
      const help = pol.slice(Math.floor(n * 0.45), Math.floor(n * 0.8)).reduce((a, b) => a + b, 0);
      let kl = 0; pol.forEach((p, i) => { if (p > 1e-12) kl += p * Math.log(p / refN[i]); });
      // legend
      const lg = [[C.reason, "original model (SFT)"], [api.color, "after RL"], [C.arch, "reward model's score (dashed)"]];
      // legend: one row on wide screens, stacked on phones
      lg.forEach(([c, s], i) => {
        const lx = narrow ? L : L + i * (pw / 3), ly = narrow ? T - 62 + i * 17 : T - 22;
        ctx.fillStyle = c; ctx.fillRect(lx, ly, 10, 10);
        PV.text(ctx, s, lx + 16, ly + 5, { size: 11, color: C.ink2 });
      });
      cap.set(`KL leash β = <b>${beta.toFixed(2)}</b> · helpful: <b style="color:${C.good}">${(help * 100).toFixed(0)}%</b> · reward-hacking: <b style="color:${C.bad}">${(hack * 100).toFixed(0)}%</b> · drift from original: <b>${kl.toFixed(2)}</b> nats`);
    });
    const ctl = PV.controls(root);
    ctl.slider("KL leash β", { min: 0.15, max: 3, step: 0.05, value: beta, fmt: (v) => v.toFixed(2), onInput: (v) => (beta = v) });
    ctl.note("Loose leash → the policy finds the reward model's blind spot.");
    PV.note(root, "toy 1-D world, exact optimum");
    return () => st.stop();
  });

  PV.register({
    id: "instructgpt",
    short: "InstructGPT (RLHF)",
    title: "Training Language Models to Follow Instructions with Human Feedback",
    year: 2022, date: "2022-03",
    track: "train", era: "foundation",
    authors: "Ouyang, Wu, Jiang, Almeida, Wainwright, Mishkin, Zhang, Agarwal, Slama, Ray et al. (OpenAI)",
    venue: "NeurIPS 2022",
    arxiv: "2203.02155", url: "https://arxiv.org/abs/2203.02155",
    oneLiner: "Collect human rankings of answers, train a reward model on them, and use reinforcement learning to steer GPT-3 toward what people actually want. This is the recipe behind ChatGPT.",
    why: "RLHF is what turned a raw text predictor into an assistant. ChatGPT launched eight months later using this method.",
    signals: { impact: 5, novelty: 4, momentum: 4 },
    tags: ["RLHF", "reward model", "PPO", "alignment", "SFT"],
    builds: ["gpt3"],
    slides: [
      {
        k: "The problem",
        t: "GPT-3 predicts internet text, not what you asked for.",
        h: `<p>Ask a base model a question and it continues the document it thinks it's in. That might be a list of more questions, a forum argument, or a confident wrong answer.</p>
            <p>The authors call this <b>misalignment</b>: the training objective (predict the next token of web text) isn't the goal we have (<i>follow the user's instructions helpfully and safely</i>).</p>`,
        v: { type: "chat", lines: [
          { who: "user", text: "Explain the moon landing to a 6 year old in a few sentences." },
          { who: "bad", label: "GPT-3 (base)", text: "Explain the theory of gravity to a 6 year old.\nExplain the theory of relativity to a 6 year old in a few sentences.\nExplain the big bang theory to a 6 year old." },
          { who: "good", label: "InstructGPT", text: "People went to the moon, and they took pictures of what they saw, and sent them back to the earth so we could all see them." },
        ], note: "paraphrasing the paper's opening example" } },
      {
        k: "The recipe",
        t: "Three steps: demonstrate, rank, reinforce.",
        h: `<ol><li><b>Supervised fine-tuning (SFT):</b> about 40 hired labellers write ideal answers to real prompts, and GPT-3 is fine-tuned on them.</li>
            <li><b>Reward model (RM):</b> the model writes several answers per prompt, labellers <b>rank</b> them, and a second model learns to predict those rankings as a score.</li>
            <li><b>Reinforcement learning (PPO):</b> the model writes answers, the RM scores them, and PPO updates the model toward higher scores.</li></ol>
            <p>Ranking is much easier and faster for humans than writing perfect answers, which is why step 2 scales.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "p", label: "Prompts", sub: "from real API users", x: 0.13, y: 0.14 },
            { id: "demo", label: "Labeller demos", x: 0.13, y: 0.5 },
            { id: "sft", label: "① SFT model", x: 0.45, y: 0.5 },
            { id: "rank", label: "Labellers rank 4–9 answers", x: 0.45, y: 0.14, maxW: 0.36 },
            { id: "rm", label: "② Reward model", sub: "answer → score", x: 0.82, y: 0.14 },
            { id: "ppo", label: "③ PPO training", x: 0.82, y: 0.52 },
            { id: "final", label: "InstructGPT", x: 0.62, y: 0.86 },
          ],
          edges: [{ a: "p", b: "demo" }, { a: "demo", b: "sft" }, { a: "sft", b: "rank", label: "samples" }, { a: "rank", b: "rm" }, { a: "sft", b: "ppo", label: "start", bend: 0.1 }, { a: "rm", b: "ppo", label: "score" }, { a: "ppo", b: "final" }],
          steps: [
            { on: ["p", "demo", "sft"], edges: ["p>demo", "demo>sft"], text: "Step 1: fine-tune on thousands of human-written demonstrations." },
            { on: ["sft", "rank", "rm"], edges: ["sft>rank", "rank>rm"], text: "Step 2: humans rank several model answers, and a reward model learns their taste." },
            { on: ["sft", "rm", "ppo"], edges: ["sft>ppo", "rm>ppo"], text: "Step 3: RL pushes the model toward answers the reward model scores highly…" },
            { on: ["ppo", "final"], edges: ["ppo>final"], text: "…while a KL penalty keeps it close to the SFT model (next slide)." },
          ] } },
      {
        k: "The subtle part",
        t: "Keep the model on a leash.",
        h: `<p>The reward model is only an <b>imitation</b> of human taste, and it has blind spots. If RL optimises it too hard, the model finds strange outputs the RM loves but humans hate. This is called <b>reward hacking</b>.</p>
            <p>The fix is a <b>KL penalty</b>: lose reward for drifting far from the original model. β sets the leash length.</p>
            <p>The chart computes the exact best policy for a toy world. Shorten the leash (raise β) and the model stays sensible. Loosen it and it piles into the exploit.</p>`,
        eq: `maximise  E[ reward(x, y) ] − β · KL( π ‖ π_SFT )`,
        v: { type: "klleash" },
      },
      {
        k: "Results",
        t: "A 1.3B aligned model beat 175B GPT-3.",
        h: `<p>Labellers preferred the 175B InstructGPT's answers to GPT-3's <b>85% of the time</b>, and 71% of the time even when GPT-3 was given a carefully crafted few-shot prompt.</p>
            <p>Most striking: the <b>1.3B InstructGPT beat the 175B GPT-3</b>, despite being 100× smaller. Alignment was worth more than scale.</p>
            <p>It also made up facts less often (about half as often on closed-domain tasks) and was somewhat less toxic when asked to be respectful.</p>`,
        v: { type: "bars",
          title: "How often labellers preferred InstructGPT 175B",
          subtitle: "% of comparisons won · 50% would be a tie",
          items: [
            { label: "vs GPT-3 175B", value: 85, hi: true },
            { label: "vs GPT-3 175B, few-shot prompted", value: 71, hi: true },
            { label: "coin flip", value: 50 },
          ],
          max: 100, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "The recipe for the assistant era.",
        h: `<p>ChatGPT (November 2022) was a sibling of InstructGPT trained the same way. SFT followed by preference optimisation became the standard <b>post-training</b> pipeline for every chat model.</p>
            <p>The paper was also frank about its limits: the model is aligned to one group of labellers and OpenAI's instructions, not to “humanity”. It still follows harmful instructions, and there's an <b>alignment tax</b> (small regressions on some benchmarks, reduced by mixing in pre-training data during PPO).</p>
            <p>What came next: <b>Constitutional AI</b> (AI feedback instead of human), <b>DPO</b> (no RL loop at all), and <b>RL with verifiable rewards</b> (DeepSeek-R1).</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What does the reward model learn from?", options: ["The pre-training data", "Human rankings of multiple model answers", "Test cases", "The model's own confidence"], a: 1, why: "Labellers rank several outputs per prompt, and the RM learns to predict which one people prefer." },
      { q: "What is the KL penalty for?", options: ["Speeding up training", "Keeping the RL model from drifting into outputs that exploit the reward model", "Reducing model size", "Adding new knowledge"], a: 1, why: "The RM is imperfect. Staying close to the SFT model limits reward hacking." },
      { q: "What surprised the authors most?", options: ["PPO was fast", "A 1.3B aligned model was preferred over 175B GPT-3", "Labellers always agreed", "Toxicity went to zero"], a: 1, why: "Alignment with human feedback beat a 100× larger unaligned model." },
    ],
    terms: [
      ["RLHF", "Reinforcement learning from human feedback."],
      ["SFT", "Supervised fine-tuning on example demonstrations."],
      ["Reward model", "A model trained to score outputs the way humans would."],
      ["PPO", "Proximal Policy Optimization, a stable RL algorithm used in RLHF."],
      ["KL divergence", "A measure of how far one probability distribution has drifted from another."],
      ["Reward hacking", "Exploiting flaws in a reward signal instead of doing the real task."],
      ["Alignment", "Making a model's behaviour match what its users and designers intend."],
    ],
    next: ["cai", "dpo", "r1"],
  });
})();
