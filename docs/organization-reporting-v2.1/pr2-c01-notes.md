# PR2-C01 — tenant-safe unit hierarchy

Implementation contract:

- Organization Units are exactly `GRADE` or `CLASS` in V1.
- `GRADE` has no parent; `CLASS` has exactly one `GRADE` parent.
- Parent identity is tenant-bound with `(organization_id, parent_unit_id)` composite FK.
- PostgreSQL trigger rejects non-GRADE parents and self-parenting; the two-level shape makes cycles impossible at the database layer.
- Organization and parent foreign keys use `RESTRICT`; structural history is never cascade-deleted.
- API authorization is intentionally deferred to PR2-C16; this commit exposes no new HTTP surface.

Acceptance evidence lives in `organizationStructure.postgres.integration.test.ts` and includes direct-SQL cross-tenant and invalid-shape attempts.
