#!/usr/bin/env bash
# Cloud sessions reach the web through a TLS-inspecting proxy. curl/pip trust its CA
# through /root/.ccr/ca-bundle.crt; Chromium only trusts its own NSS store, so copy the
# proxy's CA certificates (the ones issued by Anthropic) into it. Certificate checks stay on.
set -euo pipefail
bundle="${CCR_CA_BUNDLE:-/root/.ccr/ca-bundle.crt}"
[ -f "$bundle" ] || exit 0
command -v certutil >/dev/null || { apt-get install -y -qq libnss3-tools >/dev/null 2>&1 || true; }
command -v certutil >/dev/null || { echo "trust-proxy-ca: certutil unavailable; Chromium may reject HTTPS" >&2; exit 0; }
db="sql:$HOME/.pki/nssdb"
mkdir -p "$HOME/.pki/nssdb"
[ -f "$HOME/.pki/nssdb/cert9.db" ] || certutil -N -d "$db" --empty-password
tmp=$(mktemp -d)
awk -v dir="$tmp" '/BEGIN CERTIFICATE/{n++; f=sprintf("%s/%03d.pem", dir, n)} f{print > f} /END CERTIFICATE/{close(f); f=""}' "$bundle"
for pem in "$tmp"/*.pem; do
  subject=$(openssl x509 -noout -subject -in "$pem" 2>/dev/null || true)
  case "$subject" in *Anthropic*) ;; *) continue ;; esac
  fp=$(openssl x509 -noout -fingerprint -sha256 -in "$pem" | tr -d ':' | cut -d= -f2 | cut -c1-16)
  certutil -A -d "$db" -t "C,," -n "proxy-ca-$fp" -i "$pem"
done
rm -rf "$tmp"
