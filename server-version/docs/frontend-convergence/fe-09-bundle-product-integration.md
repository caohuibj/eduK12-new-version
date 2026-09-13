# FE-09 — Bundle Product Integration

Baseline: `main@c89fd51547bd68ca271fc8eed4b52e77325092b9` (PR #107 / FE-07B merged, 2026-09-14 JST).

Plan source: Frontend Product Convergence v1.2, FE-09.

## Goal

Deliver a coherent participant journey:

`Bundle → Unit → Player → Unit FINAL → parent read`

This PR integrates the already-migrated domain players into the Composite / Bundle product flow. It does not redesign domain runtimes, scoring, FINAL semantics, persistence, media policy, or Cognitive timing.

## Dependency status

FE-09 strong dependencies are merged on this baseline:

- FE-05 — ReportShell + Reporting Convergence;
- FE-06 — Situational Migration;
- FE-07A — Cognitive Shell + Input / Resume Readiness;
- FE-08 — Form / Questionnaire Migration.

FE-07B is also merged. Its timing-sensitive Pilot identities remain independently gated; FE-09 must not reinterpret or broaden their device support.

## Current ownership inventory

### Route / orchestration

`modules/composite/CompositeAssessmentPage.tsx` owns Bundle route orchestration, authenticated/public API selection, recovery credentials, parent attempt reload and child-entry navigation.

### Current participant renderer

`components/FinalCompositeAssessment.tsx` currently owns:

- current Bundle unit presentation;
- local FINAL_ONLY draft recovery;
- FORM_SECTION and Scale answer state;
- media capability reads and image/video gates;
- FORM_SECTION and Scale sealed unit FINAL calls;
- Cognitive / Situational entry callbacks.

It therefore contains duplicated FORM_SECTION and Scale presentation that overlaps the already-migrated Questionnaire path.

### Reusable FE-08 boundary

`components/questionnaire/FormPlayer.tsx` is presentation-only and already provides semantic FORM_SECTION controls. It does not own API clients, finalDraftStore identity, sealed payloads or reconciliation and is safe to reuse from Composite.

FE-08 did not create a second Scale controller or universal Scale state store. Embedded Scale presentation remains callback-driven inside the Questionnaire owner. FE-09 must preserve that boundary rather than introducing a universal Form/Scale renderer.

## Domain invariants

FE-09 must not change:

- server-owned Bundle unit order / slot admission;
- one authoritative result per child unit;
- ONE UNIT / ONE FINAL semantics;
- finalDraftStore sealed-payload replay and write-lock behavior;
- domain-specific payload builders or scorers;
- Cognitive reducer / runner / timing identity;
- Situational traversal / pruning semantics;
- FORM_SECTION unit boundary;
- Scale device/input provenance ownership;
- Aggregate-safe evidence or report projection semantics;
- authenticated/public authorization authority.

A child completion may trigger a parent **read / reload**. It must not create a fresh child attempt when the completed child already exists.

## Network / persistence budget

During child answering:

- answer / trial / video completion remains local according to the owning domain path;
- no new per-answer, per-trial or per-video server writes;
- child completion uses the existing logical unit FINAL endpoint and idempotent replay contract;
- returning from a child may read the parent Bundle state;
- FE-09 adds no new Prisma migration, IndexedDB store/version, telemetry endpoint or bundle-wide FINAL.

## Planned slices

### C1 — reuse proven Form / Scale presentation boundaries

- replace duplicated Composite FORM_SECTION rendering with the existing `FormPlayer` presentation boundary;
- keep Composite draft key, media identity, submit payload, authenticated/public client and orchestration ownership unchanged;
- extract only a narrow Scale presentation component if it can remain callback/frozen-identity driven; do not create a second Scale state owner or universal renderer;
- add focused regression proving payload shape, media gates and sealed FINAL behavior are unchanged.

### C2 — explicit parent / unit / return context

- carry parent attempt, child unit and safe return context explicitly;
- Cognitive / Situational completion returns by reading the same parent attempt;
- completed child revisit does not create a new child attempt.

### C3 — one parent shell / progress model

- show server-authoritative parent unit count and current unit title;
- unify exit / resume presentation;
- keep only one complete `AssessmentShell`; child player owns its internal interaction progress.

### C4 — requirements summary

- derive a simple pre-start requirements / warning list only from already-available unit requirements;
- intersection / warning logic is descriptive, not a new compatibility engine;
- unknown / unreadable requirements are shown as unknown, never treated as compatible;
- maturity labels do not determine device compatibility.

### C5 — parent result / snapshot continuation

- after a unit FINAL, read parent state and route to the next server-allowed unit or parent result;
- after the last unit, render parent `PENDING` / `COMPLETED` truthfully;
- report reads use the existing snapshot / ReportShell contracts.

### C6 — integrated acceptance

Cover:

- mixed Scale / Form / Cognitive / Situational Bundle;
- authenticated and public entry;
- refresh between units;
- last-unit FINAL response loss and reconciliation;
- completed-child revisit;
- parent read failure without child resubmission;
- supported viewport / input combinations and timing-sensitive task warnings.

## Acceptance gates

Before Ready:

1. Parent order comes from the server; the frontend does not unlock a disallowed slot from local progress.
2. Each child unit produces at most one authoritative result; identical FINAL retry remains the only replay path.
3. Parent read failure never causes a child FINAL or child-start replay.
4. Cognitive / Situational return uses the same parent attempt identity.
5. FORM_SECTION and embedded Scale continue to seal from their existing local draft identities.
6. No duplicate full Shell is rendered around a migrated child player.
7. Aggregate-safe evidence remains unchanged.
8. Device requirements are explained before entry where data exists; unsupported / unknown combinations are not silently skipped or substituted.
9. Final validation uses one exact candidate SHA and includes focused tests plus the repository full CI / browser / Docker gates required for Ready.

## Draft / in-progress compatibility

- existing Bundle attempts keep the same parent and child identities;
- existing local drafts / sealed child submissions remain readable and replayable;
- no in-progress child is hot-switched to another runtime or timing policy;
- completed server child state wins over stale local state;
- rollback is entry / presentation-level and must not delete persisted drafts or authoritative results.

## Rollback

Keep existing child routes and return context available. If the integrated entry must be disabled, stop new Bundle entries from using the candidate presentation while preserving existing attempts, child recovery credentials, sealed submissions and server parent state. No destructive cleanup or runtime-version rewrite is permitted.
