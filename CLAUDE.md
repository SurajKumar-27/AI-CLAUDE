# Job search for Suraj Kumar Marepally

This repo finds jobs for Suraj using **freehire** (https://github.com/strelov1/freehire,
hosted at https://freehire.me): 3.3M+ IT postings crawled straight from company career
pages. **When he asks for jobs, follow `.claude/skills/find-jobs/SKILL.md`.**

- `.mcp.json`: freehire's hosted MCP server (`https://freehire.me/api/v1/mcp`, no key).
  The REST API at `https://freehire.me/api/v1` is the fallback.
- `data.enc`: his profile, resumes and job log, AES-256 encrypted because the repo is
  public. `scripts/data.sh decrypt|encrypt` with `JOBBOT_STATE_KEY` from the
  environment. Never commit `data/`.
- `.claude/hooks/session-start.sh` decrypts `data.enc` at session start when the key is set.

## Job Radar dashboard

- Live page: https://claude.ai/artifact/MLwUrpFnpiq6hNDYJVogr9. Source: `dashboard/job-radar.html`; data is the
  `jobs.json` file published beside it. Saved/applied/hidden marks live in the artifact's db, under each
  viewer's private `data/users/<id>/marks`.
- Refreshed hourly by the Claude Code routine "Job Radar hourly refresh" (trigger `trig_018owwjHNHrDRH1wCK9g3ewD`),
  following `dashboard/REFRESH.md`. It downloads `scripts/fetch_jobs.py` from this branch on GitHub, so
  changes to the fetcher take effect once pushed.
- To change the page, edit `dashboard/job-radar.html` and republish it to the same URL with the current
  `jobs.json` (read it from the artifact first). Omit `capabilities` so the db and user grants stay.
