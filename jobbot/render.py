"""Render a Resume to a one-page A4 PDF (and plain text for cover letters)."""
from __future__ import annotations

import io
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from pypdf import PdfReader

from .models import Profile, Resume

TEMPLATES = Path(__file__).parent / "templates"
_env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(["html", "j2"]))

# Tried in order until the resume fits on one page.
LAYOUTS = [(10.5, 6.0), (10.2, 5.0), (10.0, 4.5), (9.7, 4.0), (9.4, 3.5), (9.1, 3.0)]


def resume_html(resume: Resume, profile: Profile, font_pt: float = 10.5, gap_pt: float = 6.0) -> str:
    return _env.get_template("resume.html.j2").render(r=resume, p=profile.personal, font_pt=font_pt, gap_pt=gap_pt)


def _pdf_bytes(browser_session, html: str) -> bytes:
    ctx = browser_session.new_context()
    try:
        page = ctx.new_page()
        page.set_content(html, wait_until="load")
        return page.pdf(format="A4", print_background=True, prefer_css_page_size=True)
    finally:
        ctx.close()


def render_resume_pdf(browser_session, resume: Resume, profile: Profile, out_path: Path) -> Path:
    data = b""
    for font_pt, gap_pt in LAYOUTS:
        data = _pdf_bytes(browser_session, resume_html(resume, profile, font_pt, gap_pt))
        if len(PdfReader(io.BytesIO(data)).pages) == 1:
            break
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(data)
    return out_path


def pdf_page_count(path: Path) -> int:
    return len(PdfReader(str(path)).pages)


def text_to_pdf(browser_session, text: str, profile: Profile, out_path: Path) -> Path:
    """Cover letter as a simple PDF, for forms that only accept a file."""
    from html import escape

    paras = "".join(f"<p>{escape(p)}</p>" for p in text.split("\n\n") if p.strip())
    html = (
        "<!doctype html><meta charset='utf-8'><style>@page{size:A4;margin:0.9in}"
        "body{font-family:'Latin Modern Roman','Times New Roman','Liberation Serif',serif;font-size:11.5pt;line-height:1.45}"
        "</style>"
        f"<p><b>{escape(profile.personal.full_name)}</b><br>{escape(profile.personal.email)} | "
        f"{escape(profile.personal.phone)}</p>{paras}<p>Sincerely,<br>{escape(profile.personal.full_name)}</p>"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(_pdf_bytes(browser_session, html))
    return out_path
