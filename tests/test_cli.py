"""The whole chat-driven flow against the local fake job site: job -> plan -> resume -> apply."""
import json

from conftest import EXAMPLE_DATA, FORM_ANSWERS
from jobbot.__main__ import main
from jobbot.render import pdf_page_count


def test_link_to_submitted_application(site, tmp_path, monkeypatch, capsys):
    data = tmp_path / "data"
    data.mkdir()
    for f in EXAMPLE_DATA.rglob("*.yaml"):
        dest = data / f.relative_to(EXAMPLE_DATA)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(f.read_text())
    monkeypatch.setenv("JOBBOT_DATA_DIR", str(data))
    monkeypatch.setenv("JOBBOT_WORK_DIR", str(tmp_path / "work"))
    monkeypatch.delenv("JOBBOT_STATE_KEY", raising=False)

    main(["job", site["a"] + "/go/abc", "--id", "t1"])  # shortener -> meta refresh -> blog -> job page
    out = capsys.readouterr().out
    job_dir = tmp_path / "work" / "t1"
    job = json.loads((job_dir / "job.json").read_text())
    assert job["company"] == "Example Corp" and job["confident"]
    assert "full-stack engineer" in (job_dir / "jd.txt").read_text()
    assert "Why do you want to join Example Corp" in out

    main(["plan", "t1", "--base", "fullstack"])
    plan = json.loads((job_dir / "plan.json").read_text())
    plan["summary"] = "Full-stack engineer with 2 years building React and Node.js apps on PostgreSQL."
    plan["skills"][0]["items"] = ["TypeScript", "JavaScript", "GraphQL", "Kafka"]  # Kafka isn't yours
    plan["cover_letter"] = "I build React and Node.js products for 300+ merchants."
    (job_dir / "plan.json").write_text(json.dumps(plan))
    main(["resume", "t1"])
    out = capsys.readouterr().out
    assert "Kafka" in out  # the blocked edit is reported
    pdf = job_dir / "Asha_Rao_Resume.pdf"
    assert pdf_page_count(pdf) == 1 and (job_dir / "Cover_Letter.pdf").exists()
    assert "GraphQL" in (job_dir / "resume.txt").read_text() and "Kafka" not in (job_dir / "resume.txt").read_text()

    main(["apply", "t1"])  # dry run without answers: stops on the questions
    out = capsys.readouterr().out
    assert "needs_answers" in out and "? REQUIRED" in out

    (job_dir / "answers.json").write_text(json.dumps({k: v for k, v in FORM_ANSWERS.items()}))
    main(["apply", "t1", "--submit"])
    out = capsys.readouterr().out
    assert "status:  submitted" in out
    main(["log"])
    assert "Example Corp" in capsys.readouterr().out
