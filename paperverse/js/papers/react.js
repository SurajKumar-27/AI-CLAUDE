/* ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022) */
(function () {
  const { C } = PV;

  PV.register({
    id: "react",
    short: "ReAct",
    title: "ReAct: Synergizing Reasoning and Acting in Language Models",
    year: 2022, date: "2022-10",
    track: "reason", era: "foundation",
    authors: "Yao, Zhao, Yu, Du, Shafran, Narasimhan, Cao (Princeton, Google Brain)",
    venue: "ICLR 2023",
    arxiv: "2210.03629", url: "https://arxiv.org/abs/2210.03629",
    oneLiner: "Let the model alternate between thinking and doing: Thought → Action → Observation, in a loop. This is the blueprint of every AI agent.",
    why: "Claude Code, Codex, browser agents and LangChain agents all run a ReAct-style loop inside their harness.",
    signals: { impact: 5, novelty: 5, momentum: 5 },
    tags: ["agents", "tools", "thought", "action", "observation", "loop"],
    builds: ["cot", "rag"],
    slides: [
      {
        k: "The problem",
        t: "Thinking without acting hallucinates. Acting without thinking flails.",
        h: `<p><b>Chain-of-thought</b> reasons well, but only from what's in its head. When a fact is missing it invents one and reasons confidently from there.</p>
            <p><b>Action-only agents</b> can call search or click buttons, but don't plan. They repeat actions, lose track of the goal, and can't recover from a surprise.</p>
            <p>Humans interleave the two: think about what to look up, look it up, update the plan based on what you found.</p>`,
        analogy: "Cooking from a recipe: “I need eggs” (thought), open the fridge (action), “no eggs, only butter” (observation), “switch to the butter version” (thought).",
      },
      {
        k: "The big idea",
        t: "Interleave reasoning traces with actions.",
        h: `<p>ReAct prompts the model with a few example trajectories in the format <b>Thought → Action → Observation</b>. The harness runs each action (here, a Wikipedia API with <code>Search[]</code>, <code>Lookup[]</code> and <code>Finish[]</code>) and pastes the result back as an observation.</p>
            <p>Watch the real example from the paper: the first search fails, the model <b>notices and adapts</b>, and finds the answer.</p>`,
        v: { type: "chat", speed: 120, lines: [
          { who: "user", label: "Question", text: "Aside from the Apple Remote, what other device can control the program Apple Remote was originally designed to interact with?" },
          { who: "thought", text: "I need to search Apple Remote and find the program it was originally designed to interact with." },
          { who: "action", text: "Search[Apple Remote]" },
          { who: "obs", text: "The Apple Remote is a remote control … originally designed to control the Front Row media center program …" },
          { who: "thought", text: "Apple Remote was originally designed to control the Front Row media center program. I need to search Front Row next and find what other device can control it." },
          { who: "action", text: "Search[Front Row]" },
          { who: "obs", text: "Could not find [Front Row]. Similar: ['Front Row Seat to Earth', 'Front Row Motorsports', 'Front Row (software)', …]" },
          { who: "thought", text: "Front Row is not found. I need to search <mark>Front Row (software)</mark>." },
          { who: "action", text: "Search[Front Row (software)]" },
          { who: "obs", text: "Front Row is a discontinued media center software …" },
          { who: "thought", text: "Front Row (software) is controlled by an Apple Remote or the keyboard function keys. So the answer is keyboard function keys." },
          { who: "action", text: "Finish[keyboard function keys]" },
        ], note: "trace from the paper's Figure 1" } },
      {
        k: "How it works",
        t: "The agent loop.",
        h: `<p>The model never touches the world directly. It writes text, and the <b>harness</b> parses actions out of that text, executes them and appends the observation. Then the model is called again with the growing transcript.</p>
            <p>The thoughts do real work: they <b>decompose</b> the goal, <b>track progress</b>, pull out key facts from long observations, and <b>handle exceptions</b> (“not found, try another name”).</p>
            <p>In the paper this was all few-shot prompting with PaLM-540B: just 1 to 6 example trajectories.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "task", label: "Task", x: 0.12, y: 0.12 },
            { id: "th", label: "Thought", sub: "plan the next step", x: 0.5, y: 0.14 },
            { id: "act", label: "Action", sub: "Search[…] / click / run", x: 0.84, y: 0.5 },
            { id: "env", label: "Environment", sub: "Wikipedia, website, game", x: 0.5, y: 0.86 },
            { id: "obs", label: "Observation", sub: "result pasted back", x: 0.16, y: 0.5 },
            { id: "done", label: "Finish[answer]", x: 0.84, y: 0.12 },
          ],
          edges: [{ a: "task", b: "th" }, { a: "th", b: "act" }, { a: "act", b: "env" }, { a: "env", b: "obs" }, { a: "obs", b: "th" }, { a: "th", b: "done", dashed: true }],
          steps: [
            { on: ["task", "th"], edges: ["task>th"], text: "The model reasons about what it needs." },
            { on: ["th", "act"], edges: ["th>act"], text: "It writes an action in a fixed format the harness can parse." },
            { on: ["act", "env"], edges: ["act>env"], text: "The harness executes it in the real environment." },
            { on: ["env", "obs"], edges: ["env>obs"], text: "The result comes back as an observation…" },
            { on: ["obs", "th"], edges: ["obs>th"], text: "…and the model thinks again with the new information." },
            { on: ["th", "done"], edges: ["th>done"], text: "When it's confident, it emits Finish[answer]." },
          ] } },
      {
        k: "Results",
        t: "Big gains on interactive tasks, with 1–2 examples.",
        h: `<p><b>ALFWorld</b> is a text adventure (“put a clean mug in the coffee machine”) and <b>WebShop</b> is an online store. ReAct beat imitation-learning and RL agents trained on 10³ to 10⁵ task examples by <b>34 and 10 percentage points</b> of success rate.</p>
            <p>On knowledge tasks (HotpotQA, FEVER), ReAct hallucinated much less than chain-of-thought. Combining the two (use CoT, fall back to ReAct when unsure, or the reverse) worked best.</p>`,
        v: { type: "bars",
          title: "ALFWorld success rate",
          subtitle: "% of household tasks completed · best of several runs · paper's Table 3",
          items: [
            { label: "BUTLER (imitation, 10⁵ demos)", value: 37 },
            { label: "Act-only prompting", value: 45 },
            { label: "ReAct", value: 71, hi: true },
          ],
          max: 100, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "Every agent harness descends from this loop.",
        h: `<p>Function calling in model APIs, LangChain's agents, Claude Code, Codex, computer-use and browser agents all run the same pattern: reason, call a tool, read the result, repeat.</p>
            <p>What changed since 2022: models are now <b>trained</b> for this loop with RL (instead of only prompted), actions are structured tool calls instead of parsed text, and harnesses add memory, context compaction and sub-agents.</p>
            <p>The 2026 frontier is <b>improving the harness automatically</b>. See SkillOpt and RRSI.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What are the three parts of each ReAct step?", options: ["Plan, Code, Test", "Thought, Action, Observation", "Query, Key, Value", "Encode, Retrieve, Generate"], a: 1, why: "The model thinks, acts, and then reads the environment's response." },
      { q: "Who executes the actions the model writes?", options: ["The model itself", "The harness around the model", "A human", "The tokenizer"], a: 1, why: "The model only produces text. The harness parses and runs the actions, then returns observations." },
    ],
    terms: [
      ["Agent", "A model that takes actions in an environment over multiple steps."],
      ["Tool call", "A structured request from the model to run an external function."],
      ["Observation", "The result of an action, fed back into the model's context."],
      ["Trajectory", "The full sequence of thoughts, actions and observations for one task."],
    ],
    next: ["ttc", "skillopt", "rrsi"],
  });
})();
