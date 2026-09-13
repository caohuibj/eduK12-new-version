# FE-07B — Scoped Cognitive Timing + Diagnostics

Base: `main@1fcfbb1d684ffb6e1b3834669ef93e84e77ed45b` (PR #104 / FE-06 merged).

## Goal

Improve auditable **software timing** for an explicitly scoped Pilot subset without making claims the browser cannot support. FE-07B does **not** claim hardware calibration, photon-onset measurement, cross-device equivalence, device-latency correction, or Research Grade timing.

The implementation is deliberately frozen-identity gated. Existing sessions keep their existing engine/config behavior; new timing behavior is admitted only for exact reviewed `testType + engineVersion + configVersion` identities.

## Pilot task slice

The first timing slice remains limited to three published, non-adaptive timed-response task families:

- `reaction`;
- `gonogo`;
- `cpt`.

Adaptive/staircase/span/learning/staged tasks remain deferred, including `sst`, `nback`, `corsi`, `memory`, `stroop`, and `taskswitch`. Draft library tasks are also outside this first timing slice.

There is no category-wide switch and no universal Cognitive timing engine.

## Frozen identity admission

The existing published configurations remain legacy timing identities:

| task | legacy engine | legacy config | scorer | behavior after FE-07B |
|---|---:|---:|---:|---|
| `reaction` | `1.0.0` | `1.1.0` | `1.1.0` | unchanged legacy task path |
| `gonogo` | `1.0.0` | `1.0.0` | `1.0.0` | unchanged legacy task path |
| `cpt` | `1.0.0` | `1.0.0` | `1.0.0` | unchanged legacy task path |

FE-07B adds separate timing-pilot configuration identities:

| task | engine | timing-pilot config | scorer | seed status |
|---|---:|---:|---:|---|
| `reaction` | `1.0.0` | `1.2.0` | `1.1.0` | `DRAFT` |
| `gonogo` | `1.0.0` | `1.1.0` | `1.0.0` | `DRAFT` |
| `cpt` | `1.0.0` | `1.1.0` | `1.0.0` | `DRAFT` |

The config JSON itself stays within the existing strict task schema. No hidden timing field is inserted into the task configuration. The new `configVersion` is the frozen admission identity. This preserves scorer/config contracts while preventing a frontend deployment from hot-switching an already frozen session.

The timing-pilot seed rows are intentionally `DRAFT`. Merging FE-07B therefore does not by itself publish the new timing behavior. Promotion to a participant-facing published config remains a separate release decision after device evidence is reviewed.

## Baseline weakness being addressed

### Reaction

Legacy formal onset is `setTimeout(foreperiodMs) -> setSub('green') -> performance.now()` in the same timer callback. Legacy pointer input uses click-time `performance.now()`, and keyboard input ignores `event.timeStamp` and repeat.

### Go/No-Go

Legacy onset is `setTimeout(isiMs) -> setVisible(true) -> performance.now()`. Response is click-based and samples a new `performance.now()`.

### CPT

Legacy onset is also timer callback state change followed by `performance.now()`. Root click/key handlers share a response function that samples `performance.now()` instead of the browser event timestamp.

These values are useful behavioral timing values, but the legacy start reference is not evidence of a frame-boundary software onset and the endpoint is not browser-event timestamp based.

## Envelope / payload contract gate

`frontend/core/trial-envelope.ts` remains transport metadata, not independent stimulus-onset telemetry. Its derived `startedAtPerfMs` must not be described as an observed stimulus onset.

The three task payload schemas remain unchanged and strict:

- Reaction: `foreperiodMs`, `rtMs`, `prematureCount`, `interrupted`, `inputMode`;
- Go/No-Go: `trialType`, `responded`, `rtMs`, `interrupted`;
- CPT: `blockIndex`, `stimulus`, `isTarget`, `responded`, `rtMs`, `interrupted`.

FE-07B adds no per-trial diagnostics API, no diagnostics payload extension, no timing heartbeat, and no server-side RT correction.

## C2 — Clock and time-origin contract

The shared timing primitive now:

- uses only the current document `performance` monotonic domain;
- captures and validates `performance.timeOrigin`;
- rejects unavailable or invalid monotonic clock values instead of falling back to `Date.now()`;
- validates browser event timestamps against the current monotonic domain;
- rejects epoch-like/future timestamps instead of silently rebasing them;
- fails closed if a response sample no longer matches the onset document time origin.

An invalid event timestamp may use the current monotonic `performance.now()` only as a usability fallback. That response is quality-degraded (`interrupted=true`); the fallback is not described as calibrated correction.

## C3 — Software frame onset

For the exact timing-pilot identities only:

1. the existing `setTimeout` wait decides when presentation is eligible;
2. the task requests an animation frame;
3. the rAF callback timestamp becomes the software onset candidate after same-domain validation;
4. stimulus duration/response timeout is scheduled relative to that adopted onset path.

`requestAnimationFrame` is only a software frame-boundary / paint-adjacent reference. It does not prove DOM commit in the same frame, display scan-out, or photon onset.

Legacy task components remain the default path for old config identities.

## C4 — Direct response capture

### Reaction

Timing-pilot Reaction uses task-owned:

- `pointerdown` for pointer/touch;
- window `keydown` for keyboard;
- `event.timeStamp` as the preferred endpoint;
- keyboard repeat rejection;
- primary-pointer filtering;
- non-left mouse button rejection;
- pointer cancellation handling;
- existing duplicate-response guard.

The existing Reaction `inputMode` field distinguishes `touch`, `pointer`, and `keyboard`; no new payload field is added.

### Go/No-Go

Timing-pilot Go/No-Go uses direct `pointerdown` with event-timestamp validation. FE-07B deliberately does **not** add a keyboard response mode because the current task contract did not define one.

### CPT

Timing-pilot CPT uses direct `pointerdown` and `keydown` with event-timestamp validation. Keyboard repeat, non-primary pointers, and non-left mouse buttons are ignored. The strict CPT payload remains unchanged and therefore does not add input-modality metadata.

One physical/logical accepted response still produces at most one accepted trial response.

## C5 — Bounded local diagnostics

Timing diagnostics are task-local, memory-only, and fixed-capacity. The ring buffer defaults to 64 records and hard-caps capacity at 128.

The closed diagnostic code set covers:

- frame callback delay (`eligible -> rAF callback`);
- unavailable clock;
- changed time origin;
- rejected event timestamp;
- visibility loss;
- focus loss;
- pointer cancellation.

The three timing-pilot tasks record formal-trial frame/event/focus/visibility/cancel context into this local buffer. Diagnostics have no persistence/network/export API and disappear when the mounted task is discarded.

Diagnostics are observational only. They never subtract frame delay, event age, dispatch latency, touch latency, or estimated device latency from `rtMs`.

## C6 — Regression evidence and release gate

### Automated evidence included in this PR

The implementation includes automated coverage for:

- exact frozen identity admission and legacy fail-closed routing;
- monotonic clock/time-origin validation;
- event timestamp acceptance/rejection;
- frame-boundary onset behavior for the three Pilot tasks;
- direct touch/pointer/keyboard timestamp handling where the task contract supports it;
- repeat and pointer filtering;
- strict payload shape preservation;
- bounded diagnostics behavior;
- legacy task path preservation for prior config versions.

Normal repository CI remains the authority for lint, typecheck, full frontend/backend regressions, build, security checks, browser acceptance, and Docker build gates on the final candidate head.

### Real-device evidence status

FE-07B source code does **not** include evidence sufficient to claim hardware/device equivalence. Real-device runs under representative desktop, tablet/touch, and external-keyboard conditions are still a **publication gate** for the new DRAFT timing-pilot configs.

Recommended publication evidence should characterize, not auto-correct:

- rAF callback delay distribution under idle and UI/CPU load;
- accepted event timestamp age and rejection rate;
- visibility/focus/cancel incidence;
- trial count/order/timeout invariants;
- scorer-golden equivalence for identical raw task payload semantics;
- touch, mouse, trackpad, and supported keyboard paths on representative devices/browsers.

Failure to obtain stable evidence should keep the new configs DRAFT or `LIMITED`; it must not trigger an automatic latency-correction model.

## Final software support matrix

| task / timing config | desktop keyboard | desktop pointer | tablet touch | tablet + keyboard | software timing evidence | release status |
|---|---|---|---|---|---|---|
| Reaction `1.2.0` | direct `keydown`, repeat filtered, event timestamp | direct primary `pointerdown`, event timestamp | direct primary touch `pointerdown`, `inputMode=touch` | same keyboard path when browser exposes it | frame-onset + same-origin event endpoint implemented/tested | `LIMITED`, DRAFT until device evidence |
| Go/No-Go `1.1.0` | not added by FE-07B | direct primary `pointerdown`, event timestamp | direct primary touch `pointerdown` | no dedicated keyboard response contract | frame-onset + pointer endpoint implemented/tested | `LIMITED`, DRAFT until device evidence |
| CPT `1.1.0` | direct root `keydown`, repeat filtered, event timestamp | direct primary root `pointerdown`, event timestamp | direct primary touch `pointerdown` | same root keyboard path when browser exposes it | frame-onset + pointer/keyboard endpoint implemented/tested | `LIMITED`, DRAFT until device evidence |

`LIMITED` is an evidence status, not a diagnosis, scorer change, or hardware-quality classification. No task becomes Research Grade through FE-07B alone.

## Invariants preserved

FE-07B preserves:

- ONE UNIT / ONE FINAL;
- zero per-trial server writes during FINAL_ONLY administration;
- authoritative server scoring and CanonicalUnitResult behavior;
- strict task payload schemas;
- old frozen config identities and legacy task paths;
- FE-07A fail-closed resume behavior;
- no global hardware/device fingerprinting;
- no automatic device-latency correction;
- no persistence work added to the timed stimulus hot path.

## Merge vs publication

The code change is safe to merge once the final exact-head CI is green because the new timing-pilot configuration rows are seeded as `DRAFT`. Merge therefore installs a versioned capability without silently changing existing sessions or publishing it to normal participants.

Publishing Reaction `1.2.0`, Go/No-Go `1.1.0`, or CPT `1.1.0` is a separate decision and should require the real-device evidence described above.
