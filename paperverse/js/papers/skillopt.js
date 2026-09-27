/* SkillOpt: Executive Strategy for Self-Evolving Agent Skills (Yang et al., 2026) */
(function () {
  const { h, C, FONT, svg } = PV;

  /* A skill document being trained: bounded edits, a validation gate, a rejected-edit buffer. */
  PV.defineViz("skilldoc", (root, o, api) => {
    const steps = [
      { budget: 3, edits: [["+", "Before editing, list every sheet and its header row."], ["+", "Write results into the workbook with openpyxl; never overwrite formulas unless asked."], ["+", "Touch only the target cell range; don't add extra columns."]], score: 55.2, accept: true },
      { budget: 3, edits: [["~", "Restate the target cells and the expected data type before editing.", "Read the task and edit the workbook."], ["+", "Deliver the answer by saving the file, not by describing it in chat."]], score: 63.0, accept: true },
      { budget: 2, edits: [["+", "For the task about Q3 revenue, put 1,204 in cell B7."]], score: 61.4, accept: false, why: "instance-specific, worse on held-out tasks" },
      { budget: 2, edits: [["+", "Preserve number formats, dates and merged cells when copying."]], score: 71.5, accept: true },
      { budget: 1, edits: [["~", "Verify: re-open the saved file and check every target cell.", "Touch only the target cell range; don't add extra columns."]], score: 77.9, accept: true },
      { budget: 1, edits: [["slow", "Epoch summary: missing verification and format loss were the most common failures."]], score: 80.7, accept: true },
    ];
    let doc = ["# Spreadsheet skill", "Read the task and edit the workbook."];
    let hist = [41.8], rejected = [], si = 0, timer = 0;
    const wrap = h("div", { class: "dom-viz", style: { gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gridAutoFlow: "row" } });
    const docEl = h("div", { style: { fontFamily: FONT.mono, fontSize: "0.8rem", background: C.panel, border: `1px solid ${C.line2}`, borderRadius: "10px", padding: "10px 12px", display: "grid", gap: "4px", alignContent: "start", minHeight: "180px" } });
    const chart = svg("svg", { viewBox: "0 0 300 160", style: "width:100%;height:auto" });
    const status = h("div", { style: { fontSize: "0.85rem", color: C.ink2 } });
    const rej = h("div", { style: { fontFamily: FONT.mono, fontSize: "0.72rem", color: C.bad, display: "grid", gap: "3px" } });
    wrap.append(
      h("div", { style: { display: "grid", gap: "8px", alignContent: "start" } }, h("h4", null, "best_skill.md (the only thing that changes)"), docEl),
      h("div", { style: { display: "grid", gap: "8px", alignContent: "start" } }, h("h4", null, "held-out validation score"), chart, status, h("h4", null, "rejected-edit buffer"), rej));
    root.appendChild(wrap);
    function drawChart() {
      chart.innerHTML = "";
      const X = (i) => 20 + i * (270 / 6), Y = (v) => 150 - ((v - 30) / 60) * 140;
      [40, 60, 80].forEach((v) => {
        chart.appendChild(svg("line", { x1: 20, x2: 290, y1: Y(v), y2: Y(v), stroke: C.line, "stroke-width": 1 }));
        chart.appendChild(svg("text", { x: 2, y: Y(v) + 3, fill: C.ink3, "font-size": 9, "font-family": FONT.mono }, String(v)));
      });
      chart.appendChild(svg("polyline", { points: hist.map((v, i) => `${X(i)},${Y(v)}`).join(" "), fill: "none", stroke: api.color, "stroke-width": 2.5 }));
      hist.forEach((v, i) => chart.appendChild(svg("circle", { cx: X(i), cy: Y(v), r: 3.5, fill: i === hist.length - 1 ? C.glow : api.color })));
    }
    function drawDoc(pending) {
      docEl.innerHTML = "";
      doc.forEach((line) => {
        const removed = pending && pending.edits.some((e) => e[0] === "~" && e[2] === line);
        docEl.appendChild(h("div", { style: { color: removed ? C.bad : C.ink, textDecoration: removed ? "line-through" : "none" } }, line.startsWith("#") ? line : "- " + line));
      });
      if (pending) pending.edits.forEach((e) => {
        const c = e[0] === "slow" ? C.inside : pending.accept === false ? C.bad : C.good;
        docEl.appendChild(h("div", { style: { color: c, background: PV.alpha(c, 0.12), borderRadius: "4px", padding: "0 4px" } }, (e[0] === "slow" ? "↻ slow update: " : "+ ") + e[1]));
      });
    }
    function tick() {
      if (si >= steps.length) { // restart
        doc = ["# Spreadsheet skill", "Read the task and edit the workbook."]; hist = [41.8]; rejected = []; si = 0;
        rej.innerHTML = ""; drawChart(); drawDoc(null);
        status.innerHTML = "Starting skill · score <b>41.8</b> (no-skill baseline)";
        return;
      }
      const s = steps[si];
      if (!s.shown) {
        s.shown = true;
        drawDoc(s);
        status.innerHTML = `Step ${si + 1}: optimiser proposes <b>${s.edits.length}</b> edit(s) · learning-rate budget allows <b>${s.budget}</b> · testing on held-out tasks…`;
        return;
      }
      s.shown = false;
      if (s.accept) {
        s.edits.forEach((e) => {
          if (e[0] === "~") doc[doc.indexOf(e[2])] = e[1];
          else if (e[0] === "+") doc.push(e[1]);
        });
        hist.push(s.score);
        status.innerHTML = `<span style="color:${C.good}">✓ accepted</span>: validation ${hist[hist.length - 2].toFixed(1)} → <b>${s.score.toFixed(1)}</b>`;
      } else {
        rejected.push(s.edits[0][1]);
        rej.appendChild(h("div", null, "✗ " + s.edits[0][1] + ` (${s.why})`));
        status.innerHTML = `<span style="color:${C.bad}">✗ rejected</span>: validation would drop to ${s.score.toFixed(1)}. Kept as negative feedback.`;
      }
      si++;
      drawDoc(null);
      drawChart();
    }
    drawChart(); drawDoc(null);
    status.innerHTML = "Starting skill · score <b>41.8</b> (no-skill baseline)";
    const iv = setInterval(() => { timer++; tick(); }, PV.reduceMotion ? 3500 : 2200);
    const ctl = PV.controls(root);
    ctl.button("Next step ▶", tick);
    PV.note(root, "start/end scores from the paper, steps illustrative");
    return () => clearInterval(iv);
  });

  PV.register({
    id: "skillopt",
    short: "SkillOpt",
    title: "SkillOpt: Executive Strategy for Self-Evolving Agent Skills",
    year: 2026, date: "2026-05",
    track: "reason", era: "frontier",
    authors: "Yifan Yang, Ziyang Gong, Weiquan Huang, Qihao Yang, Ziwei Zhou et al. (Microsoft, Shanghai Jiao Tong, Tongji, Fudan)",
    arxiv: "2605.23904", url: "https://arxiv.org/abs/2605.23904",
    oneLiner: "Treat an agent's skill file like trainable weights: an optimiser model proposes small edits, and only edits that improve a held-out score survive. That lifted GPT-5.5 by about 20 points inside real harnesses.",
    why: "It sits near the top of Hugging Face's trending papers. It turns “prompt tweaking” into a disciplined training loop that works on closed models you can't fine-tune.",
    signals: { impact: 4, novelty: 5, momentum: 5 },
    tags: ["agent skills", "harness", "text optimisation", "validation gate", "Claude Code", "Codex"],
    builds: ["react", "cai", "lora"],
    slides: [
      {
        k: "Background",
        t: "Skills: plain-text know-how for agents.",
        h: `<p>Modern agent harnesses (Claude Code, Codex and others) can load <b>skills</b>: short documents that package procedures, domain tips, tool policies, output formats and known failure modes. The agent reads the skill before working.</p>
            <p>Skills are how you adapt a <b>frozen</b> model to a domain without touching its weights, which is often the only option for closed frontier models.</p>
            <p>The problem: skills are hand-written, generated once, or “self-revised” in loose loops. None of those behaves like a real <b>optimiser</b>, and they often fail to improve on where they started.</p>`,
        analogy: "A new hire's onboarding doc. Usually someone writes it once and it goes stale. SkillOpt is a manager who watches the new hire work, proposes small doc changes, and keeps only the ones that measurably help on a separate test.",
      },
      {
        k: "The big idea",
        t: "Train the skill document like model weights.",
        h: `<p>SkillOpt borrows the discipline of deep learning and applies it to text:</p>
            <ul><li><b>Forward pass:</b> the frozen agent runs a batch of tasks with the current skill.</li>
            <li><b>Backward pass:</b> a separate optimiser model reflects on <b>mini-batches</b> of failures and successes and proposes structured <b>add / delete / replace</b> edits.</li>
            <li><b>Learning rate:</b> an <b>edit budget</b> caps how many edits apply per step, shrinking on a cosine schedule.</li>
            <li><b>Validation:</b> a candidate skill is accepted only if it <b>strictly improves</b> a held-out score.</li>
            <li><b>Momentum:</b> rejected edits become negative feedback, and an epoch-level “slow update” keeps long-term lessons.</li></ul>`,
        v: { type: "flow",
          nodes: [
            { id: "skill", label: "Skill v_t", sub: "300–2,000 tokens", x: 0.12, y: 0.16 },
            { id: "agent", label: "Frozen agent + harness", sub: "rollout batch", x: 0.46, y: 0.16, maxW: 0.36 },
            { id: "reflect", label: "Optimiser model", sub: "reflect on minibatches", x: 0.84, y: 0.36 },
            { id: "edits", label: "Bounded edits", sub: "top-L_t by utility", x: 0.66, y: 0.74 },
            { id: "gate", label: "Validation gate", sub: "held-out tasks", x: 0.3, y: 0.74 },
            { id: "buf", label: "Rejected-edit buffer", x: 0.3, y: 0.96 },
          ],
          edges: [{ a: "skill", b: "agent" }, { a: "agent", b: "reflect", label: "trajectories + scores" }, { a: "reflect", b: "edits" }, { a: "edits", b: "gate" }, { a: "gate", b: "skill", label: "accept" }, { a: "gate", b: "buf", label: "reject", dashed: true }, { a: "buf", b: "reflect", bend: 0.3, dashed: true }],
          steps: [
            { on: ["skill", "agent"], edges: ["skill>agent"], text: "Run the frozen agent on a batch of training tasks with the current skill." },
            { on: ["agent", "reflect"], edges: ["agent>reflect"], text: "The optimiser studies failures and successes in groups to find recurring procedural errors." },
            { on: ["reflect", "edits"], edges: ["reflect>edits"], text: "It proposes add/delete/replace edits; only the top few (the budget) are applied." },
            { on: ["edits", "gate"], edges: ["edits>gate"], text: "The candidate skill is scored on held-out selection tasks." },
            { on: ["gate", "skill"], edges: ["gate>skill"], text: "Improved? Accept: it becomes the new skill." },
            { on: ["gate", "buf", "reflect"], edges: ["gate>buf", "buf>reflect"], text: "Not improved? Reject, and remember it as negative feedback." },
          ] } },
      {
        k: "Watch it train",
        t: "A skill document, step by step.",
        h: `<p>On the right, a spreadsheet skill is trained. Notice three things:</p>
            <ul><li>Edits are <b>small and procedural</b> (“verify by re-opening the file”), not answers to specific tasks.</li>
            <li>An edit that <b>memorises a specific task</b> gets <b>rejected</b> by the held-out gate. That's overfitting, caught.</li>
            <li>The budget shrinks over time, from exploring to consolidating.</li></ul>
            <p>The final artefact is a compact <code>best_skill.md</code> that can be read, audited and copied to another model or harness.</p>`,
        v: { type: "skilldoc" },
      },
      {
        k: "Results",
        t: "Best on all 52 settings tested.",
        h: `<p>6 benchmarks × 7 target models × 3 harnesses (direct chat, Codex, Claude Code). SkillOpt was best or tied-best in <b>all 52</b> (model, benchmark, harness) combinations, beating human-written skills, one-shot LLM skills, TextGrad, GEPA, Trace2Skill and EvoSkill.</p>
            <p>With GPT-5.5 the average gain over no skill was <b>+23.5</b> points in direct chat, <b>+24.8</b> inside Codex and <b>+19.1</b> inside Claude Code. Skills also <b>transferred</b>: a spreadsheet skill trained in Codex gave <b>+59.7</b> points when moved to Claude Code.</p>`,
        v: { type: "bars",
          title: "GPT-5.5, direct chat: no skill vs SkillOpt skill",
          subtitle: "score % · from the paper",
          series: [
            { name: "no skill", color: C.line2, values: [41.8, 33.1, 37.6, 83.6, 77.7] },
            { name: "SkillOpt", color: C.reason, values: [80.7, 72.1, 66.9, 95.5, 87.3] },
          ],
          categories: ["SpreadsheetBench", "OfficeQA", "LiveMathematician", "ALFWorld", "SearchQA"],
          max: 100, fmt: (v) => v.toFixed(1) } },
      {
        k: "Why it matters",
        t: "Training without touching weights.",
        h: `<p>SkillOpt reframes adaptation: the <b>skill file is the parameter</b>, the frontier model is frozen, and the procedure borrows batch size, learning rate, validation and momentum from deep learning. It adds <b>zero extra model calls at deployment</b>, because it's just text in the context.</p>
            <p>It's part of a 2026 wave of <b>self-improving agents</b>. RRSI (next deck) evolves the whole harness and asks the key follow-up question: how do you stop that loop from overfitting?</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "In SkillOpt, what plays the role of the learning rate?", options: ["The model's temperature", "A cap on how many edits can be applied per step", "The number of GPUs", "Token budget"], a: 1, why: "The edit budget bounds how far one skill version can move from the last, on a decaying schedule." },
      { q: "Why was an edit that hard-codes one task's answer rejected?", options: ["It was too long", "It didn't improve the held-out validation score", "It used the wrong format", "The budget was zero"], a: 1, why: "The validation gate on held-out tasks filters out instance-specific edits that don't generalise." },
    ],
    terms: [
      ["Skill", "A portable text document of procedures and tips that an agent loads into its context."],
      ["Text-space optimiser", "An LLM that improves text artefacts (prompts, skills) from feedback, like gradient descent does for weights."],
      ["Validation gate", "Accept a change only if it improves a held-out score."],
      ["Edit budget", "The maximum number of edits applied per step: SkillOpt's learning rate."],
      ["Overfitting", "Improving on the training tasks in ways that don't carry over to new tasks."],
    ],
    next: ["rrsi", "react", "r1"],
  });
})();
