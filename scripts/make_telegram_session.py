"""One-time login for TELEGRAM_MODE=user (reading a group through your own account).

Run it anywhere with Python - Google Colab works, nothing is installed on your PC:
    pip install telethon
    python make_telegram_session.py
It asks for your API id/hash (from https://my.telegram.org -> API development tools),
your phone number and the login code Telegram sends you, then prints a session string.
Save that string as the TELEGRAM_SESSION secret. Treat it like a password: it is a
logged-in session of your Telegram account. Revoke it any time in Telegram under
Settings -> Devices.
"""
from telethon.sessions import StringSession
from telethon.sync import TelegramClient

api_id = int(input("API id: ").strip())
api_hash = input("API hash: ").strip()
with TelegramClient(StringSession(), api_id, api_hash) as client:
    print("\nTELEGRAM_SESSION =\n" + client.session.save())
    print("\nYour chats (use the id or @username of the job group as TELEGRAM_SOURCE_CHAT):")
    for dialog in client.iter_dialogs(limit=60):
        print(f"  {dialog.id:>16}  {dialog.name}")
