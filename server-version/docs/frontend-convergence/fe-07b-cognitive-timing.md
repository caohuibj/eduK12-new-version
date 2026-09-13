# FE-07B — Scoped Cognitive Timing + Diagnostics

Base: `main@1fcfbb1d684ffb6e1b3834669ef93e84e77ed45b` (PR #104 / FE-06 merged).

## Goal

Improve auditable software timing only for an explicitly scoped Pilot subset. FE-07B does **not** claim hardware calibration, photon-onset measurement, cross-device equivalence, or Research Grade timing. Existing frozen sessions keep their existing engine/protocol behavior; timing changes are admitted only for new sessions under an exact reviewed identity.

## C1 — Pilot scope and timing baseline

### Pilot task slice

The first FE-07B timing slice is deliberately limited to three currently published, non-adaptive timed-response tasks:

| task | engine | config | scoring | definition/profile | current publication fact | FE-07B scope |
|---|---|---|---|---|---|---|
| `reaction` | `1.0.0` | `1.1.0` | `1.1.0` | `1.1.0` | published/recommended current definition | in scope |
| `gonogo` | `1.0.0` | `1.0.0` | `1.0.0` | `1.0.0` | published/recommended current definition | in scope |
| `cpt` | `1.0.0` | `1.0.0` | `1.0.0` | `1.0.0` | published/recommended current definition | in scope |

Why these three:

- all three are already in the current published v2 set and scoring-golden/release coverage;
- they are timed-response tasks without adaptive staircase/span/learning state, reducing the chance that a timing patch changes task semantics beyond onset/input capture;
- all three currently expose the same class of software-reference weakness: timer callback changes React-visible stimulus state and immediately records `performance.now()`, while the response path does not use the event timestamp as its RT endpoint;
- they provide a useful minimum input surface: Reaction already distinguishes keyboard vs pointer in payload; CPT accepts click/keyboard on the task root; Go/No-Go currently accepts click only.

### Explicitly deferred tasks

FE-07B does not automatically migrate every published Cognitive task.

- `sst`, `nback`, `corsi`, `memory`: adaptive/staircase/span state; timing changes require separate task-level review.
- `stroop`, `taskswitch`: staged/practice/formal subphase semantics; defer until the initial timing primitive is proven.
- DRAFT tasks such as lexical decision/emotion recognition and other library candidates are outside the first Pilot timing release even if they are RT-sensitive.

Adding another task requires an explicit support-matrix update and exact-version review; there is no category-wide opt-in.

## Current source baseline

### Reaction

Current formal onset path:

1. `setTimeout(foreperiodMs)` fires;
2. `setSub('green')` schedules the visible React state;
3. `setStimulusOnset(performance.now())` runs immediately in the same timer callback.

Current response path:

- pointer uses React `onClick`, then samples a new `performance.now()`;
- keyboard uses a window `keydown` listener, but ignores `event.timeStamp` and does not currently filter `event.repeat`;
- premature responses reset the trial waiting subphase;
- timeout remains scheduled with `setTimeout`.

Therefore current `rtMs` is a useful existing behavioral value but is **not** evidence that the recorded start equals the first painted stimulus frame or that the endpoint equals the browser event timestamp.

### Go/No-Go

Current onset path is `setTimeout(isiMs) -> setVisible(true) -> onsetRef = performance.now()`.

Current response path is a React `onClick` button handler that samples `performance.now() - onsetRef`. There is no task-level keyboard event capture or event-timestamp endpoint in the current component.

### CPT

Current onset path is also `setTimeout(isiMs) -> setVisible(true) -> onsetRef = performance.now()`.

The task root currently handles both React `onClick` and `onKeyDown`, but both call the same `respond()` function, which samples `performance.now()`. It does not use `event.timeStamp`, does not distinguish keyboard/pointer/touch in the trial payload, and does not filter key repeat.

## Envelope / payload contract gate

`frontend/core/trial-envelope.ts` is currently a transport wrapper, not an independent timing telemetry source. It derives `durationMs` from task payload fields such as `rtMs`, samples an envelope end time, then computes `startedAtPerfMs = endedAtPerfMs - durationMs`. That derived start must **not** be described as stimulus onset in FE-07B evidence.

The backend TrialEnvelope schema is strict for envelope fields. The three selected task payload schemas are also strict:

- Reaction: `foreperiodMs`, `rtMs`, `prematureCount`, `interrupted`, `inputMode` only;
- Go/No-Go: `trialType`, `responded`, `rtMs`, `interrupted` only;
- CPT: `blockIndex`, `stimulus`, `isTarget`, `responded`, `rtMs`, `interrupted` only.

Consequences for this PR:

1. frame/event/focus/visibility diagnostics remain local diagnostic records unless a compatible existing field is proven;
2. do not add arbitrary timing metadata into strict trial payloads;
3. do not add a per-trial diagnostics API;
4. if server persistence of new metadata becomes necessary, open a separate BE-C1 contract PR; any accepted metadata may travel only with the existing unit FINAL budget;
5. no automatic RT correction is derived from diagnostics.

## Timing reference contract for C2–C5

FE-07B may introduce a task-local timing helper, but not a global device engine.

The target software contract is:

- scheduler wait (`setTimeout`) may decide when a presentation attempt becomes eligible;
- task-owned presentation then crosses an explicit frame boundary before recording its software onset reference;
- onset reference and response event timestamp must be comparable within the same document time origin;
- direct response collection uses task-owned `pointerdown` / `keydown` where appropriate, with repeat, multitouch and cancellation handling;
- one physical/logical user response produces at most one accepted trial response;
- timeout is computed relative to the adopted software onset reference;
- visibility/focus/frame diagnostics are evidence/quality context only and never silently subtract latency from `rtMs`.

`requestAnimationFrame` is still a software scheduling/paint-adjacent reference. It is not a claim about display scan-out or photon onset, and React state changes inside an rAF callback are not automatically proof that the DOM became visible in that same frame. Each task must use an explicit task-owned presentation sequence and browser/device experiments.

## Planned review slices

- **C2** — task-local clock/time-origin validation and bounded local diagnostics primitive.
- **C3** — frame-synchronized software onset path for `reaction`, `gonogo`, `cpt` only.
- **C4** — direct `pointerdown` / `keydown` response capture, event timestamp validation, repeat/multitouch/cancel handling.
- **C5** — bounded frame/event/focus/visibility diagnostics; no RT correction and no server per-trial writes.
- **C6** — real-device/load experiments plus trial order/count/timeout/correctness/scoring-golden regression and final support matrix.

## Initial support matrix

| task | desktop keyboard | desktop pointer | tablet touch | tablet + keyboard | current timing status | candidate release status |
|---|---|---|---|---|---|---|
| reaction | existing | existing | click compatibility, not direct touch timestamp | existing keyboard path | baseline only | `LIMITED` until C3–C6 evidence |
| gonogo | no dedicated keyboard task path | existing click | click compatibility, not direct touch timestamp | not proven | baseline only | `LIMITED` until C3–C6 evidence |
| cpt | existing root keydown | existing root click | click compatibility, not direct touch timestamp | existing root keydown | baseline only | `LIMITED` until C3–C6 evidence |

`LIMITED` here is an evidence status, not a scorer change and not a hardware diagnosis. No task becomes Research Grade through FE-07B alone.

## Non-goals / invariants

FE-07B must preserve:

- ONE UNIT / ONE FINAL and zero per-trial server writes during FINAL_ONLY administration;
- task payload/scoring semantics unless an exact new protocol identity is separately approved;
- authoritative server scorer and CanonicalUnitResult behavior;
- FE-07A fail-closed resume behavior;
- existing frozen sessions and drafts without hot-switching their timing policy;
- no global hardware/device fingerprinting or latency correction engine;
- no persistence work in the timed stimulus hot path beyond the already approved trial-boundary behavior.

## C1 exit criteria

C1 is complete when this scope is reviewed as the source of truth for FE-07B implementation. C1 intentionally changes **no task timing behavior** and therefore cannot be cited as timing improvement evidence. Exact-head CI for later behavior commits must be rerun on the final candidate; historical green runs do not validate new timing behavior.
