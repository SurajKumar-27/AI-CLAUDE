import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from jobbot.apply.fields import FieldAnswer, FormAnswers
from jobbot.jobpage import JobAnalysis
from jobbot.links import LinkChoice
from jobbot.tailor import PlanBullet, PlanSkillGroup, TailorPlan, resume_payload

ROOT = Path(__file__).parent
SITE = ROOT / "fixtures" / "site"
EXAMPLE_DATA = ROOT.parent / "data.example"


def chromium_path() -> str:
    """Use a preinstalled Chromium when Playwright's bundled one isn't downloaded."""
    if os.environ.get("JOBBOT_CHROMIUM_PATH"):
        return os.environ["JOBBOT_CHROMIUM_PATH"]
    for cand in Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"):
        return str(cand)
    return ""


class _Handler(SimpleHTTPRequestHandler):
    other = ""

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith("/go/"):
            self.send_response(302)
            self.send_header("Location", "/meta.html")
            self.end_headers()
            return
        path = SITE / self.path.split("?")[0].lstrip("/")
        if path.is_file() and path.suffix == ".html":
            body = path.read_text().replace("__OTHER__", self.other).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


@pytest.fixture(scope="session")
def site():
    """Serves the fixture site. 127.0.0.1 and localhost count as different sites."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(_Handler, directory=str(SITE)))
    port = server.server_address[1]
    _Handler.other = f"http://localhost:{port}"
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    yield {"a": f"http://127.0.0.1:{port}", "b": f"http://localhost:{port}"}
    server.shutdown()


@pytest.fixture(scope="session")
def browser():
    from jobbot.browser import BrowserSession

    session = BrowserSession(headless=True, executable_path=chromium_path())
    yield session
    session.close()


class FakeLLM:
    """Stands in for Claude; answers each structured request from simple rules."""

    def __init__(self, category="fullstack", unknown_questions=("ctc",)):
        self.category = category
        self.unknown = unknown_questions
        self.calls = []

    def structured(self, *, system, user, schema, effort=None, max_tokens=16000):
        self.calls.append(schema.__name__)
        if schema is JobAnalysis:
            return JobAnalysis(is_job_posting=True, title="Software Engineer, Full Stack", company="Example Corp",
                               location="Bengaluru", category=self.category, category_reason="React + Node",
                               key_requirements=["React", "Node.js"], years_required="2+", fit_score=80,
                               fit_notes="Strong match on React/Node.")
        if schema is TailorPlan:
            return self.tailor_plan
        if schema is LinkChoice:
            return LinkChoice(index=0, reason="first")
        if schema is FormAnswers:
            import json
            import re

            fields = json.loads(re.search(r"<form_fields>\n(.*)\n</form_fields>", user, re.S).group(1))
            answers = []
            for f in fields:
                q = f["question"].lower()
                if any(u in q for u in self.unknown):
                    answers.append(FieldAnswer(key=f["key"], answer=None, options=[], confident=False))
                elif "years" in q:
                    answers.append(FieldAnswer(key=f["key"], answer="1-2 years", options=[], confident=True))
                elif "authorized" in q:
                    answers.append(FieldAnswer(key=f["key"], answer="Yes", options=[], confident=True))
                elif "privacy" in q or "agree" in q:
                    answers.append(FieldAnswer(key=f["key"], answer="Yes", options=[], confident=True))
                elif "why" in q:
                    answers.append(FieldAnswer(key=f["key"], answer="I build React and Node.js products.",
                                               options=[], confident=True))
                else:
                    answers.append(FieldAnswer(key=f["key"], answer=None, options=[], confident=False))
            return FormAnswers(answers=answers)
        raise AssertionError(f"unexpected schema {schema}")

    tailor_plan = None


def identity_plan(resume, **overrides) -> TailorPlan:
    payload = resume_payload(resume)
    bullets = [PlanBullet(id=b["id"], text=b["text"]) for e in payload["experience"] for r in e["roles"]
               for b in r["bullets"]] + [PlanBullet(id=b["id"], text=b["text"]) for p in payload["projects"]
                                          for b in p["bullets"]]
    plan = TailorPlan(summary=resume.summary, skills=[PlanSkillGroup(**g.model_dump()) for g in resume.skills],
                      bullets=bullets, changes=["reordered skills"], missing_requirements=["Kafka"], cover_letter="")
    return plan.model_copy(update=overrides)
