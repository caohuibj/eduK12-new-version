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
