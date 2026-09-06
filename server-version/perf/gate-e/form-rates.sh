#!/usr/bin/env bash
# Stage-4S form curve rate selection, kept as a unit-testable helper so the
# sweep semantics cannot silently regress again (bash array expansion made
# "${RATES:-}" evaluate to the first element and collapse the sweep).
#
# usage: form-rates.sh <normal|large>
#   RATES env (space separated) overrides the default 7-point sweep.
#   invalid class exits 2.
set -u
CLASS="${1:?usage: form-rates.sh <normal|large>}"
RATES_OVERRIDE="${RATES:-}"
case "$CLASS" in
  normal|large) DEFAULT_RATES="25 40 55 70 85 100 115" ;;
  *)
    echo "usage: form-rates.sh <normal|large>" >&2
    exit 2
    ;;
esac
if [ -n "$RATES_OVERRIDE" ]; then
  # shellcheck disable=SC2086
  printf '%s\n' $RATES_OVERRIDE
else
  # shellcheck disable=SC2086
  printf '%s\n' $DEFAULT_RATES
fi
