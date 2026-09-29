"""Read an application form's fields and decide what goes in each one."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..models import Profile

# Runs in the page. Tags every fillable control with data-jobbot-key and
# returns a description of it, grouping radio buttons / checkboxes by name.
COLLECT_JS = r"""
() => {
  const visible = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    // dummy inputs behind custom dropdowns (react-select's "requiredInput" and friends)
    if (el.type !== 'file' && (el.getAttribute('aria-hidden') === 'true' || parseFloat(s.opacity) === 0
        || (el.tabIndex === -1 && s.pointerEvents === 'none'))) return false;
    const r = el.getBoundingClientRect();
    // file inputs are often visually hidden behind a styled button
    return (r.width > 0 && r.height > 0) || el.type === 'file';
  };
  const clean = t => (t || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const GENERIC = /^(attach|upload|browse|choose file|select file|drop files? here|or|dropbox|google drive|enter manually|paste|accepted file|max(imum)? file|\(?optional)\b/i;
  const labelOf = el => {
    const t = baseLabel(el);
    if (el.type !== 'file' || !GENERIC.test(t)) return t;
    // "Attach" buttons: use the upload widget's heading ("Resume/CV*") instead
    let c = el.parentElement;
    for (let i = 0; i < 8 && c; i++, c = c.parentElement) {
      const first = clean((c.innerText || '').split('\n').find(l => l.trim() && !GENERIC.test(l.trim())) || '');
      if (first) return first;
    }
    return t;
  };
  const baseLabel = el => {
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


def _trim_label(f: FormField) -> FormField:
    """Labels read off a dropdown's container also contain its options; cut them off."""
    if f.kind == "select":
        cut = [i for i in (f.label.find(" Select..."), f.label.find(" Select "),
                           f.label.find(" " + f.options[0]) if f.options else -1) if i > 0]
        if cut:
            f.label = f.label[:min(cut)].strip()
    return f


def collect_fields(frame) -> list[FormField]:
    return [_trim_label(FormField(**f)) for f in frame.evaluate(COLLECT_JS)]


# ------------------------------------------------------------------ standard fields

@dataclass
class Plan:
    """What to put where. value=None means 'leave empty'."""

    text: dict[str, str] = field(default_factory=dict)  # key -> text / option label
    choices: dict[str, list[str]] = field(default_factory=dict)  # radio / checkbox option labels
    files: dict[str, str] = field(default_factory=dict)  # key -> file path
    unanswered: list[FormField] = field(default_factory=list)  # required fields with no answer
    skipped: list[FormField] = field(default_factory=list)  # optional fields left empty
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


def plan_standard(fields: list[FormField], profile: Profile, resume_pdf: str, cover_pdf: str | None,
                  book: AnswerBook | None = None) -> tuple[Plan, list[FormField]]:
    """Fill the fields every form has (name, email, resume ...) from the profile.

    Returns the plan and the fields still to answer. An explicit answer in the
    answer book always wins over the profile default.
    """
    plan, rest = Plan(), []
    file_fields = [f for f in fields if f.kind == "file"]
    for f in fields:
        hay = f.haystack
        if f.kind != "file" and book is not None and book.lookup(f) is not None:
            rest.append(f)
            continue
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
                value = standard_value(matched, profile) if matched else ""
                if matched == "portfolio" and "other" in hay and not profile.personal.portfolio:
                    value = profile.personal.leetcode or value  # don't repeat GitHub in "Other website"
                if value:
                    plan.text[f.key] = value
                    plan.notes[f.key] = f.label
                    continue
        rest.append(f)
    return plan, rest


# ------------------------------------------------------------------ answers written for this job

def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()


TRUTHY = {"yes", "true", "checked", "check", "tick", "agree", "i agree", "y", "1"}


class AnswerBook:
    """Answers for one application, from answers.json.

    Keys are the question text (or any distinctive part of it) or a field key from
    fields.json; values are text, an option label, a list of option labels for
    checkbox groups, or true/false for single checkboxes.
    """

    def __init__(self, answers: dict | None = None):
        self.items = [(_key(k), v) for k, v in (answers or {}).items() if _key(k)]

    def lookup(self, f: FormField):
        label, exact = _key(f.label), {_key(f.label), _key(f.key)} | ({_key(f.name)} if f.name else set())
        for k, v in self.items:
            if k in exact:
                return v
        hits = [(len(k), v) for k, v in self.items if len(k) >= 4 and k in label]
        return max(hits, key=lambda h: h[0])[1] if hits else None


def apply_answers(plan: Plan, fields: list[FormField], book: AnswerBook) -> None:
    for f in fields:
        v = book.lookup(f)
        plan.notes[f.key] = f.label
        if v is None or (isinstance(v, str) and not v.strip()):
            if f.required:
                plan.unanswered.append(f)
            else:
                plan.skipped.append(f)
            continue
        if f.kind == "checkbox":
            if v is True or str(v).strip().lower() in TRUTHY:
                plan.choices[f.key] = ["yes"]
            elif f.required:
                plan.unanswered.append(f)
        elif f.kind == "checkboxes":
            plan.choices[f.key] = [str(x) for x in v] if isinstance(v, list) else [str(v)]
        elif f.kind == "radio":
            plan.choices[f.key] = [str(v[0] if isinstance(v, list) else v)]
        else:
            plan.text[f.key] = str(v[0] if isinstance(v, list) else v)
