# Hourly refresh of Suraj's Job Radar

Dashboard: https://claude.ai/artifact/MLwUrpFnpiq6hNDYJVogr9 (page source: `dashboard/job-radar.html`,
data file published beside it as `jobs.json`).

A scheduled Claude Code routine runs this every hour in a fresh cloud session:

1. Read the dashboard with the Artifact tool (`action: "read"`, the URL above) and then
   its data file (`action: "read"`, `path: "jobs.json"`). Note where each was saved.
2. `python3 -I scripts/fetch_jobs.py --prev <saved jobs.json> --out <scratchpad>/jobs.json`
   (standard library only; queries freehire's public API, merges, keeps each job's first-seen time,
   drops jobs older than 21 days). If it fails, stop: never publish an empty or partial list.
3. Republish to the same URL: `file_path` = the saved page file from step 1, `files` =
   `{"jobs.json": "<scratchpad>/jobs.json"}`, `url` = the URL above. Omit `capabilities`
   and `icon` so the page keeps them. Don't change the page itself.

Search criteria live at the top of `scripts/fetch_jobs.py` (cities, roles, max years, skills).
