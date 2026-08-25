#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${SERVER_DIR}/.." && pwd)"
RUN_DOCKER="${COGNITIVE_R2_GATE_RUN_DOCKER:-0}"
RUN_E2E="${COGNITIVE_R2_GATE_RUN_E2E:-0}"
GATE_ENV_FILE="${COGNITIVE_GATE_ENV_FILE:-}"
GATE_PROJECT="${COGNITIVE_R2_GATE_PROJECT:-eduk12-pr14-gate}"
GATE_HTTP_PORT="${COGNITIVE_R2_GATE_HTTP_PORT:-8088}"

if [[ ! "${GATE_PROJECT}" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$ ]]; then
  echo "Invalid COGNITIVE_R2_GATE_PROJECT; use a short project-scoped name." >&2
  exit 1
fi
if ! [[ "${GATE_HTTP_PORT}" =~ ^[0-9]+$ ]] || (( GATE_HTTP_PORT < 1024 || GATE_HTTP_PORT > 65535 )); then
  echo "Invalid COGNITIVE_R2_GATE_HTTP_PORT; use a TCP port from 1024 through 65535." >&2
  exit 1
fi

fail_external_gate() {
  echo "PR14 automated checks are complete, but the external release Gate is BLOCKED: $1" >&2
  exit 2
}

required() {
  [[ -n "$1" ]] || fail_external_gate "$2 is required"
}

if [[ -n "$(git -C "${REPO_DIR}" diff --name-only -- server-version/backend/prisma/schema.prisma server-version/backend/prisma/migrations)" ]]; then
  echo "PR14 gate refuses to run with Prisma schema or migration changes." >&2
  exit 1
fi
if ! git -C "${REPO_DIR}" diff --quiet -- server-version/frontend/src/modules/reporting/ScaleUnitReportCard.tsx; then
  echo "PR14 gate refuses to run because ScaleUnitReportCard.tsx changed." >&2
  exit 1
fi
if [[ -n "$(git -C "${REPO_DIR}" ls-files --others --exclude-standard -- server-version/backend/prisma/schema.prisma server-version/backend/prisma/migrations)" ]]; then
  echo "PR14 gate refuses to run with untracked Prisma schema or migration files." >&2
  exit 1
fi
if [[ "${RUN_DOCKER}" == "1" ]]; then
  required "${PR8_INTEGRATION_DATABASE_URL:-}" "PR8_INTEGRATION_DATABASE_URL"
  required "${COGNITIVE_INTEGRATION_DB_URL:-}" "COGNITIVE_INTEGRATION_DB_URL"
fi

cd "${SERVER_DIR}/backend"
npx tsc --noEmit
npm test -- --reporter=dot
if [[ "${RUN_DOCKER}" == "1" ]]; then
  npm run test:integration:pr8 -- --reporter=dot
  npm run test:integration -- --reporter=dot
fi
npm run build
npx prisma validate

cd "${SERVER_DIR}/frontend"
npx tsc -p tsconfig.cognitive.json --noEmit
npm test -- --reporter=dot
npm run build

git -C "${REPO_DIR}" diff --check

if [[ "${RUN_DOCKER}" != "1" ]]; then
  fail_external_gate "set COGNITIVE_R2_GATE_RUN_DOCKER=1 with a dedicated Gate env file to run isolated Docker build and smoke"
fi
required "${GATE_ENV_FILE}" "COGNITIVE_GATE_ENV_FILE"
if [[ ! -f "${GATE_ENV_FILE}" ]]; then
  fail_external_gate "dedicated COGNITIVE_GATE_ENV_FILE does not exist"
fi
GATE_ENV_FILE="$(cd "$(dirname "${GATE_ENV_FILE}")" && pwd)/$(basename "${GATE_ENV_FILE}")"
if [[ "${GATE_ENV_FILE}" == "${SERVER_DIR}/.env" ]]; then
  fail_external_gate "COGNITIVE_GATE_ENV_FILE must not target the shared backend .env"
fi
if [[ "${COGNITIVE_R2_GATE_ISOLATED_DB:-0}" != "1" ]]; then
  fail_external_gate "set COGNITIVE_R2_GATE_ISOLATED_DB=1; the baseline/shared database is not an allowed Gate target"
fi
COMPOSE_ARGS=(--project-name "${GATE_PROJECT}" --env-file "${GATE_ENV_FILE}" -f "${SERVER_DIR}/docker-compose.yml" -f "${SERVER_DIR}/docker-compose.pr14-gate.yml")

cd "${SERVER_DIR}"
docker compose "${COMPOSE_ARGS[@]}" config >/dev/null
docker compose "${COMPOSE_ARGS[@]}" build backend frontend migrate seed
docker compose "${COMPOSE_ARGS[@]}" --profile ops run --rm migrate
docker compose "${COMPOSE_ARGS[@]}" --profile ops run --rm seed
docker compose "${COMPOSE_ARGS[@]}" up -d --force-recreate backend frontend

backend_container=""
frontend_container=""
for _ in $(seq 1 60); do
  backend_container="$(docker compose "${COMPOSE_ARGS[@]}" ps -q backend)"
  frontend_container="$(docker compose "${COMPOSE_ARGS[@]}" ps -q frontend)"
  backend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${backend_container}" 2>/dev/null || true)"
  frontend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${frontend_container}" 2>/dev/null || true)"
  if [[ "${backend_health}" == "healthy" && "${frontend_health}" == "healthy" ]]; then
    break
  fi
  sleep 2
done

[[ -n "${backend_container}" ]] && test "$(docker inspect --format '{{.State.Health.Status}}' "${backend_container}")" = "healthy"
[[ -n "${frontend_container}" ]] && test "$(docker inspect --format '{{.State.Health.Status}}' "${frontend_container}")" = "healthy"
curl --fail --silent --show-error "http://127.0.0.1:${GATE_HTTP_PORT}/" >/dev/null

if [[ "${RUN_E2E}" != "1" ]]; then
  fail_external_gate "Docker smoke passed, but COGNITIVE_R2_GATE_RUN_E2E=1 and a fixture manifest are required"
fi
if [[ "${COGNITIVE_R2_E2E_ISOLATED_DB:-0}" != "1" ]]; then
  fail_external_gate "set COGNITIVE_R2_E2E_ISOLATED_DB=1 for the browser fixture service"
fi
required "${COGNITIVE_R2_E2E_FIXTURE_FILE:-}" "COGNITIVE_R2_E2E_FIXTURE_FILE"

COGNITIVE_E2E_BASE_URL="${COGNITIVE_E2E_BASE_URL:-http://127.0.0.1:${GATE_HTTP_PORT}}" \
  node "${SERVER_DIR}/e2e/cognitive-round2-browser-e2e.cjs"

EVIDENCE_FILE="${COGNITIVE_R2_GATE_EVIDENCE_FILE:-}"
if [[ -z "${EVIDENCE_FILE}" || ! -f "${EVIDENCE_FILE}" ]]; then
  fail_external_gate "COGNITIVE_R2_GATE_EVIDENCE_FILE must point to approved Chrome/stimulus/scale review evidence"
fi
node "${SERVER_DIR}/e2e/validate-cognitive-round2-gate-evidence.cjs" "${EVIDENCE_FILE}"

echo "PR14 automated release Gate: PASS"
