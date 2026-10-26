# Content capability grant UTC time contract

## Bounded change and verification plan

This change concerns only `content_capability_grants`: administrator root issuance,
internal bounded delegation, grant metadata/revocation, the three grant-discovery
prefilters, and the existing delegation trigger. No other authorization system,
column type, permission, historical row, database/session default, or deployment
configuration is changed. Existing grants remain immutable; there is no renewal
write path. Renewal means issuing a separately authorized new grant, not changing
an existing window.

Affected components → checks and failure detected → primary location:

- Root/delegation/revocation SQL and grant discovery → existing focused authority
  tests plus new SQL contracts catch missing UTC conversions and lost guard rules
  → local candidate checkout, about one minute.
- Production TypeScript → direct `tsc --noEmit`, without build/prechecks → local
  candidate checkout, about one minute; new test files receive separate scoped types.
- PostgreSQL conversion and actual service reads → opt-in three-session test
  (UTC, Asia/Tokyo, America/Los_Angeles) → isolated database host, budget two minutes.
  This is not a CI/full-platform/deployment qualification.

## Why both writes and comparisons must change

The existing columns are `TIMESTAMP(3)` without time zone. Prisma reads these as UTC
`Date` values. Passing a JS `Date` to a raw INSERT previously let PostgreSQL convert
an instant to the session's local wall time before storing the timezone-free value.
In the observed isolated Tokyo session a requested 03:01–04:01 UTC window was stored
as 12:01–13:01 and read back as 12:01–13:01 UTC: the entire window shifted, not just
its expiration. This observation is not evidence of production impact.

New writes explicitly use `(parameter::timestamptz AT TIME ZONE 'UTC')`. UTC wall
clock fields are stored, preserving milliseconds and the requested absolute instants.
Revocation timestamps likewise use `(clock_timestamp() AT TIME ZONE 'UTC')`.
Reads continue using Prisma's existing UTC decoding, without a compensating offset.

Discovery SQL and the database delegation guard compare the timezone-free fields
against `(clock_timestamp() AT TIME ZONE 'UTC')`. Otherwise implicit conversion would
interpret stored UTC fields as session-local values, causing false denials or stale
candidate discovery. The real post-lock `clock_timestamp()` result in application
checks stays a timezone-aware instant; it is not replaced with transaction time,
request time, a fake clock, or a grace period.

The effective window remains `validFrom <= now < expiresAt`. Actor, resource, scope,
capability, ancestry, parent expiration, delegation depth, revocation, optimistic
version checks and strong-auth checks remain unchanged. No existing grant is shifted,
extended, re-signed or silently repaired.

## Migration review

`20261025040000_content_grant_utc_time/migration.sql` replaces only the existing
`guard_content_capability_grant()` function. Relative to its original definition:

- `CREATE FUNCTION` becomes `CREATE OR REPLACE FUNCTION`.
- `parent.valid_from > clock_timestamp()` becomes
  `parent.valid_from > (clock_timestamp() AT TIME ZONE 'UTC')`.
- `parent.expires_at <= clock_timestamp()` becomes
  `parent.expires_at <= (clock_timestamp() AT TIME ZONE 'UTC')`.

Every other byte of the function body is retained. The new contract test asserts
this complete-body equality rather than checking a few selected protection strings.
No trigger removal, schema-column change or data backfill is included. Check migration
ordering and the current function definition against the merge base before merging;
an intervening guard change must be preserved, not overwritten by this copy.

## Isolated PostgreSQL test

From `server-version/backend`, provide `CONTENT_GRANT_TIME_TEST_DATABASE_URL` for an
explicitly isolated database with the current public grant-table schema, then run:

```
node node_modules/vitest/vitest.mjs run \
  src/__tests__/measurement-content/content-grant-time.postgres.integration.test.ts \
  --reporter=json --outputFile=/path/to/grant-time-postgres.json
```

Without that variable all three DB cases skip; a skip is not a pass. Never use a
production URL. Each case uses connection-local transaction timezone only, temporary
shadow tables and a `pg_temp` copy of the candidate trigger; the transaction always
rolls back. The actual root/read/retry/delegate/revoke services and ancestry consumer
execute against these fixtures. Auditing is an in-memory fixture, not an audit-store
integration assertion. Cloning the grant table retains column/default/check/index
contracts; foreign-key relations and the full application schema are not migration
qualification. No public trigger is replaced and no public rows are written.

Checks cover exact ISO/DB text/Date round trips; actual current-clock acceptance;
future and already-expired refusal; same-request idempotency; wrong actor/resource
refusal; child window readback; UTC discovery; start/end millisecond boundaries using
stored values; both revocation paths and subsequent denial. The application still
reads its real clock after lock acquisition. Existing mock tests cover expiration
while waiting; this bounded probe is not a new concurrency benchmark or full HTTP E2E.

## Evidence and limitations

At implementation time, 127 existing focused authority assertions passed; four new
migration/discovery SQL contracts passed. Direct backend production types passed.
The isolated-host PostgreSQL run passed all three sessions (3 passed, 0 failed,
0 skipped) against the recorded candidate inputs. A fresh isolated database applied
all 230 migrations successfully; this is not an existing-data upgrade or restore
qualification. The first test invocation stopped before execution because its wrapper
passed an unsupported `--minWorkers` option. The corrected invocation ran only the
tests, without repeating migration setup. Original failed CLI evidence is retained.

The services, raw SQL and temporary candidate trigger executed for real; the audit
store remained an in-memory fixture. This is not HTTP or production end-to-end
coverage. New test scoped types also passed. The checked-in sanitized
[validation summary](evidence/runtime-time-20261025/validation-summary.json) records
counts, direct candidate hashes and original evidence hashes without credentials,
connection URLs, instance accounts or full raw logs. Input binding must include the five changed production files, migration,
changed/new tests, relevant transitive imports, schema/config/package lock, and tool
versions; source or relevant input changes invalidate affected evidence only.

The prior read-only runtime checkout and the anomalous historical grant are not
modified. The patch does not determine which preexisting timestamps, if any, were
written under a non-UTC session. Historical reconciliation requires separate evidence
and explicit authorization; never subtract a guessed offset globally. Production
behavior and any deployment remain unverified by this local change.

The existing `created_at` default remains outside this patch. On a non-UTC
session that informational timestamp may still contain local wall time; it is
not used for the effective authorization window or returned by the grant DTO.
This change must not be described as a conversion of every timestamp column.
