"""`python -m jobbot <command>`: the steps of applying to one job.

  job <url>             resolve the link, save the job description and the form's questions
  plan <id> --base B    write an editable plan.json from base resume B (fullstack | ai)
  resume <id>           apply plan.json (with the truthfulness checks) and render the PDF
  apply <id> [--submit] fill the form with the PDF + answers.json; submit only with --submit
  log                   applications submitted so far
  resolve <url>         only show where a link leads
  render <base>         render a base resume (layout check)
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
from pathlib import Path

from .config import RESUME_NAMES, Settings, load_profile, load_resumes

log = logging.getLogger("jobbot")


def _slug(text: str, n: int = 24) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:n].strip("-") or "job"


def _job_dir(settings: Settings, job_id: str) -> Path:
    d = settings.work_dir / job_id
    if not d.exists():
        sys.exit(f"No job '{job_id}' in {settings.work_dir}/ - run `python -m jobbot job <url>` first.")
    return d


def _read_json(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _resume_filename(settings: Settings) -> str:
    return load_profile(settings).personal.full_name.replace(" ", "_") + "_Resume.pdf"


# ------------------------------------------------------------------ commands

def cmd_job(settings: Settings, url: str, job_id: str | None) -> None:
    from .apply.filler import ApplicationFiller
    from .browser import BrowserSession, RenderFetcher
    from .jobpage import extract_posting
    from .links import HttpFetcher, LinkResolver, canonical_url, extract_candidates

    with BrowserSession(settings.headless, settings.chromium_path) as session:
        renderer = RenderFetcher(session, settle_ms=2500)
        res = LinkResolver(HttpFetcher(), renderer).resolve(url)
        page = renderer.get(res.url)
        posting = extract_posting(page)
        job_url = page.url or res.url
        job_id = job_id or f"{dt.date.today():%Y%m%d}-{_slug(posting.company or posting.title)}-" \
                           f"{hashlib.sha1(canonical_url(job_url).encode()).hexdigest()[:6]}"
        d = settings.work_dir / job_id
        d.mkdir(parents=True, exist_ok=True)
        (d / "jd.txt").write_text(posting.description, encoding="utf-8")
        candidates = [] if res.confident else [
            {"url": c.url, "text": c.text, "score": c.score} for c in extract_candidates(page)[:10]]
        _write_json(d / "job.json", {
            "id": job_id, "source_url": url, "job_url": job_url, "resolve_chain": res.chain,
            "resolve_method": res.method, "confident": res.confident, "title": posting.title,
            "company": posting.company, "location": posting.location, "other_candidates": candidates,
        })
        form, fields = ApplicationFiller(session, load_profile(settings), d).inspect(job_url)
        _write_json(d / "fields.json", {"status": form.status.value, "detail": form.detail,
                                        "form_url": form.final_url, "fields": fields})

    print(f"id:        {job_id}")
    print(f"job:       {posting.title} | {posting.company} | {posting.location}")
    print(f"url:       {job_url}   (via {res.method}{'' if res.confident else ', NOT confident'})")
    if len(res.chain) > 1:
        print("chain:     " + "  ->  ".join(res.chain))
    for c in candidates:
        print(f"  other link [{c['score']}]: {c['url']}  ({c['text'][:60]})")
    print(f"jd:        {d / 'jd.txt'} ({len(posting.description)} chars)")
    print(f"form:      {form.status.value} - {form.detail}  {form.final_url}")
    for f in fields:
        opts = f" options={f['options']}" if f.get("options") else ""
        print(f"  [{f['key']}] {'*' if f['required'] else ' '} ({f['type']}) {f['question'][:110]}{opts[:300]}")
    if form.screenshot:
        print(f"screenshot: {form.screenshot}")


def cmd_plan(settings: Settings, job_id: str, base_name: str) -> None:
    from .tailor import PlanBullet, PlanSkillGroup, TailorPlan, allowed_extra_skills, resume_payload

    d = _job_dir(settings, job_id)
    resumes, profile = load_resumes(settings), load_profile(settings)
    base = resumes[base_name]
    payload = resume_payload(base)
    bullets = [PlanBullet(id=b["id"], text=b["text"]) for e in payload["experience"] for r in e["roles"]
               for b in r["bullets"]]
    bullets += [PlanBullet(id=b["id"], text=b["text"]) for p in payload["projects"] for b in p["bullets"]]
    plan = TailorPlan(base=base_name, summary=base.summary,
                      skills=[PlanSkillGroup(**g.model_dump()) for g in base.skills], bullets=bullets,
                      changes=[], missing_requirements=[], cover_letter="")
    _write_json(d / "plan.json", plan.model_dump())
    others = [r for n, r in resumes.items() if n != base_name]
    print(f"wrote {d / 'plan.json'} (unchanged copy of the {base_name} resume - edit it)")
    print("bullet ids: " + ", ".join(
        f"{b['id']}={e['company'][:12]}/{r['title'][:18]}" for e in payload["experience"] for r in e["roles"]
        for b in r["bullets"][:1]) + " ... projects p<N>b<M>")
    print("skills that may be added: " + ", ".join(allowed_extra_skills(base, others, profile.extra_skills)))


def cmd_resume(settings: Settings, job_id: str) -> None:
    from .browser import BrowserSession
    from .render import pdf_page_count, render_resume_pdf, text_to_pdf
    from .tailor import TailorPlan, apply_plan

    d = _job_dir(settings, job_id)
    plan = TailorPlan.model_validate(_read_json(d / "plan.json") or sys.exit("no plan.json - run `plan` first"))
    resumes, profile = load_resumes(settings), load_profile(settings)
    base = resumes[plan.base]
    others = [r for n, r in resumes.items() if n != plan.base]
    result = apply_plan(base, plan, other_resumes=others, extra_skills=profile.extra_skills)
    pdf = d / _resume_filename(settings)
    with BrowserSession(settings.headless, settings.chromium_path) as session:
        render_resume_pdf(session, result.resume, profile, pdf)
        if result.cover_letter:
            text_to_pdf(session, result.cover_letter, profile, d / "Cover_Letter.pdf")
            (d / "cover_letter.txt").write_text(result.cover_letter, encoding="utf-8")
        elif plan.cover_letter.strip():
            print("! cover letter dropped: it mentions a number/technology that isn't on the resume")
    (d / "resume.txt").write_text(result.resume.as_text(), encoding="utf-8")
    _write_json(d / "resume_report.json", {"base": plan.base, "changes": result.changes, "reverted": result.reverted,
                                           "missing_requirements": result.missing_requirements})
    print(f"resume:   {pdf}  ({pdf_page_count(pdf)} page)")
    print(f"text:     {d / 'resume.txt'}")
    for r in result.reverted:
        print(f"  reverted: {r}")
    if not result.reverted:
        print("  all edits passed the checks")


def cmd_apply(settings: Settings, job_id: str, submit: bool) -> None:
    from .apply.filler import ApplicationFiller
    from .browser import BrowserSession
    from .models import JobStatus

    d = _job_dir(settings, job_id)
    job = _read_json(d / "job.json")
    pdf = d / _resume_filename(settings)
    if not pdf.exists():
        sys.exit("no tailored resume yet - run `resume` first")
    answers = _read_json(d / "answers.json", {})
    cover = d / "Cover_Letter.pdf"
    fields_info = _read_json(d / "fields.json", {})
    target = fields_info.get("form_url") or job["job_url"]
    with BrowserSession(settings.headless, settings.chromium_path) as session:
        result = ApplicationFiller(session, load_profile(settings), d).run(
            target, str(pdf), str(cover) if cover.exists() else None, answers, submit)
    out = {"status": result.status.value, "detail": result.detail, "final_url": result.final_url,
           "screenshot": result.screenshot, "entered": result.answers, "unanswered": result.unanswered,
           "optional_left_empty": result.skipped, "problems": result.problems,
           "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
    _write_json(d / ("result_submit.json" if submit else "result_dry_run.json"), out)
    print(f"status:  {result.status.value} - {result.detail}")
    print(f"page:    {result.final_url}")
    print(f"screenshot: {result.screenshot}")
    for q, a in result.answers.items():
        print(f"  = {q[:90]}: {str(a)[:100]}")
    for f in result.unanswered:
        opts = f" options={f['options']}" if f.get("options") else ""
        print(f"  ? REQUIRED [{f['key']}] ({f['type']}) {f['question'][:120]}{opts[:300]}")
    for f in result.skipped:
        print(f"  - optional, left empty [{f['key']}] {f['question'][:100]}")
    for p in result.problems:
        print(f"  ! {p}")
    if submit and result.status in (JobStatus.SUBMITTED, JobStatus.UNCERTAIN):
        _log_application(settings, job, result.status.value, d)


def _log_application(settings: Settings, job: dict, status: str, d: Path) -> None:
    report = _read_json(d / "resume_report.json", {})
    entry = {"at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "status": status,
             "company": job.get("company"), "title": job.get("title"), "url": job.get("job_url"),
             "resume": report.get("base"), "id": job.get("id")}
    path = settings.data_dir / "applications.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"logged in {path}")
    if os.environ.get("JOBBOT_STATE_KEY") and Path("scripts/data.sh").exists():
        subprocess.run(["scripts/data.sh", "encrypt"], check=False)
        print("data.enc updated - commit it to keep the log")


def cmd_log(settings: Settings) -> None:
    path = settings.data_dir / "applications.jsonl"
    if not path.exists():
        print("No applications yet.")
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        e = json.loads(line)
        print(f"{e['at'][:10]}  {e['status']:<10} {e.get('company') or '?':<24} {e.get('title') or '?':<40} {e.get('url')}")


def cmd_resolve(settings: Settings, url: str) -> None:
    from .browser import BrowserSession, RenderFetcher
    from .links import HttpFetcher, LinkResolver

    with BrowserSession(settings.headless, settings.chromium_path) as session:
        res = LinkResolver(HttpFetcher(), RenderFetcher(session)).resolve(url)
    print(f"{res.url}\n  method: {res.method}  confident: {res.confident}")
    for hop in res.chain:
        print(f"  -> {hop}")


def cmd_render(settings: Settings, name: str) -> None:
    from .browser import BrowserSession
    from .render import render_resume_pdf

    out = settings.work_dir / f"base-{name}.pdf"
    with BrowserSession(settings.headless, settings.chromium_path) as session:
        render_resume_pdf(session, load_resumes(settings)[name], load_profile(settings), out)
    print(out)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="jobbot", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    j = sub.add_parser("job")
    j.add_argument("url")
    j.add_argument("--id")
    p = sub.add_parser("plan")
    p.add_argument("id")
    p.add_argument("--base", choices=RESUME_NAMES, required=True)
    r = sub.add_parser("resume")
    r.add_argument("id")
    a = sub.add_parser("apply")
    a.add_argument("id")
    a.add_argument("--submit", action="store_true", help="actually press submit (default: fill only)")
    sub.add_parser("log")
    rs = sub.add_parser("resolve")
    rs.add_argument("url")
    rn = sub.add_parser("render")
    rn.add_argument("name", choices=RESUME_NAMES)
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    settings = Settings()
    if args.cmd == "job":
        cmd_job(settings, args.url, args.id)
    elif args.cmd == "plan":
        cmd_plan(settings, args.id, args.base)
    elif args.cmd == "resume":
        cmd_resume(settings, args.id)
    elif args.cmd == "apply":
        cmd_apply(settings, args.id, args.submit)
    elif args.cmd == "log":
        cmd_log(settings)
    elif args.cmd == "resolve":
        cmd_resolve(settings, args.url)
    elif args.cmd == "render":
        cmd_render(settings, args.name)


if __name__ == "__main__":
    main()
