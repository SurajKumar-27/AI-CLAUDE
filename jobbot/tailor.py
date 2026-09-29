"""Make truthful edits to a base resume so it lines up with one job description.

The edit plan (plan.json) is written per job; the code below enforces the rules,
so a bad edit is reverted instead of reaching an application:
  * every bullet stays attached to the same role; bullets may be reordered or reworded
  * a reworded bullet may not introduce a number or a technology that isn't
    already in that bullet or in another bullet about the same company
  * skills can be reordered, dropped, or taken from your other resume / your
    `extra_skills` list, never invented
  * the summary may only use numbers and technologies already on the resume
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from pydantic import BaseModel

from .models import Resume, SkillGroup

COMMON_TECH = [
    "Java", "Spring", "Spring Boot", "Hibernate", "JPA", "Kafka", "RabbitMQ", "Kotlin", "Scala", "Golang", "Rust",
    "C++", "C#", ".NET", "Ruby", "Rails", "PHP", "Laravel", "Django", "Flask", "FastAPI", "Express", "Express.js",
    "NestJS", "Next.js", "React", "React.js", "React Native", "Angular", "Vue", "Svelte", "Redux", "GraphQL", "gRPC",
    "REST", "RESTful", "Node", "Node.js", "TypeScript", "JavaScript", "Python", "SQL", "NoSQL", "MongoDB",
    "PostgreSQL", "Postgres", "MySQL", "Redis", "Elasticsearch", "Cassandra", "DynamoDB", "Snowflake", "BigQuery",
    "Spark", "Hadoop", "Airflow", "dbt", "AWS", "GCP", "Azure", "Lambda", "EC2", "S3", "ECS", "EKS", "Docker",
    "Kubernetes", "Terraform", "Ansible", "Jenkins", "GitHub Actions", "CI/CD", "Linux", "TensorFlow", "PyTorch",
    "scikit-learn", "Keras", "Hugging Face", "LangChain", "LangGraph", "LlamaIndex", "OpenAI", "RAG", "LLM", "LLMs",
    "NLP", "MCP", "CNN", "CNNs", "Pandas", "NumPy", "Microservices", "WebSockets", "Supabase", "Firebase", "Tailwind",
    "HTML", "CSS", "Selenium", "Playwright", "Jest", "pytest", "JUnit", "Datadog", "Prometheus", "Grafana", "Kibana",
    "Pinecone", "FAISS", "Chroma", "Gemini", "Claude", "Tomcat", "JSP", "Java EE", "Serverless", "VoIP", "IoT",
    "Computer Vision", "Machine Learning", "Deep Learning", "ERP", "Agile", "Jira", "Git", "Postman",
]

NUM_RE = re.compile(r"\d+(?:[.,]\d+)*")


def numbers_in(text: str) -> set[str]:
    return {n.replace(",", "") for n in NUM_RE.findall(text)}


def _split_skill(item: str) -> list[str]:
    """'Java (Spring Boot)' -> ['Java (Spring Boot)', 'Java', 'Spring Boot']; 'AWS (EC2/S3)' -> ..., 'EC2', 'S3'."""
    parts = [item]
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", item)
    if m:
        parts.append(m.group(1))
        parts += re.split(r"[/,]", m.group(2))
    return [p.strip() for p in parts if p.strip()]


def _norm(s: str) -> str:
    return re.sub(r"[\s\-_.]+", "", s.lower())


# Different spellings of the same thing count as the same technology.
ALIASES = {"restful": "rest", "restfulapis": "rest", "restapis": "rest", "reactjs": "react", "nodejs": "node",
           "expressjs": "express", "postgres": "postgresql", "llms": "llm", "cnns": "cnn", "k8s": "kubernetes",
           "nextjs": "next", "vuejs": "vue"}


def _canon(term: str) -> str:
    key = _norm(term)
    return ALIASES.get(key, key)


def _term_re(term: str) -> re.Pattern:
    flags = 0 if (len(term) <= 4 and term.upper() == term) else re.IGNORECASE
    return re.compile(r"(?<![\w.+#])" + re.escape(term) + r"(?![\w+#])", flags)


class TechVocabulary:
    def __init__(self, terms):
        uniq = {}
        for t in terms:
            t = t.strip()
            if len(t) >= 2 and _norm(t) not in uniq:
                uniq[_norm(t)] = t
        # Longest first so "Spring Boot" is found before "Spring".
        self.terms = sorted(uniq.values(), key=len, reverse=True)
        self._res = {t: _term_re(t) for t in self.terms}

    def find(self, text: str) -> set[str]:
        found, scrubbed = set(), text
        for t in self.terms:
            if self._res[t].search(scrubbed):
                found.add(_canon(t))
                scrubbed = self._res[t].sub(" ", scrubbed)
        return found


# ------------------------------------------------------------------ edit plan

class PlanSkillGroup(BaseModel):
    label: str
    items: list[str]


class PlanBullet(BaseModel):
    id: str
    text: str


class TailorPlan(BaseModel):
    base: str = "fullstack"  # which base resume the plan edits: fullstack | ai
    summary: str
    skills: list[PlanSkillGroup]
    bullets: list[PlanBullet]  # every bullet id, in the new order within each role
    changes: list[str]  # short human-readable list of what was changed and why
    missing_requirements: list[str]  # JD requirements the candidate does not show
    cover_letter: str


def resume_payload(resume: Resume) -> dict:
    payload = {"summary": resume.summary,
               "skills": [g.model_dump() for g in resume.skills],
               "experience": [], "projects": []}
    for ei, e in enumerate(resume.experience):
        roles = []
        for ri, r in enumerate(e.roles):
            roles.append({"title": r.title, "dates": r.dates,
                          "bullets": [{"id": f"e{ei}r{ri}b{bi}", "text": b} for bi, b in enumerate(r.bullets)]})
        payload["experience"].append({"company": e.company, "roles": roles})
    for pi, p in enumerate(resume.projects):
        payload["projects"].append({"name": p.name, "tech": p.tech,
                                    "bullets": [{"id": f"p{pi}b{bi}", "text": b} for bi, b in enumerate(p.bullets)]})
    return payload


# ------------------------------------------------------------------ guardrails

@dataclass
class TailorResult:
    resume: Resume
    changes: list[str]
    reverted: list[str] = field(default_factory=list)
    missing_requirements: list[str] = field(default_factory=list)
    cover_letter: str = ""


def apply_plan(base: Resume, plan: TailorPlan, *, other_resumes: list[Resume] = (),
               extra_skills: list[str] = ()) -> TailorResult:
    resume = base.model_copy(deep=True)
    reverted: list[str] = []

    skill_pool = [s for r in [base, *other_resumes] for s in r.all_skills()] + list(extra_skills)
    vocab = TechVocabulary(COMMON_TECH + [p for s in skill_pool for p in _split_skill(s)])
    allowed_skill_keys = {}
    for s in skill_pool:  # whole items first so their original spelling wins
        allowed_skill_keys.setdefault(_norm(s), s)
    for s in skill_pool:
        for part in _split_skill(s)[1:]:
            allowed_skill_keys.setdefault(_norm(part), part)

    # ---- summary
    base_text = base.as_text()
    summary_ok_terms = vocab.find(base_text + " " + " ".join(extra_skills))
    new_terms = vocab.find(plan.summary) - summary_ok_terms
    new_nums = numbers_in(plan.summary) - numbers_in(base_text)
    if plan.summary.strip() and (new_terms or new_nums or len(plan.summary) > len(base.summary) * 1.35 + 60):
        reverted.append(f"summary kept as original (would have added {sorted(new_terms | new_nums) or 'too much length'})")
    elif plan.summary.strip():
        resume.summary = plan.summary.strip()

    # ---- skills
    groups: list[SkillGroup] = []
    seen: set[str] = set()
    for g in plan.skills:
        items = []
        for item in g.items:
            key = _norm(item)
            if key in seen:
                continue
            if key not in allowed_skill_keys:
                reverted.append(f"skill '{item}' not on your resumes/extra_skills - left out")
                continue
            seen.add(key)
            items.append(allowed_skill_keys[key])
        if items:
            groups.append(SkillGroup(label=g.label.strip() or "Skills", items=items))
    if groups:
        resume.skills = groups

    # ---- bullets
    proposed = {b.id: b.text.strip() for b in plan.bullets}
    order = [b.id for b in plan.bullets]
    company_ref = _company_reference_text(base, other_resumes)

    def check(bid: str, original: str, company: str) -> str:
        new = proposed.get(bid, "")
        if not new or new == original:
            return original
        extra_nums = numbers_in(new) - numbers_in(original)
        extra_terms = vocab.find(new) - vocab.find(original + " " + company_ref.get(company, ""))
        too_long = len(new) > len(original) * 1.3 + 40
        if extra_nums or extra_terms or too_long:
            why = sorted(extra_nums | extra_terms) or ["length"]
            reverted.append(f"bullet {bid} kept as original (edit added {', '.join(why)})")
            return original
        return new

    def reorder(prefix: str, bullets: list[str], company: str) -> list[str]:
        ids = [f"{prefix}b{i}" for i in range(len(bullets))]
        by_id = {bid: check(bid, bullets[i], company) for i, bid in enumerate(ids)}
        new_order = [bid for bid in order if bid in by_id]
        new_order = list(dict.fromkeys(new_order)) + [bid for bid in ids if bid not in new_order]
        return [by_id[bid] for bid in new_order]

    for ei, e in enumerate(resume.experience):
        for ri, r in enumerate(e.roles):
            r.bullets = reorder(f"e{ei}r{ri}", r.bullets, _norm(e.company))
    for pi, p in enumerate(resume.projects):
        p.bullets = reorder(f"p{pi}", p.bullets, "project:" + _norm(p.name))

    return TailorResult(resume=resume, changes=plan.changes, reverted=reverted,
                        missing_requirements=plan.missing_requirements,
                        cover_letter=_check_cover_letter(plan.cover_letter, base, vocab, extra_skills))


def _company_reference_text(base: Resume, others) -> dict[str, str]:
    """All bullet text about each company across your resumes (same work, described differently)."""
    ref: dict[str, list[str]] = {}
    for r in [base, *others]:
        for e in r.experience:
            ref.setdefault(_norm(e.company), []).extend(b for role in e.roles for b in role.bullets)
        for p in r.projects:
            ref.setdefault("project:" + _norm(p.name), []).extend(p.bullets + [p.tech])
    return {k: " ".join(v) for k, v in ref.items()}


def _check_cover_letter(text: str, base: Resume, vocab: TechVocabulary, extra_skills) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    ref = base.as_text() + " " + " ".join(extra_skills)
    if numbers_in(text) - numbers_in(ref) or vocab.find(text) - vocab.find(ref):
        return ""  # drop rather than send something unverifiable
    return text


def allowed_extra_skills(base: Resume, other_resumes, extra_skills) -> list[str]:
    """Skills that may be added to `base`: those on your other resume plus profile extra_skills."""
    other = [s for r in other_resumes for s in r.all_skills()]
    return sorted({*other, *extra_skills} - set(base.all_skills()))
