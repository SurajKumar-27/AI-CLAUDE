"""Small JSON store: which jobs were seen, their status, and Telegram read positions."""
from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .links import canonical_url
from .models import JobRecord


def job_id_for(url: str) -> str:
    return hashlib.sha1(canonical_url(url).encode()).hexdigest()[:10]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class State:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.jobs_path = root / "jobs.json"
        self.meta_path = root / "meta.json"
        self.jobs: dict[str, JobRecord] = {}
        self.meta: dict = {}
        if self.jobs_path.exists():
            raw = json.loads(self.jobs_path.read_text())
            self.jobs = {k: JobRecord.model_validate(v) for k, v in raw.items()}
        if self.meta_path.exists():
            self.meta = json.loads(self.meta_path.read_text())

    def job_dir(self, job_id: str) -> Path:
        d = self.root / "jobs" / job_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def seen(self, url: str) -> JobRecord | None:
        return self.jobs.get(job_id_for(url))

    def put(self, rec: JobRecord) -> None:
        rec.updated_at = now()
        rec.created_at = rec.created_at or rec.updated_at
        self.jobs[rec.id] = rec
        self.save()

    def save(self) -> None:
        tmp = self.jobs_path.with_suffix(".tmp")
        tmp.write_text(json.dumps({k: v.model_dump(mode="json") for k, v in self.jobs.items()}, indent=1))
        tmp.replace(self.jobs_path)
        self.meta_path.write_text(json.dumps(self.meta, indent=1))

    def prune_files(self, keep_days: int = 14) -> None:
        """Drop PDFs/screenshots of old jobs (the records stay, so they're still de-duplicated)."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
        for rec in self.jobs.values():
            try:
                if datetime.fromisoformat(rec.updated_at) < cutoff:
                    shutil.rmtree(self.root / "jobs" / rec.id, ignore_errors=True)
            except ValueError:
                continue
