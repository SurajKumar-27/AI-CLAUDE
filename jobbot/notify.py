"""Reports sent to you about every job."""
from __future__ import annotations

import logging
from html import escape
from pathlib import Path

from .models import JobRecord, JobStatus

log = logging.getLogger(__name__)

ICON = {
    JobStatus.SUBMITTED: "✅ Submitted",
    JobStatus.AWAITING_APPROVAL: "📝 Ready to submit",
    JobStatus.NEEDS_HUMAN: "✋ Needs you",
    JobStatus.UNCERTAIN: "⚠️ Check this one",
    JobStatus.FAILED: "❌ Failed",
    JobStatus.SKIPPED: "⏭ Skipped",
    JobStatus.MANUAL: "👤 Marked as yours",
}
RESUME_LABEL = {"fullstack": "Full-stack resume", "ai": "AI resume", "other": "Other (built from full-stack)"}
RESUME_FILENAME = "{name}_Resume.pdf"


def _bullets(items, limit=6) -> str:
    items = [i for i in items if i][:limit]
    return "\n".join(f"• {escape(str(i))}" for i in items)


def job_message(rec: JobRecord, changes=(), reverted=(), gaps=()) -> str:
    parts = [f"<b>{ICON.get(rec.status, rec.status.value)}</b>",
             f"<b>{escape(rec.title or 'Untitled role')}</b> — {escape(rec.company or 'unknown company')}"]
    meta = []
    if rec.category:
        meta.append(RESUME_LABEL.get(rec.category.value, rec.category.value))
    if rec.fit_score is not None:
        meta.append(f"fit {rec.fit_score}/100")
    if meta:
        parts.append(" · ".join(meta))
    parts.append(f'<a href="{escape(rec.job_url, quote=True)}">Open job</a>'
                 + (f' · <a href="{escape(rec.source_url, quote=True)}">original link</a>'
                    if rec.source_url != rec.job_url else ""))
    if rec.status_detail:
        parts.append(escape(rec.status_detail))
    if rec.fit_notes:
        parts.append(f"<i>{escape(rec.fit_notes[:400])}</i>")
    if changes:
        parts.append("<b>Resume tweaks</b>\n" + _bullets(changes))
    if reverted:
        parts.append("<b>Blocked edits (kept your original wording)</b>\n" + _bullets(reverted, 4))
    if gaps:
        parts.append("<b>Asked for, not on your resume</b>\n" + _bullets(gaps, 5))
    return "\n\n".join(parts)


def buttons_for(rec: JobRecord):
    if rec.status == JobStatus.AWAITING_APPROVAL:
        return [[("✅ Submit", f"submit:{rec.id}"), ("👤 I'll do it", f"manual:{rec.id}"), ("🗑 Skip", f"skip:{rec.id}")]]
    if rec.status in (JobStatus.NEEDS_HUMAN, JobStatus.UNCERTAIN):
        return [[("✔ I applied", f"manual:{rec.id}"), ("🔁 Try again", f"retry:{rec.id}"), ("🗑 Skip", f"skip:{rec.id}")]]
    if rec.status == JobStatus.FAILED:
        return [[("🔁 Try again", f"retry:{rec.id}"), ("🗑 Skip", f"skip:{rec.id}")]]
    return None


class TelegramNotifier:
    def __init__(self, bot, chat_id: str, full_name: str):
        self.bot = bot
        self.chat_id = chat_id
        self.resume_filename = RESUME_FILENAME.format(name=full_name.replace(" ", "_"))

    def report(self, rec: JobRecord, *, changes=(), reverted=(), gaps=(), cover_letter: str = "") -> None:
        try:
            self.bot.send_message(self.chat_id, job_message(rec, changes, reverted, gaps), buttons_for(rec))
            if rec.resume_pdf and Path(rec.resume_pdf).exists():
                self.bot.send_document(self.chat_id, rec.resume_pdf, "Tailored resume for this job",
                                       filename=self.resume_filename)
            if rec.screenshot and Path(rec.screenshot).exists():
                self.bot.send_photo(self.chat_id, rec.screenshot, "The form as the bot left it")
            if rec.answers and rec.status != JobStatus.SUBMITTED:
                lines = [f"<b>{escape(q[:120])}</b>\n{escape(str(a)[:600])}" for q, a in rec.answers.items()]
                self.bot.send_message(self.chat_id, "<b>Answers used</b> (for copy-paste)\n\n" + "\n\n".join(lines)[:3900])
            if cover_letter and rec.status in (JobStatus.NEEDS_HUMAN, JobStatus.UNCERTAIN, JobStatus.FAILED):
                self.bot.send_message(self.chat_id, "<b>Cover letter</b>\n\n" + escape(cover_letter))
        except Exception:  # noqa: BLE001 - never let a notification failure kill the run
            log.exception("could not send Telegram report for %s", rec.id)

    def text(self, message: str) -> None:
        try:
            self.bot.send_message(self.chat_id, message)
        except Exception:  # noqa: BLE001
            log.exception("could not send Telegram message")


class ConsoleNotifier:
    """Used by the CLI when you run a single URL without Telegram."""

    def report(self, rec: JobRecord, *, changes=(), reverted=(), gaps=(), cover_letter: str = "") -> None:
        import re

        print(re.sub(r"<[^>]+>", "", job_message(rec, changes, reverted, gaps)))
        if rec.resume_pdf:
            print(f"\nResume: {rec.resume_pdf}")
        if rec.screenshot:
            print(f"Screenshot: {rec.screenshot}")
        for q, a in rec.answers.items():
            print(f"  - {q[:80]}: {str(a)[:120]}")
        if cover_letter:
            print("\nCover letter:\n" + cover_letter)

    def text(self, message: str) -> None:
        print(message)
