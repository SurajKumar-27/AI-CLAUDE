"""Read an application form's fields and decide what goes in each one."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from pydantic import BaseModel

from ..models import JobPosting, Profile

# Runs in the page. Tags every fillable control with data-jobbot-key and
# returns a description of it, grouping radio buttons / checkboxes by name.
COLLECT_JS = r"""
() => {
  const visible = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    // file inputs are often visually hidden behind a styled button
    return (r.width > 0 && r.height > 0) || el.type === 'file';
  };
  const clean = t => (t || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const labelOf = el => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && clean(l.innerText)) return clean(l.innerText);
    }
    const lab = el.closest('label');
    if (lab && clean(lab.innerText)) return clean(lab.innerText);
    if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map(i => document.getElementById(i)?.innerText || '').join(' ');
      if (clean(t)) return clean(t);
    }
    let c = el.parentElement;
    for (let i = 0; i < 5 && c; i++, c = c.parentElement) {
      const t = clean(c.innerText);
      if (t) return t;
    }
    return clean(el.placeholder || el.name || el.id);
  };
  const groupLabel = els => {
    const fs = els[0].closest('fieldset');
    if (fs && fs.querySelector('legend')) return clean(fs.querySelector('legend').innerText);
    let c = els[0].parentElement;
    while (c && !els.every(e => c.contains(e))) c = c.parentElement;
    for (let i = 0; i < 3 && c; i++, c = c.parentElement) {
      const lab = c.querySelector('label:not(:has(input)), legend, .label, [class*="label"], [class*="question"]');
      if (lab && clean(lab.innerText)) return clean(lab.innerText);
      const t = clean(c.innerText);
      if (t.length > 3) return t;
    }
    return clean(els[0].name);
  };

  const out = [];
  let n = 0;
  const groups = {};
  const els = document.querySelectorAll('input, select, textarea');
  for (const el of els) {
    const type = el.tagName === 'INPUT' ? (el.type || 'text').toLowerCase() : el.tagName.toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'search'].includes(type)) continue;
    if (el.disabled || !visible(el)) continue;
    if (type === 'radio' || type === 'checkbox') {
      const g = el.name || ('__' + n++);
      (groups[g] = groups[g] || []).push(el);
      continue;
    }
    const key = 'f' + (n++);
    el.setAttribute('data-jobbot-key', key);
    const item = {
      key, kind: el.getAttribute('role') === 'combobox' ? 'combobox' : (el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : type)),
      name: el.name || '', id: el.id || '', label: labelOf(el), required: el.required || el.getAttribute('aria-required') === 'true',
      autocomplete: el.getAttribute('autocomplete') || '', accept: el.getAttribute('accept') || '',
      value: el.type === 'file' ? '' : (el.value || ''), options: [],
    };
    if (el.tagName === 'SELECT') {
      item.options = [...el.options].filter(o => o.value !== '' || clean(o.text)).map(o => clean(o.text)).filter(t => !/^(select|choose|--|please select)/i.test(t));
    }
    out.push(item);
  }
  for (const [name, list] of Object.entries(groups)) {
    const key = 'f' + (n++);
    list.forEach((el, i) => el.setAttribute('data-jobbot-key', key + '_' + i));
    const kind = list[0].type;
    const single = kind === 'checkbox' && list.length === 1;
    out.push({
      key, kind: single ? 'checkbox' : (kind === 'radio' ? 'radio' : 'checkboxes'), name, id: list[0].id || '',
      label: single ? labelOf(list[0]) : groupLabel(list),
      required: list.some(e => e.required || e.getAttribute('aria-required') === 'true'),
      autocomplete: '', accept: '', value: list.filter(e => e.checked).map(e => labelOf(e)).join('; '),
      options: single ? [] : list.map(e => labelOf(e)),
    });
  }
  return out;
}
"""


@dataclass
class FormField:
    key: str
    kind: str
    name: str
    id: str
    label: str
    required: bool
    autocomplete: str = ""
    accept: str = ""
    value: str = ""
    options: list[str] = field(default_factory=list)

    @property
    def haystack(self) -> str:
        return f"{self.label} {self.name} {self.id} {self.autocomplete}".lower()


def collect_fields(frame) -> list[FormField]:
    return [FormField(**f) for f in frame.evaluate(COLLECT_JS)]


# ------------------------------------------------------------------ standard fields

@dataclass
class Plan:
    """What to put where. value=None means 'leave empty'."""

    text: dict[str, str] = field(default_factory=dict)  # key -> text / option label
    choices: dict[str, list[str]] = field(default_factory=dict)  # radio / checkbox option labels
    files: dict[str, str] = field(default_factory=dict)  # key -> file path
    unanswered: list[FormField] = field(default_factory=list)  # required fields nobody could answer
    notes: dict[str, str] = field(default_factory=dict)  # key -> field label, for the report


STANDARD = [
    ("first_name", r"first.?name|given.?name|\bfname\b|first_name"),
    ("last_name", r"last.?name|family.?name|surname|\blname\b|last_name"),
    ("email", r"e-?mail"),
    ("phone", r"phone|mobile|contact.?number|\btel\b"),
    ("linkedin", r"linked.?in"),
    ("github", r"git.?hub"),
    ("portfolio", r"portfolio|personal.?(web)?site|\bwebsite\b|\bblog\b"),
    ("current_company", r"current.?(company|employer|organi[sz]ation)|^org$|\borg\b|company name"),
    ("current_title", r"current.?(title|role|designation|position)|job.?title"),
    ("city", r"\bcity\b|current.?location|^location\b|\blocation\b|where are you (located|based)"),
    ("full_name", r"full.?name|your name|candidate.?name|^name\b|\bname\b"),
]


def standard_value(key: str, profile: Profile) -> str:
    p = profile.personal
    return {
        "first_name": p.first_name, "last_name": p.last_name, "full_name": p.full_name, "email": p.email,
        "phone": f"{p.phone_country_code}{p.phone}" if p.phone_country_code else p.phone,
        "linkedin": p.linkedin, "github": p.github, "portfolio": p.portfolio or p.github,
        "current_company": str(profile.facts.get("current_company") or ""),
        "current_title": str(profile.facts.get("current_title") or ""),
        "city": p.short_location,
    }.get(key, "")


def plan_standard(fields: list[FormField], profile: Profile, resume_pdf: str, cover_pdf: str | None) -> tuple[Plan, list[FormField]]:
    plan, rest = Plan(), []
    file_fields = [f for f in fields if f.kind == "file"]
    for f in fields:
        hay = f.haystack
        if f.kind == "file":
            if re.search(r"cover", hay):
                if cover_pdf:
                    plan.files[f.key] = cover_pdf
            elif re.search(r"resume|\bcv\b|curriculum", hay) or len(file_fields) == 1 or f is file_fields[0]:
                plan.files[f.key] = resume_pdf
            plan.notes[f.key] = f.label
            continue
        if f.kind in ("text", "email", "tel", "url", "textarea", "combobox", "number") and not f.options:
            if f.kind == "email":
                plan.text[f.key] = profile.personal.email
                plan.notes[f.key] = f.label
                continue
            if f.kind == "tel":
                plan.text[f.key] = standard_value("phone", profile)
                plan.notes[f.key] = f.label
                continue
            if f.kind != "textarea" and len(f.label) < 80:
                matched = next((k for k, pat in STANDARD if re.search(pat, hay)), None)
                if matched and standard_value(matched, profile):
                    plan.text[f.key] = standard_value(matched, profile)
                    plan.notes[f.key] = f.label
                    continue
        rest.append(f)
    return plan, rest


# ------------------------------------------------------------------ LLM answers

class FieldAnswer(BaseModel):
    key: str
    answer: str | None  # text, or the exact option label for select/radio; None if unknown
    options: list[str]  # for checkbox groups: every option label to tick
    confident: bool


class FormAnswers(BaseModel):
    answers: list[FieldAnswer]


ANSWER_SYSTEM = """You fill in a job application form for the candidate, using ONLY facts from their profile and resume.

Rules:
- Never invent facts. If the profile/resume doesn't contain the answer, return answer null (the candidate will fill it in). A null "facts" value in the profile means unknown.
- For select/radio fields, answer with one of the listed option labels, copied exactly. For checkbox groups, list every option to tick in "options".
- Yes/no questions about skills or experience: "Yes" only when the resume clearly shows it; otherwise answer honestly ("No") when not required to be positive, or null if unsure.
- Years of experience with a technology: count only professional experience shown on the resume; the candidate's total professional experience is in the profile.
- Demographic / EEO / disability / veteran questions: use the profile's eeo_default_answer, or the closest "decline / prefer not to say" option.
- Consent / privacy-policy / "I confirm the information is accurate" checkboxes: tick them.
- Free-text questions ("Why do you want to work here?", "Tell us about a project"): 2-4 sentences in first person, specific to this job, grounded only in the resume.
- Never answer questions about salary, notice period, visa, relocation, or dates unless the profile gives the answer.
Set confident false for any answer you had to judge rather than copy."""


def ask_llm(llm, fields: list[FormField], profile: Profile, resume_text: str, posting: JobPosting) -> FormAnswers:
    listing = [{"key": f.key, "type": f.kind, "question": f.label, "required": f.required,
                **({"options": f.options} if f.options else {})} for f in fields]
    profile_json = json.dumps({"personal": profile.personal.model_dump(), "facts": profile.facts}, indent=1, default=str)
    user = (
        f"<profile>\n{profile_json}\n</profile>\n\n<resume>\n{resume_text}\n</resume>\n\n"
        f"<job>\nTitle: {posting.title}\nCompany: {posting.company}\n\n{posting.description[:6000]}\n</job>\n\n"
        f"<form_fields>\n{json.dumps(listing, indent=1)}\n</form_fields>"
    )
    return llm.structured(system=ANSWER_SYSTEM, user=user, schema=FormAnswers, max_tokens=16000)


def merge_llm_answers(plan: Plan, fields: list[FormField], answers: FormAnswers) -> None:
    by_key = {a.key: a for a in answers.answers}
    for f in fields:
        a = by_key.get(f.key)
        plan.notes[f.key] = f.label
        if f.kind == "checkboxes":
            picks = [o for o in (a.options if a else []) if o in f.options] or (
                [a.answer] if a and a.answer in f.options else [])
            if picks:
                plan.choices[f.key] = picks
            elif f.required:
                plan.unanswered.append(f)
            continue
        if f.kind == "checkbox":
            yes = bool(a and ((a.answer or "").strip().lower() in {"yes", "true", "checked", "tick", "agree", "i agree"}
                              or a.options))
            if yes:
                plan.choices[f.key] = ["yes"]
            elif f.required:
                plan.unanswered.append(f)
            continue
        if a is None or a.answer is None or not str(a.answer).strip():
            if f.required:
                plan.unanswered.append(f)
            continue
        if f.kind in ("radio",):
            plan.choices[f.key] = [a.answer]
        else:
            plan.text[f.key] = str(a.answer)
