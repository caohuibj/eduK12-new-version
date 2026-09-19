#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=ptool}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PR3_UPGRADE_DB_NAME:=ptool_pr3_upgrade}"

export PGPASSWORD
PSQL_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PR3_UPGRADE_DB_NAME}"
PRISMA_URL="${PSQL_URL}?schema=public"
TMP_DIR="$(mktemp -d)"
BASELINE_PRISMA="$TMP_DIR/prisma"

cleanup() {
  dropdb --if-exists --force -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PR3_UPGRADE_DB_NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

command -v createdb >/dev/null
command -v dropdb >/dev/null
command -v psql >/dev/null

dropdb --if-exists --force -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PR3_UPGRADE_DB_NAME" >/dev/null 2>&1 || true
createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PR3_UPGRADE_DB_NAME"

# PR #121 adds exactly these two migrations. Rehearse the upgrade by first
# constructing the populated PR2/main schema from the same immutable migration
# history with the PR3 migrations removed, then applying the current head.
cp -R prisma "$BASELINE_PRISMA"
rm -rf \
  "$BASELINE_PRISMA/migrations/20260919115500_freeze_run_start_attempt_identity" \
  "$BASELINE_PRISMA/migrations/20260919121000_reporting_core"

DATABASE_URL="$PRISMA_URL" npx prisma migrate deploy --schema="$BASELINE_PRISMA/schema.prisma"
DATABASE_URL="$PRISMA_URL" \
  ADMIN_USERNAME="pr3-upgrade-admin" \
  ADMIN_PASSWORD="pr3-upgrade-password-2026" \
  npm run db:seed

baseline_users="$(psql "$PSQL_URL" -Atc 'SELECT COUNT(*) FROM "users";')"
if [[ ! "$baseline_users" =~ ^[0-9]+$ ]] || (( baseline_users < 1 )); then
  echo "PR3 baseline rehearsal requires populated pre-PR3 data" >&2
  exit 1
fi
if psql "$PSQL_URL" -Atc "SELECT to_regclass('public.reporting_analysis_specs') IS NOT NULL;" | grep -qx 't'; then
  echo "reporting tables unexpectedly exist in the PR2 baseline" >&2
  exit 1
fi
if psql "$PSQL_URL" -Atc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assessment_run_execution_start_claims' AND column_name='admitted_attempt_identity');" | grep -qx 't'; then
  echo "admitted_attempt_identity unexpectedly exists in the PR2 baseline" >&2
  exit 1
fi

DATABASE_URL="$PRISMA_URL" npm run db:migrate:guarded

psql "$PSQL_URL" -Atc "SELECT to_regclass('public.reporting_analysis_specs') IS NOT NULL;" | grep -qx 't'
psql "$PSQL_URL" -Atc "SELECT to_regclass('public.reporting_cohort_snapshots') IS NOT NULL;" | grep -qx 't'
psql "$PSQL_URL" -Atc "SELECT to_regclass('public.reporting_analysis_artifacts') IS NOT NULL;" | grep -qx 't'
psql "$PSQL_URL" -Atc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assessment_run_execution_start_claims' AND column_name='admitted_attempt_identity');" | grep -qx 't'
post_upgrade_users="$(psql "$PSQL_URL" -Atc 'SELECT COUNT(*) FROM "users";')"
if [[ "$post_upgrade_users" != "$baseline_users" ]]; then
  echo "populated baseline user rows changed during PR3 migration: before=$baseline_users after=$post_upgrade_users" >&2
  exit 1
fi
psql "$PSQL_URL" -Atc "SELECT COUNT(*) FROM \"users\" WHERE \"username\"='pr3-upgrade-admin';" | grep -qx '1'

# The upgraded populated database must also be a no-op on a second guarded deploy.
DATABASE_URL="$PRISMA_URL" npm run db:migrate:guarded

echo "PR3 populated baseline upgrade rehearsal passed (users=$baseline_users)"
