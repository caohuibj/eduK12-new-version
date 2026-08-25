#!/bin/sh
set -eu

if [ -z "${COGNITIVE_INTEGRATION_DB_URL:-}" ]; then
  echo "COGNITIVE_INTEGRATION_DB_URL is required for backend integration evidence" >&2
  exit 2
fi

exec npm --prefix server-version/backend run test:integration
