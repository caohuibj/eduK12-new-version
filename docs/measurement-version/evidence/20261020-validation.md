# Local PostgreSQL SQL validation, 2026-10-20

Scope: source through `d39b4bc88149bce502fbe56dad0a732c10814ec7`; isolated synthetic data only. This is evidence for existing V02–V07 database structures, not completion of V05–V08 services.

- Reused existing PostgreSQL 16.15 binary from the adjacent official tool installation. No new dependency download or build.
- New directory: `/workspace/shared/measurement-version-pg-20261020`; 69 MiB after tests. Budget: at most 2 GiB and at least 4 GiB filesystem free; observed free space 8.5 GiB.
- Socket-only startup was blocked by the execution sandbox (`Operation not permitted`). The narrowly scoped elevated tool attempt then failed in its own filesystem setup. No restricted path was accessed or modified; no network/security setting or existing instance was changed.
- PostgreSQL official single-user mode succeeded without sockets/network. Each migration ran separately against the new empty cluster's `postgres` database. The exact migration bytes were passed through PostgreSQL `decode`/`convert_from` and dynamic SQL; the one explicit transaction migration used native single-user input. Stored migration files were not edited.
- All 182 migration SQL files succeeded, including new release/pointer/candidate/review tables. Per-file identity and success are recorded in `20261020-single-user-migrations.json`. There are 220 public tables after application.
- `server-version/backend/src/__tests__/measurement-content/database-contracts.sql` ran once in the isolated database. All 16 expected rejection assertions passed: release uniqueness, scientific/provenance immutability, lifecycle rollback prevention, release deletion prevention, event immutability, actual actor FK, null candidate identity, independent formal-norm review, exact review hash, reviewer FK, candidate/review immutability and deletion prevention.
- Valid independent formal review and private descriptive self-review both inserted successfully. Subsequent observation confirms exactly two review rows and the test release's final `REVOKED` state; see `20261020-single-user-observation.log`.
- Logs use the tool installation's JST timestamps; completion corresponds to about 03:22 UTC. No server remains running because single-user processes exit after each input.

## Not established by this run

Prisma `migrate deploy`/migration-history tracking, client connections/pooling, application authorization, sample-reader ownership, concurrent transactions/races, browser behavior, export retention, backup/restore, full regression and CI were not tested. The SQL fixtures are synthetic database-boundary probes, not scientifically valid measurement/norm publications. No claim is made that a two-user FK alone proves two authorized human actions; the final capability service must derive actors and scoped facts from trusted authentication/database reads.

Normal supersession inside a frozen reference policy remains readable. The current selector deliberately downgrades an entire metric/reference-kind slot if any of its frozen candidates is REVOKED; this conservative policy is explicit, not an automatic switch to another norm. Historical reports read their original frozen artifact and must not rerun the new-selection function.

## V05/V07 follow-on, 04:27 UTC

The same isolated single-user cluster applied the exact two new migration files `20261020030000_content_capability_authority` and `20261020031000_survey_private_report_drafts`. No previously applied file was changed. File SHA-256 and outcomes are in `20261020-v05-v07-migrations.json`.

- `content-authority-database-contracts.sql` passed 20 expected rejection assertions, legal root/child insertions, a successful versioned root revocation, stale-CAS zero-row assertion, and visible revoked ancestor with unchanged retained child. This proves SQL constraints and single-session observations, not concurrent grant/revoke locking.
- `survey-report-database-contracts.sql` passed six expected rejection assertions, legal draft revision and publication. Synthetic fixture preparation first failed existing collection-mode and Survey account FK checks; fixture was corrected to SINGLE_UNLINKED with a separately created synthetic SURVEY account. Neither failed attempt committed partial fixtures, and no constraint or migration was relaxed.
- 41 focused pure/mock tests passed across content authority (9), Survey private report service (24), report renderer (4), report template (4). Targeted strict TypeScript and Prisma schema validation passed. The actual API/browser and socket-connected Prisma transaction tests remain unrun; mocks do not prove these.
- Isolated PG directory remains 69 MiB, filesystem free 8.5 GiB. No production flags or security configuration changed; no runtime sample scans or pressure tests added.

## V08 START additive binding, 05:00 UTC

The exact new migration `20261020040000_survey_attempt_content_binding` and `survey-content-binding-database-contracts.sql` ran once in the same isolated single-user cluster. Six rejection assertions passed (missing pair, malformed hash, mutation, clearing, scope change), followed by a legal completion status update retaining the binding. SHA-256 and outcomes are in `20261020-v08-binding-sql.json`. Cluster remains 69 MiB; free space 8.4 GiB. This does not establish connected Prisma execution or concurrent admission/lifecycle races. No old migration or real data changed.

## V08 explicit interpretation export constraint, 05:09 UTC

Applied new `20261020041000_survey_interpretation_exports` and reapplied its identical bytes to verify idempotence in the synthetic single-user cluster. `survey-interpretation-export-database-contracts.sql` successfully inserted all six existing formats plus INTERPRETATION_LONG, and confirmed INVALID_FORMAT is rejected by survey_export_tickets_format_check. No old migration changed. Exact hashes/results are in `20261020-v08-interpretation-export-sql.json`; this closes the CHECK omission not exercised by mocked ticket tests. No connected Prisma/HTTP/concurrency claim.

#### Explicit reinterpretation authority

Added migration `20261020042000_data_reinterpret_authority` applied to the same
isolated PG 16.15 single-user database. The exact accompanying
`data-reinterpret-authority-database-contracts.sql` completed without ERROR:
legal root/child grants, FINAL/project/expiry/depth containment, wrong template
capability, unsupported read/export capability, non-project scope and revoked
parent rejection. The 12 authority Vitest contracts passed. This is SQL constraint
and pure-contract evidence only, not HTTP, Prisma deployment or concurrent revoke.

#### Explicit interpretation artifacts

Migration `20261020043000_survey_interpretation_artifacts` and exact
`survey-reinterpretation-database-contracts.sql` ran successfully on the same
synthetic PG 16.15 single-user data directory. Seven rejected cases cover immutable
update/delete, wrong/missing actual FINAL, missing actor, malformed request hash,
and >2 MiB ciphertext. An ON CONFLICT retry retained the first artifact, and the
original FINAL ciphertext remained unchanged. No production data or grants used.
Prisma `validate` used a synthetic URL without connecting. Strict TypeScript ran
with noEmit/declaration/declarationMap disabled to avoid declaration portability
errors from the private symlinked Prisma client. Service plus real compute contracts
23, actual router-handler contracts 4 passed; no network HTTP/concurrency claim.
