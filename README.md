# jobbot: send a job link, get a tailored application

Paste a job link into the Claude Code session for this repo. Claude then:

1. **Follows the link to the real posting.** It handles shorteners, redirects and blog or aggregator pages that only contain an "Apply here" link.
2. **Reads the job description like a hiring manager.** It works out the must-haves, the nice-to-haves and your honest gaps, and picks your **AI** or **full-stack** resume. Java/Spring Boot and other roles start from the full-stack one.
3. **Tailors the resume.** It rewrites the summary, orders skills and bullets by what the job asks for, and uses the job's wording. The code then reverts any edit that adds a number, technology or skill that isn't on your resumes.
4. **Fills and submits the application form.** It uploads the one-page PDF, answers screening questions from your profile, and asks you only for facts it doesn't have (CTC, notice period and so on).
5. **Sends you the PDF** and a short report: status, what changed, and the gaps to prepare for.

Sites that need your login (LinkedIn Easy Apply, Naukri, Workday and others) or show a CAPTCHA come back to you, with the tailored resume and the answers ready to paste.

The procedure Claude follows is in [`.claude/skills/apply-job/SKILL.md`](.claude/skills/apply-job/SKILL.md).

## One-time setup (cloud environment settings)

Open the cloud environment menu in the session's title bar, then **Edit**:

- **Network access: Full.** Job postings live on arbitrary domains, and the default policy blocks them.
- **Environment variable `JOBBOT_STATE_KEY`.** This key unlocks `data.enc` (your profile, resumes and application log, AES-256 encrypted, because the repo is public).

New sessions pick up both. The session hook installs everything else.

## By hand

```bash
python -m jobbot job <link>                # resolve, save JD + form questions -> work/<id>/
python -m jobbot plan <id> --base ai       # editable plan.json from a base resume
python -m jobbot resume <id>               # checks + one-page PDF
python -m jobbot apply <id>                # fill only (dry run), screenshot
python -m jobbot apply <id> --submit       # fill and submit
python -m jobbot log                       # what's been submitted
scripts/data.sh encrypt | decrypt          # data/ <-> data.enc
pytest                                     # tests against a local fake job site
```
