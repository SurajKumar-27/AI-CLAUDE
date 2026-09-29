"""Data models shared across the pipeline."""
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------- resume data

class Education(BaseModel):
    school: str
    location: str = ""
    degree: str
    date: str


class SkillGroup(BaseModel):
    label: str
    items: list[str]


class Role(BaseModel):
    title: str
    dates: str
    bullets: list[str]


class Experience(BaseModel):
    company: str
    location: str = ""
    roles: list[Role]


class Project(BaseModel):
    name: str
    tech: str = ""
    bullets: list[str]


class Achievement(BaseModel):
    label: str
    text: str


class Resume(BaseModel):
    """A resume as structured data. Contact details come from the profile."""

    summary: str
    education: list[Education]
    skills: list[SkillGroup]
    experience: list[Experience]
    projects: list[Project] = Field(default_factory=list)
    achievements: list[Achievement] = Field(default_factory=list)

    def all_bullets(self) -> list[str]:
        out = [b for e in self.experience for r in e.roles for b in r.bullets]
        out += [b for p in self.projects for b in p.bullets]
        return out

    def all_skills(self) -> list[str]:
        return [s for g in self.skills for s in g.items]

    def as_text(self) -> str:
        lines = ["SUMMARY", self.summary, "", "SKILLS"]
        lines += [f"{g.label}: {', '.join(g.items)}" for g in self.skills]
        lines += ["", "EXPERIENCE"]
        for e in self.experience:
            for r in e.roles:
                lines.append(f"{r.title} - {e.company} ({r.dates})")
                lines += [f"- {b}" for b in r.bullets]
        if self.projects:
            lines += ["", "PROJECTS"]
            for p in self.projects:
                lines.append(f"{p.name} | {p.tech}")
                lines += [f"- {b}" for b in p.bullets]
        lines += ["", "EDUCATION"]
        lines += [f"{e.degree}, {e.school} ({e.date})" for e in self.education]
        if self.achievements:
            lines += ["", "ACHIEVEMENTS"]
            lines += [f"{a.label}: {a.text}" for a in self.achievements]
        return "\n".join(lines)


# ---------------------------------------------------------------- profile

class Personal(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    phone_country_code: str = ""
    city: str = ""
    state: str = ""
    country: str = ""
    linkedin: str = ""
    github: str = ""
    leetcode: str = ""
    portfolio: str = ""

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def location(self) -> str:
        return ", ".join(p for p in (self.city, self.state, self.country) if p)

    @property
    def short_location(self) -> str:
        return ", ".join(p for p in (self.city, self.country) if p)


class Profile(BaseModel):
    personal: Personal
    # Everything an application form may ask that is not on the resume:
    # notice period, CTC, work authorisation, relocation, EEO answers ...
    facts: dict[str, Any] = Field(default_factory=dict)
    # Skills you really have but that are not on either resume. Tailoring may
    # surface these; it may never add anything outside resume + this list.
    extra_skills: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------- jobs

class JobStatus(str, Enum):
    READY = "ready"  # form filled, not submitted (dry run)
    NEEDS_ANSWERS = "needs_answers"  # required questions the answer file doesn't cover
    NEEDS_HUMAN = "needs_human"  # something only you can do (login, captcha ...)
    SUBMITTED = "submitted"
    UNCERTAIN = "uncertain"  # clicked submit but saw no confirmation
    FAILED = "failed"


class JobPosting(BaseModel):
    url: str
    title: str = ""
    company: str = ""
    location: str = ""
    description: str = ""
