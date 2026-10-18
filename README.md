# Job search with freehire

Ask Claude Code in this repo to find jobs ("find backend + AI roles in Hyderabad",
"what's new this week for Python/LLM?", "salary range for junior backend in Bengaluru").
It searches **[freehire](https://github.com/strelov1/freehire)**, an open-source,
MIT-licensed catalogue of 3.3M+ IT postings crawled straight from company career
pages (Greenhouse, Lever, Workday, Ashby and 200+ more sources). It then matches the
results against your profile and resumes and gives you a shortlist with direct links
to each employer's posting.

- **Search engine:** freehire's hosted MCP server (`.mcp.json`) and its keyless REST
  API ([docs](https://freehire.me/docs/api)). Nothing to install or self-host.
- **Your profile:** `data.enc` holds your profile and resumes, encrypted. Set
  `JOBBOT_STATE_KEY` as an environment variable in the cloud environment settings so
  new sessions can unlock it.
- **How it searches and ranks:** [`.claude/skills/find-jobs/SKILL.md`](.claude/skills/find-jobs/SKILL.md).

Applying happens on the employer's site (or with freehire.me's own tools under your account).
