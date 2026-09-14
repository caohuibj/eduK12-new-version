# FE-11 — Unified Journey / Device / Accessibility Gate

Baseline: `main@f48a01b74b1a30f2a56b9fa84c5316b5308494ec` after FE-10b / PR #110 merged.

## Purpose

FE-11 is the final Pilot Gate 1 validation package for Frontend Product Convergence v1.2. It validates one release candidate across the already-merged frontend/runtime work. It is **not** a new architecture, runtime, persistence, scoring, report, or authorization redesign.

A gate is passed only by evidence from the same candidate SHA. A skipped, unexecuted, stale, or different-SHA test is not PASS evidence.

## Planned slices

1. **C1 — Browser/auth fixture repair**
   - remove stale browser-test assumptions that successful login creates `localStorage.token`;
   - align reusable browser helpers with the current HttpOnly cookie session + CSRF transport;
   - preserve public capability/token flows as capability auth, not authenticated-user session state.
2. **C2 — Journey + network-write + ONE FINAL evidence**
   - connect representative Scale, Cognitive, Situational, Questionnaire/Form, and Bundle journeys;
   - classify browser network writes during answering/media/finalization;
   - assert frozen submission identity and one authoritative server result, not merely one button click or one HTTP request.
3. **C3 — Recovery/fault injection**
   - local storage unavailable/quota/upgrade blocked;
   - network before send, response loss after server commit, retry/backpressure, reconciliation read failure;
   - auth expiry, media delay/error, report read error, and duplicate-tab submission contention.
4. **C4 — Device/input/accessibility gate**
   - compact/medium/wide are layout dimensions; keyboard/pointer/touch/hybrid are independent input dimensions;
   - automated Chromium/WebKit/Firefox coverage where supported;
   - record real-device evidence separately for iOS/iPadOS Safari, Android Chrome, and Chromebook/hybrid as required by the v1.2 plan;
   - keyboard, focus, labels/errors, touch targets, status announcements, reduced motion, zoom/reflow, captions/transcript, safe-area/soft-keyboard checks.
5. **C5 — Gate blockers only**
   - repair defects that block G1–G8 and add focused regression tests;
   - larger domain/business changes leave FE-11 and return to the owning domain in a separate PR.
6. **C6 — Candidate release evidence**
   - final candidate SHA;
   - G1–G8 matrix with PASS/BLOCKED/NOT RUN, evidence references, supported device/task combinations, limitations, rollback rehearsal, and Pilot release checklist.

## Unified gate matrix

### G1 — Journey correctness

Cover discovery/detail → explicit start/resume → saved progress/reopen → FINAL/reconcile → exact result/parent return. Server-completed state wins over stale local state. Missing public credentials never silently create a replacement record. Different accounts never inherit another account's draft.

### G2 — ONE UNIT / ONE FINAL + write budget

For representative supported auth/public and standalone/embedded combinations:
- answering/trial/video progress creates zero server answer/trial/video-progress writes;
- one logical FINAL uses one frozen `submissionId`/unit identity/semantic payload across retry;
- server evidence confirms one authoritative `CanonicalUnitResult`/result;
- double click, rapid touch, two tabs, final-save contention, and final Bundle-unit response loss do not create duplicate logical results.

### G3 — Required video

Metadata/first-frame/buffer is not completion. Only normal 1× full playback unlocks. Seek/rate/system-control bypass must not falsely complete. Incomplete reload restarts from 0; valid completed markers survive same-slot reload but do not cross attempt/slot/hash identity. Viewing completion remains local-only state.

### G4 — Recovery / submission fault injection

Exercise IndexedDB/storage failures, network loss, lost FINAL response, capacity/retry behavior, reconciliation failure, Pending reload, 401/403/identity mismatch, report-read failure after commit, draft-cleanup failure, unsafe Cognitive resume, and stale Situational branch pruning.

### G5 — Cognitive domain safety

For every Pilot task included in release evidence, record supported input/viewport/orientation/interruption policy. Preserve task instance/randomization/trial order and timing semantics. Direct response events must not duplicate through key repeat/multitouch. Do not mix absolute timestamps across document time origins or silently correct RT. Real-device diagnostics are observational software timing evidence, not hardware calibration or Touch=Keyboard norm equivalence.

### G6 — Adaptive + accessibility

Representative coverage includes 360/390/768/820/Chromebook/desktop sizes and keyboard, pointer, touch, hybrid modalities without treating width as modality. Core controls need visible focus, no keyboard traps, associated labels/errors, usable 44px-class touch targets, no hover-only critical behavior, sensible announcements, zoom/reflow, and media accessibility. Scientifically non-equivalent adaptations are declared before entry rather than hidden behind UI substitution.

### G7 — Reports / history / export / role

All five result/receipt families used by the Pilot show meaningful content. Missing/invalid/unmeasured values are not displayed as zero. Screen and export remain bound to the same authorized snapshot. PILOT and RESEARCH_READY use the same product/runtime chain. Student/Teacher/Admin tests use real permissions. Parent/Observer remains **not passed** unless a real identity, durable binding, authorization, and report-access chain exists.

### G8 — Operability / visual consistency / release

Every route inventory row has migrated-pass or retained-mode evidence. Candidate passes typecheck/build/relevant tests/integration gate. Existing telemetry/logging may distinguish local-save/media/ambiguous-submit/reconcile/report-read failures without answers, tokens, raw input streams, or per-frame/per-trial remote writes. Old drafts/in-progress attempts and rollback are validated without destructive DB cleanup.

## C1 baseline audit

The current product uses an HttpOnly cookie session. `AuthContext` restores identity via `/auth/me`; the API transport uses credentials and obtains a CSRF token for unsafe methods. No frontend login contract requires or writes `localStorage.token`.

At this baseline, browser E2E scripts still contain legacy bearer-token/localStorage assumptions. Confirmed examples include:
- `e2e/composite-access-browser-e2e.cjs` — waits for `localStorage.token` after login and adds Authorization from it;
- `e2e/cognitive-round2-browser-e2e.cjs` — reads `localStorage.token` inside browser-side JSON requests;
- `e2e/cognitive-persistence-browser-e2e.cjs` — reads `localStorage.token` for authenticated API reads;
- additional Cognitive/Situational video/bundle/branching scripts are part of the C1 audit because they contain the same legacy lookup pattern.

C1 must replace those assumptions with a single narrow E2E session helper rather than reintroducing bearer-token storage into the application.

## Hard boundaries

- No new universal assessment controller, workflow engine, global device engine, second draft store, or new scoring logic.
- No per-answer, per-trial, per-frame, or video-heartbeat server writes.
- No changes to existing FINAL identity/scoring semantics merely to make tests easier.
- No frontend-only Parent/Observer simulation.
- No claim of real-device PASS from desktop emulation or WebKit alone.
- No business rewrite hidden inside a gate PR; significant domain fixes become separate owning-domain PRs.

## Initial status

- G1: NOT RUN on FE-11 candidate.
- G2: NOT RUN on FE-11 candidate.
- G3: NOT RUN on FE-11 candidate.
- G4: NOT RUN on FE-11 candidate.
- G5: NOT RUN on FE-11 candidate.
- G6: NOT RUN on FE-11 candidate; real-device evidence is explicitly outstanding.
- G7: NOT RUN on FE-11 candidate; Parent/Observer remains an external identity/binding/auth dependency.
- G8: NOT RUN on FE-11 candidate.

The first implementation task is C1 browser/auth fixture repair.