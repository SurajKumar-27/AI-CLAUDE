from pathlib import Path

import pytest
import yaml

from conftest import EXAMPLE_DATA, FORM_ANSWERS
from jobbot.apply.filler import ApplicationFiller, best_option
from jobbot.models import JobStatus, Profile


@pytest.fixture
def profile():
    return Profile.model_validate(yaml.safe_load((EXAMPLE_DATA / "profile.yaml").read_text()))


@pytest.fixture
def resume_pdf(tmp_path):
    p = tmp_path / "resume.pdf"
    p.write_bytes(b"%PDF-1.4\n%fake\n")
    return str(p)


def run(browser, profile, tmp_path, url, resume_pdf, submit, answers=FORM_ANSWERS):
    return ApplicationFiller(browser, profile, tmp_path).run(url, resume_pdf, None, answers, submit)


def test_best_option():
    assert best_option("1-2 years", ["Less than 1 year", "1-2 years", "3-5 years"]) == "1-2 years"
    assert best_option("yes", ["Yes", "No"]) == "Yes"
    assert best_option("Decline to self-identify", ["Male", "Female", "I decline to self-identify"]) == \
        "I decline to self-identify"


def test_fills_form_after_clicking_apply_dry_run(browser, profile, tmp_path, site, resume_pdf):
    res = run(browser, profile, tmp_path, site["b"] + "/careers/job-123.html", resume_pdf, submit=False)
    assert res.status == JobStatus.READY, res.detail
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


def test_unanswered_required_question_is_reported_not_submitted(browser, profile, tmp_path, site, resume_pdf):
    res = run(browser, profile, tmp_path, site["b"] + "/careers/job-123/apply-hard.html", resume_pdf, submit=True)
    assert res.status == JobStatus.NEEDS_ANSWERS
    assert [f["question"] for f in res.unanswered] == ["Expected CTC (LPA) *"]
    assert "/thanks.html" not in res.final_url
    res2 = run(browser, profile, tmp_path, site["b"] + "/careers/job-123/apply-hard.html", resume_pdf, submit=True,
               answers={**FORM_ANSWERS, "Expected CTC": "12"})
    assert res2.status == JobStatus.SUBMITTED and "ctc=12" in res2.final_url


def test_inspect_lists_questions_without_filling(browser, profile, tmp_path, site):
    form, fields = ApplicationFiller(browser, profile, tmp_path).inspect(site["b"] + "/careers/job-123.html")
    assert form.status == JobStatus.READY and form.final_url.endswith("/apply.html")
    by_q = {f["question"]: f for f in fields}
    assert by_q["Are you legally authorized to work in India? *"]["options"] == ["Yes", "No"]
    assert by_q["Resume/CV *"]["type"] == "file"


def test_login_wall_goes_to_human(browser, profile, tmp_path, site, resume_pdf):
    res = run(browser, profile, tmp_path, site["b"] + "/login.html", resume_pdf, submit=True)
    assert res.status == JobStatus.NEEDS_HUMAN
    assert "log in" in res.detail


def test_known_login_sites_are_not_opened(browser, profile, tmp_path, resume_pdf):
    res = run(browser, profile, tmp_path, "https://www.linkedin.com/jobs/view/123", resume_pdf, submit=True)
    assert res.status == JobStatus.NEEDS_HUMAN


def test_combobox_waits_for_late_suggestions(browser, profile, tmp_path, site, resume_pdf):
    res = run(browser, profile, tmp_path, site["b"] + "/combo.html", resume_pdf, submit=True, answers={})
    assert res.status == JobStatus.SUBMITTED, res.detail
    assert "city=Bengaluru%2C+Karnataka%2C+India" in res.final_url  # profile city, picked from late suggestions


def test_unmatched_combobox_never_submits_the_form(browser, profile, tmp_path, site, resume_pdf):
    # No city starts with "Atlantis": the filler must not press Enter (which would submit).
    res = run(browser, profile, tmp_path, site["b"] + "/combo.html", resume_pdf, submit=False,
              answers={"Location (City)": "Atlantis"})
    assert "/thanks.html" not in res.final_url
    assert res.status == JobStatus.NEEDS_ANSWERS
    assert "Location (City)" not in res.answers
