#!/bin/sh
set -eu

template=/etc/alertmanager/alertmanager.yml
runtime=/tmp/alertmanager.yml

if [ -n "${ALERTMANAGER_WEBHOOK_URL:-}" ]; then
  case "$ALERTMANAGER_WEBHOOK_URL" in
    http://*|https://*) ;;
    *) echo 'ALERTMANAGER_WEBHOOK_URL must use http(s)' >&2; exit 1 ;;
  esac
  case "$ALERTMANAGER_WEBHOOK_URL" in
    *[\"\'[:space:]]*) echo 'ALERTMANAGER_WEBHOOK_URL contains unsupported characters' >&2; exit 1 ;;
  esac
  {
    printf '%s\n' 'global:' '  resolve_timeout: 5m' '' 'route:' '  receiver: protected-webhook' '  group_by: ["alertname", "service"]' '  group_wait: 30s' '  group_interval: 5m' '  repeat_interval: 4h' '' 'receivers:' '  - name: local' '  - name: protected-webhook' '    webhook_configs:'
    printf '      - url: "%s"\n' "$ALERTMANAGER_WEBHOOK_URL"
  } > "$runtime"
  exec /bin/alertmanager --config.file="$runtime"
fi

echo 'ALERTMANAGER_WEBHOOK_URL is not configured; retaining local alert state only' >&2
exec /bin/alertmanager --config.file="$template"
