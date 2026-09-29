#!/bin/bash
# Cloud sessions: install jobbot's dependencies and unlock your encrypted data.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# A project venv: the system Python's cryptography build breaks pypdf.
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q --disable-pip-version-check -r requirements-dev.txt

# Let Chromium trust the session's HTTPS proxy (curl/pip already do).
scripts/trust-proxy-ca.sh || echo "jobbot: could not add the proxy CA for Chromium" >&2

# Playwright's own browser download isn't needed: jobbot uses the preinstalled Chromium.
echo "export PATH=\"$CLAUDE_PROJECT_DIR/.venv/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
echo "export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1" >> "$CLAUDE_ENV_FILE"

# Personal data lives in the repo only as data.enc; JOBBOT_STATE_KEY (an environment
# variable set in the cloud environment's settings) unlocks it.
if [ ! -f data/profile.yaml ] && [ -f data.enc ]; then
  if [ -n "${JOBBOT_STATE_KEY:-}" ]; then
    scripts/data.sh decrypt || echo "jobbot: could not decrypt data.enc - check JOBBOT_STATE_KEY" >&2
  else
    echo "jobbot: JOBBOT_STATE_KEY is not set, so data.enc (profile + resumes) stays locked" >&2
  fi
fi
