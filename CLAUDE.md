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
