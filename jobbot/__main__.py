"""Command line entry point: `python -m jobbot <command>`."""
from __future__ import annotations

import argparse
import logging
import sys
import time
from contextlib import ExitStack

from .config import Settings, load_profile, load_resumes

log = logging.getLogger("jobbot")


def _build(settings: Settings, stack: ExitStack, telegram: bool = True):
    from .browser import BrowserSession, RenderFetcher
    from .links import HttpFetcher, LinkResolver
    from .llm import ClaudeLLM
    from .notify import ConsoleNotifier, TelegramNotifier
    from .pipeline import Pipeline
    from .state import State
    from .telegram_bot import TelegramBot

    profile = load_profile(settings)
    resumes = load_resumes(settings)
    llm = ClaudeLLM(settings.model, settings.effort, settings.use_fallbacks)
    session = stack.enter_context(BrowserSession(settings.headless, settings.chromium_path))
    state = State(settings.state_dir)
    bot = None
    if telegram and settings.bot_token:
        bot = TelegramBot(settings.bot_token)
        notifier = TelegramNotifier(bot, settings.notify_chat_id, profile.personal.full_name)
    else:
        notifier = ConsoleNotifier()
    resolver = LinkResolver(HttpFetcher(), RenderFetcher(session), llm)
    return Pipeline(settings, llm, session, profile, resumes, state, notifier, resolver), bot, state


def run_once(settings: Settings, long_poll: int = 0) -> int:
    """Read new Telegram posts and button taps, process them, remember where we stopped."""
    from .telegram_bot import Batch

    if not settings.bot_token or not settings.notify_chat_id:
        sys.exit("Set TELEGRAM_BOT_TOKEN and TELEGRAM_NOTIFY_CHAT_ID first (see README).")
    with ExitStack() as stack:
        pipeline, bot, state = _build(settings, stack)
        offset = state.meta.get("bot_offset")
        updates = bot.get_updates(offset, timeout=long_poll)
        batch: Batch = bot.parse(updates, settings.source_chat if settings.telegram_mode == "bot" else "",
                                 settings.notify_chat_id)

        for cb in batch.callbacks:
            bot.answer_callback(cb.id, "Working on it…")
            bot.clear_buttons(cb.chat_id, cb.message_id)
            try:
                msg = pipeline.handle_action(cb.action, cb.job_id)
            except Exception as e:  # noqa: BLE001
                log.exception("action %s failed", cb.action)
                msg = f"That didn't work: {e.__class__.__name__}"
            pipeline.notifier.text(msg)

        posts = list(batch.posts)
        if settings.telegram_mode == "user":
            from .telegram_user import fetch_new_posts

            user_posts, newest = fetch_new_posts(settings.api_id, settings.api_hash, settings.user_session,
                                                 settings.source_chat, int(state.meta.get("user_last_id") or 0))
            posts += user_posts
            state.meta["user_last_id"] = newest

        handled = 0
        processed_until = batch.last_update_id
        for i, post in enumerate(posts):
            if handled >= settings.max_jobs_per_run:
                # Leave the rest for the next run.
                if i < len(batch.post_update_ids):
                    processed_until = batch.post_update_ids[i] - 1
                if settings.telegram_mode == "user" and i >= len(batch.posts):
                    state.meta["user_last_id"] = posts[i].message_id - 1
                break
            records = pipeline.handle_urls(post.urls, force=post.from_owner)
            handled += len(records)
            if post.from_owner and not records:
                pipeline.notifier.text("No new job found in that link (or I've already handled it).")

        if processed_until is not None:
            bot.ack(processed_until)
            state.meta["bot_offset"] = processed_until + 1
        state.prune_files()
        state.save()
        log.info("run finished: %d post(s), %d job(s), %d button tap(s)", len(posts), handled, len(batch.callbacks))
        return handled


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="jobbot", description="Telegram job posts -> tailored resume -> application")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run-once", help="process new Telegram posts once (for cron / GitHub Actions)")
    d = sub.add_parser("daemon", help="keep running and react to posts within seconds")
    d.add_argument("--poll", type=int, default=50, help="Telegram long-poll seconds")
    a = sub.add_parser("apply", help="process one job link now (no Telegram needed)")
    a.add_argument("url")
    a.add_argument("--submit", action="store_true", help="actually press submit")
    a.add_argument("--telegram", action="store_true", help="send the report to Telegram instead of printing it")
    r = sub.add_parser("resolve", help="show where a link really leads")
    r.add_argument("url")
    rr = sub.add_parser("render", help="render a base resume to PDF (check the layout)")
    rr.add_argument("name", choices=["fullstack", "ai"])
    rr.add_argument("--out", default="")
    sub.add_parser("telegram-check", help="verify the bot token and list chats the bot has seen")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # its request log would print the bot token
    settings = Settings()

    if args.cmd == "run-once":
        run_once(settings)
    elif args.cmd == "daemon":
        while True:
            try:
                run_once(settings, long_poll=args.poll)
            except KeyboardInterrupt:
                raise
            except Exception:  # noqa: BLE001
                log.exception("run failed; retrying in 30s")
                time.sleep(30)
    elif args.cmd == "apply":
        settings.auto_submit = args.submit
        with ExitStack() as stack:
            pipeline, _, _ = _build(settings, stack, telegram=args.telegram)
            recs = pipeline.handle_urls([args.url], force=True)
            if not recs:
                print("Nothing processed.")
    elif args.cmd == "resolve":
        from .browser import BrowserSession, RenderFetcher
        from .links import HttpFetcher, LinkResolver

        with BrowserSession(settings.headless, settings.chromium_path) as session:
            llm = None
            try:
                from .llm import ClaudeLLM

                llm = ClaudeLLM(settings.model, settings.effort, settings.use_fallbacks)
            except Exception:  # noqa: BLE001
                pass
            res = LinkResolver(HttpFetcher(), RenderFetcher(session), llm).resolve(args.url)
            print(f"{res.url}\n  method: {res.method}  confident: {res.confident}")
            for hop in res.chain:
                print(f"  -> {hop}")
    elif args.cmd == "render":
        from pathlib import Path

        from .browser import BrowserSession
        from .render import render_resume_pdf

        out = Path(args.out or f"output/{args.name}.pdf")
        with BrowserSession(settings.headless, settings.chromium_path) as session:
            render_resume_pdf(session, load_resumes(settings)[args.name], load_profile(settings), out)
        print(out)
    elif args.cmd == "telegram-check":
        from .telegram_bot import TelegramBot

        bot = TelegramBot(settings.bot_token)
        me = bot.get_me()
        print(f"Bot OK: @{me.get('username')}")
        chats = {}
        for up in bot.get_updates(None):
            msg = up.get("message") or up.get("channel_post") or (up.get("callback_query") or {}).get("message") or {}
            chat = msg.get("chat")
            if chat:
                chats[chat["id"]] = f"{chat.get('type')}: {chat.get('title') or chat.get('username') or chat.get('first_name')}"
        if not chats:
            print("No chats seen yet. Send /start to the bot and post something in the group, then run again.")
        for cid, name in chats.items():
            print(f"  chat id {cid}  ({name})")


if __name__ == "__main__":
    main()
