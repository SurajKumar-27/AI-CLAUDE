/* Language Models are Few-Shot Learners (Brown et al., 2020) */
(function () {
  const { h, C } = PV;

  /* Build a prompt with 0 / 1 / 3 examples and watch the completion change. */
  PV.defineViz("fewshot", (root, o, api) => {
    const wrap = h("div", { class: "dom-viz" });
    root.appendChild(wrap);
    const examples = [["sea otter", "loutre de mer"], ["peppermint", "menthe poivrée"], ["plush giraffe", "girafe en peluche"]];
    const outcomes = {
      0: { text: "cheese => cheese is a food made from milk. It comes in many", ok: false, note: "No examples: the model isn't sure what you want, so it just keeps writing." },
      1: { text: "cheese => fromage", ok: true, note: "One example is often enough for a big model to spot the pattern." },
      3: { text: "cheese => fromage", ok: true, note: "A few examples make the pattern unmistakable. No weights changed: the model learned the task from the prompt alone." },
    };
    let shots = 0;
    const prompt = h("pre", { style: { margin: 0, padding: "12px", borderRadius: "10px", background: C.panel, border: `1px solid ${C.line2}`, fontFamily: PV.FONT.mono, fontSize: "0.86rem", whiteSpace: "pre-wrap", color: C.ink } });
    const out = h("div", { style: { padding: "12px", borderRadius: "10px", fontFamily: PV.FONT.mono, fontSize: "0.9rem" } });
    const note = h("p", { style: { margin: 0, color: C.ink2, fontSize: "0.9rem" } });
    wrap.append(h("h4", null, "The prompt you send"), prompt, h("h4", null, "What GPT-3 writes next"), out, note);
    function draw() {
      const lines = ["Translate English to French:"];
      examples.slice(0, shots).forEach(([e, f]) => lines.push(`${e} => ${f}`));
      lines.push("cheese =>");
      prompt.innerHTML = "";
      lines.forEach((l, i) => {
        const isEx = i > 0 && i <= shots;
        prompt.appendChild(h("div", { style: { color: isEx ? api.color : i === lines.length - 1 ? C.glow : C.ink } }, l));
      });
      const oc = outcomes[shots];
      out.style.background = PV.alpha(oc.ok ? C.good : C.bad, 0.12);
      out.style.border = `1px solid ${oc.ok ? C.good : C.bad}`;
      out.textContent = (oc.ok ? "✓  " : "✗  ") + oc.text;
      note.textContent = oc.note;
    }
    const ctl = PV.controls(root);
    ctl.toggle([[0, "Zero-shot"], [1, "One-shot"], [3, "Few-shot (3)"]], 0, (v) => { shots = v; draw(); });
    draw();
    PV.note(root, "example from the paper's Figure 2.1");
    return () => {};
  });

  PV.register({
    id: "gpt3",
    short: "GPT-3",
    title: "Language Models are Few-Shot Learners",
    year: 2020, date: "2020-05",
    track: "train", era: "foundation",
    authors: "Brown, Mann, Ryder, Subbiah, Kaplan, Dhariwal, Neelakantan, Amodei et al. (OpenAI)",
    venue: "NeurIPS 2020",
    arxiv: "2005.14165", url: "https://arxiv.org/abs/2005.14165",
    oneLiner: "Scale a Transformer to 175 billion parameters and it learns new tasks from a few examples in the prompt, without any retraining.",
    why: "It turned prompting into programming. The step from here to ChatGPT was alignment (InstructGPT), not a new architecture.",
    signals: { impact: 5, novelty: 4, momentum: 3 },
    tags: ["175B", "in-context", "few-shot", "prompting", "scale"],
    builds: ["attention"],
    slides: [
      {
        k: "The problem",
        t: "Every new task used to need its own training run.",
        h: `<p>Before 2020, the recipe was: pre-train a model, then <b>fine-tune</b> a separate copy for each task (sentiment, translation, question answering) on thousands of hand-labelled examples.</p>
            <p>Humans don't work that way. Show a person two examples of a new task and they usually get it. The authors asked whether a model could do the same if it was big enough.</p>`,
        analogy: "Old way: send a new employee on a three-week course for every task. GPT-3 way: hand them a sticky note with two examples and they figure it out.",
        v: { type: "flow",
          nodes: [
            { id: "pt", label: "Pre-trained model", x: 0.18, y: 0.45 },
            { id: "a", label: "Fine-tune copy #1", sub: "sentiment · 10k labels", x: 0.66, y: 0.12 },
            { id: "b", label: "Fine-tune copy #2", sub: "translation · 1M pairs", x: 0.66, y: 0.45 },
            { id: "c", label: "Fine-tune copy #3", sub: "Q&A · 100k labels", x: 0.66, y: 0.78 },
          ],
          edges: [{ a: "pt", b: "a" }, { a: "pt", b: "b" }, { a: "pt", b: "c" }],
          steps: [
            { on: ["pt", "a"], edges: ["pt>a"], text: "A separate labelled dataset and a separate training run for each task…" },
            { on: ["pt", "b"], edges: ["pt>b"], text: "…and a separate copy of the model to store and serve…" },
            { on: ["pt", "c"], edges: ["pt>c"], text: "…every time you want something new." },
          ] } },
      {
        k: "The big idea",
        t: "In-context learning: the examples go in the prompt.",
        h: `<p>GPT-3 is a plain next-token predictor, the same design as GPT-2 but <b>100× bigger</b>. The authors found that if you write a task description and a few examples into the prompt, the model continues the pattern.</p>
            <ul><li><b>Zero-shot:</b> just the instruction.</li><li><b>One-shot:</b> instruction + one example.</li><li><b>Few-shot:</b> instruction + a handful of examples (typically 10 to 100 fit).</li></ul>
            <p>No gradient updates, no fine-tuning. The model “learns” the task while reading. Try the three modes.</p>`,
        v: { type: "fewshot" },
      },
      {
        k: "The surprise",
        t: "This ability appears with scale.",
        h: `<p>The authors trained 8 model sizes, from 125 million to 175 billion parameters. Small models barely benefit from examples in the prompt. The largest benefit a lot.</p>
            <p>This is one of the first clear cases of an <b>emergent ability</b>: something that isn't obviously there at small scale and shows up as models grow. It's also why labs kept scaling.</p>`,
        v: { type: "lines",
          title: "Learning from examples in the prompt",
          subtitle: "Shape of the paper's Figure 1.2 (a word-unscrambling task)",
          x: { label: "number of examples in the prompt", min: 0, max: 100, ticks: [0, 10, 25, 50, 100] },
          y: { label: "accuracy (%)", min: 0, max: 70, ticks: [0, 20, 40, 60] },
          series: [
            { name: "175B", color: C.train, points: [[0, 8], [1, 42], [10, 55], [25, 60], [50, 64], [100, 67]] },
            { name: "13B", color: C.arch, points: [[0, 2], [1, 12], [10, 22], [25, 26], [50, 28], [100, 30]], labelDy: 4 },
            { name: "1.3B", color: C.ink3, points: [[0, 0.5], [1, 3], [10, 6], [25, 8], [50, 9], [100, 10]] },
          ],
          note: "illustrative shape" } },
      {
        k: "The scale",
        t: "175 billion parameters, 10× anything before it.",
        h: `<p>GPT-3 has <b>96 layers</b> and 175B parameters, and was trained on about <b>300 billion tokens</b> of filtered web text, books and Wikipedia.</p>
            <p>That was more than 10× larger than any previous dense (non-sparse) language model. The jump from GPT-2 in 2019 was over 100×.</p>`,
        v: { type: "bars",
          title: "Model size in parameters",
          subtitle: "billions of parameters, drawn to scale",
          items: [
            { label: "GPT-2 (2019)", value: 1.5 },
            { label: "Turing-NLG (Feb 2020)", value: 17 },
            { label: "GPT-3 (May 2020)", value: 175, hi: true },
          ],
          fmt: (v) => v + "B" } },
      {
        k: "Results",
        t: "Strong few-shot results, and fake news humans couldn't spot.",
        h: `<p>On <b>TriviaQA</b> (answering trivia questions with no internet access), accuracy rose from 64.3% zero-shot to 71.2% few-shot, matching or beating fine-tuned systems of the time.</p>
            <p>Most striking: people asked to tell GPT-3-written news articles from real ones were right only about <b>52%</b> of the time, barely better than a coin flip. The paper spends a whole section on misuse risks because of this.</p>
            <p>It also had clear weaknesses: arithmetic beyond a few digits, some reasoning tasks, and producing confident nonsense.</p>`,
        v: { type: "bars",
          title: "TriviaQA accuracy, GPT-3 175B",
          subtitle: "% correct, no retrieval",
          items: [
            { label: "Zero-shot", value: 64.3 },
            { label: "One-shot", value: 68.0 },
            { label: "Few-shot", value: 71.2, hi: true },
          ],
          max: 100, fmt: (v) => v + "%" } },
      {
        k: "Why it matters",
        t: "Prompting became the new programming.",
        h: `<p>GPT-3 changed how people use models. Instead of training, you <b>describe and demonstrate</b>. “Prompt engineering” was born, followed by products built on an API instead of on custom models.</p>
            <p>But GPT-3 was still an autocomplete engine. Ask it a question and it might write five more questions. Turning it into an assistant took two more ideas in this collection: <b>InstructGPT</b> (RLHF) and <b>chain-of-thought</b>. Scaling itself got a correction too, with <b>Chinchilla</b>.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What is in-context learning?", options: ["Fine-tuning on a small dataset", "Learning a task from examples in the prompt, with no weight updates", "Retrieving documents from the web", "Training on labelled data"], a: 1, why: "The weights stay frozen. The examples in the prompt steer what the model predicts next." },
      { q: "What happened to few-shot ability as the model grew?", options: ["It stayed the same", "It got worse", "It grew sharply, strongest at 175B", "It only worked below 1B parameters"], a: 2, why: "The benefit of in-context examples grows with model size, one of the first examples of an emergent ability." },
    ],
    terms: [
      ["In-context learning", "Picking up a task from examples in the prompt, without training."],
      ["Few-shot / zero-shot", "Prompting with a few examples, or with none."],
      ["Fine-tuning", "Further training a pre-trained model on task-specific data."],
      ["Emergent ability", "A capability that shows up only once models pass a certain scale."],
      ["Dense model", "A model where every parameter is used for every token (unlike mixture-of-experts)."],
    ],
    next: ["chinchilla", "instructgpt", "cot"],
  });
})();
