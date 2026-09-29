#!/usr/bin/env bash
# Your personal data (profile, resumes, application log) is committed only encrypted, as data.enc,
# locked with the JOBBOT_STATE_KEY secret.
#   scripts/data.sh encrypt   # data/ -> data.enc   (after editing data/*.yaml)
#   scripts/data.sh decrypt   # data.enc -> data/
set -euo pipefail
: "${JOBBOT_STATE_KEY:?set JOBBOT_STATE_KEY}"
case "$1" in
  encrypt)
    files=(data/profile.yaml data/resumes/fullstack.yaml data/resumes/ai.yaml)
    [ -f data/applications.jsonl ] && files+=(data/applications.jsonl)
    tar -czf - "${files[@]}" \
      | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:JOBBOT_STATE_KEY -out data.enc
    ;;
  decrypt)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:JOBBOT_STATE_KEY -in data.enc | tar -xzf -
    ;;
esac
