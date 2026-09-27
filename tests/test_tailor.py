import yaml

from conftest import EXAMPLE_DATA, identity_plan
from jobbot.models import Resume
from jobbot.tailor import PlanBullet, PlanSkillGroup, TechVocabulary, apply_plan, numbers_in


def load(name):
    return Resume.model_validate(yaml.safe_load((EXAMPLE_DATA / "resumes" / f"{name}.yaml").read_text()))


def bullets_of(plan):
    return {b.id: b.text for b in plan.bullets}


def test_numbers_and_vocab():
    assert numbers_in("cut 1,000+ users by 20% in 2.5 days") == {"1000", "20", "2.5"}
    v = TechVocabulary(["Spring Boot", "Spring", "REST", "Node.js"])
    assert v.find("Built REST APIs with Spring Boot") == {"springboot", "rest"}
    assert v.find("the rest of the team") == set()  # short acronyms are case-sensitive


def test_rewording_same_facts_is_kept():
    base = load("fullstack")
    b = bullets_of(identity_plan(base))
    b["e0r0b1"] = "Designed RESTful APIs in Express.js on PostgreSQL with Redis caching."
    plan = identity_plan(base, bullets=[PlanBullet(id=k, text=v) for k, v in b.items()])
    out = apply_plan(base, plan)
    assert out.resume.experience[0].roles[0].bullets[1] == b["e0r0b1"]
    assert not out.reverted


def test_new_number_or_technology_is_reverted():
    base = load("fullstack")
    b = bullets_of(identity_plan(base))
    b["e0r0b0"] = b["e0r0b0"].replace("300+", "3,000+")  # inflated metric
    b["e0r0b2"] = "Containerized services with Docker and Kubernetes and deployed them on AWS EC2."  # new tech
    plan = identity_plan(base, bullets=[PlanBullet(id=k, text=v) for k, v in b.items()])
    out = apply_plan(base, plan)
    role = out.resume.experience[0].roles[0]
    assert role.bullets[0] == base.experience[0].roles[0].bullets[0]
    assert role.bullets[2] == base.experience[0].roles[0].bullets[2]
    assert len(out.reverted) == 2


def test_bullets_reordered_within_role_and_missing_ids_kept():
    base = load("fullstack")
    plan = identity_plan(base, bullets=[PlanBullet(id="e0r0b2", text=base.experience[0].roles[0].bullets[2])])
    out = apply_plan(base, plan)
    got = out.resume.experience[0].roles[0].bullets
    orig = base.experience[0].roles[0].bullets
    assert got == [orig[2], orig[0], orig[1]]
    assert out.resume.projects[0].bullets == base.projects[0].bullets


def test_skills_only_from_resumes_or_extra_skills():
    base, ai = load("fullstack"), load("ai")
    plan = identity_plan(base, skills=[
        PlanSkillGroup(label="Backend", items=["Spring Boot", "Node.js", "Kafka", "GraphQL", "LangChain"]),
    ])
    out = apply_plan(base, plan, other_resumes=[ai], extra_skills=["GraphQL"])
    items = out.resume.skills[0].items
    assert items == ["Spring Boot", "Node.js", "GraphQL", "LangChain"]  # Kafka was never claimed
    assert any("Kafka" in r for r in out.reverted)


def test_summary_with_unclaimed_tech_is_reverted():
    base = load("fullstack")
    plan = identity_plan(base, summary="Full-stack engineer with 2 years of React, Node.js and Kafka experience.")
    out = apply_plan(base, plan)
    assert out.resume.summary == base.summary
    ok = identity_plan(base, summary="Full-stack engineer with 2 years building React and Node.js apps on PostgreSQL.")
    assert apply_plan(base, ok).resume.summary.startswith("Full-stack engineer with 2 years building")


def test_cover_letter_with_invented_claims_is_dropped():
    base = load("fullstack")
    good = identity_plan(base, cover_letter="I build React and Node.js products for 300+ merchants.")
    bad = identity_plan(base, cover_letter="I scaled Kafka pipelines to 1M events.")
    assert apply_plan(base, good).cover_letter
    assert apply_plan(base, bad).cover_letter == ""
