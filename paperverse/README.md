# Paperverse: the AI papers that matter, taught from zero

An interactive observatory of the research papers behind modern AI. Every paper is a star in a 3D galaxy: distance from the core is the publication date (2017 → 2026) and each spiral arm is one kind of idea. Click a star and you get a slide deck that:

1. explains the problem in plain words, with an analogy,
2. animates the core idea,
3. gives you something to play with (sliders, toggles, live simulations),
4. shows the paper's results drawn to scale,
5. says why it matters and what came next,
6. ends with a short quiz, the new vocabulary, and what to read next.

It assumes **zero** background: start with the “LLMs from zero” primer, then follow the eight-step learning path on the home page.

## Run it

No build step and no dependencies. Open `paperverse/index.html` in a browser (double-clicking works), or serve the folder:

```bash
python3 -m http.server -d paperverse 8000   # → http://localhost:8000
```

Keyboard: `←` `→` move between slides, `Esc` returns to the galaxy. Deep links work, e.g. `index.html#mamba3.3` opens the Mamba-3 deck at slide 3.

To get a single shareable file:

```bash
python3 paperverse/build.py   # → paperverse/dist/paperverse.html (everything inlined)
```

## What's inside

**Start here:** LLMs from zero (tokens, embeddings, the network, sampling, training, SFT/RLHF, and what a harness is)

| Track | Foundations | Frontier (2025–26) |
|---|---|---|
| Architecture | Attention Is All You Need · Mamba · Mixtral | LLaDA (diffusion LM) · Mamba-3 · Attention Residuals · Gated DeltaNet-2 · Next Concept Prediction |
| Training & tuning | GPT-3 · LoRA · Chinchilla · InstructGPT (RLHF) · Constitutional AI · DPO | |
| Reasoning & agents | RAG · Chain-of-Thought · ReAct · Test-time compute · DeepSeek-R1 | SkillOpt · RRSI |
| Efficiency | FlashAttention · Speculative decoding · vLLM / PagedAttention | Nemotron 3 Super |
| Interpretability | Scaling Monosemanticity | Spikes & sinks |

### How papers were picked

A paper made the list if it passed at least one test: it changed what everyone builds (Transformers, RLHF, LoRA, FlashAttention, vLLM), it introduced a pattern others copied within months (CoT, ReAct, GRPO), it is rising fast right now (2026 work people are upvoting and building on), or it explains something surprising about what's happening inside models. Each deck shows impact, novelty and momentum meters. These are editorial judgements, not citation counts.

The 2026 papers were read in full from arXiv. Numbers on result slides come from the papers' own tables. Anything that is a sketch of an idea rather than measured data is labelled “illustrative” on the chart itself.

## New papers every Monday and Thursday

A scheduled Claude routine picks up to two of the most important new AI papers, reads them in full, writes a deck for each, checks every slide in a headless browser, pushes, and republishes the site. New decks show a “New” badge for two weeks. The playbook it follows is [ROUTINE.md](ROUTINE.md) and its decisions are recorded in [ROUTINE_LOG.md](ROUTINE_LOG.md).

Tools it uses, which you can also run yourself:

```bash
python3 paperverse/tools/find_candidates.py                 # recent popular papers without a deck yet
NODE_PATH=$(npm root -g) node paperverse/tools/check.js     # open every slide at desktop and phone width, fail on errors
```

## How it's built

Plain HTML, CSS and JavaScript with classic `<script>` tags, so it also runs from `file://`. Three.js (vendored in `vendor/`) powers the galaxy and the 3D scenes. Everything else is hand-written canvas and SVG.

```
paperverse/
  index.html          the page shell and script list
  css/style.css       design tokens and layout (a deliberate single dark “night sky” theme)
  js/core.js          registries + canvas, controls and SVG helpers
  js/viz/generic.js   reusable visualisations: flow diagrams, typed transcripts, bar and line charts
  js/viz/extra.js     3D scenes: embedding space, loss landscape, transformer stack
  js/papers/*.js      one file per paper: its custom visualisations + its slides
  js/deck.js          the slide-deck viewer
  js/galaxy.js        the 3D observatory
  js/app.js           home page: learning path, filters, search, glossary, deep links
  build.py            bundles everything into one HTML file
```

### Add a paper

Create `js/papers/<id>.js`, add a `<script>` tag for it in `index.html`, and register it:

```js
PV.register({
  id: "myPaper", short: "Short name", title: "Full title",
  year: 2026, date: "2026-10", track: "arch", era: "frontier",   // track: arch | train | reason | speed | inside
  authors: "…", arxiv: "2610.00001", url: "https://arxiv.org/abs/2610.00001",
  oneLiner: "…", why: "…", signals: { impact: 3, novelty: 4, momentum: 5 },
  tags: ["…"], builds: ["attention"],                               // builds = lineage threads in the galaxy
  slides: [
    { k: "The problem", t: "Headline", h: "<p>HTML body</p>", analogy: "…", v: { type: "bars", items: [...] } },
  ],
  quiz: [{ q: "…", options: ["…", "…"], a: 0, why: "…" }],
  terms: [["Term", "Definition"]],
  next: ["mamba3"],
});
```

A slide's `v` can use any registered visualisation: the generic `flow`, `chat`, `bars` and `lines`, the 3D `embed3d`, `landscape3d` and `stack3d`, or a new one defined with `PV.defineViz(name, (root, opts, api) => cleanupFn)`.
