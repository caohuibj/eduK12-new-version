#!/bin/sh
set -eu

ran_suite=0

if [ -n "${COGNITIVE_INTEGRATION_DB_URL:-}" ]; then
  ran_suite=1
  npm --prefix server-version/backend run test:integration:cognitive
else
  echo "Skipping Cognitive concurrency integration: COGNITIVE_INTEGRATION_DB_URL is not configured" >&2
fi

if [ -n "${PR8_INTEGRATION_DATABASE_URL:-}" ]; then
  ran_suite=1
  npm --prefix server-version/backend run test:integration:composite
else
  echo "Skipping Composite snapshot integration: PR8_INTEGRATION_DATABASE_URL is not configured" >&2
fi

if [ "$ran_suite" -eq 0 ]; then
  echo "At least one dedicated backend integration database URL is required; shared development databases are not accepted" >&2
  exit 2
fi
