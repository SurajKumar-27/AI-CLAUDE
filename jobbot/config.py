"""Runtime settings (environment variables) and personal data loading."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .models import Category, Profile, Resume


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("JOBBOT_DATA_DIR", "data")))
    state_dir: Path = field(default_factory=lambda: Path(os.environ.get("JOBBOT_STATE_DIR", "state")))
    output_dir: Path = field(default_factory=lambda: Path(os.environ.get("JOBBOT_OUTPUT_DIR", "output")))

    # Claude
    model: str = field(default_factory=lambda: os.environ.get("JOBBOT_MODEL", "claude-opus-5"))
    effort: str = field(default_factory=lambda: os.environ.get("JOBBOT_EFFORT", "medium"))
    tailor_effort: str = field(default_factory=lambda: os.environ.get("JOBBOT_TAILOR_EFFORT", "high"))
    use_fallbacks: bool = field(default_factory=lambda: _bool("JOBBOT_USE_FALLBACKS", True))

    # Telegram
    telegram_mode: str = field(default_factory=lambda: os.environ.get("TELEGRAM_MODE", "bot"))
    bot_token: str = field(default_factory=lambda: os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    source_chat: str = field(default_factory=lambda: os.environ.get("TELEGRAM_SOURCE_CHAT", ""))
    notify_chat_id: str = field(default_factory=lambda: os.environ.get("TELEGRAM_NOTIFY_CHAT_ID", ""))
    api_id: str = field(default_factory=lambda: os.environ.get("TELEGRAM_API_ID", ""))
    api_hash: str = field(default_factory=lambda: os.environ.get("TELEGRAM_API_HASH", ""))
    user_session: str = field(default_factory=lambda: os.environ.get("TELEGRAM_SESSION", ""))

    # Behaviour
    auto_submit: bool = field(default_factory=lambda: _bool("JOBBOT_AUTO_SUBMIT", False))
    min_fit: int = field(default_factory=lambda: _int("JOBBOT_MIN_FIT", 0))
    max_jobs_per_run: int = field(default_factory=lambda: _int("JOBBOT_MAX_JOBS_PER_RUN", 10))
    max_links_per_post: int = field(default_factory=lambda: _int("JOBBOT_MAX_LINKS_PER_POST", 5))
    headless: bool = field(default_factory=lambda: _bool("JOBBOT_HEADLESS", True))
    chromium_path: str = field(default_factory=lambda: os.environ.get("JOBBOT_CHROMIUM_PATH", ""))
    write_cover_letter: bool = field(default_factory=lambda: _bool("JOBBOT_COVER_LETTER", True))


def load_profile(settings: Settings) -> Profile:
    path = settings.data_dir / "profile.yaml"
    return Profile.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


# "other" jobs (Spring Boot, Java, generic SWE ...) start from the full-stack
# resume, which is the broadest one; tailoring then brings the relevant
# skills you actually have to the front.
BASE_RESUME_FOR = {
    Category.FULLSTACK: "fullstack",
    Category.AI: "ai",
    Category.OTHER: "fullstack",
}


def load_resume(settings: Settings, name: str) -> Resume:
    path = settings.data_dir / "resumes" / f"{name}.yaml"
    return Resume.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def load_resumes(settings: Settings) -> dict[str, Resume]:
    return {name: load_resume(settings, name) for name in sorted(set(BASE_RESUME_FOR.values()))}
