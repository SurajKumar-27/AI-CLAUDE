#!/usr/bin/env python3
"""Fetch new jobs from freehire for the job dashboard. Standard library only.

    python3 scripts/fetch_jobs.py --prev old/jobs.json --out jobs.json

Searches Hyderabad, Bengaluru and Chennai plus remote jobs anywhere in India,
for tech roles asking at most MAX_YEARS of experience. Merges the result with
--prev (the file the dashboard currently serves), so each job keeps the time it
was first seen, and drops jobs older than KEEP_DAYS. Every run also rechecks
each remaining job with freehire and removes the ones whose posting has closed or
disappeared, so only jobs you can still apply to stay on the dashboard.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://freehire.me/api/v1/jobs/search"
MCP = "https://freehire.me/api/v1/mcp"  # hosts check_jobs_open (no REST equivalent)
UA = "job-dashboard/1.0"
CITIES = ["Hyderabad", "Bengaluru", "Bangalore", "Chennai"]
CATEGORIES = ["backend", "fullstack", "software_engineering", "ai_engineering", "ml_ai", "frontend",
              "data_engineering", "data_science", "devops", "sre", "mobile", "qa"]
MAX_YEARS = 3
SENIOR = ["senior", "lead", "staff", "principal", "c_level"]
KEEP_DAYS = 21
# freehire skill slugs on Suraj's resumes; drives the "match" score.
MY_SKILLS = ["python", "fastapi", "nodejs", "typescript", "javascript", "react", "express", "java", "spring", "sql",
             "postgresql", "mysql", "redis", "aws", "docker", "kubernetes", "ci-cd", "rest", "microservices", "llm",
             "rag", "langgraph", "langchain", "agentic-ai", "generative-ai", "nlp", "mcp", "prompt-engineering",
             "websockets", "machine-learning", "computer-vision", "git", "linux", "html", "css", "postman", "jira"]
# Generic tags that every posting carries; they shouldn't count as a match.
NOT_A_MATCH = {"git", "jira", "linux", "html", "css", "postman"}


def get(params: list[tuple[str, str]], retries: int = 3) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 - network hiccups: retry, then give up loudly
            if attempt == retries - 1:
                raise RuntimeError(f"freehire request failed: {e}") from e
            time.sleep(3 * (attempt + 1))
    raise AssertionError


def search(geo: list[tuple[str, str]], within_days: int) -> list[dict]:
    base = geo + [("is_tech", "tech"), ("experience_years_max", str(MAX_YEARS)), ("role_type_exclude", "people_manager"),
                  ("open_within_days", str(within_days)), ("limit", "100")]
    base += [("category", c) for c in CATEGORIES] + [("seniority_exclude", s) for s in SENIOR]
    out, offset = [], 0
    while True:
        page = get(base + [("offset", str(offset))])
        ignored = (page.get("meta") or {}).get("ignored_params")
        if ignored:
            raise RuntimeError(f"freehire ignored filters {ignored}; fix the query before trusting results")
        out += page.get("data") or []
        total = (page.get("meta") or {}).get("total", 0)
        offset += 100
        if offset >= total or offset + 100 > 10000 or not page.get("data"):
            return out


def still_open(slugs: list[str]) -> dict[str, str]:
    """freehire's verdict per slug: open, closed or not_found. Slugs it couldn't check are left out."""
    verdict: dict[str, str] = {}
    for i in range(0, len(slugs), 50):
        body = {"jsonrpc": "2.0", "id": i, "method": "tools/call",
                "params": {"name": "check_jobs_open", "arguments": {"slugs": slugs[i:i + 50]}}}
        req = urllib.request.Request(MCP, data=json.dumps(body).encode(), headers={
            "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode()
        except Exception as e:  # noqa: BLE001 - on failure keep the jobs; never drop on doubt
            print(f"open-check failed for a batch ({e}); keeping those jobs", file=sys.stderr)
            continue
        for line in raw.splitlines():
            line = line[5:] if line.startswith("data:") else line
            try:
                result = json.loads(line).get("result") or {}
            except ValueError:
                continue
            for item in (result.get("structuredContent") or {}).get("jobs", []):
                if item.get("slug") and item.get("status"):
                    verdict[item["slug"]] = item["status"]
    return verdict


def clean_url(url: str) -> str:
    p = urllib.parse.urlsplit(url)
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not k.lower().startswith("utm_")]
    return urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, urllib.parse.urlencode(q), p.fragment))


def summary_of(job: dict) -> str:
    e = job.get("enrichment") or {}
    if e.get("summary"):
        return e["summary"][:420]
    text = re.sub(r"<[^>]+>", " ", html.unescape(job.get("description") or ""))
    return re.sub(r"\s+", " ", text).strip()[:420]


def where(job: dict) -> list[str]:
    places = set()
    text = " ".join([job.get("location") or ""] + (job.get("cities") or []))
    for city, keys in (("Hyderabad", ("hyderabad",)), ("Bengaluru", ("bengaluru", "bangalore")), ("Chennai", ("chennai",))):
        if any(k in text.lower() for k in keys):
            places.add(city)
    if job.get("work_mode") == "remote":
        places.add("Remote")
    return sorted(places)


def record(job: dict, now: str) -> dict:
    e = job.get("enrichment") or {}
    skills = job.get("skills") or []
    mine = [s for s in skills if s in MY_SKILLS and s not in NOT_A_MATCH]
    return {
        "id": job["public_slug"], "title": job.get("title") or "", "company": job.get("company") or "",
        "location": job.get("location") or "", "places": where(job), "work_mode": job.get("work_mode") or "",
        "category": e.get("category") or "", "seniority": e.get("seniority") or "",
        "years": e.get("experience_years_min"), "employment": e.get("employment_type") or "",
        "skills": skills[:24], "matched": mine, "match": len(mine),
        "salary_min": e.get("salary_min"), "salary_max": e.get("salary_max"),
        "salary_currency": e.get("salary_currency") or "", "salary_period": e.get("salary_period") or "",
        "posted_at": job.get("posted_at") or job.get("created_at") or "", "first_seen": now,
        "url": clean_url(job.get("url") or ""), "source": job.get("source") or "",
        "freshness": (job.get("reality") or {}).get("class") or "", "summary": summary_of(job),
        "company_type": e.get("company_type") or "", "domains": e.get("domains") or [],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prev", help="the dashboard's current jobs.json (optional)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--days", type=int, help="look back this many days (default: 3, or 14 without --prev)")
    args = ap.parse_args()

    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat(timespec="seconds")
    prev = {}
    if args.prev:
        try:
            prev = {j["id"]: j for j in json.load(open(args.prev, encoding="utf-8")).get("jobs", [])}
        except (OSError, ValueError, KeyError) as e:
            print(f"ignoring unreadable --prev ({e})", file=sys.stderr)
    days = args.days or (3 if prev else 14)

    found: dict[str, dict] = {}
    for geo in ([("cities", c) for c in CITIES], [("countries", "in"), ("work_mode", "remote")]):
        for job in search(geo, days):
            if job.get("closed_at"):
                continue
            rec = record(job, now)
            if not rec["places"] or not rec["url"]:
                continue
            found[rec["id"]] = rec

    cutoff = now_dt - timedelta(days=KEEP_DAYS)
    merged, new = {}, 0
    for jid, old in prev.items():
        if datetime.fromisoformat(old["first_seen"]) >= cutoff:
            merged[jid] = old
    for jid, rec in found.items():
        if jid in merged:
            rec["first_seen"] = merged[jid]["first_seen"]
        else:
            new += 1
        merged[jid] = rec

    # Drop postings that closed or vanished since they were added. Jobs fetched just now are open by definition.
    verdict = still_open([jid for jid in merged if jid not in found])
    gone = [jid for jid, v in verdict.items() if v in ("closed", "not_found")]
    for jid in gone:
        merged.pop(jid, None)

    jobs = sorted(merged.values(), key=lambda j: (j["first_seen"], j["posted_at"]), reverse=True)
    out = {"generated_at": now, "source": "freehire.me (github.com/strelov1/freehire)",
           "criteria": {"cities": ["Hyderabad", "Bengaluru", "Chennai"], "remote": "India", "max_years": MAX_YEARS,
                        "categories": CATEGORIES, "excluded_seniority": SENIOR, "keep_days": KEEP_DAYS},
           "my_skills": [s for s in MY_SKILLS if s not in NOT_A_MATCH], "new_this_run": new, "closed_removed": len(gone), "jobs": jobs}
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(jobs)} jobs ({new} new, {len(gone)} closed removed, {len(found)} fetched in the last {days} days, "
          f"{len(verdict)} rechecked) -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
