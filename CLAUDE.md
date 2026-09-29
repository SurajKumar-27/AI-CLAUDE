# jobbot

Applies to jobs for Suraj Kumar Marepally. **When he sends a job link, follow
`.claude/skills/apply-job/SKILL.md`**: tailor his resume to that job, fill the
application form and submit it.

## Layout

- `jobbot/links.py`: follows shorteners, redirects and aggregator "Apply here" links to the real job
- `jobbot/jobpage.py`: job description from the page (JSON-LD JobPosting first)
- `jobbot/tailor.py`: applies an edit plan to a base resume, reverting untruthful edits
- `jobbot/render.py` + `templates/resume.html.j2`: one-page A4 PDF
- `jobbot/apply/`: finds the form, lists its questions, fills and submits it
- `data/` (git-ignored): `profile.yaml`, `resumes/fullstack.yaml`, `resumes/ai.yaml`,
  `applications.jsonl`. It is committed only encrypted as `data.enc` (`scripts/data.sh`,
  key in the `JOBBOT_STATE_KEY` environment variable). Never commit anything from `data/`
  or `work/`: the repo is public.

## Dev

- The session hook (`.claude/hooks/session-start.sh`) creates `.venv`, installs
  `requirements-dev.txt` and decrypts `data.enc`.
- Tests: `pytest` (local fake job site; no network needed). Lint: `pyflakes jobbot tests`.
- Chromium: the preinstalled one under `/opt/pw-browsers` is used automatically; don't run `playwright install`.
