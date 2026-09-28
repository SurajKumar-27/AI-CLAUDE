# Twice-weekly paper routine

A scheduled Claude session runs this playbook every Monday and Thursday. Each run adds **up to two** new decks for the most important AI papers of the past few weeks, checks them in a browser, pushes them, and republishes the site. Quality beats quantity: adding zero decks is a valid outcome when nothing new clears the bar.

Branch: `claude/compassionate-volta-tig9in`. If `paperverse/` has since been merged into the default branch, work from the default branch on a new branch and open a pull request instead.
Published site: https://claude.ai/artifact/85wxshvxwLpkjcCaGuH58V

## 1. Set up

```bash
git fetch origin claude/compassionate-volta-tig9in && git checkout claude/compassionate-volta-tig9in && git pull
pip install -q pypdf beautifulsoup4 cffi   # for reading papers
```

Read `ROUTINE_LOG.md` to see what earlier runs added or turned down.

## 2. Find candidates

```bash
python3 paperverse/tools/find_candidates.py --days 21 --top 25
```

This lists recent papers from Hugging Face's trending and daily pages, ranked by upvotes, and skips arXiv ids that already have a deck. Upvotes are only a starting signal. Also run one or two web searches (for example “most discussed AI papers this week”, “new LLM architecture paper”) to catch papers that are big elsewhere but not on Hugging Face.

Pick at most two. A paper qualifies when it passes at least one of these tests:

- **A new pattern** others are likely to copy: an architecture, training method, reasoning or agent technique, efficiency trick, or interpretability finding.
- **Momentum**: heavy discussion, strong upvotes, a major lab, or open weights that people will build on.
- **Substance**: a clear method and real results, rather than a thin benchmark, dataset or leaderboard entry. Plain model release reports qualify only when they introduce something new, as Nemotron 3 Super's LatentMoE did.

Prefer the LLM core (architecture, training, reasoning, agents and harnesses, efficiency, interpretability) over domain applications. Skip a paper that repeats a covered idea unless it's a clear successor, and then link the two decks.

## 3. Read each chosen paper in full

Fetch `https://arxiv.org/html/<id>`, or `https://arxiv.org/pdf/<id>` and extract the text with pypdf when there is no HTML version. Read the introduction, method and main results. Write down the exact numbers you plan to quote and the table each came from. **Every number on a slide must come from the paper.** Anything drawn only to show the shape of an idea must carry an “illustrative” note.

## 4. Write the deck

Create `paperverse/js/papers/<id>.js` (short lowercase id, e.g. `dreamrsi`). Copy the structure of a 2026 deck such as `rrsi.js`, `ncp.js` or `mamba3.js`.

- Fields: `id, short, title, year, date ("YYYY-MM"), track (arch | train | reason | speed | inside), era: "frontier", authors, arxiv, url, oneLiner, why, signals {impact, novelty, momentum} (1–5, editorial), tags, builds (ids of existing decks it descends from), slides, quiz (2–3), terms (4–6), next (2–3 existing ids)`, plus **`added: "YYYY-MM-DD"`** (today), which shows the “New” badge.
- 5–7 slides, in this order:
  1. the problem, with a one-sentence everyday `analogy`,
  2. the big idea, with an interactive visualisation,
  3. how it works (a `flow` diagram with steps, or an equation plus a picture),
  4. results as `bars` or `lines` charts built from the paper's tables,
  5. why it matters, what it connects to in the collection, and honest limitations.
- At least one custom visualisation made with `PV.defineViz("<id>-<name>", …)` that the reader can play with (toggle, slider, step button). Prefix names with the deck id so they never collide. Use the helpers in `js/core.js` (`PV.canvasLoop`, `PV.controls`, `PV.caption`, `PV.note`, `PV.fit`, `PV.box`, `PV.text`), and return a cleanup function.
- Write for someone with zero background. Use short, plain sentences, define every term the first time it appears, and add each new term to `terms`.
- Charts start at zero, keep one unit per chart, and quote values exactly.

Then:
- add `<script src="js/papers/<id>.js"></script>` to `paperverse/index.html`, after the last paper and before `js/deck.js`,
- add the paper to the table in `paperverse/README.md`.

## 5. Verify

```bash
NODE_PATH=$(npm root -g) node paperverse/tools/check.js           # every deck, desktop + phone: must print NO ERRORS
NODE_PATH=$(npm root -g) node paperverse/tools/check.js <id>      # screenshots of the new deck in paperverse/dist/shots/
```

Errors in your new deck must be fixed. If the check reports an error on a deck you didn't touch, re-run it once; if it repeats, fix it when the cause is clear, otherwise record the exact message (the check names the deck and slide) in the log and your report.

Look at the new deck's screenshots at both widths. Fix overlapping text, clipped labels, empty charts and anything hidden behind the controls, then run the check again.

## 6. Ship

1. Append an entry to `paperverse/ROUTINE_LOG.md`: the date, the papers added with a one-line reason each, and the strongest candidates you turned down and why.
2. Commit with a message like `Paperverse: add decks for <Paper A> and <Paper B>`, then `git push -u origin <branch>`.
3. Run `python3 paperverse/build.py`, then republish `paperverse/dist/artifact.html` to the existing artifact URL above. Read it with the Artifact tool first, then publish with `url` set, so the link stays the same.
4. Finish with a short report: what was added and why, the candidates you skipped, and the site link.

If a step fails (network, push, publish), say exactly which step and why, and still commit whatever passed verification.
