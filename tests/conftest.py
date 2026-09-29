import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from jobbot.tailor import PlanBullet, PlanSkillGroup, TailorPlan, resume_payload

ROOT = Path(__file__).parent
SITE = ROOT / "fixtures" / "site"
EXAMPLE_DATA = ROOT.parent / "data.example"


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

    session = BrowserSession(headless=True, executable_path=os.environ.get("JOBBOT_CHROMIUM_PATH", ""))
    yield session
    session.close()


def identity_plan(resume, **overrides) -> TailorPlan:
    payload = resume_payload(resume)
    bullets = [PlanBullet(id=b["id"], text=b["text"]) for e in payload["experience"] for r in e["roles"]
               for b in r["bullets"]] + [PlanBullet(id=b["id"], text=b["text"]) for p in payload["projects"]
                                          for b in p["bullets"]]
    plan = TailorPlan(summary=resume.summary, skills=[PlanSkillGroup(**g.model_dump()) for g in resume.skills],
                      bullets=bullets, changes=["reordered skills"], missing_requirements=["Kafka"], cover_letter="")
    return plan.model_copy(update=overrides)


# What an answers.json for the fixture form looks like.
FORM_ANSWERS = {
    "years of professional experience do you have with React": "1-2 years",
    "legally authorized to work in India": "Yes",
    "Why do you want to join Example Corp": "I build React and Node.js products.",
    "privacy policy": True,
}
