/* Direct Preference Optimization: Your Language Model is Secretly a Reward Model (Rafailov et al., 2023) */
(function () {
  const { h, C, FONT } = PV;

  /* Live DPO on one preference pair: gradient steps on the implicit rewards. */
  PV.defineViz("dpotrain", (root, o, api) => {
    let beta = 0.1, mw = 0, ml = 0, steps = 0, running = !PV.reduceMotion, hist = [];
    const sig = (x) => 1 / (1 + Math.exp(-x));
    const lossOf = () => -Math.log(sig(beta * (mw - ml)));
    const cap = PV.caption(root, "");
    const st = PV.canvasLoop(root, (ctx, W, H, t, dt) => {
      if (running && steps < 400) {
        const g = sig(-beta * (mw - ml)); // the weight DPO puts on this pair: large when the model ranks it wrong
        mw += 1.2 * beta * g * 10;
        ml -= 1.2 * beta * g * 10;
        steps++;
        if (steps % 4 === 0) hist.push(lossOf());
      }
      // wide: bars left, loss chart right. phones: bars on top, loss chart underneath
      const narrow = W < 520;
      const L = 26, top = narrow ? 40 : 70;
      const barsH = narrow ? 230 : H - top - 170;
      const bw = narrow ? Math.min(90, (W - 140) / 2) : Math.min(110, W * 0.16);
      const gapX = narrow ? 40 : 50;
      const bx0 = narrow ? (W - (2 * bw + gapX)) / 2 : L + 40;
      const mid = top + barsH / 2;
      const scale = barsH / 2 / 30;
      const labelY = top + barsH + 18;
      const bars = [[narrow ? "chosen" : "chosen answer", mw, C.good], [narrow ? "rejected" : "rejected answer", ml, C.bad]];
      bars.forEach(([name, v, c], i) => {
        const x = bx0 + i * (bw + gapX);
        ctx.strokeStyle = C.line2; ctx.beginPath(); ctx.moveTo(x - 10, mid); ctx.lineTo(x + bw + 10, mid); ctx.stroke();
        const hgt = PV.clamp(v, -30, 30) * scale;
        PV.box(ctx, x, v >= 0 ? mid - hgt : mid, bw, Math.abs(hgt) + 1, { r: 4, fill: PV.alpha(c, 0.7) });
        PV.text(ctx, name, x + bw / 2, labelY, { size: 12, align: "center", color: C.ink2, weight: 700 });
        PV.text(ctx, (v >= 0 ? "+" : "") + v.toFixed(1), x + bw / 2, v >= 0 ? mid - hgt - 12 : mid - hgt + 14, { size: 11.5, font: FONT.mono, align: "center" });
      });
      PV.text(ctx, "log π(answer) − log π_ref(answer)", narrow ? 14 : L + 40, top - 18, { size: 11, font: FONT.mono, color: C.ink3 });
      PV.text(ctx, "bars start at 0 = the starting model", narrow ? 14 : L + 40, labelY + 20, { size: 10.5, color: C.ink3 });
      // loss curve
      const lx = narrow ? 14 : L + 40 + 2 * (bw + 50) + 10;
      const ly = narrow ? labelY + 42 : top + 10;
      const lw = narrow ? W - 28 : W - lx - 20;
      const lh = narrow ? H - ly - 20 : H - top - 190;
      if (lw > 80 && lh > 60) {
        PV.box(ctx, lx, ly, lw, lh, { r: 8, stroke: C.line });
        PV.text(ctx, "DPO loss over training", lx + 8, ly + 14, { size: 11, font: FONT.mono, color: C.ink3 });
        ctx.strokeStyle = api.color; ctx.lineWidth = 2; ctx.beginPath();
        hist.forEach((v, i) => { const x = lx + 6 + (i / 100) * (lw - 12), y = ly + lh - 8 - (v / 0.7) * (lh - 30); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
      const gap = beta * (mw - ml);
      cap.set(`Step <b>${steps}</b> · implicit reward gap β·Δ = <b>${gap.toFixed(2)}</b> · P(model prefers chosen) = <b style="color:${C.good}">${(sig(gap) * 100).toFixed(0)}%</b> · loss ${lossOf().toFixed(3)}`);
    });
    st.phoneHeight(520);
    const ctl = PV.controls(root);
    ctl.slider("β", { min: 0.02, max: 0.5, step: 0.01, value: beta, fmt: (v) => v.toFixed(2), onInput: (v) => (beta = v) });
    ctl.button("↻ Restart", () => { mw = 0; ml = 0; steps = 0; hist = []; running = true; });
    ctl.note("Small β lets the model drift further from where it started.");
    PV.note(root, "one preference pair, toy");
    return () => st.stop();
  });

  PV.register({
    id: "dpo",
    short: "DPO",
    title: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model",
    year: 2023, date: "2023-05",
    track: "train", era: "foundation",
    authors: "Rafailov, Sharma, Mitchell, Ermon, Manning, Finn (Stanford)",
    venue: "NeurIPS 2023",
    arxiv: "2305.18290", url: "https://arxiv.org/abs/2305.18290",
    oneLiner: "RLHF without the RL: a bit of algebra turns preference learning into a simple classification loss on (chosen, rejected) answer pairs.",
    why: "It became the default way open models learn from preferences, because it's simple, stable and cheap.",
    signals: { impact: 5, novelty: 5, momentum: 3 },
    tags: ["preferences", "alignment", "no reward model", "β", "loss"],
    builds: ["instructgpt"],
    slides: [
      {
        k: "The problem",
        t: "RLHF works, but it's a four-model circus.",
        h: `<p>PPO-based RLHF keeps <b>four models</b> in memory: the policy being trained, a frozen reference copy, the reward model, and a value model. It samples text during training, it's sensitive to hyperparameters, and it's known for unstable runs.</p>
            <p>Many academic labs and smaller companies couldn't get it to work reliably. Is all that machinery really necessary?</p>`,
        v: { type: "bars",
          title: "Models held in memory during training",
          items: [{ label: "RLHF with PPO", value: 4 }, { label: "DPO", value: 2, hi: true }],
          max: 5, fmt: (v) => String(v) } },
      {
        k: "The insight",
        t: "The best policy already defines a reward.",
        h: `<p>The RLHF objective (maximise reward while staying close to the reference) has a known exact solution: the best policy is the reference policy re-weighted by e<sup>reward/β</sup>. The InstructGPT deck's “leash” chart computes exactly this.</p>
            <p>DPO runs that equation <b>backwards</b>: if a policy is optimal, the reward it implies is just β × how much more likely it makes an answer than the reference does. So you don't need a separate reward model. <b>Your language model is secretly a reward model.</b></p>`,
        eq: `implied reward r(x, y) = β · log[ π(y | x) / π_ref(y | x) ]  (+ a term that cancels)`,
      },
      {
        k: "The method",
        t: "Push the chosen answer up, the rejected answer down.",
        h: `<p>Plug the implied reward into the standard model of human preferences (Bradley–Terry), and you get a loss you can train with ordinary supervised learning on pairs <i>(prompt, chosen, rejected)</i>.</p>
            <p>The gradient raises the chosen answer's probability relative to the reference and lowers the rejected one. It focuses on pairs the model currently gets <b>wrong</b>, and stops pushing once it ranks them correctly.</p>
            <p>Watch it train on one pair and try different β values.</p>`,
        eq: `L = −log σ( β·[ log π(y_w)/π_ref(y_w) − log π(y_l)/π_ref(y_l) ] )<small>y_w = chosen (winner), y_l = rejected (loser), σ = sigmoid</small>`,
        v: { type: "dpotrain" },
      },
      {
        k: "Results",
        t: "As good as PPO or better, and far simpler.",
        h: `<p>Across three tasks (controlling sentiment, summarising Reddit posts, and single-turn dialogue on Anthropic's helpful/harmless data), DPO <b>matched or beat PPO-based RLHF</b>.</p>
            <p>On sentiment control it reached a better reward-versus-drift trade-off than PPO. In dialogue it was the only method tested that improved over the dataset's preferred answers, judged by GPT-4. It was also much less sensitive to sampling temperature.</p>
            <p>No sampling during training, no reward model, no value model, and a few lines of code.</p>`,
        v: { type: "flow",
          nodes: [
            { id: "data", label: "Preference pairs", sub: "(prompt, chosen, rejected)", x: 0.18, y: 0.3 },
            { id: "pol", label: "Policy π", sub: "being trained", x: 0.55, y: 0.3 },
            { id: "ref", label: "Reference π_ref", sub: "frozen copy", x: 0.55, y: 0.75 },
            { id: "loss", label: "DPO loss", x: 0.86, y: 0.52 },
          ],
          edges: [{ a: "data", b: "pol" }, { a: "data", b: "ref", bend: -0.15 }, { a: "pol", b: "loss", label: "log-probs" }, { a: "ref", b: "loss", label: "log-probs" }],
          steps: [
            { on: ["data", "pol", "ref"], edges: ["data>pol", "data>ref"], text: "Score both answers under the model being trained and the frozen reference." },
            { on: ["pol", "ref", "loss"], edges: ["pol>loss", "ref>loss"], text: "The loss compares the two log-ratios. It's ordinary backprop, with no RL loop." },
          ] } },
      {
        k: "Why it matters",
        t: "Preference tuning for everyone, and a family of variants.",
        h: `<p>DPO spread quickly into open-model post-training: Zephyr, Tülu and Llama 3's post-training all used it. Variants followed: <b>IPO</b>, <b>KTO</b> (works with thumbs-up/thumbs-down instead of pairs), <b>ORPO</b>, <b>SimPO</b>.</p>
            <p><b>What changed next:</b> for maths and code, where answers can be checked automatically, labs moved to online RL with <b>verifiable rewards</b> (DeepSeek-R1's GRPO), which can discover new behaviour instead of only re-ranking existing answers. Today's pipelines commonly use both.</p>`,
        v: { type: "orbit" },
      },
    ],
    quiz: [
      { q: "What does DPO remove from the RLHF pipeline?", options: ["The preference data", "The separate reward model and the RL loop", "The reference model", "Fine-tuning"], a: 1, why: "It trains directly on preference pairs with a classification-style loss. The reward is implicit in the policy." },
      { q: "What does β control in DPO?", options: ["Learning rate", "How far the model may drift from the reference", "Batch size", "Number of answers"], a: 1, why: "β plays the same role as the KL leash in RLHF." },
    ],
    terms: [
      ["DPO", "Direct preference optimisation: learn from chosen/rejected pairs with a simple loss."],
      ["Reference model", "A frozen copy of the starting model used as an anchor."],
      ["Bradley–Terry model", "A classic formula for the probability that one option beats another."],
      ["Preference pair", "Two answers to one prompt, one marked better than the other."],
    ],
    next: ["r1", "cai", "instructgpt"],
  });
})();
