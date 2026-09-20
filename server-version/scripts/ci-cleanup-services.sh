#!/usr/bin/env bash
# Only the exact ephemeral service IDs supplied by the current Actions job.
# --volumes removes anonymous image-created volumes; named volumes are retained.
set -euo pipefail
for service_id in "${CI_POSTGRES_SERVICE_ID:-}" "${CI_REDIS_SERVICE_ID:-}"; do
  [[ -n "$service_id" ]] || continue
  if [[ ! "$service_id" =~ ^[a-f0-9]{64}$ ]]; then
    echo "Invalid CI service container ID" >&2
    exit 1
  fi
  if docker container inspect "$service_id" >/dev/null 2>&1; then
    docker container rm --force --volumes "$service_id"
  fi
done
