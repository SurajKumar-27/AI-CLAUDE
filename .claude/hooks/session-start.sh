#!/bin/bash
# Cloud sessions: unlock your profile + resumes (data.enc) so job matches can be scored against them.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
if [ ! -f data/profile.yaml ] && [ -f data.enc ]; then
  if [ -n "${JOBBOT_STATE_KEY:-}" ]; then
    scripts/data.sh decrypt || echo "could not decrypt data.enc - check JOBBOT_STATE_KEY" >&2
  else
    echo "JOBBOT_STATE_KEY is not set, so data.enc (profile + resumes) stays locked" >&2
  fi
fi
