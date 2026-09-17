# V1 Pilot Release Status

Baseline date: 2026-09-17  
Repository: `caohuibj/eduK12-new-version`  
Baseline main: `d8a04af3211c9fe9092bd948ad9043cd7b591b50` (merge of FE-11 / PR #111)

## Purpose

This document is the authoritative V1 Pilot release status after Frontend Product Convergence v1.2. It freezes the interpretation of what is complete, what still blocks the first Pilot release, and what is explicitly deferred.

The V1 Pilot goal is not to complete every planned product or research capability. The goal is to release at least one real assessment product with a bounded, evidence-backed operating envelope:

`PUBLISHED + PILOT -> supported entry -> assessment -> local durability -> ONE FINAL -> authoritative result -> report/history/export -> real-device evidence -> defined capacity envelope -> rollback/release procedure`

`PUBLISHED + PILOT` is a normal usable product state. `RESEARCH_READY` and `RESEARCH_GRADE` are not V1 Pilot prerequisites.

## Current platform baseline

The following platform capabilities are treated as implemented and not reopened merely for V1 closeout:

- Unified Assessment Runtime;
- ONE UNIT / ONE FINAL;
- frozen runtime/content identity;
- local durable drafts and sealed FINAL replay;
- idempotent retry / reconciliation;
- authoritative scoring and CanonicalUnitResult;
- Scale, Cognitive, Form/Questionnaire and Situational delivery;
- Bundle / Composite parent-child integration and aggregation;
- image and video assessment media;
- report, history and export flows;
- frontend product convergence through FE-11;
- automated browser / Docker / CodeQL / security and specialized acceptance gates already proven on the FE-11 candidate.

FE-11 is the final automated frontend convergence gate. Its remaining explicit limitation is real-device evidence; desktop emulation is not real-device PASS.

## V1 Pilot exit gates

| Gate | Status | V1 requirement |
|---|---|---|
| Unified Runtime | PASS | required |
| ONE UNIT / ONE FINAL | PASS | required |
| Scale / Cognitive / Form / Situational execution | PASS | required |
| Bundle integration | PASS | required |
| Local durability / retry / reconciliation | PASS | required |
| Image / Video media | PASS | required where used |
| Report / history / export | PASS | required for released product |
| Frontend convergence / FE-11 automated gate | PASS | required |
| Security / Docker / CodeQL gate | PASS on FE-11 candidate | required on release candidate |
| Current-main capacity envelope | PENDING | required |
| Real-device evidence | PENDING | required for claimed device/task combinations |
| >= 1 `PUBLISHED + PILOT` product | PENDING | required |
| Release / rollback rehearsal | PENDING | required |
| Parent/Observer web product journey | CONDITIONAL | required only if first Pilot content needs Parent/Observer participation |
| Research Ready | DEFERRED | not required |
| Norm Engine / formal norms | DEFERRED | not required |
| Research Grade | DEFERRED | not required |
| device latency correction / cross-device equivalence claims | DEFERRED | not required |

## Closeout packages

### Package A — Release Baseline / Repository Closeout

Purpose: freeze one authoritative release interpretation and eliminate stale branches being mistaken for current work.

Actions:

- keep this document authoritative for Pilot status;
- close legacy/superseded PRs #53, #54, #55 and #96 after preserving their design/evidence in Git history and PR discussion;
- keep #48 open as content work, not a platform blocker;
- enable repository governance outside code: PR-only main, branch protection/ruleset, required Ready/full checks where supported, and exact-head merge discipline;
- use a Pilot release tag only after Packages B-D pass.

### Package B — Current-main Capacity Calibration

Purpose: characterize the current release candidate, not maximize theoretical throughput.

Required evidence:

- Scale anchor regression on current main;
- Cognitive representative payload / knee characterization for identities intended for Pilot;
- Bundle/Aggregate many-parent and same-parent contention characterization;
- explicit 429 vs controlled 503 vs business 409 accounting;
- durable eventual-success KPI and one authoritative result per logical submit;
- documented supported operating envelope and overload behavior.

The old Stage 5O optimization PRs are not release blockers and must not be rebased mechanically. If current-main evidence exposes the same hotspot, create a new narrow PR from current main.

### Package C — Real Device Pilot Gate

Minimum device families:

- iPhone / Safari;
- Android / Chrome;
- iPad / Safari;
- Chromebook or touch-capable hybrid;
- desktop Chrome with keyboard/mouse.

Validate only the device/task combinations intended for release. Do not infer scientific equivalence from viewport emulation or a small device sample.

Representative journey:

`entry/login -> start/resume -> answer/task -> background/foreground -> navigation/media -> FINAL -> result -> refresh/recovery`

For Cognitive tasks, record software timing/input diagnostics and task invariants. Do not derive latency-correction factors or claim touch/keyboard normative equivalence from this gate.

### Package D — First Pilot Content Publication

Purpose: publish a deliberately small first-wave product rather than release every draft bundle simultaneously.

Requirements for the selected exact identity:

- executable package / scoring correctness;
- rights authorization for the intended deployment;
- usable localization;
- respondent/population applicability;
- truthful report and explicit limitations;
- CI / acceptance / real-device evidence for its actual journey;
- `status/releaseStatus -> PUBLISHED` while scientific maturity remains `PILOT` unless separately qualified.

Start with one low-complexity candidate. Add additional Scale/Cognitive/mixed Bundles only after the first production chain is proven.

## Parent / Observer status

Parent/Observer is not a zero-capability area. Current main contains backend/domain support including a `PARENT` role, parent-student relationship/consent logic, observer assignment, parent self-serve/share concepts and observer audience projections.

However, the converged Web application still models authenticated frontend roles and AppShell route access primarily as `STUDENT | TEACHER | ADMIN`. Therefore the full Parent Web journey is not release-proven through the FE-11 product shell.

Policy for V1:

- if the first Pilot product is SELF-only, Parent/Observer is explicitly excluded and does not block release;
- if the selected product requires parent/teacher observer completion, create a dedicated Parent/Observer Web Integration package and make it a release blocker for that product.

## Explicit V1 non-goals

Do not delay V1 Pilot for:

- Unified Runtime redesign;
- V3/V4 architecture rewrite;
- Bull/HTTP-202 FINAL queue;
- distributed submit semaphore;
- speculative Prisma pool increase;
- Norm Engine;
- automatic scientific-maturity promotion;
- nationwide/formal norms;
- Research Grade;
- universal Parent portal when the release product does not require it;
- universal mobile support for every Cognitive task;
- device-latency correction or cross-device equivalence claims;
- revival of stale performance PRs without current-main evidence.

## Release decision rule

V1 Pilot may be tagged only when:

1. current-main capacity calibration defines a supported envelope;
2. real-device evidence covers the exact released device/task combinations;
3. at least one exact product identity is `PUBLISHED + PILOT` with all hard publication gates satisfied;
4. the same release candidate passes required automated CI/acceptance gates;
5. rollback/recovery procedure is rehearsed without destructive data cleanup;
6. remaining limitations are recorded here and in the released product/report.

After those conditions are met, stop V1 feature development and transition to Pilot operations, data collection, evidence review and Research Ready upgrades.
