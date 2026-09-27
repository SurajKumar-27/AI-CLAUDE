#!/usr/bin/env python3
"""Bundle Paperverse into single HTML files.

    python3 paperverse/build.py

dist/paperverse.html  everything inlined (Three.js included); open it straight from disk or email it.
dist/artifact.html    same page with Three.js loaded from a CDN and no <html>/<head>/<body> wrapper,
                      for hosts that wrap the page themselves.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"


def inline(html: str, three: str) -> str:
    def css(m):
        return "<style>\n" + (ROOT / m.group(1)).read_text() + "\n</style>"

    def js(m):
        src = (ROOT / m.group(1)).read_text()
        if "</script" in src.lower():
            raise SystemExit(f"{m.group(1)} contains </script and can't be inlined")
        return "<script>\n" + src + "\n</script>"

    html = re.sub(r"<!-- build:three -->.*?<!-- endbuild -->", lambda _: three, html, flags=re.S)
    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, html)
    html = re.sub(r'<script src="((?:js|vendor)/[^"]+)"></script>', js, html)
    return html


def main() -> None:
    DIST.mkdir(exist_ok=True)
    html = (ROOT / "index.html").read_text()

    standalone = inline(html, '<script src="vendor/three.min.js"></script>')
    (DIST / "paperverse.html").write_text(standalone)

    hosted = inline(html, f'<script src="{THREE_CDN}"></script>')
    head = re.search(r"<head>(.*?)</head>", hosted, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", hosted, re.S).group(1)
    head = re.sub(r'<meta (charset|name="viewport")[^>]*>\s*', "", head)
    title = re.search(r"<title>.*?</title>", head).group(0)
    head = head.replace(title, "")
    (DIST / "artifact.html").write_text(title + "\n" + head.strip() + "\n" + body.strip() + "\n")

    for f in ("paperverse.html", "artifact.html"):
        print(f"dist/{f}: {(DIST / f).stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
