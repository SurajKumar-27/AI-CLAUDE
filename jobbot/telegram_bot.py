"""Telegram Bot API: read the job group, message you, and receive your button taps."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from .links import urls_from_bot_message

log = logging.getLogger(__name__)


@dataclass
class Post:
    chat: str
    message_id: int
    text: str
    urls: list[str]
    from_owner: bool = False  # sent by you straight to the bot


@dataclass
class Callback:
    id: str
    action: str
    job_id: str
    chat_id: str
    message_id: int


@dataclass
class Batch:
    posts: list[Post] = field(default_factory=list)
    callbacks: list[Callback] = field(default_factory=list)
    # update_id to acknowledge after the post at the same index was processed
    post_update_ids: list[int] = field(default_factory=list)
    last_update_id: int | None = None


def _chat_matches(chat: dict, wanted: str) -> bool:
    wanted = wanted.strip()
    if not wanted:
        return False
    return str(chat.get("id")) == wanted or ("@" + (chat.get("username") or "")).lower() == wanted.lower() \
        or (chat.get("username") or "").lower() == wanted.lower().lstrip("@")


class TelegramBot:
    def __init__(self, token: str, client: httpx.Client | None = None):
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN is not set")
        self.base = f"https://api.telegram.org/bot{token}/"
        self.http = client or httpx.Client(timeout=70)

    def _call(self, method: str, files=None, **params):
        if files:
            r = self.http.post(self.base + method, data=params, files=files)
        else:
            r = self.http.post(self.base + method, json=params)
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(f"Telegram {method} failed: {data.get('description')}")
        return data["result"]

    # ------------------------------------------------------------ reading

    def get_updates(self, offset: int | None, timeout: int = 0) -> list[dict]:
        params = {"timeout": timeout,
                  "allowed_updates": ["message", "channel_post", "callback_query"]}
        if offset is not None:
            params["offset"] = offset
        return self._call("getUpdates", **params)

    def ack(self, last_update_id: int) -> None:
        """Tell Telegram everything up to last_update_id is handled."""
        self._call("getUpdates", offset=last_update_id + 1, timeout=0, limit=1)

    def parse(self, updates: list[dict], source_chat: str, owner_chat: str) -> Batch:
        batch = Batch()
        for up in updates:
            batch.last_update_id = up["update_id"]
            if "callback_query" in up:
                cq = up["callback_query"]
                msg = cq.get("message") or {}
                action, _, job_id = (cq.get("data") or "").partition(":")
                if str(cq.get("from", {}).get("id")) == str(owner_chat) and job_id:
                    batch.callbacks.append(Callback(cq["id"], action, job_id, str(msg.get("chat", {}).get("id")),
                                                    msg.get("message_id", 0)))
                continue
            msg = up.get("message") or up.get("channel_post")
            if not msg:
                continue
            chat = msg.get("chat", {})
            from_owner = str(chat.get("id")) == str(owner_chat) and chat.get("type") == "private"
            if not (_chat_matches(chat, source_chat) or from_owner):
                continue
            urls = urls_from_bot_message(msg)
            if urls:
                batch.posts.append(Post(str(chat.get("id")), msg.get("message_id", 0),
                                        msg.get("text") or msg.get("caption") or "", urls, from_owner))
                batch.post_update_ids.append(up["update_id"])
        return batch

    # ------------------------------------------------------------ writing

    def send_message(self, chat_id: str, text: str, buttons: list[list[tuple[str, str]]] | None = None,
                     reply_to: int | None = None) -> dict:
        params = {"chat_id": chat_id, "text": text[:4096], "parse_mode": "HTML", "link_preview_options": {"is_disabled": True}}
        if buttons:
            params["reply_markup"] = {"inline_keyboard": [[{"text": t, "callback_data": d} for t, d in row] for row in buttons]}
        if reply_to:
            params["reply_parameters"] = {"message_id": reply_to, "allow_sending_without_reply": True}
        return self._call("sendMessage", **params)

    def send_document(self, chat_id: str, path: str | Path, caption: str = "", filename: str | None = None) -> dict:
        path = Path(path)
        with path.open("rb") as fh:
            return self._call("sendDocument", files={"document": (filename or path.name, fh)},
                              chat_id=chat_id, caption=caption[:1024], parse_mode="HTML")

    def send_photo(self, chat_id: str, path: str | Path, caption: str = "") -> dict:
        path = Path(path)
        if path.stat().st_size > 9_500_000:  # Telegram photo limit is 10 MB; send as a file instead
            return self.send_document(chat_id, path, caption)
        with path.open("rb") as fh:
            try:
                return self._call("sendPhoto", files={"photo": (path.name, fh)}, chat_id=chat_id,
                                  caption=caption[:1024], parse_mode="HTML")
            except RuntimeError:  # very tall full-page screenshots get rejected as photos
                fh.seek(0)
                return self._call("sendDocument", files={"document": (path.name, fh)}, chat_id=chat_id,
                                  caption=caption[:1024], parse_mode="HTML")

    def answer_callback(self, callback_id: str, text: str = "") -> None:
        try:
            self._call("answerCallbackQuery", callback_query_id=callback_id, text=text[:200])
        except RuntimeError as e:  # stale callbacks (older than ~15 min) can't be answered; harmless
            log.info("answerCallbackQuery: %s", e)

    def clear_buttons(self, chat_id: str, message_id: int) -> None:
        try:
            self._call("editMessageReplyMarkup", chat_id=chat_id, message_id=message_id,
                       reply_markup=json.loads('{"inline_keyboard": []}'))
        except RuntimeError as e:
            log.info("editMessageReplyMarkup: %s", e)

    def get_me(self) -> dict:
        return self._call("getMe")
