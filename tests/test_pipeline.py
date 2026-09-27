import json

import httpx
import pytest

from conftest import EXAMPLE_DATA, FakeLLM, identity_plan
from jobbot.config import Settings, load_profile, load_resumes
from jobbot.links import HttpFetcher, LinkResolver
from jobbot.models import JobStatus
from jobbot.notify import TelegramNotifier
from jobbot.pipeline import Pipeline
from jobbot.render import pdf_page_count
from jobbot.state import State
from jobbot.telegram_bot import TelegramBot


class FakeBot:
    def __init__(self):
        self.messages, self.documents, self.photos = [], [], []

    def send_message(self, chat_id, text, buttons=None, reply_to=None):
        self.messages.append((text, buttons))

    def send_document(self, chat_id, path, caption="", filename=None):
        self.documents.append((str(path), filename))

    def send_photo(self, chat_id, path, caption=""):
        self.photos.append(str(path))


@pytest.fixture
def pipeline(tmp_path, browser):
    settings = Settings(data_dir=EXAMPLE_DATA, state_dir=tmp_path / "state", auto_submit=False)
    profile, resumes = load_profile(settings), load_resumes(settings)
    llm = FakeLLM()
    llm.tailor_plan = identity_plan(resumes["fullstack"], cover_letter="I build React and Node.js products.")
    bot = FakeBot()
    p = Pipeline(settings, llm, browser, profile, resumes, State(settings.state_dir),
                 TelegramNotifier(bot, "1", profile.personal.full_name), LinkResolver(HttpFetcher()))
    return p, bot


def test_post_to_tailored_resume_to_filled_form(pipeline, site):
    p, bot = pipeline
    recs = p.handle_urls([site["a"] + "/go/abc"])  # shortener -> meta refresh -> blog -> job page
    assert len(recs) == 1
    rec = recs[0]
    assert rec.status == JobStatus.AWAITING_APPROVAL, rec.status_detail
    assert rec.company == "Example Corp" and rec.category.value == "fullstack"
    assert rec.job_url.startswith(site["b"] + "/careers/job-123")
    assert pdf_page_count(rec.resume_pdf) == 1
    assert bot.documents[0][1] == "Asha_Rao_Resume.pdf"
    text, buttons = bot.messages[0]
    assert "Ready to submit" in text and "Kafka" in text  # the gap is reported
    assert buttons[0][0] == ("✅ Submit", f"submit:{rec.id}")

    # Same job posted again: ignored.
    assert p.handle_urls([site["a"] + "/aggregator.html"]) == []

    # You tap Submit.
    assert p.handle_action("submit", rec.id).startswith("Done")
    assert p.state.jobs[rec.id].status == JobStatus.SUBMITTED


def test_skip_and_manual_actions(pipeline, site):
    p, _ = pipeline
    rec = p.handle_urls([site["b"] + "/careers/job-123.html"])[0]
    p.handle_action("manual", rec.id)
    assert p.state.jobs[rec.id].status == JobStatus.MANUAL
    assert p.handle_action("submit", rec.id).startswith("Already")


def test_bot_parses_group_posts_dm_links_and_button_taps():
    updates = [
        {"update_id": 10, "message": {"message_id": 1, "chat": {"id": -100123, "type": "supergroup"},
                                      "text": "Apply https://jobs.lever.co/acme/1"}},
        {"update_id": 11, "message": {"message_id": 2, "chat": {"id": -999, "type": "group"},
                                      "text": "other group https://jobs.lever.co/acme/2"}},
        {"update_id": 12, "message": {"message_id": 3, "chat": {"id": 42, "type": "private"},
                                      "text": "https://boards.greenhouse.io/acme/jobs/3"}},
        {"update_id": 13, "callback_query": {"id": "cb1", "from": {"id": 42}, "data": "submit:abc123",
                                             "message": {"message_id": 9, "chat": {"id": 42}}}},
        {"update_id": 14, "callback_query": {"id": "cb2", "from": {"id": 7}, "data": "submit:abc123",
                                             "message": {"message_id": 9, "chat": {"id": 7}}}},
    ]
    seen = []

    def handler(request):
        seen.append(json.loads(request.content or b"{}"))
        return httpx.Response(200, json={"ok": True, "result": updates})

    bot = TelegramBot("T", client=httpx.Client(transport=httpx.MockTransport(handler)))
    batch = bot.parse(bot.get_updates(None), "-100123", "42")
    assert [p.urls for p in batch.posts] == [["https://jobs.lever.co/acme/1"], ["https://boards.greenhouse.io/acme/jobs/3"]]
    assert batch.posts[1].from_owner
    assert [(c.action, c.job_id) for c in batch.callbacks] == [("submit", "abc123")]  # stranger's tap ignored
    assert batch.last_update_id == 14
