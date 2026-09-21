# PR2 — deterministic onboarding and scientific qualification

Base: `cffa9de2160b2b01312bfb66fd7fc7b4ab325c9b`.
PR1: #147, merged 2026-09-21 after full CI, media acceptance and merge gate succeeded.
Branch: `feat/cognitive-onboarding-gates`.
Status: **Started / draft, not feature complete.**

## First implementation checkpoint

- Added strict, versioned `CognitiveBlockerV1` and `CognitiveOnboardingDecisionV1`
  transport schemas for all planned domains and gates.
- Added pure decision composition and stable JSON/text serialization. Object-key
  and blocker ordering is independent of insertion order and locale. Only identical
  diagnostics are deduplicated; distinct expected/actual values remain inspectable.
- Technical failure blocks Pilot readiness; scientific eligibility and declaration
  validity remain separate from product availability.
- Added `declarationValid` and `declarationBlockers`: the v3 plan's
  `blockersToNextTier` alone cannot represent a currently invalid declaration.
- Reject contradictory readiness, misplaced gate blockers, unsupported schema
  versions, extra fields and non-JSON evidence values.
- Verified 11 contract tests and full backend TypeScript build.

The composer is **not a validator**. Its callers must complete all checks before
supplying facts. It does not discover packages, inspect evidence, authorize
publication or call any AI/network service. No CLI is exposed until the producer
can return complete diagnostics. Production publication and qualification behavior
is unchanged in this initial checkpoint.

## Remaining PR2 work before ready for review

1. Connect package discovery, task/profile/protocol/asset/scoring/report checks to
   one producer and expose `npm run cognitive:onboarding-check -- <task> --json`.
   Incomplete or failed validation must never yield a ready decision.
2. Make standard required and experience/research optional consistently across
   typings, adapters, validators, config resolution and UI. Reject requests for
   absent profiles and validate every profile that is declared.
3. Validate executable normal/boundary/stimulus/report/runner evidence. Keep
   expensive browser validation outside the synchronous publication API.
4. Generate exact-identity task-owned governance. Enforce evidence applicability
   across profile/protocol/stimulus/population scope, reuse the cross-family
   qualification evaluator, and check declared <= eligible without auto-promotion.
5. Extend the unknown fixture to the real DRAFT → explicit PUBLISH → attempt →
   FINAL → report chain and complete the domain blocker negative matrix. Expose
   content-only path classification with a pinned base SHA and manifest drift gate.
6. Finish human-operated authoring/promotion instructions, full regression and CI.

Existing PR1 execution and historical report baselines remain authoritative. Do
not rewrite those baselines to hide unintended drift. Any intended PR2 readiness
change needs a separate, explicit assertion. PR2 must remain draft until this list
is complete; it is not authorized for merge by the PR1 merge instruction.
