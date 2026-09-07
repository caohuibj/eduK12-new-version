# COG-P2 Device & Input Provenance V1 — Gate Report

Date: 2026-09-07
Base: `main@6033384`
PR: #62 `feat/cognitive-device-input-provenance-v1`

## 1. Implemented contract

`AdministrationProvenanceV1` is attempt/session-level calibration provenance:

```text
schemaVersion: 1
deviceClass: PHONE | TABLET | DESKTOP_LAPTOP | UNKNOWN
administrationMode: TOUCH | KEYBOARD_MOUSE | MIXED | UNKNOWN
```

It is not a score, quality metric, report field, reference correction, or Bundle input.

Policy: **RECORD, DO NOT CORRECT**.

## 2. Frontend lifecycle

The implementation uses one shared Cognitive session tracker rather than adding device fields to 24 task payload schemas.

- coarse `deviceClass` uses conservative form-factor inference; ambiguous devices remain `UNKNOWN`;
- `administrationMode` is derived from observed task interaction, not touch capability;
- pointer modality comes from `PointerEvent.pointerType`;
- non-editable keyboard interaction is observed separately;
- start/recovery/result/final-complete controls are outside the task observation root;
- no response / timeout does not create a modality observation;
- no event history, raw user-agent, fingerprint, persistent device ID, GPU/canvas/battery/location data is collected.

## 3. Local FINAL_ONLY durability

Existing `finalDraftStore` was extended with optional non-identity `instrumentMetadata` and an atomic `setInstrumentMetadata()` merge operation.

This prevents a refresh/resume from losing earlier TOUCH/KEYBOARD_MOUSE evidence and avoids get→update races with `SUBMITTING` / `RETRY_PENDING` status transitions.

Metadata is not part of local draft identity, so old drafts remain compatible.

## 4. FINAL submit and replay identity

The final request accepts optional strict `administrationProvenance` for authenticated and public submissions.

Historical replay compatibility is intentionally preserved:

```text
old client / absent provenance:
canonical({ trials })

new client / provenance present:
canonical({ trials, administrationProvenance })
```

The implementation never canonicalizes an absent value as `administrationProvenance: null`.

Therefore existing completed submissions retain their historical hash while a new submission cannot replay the same `submissionId` with the same trials but different provenance.

## 5. Durable backend storage — implementation deviation

The earlier implementation sketch considered adding nullable `CognitiveSession` columns. Source review showed this would be unnecessary pre-optimization schema work.

COG-P2 instead stores the coarse provenance once inside the existing encrypted `CognitiveRawSubmission` FINAL envelope:

```text
CognitiveRawSubmission
  schemaVersion: 1
  attemptEpoch
  trials
  administrationProvenance?   # optional additive field
```

Rationale:

- one existing durable row per final attempt;
- no extra SELECT / UPDATE / INSERT;
- no Prisma migration or index;
- no per-trial duplication;
- encrypted at rest using the existing unified runtime envelope;
- independent from future COS Research Capture;
- old raw submissions without the optional field remain readable.

Future COG-P5 research export/archive can decrypt and project this attempt-level header together with detailed capture. If operational cohort queries later require indexed device fields, that should be justified by real workload before adding database columns/indexes.

## 6. Legacy task-field boundary

- Reaction `inputMode` remains a legacy task field and is **not** authoritative administration provenance. Its mouse/touch collapse and timeout=`pointer` behavior are not used for calibration cohort membership.
- Trail Making per-trial `deviceClass` remains a legacy heuristic task field. Future calibration should use `AdministrationProvenanceV1` instead.
- Trail Making `deviceInfoIncomplete` and `mixedPointerType` are explicitly adapted as non-degrading v2 provenance warnings (`effect: none`), matching their existing scorer semantics: metrics and legacy `interpretable` are unchanged.

No published Reaction trial schema was changed.

## 7. Deferred by design

Not part of COG-P2:

- device-specific reference/norm correction;
- fixed touch/Android/browser timing adjustment;
- detailed platform/browser/viewport/DPR capture;
- per-response research event history;
- COS Research Capture (COG-P5);
- Cognitive scorer/payload optimization (COG-P3 / later performance lane);
- broad quality-definition migration;
- PR #54 or the old performance optimization lane.

## 8. Added automated coverage

Code includes targeted tests for:

- mode aggregation, MIXED semantics, pen/unknown handling;
- conservative device classification and ambiguity;
- final-draft metadata merge without status/identity corruption;
- strict backend provenance schema;
- raw-submission optional provenance round-trip;
- Trail Making provenance warnings remain non-degrading.

GitHub CI is the executable validation environment available for this Chat-mode implementation. CI results must be attached to the PR before merge.

## 9. Work/local validation still required after execution quota returns

The following cannot be truthfully completed in Chat mode and remain explicit post-CI validation items:

1. real mobile/tablet/desktop hardware smoke (touch, mouse, keyboard, mixed input);
2. refresh/resume smoke using a real browser IndexedDB implementation;
3. cross-device public recovery smoke (e.g. touch device → desktop keyboard/mouse) verifying conservative merge semantics;
4. any repository-local test command or environment-specific integration suite not executed by GitHub CI.

These are validation tasks only; no additional architecture is required unless they expose a defect.
