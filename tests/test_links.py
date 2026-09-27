from jobbot.links import (HttpFetcher, LinkResolver, Page, canonical_url, extract_candidates, is_ats,
                          urls_from_bot_message)


def test_urls_from_bot_message_entities_buttons_and_utf16_offsets():
    text = "🔥 Hiring at Acme! Apply: https://bit.ly/acme-job\nJoin us: t.me/jobsgroup\nMore here"
    url_start = len("🔥 Hiring at Acme! Apply: ".encode("utf-16-le")) // 2
    msg = {
        "text": text,
        "entities": [
            {"type": "url", "offset": url_start, "length": len("https://bit.ly/acme-job")},
            {"type": "text_link", "offset": 0, "length": 2, "url": "https://jobs.lever.co/acme/123"},
        ],
        "reply_markup": {"inline_keyboard": [[{"text": "Apply now", "url": "https://boards.greenhouse.io/acme/jobs/9"},
                                              {"text": "Share", "url": "https://t.me/share/url?url=x"}]]},
    }
    urls = urls_from_bot_message(msg)
    assert urls == ["https://jobs.lever.co/acme/123", "https://bit.ly/acme-job",
                    "https://boards.greenhouse.io/acme/jobs/9"]


def test_linkedin_profiles_ignored_but_jobs_kept():
    msg = {"text": "https://www.linkedin.com/in/someone https://www.linkedin.com/jobs/view/12345 "
                   "https://www.youtube.com/watch?v=1"}
    assert urls_from_bot_message(msg) == ["https://www.linkedin.com/jobs/view/12345"]


def test_canonical_url_drops_tracking():
    assert canonical_url("https://Jobs.Lever.co/acme/1/?utm_source=tg&lever-source=x#top") == \
        "https://jobs.lever.co/acme/1?lever-source=x"


def test_ats_detection():
    assert is_ats("https://job-boards.greenhouse.io/acme/jobs/1")
    assert is_ats("https://acme.wd5.myworkdayjobs.com/en-US/careers/job/x")
    assert not is_ats("https://freshersjobs.example.com/acme-hiring")


def test_candidates_prefer_apply_link_over_noise(site):
    page = HttpFetcher().get(site["a"] + "/aggregator.html")
    cands = extract_candidates(page)
    assert cands[0].url.startswith(site["b"] + "/careers/job-123.html")
    assert all("t.me" not in c.url and "facebook" not in c.url for c in cands)


def test_resolver_follows_redirect_meta_refresh_and_page_link(site):
    res = LinkResolver(HttpFetcher()).resolve(site["a"] + "/go/abc")
    assert res.url.startswith(site["b"] + "/careers/job-123.html")
    assert res.confident
    assert any(u.endswith("/aggregator.html") for u in res.chain)


def test_resolver_stops_on_job_page(site):
    res = LinkResolver(HttpFetcher()).resolve(site["b"] + "/careers/job-123.html")
    # The only offsite-looking candidate is the apply form on the same site: stay on the job page
    # or go to its apply form; both are the job.
    assert "/careers/job-123" in res.url
    assert res.confident


def test_resolver_embedded_target_param():
    class NoFetch:
        def get(self, url):
            raise AssertionError("should not fetch an ATS url")

    res = LinkResolver(NoFetch()).resolve(
        "https://tracker.example.com/out?url=https%3A%2F%2Fjobs.lever.co%2Facme%2F42")
    assert res.url == "https://jobs.lever.co/acme/42"


def test_resolver_uses_llm_when_ambiguous():
    html = """<html><body><article>
      <p><a href="https://acme.example.org/careers/1">Apply here</a></p>
      <p><a href="https://other.example.net/careers/2">Apply here</a></p>
    </article></body></html>"""

    class OnePage:
        def get(self, url):
            return Page(url="https://blog.example.com/post", html=html, redirects=["https://blog.example.com/post"])

    class Picker:
        def structured(self, **kw):
            from jobbot.links import LinkChoice

            return LinkChoice(index=1, reason="the second one")

    class Stop:
        def __init__(self):
            self.n = 0

        def get(self, url):
            self.n += 1
            if self.n == 1:
                return OnePage().get(url)
            return Page(url=url, html="<html><body>job</body></html>", redirects=[url])

    res = LinkResolver(Stop(), llm=Picker()).resolve("https://blog.example.com/post")
    assert res.url == "https://other.example.net/careers/2"
    assert res.method == "llm-pick"
