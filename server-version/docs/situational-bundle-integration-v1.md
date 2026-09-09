# Situational V1 — Composite Bundle Integration

PR-D embeds the existing Situational text pilot in the existing Unified
Assessment Bundle / Composite runtime. It does not introduce a second runner,
scorer, aggregate store, or per-scene persistence model.

## Frozen boundary

- Composite authoring stores the exact `instrumentKey` and `instrumentVersion`.
- Participant start validates `PUBLISHED + PILOT` admission and freezes the
  Situational runtime identity into the parent `FrozenActiveSlotSet`.
- The child attempt remains the existing Situational runtime record, bound to
  the parent attempt, item, and `situational:<itemId>` slot key.
- FINAL accepts the raw response array once, scores on the server, persists one
  encrypted raw submission and one canonical `UNIT_RESULT` snapshot, then lets
  the existing parent finalizer complete the Composite.
- Reports and Bundle evidence consume canonical `Construct × Channel` metrics
  only. Scene responses, option keys, response times, scoring tables, norms,
  and percentile-like fields are not exposed through the bundle bridge.
- Anonymous embedded access continues to use the existing recovery-token hash;
  the raw token is never put in the Situational runner URL.

## Capability state

The PR-D package is explicitly admitted as:

```text
standalone=true
supported=true
embedded=true
aggregateEligible=true
collectionFacts=false
```

The `PUBLISHED + PILOT` gate is checked before a Composite attempt is created.
The slot freezes the exact package/runtime identity and never resolves a newer
registry version during resume or FINAL.

## Idempotency, concurrency, and known limitations

- A repeated identical FINAL re-reads the existing terminal result and returns
  replayed success; a reused `submissionId` with a different payload fails
  closed with `SUBMISSION_PAYLOAD_CONFLICT`.
- Concurrent identical FINAL requests converge to one terminal Situational
  attempt, one encrypted raw submission, one canonical snapshot, and one
  completed Bundle slot.
- PR-D remains text-only and `FINAL_ONLY`: no image/comic/video stimulus,
  open-text or LLM scoring, adaptive delivery, norms/percentiles, collection
  facts, per-scene persistence, or high-frequency telemetry is introduced.
- Browser E2E uses the repository's existing seeded harness when the dedicated
  application/fixture environment is available; the mandatory durable
  lifecycle evidence is the real-PostgreSQL suite below.

## Verification

Unit and contract coverage:

```text
cd server-version/backend
vitest run src/__tests__/assessment-bundle
vitest run src/__tests__/situational src/__tests__/assessment-runtime/v32-1.contract.test.ts src/__tests__/assessment-runtime/v32-3.contract.test.ts
```

The critical real-PostgreSQL suite is:

```text
src/__tests__/composite/situational-bundle.postgres.integration.test.ts
```

It verifies parent/child binding, frozen slot identity, canonical snapshot
provenance, replay, concurrent identical FINAL convergence, conflicting
submission rejection, cross-user and stale-slot/hash rejection, and one-FINAL
behavior for 10, 30, and 60 text scenes. CI supplies
`SITUATIONAL_BUNDLE_INTEGRATION_DATABASE_URL`; the release report check treats
the suite as non-skippable.

Local verification uses the existing PostgreSQL service and applies the normal
guarded Prisma migration. It must not use `prisma migrate reset`.
