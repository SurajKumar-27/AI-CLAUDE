"""Post -> links -> job page -> resume choice -> tailored PDF -> filled form -> report."""
from __future__ import annotations

import logging
from pathlib import Path

from .apply.filler import ApplicationFiller
from .browser import RenderFetcher
from .config import BASE_RESUME_FOR, Settings
from .jobpage import analyze, extract_posting
from .links import LinkResolver, Resolved
from .models import Category, JobPosting, JobRecord, JobStatus, Profile, Resume
from .render import render_resume_pdf, text_to_pdf
from .state import State, job_id_for
from .tailor import tailor

log = logging.getLogger(__name__)


class Pipeline:
    def __init__(self, settings: Settings, llm, session, profile: Profile, resumes: dict[str, Resume],
                 state: State, notifier, resolver: LinkResolver):
        self.s = settings
        self.llm = llm
        self.session = session
        self.profile = profile
        self.resumes = resumes
        self.state = state
        self.notifier = notifier
        self.resolver = resolver
        self.renderer = RenderFetcher(session, settle_ms=2500)

    # ------------------------------------------------------------ posts

    def handle_urls(self, urls: list[str], force: bool = False) -> list[JobRecord]:
        done = []
        for url in urls[: self.s.max_links_per_post]:
            resolved = self.resolver.resolve(url)
            log.info("resolved %s -> %s (%s)", url, resolved.url, resolved.method)
            existing = self.state.seen(resolved.url)
            if existing and not force:
                log.info("already handled %s (%s)", resolved.url, existing.status.value)
                continue
            done.append(self.process(resolved, url))
        return done

    # ------------------------------------------------------------ one job

    def process(self, resolved: Resolved, source_url: str) -> JobRecord:
        rec = JobRecord(id=job_id_for(resolved.url), source_url=source_url, job_url=resolved.url,
                        resolve_chain=resolved.chain)
        tailored = None
        try:
            page = self.renderer.get(resolved.url)
            posting = extract_posting(page)
            if page.url != resolved.url:
                rec.job_url = page.url
            analysis = analyze(self.llm, posting, self.resumes["fullstack"].as_text())
            rec.title = analysis.title or posting.title
            rec.company = analysis.company or posting.company
            posting.title, posting.company = rec.title, rec.company
            rec.category = Category(analysis.category)
            rec.fit_score = analysis.fit_score
            rec.fit_notes = f"{analysis.fit_notes} (experience asked: {analysis.years_required})".strip()

            if not analysis.is_job_posting:
                rec.status, rec.status_detail = JobStatus.SKIPPED, "not an open job posting (expired, login wall or not a job page)"
                return self._finish(rec)
            if analysis.fit_score < self.s.min_fit:
                rec.status, rec.status_detail = JobStatus.SKIPPED, f"fit {analysis.fit_score} is below your minimum {self.s.min_fit}"
                return self._finish(rec)

            base_name = BASE_RESUME_FOR[rec.category]
            base = self.resumes[base_name]
            others = [r for n, r in self.resumes.items() if n != base_name]
            tailored = tailor(self.llm, base, posting, other_resumes=others,
                              extra_skills=self.profile.extra_skills, effort=self.s.tailor_effort)
            job_dir = self.state.job_dir(rec.id)
            rec.resume_pdf = str(render_resume_pdf(self.session, tailored.resume, self.profile, job_dir / "resume.pdf"))
            (job_dir / "resume.txt").write_text(tailored.resume.as_text(), encoding="utf-8")
            cover_pdf = None
            if self.s.write_cover_letter and tailored.cover_letter:
                cover_pdf = str(text_to_pdf(self.session, tailored.cover_letter, self.profile, job_dir / "cover_letter.pdf"))
                (job_dir / "cover_letter.txt").write_text(tailored.cover_letter, encoding="utf-8")
            self._fill(rec, posting, tailored.resume.as_text(), cover_pdf, submit=self.s.auto_submit)
        except Exception as e:  # noqa: BLE001
            log.exception("processing %s failed", resolved.url)
            rec.status, rec.status_detail = JobStatus.FAILED, f"{e.__class__.__name__}: {str(e)[:300]}"
        return self._finish(rec, tailored)

    def _fill(self, rec: JobRecord, posting: JobPosting, resume_text: str, cover_pdf: str | None, submit: bool,
              saved_answers: dict | None = None) -> None:
        filler = ApplicationFiller(self.session, self.llm, self.profile, self.state.job_dir(rec.id))
        result = filler.run(rec.job_url, "form", posting, resume_text, rec.resume_pdf, cover_pdf, submit, saved_answers)
        rec.status, rec.status_detail = result.status, result.detail
        rec.answers = result.answers or rec.answers
        rec.screenshot = result.screenshot

    def _finish(self, rec: JobRecord, tailored=None) -> JobRecord:
        self.state.put(rec)
        if tailored is not None:
            self.notifier.report(rec, changes=tailored.changes, reverted=tailored.reverted,
                                 gaps=tailored.missing_requirements, cover_letter=tailored.cover_letter)
        else:
            self.notifier.report(rec)
        log.info("job %s %s: %s", rec.id, rec.status.value, rec.status_detail)
        return rec

    # ------------------------------------------------------------ your button taps

    def handle_action(self, action: str, job_id: str) -> str:
        rec = self.state.jobs.get(job_id)
        if rec is None:
            return "I no longer have that job."
        if action == "skip":
            rec.status, rec.status_detail = JobStatus.SKIPPED, "skipped by you"
            self.state.put(rec)
            return "Skipped."
        if action == "manual":
            rec.status, rec.status_detail = JobStatus.MANUAL, "you're handling it"
            self.state.put(rec)
            return "Noted - it's yours."
        if action not in ("submit", "retry"):
            return "Unknown action."
        if rec.status in (JobStatus.SUBMITTED, JobStatus.MANUAL):
            return f"Already {rec.status.value}."
        if not rec.resume_pdf or not Path(rec.resume_pdf).exists():
            # Files were pruned or never made; start over from the job URL.
            self.state.jobs.pop(job_id, None)
            self.process(Resolved(rec.job_url, rec.resolve_chain, "direct", True), rec.source_url)
            return "Re-running from scratch."
        job_dir = self.state.job_dir(rec.id)
        page = self.renderer.get(rec.job_url)
        posting = extract_posting(page)
        posting.title, posting.company = rec.title, rec.company
        resume_text_path = job_dir / "resume.txt"
        resume_text = resume_text_path.read_text(encoding="utf-8") if resume_text_path.exists() else ""
        cover = job_dir / "cover_letter.pdf"
        self._fill(rec, posting, resume_text, str(cover) if cover.exists() else None,
                   submit=(action == "submit") or self.s.auto_submit, saved_answers=rec.answers)
        self._finish(rec)
        return "Done - see the new report."
