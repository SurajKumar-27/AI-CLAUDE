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

def new_group_posts() -> bool:
    """User mode: has the job group got a message newer than the last one we handled?"""
    try:
        from telethon.sessions import StringSession
        from telethon.sync import TelegramClient

        chat = os.environ["TELEGRAM_SOURCE_CHAT"]
        last = int((json.loads(meta.read_text()).get("user_last_id") or 0) if meta.exists() else 0)
        client = TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), int(os.environ["TELEGRAM_API_ID"]),
                                os.environ["TELEGRAM_API_HASH"], connection_retries=2, timeout=20)
        client.connect()  # never client.start(): that would wait for someone to type a phone number
        try:
            if not client.is_user_authorized():
                raise RuntimeError("TELEGRAM_SESSION is not logged in")
            entity = client.get_entity(int(chat) if chat.lstrip("-").isdigit() else chat)
            latest = next(iter(client.iter_messages(entity, limit=1)), None)
            return latest is not None and latest.id > last
        finally:
            client.disconnect()
    except Exception as e:  # noqa: BLE001 - on doubt, do the full run
        print(f"user-mode peek failed ({e.__class__.__name__}: {e}); running anyway", file=sys.stderr)
        return True


has_work = bool(os.environ.get("FORCE_RUN"))
if not has_work and os.environ.get("TELEGRAM_MODE", "bot") == "user":
    has_work = new_group_posts()
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
