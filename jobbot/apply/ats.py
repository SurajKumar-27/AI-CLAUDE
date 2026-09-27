"""What we know about specific job sites."""
from __future__ import annotations

import re

from ..links import host_of

# Sites where applying needs your account (login / sign-up / OTP). The bot never
# creates accounts or stores passwords, so these always come back to you.
LOGIN_REQUIRED_SUFFIXES = (
    "linkedin.com", "naukri.com", "indeed.com", "foundit.in", "instahyre.com", "wellfound.com", "glassdoor.com",
    "glassdoor.co.in", "iimjobs.com", "hirist.tech", "hirist.com", "cutshort.io", "internshala.com", "unstop.com",
    "superset.com", "myworkdayjobs.com", "myworkdaysite.com", "workday.com", "taleo.net", "successfactors.com",
    "successfactors.eu", "oraclecloud.com", "turing.com", "hackerearth.com",
)


def ats_name(url: str) -> str:
    host = host_of(url)
    for name, pat in [
        ("greenhouse", r"greenhouse\.io$"), ("lever", r"lever\.co$"), ("ashby", r"ashbyhq\.com$"),
        ("workday", r"(myworkdayjobs|myworkdaysite|workday)\.com$"), ("smartrecruiters", r"smartrecruiters\.com$"),
        ("workable", r"workable\.com$"), ("recruitee", r"recruitee\.com$"), ("bamboohr", r"bamboohr\.com$"),
        ("icims", r"icims\.com$"), ("linkedin", r"linkedin\.com$"), ("naukri", r"naukri\.com$"),
    ]:
        if re.search(pat, host):
            return name
    return "generic"


def needs_login(url: str) -> bool:
    host = host_of(url)
    return any(host == s or host.endswith("." + s) for s in LOGIN_REQUIRED_SUFFIXES)


def apply_url(url: str) -> str:
    """Jump straight to the application form where the site has a predictable URL for it."""
    name = ats_name(url)
    base = url.split("#")[0].split("?")[0].rstrip("/")
    if name == "lever" and not base.endswith("/apply"):
        return base + "/apply"
    if name == "ashby" and not base.endswith("/application"):
        return base + "/application"
    return url


APPLY_BUTTON_RE = re.compile(r"^\s*(apply( now| for this (job|position|role))?|apply here|i'?m interested|start application)\s*$", re.I)
SUBMIT_BUTTON_RE = re.compile(r"^\s*(submit( application| your application)?|send application|apply|finish|complete application)\s*$", re.I)
NEXT_BUTTON_RE = re.compile(r"^\s*(next|continue|save and continue|save & continue|proceed)\s*(→|>)?\s*$", re.I)
CONFIRMATION_RE = re.compile(
    r"(thank(s| you)[^.]{0,40}(appl|interest|submitt)|application (has been |was )?(received|submitted|sent)|"
    r"we('ve| have) received your application|successfully (applied|submitted)|you('ve| have) applied)",
    re.I,
)
