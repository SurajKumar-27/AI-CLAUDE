from pathlib import Path

import pytest
import yaml

from conftest import EXAMPLE_DATA, FakeLLM
from jobbot.apply.filler import ApplicationFiller, best_option
from jobbot.models import JobPosting, JobStatus, Profile


@pytest.fixture
def profile():
    return Profile.model_validate(yaml.safe_load((EXAMPLE_DATA / "profile.yaml").read_text()))


@pytest.fixture
def resume_pdf(tmp_path):
    p = tmp_path / "resume.pdf"
    p.write_bytes(b"%PDF-1.4\n%fake\n")
    return str(p)


def run(browser, profile, tmp_path, url, resume_pdf, submit):
    filler = ApplicationFiller(browser, FakeLLM(), profile, tmp_path)
    posting = JobPosting(url=url, title="Software Engineer", company="Example Corp", description="React Node")
    return filler.run(url, "t", posting, "resume text", resume_pdf, None, submit)


def test_best_option():
    assert best_option("1-2 years", ["Less than 1 year", "1-2 years", "3-5 years"]) == "1-2 years"
    assert best_option("yes", ["Yes", "No"]) == "Yes"
    assert best_option("Decline to self-identify", ["Male", "Female", "I decline to self-identify"]) == \
        "I decline to self-identify"


def test_fills_form_after_clicking_apply_and_waits_for_approval(browser, profile, tmp_path, site, resume_pdf):
    res = run(browser, profile, tmp_path, site["b"] + "/careers/job-123.html", resume_pdf, submit=False)
    assert res.status == JobStatus.AWAITING_APPROVAL, res.detail
    assert res.final_url.endswith("/careers/job-123/apply.html")
    assert res.answers["First Name *"] == "Asha"
    assert res.answers["Email *"] == "asha.rao@example.com"
    assert res.answers["Resume/CV *"] == "resume.pdf"
    assert res.answers["How many years of professional experience do you have with React?"] == "1-2 years"
    assert res.answers["LinkedIn Profile"] == "https://www.linkedin.com/in/example"
    assert Path(res.screenshot).exists()


def test_submits_and_detects_confirmation(browser, profile, tmp_path, site, resume_pdf):
    res = run(browser, profile, tmp_path, site["b"] + "/careers/job-123/apply.html", resume_pdf, submit=True)
    assert res.status == JobStatus.SUBMITTED, res.detail
    assert "/thanks.html?" in res.final_url
    # every field reached the server
    for part in ("first_name=Asha", "last_name=Rao", "email=asha.rao", "yoe=1-2", "auth=yes", "consent=on", "why=I+build"):
        assert part in res.final_url, part


def test_unknown_required_answer_goes_to_human(browser, profile, tmp_path, site, resume_pdf):
    res = run(browser, profile, tmp_path, site["b"] + "/careers/job-123/apply-hard.html", resume_pdf, submit=True)
    assert res.status == JobStatus.NEEDS_HUMAN
    assert "Expected CTC" in res.detail


def test_login_wall_goes_to_human(browser, profile, tmp_path, site, resume_pdf):
    res = run(browser, profile, tmp_path, site["b"] + "/login.html", resume_pdf, submit=True)
    assert res.status == JobStatus.NEEDS_HUMAN
    assert "log in" in res.detail


def test_known_login_sites_are_not_opened(browser, profile, tmp_path, resume_pdf):
    res = run(browser, profile, tmp_path, "https://www.linkedin.com/jobs/view/123", resume_pdf, submit=True)
    assert res.status == JobStatus.NEEDS_HUMAN
