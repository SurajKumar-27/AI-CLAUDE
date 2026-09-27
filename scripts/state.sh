#!/usr/bin/env bash
# The run state (job records, answers, tailored PDFs) is stored in the Actions cache
# ENCRYPTED with JOBBOT_STATE_KEY, because caches of a public repo can be read by
# workflows from forks. Usage: state.sh pack | unpack
set -euo pipefail
: "${JOBBOT_STATE_KEY:?add a JOBBOT_STATE_KEY secret (any long random string)}"
case "$1" in
  pack)
    mkdir -p state .state-cache
    tar -czf - state | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:JOBBOT_STATE_KEY -out .state-cache/state.tgz.enc
    ;;
  unpack)
    if [ -f .state-cache/state.tgz.enc ]; then
      openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:JOBBOT_STATE_KEY -in .state-cache/state.tgz.enc | tar -xzf -
    fi
    mkdir -p state
    ;;
esac
