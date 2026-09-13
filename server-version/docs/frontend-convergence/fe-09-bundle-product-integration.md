# FE-09 — Bundle Product Integration

Baseline: `main@c89fd51547bd68ca271fc8eed4b52e77325092b9` (PR #107 / FE-07B merged, 2026-09-14 JST).

Plan source: Frontend Product Convergence v1.2, FE-09.

## Goal

Deliver one coherent participant journey:

`Bundle → Unit → Player → Unit FINAL → parent read`

FE-09 integrates already-migrated domain players into the Composite / Bundle product flow. It does not redesign domain runtimes, scoring, FINAL semantics, persistence, media policy, report science, or Cognitive timing.

## Dependency status

FE-05, FE-06, FE-07A, FE-08 and FE-07B are merged on this baseline. FE-07B timing-sensitive Pilot identities remain independently gated; FE-09 does not broaden their device support.

## Ownership after FE-09

### Parent orchestration

`modules/composite/CompositeAssessmentPage.tsx` remains the Bundle route controller. It owns:

- authenticated/public API selection;
- public recovery credentials;
- start/restart of the parent attempt where already supported;
- server parent reads/reloads;
- child-entry navigation;
- transition to the parent report only when the server parent says `COMPLETED`.

### Bundle participant renderer

`components/FinalCompositeAssessment.tsx` remains the FINAL_ONLY Bundle renderer and owns:

- current Bundle unit projection;
- Composite-local draft recovery for FORM_SECTION / Scale;
- media capability reads and media gates;
- Composite FORM_SECTION / Scale sealed FINAL calls;
- delegation into Cognitive / Situational child runners.

It now uses the shared `AssessmentShell` for parent presentation and reuses presentation-only Form / Scale players without transferring controller ownership.

### Shared presentation players

- `components/questionnaire/FormPlayer.tsx` remains presentation-only. FE-09 adds separate answer/navigation/submit lock props so Composite sealed-FINAL replay semantics can be preserved while the existing Questionnaire `disabled` contract remains backward compatible.
- `components/questionnaire/ScalePlayer.tsx` is a new presentation-only component shared by Questionnaire and Composite. It owns question/options/navigation rendering only. It does not own draft state, media gates, API clients, provenance, or FINAL payloads.

There is still no universal Form/Scale controller or assessment state machine.

## C1 — Form / Scale presentation reuse — implemented

Composite FORM_SECTION now reuses `FormPlayer` and Composite embedded Scale uses `ScalePlayer`. Questionnaire embedded Scale also uses the same `ScalePlayer`, making the component genuinely shared instead of copying another renderer.

Preserved contracts:

- Composite draft keys are unchanged;
- Questionnaire draft keys / local save queue / flush boundary are unchanged;
- media gates and required-viewing ownership remain in their existing controllers;
- Scale device/input provenance remains a top-level Scale FINAL sibling only;
- sealed payload construction and identical-payload replay are unchanged;
- navigation remains callback-driven by each controller.

Focused evidence:

- `ScalePlayer.test.tsx` — value/selected state, navigation callback and lock behavior;
- `FinalCompositePresentationReuse.test.tsx` — native Form radio semantics plus unchanged sealed Composite FORM_SECTION payload;
- existing `FinalCompositeAssessment.test.tsx` — Scale provenance sibling placement and no Form provenance leakage.

## C2 — frozen parent / child route context — implemented

`modules/composite/child-route-context.ts` makes the existing route contract explicit and testable.

Rules:

- Cognitive entry uses the `cognitiveSession.sessionId` already returned by the parent read;
- Situational entry uses the `situationalAttemptId` already returned by the parent read;
- both receive a return path to the same parent attempt;
- Situational also keeps the existing parent attempt / parent item context;
- public Cognitive recovery credentials remain bound to that existing session id;
- missing parent or child identity fails closed with a refresh message;
- the helper has no start/resume/submit/network side effects.

`CompositeAssessmentPage` routes both child types through this contract. No new child-start API was introduced.

## C3 — one Bundle parent shell — implemented

FINAL_ONLY Bundle now projects parent state into the shared `AssessmentShell`:

- title / instruction from the parent read;
- current unit title from server units/items;
- progress from server `completedItems / totalItems`;
- unit chips from server `completed/currentIndex` state;
- existing exit callback;
- existing local sealed-FINAL submission/recovery status for Composite-owned Form/Scale units.

The frontend does not recompute parent completion from local answers or child UI state.

When moving from a Composite-owned Form/Scale unit to a Cognitive/Situational child, stale Form/Scale draft metadata is cleared from the parent shell so prior submission state cannot leak across units.

## C4 — descriptive requirements only — implemented

`modules/composite/unit-requirements.ts` derives a pre-entry explanation only from already-frozen facts:

- Cognitive: exact `testType + engineVersion` FE-07A readiness profile; input capabilities, orientation and resume warning;
- Situational: frozen runtime capabilities such as `embedded` and `supported`;
- Scale: estimated time only when explicitly present;
- Form/Scale device/input requirements remain `unknown` when the parent data does not declare them.

`CompositeUnitRequirements` is display-only. It never substitutes for the child runner's readiness/admission check and never enables/disables a child. Unknown is displayed as unknown rather than inferred from viewport or device class.

## C5 — parent completion / report truth — verified, no new frontend finalizer

No new completion inference was added.

The existing backend Composite finalizer remains authoritative: it checks the current parent attempt and authoritative completed-unit count before the parent becomes `COMPLETED`. The report endpoint rejects a parent that is not completed.

Frontend behavior remains:

- after Composite-owned unit FINAL: reload the same parent attempt;
- after Cognitive/Situational completion: child runner returns to the same parent attempt and the parent page reads it;
- if parent is still `IN_PROGRESS`, continue with the server-allowed current unit;
- only server-returned `COMPLETED` routes to the parent report;
- report/snapshot reads are read-only and do not convert a pending parent into completed state.

Therefore a successful last child UI cannot independently declare the Bundle complete.

## C6 — integrated focused coverage

Focused FE-09 tests now cover:

- shared Form and Scale presentation boundaries;
- exact frozen Cognitive/Situational child route identities;
- authenticated/public Cognitive return context;
- Situational parent/item return context;
- missing child identity fails closed rather than starting another child;
- server parent progress/currentIndex projection in the Bundle shell;
- Cognitive readiness facts and Situational frozen runtime capabilities;
- Form/Scale unknown requirements stay unknown;
- Cognitive/Situational entry does not call Composite Form/Scale FINAL callbacks.

Repository Ready/full CI remains the release evidence for complete auth/public, browser, Docker, media, security and old-runtime regressions.

## Domain invariants

FE-09 does not change:

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

## Network / persistence impact

- no new per-answer, per-trial or per-video server writes;
- no new Bundle-wide FINAL;
- no new child-start/restart call during parent → child navigation;
- returning from a child may read/reload the same parent attempt;
- no Prisma migration;
- no IndexedDB schema/version change;
- no telemetry endpoint.

## Draft / in-progress compatibility

- existing Bundle parent and child identities remain unchanged;
- existing local drafts and sealed child submissions remain readable/replayable;
- completed server child state wins over stale local state;
- no in-progress child is hot-switched to another runtime or timing policy;
- public recovery credentials remain scoped to the same existing attempt/session.

## Validation status

Candidate implementation is complete through C1–C6 focused coverage. The PR remains Draft until the exact candidate head passes frontend lint/typecheck and backend compile. It must then be marked Ready and pass the repository full frontend/backend regression, browser, Docker, CodeQL and triggered media acceptance workflows on the same exact head before merge readiness is claimed.

## Rollback

Rollback is entry/presentation-level. Keep existing child routes, recovery credentials, local drafts, sealed submissions and server parent state. Do not perform destructive draft cleanup, authoritative-result deletion, or runtime-version rewrites.
