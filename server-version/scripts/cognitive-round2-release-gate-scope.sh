#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:?repository directory is required}"
BASE_SHA="${2:?base commit is required}"
HEAD_SHA="${3:?head commit is required}"

PRISMA_PATHS=(
  server-version/backend/prisma/schema.prisma
  server-version/backend/prisma/migrations
)
SCALE_REPORT_PATH=server-version/frontend/src/modules/reporting/ScaleUnitReportCard.tsx

if [[ -n "$(git -C "${REPO_DIR}" diff --name-only "${BASE_SHA}" "${HEAD_SHA}" -- "${PRISMA_PATHS[@]}")" ]]; then
  echo "PR14 gate refuses to run with Prisma schema or migration changes." >&2
  exit 1
fi
if [[ -n "$(git -C "${REPO_DIR}" diff --name-only --cached -- "${PRISMA_PATHS[@]}")" ]]; then
  echo "PR14 gate refuses to run with staged Prisma schema or migration changes." >&2
  exit 1
fi
if [[ -n "$(git -C "${REPO_DIR}" diff --name-only -- "${PRISMA_PATHS[@]}")" ]]; then
  echo "PR14 gate refuses to run with working-tree Prisma schema or migration changes." >&2
  exit 1
fi
if [[ -n "$(git -C "${REPO_DIR}" ls-files --others --exclude-standard -- "${PRISMA_PATHS[@]}")" ]]; then
  echo "PR14 gate refuses to run with untracked Prisma schema or migration files." >&2
  exit 1
fi

if [[ -n "$(git -C "${REPO_DIR}" diff --name-only "${BASE_SHA}" "${HEAD_SHA}" -- "${SCALE_REPORT_PATH}")" ]]; then
  echo "PR14 gate refuses to run because ScaleUnitReportCard.tsx changed in the reviewed commit range." >&2
  exit 1
fi
if [[ -n "$(git -C "${REPO_DIR}" diff --name-only --cached -- "${SCALE_REPORT_PATH}")" ]]; then
  echo "PR14 gate refuses to run because ScaleUnitReportCard.tsx is staged." >&2
  exit 1
fi
if [[ -n "$(git -C "${REPO_DIR}" diff --name-only -- "${SCALE_REPORT_PATH}")" ]]; then
  echo "PR14 gate refuses to run because ScaleUnitReportCard.tsx changed." >&2
  exit 1
fi
