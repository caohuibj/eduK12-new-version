#!/usr/bin/env bash

# Reproducible local release/deployment gate. All database and Redis state is
# created in uniquely named, short-lived Docker resources; this script never
# calls `docker compose down` and therefore cannot stop the developer stack.
#
# Code correctness is authoritative in GitHub CI. By default this gate assumes
# the exact SHA has already passed CI and verifies release-specific concerns:
# migration/backfill/preflight, production compose, production images, runtime
# permissions, and cleanup. Set RELEASE_VERIFY_RUN_CODE_GATES=true only when an
# explicit offline/full rerun of the duplicated code gates is required.
#
# Production sequencing is intentionally documented, not performed, here:
# drain/stop old API, workers, and public traffic before migration; backup;
# migrate; backfill all four public-token tables; validate/preflight; then
# build/start the new SHA and smoke-test public workflows before reopening.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SERVER_DIR/.." && pwd)"
BACKEND_DIR="$SERVER_DIR/backend"
FRONTEND_DIR="$SERVER_DIR/frontend"
BACKEND_CONTEXT_REL="${BACKEND_DIR#"$REPO_ROOT"/}"
FRONTEND_CONTEXT_REL="${FRONTEND_DIR#"$REPO_ROOT"/}"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)-$$"
REPORT_DIR="${RELEASE_VERIFY_OUTPUT_DIR:-${TMPDIR:-/tmp}/eduk12-release-verify-$RUN_ID}"
mkdir -p "$REPORT_DIR"

PG_NAME="eduk12-release-verify-${RUN_ID}-postgres"
REDIS_NAME="eduk12-release-verify-${RUN_ID}-redis"
PG_VOLUME="eduk12-release-verify-${RUN_ID}-pgdata"
REDIS_VOLUME="eduk12-release-verify-${RUN_ID}-redisdata"
BACKEND_IMAGE="eduk12-release-verify-${RUN_ID}:backend"
FRONTEND_IMAGE="eduk12-release-verify-${RUN_ID}:frontend"
PG_PORT=""
REDIS_PORT=""
EXIT_CODE=0
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SHA='unknown'
BRANCH='unknown'
RUN_CODE_GATES="${RELEASE_VERIFY_RUN_CODE_GATES:-false}"

log() { printf '[release-verify] %s\n' "$*"; }
fail() { printf '[release-verify] ERROR: %s\n' "$*" >&2; return 1; }

cleanup() {
  local original_status=$?
  local cleanup_status=0
  local image_cleanup_status=0
  set +e
  if command -v docker >/dev/null 2>&1; then
    docker rm -f "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true
    docker volume rm "$PG_VOLUME" "$REDIS_VOLUME" >/dev/null 2>&1 || true
    docker image rm "$BACKEND_IMAGE" "$FRONTEND_IMAGE" >/dev/null 2>&1 || true
  fi

  if command -v docker >/dev/null 2>&1; then
    if docker ps -a --format '{{.Names}}' | grep -Fxq "$PG_NAME"; then cleanup_status=1; fi
    if docker ps -a --format '{{.Names}}' | grep -Fxq "$REDIS_NAME"; then cleanup_status=1; fi
    if docker volume ls --format '{{.Name}}' | grep -Fxq "$PG_VOLUME"; then cleanup_status=1; fi
    if docker volume ls --format '{{.Name}}' | grep -Fxq "$REDIS_VOLUME"; then cleanup_status=1; fi
    if docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then cleanup_status=1; image_cleanup_status=1; fi
    if docker image inspect "$FRONTEND_IMAGE" >/dev/null 2>&1; then cleanup_status=1; image_cleanup_status=1; fi
  fi

  if [ "$original_status" -ne 0 ]; then EXIT_CODE="$original_status"; fi

  if [ "$cleanup_status" -ne 0 ]; then
    printf '[release-verify] ERROR: temporary Docker resources remain; inspect names prefixed with %s\n' "eduk12-release-verify-${RUN_ID}" >&2
    EXIT_CODE=1
  fi

  local ended_at
  ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  RELEASE_VERIFY_SUMMARY="$REPORT_DIR/summary.json" \
  RELEASE_VERIFY_RUN_ID="$RUN_ID" \
  RELEASE_VERIFY_SHA="$SHA" \
  RELEASE_VERIFY_BRANCH="$BRANCH" \
  RELEASE_VERIFY_STARTED_AT="$STARTED_AT" \
  RELEASE_VERIFY_ENDED_AT="$ended_at" \
  RELEASE_VERIFY_EXIT_CODE="$EXIT_CODE" \
  RELEASE_VERIFY_CLEANUP_STATUS="$cleanup_status" \
  RELEASE_VERIFY_REPORT_DIR="$REPORT_DIR" \
  RELEASE_VERIFY_BACKEND_IMAGE_ID="${BACKEND_IMAGE_ID:-}" \
  RELEASE_VERIFY_FRONTEND_IMAGE_ID="${FRONTEND_IMAGE_ID:-}" \
  RELEASE_VERIFY_IMAGE_CLEANUP_STATUS="$image_cleanup_status" \
  RELEASE_VERIFY_RUN_CODE_GATES="$RUN_CODE_GATES" \
  node --input-type=module - <<'NODE'
import fs from 'node:fs'
const output = {
  runId: process.env.RELEASE_VERIFY_RUN_ID,
  sha: process.env.RELEASE_VERIFY_SHA,
  branch: process.env.RELEASE_VERIFY_BRANCH,
  startedAt: process.env.RELEASE_VERIFY_STARTED_AT,
  endedAt: process.env.RELEASE_VERIFY_ENDED_AT,
  exitCode: Number(process.env.RELEASE_VERIFY_EXIT_CODE || 1),
  reportDirectory: process.env.RELEASE_VERIFY_REPORT_DIR,
  verificationScope: 'release-deployment-artifact',
  codeCorrectnessPrerequisite: 'same-sha-github-ci-green',
  codeGatesRerun: process.env.RELEASE_VERIFY_RUN_CODE_GATES === 'true',
  temporaryResourcesClean: Number(process.env.RELEASE_VERIFY_CLEANUP_STATUS || 1) === 0,
  temporaryImagesClean: Number(process.env.RELEASE_VERIFY_IMAGE_CLEANUP_STATUS || 1) === 0,
  imageIds: {
    backend: process.env.RELEASE_VERIFY_BACKEND_IMAGE_ID || null,
    frontend: process.env.RELEASE_VERIFY_FRONTEND_IMAGE_ID || null,
  },
}
fs.writeFileSync(process.env.RELEASE_VERIFY_SUMMARY, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 })
NODE
  printf '[release-verify] report: %s\n' "$REPORT_DIR"
  return "$EXIT_CODE"
}
trap cleanup EXIT

case "$RUN_CODE_GATES" in
  true|false) ;;
  *) fail 'RELEASE_VERIFY_RUN_CODE_GATES must be true or false'; exit 1 ;;
esac

if ! command -v docker >/dev/null 2>&1; then fail 'Docker is required'; exit 1; fi
if ! command -v npm >/dev/null 2>&1; then fail 'npm is required'; exit 1; fi
if ! docker info >/dev/null 2>&1; then fail 'Docker daemon is not available'; exit 1; fi

SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
if [ -z "$BRANCH" ]; then fail 'detached HEAD is not accepted for a release verification'; exit 1; fi
if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]; then
  fail 'tracked working-tree changes are present; commit or stash them before verification'
  exit 1
fi
if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all -- "$BACKEND_CONTEXT_REL" "$FRONTEND_CONTEXT_REL")" ]; then
  fail 'untracked files are present in backend/frontend build contexts; exact checkout is required'
  exit 1
fi

log 'production prerequisite reminder: drain/stop old API/workers/public traffic before applying NOT VALID token migrations; this gate never touches ptool-*'
if [ "$RUN_CODE_GATES" = 'false' ]; then
  log "code-correctness prerequisite: GitHub CI for exact SHA $SHA must already be green; duplicate code gates are skipped"
else
  log 'explicit full mode enabled: duplicated backend/frontend code gates will be rerun'
fi

git -C "$REPO_ROOT" diff --check >"$REPORT_DIR/git-diff-check.log"
node --version >"$REPORT_DIR/tool-versions.log"
npm --version >>"$REPORT_DIR/tool-versions.log"
docker --version >>"$REPORT_DIR/tool-versions.log"
docker compose version >>"$REPORT_DIR/tool-versions.log"
printf 'sha=%s\nbranch=%s\nstarted_at=%s\ncode_gates_rerun=%s\n' "$SHA" "$BRANCH" "$STARTED_AT" "$RUN_CODE_GATES" >"$REPORT_DIR/metadata.txt"

TEST_DB_USER='release_test'
TEST_DB_PASSWORD='release_test_password'
TEST_DB_NAME='eduk12_release'

log 'creating isolated PostgreSQL and Redis resources'
docker volume create "$PG_VOLUME" >/dev/null
docker volume create "$REDIS_VOLUME" >/dev/null
docker run -d --name "$PG_NAME" \
  -e POSTGRES_USER="$TEST_DB_USER" \
  -e POSTGRES_PASSWORD="$TEST_DB_PASSWORD" \
  -e POSTGRES_DB="$TEST_DB_NAME" \
  -v "$PG_VOLUME:/var/lib/postgresql/data" \
  -p 127.0.0.1::5432 postgres:14-alpine >"$REPORT_DIR/postgres-container-id.txt"
docker run -d --name "$REDIS_NAME" \
  -v "$REDIS_VOLUME:/data" \
  -p 127.0.0.1::6379 redis:7-alpine >"$REPORT_DIR/redis-container-id.txt"

wait_for_service() {
  local name="$1"
  local command="$2"
  local attempts=60
  while [ "$attempts" -gt 0 ]; do
    if docker exec "$name" sh -ec "$command" >/dev/null 2>&1; then return 0; fi
    attempts=$((attempts - 1))
    sleep 1
  done
  return 1
}

wait_for_service "$PG_NAME" "pg_isready -U '$TEST_DB_USER' -d '$TEST_DB_NAME'" || { docker logs "$PG_NAME" >"$REPORT_DIR/postgres.log" 2>&1 || true; fail 'isolated PostgreSQL did not become ready'; exit 1; }
wait_for_service "$REDIS_NAME" 'redis-cli ping' || { docker logs "$REDIS_NAME" >"$REPORT_DIR/redis.log" 2>&1 || true; fail 'isolated Redis did not become ready'; exit 1; }

PG_PORT="$(docker inspect -f '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$PG_NAME")"
REDIS_PORT="$(docker inspect -f '{{(index (index .NetworkSettings.Ports "6379/tcp") 0).HostPort}}' "$REDIS_NAME")"
DATABASE_URL="postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@127.0.0.1:${PG_PORT}/${TEST_DB_NAME}?schema=public"

export RELEASE_VERIFY_LOCAL=true
export NODE_ENV=test
export DATABASE_URL
export COGNITIVE_INTEGRATION_DB_URL="$DATABASE_URL"
export PR8_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export PR26_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export PR34_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export PR38_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export BUNDLE_PRODUCT_TEST_DATABASE_URL="$DATABASE_URL"
export RELEASE_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export V32_1_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export V32_2_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export V32_3_INTEGRATION_DATABASE_URL="$DATABASE_URL"
export REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
export JWT_SECRET='release-verify-jwt-secret-123456789012345678901234'
export DATA_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
export DATA_PSEUDONYM_KEY='fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
export COGNITIVE_MODULE_ENABLED=true
export ASSET_MIGRATION_COMPLETE=true
export ASSET_SIGNING_SECRET='release-verify-asset-secret-123456789012345678901234'
export CORS_ORIGIN='http://127.0.0.1'
export UPLOAD_DIR="$REPORT_DIR/uploads"
mkdir -p "$UPLOAD_DIR"

run_logged() {
  local log_name="$1"
  shift
  log "$*"
  "$@" >"$REPORT_DIR/$log_name" 2>&1
}

# Backend dependencies remain necessary for the host-side migration/backfill/
# preflight operators. Frontend dependencies are only needed in explicit full
# mode; the production Docker build installs its own exact dependencies.
run_logged backend-npm-ci.log npm --prefix "$BACKEND_DIR" ci
run_logged backend-migrate.log npm --prefix "$BACKEND_DIR" run db:migrate:guarded
ADMIN_USERNAME='release_verify_admin' ADMIN_PASSWORD='release_verify_admin_password_2026' \
  run_logged backend-seed.log npm --prefix "$BACKEND_DIR" run db:seed
run_logged backend-migrate-idempotent.log npm --prefix "$BACKEND_DIR" run db:migrate:guarded
run_logged backend-token-backfill.log npm --prefix "$BACKEND_DIR" run db:backfill:public-tokens
run_logged backend-data-preflight.log npm --prefix "$BACKEND_DIR" run db:release:preflight
log 'verifying a missing uploads directory fails the release preflight closed'
set +e
UPLOAD_DIR="$REPORT_DIR/missing-upload-dir" npm --prefix "$BACKEND_DIR" run db:release:preflight \
  >"$REPORT_DIR/backend-data-preflight-missing-dir.log" 2>&1
MISSING_UPLOAD_PREFLIGHT_STATUS=$?
set -e
printf 'exit_code=%s\n' "$MISSING_UPLOAD_PREFLIGHT_STATUS" >>"$REPORT_DIR/backend-data-preflight-missing-dir.log"
if [ "$MISSING_UPLOAD_PREFLIGHT_STATUS" -eq 0 ]; then
  fail 'release preflight unexpectedly passed with a missing uploads directory'
  exit 1
fi

if [ "$RUN_CODE_GATES" = 'true' ]; then
  run_logged backend-build.log npm --prefix "$BACKEND_DIR" run build
  run_logged backend-audit.log npm --prefix "$BACKEND_DIR" audit --audit-level=high --registry=https://registry.npmjs.org

  BACKEND_TEST_REPORT="$REPORT_DIR/backend-vitest.json"
  run_logged backend-test.log npm --prefix "$BACKEND_DIR" test -- --no-file-parallelism --reporter=default --reporter=json --outputFile="$BACKEND_TEST_REPORT"
  run_logged backend-test-report-check.log node "$BACKEND_DIR/scripts/assert-release-test-report.mjs" "$BACKEND_TEST_REPORT" \
    src/__tests__/bundle-product/product.postgres.integration.test.ts \
    src/__tests__/bundle-onboarding/lifecycle.postgres.integration.test.ts \
    src/__tests__/bundle-onboarding/content.postgres.integration.test.ts \
    src/__tests__/cognitive/concurrency.integration.test.ts \
    src/__tests__/composite/composite-analysis-snapshot.postgres.integration.test.ts \
    src/__tests__/questionnaire/aggregate-report.postgres.integration.test.ts \
    src/__tests__/questionnaire/form-answer.postgres.integration.test.ts \
    src/__tests__/questionnaire/form-answer-bulk-mutation.pr38.postgres.integration.test.ts \
    src/__tests__/integration/instrument-final-submit.postgres.integration.test.ts \
    src/__tests__/assessment-runtime/v32-1.postgres.integration.test.ts \
    src/__tests__/assessment-runtime/v32-2.postgres.integration.test.ts \
    src/__tests__/assessment-runtime/v32-3.postgres.integration.test.ts \
    src/__tests__/classroom/classroom-start.postgres.integration.test.ts \
    src/__tests__/integration/courseCodeRotationConcurrency.integration.test.ts \
    src/__tests__/integration/submissionIdempotencyReceipt.integration.test.ts \
    src/__tests__/hotpath/query-budget.postgres.integration.test.ts

  run_logged frontend-npm-ci.log npm --prefix "$FRONTEND_DIR" ci
  run_logged frontend-lint.log npm --prefix "$FRONTEND_DIR" run lint
  run_logged frontend-typecheck.log npm --prefix "$FRONTEND_DIR" run typecheck
  run_logged frontend-test.log npm --prefix "$FRONTEND_DIR" test
  run_logged frontend-build.log npm --prefix "$FRONTEND_DIR" run build
  run_logged frontend-audit.log npm --prefix "$FRONTEND_DIR" audit --audit-level=high --registry=https://registry.npmjs.org
fi

COMPOSE_ENV="$REPORT_DIR/compose.env"
umask 077
cat >"$COMPOSE_ENV" <<'ENV'
DB_USER=release_verify
DB_PASSWORD=release_verify_password
DB_NAME=eduk12_release
DATABASE_URL=postgresql://release_verify:release_verify_password@postgres:5432/eduk12_release?schema=public
POSTGRES_EXPORTER_DATA_SOURCE_NAME=postgresql://release_verify:release_verify_password@postgres:5432/eduk12_release?sslmode=disable
JWT_SECRET=release-verify-jwt-secret-123456789012345678901234
DATA_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
DATA_PSEUDONYM_KEY=fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
ASSET_SIGNING_SECRET=release-verify-asset-secret-123456789012345678901234
ASSET_MIGRATION_COMPLETE=true
COOKIE_SECURE=false
ADMIN_USERNAME=release_verify_admin
ADMIN_PASSWORD=release_verify_admin_password_2026
GRAFANA_PASSWORD=release_verify_grafana_password
COGNITIVE_MODULE_ENABLED=true
VITE_COGNITIVE_MODULE_ENABLED=true
CORS_ORIGIN=http://127.0.0.1
ENV
run_logged compose-config.log docker compose --project-name "eduk12-release-verify-$RUN_ID" --env-file "$COMPOSE_ENV" -f "$SERVER_DIR/docker-compose.yml" config
run_logged compose-monitoring-config.log docker compose --project-name "eduk12-release-verify-$RUN_ID" --env-file "$COMPOSE_ENV" -f "$SERVER_DIR/docker-compose.yml" -f "$SERVER_DIR/docker-compose.monitoring.yml" config

log 'building temporary production runtime images'
run_logged backend-image-build.log docker build --target runtime --tag "$BACKEND_IMAGE" "$BACKEND_DIR"
run_logged frontend-image-build.log docker build --tag "$FRONTEND_IMAGE" "$FRONTEND_DIR"
run_logged backend-runtime-smoke.log docker run --rm --user node --entrypoint sh "$BACKEND_IMAGE" -ec '
set -eu
test "$(id -u)" -ne 0
for directory in /app/uploads /app/.local /app/exports; do
  test -d "$directory"
  test -w "$directory"
  marker="$directory/.release-verify-write-test"
  printf "release-verify" >"$marker"
  test -s "$marker"
  rm -f "$marker"
done
'
BACKEND_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$BACKEND_IMAGE")"
FRONTEND_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$FRONTEND_IMAGE")"
printf 'backend=%s\nfrontend=%s\n' "$BACKEND_IMAGE_ID" "$FRONTEND_IMAGE_ID" >"$REPORT_DIR/image-ids.txt"

log 'release verification completed successfully'
EXIT_CODE=0
