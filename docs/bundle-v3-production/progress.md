# Bundle V3 production — PR2 implementation checkpoint

Date: 2026-09-22
Branch: feat/bundle-v3-production
Starting point: PR1 b1ba439297c78304fe47461080ba37d5eabbcfac (PR #160, not merged).

## Scope and current status

This is an independently tested foundation checkpoint, not completion of PR-B2.
No database migration, HTTP endpoint, publishing UI, finalizer integration or production
report persistence is claimed here. Existing legacy paths remain unchanged.

The code catalog contains seven DRAFT definitions. Registering a definition does not
authorize publication. Observer definitions require their dedicated delivery semantics;
the generic self-report path must not admit them. Published status alone also does not
satisfy rights, population, dependency or course authorization requirements.

## Implemented

- Exact key/version provider with duplicate detection, copy isolation and no latest fallback.
- Code catalog composition root separated from consumers; exact report/context resolution.
- Full versioned frozen envelope containing V3 Bundle snapshot, Context definition,
  rule definition when present, report labels, timestamp and source.
- Separate contentHash and freezeHash: identical content has stable content identity;
  timestamp/source remain auditable in the freeze identity.
- Historical frozen reads check identities and hashes without looking up current catalog
  release status. Hashes establish integrity, not permission or signature authenticity.
- Explicit reanalysis accepts frozen SJT projections, validates slot/instrument/version,
  includes SJT evidence and source identity in aggregate provenance.
- Requests without SJT preserve existing aggregate-hash behavior.

Report definitions currently contain section labels only. They do not constitute an
implemented production report renderer or a complete content import schema.
The provider publicationBlockers method returns structural blockers only; service
authorization must still enforce rights and delivery eligibility.

## Remaining production implementation

1. Choose a release-qualified, exact-version executable Bundle with available dependencies.
   Do not silently promote current DRAFT definitions. Technical tests may use explicit
   fixtures, but a fixture is not proof of production publication readiness.
2. Extend storage with explicit snapshot family/version and immutable instances.
   Prefer existing analysis storage where its legacy required fields permit this;
   otherwise document why a separate related table is required.
3. Add authorized list/detail/instantiate and publish services with normal UI entry points.
   Freeze all definitions; reject slot/order/rule edits after freezing.
4. Read server-owned canonical results at actual FINAL, including Form completion/context
   and SJT projections. Compute outside long transactions and persist after checking epoch
   and input identity. Completion must survive analysis failure.
5. Persist INITIAL analysis under a database unique identity comprising attempt, epoch,
   purpose and input/frozen-definition identity. Technical retries reuse the logical record.
6. Persist explicit reanalysis append-only with a requestId uniqueness constraint;
   server reads sources and checks actor permissions. Never accept client-supplied raw
   evidence as authoritative. Preserve prior report history.
7. Use PENDING (not completed), READY (facts available), UNAVAILABLE (calculation completed
   without usable conclusion), FAILED (technical error). Do not collapse these statuses.
8. GET report and export must read the same persisted facts and selected analysis record;
   apply audience projection without recalculating from live definitions.
9. Verify PostgreSQL concurrency/idempotence/recovery, legacy report baselines, collection
   isolation, and the actual browser path from selection through FINAL/report/export.
   Pure engine tests alone do not satisfy PR-B2 acceptance.

## Validation of this checkpoint

Backend TypeScript: npx tsc --noEmit — passed.
Vitest: bundle-product, assessment-reanalysis and assessment-bundle —
17 files, 114 tests passed.
Coverage includes exact lookup, clone isolation, freeze tampering, retired live catalog,
SJT missing/duplicate/unknown/version mismatch and legacy hash compatibility.

No CI workflow has been added or changed for this checkpoint. PR2 remains local.
Before opening its PR, incorporate the final accepted PR1 base and run production
acceptance for the implemented scope. Do not mark the full PR-B2 plan complete yet.
