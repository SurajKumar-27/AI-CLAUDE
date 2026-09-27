"""Open a job's application form in Chromium, fill it, and (optionally) submit it."""
from __future__ import annotations

import difflib
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

from ..links import is_ats
from ..models import JobPosting, JobStatus, Profile
from .ats import (APPLY_BUTTON_RE, CONFIRMATION_RE, NEXT_BUTTON_RE, SUBMIT_BUTTON_RE, apply_url, ats_name,
                  needs_login)
from .fields import FormField, Plan, ask_llm, collect_fields, merge_llm_answers, plan_standard

log = logging.getLogger(__name__)

CAPTCHA_FRAME_RE = re.compile(r"(recaptcha/api2/(anchor|bframe)|recaptcha/enterprise/(anchor|bframe)|hcaptcha\.com|"
                              r"challenges\.cloudflare\.com)", re.I)


@dataclass
class FillResult:
    status: JobStatus
    detail: str
    answers: dict[str, str] = field(default_factory=dict)  # question -> what we entered
    screenshot: str = ""
    final_url: str = ""


def best_option(wanted: str, options: list[str]) -> str | None:
    if not options:
        return None
    w = wanted.strip().lower()
    for o in options:
        if o.strip().lower() == w:
            return o
    for o in options:
        if w and (w in o.lower() or o.lower() in w) and len(o) > 1:
            return o
    match = difflib.get_close_matches(wanted, options, n=1, cutoff=0.6)
    return match[0] if match else None


class ApplicationFiller:
    def __init__(self, session, llm, profile: Profile, shots_dir: Path):
        self.session = session
        self.llm = llm
        self.profile = profile
        self.shots_dir = shots_dir

    # ------------------------------------------------------------ navigation

    def _has_form(self, frame) -> bool:
        return frame.evaluate("""() => {
            const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const files = document.querySelectorAll('input[type=file]').length;
            const emails = [...document.querySelectorAll('input[type=email], input[name*=email i], input[id*=email i]')].filter(vis).length;
            const inputs = [...document.querySelectorAll('input:not([type=hidden]), textarea, select')].filter(vis).length;
            return files > 0 || (emails > 0 && inputs >= 3);
        }""")

    def _login_wall(self, page) -> bool:
        return page.evaluate("""() => {
            const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const pw = [...document.querySelectorAll('input[type=password]')].filter(vis).length;
            const files = document.querySelectorAll('input[type=file]').length;
            return pw > 0 && files === 0;
        }""")

    def _embedded_ats_frame(self, page):
        for frame in page.frames[1:]:
            if frame.url.startswith("http") and is_ats(frame.url):
                return frame
        return None

    def _click_apply(self, page):
        """Click an 'Apply' button/link. Returns the page the form is on (may be a new tab)."""
        for el in page.locator("a, button, [role=button], input[type=button], input[type=submit]").all()[:400]:
            try:
                text = (el.inner_text(timeout=500) or el.get_attribute("value") or "").strip()
                if not APPLY_BUTTON_RE.match(text) or not el.is_visible():
                    continue
                try:
                    with page.context.expect_page(timeout=4000) as new_page:
                        el.click(timeout=5000)
                    target = new_page.value
                except Exception:  # noqa: BLE001 - no new tab; the click navigated in place
                    target = page
                target.wait_for_load_state("domcontentloaded", timeout=30000)
                target.wait_for_timeout(2500)
                return target
            except Exception:  # noqa: BLE001
                continue
        return None

    def _find_form(self, page):
        """Returns (page, frame) holding the application form, or (page, None)."""
        for _ in range(3):
            frame = self._embedded_ats_frame(page)
            if frame is not None:
                page.goto(apply_url(frame.url), wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(2500)
                continue
            if self._has_form(page.main_frame):
                return page, page.main_frame
            clicked = self._click_apply(page)
            if clicked is None:
                return page, None
            page = clicked
            if needs_login(page.url):
                return page, None
        return page, (page.main_frame if self._has_form(page.main_frame) else None)

    # ------------------------------------------------------------ filling

    def _fill(self, frame, fields: list[FormField], plan: Plan) -> list[str]:
        problems = []
        by_key = {f.key: f for f in fields}
        for key, path in plan.files.items():
            try:
                frame.locator(f'[data-jobbot-key="{key}"]').set_input_files(path, timeout=8000)
            except Exception as e:  # noqa: BLE001
                problems.append(f"could not upload to '{by_key[key].label[:60]}': {e.__class__.__name__}")
        for key, value in plan.text.items():
            f = by_key[key]
            loc = frame.locator(f'[data-jobbot-key="{key}"]')
            try:
                if f.kind == "select":
                    opt = best_option(value, f.options)
                    if opt is None:
                        problems.append(f"no option like '{value}' for '{f.label[:60]}'")
                        if f.required:
                            plan.unanswered.append(f)
                        continue
                    loc.select_option(label=opt, timeout=5000)
                    plan.text[key] = opt
                elif f.kind == "combobox":
                    loc.click(timeout=5000)
                    loc.fill(value, timeout=5000)
                    frame.wait_for_timeout(900)
                    options = frame.locator("[role=option]")
                    labels = [o.strip() for o in options.all_inner_texts()]
                    opt = best_option(value, labels)
                    if opt is not None:
                        options.nth(labels.index(opt)).click(timeout=5000)
                    else:
                        loc.press("Enter")
                else:
                    loc.fill(value, timeout=5000)
            except Exception as e:  # noqa: BLE001
                problems.append(f"could not fill '{f.label[:60]}': {e.__class__.__name__}")
        for key, picks in plan.choices.items():
            f = by_key[key]
            try:
                if f.kind == "checkbox":
                    frame.locator(f'[data-jobbot-key="{key}_0"]').check(timeout=5000, force=True)
                    continue
                for pick in picks:
                    opt = best_option(pick, f.options)
                    if opt is None:
                        problems.append(f"no option like '{pick}' for '{f.label[:60]}'")
                        continue
                    frame.locator(f'[data-jobbot-key="{key}_{f.options.index(opt)}"]').check(timeout=5000, force=True)
            except Exception as e:  # noqa: BLE001
                problems.append(f"could not choose for '{f.label[:60]}': {e.__class__.__name__}")
        return problems

    def _visible_captcha(self, page) -> bool:
        for frame in page.frames:
            if CAPTCHA_FRAME_RE.search(frame.url or ""):
                try:
                    el = frame.frame_element()
                    box = el.bounding_box()
                    if box and box["width"] > 30 and box["height"] > 30 and el.is_visible():
                        return True
                except Exception:  # noqa: BLE001
                    continue
        return False

    def _button(self, frame, pattern):
        for el in frame.locator("button, input[type=submit], [role=button], a").all()[:300]:
            try:
                text = (el.inner_text(timeout=300) or el.get_attribute("value") or "").strip()
                if pattern.match(text) and el.is_visible():
                    return el
            except Exception:  # noqa: BLE001
                continue
        return None

    def _errors(self, frame) -> list[str]:
        return frame.evaluate("""() => {
            const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const sel = '[role=alert], .error, .errors, .field-error, .invalid-feedback, [class*="error-message"], [aria-invalid=true]';
            return [...document.querySelectorAll(sel)].filter(vis).map(e => (e.innerText || e.getAttribute('aria-label') || e.name || '').trim()).filter(Boolean).slice(0, 8);
        }""")

    # ------------------------------------------------------------ main

    def run(self, job_url: str, job_id: str, posting: JobPosting, resume_text: str, resume_pdf: str,
            cover_pdf: str | None, submit: bool, saved_answers: dict | None = None) -> FillResult:
        if needs_login(job_url):
            return FillResult(JobStatus.NEEDS_HUMAN, f"{ats_name(job_url)} needs your login to apply", final_url=job_url)
        ctx = self.session.new_context()
        shot = str(self.shots_dir / f"{job_id}.png")
        answers: dict[str, str] = {}
        try:
            page = ctx.new_page()
            page.goto(apply_url(job_url), wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:  # noqa: BLE001
                pass
            page, frame = self._find_form(page)
            if needs_login(page.url) or (frame is None and self._login_wall(page)):
                page.screenshot(path=shot, full_page=True)
                return FillResult(JobStatus.NEEDS_HUMAN, "the site wants you to log in / create an account",
                                  screenshot=shot, final_url=page.url)
            if frame is None:
                page.screenshot(path=shot, full_page=True)
                return FillResult(JobStatus.NEEDS_HUMAN, "couldn't find an application form on the page",
                                  screenshot=shot, final_url=page.url)

            problems: list[str] = []
            unanswered: list[str] = []
            for step in range(5):  # multi-page forms: fill, Next, fill ...
                fields = collect_fields(frame)
                plan, rest = plan_standard(fields, self.profile, resume_pdf, cover_pdf)
                reuse = saved_answers or {}
                rest_after_saved = []
                for f in rest:
                    if f.label in reuse and f.kind not in ("checkboxes", "radio", "checkbox"):
                        plan.text[f.key] = reuse[f.label]
                        plan.notes[f.key] = f.label
                    else:
                        rest_after_saved.append(f)
                todo = [f for f in rest_after_saved if not f.value or f.kind in ("radio", "checkboxes", "checkbox")]
                if todo:
                    merge_llm_answers(plan, todo, ask_llm(self.llm, todo, self.profile, resume_text, posting))
                problems += self._fill(frame, fields, plan)
                unanswered += [f.label[:120] for f in plan.unanswered]
                for key, label in plan.notes.items():
                    val = plan.text.get(key) or "; ".join(plan.choices.get(key, [])) or (
                        Path(plan.files[key]).name if key in plan.files else "")
                    if val:
                        answers[label[:150]] = val
                nxt = self._button(frame, NEXT_BUTTON_RE)
                if self._button(frame, SUBMIT_BUTTON_RE) or nxt is None or unanswered:
                    break
                nxt.click(timeout=8000)
                page.wait_for_timeout(2500)
                errs = self._errors(frame)
                if errs:
                    problems += errs
                    break

            page.screenshot(path=shot, full_page=True)
            if self._visible_captcha(page):
                return FillResult(JobStatus.NEEDS_HUMAN, "form filled, but there is a CAPTCHA to solve",
                                  answers, shot, page.url)
            if unanswered:
                return FillResult(JobStatus.NEEDS_HUMAN,
                                  "form filled except questions only you can answer: " + " | ".join(unanswered[:6]),
                                  answers, shot, page.url)
            if problems:
                log.info("fill problems: %s", problems)
            if not submit:
                detail = "form filled; waiting for your OK to submit"
                if problems:
                    detail += " (check: " + "; ".join(problems[:4]) + ")"
                return FillResult(JobStatus.AWAITING_APPROVAL, detail, answers, shot, page.url)

            button = self._button(frame, SUBMIT_BUTTON_RE)
            if button is None:
                return FillResult(JobStatus.NEEDS_HUMAN, "filled, but couldn't find the submit button",
                                  answers, shot, page.url)
            button.click(timeout=10000)
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:  # noqa: BLE001
                pass
            page.wait_for_timeout(3000)
            page.screenshot(path=shot, full_page=True)
            body = " ".join(f.evaluate("() => document.body ? document.body.innerText : ''") for f in page.frames[:5])
            if CONFIRMATION_RE.search(body):
                return FillResult(JobStatus.SUBMITTED, "submitted - confirmation shown", answers, shot, page.url)
            if self._visible_captcha(page):
                return FillResult(JobStatus.NEEDS_HUMAN, "submit triggered a CAPTCHA", answers, shot, page.url)
            errs = self._errors(frame) if not frame.is_detached() else []
            if errs:
                return FillResult(JobStatus.NEEDS_HUMAN, "the form rejected some answers: " + " | ".join(errs[:5]),
                                  answers, shot, page.url)
            return FillResult(JobStatus.UNCERTAIN, "clicked submit but saw no confirmation - please check",
                              answers, shot, page.url)
        except Exception as e:  # noqa: BLE001
            log.exception("filling %s failed", job_url)
            try:
                page.screenshot(path=shot, full_page=True)
            except Exception:  # noqa: BLE001
                shot = ""
            return FillResult(JobStatus.FAILED, f"browser error: {e.__class__.__name__}: {str(e)[:200]}",
                              answers, shot, job_url)
        finally:
            ctx.close()
