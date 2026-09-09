# Scale Response / Device Provenance Audit

Status: PR-SL3 implementation complete; Draft PR pending review

Baseline: `origin/main` at `f1144d852cad5d8a8953b035cc23b2f58c54af22`, after PR #61 was merged.

## Scope audited

- `server-version/frontend/src/pages/student/ScaleAssessment.tsx`
- `server-version/frontend/src/components/FinalQuestionnaireAssessment.tsx`
- `server-version/frontend/src/components/FinalCompositeAssessment.tsx`
- `server-version/backend/src/modules/scale/scale-final-submit.service.ts`
- `server-version/backend/src/modules/scale/unified-final-submit.service.ts`
- `server-version/backend/src/controllers/scaleController.ts`
- questionnaire, public questionnaire, and composite Scale submit controllers/services
- `server-version/backend/src/modules/scale/scale-workflow.service.ts`
- standalone, questionnaire, and composite export services
- `Assessment` persistence in `server-version/backend/prisma/schema.prisma`

## Current timing and submit paths

The standalone Scale page records one `responseTimeMs` value when an answer is selected. The item start and response elapsed values now use `performance.now()` with a safe `Date.now()` fallback; only the final non-negative integer milliseconds are persisted. Rerenders do not reset the item start ref; changing the item index does. The value is stored with the local FINAL_ONLY answer draft and is included in the single final submit payload. The legacy/checkpoint path sends the same value through the existing batch answer request.

Questionnaire and composite FINAL_ONLY pages use the shared local `finalDraftStore`, accumulate answers locally, and submit one Scale payload at the instrument boundary. Their public variants use the same final payload schema and existing recovery-token routes. Legacy questionnaire/composite paths still have existing answer write and completion code; standalone legacy write routes are disabled and the UI offers restart into FINAL_ONLY.

On the backend, final Scale submissions are validated by `finalScaleSubmitSchema`, then handled by both the legacy-compatible and `UNIFIED_V1` final submit services. Scoring receives only normalized Scale answers. Reference selection uses participant context and frozen runtime/admission data; no device data participates in either operation. The existing checkpoint/single-answer paths merge answer revisions and can reuse the same encrypted answer column.

## Persistence decision

`Assessment` has no dedicated device provenance column or Scale raw-submission table. `Assessment.answers` is an existing encrypted JSON field and is already the source for response values and response timing. `Assessment.result` is deliberately coupled to the frozen scoring/report contract and is not a suitable provenance container. `FrozenUnitAdmissionV1` is immutable attempt admission data and must not be mutated after capture.

PR-SL3 adds a backward-compatible encrypted answer envelope only when provenance is present:

```text
{ schemaVersion, answers, deviceInputProvenance }
```

Historical encrypted/plain answer arrays remain readable and are preserved when no provenance is supplied. The backend read helper will return the normalized answer array plus optional validated provenance; all scoring/report builders continue to receive only the answer array. No Prisma migration, new table, or new endpoint is required.

The existing FINAL_ONLY local draft metadata (`FinalDraftMeta.instrumentMetadata`) is the legal client-side capture location. The browser captures one validated attempt-level snapshot, restores it from the draft on refresh, and includes it once in final submission. Resolution order is stored draft metadata, valid server projection, an already-held attempt ref, then one new browser capture. Existing checkpoint requests may carry the same attempt-level snapshot through their already-existing batch envelope so legacy-compatible paths do not silently discard it; it is not duplicated into individual answers.

## Final contract

`DeviceInputProvenanceV1` uses numeric `schemaVersion: 1`, with `deviceClass` (`DESKTOP`, `TABLET`, `MOBILE`, or `UNKNOWN`), optional descriptive `osFamily` and `browserFamily`, optional viewport/screen dimensions, optional positive `devicePixelRatio`, optional `maxTouchPoints`, required `primaryPointer` (`COARSE`, `FINE`, or `UNKNOWN`), and `capturedAt`. The strict backend and client validators reject negative/non-finite numeric values and raw identity-like fields.

## Provenance boundary

The new contract is coarse technical provenance only: device class, browser/OS family, viewport/screen dimensions, device pixel ratio, maximum touch points, primary pointer class, and capture time. It stores no raw user-agent string, full hardware identifier, stable device identifier, IP address, fingerprint, or correction factor. Browser and OS family are descriptive labels, not identity claims.

Input modality is deferred. The current Scale response controls do not expose a reliable Scale-specific pointer/keyboard event chain, and adding per-item modality would enlarge the answer contract without improving the minimum attempt-level requirement.

## Export and read surfaces

Standalone Scale export, questionnaire export, and composite summary/full export decode answer payloads at the export boundary and expose attempt-level provenance fields there. Student/admin response projections may include the validated provenance as an additive field, but Scale result, report, reference, scoring, and analysis contracts remain unchanged. Historical answer arrays export safely with null provenance fields.

## Timing decision

`responseTimeMs` remains the historical field and remains the only timing value persisted per answer. PR-SL3 changes only the elapsed-clock source to a monotonic `performance.now()` implementation with a safe wall-clock fallback; it persists the final non-negative integer milliseconds, not a monotonic clock origin. No idle, visibility, background-tab, reading, or thinking correction is introduced.

## Hot-path and payload review

- Added per-answer HTTP requests: `0`
- Added per-answer database round-trips: `0`
- Added FINAL_ONLY database round-trips: `0`
- Added synchronous research calculations: `0`
- Added endpoints: `0`
- Submission payload change: additive optional attempt-level provenance only
- Representative provenance JSON size: approximately `274` bytes before encryption; no full user-agent or hardware object is included

Input modality is deferred because the existing Scale controls do not expose a reliable low-cost event chain. No global listener or per-answer modality field was added.

## Verification and known limitations

Implemented tests cover contract validation/rejection of raw identifiers, capture resolution, timing invariants, old answer-array compatibility, provenance persistence through FINAL_ONLY and checkpoint envelopes, score invariance, export fields, public/authenticated/composite input acceptance, typecheck, backend build, and the existing Scale suites.

Known limitations remain explicit: response time can include reading, thinking, and idle time; background tabs can inflate it; there is no idle/visibility correction; there is no device normalization, reference, score correction, or scientific RT interpretation; coarse classification can be imperfect; browser/OS families are descriptive only.

Deferred research work includes device-effect analysis, response-time distributions, age/device interaction, device invariance, device references/norming/score correction, modality correction, a research dashboard, and automatic research promotion.
