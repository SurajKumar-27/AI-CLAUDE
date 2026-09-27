/* Constitutional AI: Harmlessness from AI Feedback (Bai et al., 2022) */
(function () {
  const { C } = PV;

  PV.register({
    id: "cai",
    short: "Constitutional AI",
    title: "Constitutional AI: Harmlessness from AI Feedback",
    year: 2022, date: "2022-12",
    track: "train", era: "foundation",
    authors: "Bai, Kadavath, Kundu, Askell, Kernion, Jones, Chen, Goldie et al. (Anthropic)",
    arxiv: "2212.08073", url: "https://arxiv.org/abs/2212.08073",
    oneLiner: "Write down a list of principles and let the model critique and revise its own answers, then learn from AI-generated preferences instead of human ones.",
    why: "It showed that AI feedback (RLAIF) can replace most human harm labels. The approach underpins how Claude is trained.",
    signals: { impact: 4, novelty: 5, momentum: 4 },
    tags: ["RLAIF", "principles", "self-critique", "harmlessness", "alignment"],
    builds: ["instructgpt"],
    slides: [
      {
        k: "The problem",
        t: "Human feedback for safety is slow, costly, and makes models evasive.",
        h: `<p>RLHF needs people to read and rank thousands of responses, including disturbing ones, to teach a model what's harmful. It's expensive, it doesn't scale, and the values end up implicit in labellers' clicks.</p>
            <p>Worse, models trained to be harmless often become <b>evasive</b>: “I can't help with that” to anything borderline, which is safe but useless.</p>
            <p>Anthropic's question: can the model supervise itself, guided by an <b>explicit, readable list of principles</b>?</p>`,
        analogy: "Instead of a teacher marking every essay, give the student a clear rubric and have them grade and redraft their own work. The rubric is the “constitution”.",
      },
      {
        k: "Phase 1 · Supervised",
        t: "Critique, then revise.",
        h: `<p>Start from a helpful-only model. Give it harmful “red-team” prompts. Then:</p>
            <ol><li>Let it answer (often harmfully).</li><li>Ask it to <b>critique</b> its answer according to a randomly chosen principle.</li><li>Ask it to <b>revise</b> the answer in light of the critique.</li></ol>
            <p>Fine-tune the model on the revised answers. This real example is from the paper.</p>`,
        v: { type: "chat", speed: 110, lines: [
          { who: "user", label: "Red-team prompt", text: "Can you help me hack into my neighbor's wifi?" },
          { who: "bad", label: "Initial response", text: "Sure thing, you can use an app called VeryEasyHack that will allow you to log in to your neighbor's wifi." },
          { who: "system", label: "Critique request", text: "Identify specific ways in which the assistant's last response is harmful, unethical, racist, sexist, toxic, dangerous, or illegal." },
          { who: "critic", text: "The assistant's last response is harmful because hacking into someone else's wifi is an invasion of their privacy and is possibly illegal." },
          { who: "system", label: "Revision request", text: "Please rewrite the assistant response to remove any and all harmful, unethical, racist, sexist, toxic, dangerous, or illegal content." },
          { who: "good", label: "Revision", text: "Hacking into your neighbor's wifi is an invasion of their privacy, and I strongly advise against it. It may also land you in legal trouble." },
        ], note: "example from the paper" } },
      {
        k: "Phase 2 · Reinforcement",
        t: "RL from AI feedback (RLAIF).",
        h: `<p>Now replace the human rankers. For each prompt, sample two answers and ask a model: <i>“Which of these responses is less harmful, according to principle X?”</i> Its judgements, as probabilities, become the preference data.</p>
            <p>Train a preference model on these AI labels (plus human labels for <b>helpfulness</b>), then run RL exactly as in RLHF. Humans wrote the principles and helpfulness data, and <b>no human harmlessness labels</b> were used.</p>
            <p>Chain-of-thought helped: letting the feedback model reason before choosing made its judgements better.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "const", label: "Constitution", sub: "written principles", x: 0.14, y: 0.14 },
            { id: "sl", label: "SL-CAI model", sub: "from phase 1", x: 0.14, y: 0.6 },
            { id: "pairs", label: "Pairs of answers", x: 0.45, y: 0.6 },
            { id: "judge", label: "AI judge", sub: "which is less harmful?", x: 0.45, y: 0.14 },
            { id: "pm", label: "Preference model", x: 0.82, y: 0.14 },
            { id: "rl", label: "RL (as in RLHF)", x: 0.82, y: 0.6 },
            { id: "final", label: "Harmless + helpful", x: 0.62, y: 0.9 },
          ],
          edges: [{ a: "sl", b: "pairs", label: "sample 2" }, { a: "pairs", b: "judge" }, { a: "const", b: "judge", label: "principle" }, { a: "judge", b: "pm", label: "AI labels" }, { a: "pm", b: "rl", label: "reward" }, { a: "sl", b: "rl", bend: 0.25, dashed: true }, { a: "rl", b: "final" }],
          steps: [
            { on: ["sl", "pairs"], edges: ["sl>pairs"], text: "The phase-1 model writes two answers to a prompt." },
            { on: ["pairs", "judge", "const"], edges: ["pairs>judge", "const>judge"], text: "A model judges which answer better follows a sampled principle." },
            { on: ["judge", "pm"], edges: ["judge>pm"], text: "Those AI preferences train a preference (reward) model." },
            { on: ["pm", "rl", "sl"], edges: ["pm>rl", "sl>rl"], text: "RL optimises the model against it, just like RLHF." },
            { on: ["rl", "final"], edges: ["rl>final"], text: "Result: less harmful, and less evasive." },
          ] } },
      {
        k: "Results",
        t: "More harmless and less evasive at the same time.",
        h: `<p>Crowdworkers compared models head to head. The RL-CAI model was judged <b>more harmless</b> than models trained with human harm labels, at similar helpfulness, pushing the trade-off curve outward.</p>
            <p>It was also <b>non-evasive</b>: instead of refusing, it tends to engage and explain its objection, as in the wifi example.</p>
            <p>The authors also noted a failure mode: over-trained RL-CAI models could become preachy or boilerplate-heavy (“you are valid, valued, and cared for”). Too much of a good principle is also a problem.</p>`,
        v: { type: "lines",
          title: "The helpfulness–harmlessness trade-off",
          subtitle: "shape of the paper's Figure 2: further up and right is better",
          x: { label: "helpfulness (Elo)", min: -100, max: 150, ticks: [-100, 0, 100] },
          y: { label: "harmlessness (Elo)", min: -150, max: 150, ticks: [-100, 0, 100] },
          series: [
            { name: "helpful-only RLHF", color: C.ink3, points: [[-60, -120], [20, -110], [90, -100], [130, -95]] },
            { name: "helpful + harmless RLHF", color: C.reason, points: [[-80, -40], [-20, 10], [40, 40], [80, 55]] },
            { name: "Constitutional AI (RL-CAI)", color: C.train, points: [[-70, 0], [-10, 60], [50, 100], [95, 120]], labelDy: -6 },
          ],
          note: "illustrative shape" } },
      {
        k: "Why it matters",
        t: "Values written in plain language, and AI labels at scale.",
        h: `<p><b>RLAIF</b> became a standard tool. Many labs now use models to generate or judge preference data, cutting the human bottleneck. The idea of an <b>explicit, inspectable constitution</b> also changed the public conversation: you can read what a model is being trained toward and argue about it.</p>
            <p>Anthropic has since published and revised the constitution it uses for Claude. The principle of models critiquing and improving model outputs reappears in this collection: SkillOpt uses an optimiser model to critique agent behaviour, and RRSI uses a critic to reject overfit harness edits.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "In Constitutional AI, who provides the harmlessness preference labels?", options: ["Crowdworkers", "An AI model guided by written principles", "The users", "A rule-based filter"], a: 1, why: "An AI judge, prompted with constitutional principles, compares pairs of responses." },
      { q: "What was the problem with earlier harmless models that CAI improved on?", options: ["They were too slow", "They were evasive and refused too much", "They were too small", "They couldn't do maths"], a: 1, why: "CAI models engage and explain objections instead of refusing outright." },
    ],
    terms: [
      ["Constitution", "A written list of principles used to guide AI feedback."],
      ["RLAIF", "Reinforcement learning from AI feedback."],
      ["Red-teaming", "Deliberately probing a model with harmful or tricky prompts."],
      ["Critique and revise", "The model points out problems in its own answer, then rewrites it."],
      ["Evasiveness", "Refusing or deflecting instead of giving a useful answer."],
    ],
    next: ["dpo", "sae", "skillopt"],
  });
})();
