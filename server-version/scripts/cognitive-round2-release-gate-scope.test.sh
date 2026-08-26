#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE_CHECK="${SCRIPT_DIR}/cognitive-round2-release-gate-scope.sh"
TEMP_REPO="$(mktemp -d -t eduk12-pr16-scope.XXXXXX)"

cleanup() {
  rm -rf "${TEMP_REPO}"
}
trap cleanup EXIT

git -C "${TEMP_REPO}" init -q
git -C "${TEMP_REPO}" config user.email pr16-scope-test@example.invalid
git -C "${TEMP_REPO}" config user.name pr16-scope-test
mkdir -p "${TEMP_REPO}/server-version/backend/prisma/migrations" \
  "${TEMP_REPO}/server-version/frontend/src/modules/reporting"
printf 'baseline\n' > "${TEMP_REPO}/server-version/backend/prisma/schema.prisma"
printf 'baseline\n' > "${TEMP_REPO}/server-version/frontend/src/modules/reporting/ScaleUnitReportCard.tsx"
git -C "${TEMP_REPO}" add .
git -C "${TEMP_REPO}" commit -q -m baseline
BASE_SHA="$(git -C "${TEMP_REPO}" rev-parse HEAD)"

printf 'committed schema change\n' > "${TEMP_REPO}/server-version/backend/prisma/schema.prisma"
git -C "${TEMP_REPO}" add .
git -C "${TEMP_REPO}" commit -q -m schema-change
HEAD_SHA="$(git -C "${TEMP_REPO}" rev-parse HEAD)"
if bash "${SCOPE_CHECK}" "${TEMP_REPO}" "${BASE_SHA}" "${HEAD_SHA}"; then
  echo 'scope check failed to reject committed Prisma changes' >&2
  exit 1
fi

printf 'baseline\n' > "${TEMP_REPO}/server-version/backend/prisma/schema.prisma"
printf 'committed ScaleUnitReportCard change\n' > "${TEMP_REPO}/server-version/frontend/src/modules/reporting/ScaleUnitReportCard.tsx"
git -C "${TEMP_REPO}" add .
git -C "${TEMP_REPO}" commit -q -m scale-change
HEAD_SHA="$(git -C "${TEMP_REPO}" rev-parse HEAD)"
if bash "${SCOPE_CHECK}" "${TEMP_REPO}" "${BASE_SHA}" "${HEAD_SHA}"; then
  echo 'scope check failed to reject committed ScaleUnitReportCard changes' >&2
  exit 1
fi

echo 'PR14 protected scope negative tests: PASS'
