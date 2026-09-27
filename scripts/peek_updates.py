"""Cheap pre-check for the GitHub workflow: is there anything new on Telegram?

Uses only the standard library so the workflow can skip installing Chromium
and friends on the (many) runs where nothing happened.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
meta = Path(os.environ.get("JOBBOT_STATE_DIR", "state")) / "meta.json"
offset = json.loads(meta.read_text()).get("bot_offset") if meta.exists() else None

has_work = os.environ.get("TELEGRAM_MODE", "bot") == "user" or bool(os.environ.get("FORCE_RUN"))
if not has_work and token:
    body = {"timeout": 0, "limit": 1, "allowed_updates": ["message", "channel_post", "callback_query"]}
    if offset is not None:
        body["offset"] = offset
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/getUpdates", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            has_work = bool(json.load(r).get("result"))
    except Exception as e:  # noqa: BLE001 - on doubt, do the full run
        print(f"peek failed ({e.__class__.__name__}); running anyway", file=sys.stderr)
        has_work = True

print(f"has_work={'true' if has_work else 'false'}")
out = os.environ.get("GITHUB_OUTPUT")
if out:
    with open(out, "a") as fh:
        fh.write(f"has_work={'true' if has_work else 'false'}\n")
