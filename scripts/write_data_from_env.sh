#!/usr/bin/env bash
# Recreates data/ from secrets so personal details never live in the repository.
set -euo pipefail
mkdir -p data/resumes
printf '%s\n' "$JOBBOT_PROFILE_YAML" > data/profile.yaml
printf '%s\n' "$JOBBOT_RESUME_FULLSTACK_YAML" > data/resumes/fullstack.yaml
printf '%s\n' "$JOBBOT_RESUME_AI_YAML" > data/resumes/ai.yaml
for f in data/profile.yaml data/resumes/fullstack.yaml data/resumes/ai.yaml; do
  [ -s "$f" ] && [ "$(wc -c < "$f")" -gt 20 ] || { echo "::error::$f is empty - add the matching secret"; exit 1; }
done
