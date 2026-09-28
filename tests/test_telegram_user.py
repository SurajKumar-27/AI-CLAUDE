import pytest

telethon = pytest.importorskip("telethon")

from telethon.tl.custom.message import Message  # noqa: E402
from telethon.tl import types  # noqa: E402
from telethon.tl.types import (KeyboardButtonRow, MessageEntityTextUrl, MessageEntityUrl,  # noqa: E402
                               ReplyInlineMarkup)


def url_button(text, url):
    # Telethon >= 1.45 models every button as KeyboardButton(type=...); older ones had KeyboardButtonUrl.
    if hasattr(types, "InlineButtonTypeUrl"):
        return types.KeyboardButton(text=text, type=types.InlineButtonTypeUrl(url=url))
    return types.KeyboardButtonUrl(text=text, url=url)

from jobbot.telegram_user import urls_from_telethon_message  # noqa: E402


def test_urls_from_user_account_message():
    text = "🚀 Acme hiring! Apply: https://bit.ly/acme-1 details here"
    start = len("🚀 Acme hiring! Apply: ".encode("utf-16-le")) // 2
    msg = Message(id=1, peer_id=None, message=text, entities=[
        MessageEntityTextUrl(offset=0, length=2, url="https://jobs.lever.co/acme/1"),
        MessageEntityUrl(offset=start, length=len("https://bit.ly/acme-1")),
    ], reply_markup=ReplyInlineMarkup(rows=[KeyboardButtonRow(buttons=[
        url_button("Apply", "https://boards.greenhouse.io/acme/jobs/2"),
        url_button("Join", "https://t.me/acmejobs")])]))
    assert urls_from_telethon_message(msg) == ["https://jobs.lever.co/acme/1", "https://bit.ly/acme-1",
                                              "https://boards.greenhouse.io/acme/jobs/2"]
