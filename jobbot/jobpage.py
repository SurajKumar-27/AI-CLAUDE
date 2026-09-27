"""Get the job description off the job page and decide which resume fits it."""
from __future__ import annotations

import re
from typing import Literal

from bs4 import BeautifulSoup
from pydantic import BaseModel

from .links import Page, _job_posting_ld
from .models import JobPosting

MAX_JD_CHARS = 30000


def _text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for junk in soup(["script", "style", "noscript", "svg", "nav", "footer", "iframe"]):
        junk.decompose()
    text = soup.get_text("\n", strip=True)
    return re.sub(r"\n{3,}", "\n\n", text)


def extract_posting(page: Page) -> JobPosting:
    soup = BeautifulSoup(page.html, "html.parser")
    ld = _job_posting_ld(soup)
    posting = JobPosting(url=page.url)
    if ld:
        org = ld.get("hiringOrganization") or {}
        loc = ld.get("jobLocation") or {}
        if isinstance(loc, list):
            loc = loc[0] if loc else {}
        addr = (loc.get("address") or {}) if isinstance(loc, dict) else {}
        if isinstance(addr, str):
            addr = {"addressLocality": addr}
        posting.title = str(ld.get("title") or "")
        posting.company = str(org.get("name") if isinstance(org, dict) else org or "")
        posting.location = ", ".join(str(addr.get(k)) for k in ("addressLocality", "addressRegion", "addressCountry")
                                     if addr.get(k) and isinstance(addr.get(k), str))
        posting.description = _text(str(ld.get("description") or ""))
    if len(posting.description) < 300:
        posting.description = _text(page.html)
    if not posting.title and soup.title:
        posting.title = soup.title.get_text(strip=True)
    posting.description = posting.description[:MAX_JD_CHARS]
    return posting


class JobAnalysis(BaseModel):
    is_job_posting: bool
    title: str
    company: str
    location: str
    category: Literal["fullstack", "ai", "other"]
    category_reason: str
    key_requirements: list[str]
    years_required: str
    fit_score: int  # 0-100
    fit_notes: str


CLASSIFY_SYSTEM = """You screen job postings for one candidate and route each to one of three resumes.

Categories:
- "fullstack": full-stack, backend or frontend web development where the main stack is JavaScript/TypeScript, Node.js, React, Python web frameworks (FastAPI/Django/Flask), REST APIs and microservices.
- "ai": roles centred on AI/ML/LLM work: GenAI, RAG, agents, LLM integration, NLP, ML engineering, data science, prompt engineering.
- "other": everything else, e.g. Java/Spring Boot backend, .NET, Go, mobile, DevOps/SRE, data engineering, QA/SDET, embedded, or generic SDE roles with no clear stack.

When a role mixes categories, choose the one the posting emphasises most (title first, then the required skills).
fit_score is how well the candidate's resume matches the posting's hard requirements (skills and years of experience), 0-100. Be honest; low scores are useful.
If the page is not a job posting (an expired listing, a login wall, a generic careers homepage, an article), set is_job_posting false."""


def analyze(llm, posting: JobPosting, resume_text: str) -> JobAnalysis:
    user = (
        f"<candidate_resume>\n{resume_text}\n</candidate_resume>\n\n"
        f"<job_page url=\"{posting.url}\">\nTitle (from page): {posting.title}\n"
        f"Company (from page): {posting.company}\nLocation (from page): {posting.location}\n\n"
        f"{posting.description}\n</job_page>"
    )
    return llm.structured(system=CLASSIFY_SYSTEM, user=user, schema=JobAnalysis, max_tokens=16000)
