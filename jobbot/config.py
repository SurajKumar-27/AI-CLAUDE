"""Settings (environment variables) and personal data loading."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .models import Profile, Resume

RESUME_NAMES = ("fullstack", "ai")


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("JOBBOT_DATA_DIR", "data")))
    work_dir: Path = field(default_factory=lambda: Path(os.environ.get("JOBBOT_WORK_DIR", "work")))
    headless: bool = field(default_factory=lambda: _bool("JOBBOT_HEADLESS", True))
    chromium_path: str = field(default_factory=lambda: os.environ.get("JOBBOT_CHROMIUM_PATH", ""))


def load_profile(settings: Settings) -> Profile:
    path = settings.data_dir / "profile.yaml"
    return Profile.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def load_resume(settings: Settings, name: str) -> Resume:
    path = settings.data_dir / "resumes" / f"{name}.yaml"
    return Resume.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def load_resumes(settings: Settings) -> dict[str, Resume]:
    return {name: load_resume(settings, name) for name in RESUME_NAMES}
