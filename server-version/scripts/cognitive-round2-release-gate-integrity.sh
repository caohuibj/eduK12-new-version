#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:?repository directory is required}"
BASE_REF="${2:?base ref is required}"
EXPECTED_BASE_SHA="${3:?manifest review base commit is required}"

if [[ -n "${COGNITIVE_R2_GATE_HEAD_REF:-}" ]]; then
  echo "COGNITIVE_R2_GATE_HEAD_REF is not supported; the Gate always reviews the current HEAD." >&2
  exit 1
fi

if ! BASE_SHA="$(git -C "${REPO_DIR}" rev-parse --verify "${BASE_REF}^{commit}" 2>/dev/null)"; then
  echo "COGNITIVE_R2_GATE_BASE_REF does not resolve to a commit: ${BASE_REF}" >&2
  exit 1
fi
HEAD_SHA="$(git -C "${REPO_DIR}" rev-parse --verify HEAD)"

if [[ "${BASE_SHA}" != "${EXPECTED_BASE_SHA}" ]]; then
  echo "COGNITIVE_R2_GATE_BASE_REF must resolve to the manifest review base commit." >&2
  exit 1
fi
if ! git -C "${REPO_DIR}" merge-base --is-ancestor "${BASE_SHA}" "${HEAD_SHA}"; then
  echo "COGNITIVE_R2_GATE_BASE_REF must be an ancestor of the current HEAD." >&2
  exit 1
fi

if ! git -C "${REPO_DIR}" diff --quiet; then
  echo "Round 2 Gate requires a clean working tree; unstaged changes would be tested instead of HEAD." >&2
  exit 1
fi
if ! git -C "${REPO_DIR}" diff --cached --quiet; then
  echo "Round 2 Gate requires a clean index; staged changes would be tested instead of HEAD." >&2
  exit 1
fi
if [[ -n "$(git -C "${REPO_DIR}" ls-files --others --exclude-standard)" ]]; then
  echo "Round 2 Gate requires no untracked files; untracked source could be tested instead of HEAD." >&2
  exit 1
fi

printf '%s\n%s\n' "${BASE_SHA}" "${HEAD_SHA}"
