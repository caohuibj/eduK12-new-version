#!/usr/bin/env bash
# Read-only Survey domain verification. Never reload/restart nginx, issue certs,
# modify production settings, or disclose private-key contents.
set -euo pipefail
domain=survey.eduk12.top
printf '%s\n' '[Survey] DNS resolve:'
getent ahosts "$domain" | head -5 || { echo 'BLOCKED: Survey DNS lookup failed'; exit 20; }
printf '%s\n' '[Survey] HTTPS certificate/HTTP response:'
curl --fail --silent --show-error --max-time 10 --head "https://$domain/" \
  | grep -Ei '^(HTTP/|server:|content-type:|location:|strict-transport-security:)' || {
    echo 'BLOCKED: Survey TLS/HTTP entry not confirmed'; exit 21;
  }
printf '%s\n' '[Survey] Nginx actual loaded site (read only):'
if ! command -v nginx >/dev/null 2>&1; then
  echo 'UNVERIFIED: nginx binary not visible to this account'; exit 22
fi
# Capture errors without printing key paths or secrets beyond the intended host.
actual="$(nginx -T 2>&1)" || {
  echo 'UNVERIFIED: nginx -T needs access to host config. No retry with password.'; exit 23;
}
if ! printf '%s\n' "$actual" | grep -Eq 'server_name[[:space:]]+survey\.eduk12\.top([[:space:];]|$)'; then
  echo 'BLOCKED: no explicit survey.eduk12.top server_name in Nginx effective config'; exit 24;
fi
printf '%s\n' '[Survey] Read-only Product/API route check:'
# A healthy SPA root is insufficient: require backend JSON through actual Host.
capabilities="$(curl --fail --silent --show-error --max-time 10 --header 'Accept: application/json' \
  "https://$domain/api/survey/auth/capabilities")" || {
  echo 'BLOCKED: Survey backend capabilities not served at the public Host'; exit 25;
}
if ! printf '%s\n' "$capabilities" | grep -Eq '"code"[[:space:]]*:[[:space:]]*0'; then
  echo 'BLOCKED: public /api/survey route did not return a Survey API success'; exit 26;
fi
if ! printf '%s\n' "$capabilities" | grep -Eq '"analytics"[[:space:]]*:[[:space:]]*(true|false)' \
  || ! printf '%s\n' "$capabilities" | grep -Eq '"publication"[[:space:]]*:[[:space:]]*(true|false)'; then
  echo 'BLOCKED: expected Survey capability keys missing'; exit 27;
fi
echo 'Survey TLS, Nginx declaration and capabilities route observed (read-only).'
echo 'Activation still requires approved backend flags, same release image and negative cross-origin checks.'
