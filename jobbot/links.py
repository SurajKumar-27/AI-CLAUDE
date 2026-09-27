"""Pull links out of Telegram posts and follow them to the real job page.

Job-group posts usually link one of three ways:
  1. straight to the job (Greenhouse, Lever, a company careers page ...)
  2. through a shortener / tracker (bit.ly, lnkd.in, ...) that redirects there
  3. to an aggregator or blog post whose page contains an "Apply here" link
The resolver handles all three and any combination of them.
"""
from __future__ import annotations

import html as html_lib
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import parse_qs, unquote, urljoin, urlparse, urlunparse, urlencode

from bs4 import BeautifulSoup
from pydantic import BaseModel

log = logging.getLogger(__name__)

URL_RE = re.compile(r"""(?:https?://|www\.)[^\s<>"'()\[\]{}]+""", re.IGNORECASE)

# Hosts that are never the job itself.
IGNORE_HOSTS = {
    "t.me", "telegram.me", "telegram.org", "telegram.dog", "wa.me", "whatsapp.com", "chat.whatsapp.com",
    "youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.com", "twitter.com", "x.com",
    "play.google.com", "apps.apple.com", "pinterest.com", "reddit.com", "discord.gg", "discord.com",
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com",
    "googletagmanager.com", "amazon-adsystem.com", "addtoany.com", "sharethis.com", "gravatar.com",
    "wordpress.org", "wordpress.com", "blogger.com", "feedburner.com", "schema.org", "w3.org",
}

# Applicant-tracking systems and job boards: a link to one of these is the job.
ATS_HOST_SUFFIXES = (
    "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "myworkdaysite.com", "workday.com",
    "smartrecruiters.com", "icims.com", "taleo.net", "successfactors.com", "successfactors.eu",
    "jobvite.com", "bamboohr.com", "recruitee.com", "workable.com", "breezy.hr", "zohorecruit.com",
    "zohorecruit.in", "darwinbox.in", "darwinbox.com", "keka.com", "freshteam.com", "jazzhr.com",
    "applytojob.com", "teamtailor.com", "personio.de", "personio.com", "rippling.com", "ats.rippling.com",
    "oraclecloud.com", "eightfold.ai", "phenompeople.com", "avature.net", "hire.trakstar.com",
    "careers-page.com", "recruiterbox.com", "pinpointhq.com", "gem.com", "dover.com", "wellfound.com",
    "naukri.com", "instahyre.com", "cutshort.io", "hirist.tech", "hirist.com", "foundit.in", "iimjobs.com",
    "indeed.com", "glassdoor.com", "glassdoor.co.in", "turing.com", "uplers.com", "superset.com",
    "unstop.com", "hackerearth.com", "internshala.com", "ycombinator.com", "workatastartup.com",
)
JOBISH_PATH_RE = re.compile(
    r"/(jobs?|careers?|positions?|openings?|opportunit(y|ies)|vacanc(y|ies)|requisitions?|apply|join-us|"
    r"job-details|jobdetails|job_detail)(/|$|\?|-|_)",
    re.IGNORECASE,
)
APPLY_TEXT_RE = re.compile(
    r"\b(apply|application|register|registration|job link|official link|career page|careers page|"
    r"click here|apply here|apply now|link to apply)\b",
    re.IGNORECASE,
)
SHARE_PATH_RE = re.compile(r"(sharer|share\?|/intent/|shareArticle|/share/|/plugins/)", re.IGNORECASE)
TRACKING_PARAMS_RE = re.compile(r"^(utm_|fbclid$|gclid$|ref$|refid$|trk$|trackingid$|src$|source$|mc_)", re.I)
META_REFRESH_RE = re.compile(r"""url\s*=\s*['"]?([^'">\s]+)""", re.IGNORECASE)
JS_REDIRECT_RE = re.compile(
    r"""(?:window\.|document\.)?location(?:\.href)?\s*(?:=|\.replace\(|\.assign\()\s*['"](https?://[^'"]+)['"]""",
    re.IGNORECASE,
)


# ------------------------------------------------------------------ helpers

def host_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def site_of(url: str) -> str:
    """Rough registrable domain: jobs.foo.co.in -> foo.co.in."""
    parts = host_of(url).split(".")
    if len(parts) >= 3 and len(parts[-1]) == 2 and parts[-2] in {"co", "com", "org", "net", "gov", "ac", "edu"}:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _host_matches(host: str, suffixes) -> bool:
    return any(host == s or host.endswith("." + s) for s in suffixes)


def is_ignored(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return True
    host = host_of(url)
    if _host_matches(host, IGNORE_HOSTS):
        return True
    if host.endswith("linkedin.com") and not re.search(r"/jobs?/|/comm/jobs|currentJobId", url):
        return True  # profiles, posts, company pages
    return bool(SHARE_PATH_RE.search(parsed.path + "?" + parsed.query))


def is_ats(url: str) -> bool:
    return _host_matches(host_of(url), ATS_HOST_SUFFIXES)


def looks_like_job_url(url: str) -> bool:
    host = host_of(url)
    if is_ats(url):
        return True
    if host.startswith(("careers.", "jobs.", "career.", "apply.", "join.", "talent.", "hiring.")):
        return True
    return bool(JOBISH_PATH_RE.search(urlparse(url).path))


def canonical_url(url: str) -> str:
    p = urlparse(url.strip())
    query = [(k, v) for k, vs in parse_qs(p.query, keep_blank_values=True).items() for v in vs
             if not TRACKING_PARAMS_RE.match(k)]
    path = p.path.rstrip("/") or "/"
    return urlunparse((p.scheme.lower() or "https", (p.hostname or "").lower() + (f":{p.port}" if p.port else ""),
                       path, "", urlencode(sorted(query)), ""))


def _clean(url: str) -> str:
    url = html_lib.unescape(url.strip()).rstrip(".,;:!?*_~")
    if url.lower().startswith("www."):
        url = "https://" + url
    return url


def _embedded_target(url: str) -> str | None:
    """Tracker links often carry the destination in a query param (?url=https://...)."""
    for key, values in parse_qs(urlparse(url).query).items():
        if key.lower() in {"url", "u", "q", "target", "redirect", "redirect_url", "dest", "destination", "link", "to", "out"}:
            for v in values:
                v = unquote(v)
                if v.startswith(("http://", "https://")):
                    return v
    return None


# ------------------------------------------------------------------ telegram

def _utf16_slice(text: str, offset: int, length: int) -> str:
    raw = text.encode("utf-16-le")
    return raw[offset * 2:(offset + length) * 2].decode("utf-16-le", errors="ignore")


def urls_from_bot_message(message: dict) -> list[str]:
    """All links in a Bot API message: plain URLs, hidden text links and inline buttons."""
    text = message.get("text") or message.get("caption") or ""
    entities = message.get("entities") or message.get("caption_entities") or []
    found: list[str] = []
    for ent in sorted(entities, key=lambda e: e.get("offset", 0)):
        if ent.get("type") == "text_link" and ent.get("url"):
            found.append(ent["url"])
        elif ent.get("type") == "url":
            found.append(_utf16_slice(text, ent["offset"], ent["length"]))
    for row in (message.get("reply_markup") or {}).get("inline_keyboard") or []:
        for button in row:
            if button.get("url"):
                found.append(button["url"])
    found += URL_RE.findall(text)
    return filter_links(found)


def filter_links(urls) -> list[str]:
    out, seen = [], set()
    for u in urls:
        u = _clean(u)
        key = canonical_url(u)
        if key in seen or is_ignored(u):
            continue
        seen.add(key)
        out.append(u)
    return out


# ------------------------------------------------------------------ fetching

@dataclass
class Page:
    url: str  # final URL after redirects
    html: str
    status: int = 200
    redirects: list[str] = field(default_factory=list)


class Fetcher(Protocol):
    def get(self, url: str) -> Page: ...


BROWSER_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/141.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


class HttpFetcher:
    def __init__(self, client=None, timeout: float = 20.0):
        import httpx

        self.client = client or httpx.Client(headers=BROWSER_HEADERS, follow_redirects=True, timeout=timeout)

    def get(self, url: str) -> Page:
        r = self.client.get(url)
        redirects = [str(h.url) for h in r.history] + [str(r.url)]
        ctype = r.headers.get("content-type", "")
        body = r.text if ("html" in ctype or "xml" in ctype or not ctype) else ""
        return Page(url=str(r.url), html=body, status=r.status_code, redirects=redirects)


# ------------------------------------------------------------------ candidates

@dataclass
class Candidate:
    url: str
    text: str
    context: str
    score: int


def _job_posting_ld(soup: BeautifulSoup) -> dict | None:
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        for item in items:
            if isinstance(item, dict) and "JobPosting" in str(item.get("@type")):
                return item
    return None


def page_redirect_target(page: Page) -> str | None:
    """Client-side redirects: <meta refresh> and `location = "..."` scripts."""
    soup = BeautifulSoup(page.html, "html.parser")
    meta = soup.find("meta", attrs={"http-equiv": re.compile("refresh", re.I)})
    if meta and meta.get("content"):
        m = META_REFRESH_RE.search(meta["content"])
        if m:
            return urljoin(page.url, m.group(1))
    if len(soup.get_text(" ", strip=True)) < 400:  # only trust JS redirects on near-empty pages
        m = JS_REDIRECT_RE.search(page.html)
        if m:
            return m.group(1)
    return None


def extract_candidates(page: Page) -> list[Candidate]:
    soup = BeautifulSoup(page.html, "html.parser")
    for junk in soup(["nav", "footer", "header", "aside", "script", "style", "noscript"]):
        junk.decompose()
    page_site = site_of(page.url)
    best: dict[str, Candidate] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        url = _embedded_target(urljoin(page.url, href)) or urljoin(page.url, href)
        if is_ignored(url) or canonical_url(url) == canonical_url(page.url):
            continue
        text = a.get_text(" ", strip=True)[:120]
        parent = a.find_parent(["p", "li", "td", "div", "h2", "h3", "h4", "strong"])
        context = (parent.get_text(" ", strip=True) if parent else text)[:240]

        score = 0
        offsite = site_of(url) != page_site
        if is_ats(url):
            score += 50
        elif looks_like_job_url(url):
            score += 10 if offsite else 3
        if APPLY_TEXT_RE.search(text):
            score += 30
        elif APPLY_TEXT_RE.search(context):
            score += 15
        score += 10 if offsite else -10
        if a.find_parent(class_=re.compile(r"(related|sidebar|widget|comment|menu|breadcrumb|tag)", re.I)):
            score -= 25
        key = canonical_url(url)
        if key not in best or best[key].score < score:
            best[key] = Candidate(url=url, text=text, context=context, score=score)
    return sorted(best.values(), key=lambda c: c.score, reverse=True)


# ------------------------------------------------------------------ resolve

class LinkChoice(BaseModel):
    index: int  # -1 when none of the candidates is the job
    reason: str


PICK_SYSTEM = (
    "You pick which link on a web page leads to the actual job posting or application form. "
    "The page is usually a job-aggregator or blog post that summarises a job and links out to it. "
    "Return index -1 if none of the links is the job."
)


@dataclass
class Resolved:
    url: str
    chain: list[str]
    method: str  # direct | redirect | page-link | llm-pick | unresolved
    confident: bool


class LinkResolver:
    def __init__(self, fetcher: Fetcher, renderer: Fetcher | None = None, llm=None, max_hops: int = 4):
        self.fetcher = fetcher
        self.renderer = renderer  # a JS-capable fetcher, used when static HTML has no link
        self.llm = llm
        self.max_hops = max_hops

    def resolve(self, url: str) -> Resolved:
        chain = [url]
        current = _embedded_target(url) or url
        method = "direct"
        for _ in range(self.max_hops):
            if is_ats(current):
                return Resolved(current, _dedupe(chain + [current]), method, True)
            try:
                page = self.fetcher.get(current)
            except Exception as e:  # noqa: BLE001 - network errors of every flavour
                log.warning("fetch failed for %s: %s", current, e)
                return Resolved(current, _dedupe(chain + [current]), "unresolved", False)
            chain += page.redirects or [page.url]
            if canonical_url(page.url) != canonical_url(current):
                method = "redirect" if method == "direct" else method
            current = page.url
            if is_ats(current):
                return Resolved(current, _dedupe(chain), method, True)

            target = page_redirect_target(page)
            if target and canonical_url(target) != canonical_url(current):
                current, method = target, "redirect"
                chain.append(target)
                continue

            candidates = extract_candidates(page)
            if not any(c.score >= 25 for c in candidates) and self.renderer is not None:
                try:
                    rendered = self.renderer.get(current)
                    candidates = extract_candidates(rendered)
                    page = rendered
                except Exception as e:  # noqa: BLE001
                    log.warning("render failed for %s: %s", current, e)

            soup = BeautifulSoup(page.html, "html.parser")
            is_posting = _job_posting_ld(soup) is not None
            strong = [c for c in candidates if c.score >= 40]
            nxt = None
            if strong and (len(strong) == 1 or strong[0].score - strong[1].score >= 15):
                nxt, method = strong[0].url, "page-link"
            elif candidates and self.llm is not None and not (is_posting and looks_like_job_url(current)):
                nxt = self._llm_pick(page, candidates[:15])
                method = "llm-pick" if nxt else method
            elif strong:
                nxt, method = strong[0].url, "page-link"

            if nxt is None:
                # Nothing to follow: this page is the job if it looks like one.
                confident = is_posting or looks_like_job_url(current)
                return Resolved(current, _dedupe(chain), method if confident else "unresolved", confident)
            chain.append(nxt)
            current = nxt
        return Resolved(current, _dedupe(chain), method, looks_like_job_url(current))

    def _llm_pick(self, page: Page, candidates: list[Candidate]) -> str | None:
        soup = BeautifulSoup(page.html, "html.parser")
        title = soup.title.get_text(strip=True) if soup.title else ""
        listing = "\n".join(
            f"[{i}] url={c.url}\n    text={c.text!r}\n    context={c.context!r}" for i, c in enumerate(candidates)
        )
        try:
            choice = self.llm.structured(
                system=PICK_SYSTEM,
                user=f"Page URL: {page.url}\nPage title: {title}\n\nLinks:\n{listing}",
                schema=LinkChoice, effort="low", max_tokens=8000,
            )
        except Exception as e:  # noqa: BLE001
            log.warning("LLM link pick failed: %s", e)
            return None
        if 0 <= choice.index < len(candidates):
            return candidates[choice.index].url
        return None


def _dedupe(items: list[str]) -> list[str]:
    out: list[str] = []
    for i in items:
        if not out or canonical_url(out[-1]) != canonical_url(i):
            out.append(i)
    return out
