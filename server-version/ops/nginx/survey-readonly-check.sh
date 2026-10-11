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
echo 'Survey HTTPS endpoint and Nginx host declaration observed.'
echo 'Additional production acceptance: compare live backend image/Compose revision and verify /api/survey/auth/capabilities with approved flags.'
