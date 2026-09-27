"""Read the job group through YOUR Telegram account (for groups/channels where you can't add a bot).

Needs `pip install -r requirements-telethon.txt`, an API id/hash from https://my.telegram.org
and a session string made once with `python scripts/make_telegram_session.py`.
Notifications still go through the bot.
"""
from __future__ import annotations

import logging

from .links import URL_RE, filter_links
from .telegram_bot import Post

log = logging.getLogger(__name__)


def urls_from_telethon_message(msg) -> list[str]:
    from telethon.tl.types import MessageEntityTextUrl, MessageEntityUrl

    text = msg.message or ""
    found = []
    for ent, inner in (msg.get_entities_text() if msg.entities else []):
        if isinstance(ent, MessageEntityTextUrl):
            found.append(ent.url)
        elif isinstance(ent, MessageEntityUrl):
            found.append(inner)
    for row in msg.buttons or []:
        for button in row:
            url = getattr(button, "url", None)
            if url:
                found.append(url)
    found += URL_RE.findall(text)
    return filter_links(found)


def fetch_new_posts(api_id: str, api_hash: str, session: str, chat: str, after_id: int, limit: int = 50):
    """Returns (posts, newest_message_id). On the first run only the latest message is taken."""
    from telethon.sessions import StringSession
    from telethon.sync import TelegramClient

    posts: list[Post] = []
    newest = after_id
    with TelegramClient(StringSession(session), int(api_id), api_hash) as client:
        entity = client.get_entity(int(chat) if chat.lstrip("-").isdigit() else chat)
        kwargs = {"min_id": after_id, "limit": limit} if after_id else {"limit": 1}
        for msg in reversed(list(client.iter_messages(entity, **kwargs))):
            newest = max(newest, msg.id)
            urls = urls_from_telethon_message(msg)
            if urls:
                posts.append(Post(str(chat), msg.id, msg.message or "", urls))
    return posts, newest
