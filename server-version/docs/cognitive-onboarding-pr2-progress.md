# PR2 — deterministic onboarding and scientific qualification

Base: `cffa9de2160b2b01312bfb66fd7fc7b4ab325c9b` (merged PR #147).
PR: #148. Branch: `feat/cognitive-onboarding-gates`.

## Delivered

- Versioned, strict decision/blocker contracts with canonical JSON and text views.
- Offline `cognitive:onboarding-check` producer: discovery and generated drift,
  dependency boundaries and asset signatures, task/profile/protocol/FINAL contracts,
  exact seed configs, versioned presentation, executable scorer fixtures, metric
  presence/types/finite values, authoritative trial validation and report projection,
  task-declared frontend acceptance, and exact-scope scientific qualification.
- `--content-only --base <full SHA>` checks tracked and untracked changes and fails
  closed on shared-core paths; generated files still require exact regeneration.
- Standard is required. Experience/research are optional, but every declared profile
  must validate, fit the FINAL budget, and match metric availability. The assignment
  UI resets to standard when changing configs; backend rejects absent profiles.
- All 28 historical execution identities have task-owned normal/empty/insufficient
  fixtures. Existing independent golden tests and historical compatibility baselines
  remain unchanged. Frontend acceptance declarations execute existing task-specific
  practice/formal/timing/stimulus suites; they are not file-existence attestations.
- Task-owned scientific records are projected at build time. Evidence must cover
  identity, all claimed profiles, protocol signature, actual seed/profile stimulus
  version, and population scope. Missing or mismatched evidence cannot raise a tier.
  All existing declarations remain Pilot. No AI, network review, automatic promotion,
  or scientific gate is introduced into scoring or product publication.
- Test-only unknown package exercises actual release, assignment, session, legacy
  and unified FINAL, idempotent replay and report services against PostgreSQL. Only
  generated projections are extended inside its isolated test worker. It never
  appears in the production registry. Its frontend fixture now has real practice
  and formal steps.
- Fixed a gap exposed by that lifecycle test: both FINAL paths now use the frozen
  report/metric/quality/presentation metadata, matching completion.service. Editing
  live presentation after publish does not change the frozen participant report.
- Full frontend CI runs all-package onboarding decisions; full backend CI includes
  the real PostgreSQL lifecycle test. Real-browser/media checks remain in their
  existing CI lanes, outside synchronous publication.

## Compatibility finding

BART 1.0.0 has two historical average-pump metrics declared as integer despite
returning fractional means. Its fixture records an explicit, baseline-pinned
compatibility warning for those two keys. Changing that metadata in place changes
historical execution hashes, so PR2 does not silently rewrite it. A future BART
version must declare these averages as number. Other metric type mismatches block.

## Local validation

- Backend TypeScript build and frontend application/Cognitive typechecks.
- Existing historical execution/report baselines unchanged and passing.
- Cognitive/governance regression, task-owned fixture negatives, scientific-scope
  negatives, CLI deterministic JSON/text parity and content-only base validation.
- Frontend cognitive runner regression, lint and production build.
- Both unknown-task FINAL paths passed against an isolated PostgreSQL 15 database.
- Full CI must be inspected on the final PR head; local unit runs skip DB suites
  when their explicit integration URL is absent. PR2 is not authorized for merge.
