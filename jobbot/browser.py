"""One shared headless Chromium for rendering pages, filling forms and printing PDFs."""
from __future__ import annotations

import glob
import logging

from playwright.sync_api import Browser, BrowserContext, sync_playwright

from .links import BROWSER_HEADERS, Page

log = logging.getLogger(__name__)


def preinstalled_chromium() -> str:
    """A Chromium already on the machine (cloud sessions ship one under /opt/pw-browsers)."""
    found = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
    return found[-1] if found else ""


class BrowserSession:
    def __init__(self, headless: bool = True, executable_path: str = ""):
        self._pw = sync_playwright().start()
        kwargs = {"headless": headless, "args": ["--disable-blink-features=AutomationControlled"]}
        try:
            if executable_path:
                kwargs["executable_path"] = executable_path
            self.browser: Browser = self._pw.chromium.launch(**kwargs)
        except Exception:
            # Playwright's own browser build isn't downloaded: fall back to the preinstalled one.
            fallback = preinstalled_chromium()
            if not fallback or kwargs.get("executable_path") == fallback:
                self._pw.stop()
                raise
            kwargs["executable_path"] = fallback
            self.browser = self._pw.chromium.launch(**kwargs)

    def new_context(self) -> BrowserContext:
        return self.browser.new_context(
            user_agent=BROWSER_HEADERS["User-Agent"],
            locale="en-US",
            viewport={"width": 1366, "height": 900},
        )

    def close(self) -> None:
        try:
            self.browser.close()
        finally:
            self._pw.stop()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class RenderFetcher:
    """Fetcher that runs page JavaScript, for pages that inject their links late."""

    def __init__(self, session: BrowserSession, settle_ms: int = 4000):
        self.session = session
        self.settle_ms = settle_ms

    def get(self, url: str) -> Page:
        ctx = self.session.new_context()
        try:
            page = ctx.new_page()
            redirects: list[str] = []
            page.on("framenavigated", lambda f: f == page.main_frame and redirects.append(f.url))
            response = page.goto(url, wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_load_state("networkidle", timeout=self.settle_ms + 6000)
            except Exception:  # noqa: BLE001 - busy pages never go idle; that's fine
                pass
            page.wait_for_timeout(self.settle_ms)  # countdown-style "your link is ready" pages
            return Page(url=page.url, html=page.content(), status=response.status if response else 0,
                        redirects=[r for r in redirects if r.startswith("http")] or [page.url])
        finally:
            ctx.close()
