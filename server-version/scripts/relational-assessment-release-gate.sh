#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${SERVER_DIR}/backend"

cd "${BACKEND_DIR}"

npx vitest run \
  src/__tests__/assessment-relational \
  src/__tests__/assessment-identity/episode-parent-invite.test.ts \
  src/__tests__/assessment-observer/observer-workflow.test.ts \
  src/__tests__/assessment-bundle/definition.test.ts \
  src/__tests__/assessment-bundle/snapshot.test.ts \
  src/__tests__/assessment-bundle/compatibility.test.ts \
  src/__tests__/assessment-bundle/release-gates-commit16.test.ts

npm run build
npx prisma validate
