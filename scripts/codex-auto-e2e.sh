#!/bin/sh
set -eu

suite="${EDUK12_E2E_SUITE:-composite-access}"

case "$suite" in
  composite-access)
    exec node server-version/e2e/composite-access-browser-e2e.cjs
    ;;
  round1)
    exec node server-version/e2e/cognitive-round1-browser-e2e.cjs
    ;;
  round2)
    exec node server-version/e2e/cognitive-round2-browser-e2e.cjs
    ;;
  all)
    node server-version/e2e/composite-access-browser-e2e.cjs
    node server-version/e2e/cognitive-round2-browser-e2e.cjs
    ;;
  *)
    echo "Unknown EDUK12_E2E_SUITE: $suite (expected composite-access, round1, round2, or all)" >&2
    exit 2
    ;;
esac
