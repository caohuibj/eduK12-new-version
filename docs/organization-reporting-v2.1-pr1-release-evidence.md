# Organization / Reporting V2.1 — PR1 Release Evidence

Status: implementation candidate for Ready PR full gate

Scope: Organization Identity & Access only. This PR does **not** introduce Grade/Class structures, Assessment Run allocation, reporting/cohort/longitudinal products, protected-feedback UI, CSV export, or Course→Organization inference.

## Authority split

- `users.role` remains the legacy product role used by existing course/classroom/application routes.
- `users.platform_role` is independent platform authority: `SYSTEM_ADMIN | STANDARD`.
- Organization authority is derived from current DB state: platform role, current temporal membership, organization role, persona/capability grants, and explicit deny facts.
- JWT claims are credentials only. HTTP authenticate/optional-auth and Socket revalidation reload current DB principal state.
- Explicit deny outranks SYSTEM_ADMIN, ORG_ADMIN, and capability grants.

## Migration sequence

1. `20260919000100_platform_role`
   - creates `PlatformRole`;
   - adds additive `users.platform_role DEFAULT STANDARD`;
   - performs the one-time legacy ADMIN→SYSTEM_ADMIN compatibility backfill.
2. `20260919000200_organization_membership`
   - adds Organization and temporal Membership episode storage;
   - enforces `valid_until > valid_from`;
   - enforces at most one current membership per `(organization,user)` by partial unique index;
   - uses RESTRICT for identity-history foreign keys.
3. `20260919000300_org_grants_audit`
   - adds persona/capability history, explicit deny history, command receipts, and governance audits;
   - tenant-binds grant rows with `(organization_id,membership_id)` composite FK;
   - makes audit UPDATE/DELETE fail at the database layer.

All migrations are expand-first. No legacy Course row is mapped, guessed, or backfilled into an Organization.

## Seed invariant

Historical legacy ADMIN promotion happens only in migration 00100. Fresh-install seed explicitly promotes the newly created bootstrap admin to SYSTEM_ADMIN. If an existing ADMIN is later demoted to platform STANDARD, re-running seed does not promote it again.

## Governance transaction boundary

Every Organization governance command uses a command key and payload hash. A successful transaction contains:

1. domain mutation;
2. append-only governance audit with unique `domainEventId`;
3. idempotency receipt.

A failure in any step rolls back all three. A concurrent duplicate command that loses the receipt unique race replays only the committed receipt after its losing transaction is rolled back.

## Temporal membership semantics

Membership is an episode, not a mutable eternal association. Ending M1 sets `valid_until`; rejoin always inserts a new M2 id. Historical M1 is never cleared or resurrected. Current membership queries use half-open temporal semantics.

Organization-row locking serializes ORG_ADMIN count mutations. Ending or demoting the last current ORG_ADMIN is rejected, including concurrent attempts.

## Parent evidence boundary

Current parent tenant scope requires both an active parent↔student relationship and a current child Organization membership in an active Organization. Once the child membership ends, the parent has no current scope in that Organization.

Historical access is evaluated separately against an exact artifact identity/timestamp. It is not used to recreate current tenant scope, and legacy artifacts lacking additive subject identity fail closed.

## User retention

The production `DELETE /api/users/:id` route now performs account deactivation plus `tokenVersion` increment. It does not physically delete the User row. Deactivation is rejected if the account is the last actually usable ORG_ADMIN of any Organization.

## Hard-gate coverage

| Gate | Evidence |
| --- | --- |
| I-01 current authority after unexpired JWT | middleware tests verify authenticate + optional auth hydrate current platform role; Socket revalidation test refreshes platform role; real-PG test verifies SYSTEM_ADMIN→STANDARD changes Organization access on next DB principal load |
| I-02 concurrent current membership create | `organizationIdentity.postgres.integration.test.ts`: two concurrent creates, exactly one current membership commits |
| I-03 end/rejoin episode identity | same real-PG suite: M1 ends, M2 has a new id, M1 remains historical |
| I-04 parent current-scope revocation | same real-PG suite: active relationship loses current Organization evidence after child membership ends |
| I-05 concurrent last-admin protection | same real-PG suite: concurrent demotions serialize and exactly one ORG_ADMIN remains |
| I-06 mutation/audit atomicity | same real-PG suite injects an audit-insert failure and verifies membership + audit + receipt all roll back, then verifies one committed audit on retry/replay |
| DB bypass constraints | same real-PG suite directly attempts invalid interval and duplicate-current SQL writes and requires database rejection |

The existing `platformRole.postgres.integration.test.ts` additionally covers STANDARD default, bootstrap/backfill semantics, and no repeated seed promotion.

## HTTP governance surface

`/api/organizations` exposes Organization creation and organization-bound governance commands. Organization-bound routes use `requireOrganizationGovernance`, not legacy `requireAdmin`. List endpoints are paginated and all mutations require `Idempotency-Key` or `commandKey`.

## Forward recovery / rollback

Before any downstream PR depends on Organization data, rollback can remove the three additive Organization migrations in reverse dependency order and remove the Organization module code. Legacy product tables and `users.role` are unchanged.

After Organization data is relied upon, destructive rollback is not appropriate. Forward recovery is required: retain identity/governance rows, deploy a correcting migration/code revision, and preserve append-only audit/history. `platform_role` must not be reconstructed later from legacy `users.role` because an explicit demotion is authoritative.

## Full release gate

Merge readiness requires the protected aggregate context `merge gate / ready PR` to report exact success after backend migrate+seed+build+full regression, frontend gate, browser acceptance, Docker production builds, and CodeQL. This document records design evidence only; the GitHub required check remains the release authority.
