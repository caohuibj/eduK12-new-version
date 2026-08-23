#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GATE_ENV_FILE="${COGNITIVE_GATE_ENV_FILE:-${SERVER_DIR}/.env}"
GATE_CORS_ORIGIN="${COGNITIVE_GATE_CORS_ORIGIN:-http://127.0.0.1}"
E2E_NODE="${COGNITIVE_E2E_NODE:-node}"

if [[ ! -f "${GATE_ENV_FILE}" ]]; then
  echo "Round 1 gate requires COGNITIVE_GATE_ENV_FILE or ${SERVER_DIR}/.env" >&2
  exit 2
fi

# The gate always exercises production-mode startup with an explicit origin.
# Shell values take precedence over an env-file value such as the unsafe legacy "*".
export CORS_ORIGIN="${GATE_CORS_ORIGIN}"
export COMPOSE_PROGRESS="${COMPOSE_PROGRESS:-plain}"

cd "${SERVER_DIR}/backend"
npx tsc --noEmit
npx vitest run

cd "${SERVER_DIR}/frontend"
npx tsc -p tsconfig.cognitive.json --noEmit
npx vitest run

cd "${SERVER_DIR}"
docker compose --env-file "${GATE_ENV_FILE}" config >/dev/null
docker compose --env-file "${GATE_ENV_FILE}" build backend frontend migrate seed
docker compose --env-file "${GATE_ENV_FILE}" --profile ops run --rm migrate
docker compose --env-file "${GATE_ENV_FILE}" --profile ops run --rm seed
docker compose --env-file "${GATE_ENV_FILE}" up -d --force-recreate backend frontend

for _ in $(seq 1 60); do
  backend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ptool-backend 2>/dev/null || true)"
  frontend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' ptool-frontend 2>/dev/null || true)"
  if [[ "${backend_health}" == "healthy" && "${frontend_health}" == "healthy" ]]; then
    break
  fi
  sleep 2
done

test "$(docker inspect --format '{{.State.Health.Status}}' ptool-backend)" = "healthy"
test "$(docker inspect --format '{{.State.Health.Status}}' ptool-frontend)" = "healthy"
docker compose --env-file "${GATE_ENV_FILE}" exec -T backend \
  node -e "fetch('http://127.0.0.1:3000/ready').then(async r => { if (!r.ok) throw new Error(await r.text()) }).catch(e => { console.error(e); process.exit(1) })"
curl --fail --silent --show-error http://127.0.0.1/ >/dev/null

COGNITIVE_GATE_ENV_FILE="${GATE_ENV_FILE}" \
  "${E2E_NODE}" "${SERVER_DIR}/e2e/cognitive-round1-browser-e2e.cjs"

echo "Round 1 automated regression and Docker gate: PASS"
