#!/usr/bin/env python3
"""List recent, popular AI papers that Paperverse doesn't cover yet.

    python3 paperverse/tools/find_candidates.py            # last 21 days, top 25
    python3 paperverse/tools/find_candidates.py --days 10 --top 15 --json

Sources: Hugging Face's trending page and its daily-papers pages for the last few
days (their JSON API is often rate-limited, the HTML pages carry the same data).
Papers whose arXiv id already appears in js/papers/*.js are skipped. Popularity
is only a starting signal: the routine still reads each candidate before choosing.
"""
import argparse
import datetime as dt
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (paperverse candidate finder)"}


def covered_ids() -> set:
    ids = set()
    for f in (ROOT / "js" / "papers").glob("*.js"):
        ids.update(re.findall(r'arxiv:\s*"(\d{4}\.\d{4,5})"', f.read_text()))
    return ids


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def papers_from_hf_page(url: str, source: str):
    try:
        page = fetch(url)
    except Exception as e:  # network or rate limit: report and carry on with other sources
        print(f"warning: {url}: {e}", file=sys.stderr)
        return []
    out = []
    for raw in re.findall(r'data-props="([^"]*)"', page):
        props = html.unescape(raw)
        if '"dailyPapers"' not in props:
            continue
        for item in json.loads(props).get("dailyPapers", []):
            p = item.get("paper", item)
            if not re.fullmatch(r"\d{4}\.\d{4,5}", p.get("id", "")):
                continue
            out.append({
                "id": p["id"],
                "title": " ".join(p.get("title", "").split()),
                "upvotes": p.get("upvotes", 0) or 0,
                "published": (p.get("publishedAt") or "")[:10],
                "summary": " ".join((p.get("summary") or "").split())[:600],
                "sources": [source],
            })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=21, help="only papers published in the last N days")
    ap.add_argument("--daily-pages", type=int, default=5, help="how many recent daily-papers pages to scan")
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    today = dt.date.today()
    found = papers_from_hf_page("https://huggingface.co/papers/trending", "hf-trending")
    for d in range(a.daily_pages):
        day = today - dt.timedelta(days=d)
        found += papers_from_hf_page(f"https://huggingface.co/papers/date/{day.isoformat()}", f"hf-daily {day.isoformat()}")

    merged = {}
    for p in found:
        if p["id"] in merged:
            m = merged[p["id"]]
            m["upvotes"] = max(m["upvotes"], p["upvotes"])
            m["sources"] = sorted(set(m["sources"] + p["sources"]))
        else:
            merged[p["id"]] = p

    cutoff = (today - dt.timedelta(days=a.days)).isoformat()
    have = covered_ids()
    fresh = [p for p in merged.values() if p["id"] not in have and (not p["published"] or p["published"] >= cutoff)]
    fresh.sort(key=lambda p: (p["upvotes"], p["published"]), reverse=True)
    fresh = fresh[: a.top]

    if a.json:
        print(json.dumps(fresh, indent=2, ensure_ascii=False))
        return
    print(f"{len(have)} papers already covered · {len(merged)} seen · {len(fresh)} new candidates (since {cutoff})\n")
    for p in fresh:
        print(f"{p['upvotes']:>4} ▲  {p['id']}  {p['published']}  {p['title']}")
        print(f"        https://arxiv.org/abs/{p['id']}   [{', '.join(p['sources'])}]")
    if not fresh:
        print("No candidates found. Fall back to web search (see ROUTINE.md).")


if __name__ == "__main__":
    main()
