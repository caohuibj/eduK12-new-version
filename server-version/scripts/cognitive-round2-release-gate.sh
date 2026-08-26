#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${SERVER_DIR}/.." && pwd)"
RUN_DOCKER="${COGNITIVE_R2_GATE_RUN_DOCKER:-0}"
RUN_E2E="${COGNITIVE_R2_GATE_RUN_E2E:-0}"
GATE_ENV_FILE="${COGNITIVE_GATE_ENV_FILE:-}"
GATE_PROJECT_PREFIX="${COGNITIVE_R2_GATE_PROJECT:-eduk12-pr14-gate}"
GATE_RUN_ID="${COGNITIVE_R2_GATE_RUN_ID:-$(date -u +%Y%m%d%H%M%S)-$$}"
GATE_HTTP_PORT="${COGNITIVE_R2_GATE_HTTP_PORT:-8088}"
GATE_BASE_REF="${COGNITIVE_R2_GATE_BASE_REF:-}"
GATE_HEAD_REF="${COGNITIVE_R2_GATE_HEAD_REF:-HEAD}"

if [[ ! "${GATE_PROJECT_PREFIX}" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$ ]]; then
  echo "Invalid COGNITIVE_R2_GATE_PROJECT; use a short project prefix." >&2
  exit 1
fi
if [[ ! "${GATE_RUN_ID}" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,20}$ ]]; then
  echo "Invalid COGNITIVE_R2_GATE_RUN_ID; use a short run identifier." >&2
  exit 1
fi
GATE_PROJECT="${GATE_PROJECT_PREFIX}-${GATE_RUN_ID}"
if [[ ! "${GATE_PROJECT}" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$ ]]; then
  echo "The generated Gate project name is too long." >&2
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

if [[ -z "${GATE_BASE_REF}" ]]; then
  echo "COGNITIVE_R2_GATE_BASE_REF is required; pass the reviewed PR base commit or ref." >&2
  exit 1
fi
if ! GATE_BASE_SHA="$(git -C "${REPO_DIR}" rev-parse --verify "${GATE_BASE_REF}^{commit}" 2>/dev/null)"; then
  echo "COGNITIVE_R2_GATE_BASE_REF does not resolve to a commit: ${GATE_BASE_REF}" >&2
  exit 1
fi
if ! GATE_HEAD_SHA="$(git -C "${REPO_DIR}" rev-parse --verify "${GATE_HEAD_REF}^{commit}" 2>/dev/null)"; then
  echo "COGNITIVE_R2_GATE_HEAD_REF does not resolve to a commit: ${GATE_HEAD_REF}" >&2
  exit 1
fi

bash "${SCRIPT_DIR}/cognitive-round2-release-gate-scope.sh" "${REPO_DIR}" "${GATE_BASE_SHA}" "${GATE_HEAD_SHA}"
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
git -C "${REPO_DIR}" diff --cached --check

node "${SERVER_DIR}/e2e/validate-cognitive-round2-gate-evidence.test.cjs"
bash "${SERVER_DIR}/scripts/cognitive-round2-release-gate-scope.test.sh"

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
export FRONTEND_HTTP_PORT="${GATE_HTTP_PORT}"

compose_ready=1
cleanup() {
  if [[ "${compose_ready}" == "1" ]]; then
    docker compose "${COMPOSE_ARGS[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

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
