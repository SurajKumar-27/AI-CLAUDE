---
name: find-jobs
description: Find jobs for Suraj with freehire (https://github.com/strelov1/freehire), a catalogue of 3.3M+ postings crawled straight from company career pages. Use whenever he asks to find, search, recommend, shortlist or check jobs, asks what's open for a role/skill/city, or asks about salaries or the job market.
---

# Find jobs with freehire

freehire is used through its hosted service, not a local install:
- **MCP tools** (`.mcp.json`, server `freehire`, no key needed). Names start with
  `mcp__freehire__` (load them with ToolSearch if they aren't listed):
  `search_jobs`, `get_job`, `check_jobs_open`, `similar_jobs`, `salary_stats`,
  `job_market_stats`, `search_companies`, `get_company`.
- **REST API**, keyless: `https://freehire.me/api/v1`. Use it with `curl` when the
  MCP tools aren't loaded or you need a filter MCP lacks (notably
  `experience_years_max`). Reference: https://freehire.me/docs/api, spec:
  https://freehire.me/openapi.yaml.

## 1. Know who you're searching for

Read `data/profile.yaml` and `data/resumes/*.yaml`. If they're missing, run
`scripts/data.sh decrypt`; that needs `JOBBOT_STATE_KEY`. If it's unset, tell him to
add it as an environment variable in the cloud environment's settings (never ask for
the key in chat).

Defaults, unless he says otherwise:
- **Experience:** about 1.5 years (professional since May 2024). Target junior, mid or
  unlabelled seniority, with `experience_years_max=3`. Leave out senior, lead, staff,
  principal and manager roles.
- **Where:** India (`countries=in`); Hyderabad first, then Bengaluru, Pune, Chennai
  and remote. Add `profile.yaml` `facts.preferred_locations` once that's filled in.
- **Roles:** `backend`, `fullstack`, `software_engineering`, `ai_engineering`, `ml_ai`.
- **Skills he has:** Python, FastAPI, Node.js, TypeScript, JavaScript, React, Java
  (Spring Boot), SQL, PostgreSQL, MySQL, Redis, AWS, Docker, Kubernetes, CI/CD, REST,
  microservices, LLM, RAG, LangGraph, MCP, NLP. freehire skill slugs are lowercase
  (`python`, `fastapi`, `nodejs`, `typescript`, `react`, `java`, `spring`, `postgresql`,
  `redis`, `aws`, `docker`, `kubernetes`, `ci-cd`, `rest`, `microservices`, `llm`, `rag`,
  `langgraph`, `langchain`, `agentic-ai`, `generative-ai`). Check any other slug with
  the facets endpoint before relying on it.
- **Freshness:** `posted_within_days=14` and `reality=fresh`, so it skips stale or
  evergreen ads.

## 2. Search

REST example (repeat a parameter to OR its values):

```bash
curl -sG https://freehire.me/api/v1/jobs/search \
  --data-urlencode countries=in --data-urlencode is_tech=tech \
  --data-urlencode category=backend --data-urlencode category=fullstack \
  --data-urlencode category=ai_engineering --data-urlencode category=software_engineering \
  --data-urlencode experience_years_max=3 --data-urlencode role_type_exclude=people_manager \
  --data-urlencode seniority_exclude=senior --data-urlencode seniority_exclude=lead \
  --data-urlencode skills=python --data-urlencode skills=llm --data-urlencode skills=rag \
  --data-urlencode posted_within_days=14 --data-urlencode limit=50
```

- **Location filters are ORed with each other**: `countries=in&cities=Hyderabad` means
  "anywhere in India OR Hyderabad". For one city, send only `cities=Hyderabad`.
  Use `countries=in` alone for all of India.
- `experience_years_min` in freehire's tags is sometimes lower than what the posting
  actually demands. Confirm the years in the full description before calling a job a fit.
- Always check `meta.ignored_params` in the response. A misspelled filter is
  silently dropped and the results look broader than you meant.
- Facet values (categories, skill slugs, cities, counts): `GET /jobs/facets` with the
  same filters.
- Full description of one posting: `get_job` (MCP), or `GET /jobs/{public_slug}`.
- Run separate searches for the AI angle and the backend/full-stack angle, then
  merge the results.

## 3. Shortlist like a recruiter

For the best 20–40 candidates, read the full posting (`get_job`) and judge each one
against his resumes:
- the must-have skills he has and the ones he lacks
- the years asked for: a hard "4+ years" is out; "2+" is a reasonable stretch
- location or work mode he'd accept
- whether the posting still looks live (`check_jobs_open` / reality class)

Present the top 10–15 as a table: **company, role, location/mode, years asked, fit
(strong/ok/stretch), why, link**. The link is the employer's own posting URL
(`url`; strip the `utm_*` tracking), and say which board it came from. Then list
the main gaps that keep coming up across the shortlist, so he knows what to brush up on.

Never invent postings, salaries or requirements; everything comes from freehire's
data. Credit freehire as the source.

## 4. Keep a log

Append what you showed him to `data/job-log.md` (date, company, role, link, fit).
Before showing results, leave out anything already in the log unless he asks for
repeats. Then run `scripts/data.sh encrypt` and commit `data.enc` (never commit
`data/` itself; the repo is public).

## Applying

This repo doesn't apply for him. Each result links to the employer's own posting.
freehire.me also offers CV tailoring, application tracking and a form-filling
browser extension under his own account, if he wants them.
