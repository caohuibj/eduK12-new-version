# FE-07A — Cognitive Shell + Input / Resume Readiness

Base: `main@2ea5a4c2634e3ef871b5663f27a59ef5951040a6` (PR #103 / FE-05 merged).

## Goal

FE-07A moves the Cognitive product journey onto the shared `AssessmentShell` while preserving exact task ownership, frozen runtime identity, task-owned timing, local durability, media presentation boundaries and authoritative FINAL behavior. Scoped reaction-time/frame-sync work remains FE-07B.

## Implemented C1–C6

1. **C1 support matrix** — all 25 current frontend registry identities are represented by exact `testType + engineVersion` readiness profiles. There is no latest/nearby-version fallback.
2. **C2 shared shell** — `CognitiveRunner` projects loading, ready, running, local save, completion/submission, unsupported, recovery and error states into `AssessmentShell`. Reducer, `resolveRunner`, task components and version selection remain Cognitive-owned.
3. **C3 readiness/media** — frozen images and video capability URLs are prepared before `START_RUN`; instruction media may display before start; example/stimulus disclosure remains task-owned. FINAL_ONLY instruction video uses the existing FE-03B durable full-view marker before start.
4. **C4 input provenance** — existing administration provenance records observed pointer/touch/keyboard behavior. Global keyboard capture is now selected by the exact readiness profile rather than a second hard-coded task list. Screen width is never treated as input modality.
5. **C5 resume audit** — every current exact FINAL_ONLY task is fail-closed as `restart-required` after saved unsealed trials. The existing draft has trial payload/index and generic metadata but no task-level durable phase/adaptive/staircase checkpoint contract sufficient to prove a safe remount. Exact sealed FINAL replay is preserved and remains distinct from task resume.
6. **C6 integration acceptance** — focused tests cover exact readiness identity, no version fallback, Shell status changes without remounting an active task, media failure without task/trial pollution, and durable instruction-video completion identity.

## Exact registry readiness matrix

All current identities use engine version `1.0.0`. `keyboard / pointer / touch` describes supported observed input channels at the product-provenance layer; it does not claim equivalent measurement quality across devices. No current frozen task contract declares a mandatory orientation, so FE-07A does not invent one.

| testType | category | input/profile fact | orientation | FINAL_ONLY resume | frozen media |
|---|---|---|---|---|---|
| fake | fixed-trial | pointer/touch; keyboard events inside task root if used | any | restart-required | instruction/example/stimulus |
| reaction | timed-response | keyboard global capture + pointer/touch | any | restart-required | instruction/example/stimulus |
| memory | adaptive | keyboard global capture + pointer/touch | any | restart-required: adaptive span state not durable | instruction/example/stimulus |
| stroop | staged | keyboard global capture + pointer/touch | any | restart-required: practice/formal and stimulus subphase not durable | instruction/example/stimulus |
| gonogo | timed-response | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| cpt | timed-response | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| nback | adaptive | keyboard/pointer/touch observed in task root | any | restart-required: N level/stage not proven by trial index | instruction/example/stimulus |
| corsi | adaptive | keyboard/pointer/touch observed in task root | any | restart-required: span/adaptive state not durable | instruction/example/stimulus |
| sst | adaptive | keyboard/pointer/touch observed in task root | any | restart-required: staircase/stage state not durable | instruction/example/stimulus |
| taskswitch | staged | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| patterncompare | timed-response | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| flanker | staged | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| cardsort | staged | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| digitbackward | adaptive | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| picturesequence | staged | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| pairedassociate | learning | keyboard/pointer/touch observed in task root | any | restart-required: learning/exposure state not durable | instruction/example/stimulus |
| matrix | fixed-trial | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| mentalrotation | visuospatial | keyboard/pointer/touch observed in task root | any | restart-required | instruction/example/stimulus |
| tower | planning | keyboard/pointer/touch observed in task root | any | restart-required: within-problem plan state not durable | instruction/example/stimulus |
| trailmaking | visuospatial | keyboard/pointer/touch observed in task root | any | restart-required: within-trial path state not durable | instruction/example/stimulus |
| reversallearning | learning | keyboard/pointer/touch observed in task root | any | restart-required: learning/reversal state not durable | instruction/example/stimulus |
| bart | decision | keyboard/pointer/touch observed in task root | any | restart-required: within-balloon pump state not durable | instruction/example/stimulus |
| wordlist | learning | keyboard/pointer/touch observed in task root | any | restart-required: learning/recall phase not durable | instruction/example/stimulus |
| lexicaldecision | timed-response | keyboard global capture + pointer/touch | any | restart-required | instruction/example/stimulus |
| emotionrecognition | timed-response | keyboard global capture + pointer/touch | any | restart-required | instruction/example/stimulus |

The matrix is intentionally conservative. A task may move to `trial-boundary-safe` only when an exact frozen/local contract persists enough task-specific state to prove that remounting cannot replay an exposed stimulus, alter an adaptive path, or reconstruct a different logical administration. `max(trialIndex) + 1` is never accepted as proof by itself.

## Shell and progress semantics

- `LOADING` is interaction preparation, not submission.
- `COMPLETING` is submission of the existing logical FINAL, not generic loading.
- sealed/pending FINAL recovery is shown as pending/reconciliation semantics; the UI never rebuilds another FINAL.
- fixed manual tasks with a real denominator may use position progress.
- adaptive/task-owned completion uses phase progress; FE-07A does not invent a denominator or percentage.
- Shell status changes remain outside the task component identity. The active task stays a domain child under `data-cognitive-task-root`.

## Media boundary

Cognitive keeps the existing MEDIA-3/MEDIA-7 model: all frozen image assets and video capability URLs are prepared before start, while example/stimulus timing stays inside the task. FE-07A adds only the product decision that FINAL_ONLY **instruction** videos must be fully viewed before `START_RUN`, reusing FE-03B `required-full-view-v1` metadata in the existing draft.

The durable marker identity is:

- `draftKey = cognitive:<sessionId>`;
- stable instruction slot key (`cognitive-instruction:<index>:video`);
- immutable video `assetId + contentHash`;
- existing viewing-policy version.

No `currentTime`, watched percentage, playback cursor or media heartbeat is persisted or sent to the server. Sessions with no instruction video schedule no completion-adapter state update, preserving the existing no-video render contract.

## Input / device boundary

Administration provenance keeps two separate facts:

- coarse device class (`PHONE | TABLET | DESKTOP_LAPTOP | UNKNOWN`), inferred conservatively from screen/device capabilities;
- observed administration mode (`TOUCH | KEYBOARD_MOUSE | MIXED | UNKNOWN`), derived from actual response interactions.

Viewport width is not an input method. Touch-capable laptops/tablets with keyboards are allowed to become `MIXED` from observed behavior rather than being forced into a viewport-derived mode. FE-07A adds no device correction or scientific equivalence claim; calibration remains evidence work outside the participant hot path.

## Resume and in-progress compatibility

Existing frozen sessions and drafts are not migrated to another engine identity. For FINAL_ONLY:

- no saved trial: normal READY/start path remains available;
- saved unsealed trial(s): FE-07A retains the draft but blocks automatic task remount and offers supported return/restart handling;
- sealed FINAL: existing exact sealed payload replay + terminal reconciliation remains authoritative;
- server COMPLETED: local draft cleanup remains authoritative.

This is deliberately safer than the previous generic `max(trialIndex) + 1` presentation path. It does not delete old trials or silently rewrite them.

LEGACY Cognitive keeps its existing read-only/restart behavior; FE-07A does not retrofit the new FINAL_ONLY resume contract into legacy checkpoint delivery.

## Hard boundaries

FE-07A does **not**:

- change reaction-time capture, timing constants, frame synchronization or timing diagnostics (FE-07B);
- add a universal Cognitive controller or move task reducers into `AssessmentShell`;
- change scorer, scoringVersion, metrics, reports, CanonicalUnitResult or frozen runtime identity;
- add per-trial server writes for FINAL_ONLY;
- add a second draft store or change the IndexedDB schema/version;
- add database migrations;
- infer input modality from viewport width;
- silently replay an unfinished/exposed timed stimulus.

## Network / persistence impact

- **0 new answer/trial server writes**;
- **0 server video-progress writes**;
- **0 database schema changes**;
- **0 IndexedDB schema/version changes**;
- **0 FINAL/scorer/runtime protocol changes**;
- one additional local metadata use: existing required-video completion marker for FINAL_ONLY instruction videos.

## Validation coverage

Focused FE-07A tests cover:

- all 25 exact readiness profiles and no version fallback;
- current fail-closed resume classification;
- global-keyboard capture selected by exact profile;
- no-video adapter produces no extra render;
- instruction completion persists only exact draft/slot/asset identity;
- active task DOM survives Shell `RUNNING -> SUBMITTING_TRIAL` status updates;
- unavailable required media does not mount the task or create trial data;
- existing Cognitive page states map to Shell recovery/submission semantics.

Draft exact-head CI must pass lint/typecheck before Ready. Full frontend tests/build, backend regression, browser gate, CodeQL, Docker/Trivy and applicable Cognitive/media acceptance run only on the final Ready candidate. Skipped gates are never reported as passed.

## Parallel / rollback

FE-06 / PR #104 is Situational-scoped and has no same-file overlap with this branch. FE-07A consumes the merged `AssessmentShell`, final draft store and media contracts; it does not redefine them.

Rollback restores the previous Cognitive page-local presentation and READY behavior while retaining unchanged task components, exact engine versions, frozen sessions, existing final draft data, media capability contracts and authoritative FINAL/scoring behavior. The readiness profile/document can remain as an audit artifact or be reverted independently.
