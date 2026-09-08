# COG-P2 Device & Input Provenance V1 — Final Local Gate Report

Date: 2026-09-08
PR: #62 `feat(cognitive): COG-P2 device and input provenance v1`
Scope: COG-P2 closure only. No COG-P3, PR #54, scorer/reference/report/Bundle/COS changes, performance work, device correction, or norms work was started.

## 1. Git baseline and branch discipline

- `origin/main`: `7fe641fcb024fa0f768176be0ec64ccfb15d490c`
- Direct merge of `origin/main` into the feature branch: merge commit `f38798d33a331bfddabcf916bf06a56c4d51d5f3`
- Merge result: clean, zero conflicts; no rebase, force reset, or history rewrite.
- PR remains open and unmerged.
- The workflow workaround from the original PR was removed. `git diff origin/main -- .github/workflows/ci.yml` is empty.
- The two pre-existing local environment documents under `docs/` were preserved and are not part of the feature change.

## 2. Local validation environment

- Windows PC with WSL2 Ubuntu-24.04 and the repository at `D:/Project/eduK12-new-version`.
- Docker Compose project: `eduk12-local`.
- Services used: PostgreSQL 14, Redis 7, backend, worker, and frontend.
- Frontend: `http://localhost:8080`.
- Browser: installed Chrome, driven headlessly for repeatable smoke checks; touch run is browser emulation, not a physical mobile-device claim.
- Repository runtime: Node 20.20.2 through the project container/Corepack.
- Services were rebuilt from the feature branch and reported healthy before browser validation.

## 3. Automated gate results

All results below are from clean temporary copies of the backend/frontend source. The repository working tree was not modified by dependency installation. PostgreSQL integration used the real local `ptool-postgres` service; it was not mocked and did not skip.

| Gate | Result |
|---|---|
| Backend focused provenance test (`administration-provenance.test.ts`) | 1 file, 5 passed, 0 failed |
| `test:integration:instrument-final` | 1 file, 11 passed, 0 skipped |
| Frontend focused tests (provenance, hook, session, draft store) | 4 files, 30 passed, 0 skipped |
| Backend typecheck/build | passed |
| Frontend typecheck | passed |
| Docker Compose rebuild of backend/worker/frontend | passed; all services healthy |

The first backend focused-test attempt encountered a Windows CRLF-only source-snippet mismatch in the temporary test copy. After normalizing line endings in that temporary copy, the same five tests passed. No production source was changed for this environment artifact.

The real-PostgreSQL integration assertions covered authenticated and public FINAL propagation, encrypted `CognitiveRawSubmission` round-trip/decryption, result/trial isolation, same-provenance replay, changed-provenance conflict, old/no-provenance `{trials}` hash compatibility, no extra `CognitiveTrial` write, and raw query/write observations.

## 4. Real-PC browser smoke results

The smoke fixture created a temporary Reaction v1.1.0 assignment with eight formal experience-profile trials.

### Desktop mouse and IndexedDB resume

- Session completed: `6d944f18-3355-414c-b783-2050356417e5`.
- FINAL request provenance: `DESKTOP_LAPTOP` × `KEYBOARD_MOUSE`.
- Formal trial count: 8.
- After the first formal trial, IndexedDB showed `DRAFT`, one persisted trial, and the expected provenance metadata. After a real page refresh, the same draft status, trial count, and provenance were present; the session resumed at trial 2.
- Completion reached the result page; a real result-page refresh still rendered the data-quality section.
- The browser probe observed `pointerType=mouse` inside the cognitive task root; a final completion-control pointer event was outside the root and excluded.

### Desktop keyboard

- Session completed: `5ccba875-b3c5-409c-9797-dc95a5ca475a`.
- FINAL request provenance: `DESKTOP_LAPTOP` × `KEYBOARD_MOUSE`.
- Formal trial count: 8; result page remained available after refresh.
- Keyboard probe observed `Enter` inside the cognitive task root. Control/outside inputs were not included in task modality evidence.

### Mixed input / browser emulation

- Session completed: `6d9191d5-c12f-499f-80b5-4416382aeb3e`.
- Context: mobile viewport with `hasTouch`; this is browser emulation only.
- Probe observed `pointerType=touch` on a formal task response, together with mouse/keyboard input.
- FINAL request provenance: `PHONE` × `MIXED`; formal trial count: 8; result page remained available after refresh.

### Public recovery A/B

- Context A completed one formal trial and retained the public recovery credential.
- Independent context B used that credential and reached the same server session, but the current `FINAL_ONLY` architecture reset the runner to trial 0 rather than resuming at trial 1.
- Feature-branch result: `RESET_TO_TRIAL_0`, `priorTrialsInA=1`, `crossContext=true`.
- This is recorded as an existing product limitation, not silently treated as successful cross-context recovery. The COG-P2 scope does not add partial public persistence or redesign recovery semantics.

## 5. Durable-storage and query/write evidence

- `AdministrationProvenanceV1` is persisted only with the existing encrypted FINAL raw envelope.
- The integration test decrypted the raw payload and matched the exact provenance object.
- Provenance is absent from the result snapshot and each `CognitiveTrial` row.
- Same-provenance replay is accepted; changed provenance conflicts; legacy no-provenance FINAL payloads retain the canonical trials-only identity.
- The instrument-final integration test observed no provenance-specific extra query/write and no additional `CognitiveTrial` write.
- No Prisma migration, session provenance column, provenance index, or second durable provenance truth was added.

## 6. Tier matrix audit

| Tier | Instruments |
|---|---|
| A — required full coverage | reaction, cpt, gonogo, sst, stroop, flanker, taskswitch, patterncompare, trailmaking, lexicaldecision, cardsort |
| B — required full coverage | nback, matrix, mentalrotation, tower, reversallearning, bart, emotionrecognition, pairedassociate, picturesequence |
| C — explicit no-new-hook list | memory, corsi, digitbackward, wordlist |

The audit document records the same 11/9/4 classification and the C-tier exclusion from new hook wiring.

## 7. Scope audit

- No scorer, reference, report, Bundle, COS, calibration, correction-factor, norm, or performance changes.
- No raw user-agent, fingerprint, GPU/canvas, persistent device ID, location, IMEI, MAC, or serial capture.
- No per-trial provenance duplication.
- Editable-input keydown exclusion, control-click exclusion, listener cleanup, O(1) modality aggregation, and non-blocking metadata persistence failure behavior are covered by focused frontend tests.
- Historical Trail Making device fields were preserved; provenance warnings remain non-degrading.

## 8. CI and merge gate

The final feature head and latest-head CI status must be recorded after the branch is pushed. No merge is authorized by this report.

At the time this report was authored, the local gate was complete except for the latest-head remote CI result and the required main-branch public-recovery A/B classification.

## 9. Final disposition

- Physical phone/tablet validation: not claimed; the mixed-input run is explicitly browser emulation.
- Public cross-context partial recovery: pre-existing `FINAL_ONLY` reset behavior must remain visible to reviewers.
- Human review and latest-head CI remain required before any merge.

`COG-P2 MERGE READY: PENDING MAIN A/B AND LATEST-HEAD CI`
