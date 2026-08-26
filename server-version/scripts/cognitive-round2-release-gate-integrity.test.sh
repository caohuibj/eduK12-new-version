#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="${SCRIPT_DIR}/cognitive-round2-release-gate-integrity.sh"
TEMP_REPO="$(mktemp -d -t eduk12-pr16-integrity.XXXXXX)"

cleanup() {
  rm -rf "${TEMP_REPO}"
}
trap cleanup EXIT

git -C "${TEMP_REPO}" init -q
git -C "${TEMP_REPO}" config user.email pr16-integrity-test@example.invalid
git -C "${TEMP_REPO}" config user.name pr16-integrity-test
printf 'baseline\n' > "${TEMP_REPO}/tracked.txt"
git -C "${TEMP_REPO}" add tracked.txt
git -C "${TEMP_REPO}" commit -q -m baseline
BASE_SHA="$(git -C "${TEMP_REPO}" rev-parse HEAD)"
printf 'head\n' >> "${TEMP_REPO}/tracked.txt"
git -C "${TEMP_REPO}" add tracked.txt
git -C "${TEMP_REPO}" commit -q -m head
HEAD_SHA="$(git -C "${TEMP_REPO}" rev-parse HEAD)"

assert_rejected() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "integrity check failed to reject ${label}" >&2
    exit 1
  fi
}

normal_output="$(bash "${CHECK}" "${TEMP_REPO}" "${BASE_SHA}" "${BASE_SHA}")"
expected_output="${BASE_SHA}"$'\n'"${HEAD_SHA}"
if [[ "${normal_output}" != "${expected_output}" ]]; then
  echo 'integrity check did not bind HEAD to the current commit' >&2
  exit 1
fi

assert_rejected 'a caller-supplied old HEAD ref' env COGNITIVE_R2_GATE_HEAD_REF="${BASE_SHA}" bash "${CHECK}" "${TEMP_REPO}" "${BASE_SHA}" "${BASE_SHA}"
assert_rejected 'BASE_REF=HEAD' bash "${CHECK}" "${TEMP_REPO}" "HEAD" "${BASE_SHA}"

UNRELATED_SHA="$(git -C "${TEMP_REPO}" commit-tree "$(git -C "${TEMP_REPO}" rev-parse HEAD^{tree})" -m unrelated)"
assert_rejected 'a non-ancestor base' bash "${CHECK}" "${TEMP_REPO}" "${UNRELATED_SHA}" "${UNRELATED_SHA}"

echo 'PR16 Gate integrity negative tests: PASS'
