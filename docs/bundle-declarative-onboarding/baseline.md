# PR3 — Declarative Bundle onboarding

Started 2026-09-23, branch `feat/bundle-declarative-onboarding`.

- Main and prerequisite PR #162 squash commit: `ad5aa29b953f1cbec1be3aa1dd7f01b5358900f9`.
- PR #162 final head: `66c7a67166c069be25ee2cdb7db26a0c59761037`; backend, frontend, browser, CodeQL, Docker and merge gate succeeded before merge.
- Main already contains #154 and #161. Open related PR #157 changes Scale compatibility tests; do not copy its changes. Open #155 is another Scale content branch; no dependency on it.
- Current latest schema migration: `20260922140000_bundle_v3_production`; PR3 must preserve historical Bundle/Questionnaire records and frozen hashes.
- Development: macOS, Node v25.2.1; CI uses Node 20. Database validation must use a dedicated test PostgreSQL database, never production.

## Ordered implementation

1. B3-01: strict pure-JSON schemas, bounded rules, evidence/report references and canonical package hashing.
2. B3-02: deterministic discovery/scaffold/generation, exact dependency resolution and B2 provider integration.
3. B3-03: new versioned declarative engine; three-valued conditions, evidence provenance and generic report blocks. Preserve legacy engines.
4. B3-04: offline check/preview, idempotent DRAFT installation, explicit content-bound authorized publication. Database publication state is authoritative.
5. B3-05: two unknown packages, real PostgreSQL FINAL/report/export/reanalysis, renderer acceptance and core-diff guard.
6. B3-06: executable authoring runbook and evidence.

CI optimization is PR4. PR3 remains a full-platform change. No source package or JSON review flag authorizes publication. All real packages remain subject to independent release approval.

## Verification ledger

Commands and outcomes are recorded as executed. No complete-PR acceptance is claimed before the unknown-package production lifecycle and all required gates pass.

### Initial contract implementation

Added an isolated authoring schema; it is not yet connected to runtime or publication. It validates pure JSON, exact identities, fixed file references, bounded conditions, typed comparisons, evidence provenance, report rule references and context identity. A publication request is separate from immutable content identity and does not grant publication authority.

Executed in `server-version/backend`:

- `npx vitest run src/__tests__/bundle-onboarding/contract.test.ts`: 18 tests passed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.

Remaining before B3-01 closes: cross-file loader diagnostics, complete dependency catalog/selector/unit compatibility and full capability enforcement. Remaining PR3 stages include deterministic discovery/generation, runtime engine and frozen-definition integration, governed database installation/publication, real lifecycle/renderer validation and authoring runbook. No claim of full PR3 completion or production readiness is made by this initial commit.
