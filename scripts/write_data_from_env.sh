#!/usr/bin/env bash
# Recreates data/ from the YAML secrets if set, otherwise from the encrypted data.enc.
set -euo pipefail
mkdir -p data/resumes
if [ -n "${JOBBOT_PROFILE_YAML:-}" ]; then
  printf '%s\n' "$JOBBOT_PROFILE_YAML" > data/profile.yaml
  printf '%s\n' "$JOBBOT_RESUME_FULLSTACK_YAML" > data/resumes/fullstack.yaml
  printf '%s\n' "$JOBBOT_RESUME_AI_YAML" > data/resumes/ai.yaml
elif [ -f data.enc ]; then
  scripts/data.sh decrypt || { echo "::error::could not decrypt data.enc - is JOBBOT_STATE_KEY right?"; exit 1; }
fi
for f in data/profile.yaml data/resumes/fullstack.yaml data/resumes/ai.yaml; do
  [ -s "$f" ] && [ "$(wc -c < "$f")" -gt 20 ] || { echo "::error::$f is empty - add the matching secret"; exit 1; }
done
