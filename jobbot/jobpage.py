"""Get the job description off the job page."""
from __future__ import annotations

import re

from bs4 import BeautifulSoup

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
    if not posting.title:
        og = soup.find("meta", property="og:title")
        posting.title = (og.get("content") if og else "") or (soup.title.get_text(strip=True) if soup.title else "")
    # Greenhouse-style page titles: "Job Application for <role> at <company>"
    for cand in (posting.title, soup.title.get_text(strip=True) if soup.title else ""):
        m = re.match(r"^(?:job application for\s+)?(.+?)\s+at\s+(.+?)$", cand, re.I)
        if m and not posting.company:
            posting.title, posting.company = m.group(1).strip(), m.group(2).strip()
    if not posting.company:
        site = soup.find("meta", property="og:site_name")
        posting.company = site.get("content", "").strip() if site else ""
    posting.description = posting.description[:MAX_JD_CHARS]
    return posting
