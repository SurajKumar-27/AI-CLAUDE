# jobbot: Telegram job posts → tailored resume → filled application

When a job is posted in your Telegram group, jobbot:

1. **Pulls every link out of the post.** It finds plain URLs, links hidden behind text, and "Apply" buttons.
2. **Follows each link to the real job page.** It handles shorteners and trackers (`bit.ly`, `lnkd.in`, `?url=`), `<meta refresh>` and JavaScript redirects, and blog or aggregator posts that only contain an "Apply here" link somewhere on the page. When several links look plausible, Claude picks the one that is the job.
3. **Reads the job description and picks a resume:**
   - **fullstack**: full-stack, backend or frontend JS/TS, Node, React, Python web
   - **ai**: AI/ML/LLM, RAG, agents, NLP, data science
   - **other**: Spring Boot/Java, .NET, DevOps, QA, generic SDE and so on. This starts from the full-stack resume, the broadest one, and moves the skills you actually have for that job to the front.
4. **Makes small, truthful edits** to that resume for the job, then renders it as a one-page PDF. The rules are enforced in code, not just requested from the model. A rejected edit is reverted and reported to you:
   - bullets stay under the same role and may only be reordered or reworded
   - a reworded bullet cannot add a number or technology that isn't already in that bullet (or in another bullet about the same company)
   - skills come only from your two resumes plus `extra_skills` in your profile
   - the summary and cover letter can only use numbers and technologies already on your resume
5. **Opens the application form in headless Chrome.** It clicks "Apply", fills your details, uploads the tailored PDF (and a cover letter if the form asks), and answers screening questions from your profile. Anything your profile doesn't answer is left for you.
6. **Messages you on Telegram** with the job, the tailored resume PDF, a screenshot of the filled form, every answer it used (for copy-paste) and the skills the job asks for that your resume lacks. The buttons are:
   - **✅ Submit**: submits the form it prepared (review mode, the default)
   - **👤 I'll do it** / **✔ I applied**: marks it as yours
   - **🔁 Try again** / **🗑 Skip**

### When it stops and hands the job to you

- The site needs **your account**: LinkedIn, Naukri, Indeed, Workday, Taleo, SuccessFactors, iCIMS-style portals and others. jobbot never creates accounts and never stores passwords.
- There is a **visible CAPTCHA**.
- A required question has no answer in your profile (expected CTC, notice period and so on). Fill those in `profile.yaml` once and they're answered from then on.
- The form rejects an answer, or there's no confirmation after submitting.

In each case you still get the tailored resume and the answers, so applying by hand takes a minute.

Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters and plain company career forms usually need no login, so these can be filled completely.

## Setup (all in the browser, nothing on your PC)

### 1. Telegram bot

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the **token**.
2. Open your new bot and send it `/start`. This lets it message you.
3. **If you're an admin of the job group:** add the bot to the group. In BotFather, use `/mybots` → your bot → *Bot Settings* → *Group Privacy* → **Turn off**, so the bot sees every message.
   **If you're not an admin**, use "user mode" (step 5) instead.
4. Find the chat IDs. Message **@userinfobot** to get your own numeric ID. To get the group's ID (it looks like `-100…`), forward a message from the group to **@RawDataBot** (or @userinfobot) and read `forward_from_chat.id`. `python -m jobbot telegram-check` also lists every chat the bot has seen.

### 2. Claude API key

Create a key at <https://console.anthropic.com> → *API keys*. This is separate from a claude.ai subscription and is billed per use.

### 3. GitHub secrets

In the repo, go to *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Claude API key |
| `TELEGRAM_BOT_TOKEN` | from BotFather |
| `TELEGRAM_SOURCE_CHAT` | the job group's ID (`-100…`) or `@username` |
| `TELEGRAM_NOTIFY_CHAT_ID` | your own Telegram user ID (reports go here) |
| `JOBBOT_STATE_KEY` | the key that unlocks `data.enc` (your encrypted profile + resumes) and the saved state |

Optional **variables** (same page, *Variables* tab):

- `JOBBOT_AUTO_SUBMIT=true`: submit without asking you first. Start with review mode.
- `JOBBOT_MODEL`: defaults to `claude-opus-5`.
- `JOBBOT_MIN_FIT`: skip jobs whose fit score is below this value (0–100).
- `TELEGRAM_MODE=user`: see step 5.

Your personal details are only in the repository in encrypted form (`data.enc`, AES-256, unlocked by `JOBBOT_STATE_KEY`). `data/` itself is git-ignored. After editing `data/*.yaml`, run `JOBBOT_STATE_KEY=... scripts/data.sh encrypt` and commit `data.enc`. Alternatively, put the three files in the secrets `JOBBOT_PROFILE_YAML`, `JOBBOT_RESUME_FULLSTACK_YAML` and `JOBBOT_RESUME_AI_YAML`, which take precedence over `data.enc`.

### 4. Turn it on

The workflow runs from the repository's **default branch** and checks Telegram every 10 minutes. Runs with nothing new finish in a few seconds without installing anything. You can also send a job link **directly to your bot** at any time, and it will be processed on the next run.

To run it right away: *Actions → jobbot → Run workflow*, optionally with a single job URL.

### 5. User mode (a group or channel where you can't add a bot)

jobbot reads the group as **you** and still sends reports through your bot. You don't have to be an admin.

1. Go to <https://my.telegram.org>, log in with your phone, open **API development tools**, and create an app (any name). Copy the **api_id** and **api_hash**.
2. Open <https://colab.research.google.com> → **New notebook**, paste this into the cell, and press ▶:

   ```python
   !pip -q install telethon
   from telethon import TelegramClient
   from telethon.sessions import StringSession
   client = TelegramClient(StringSession(), int(input("api_id: ")), input("api_hash: "))
   await client.start()  # asks for your phone number, the login code Telegram sends you, and your 2FA password if set
   print("\nTELEGRAM_SESSION:\n" + client.session.save() + "\n")
   async for d in client.iter_dialogs(limit=100):
       print(d.id, "|", d.name)
   await client.disconnect()
   ```

   It prints a long **session string** and a list of your chats with their IDs. Find the job group in that list.
3. Add these secrets: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` (the long string), and `TELEGRAM_SOURCE_CHAT` (the group's ID from the list).
4. Add the **variable** `TELEGRAM_MODE` = `user` (the *Variables* tab, next to Secrets).

The session string is a logged-in session of your account, so keep it secret and delete the Colab notebook afterwards. jobbot only reads the one group; it never posts there. You can revoke the session any time in Telegram under *Settings → Devices*.

## Your data files

```
data/profile.yaml             contact details + form answers (notice period, CTC, relocation, EEO ...)
data/resumes/fullstack.yaml   full-stack / backend resume
data/resumes/ai.yaml          AI resume
```

`data.example/` shows the format. Fill in every `null` in `profile.yaml` that you're comfortable answering. Each `null` makes jobbot ask you whenever a form requires that answer.

## Running it elsewhere

```bash
pip install -r requirements.txt && python -m playwright install --with-deps chromium
python -m jobbot apply <job-url>            # one job, report printed, nothing submitted
python -m jobbot apply <job-url> --submit   # ...and submit
python -m jobbot resolve <link>             # just show where a link leads
python -m jobbot render fullstack           # check the resume layout
python -m jobbot daemon                     # always-on mode: reacts within seconds (for a VPS)
```

Tests (no network or API key needed; they use a local fake job site and a fake Claude):

```bash
pip install -r requirements-dev.txt && pytest
```

## Costs and limits

- Claude API: about 3–4 calls per job (screening, tailoring, form answers and sometimes link picking). That's roughly US$0.10–0.25 per job on `claude-opus-5`. Set `JOBBOT_MODEL=claude-sonnet-5` to cut this by more than half.
- GitHub Actions is free for public repositories. A private repository on the free plan gets 2,000 minutes a month: about 1 minute per run with work, and a few seconds for empty checks.
- GitHub pauses scheduled workflows after 60 days without commits to the repository. Re-enable it on the Actions tab.
- Web forms vary a lot. Unusual custom widgets can defeat the filler, and then you get a "Needs you" report with everything prepared. Check the screenshot before tapping Submit, at least for the first few jobs.
