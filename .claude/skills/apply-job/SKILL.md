---
name: apply-job
description: Apply to a job for Suraj from a link he sends. Use whenever the user's message contains a job link (a posting, a careers page, an aggregator/blog post or a shortened link) or asks to apply to a job. Tailors his resume to the job description the way a hiring manager screens, fills the application form and submits it.
---

# Apply to a job from a link

Suraj sends a link; you take it all the way to a submitted application. He has
authorised submitting applications for links he sends, so don't ask "shall I
submit?". Do stop and ask when something only he can answer comes up (see step 5).

All commands run from the repo root: `python -m jobbot ...` (the session hook puts
`.venv/bin` on PATH; otherwise use `.venv/bin/python`). Per-job files go to
`work/<id>/`.

## 0. Preconditions (check once per session)

- `data/profile.yaml` exists. If not, `data.enc` is still locked: run
  `scripts/data.sh decrypt`. If `JOBBOT_STATE_KEY` isn't set, tell him to add it as
  an environment variable in the cloud environment settings (never ask for the key in chat).
- Job sites are reachable. If fetching fails with a 403 from the proxy or "connect
  rejected", the environment's network access is too narrow: tell him the host and
  that Network access must allow it (the cloud environment menu in the session's
  title bar, then Edit). Still build the tailored resume so he can apply by hand.

## 1. Read the job

```
python -m jobbot job "<link>"
```

This follows shorteners, redirects and "Apply here" links on blog pages, saves the
description to `work/<id>/jd.txt`, and lists the form's questions (`fields.json`).
- `NOT confident` or several `other link` lines: pick the real posting yourself and
  rerun `job` with that URL. If the post lists several jobs, ask which one(s).
- Read `jd.txt` completely.
- A form status of `needs_human` (login, e.g. LinkedIn, Naukri, Workday) means you
  can't submit it. Do steps 2–4 anyway and give him the PDF and answers to paste.

## 2. Screen it like the hiring manager

Before editing anything, write down for yourself:
- the must-have skills and years, the nice-to-haves, the domain, and what the
  role actually does day to day
- which of his experiences prove each must-have (by bullet)
- the honest gaps

Pick the base resume:
- `ai`: AI/ML/LLM/GenAI/RAG/agents/NLP/data-science roles
- `fullstack`: everything else, i.e. full-stack, backend, frontend, Node/React/Python web,
  and also Java/Spring Boot, generic SDE, DevOps and the like (the "other" category)

If he is clearly ineligible, tell him why and ask before applying. Examples: the role
requires 4+ years as a hard minimum, a clearance or citizenship he lacks, or a stack
he has never used. A stretch role is fine; apply.

## 3. Tailor the resume

```
python -m jobbot plan <id> --base fullstack|ai
```

Edit `work/<id>/plan.json`. A recruiter gives a resume about six seconds and an ATS
matches keywords. Optimise the top third of the page for that job:

1. **Summary** (2–3 lines). Open with the job's own title wording when it truthfully
   fits (e.g. "Backend Software Engineer" or "AI Engineer"), then his years (1.5+), then
   the 3–4 must-haves he really has, in the JD's spelling. Add one concrete proof
   point taken from a bullet.
2. **Skills.** Put the JD's must-haves he has first, in the JD's spelling (e.g.
   "RESTful APIs" if that's what it says). Move irrelevant items to the end or drop
   them, and rename or reorder groups so the most relevant group is first. You may add
   skills only from "skills that may be added" (his other resume + `extra_skills`).
3. **Bullets.** Within each role, put the bullet that best proves the top must-have
   first. Reword bullets to use the JD's terminology *for the same work*, lead with
   the outcome, and keep every number exactly. Don't merge, split or move bullets
   between roles, and keep each one about the same length.
4. `changes`: 3–6 short lines saying what you changed and why (he sees these).
5. `missing_requirements`: the must-haves he doesn't show, so he can prepare for
   interview questions on them.
6. `cover_letter`: under 170 words, specific to this company and role. Only facts
   from the resume, no placeholders, no "Dear Hiring Manager" line.

Never fabricate: no skill, tool, metric, title, date or responsibility that isn't on
his resumes. Invented claims fail background checks and interviews, and can get an
offer withdrawn. The `resume` step enforces this and reverts violating edits.

```
python -m jobbot resume <id>
```

Deal with every `reverted:` line: either rephrase within the rules and rerun, or
accept the original. Then look at the PDF with the Read tool (the PDF file, pages
"1") and check it is one page, reads well, and the top third sells this job.

## 4. Answer the form's questions

Write `work/<id>/answers.json` for every question in `fields.json` that isn't name,
email, phone, links, location or resume upload (those are filled from the profile
automatically; an explicit answer overrides them):

```json
{
  "Why do you want to work at Acme?": "…2–4 specific sentences from his real experience…",
  "How many years of experience with Python": "1-2 years",
  "Are you legally authorized to work in India": "Yes",
  "I agree to the privacy policy": true,
  "Which of these have you used": ["Docker", "Kubernetes"]
}
```

- Keys: the question text or a distinctive part of it, or the field key (`f7`).
- Select, radio and checkbox answers must be one of the listed options, copied exactly.
- Facts come from `data/profile.yaml` (`facts:`) and the resume. Skill yes/no and
  years-with-X answers must be true. Count years from the resume's dates only.
- EEO, gender, disability and veteran questions: `facts.eeo_default_answer`, or the closest
  "decline / prefer not to say" option.
- Dropdowns show their options in `fields.json`. Search-as-you-type ones (city, school)
  don't: give the value and the filler picks the closest suggestion. If his school
  isn't offered, use "Other" when it exists, or leave an optional field empty.
- Self-ratings ("rate yourself in DSA 1–10"): answer honestly from the resume
  (500+ LeetCode/GFG problems solved supports a confident answer); don't inflate.

## 5. Stop and ask him only when needed

Ask in one message, with the exact questions and options, and wait, when a
**required** question needs a fact that's missing (null in `profile.yaml`), e.g.
current or expected CTC, notice period, relocation, date of birth, or a
background-check or legal question. Save his answers into `data/profile.yaml`
`facts:` so they're never asked again, then continue.

## 6. Dry run, then submit

```
python -m jobbot apply <id>            # fills, doesn't submit
```

Read the output and look at the screenshot (`work/<id>/filled.png`; crop the form
part if the page is long). Look for red "required"/error text under fields and for
anything filled wrongly. `! no option like ...` lines mean a dropdown wasn't set.
Repeat until the status is `ready` with no `? REQUIRED` lines and the form looks right. Then
submit:

```
python -m jobbot apply <id> --submit
```

- `submitted`: done.
- `uncertain`: look at `submitted.png` and judge.
- `needs_answers`: the form rejected something; fix `answers.json` and rerun.
- `needs_human` (CAPTCHA, login): hand it to him (step 7).

Multi-page forms: the filler clicks Next and stops at questions it has no answer
for. Add those to `answers.json` and rerun.

## 7. Report back

Send the tailored PDF (and `Cover_Letter.pdf` if made) with SendUserFile, then a
short message:
- **Company – Role**: status (submitted / needs you, and why)
- resume used and 2–4 key tailoring changes
- honest fit, plus the gaps to prepare for in the interview
- if it needs him: the job link and exactly what to do, with the prepared answers
  for copy-paste

## 8. Keep the record

A submission is logged in `data/applications.jsonl` and re-encrypted into
`data.enc` automatically when `JOBBOT_STATE_KEY` is set. Commit `data.enc`
(plus any `profile.yaml` fact updates, by running `scripts/data.sh encrypt` first)
and push to the working branch. `python -m jobbot log` lists past applications;
check it first to avoid applying twice to the same job.
