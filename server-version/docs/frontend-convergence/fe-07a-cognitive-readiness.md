# FE-07A — Cognitive Shell + Input / Resume Readiness

Base: `main@2ea5a4c2634e3ef871b5663f27a59ef5951040a6` (PR #103 / FE-05 merged).

This starts C1 of FE-07A. It freezes current Cognitive frontend facts before the shell migration. FE-07A deliberately does not perform the scoped timing work reserved for FE-07B.

## Goal and current facts

FE-07A migrates the Cognitive product journey onto the shared assessment presentation contract while preserving task-owned timing, reducer/runtime selection, frozen identity, local durability and exact FINAL behavior.

Current facts that the migration must preserve:

- `CognitiveRunner` loads the frozen session through `useCognitiveSession` and resolves the exact frontend runner by `testType + engineVersion`; there is no latest/nearby-version fallback.
- Current states cover loading/completing, ready, running/trial submission, completed, unsupported, legacy read-only, recovery-required and error paths.
- Cognitive image assets and video capability URLs are prepared before `START_RUN`. Instruction media may be shown before start; example/stimulus timing remains task-owned.
- FINAL_ONLY trial writes already use the shared `finalDraftStore`; sealed FINAL replay and terminal reconciliation remain Cognitive-owned and must not move into `AssessmentShell`.
- Administration provenance already separates coarse device class from observed response modality. Product modes are `TOUCH`, `KEYBOARD_MOUSE`, `MIXED` and `UNKNOWN`; viewport width is not an input method.
- The current FINAL_ONLY resume path derives a next trial index from persisted trials. FE-07A must not assume that `max(trialIndex) + 1` is safe for every adaptive, learning-phase, staircase or multi-stage task. Each registry entry needs explicit evidence before it is classified as safely resumable.

## Registry C1 baseline

The current frontend registry imports 25 exact task entries. Current task identities use engine version `1.0.0`; FE-07A keeps exact-version resolution.

| testType | engineVersion | input/device | safe-resume proof | viewport/orientation | frozen media | status |
|---|---|---|---|---|---|---|
| fake | 1.0.0 | audit | audit | audit | audit | C1 |
| reaction | 1.0.0 | audit | audit | audit | audit | C1 |
| memory | 1.0.0 | audit | adaptive-state proof | audit | audit | C1 |
| stroop | 1.0.0 | audit | staged-state proof | audit | audit | C1 |
| gonogo | 1.0.0 | audit | audit | audit | audit | C1 |
| cpt | 1.0.0 | audit | audit | audit | audit | C1 |
| nback | 1.0.0 | audit | adaptive/stage proof | audit | audit | C1 |
| corsi | 1.0.0 | audit | adaptive-state proof | audit | audit | C1 |
| sst | 1.0.0 | audit | staircase/stage proof | audit | audit | C1 |
| taskswitch | 1.0.0 | audit | staged-state proof | audit | audit | C1 |
| patterncompare | 1.0.0 | audit | audit | audit | audit | C1 |
| flanker | 1.0.0 | audit | staged-state proof | audit | audit | C1 |
| cardsort | 1.0.0 | audit | staged-state proof | audit | audit | C1 |
| digitbackward | 1.0.0 | audit | adaptive-state proof | audit | audit | C1 |
| picturesequence | 1.0.0 | audit | staged-state proof | audit | audit | C1 |
| pairedassociate | 1.0.0 | audit | learning-state proof | audit | audit | C1 |
| matrix | 1.0.0 | audit | audit | audit | audit | C1 |
| mentalrotation | 1.0.0 | audit | audit | audit | audit | C1 |
| tower | 1.0.0 | audit | multi-step-state proof | audit | audit | C1 |
| trailmaking | 1.0.0 | audit | sequence-state proof | audit | audit | C1 |
| reversallearning | 1.0.0 | audit | learning-state proof | audit | audit | C1 |
| bart | 1.0.0 | audit | within-task-state proof | audit | audit | C1 |
| wordlist | 1.0.0 | audit | learning/recall-state proof | audit | audit | C1 |
| lexicaldecision | 1.0.0 | audit | audit | audit | audit | C1 |
| emotionrecognition | 1.0.0 | audit | audit | audit | audit | C1 |

`audit` means the field is intentionally not inferred from a task name or trial count. A later C1 commit must cite the concrete task/registry/config implementation and classify actual input, orientation needs, durable checkpoint facts and media slots for that exact identity.

## Planned slices

1. **C1 support matrix** — finish per-registry evidence for engine version, task category, actual inputs, viewport/orientation requirements, safe checkpoint/resume facts and frozen media slots.
2. **C2 shared shell** — attach `CognitiveRunner` product states to `AssessmentShell`; keep reducer, `resolveRunner`, task components and version selection unchanged.
3. **C3 readiness/media** — preserve pre-start instruction/video readiness and task-owned example/stimulus disclosure. Shell never owns timed stimuli.
4. **C4 input provenance** — reuse administration provenance and record actual keyboard/pointer/touch/hybrid use; ambiguous touch-capable hardware remains honest.
5. **C5 resume audit** — classify every task as safe-resume, restart-only, or requiring an explicit protocol extension. Persisted trial index alone is insufficient where adaptive/learning/stage state is required.
6. **C6 integration acceptance** — prove shell rerenders do not remount active task content, media failures do not create trials, public/auth/parent returns remain correct, and saved trials are not rewritten.

## Hard boundaries

FE-07A does not change timing constants, frame synchronization, reaction-time capture or timing diagnostics (FE-07B); add a universal Cognitive controller; change scorer/scoringVersion/report science/CanonicalUnitResult; change frozen engine identity; add per-trial server writes to FINAL_ONLY; add a second draft store or IndexedDB version; infer input from screen width; or silently restart an exposed timed stimulus without task-specific proof.

## Network / persistence budget

Target impact is zero new answer/trial/video-progress server writes and no database/IndexedDB schema change. If a task needs durable resume state that the current frozen/local contract cannot represent, FE-07A must surface that as a separate contract dependency rather than hiding it in `AssessmentShell`.

## Parallel boundary

FE-06 / PR #104 currently changes Situational files only. FE-07A stays in Cognitive code plus FE-07A-specific docs/tests and consumes the frozen `AssessmentShell` contract rather than modifying shared persistence/media contracts in parallel.

## Merge gate

Before Ready/merge, document the user problem and before/after behavior, touched routes, domain invariants, network-write impact, in-progress compatibility, exact per-task resume classification, public/auth/parent-return evidence, exact-head CI/Cognitive browser evidence, and rollback that retains existing task components and engine versions.
