# Native Simon v1.0.0 implementation (2026-10-23)

This is a new native PILOT, not an executed copy of the upstream runtime. The other eight imported files retain the PR #330 design/provenance snapshot; statements there such as “未实现” describe that earlier snapshot, not this implementation. Source permission does not establish scientific validation.

## Frozen protocol

- Identity/config: simon / engine 1.0.0 / scoring 1.0.0 / config 1.0.0. DRAFT, standard profile only. No normative reference or legacy 0–100 score.
- Generated red/blue rectangles; physical ArrowLeft/ArrowRight only. Mapping is `red-left` (A) or `blue-left` (B), selected once from the frozen seed, shared by practice and formal trials. Instructions reflect the mapping.
- Twenty unpersisted practice trials and 100 persisted `test` trials. Four color × side cells appear exactly 5 or 25 times, Fisher–Yates shuffled separately. Versioned FNV-1a/Mulberry32 seeded generation also determines integer ISI 500–999 ms. Backend and frontend sequence parity is checked; all submitted stimulus/mapping identities are rebuilt from the frozen seed.
- Two requestAnimationFrame callbacks precede display. The second reveals the rectangle and captures performance.now in the same callback. This is a software onset estimate, not measured photon onset. The first accepted non-repeat arrow hides the rectangle but does not shorten the 2000 ms window. Other keys/pointers do not answer. RT acceptance is 0 ≤ RT < 2000 ms; exactly 2000 is rejected.
- At the end of the full practice window, feedback starts for 1000 ms, followed by the seeded post-trial interval. Formal trials have no correctness feedback; the seeded interval precedes submission/next trial. Submission/React overhead can lengthen transitions; these are not hardware-calibrated intervals.
- Layout is platform-owned: an at-most-800px-wide, 320px-high stage, 25%-wide × 180px-high rectangle at 10%/65% horizontal position. It is not claimed equivalent to upstream viewport geometry.
- Required raw timing metadata records strategy, software onset, observed window end and planned ISI. The backend requires exact envelope onset/end agreement and seed-reconstructed ISI; missing timing is rejected. A null software onset is retained only as technically invalid. Blur/hidden-tab events mark the trial interrupted, including events after a response but before the complete response window finishes. Current document visibility and focus are checked at each trial start, display and completion, so continued focus loss across trials remains technically invalid; regained focus does not erase an earlier interruption. Interruptions are not converted to wrong behavior. OS/browser/device provenance belongs to the existing host runtime.

## Authoritative scoring

Condition comes from stimulusSide versus requiredSide, never the actual response. Only ordered formal trials are scored; stimulus/mapping/condition tampering is rejected. Practice is not persisted.

For each condition, retain trial count, technical-valid count, valid correct RT count, mean/median RT, accuracy, wrong-key rate, omission rate, and interruptions. Interruptions are excluded from behavioral denominators. Timeout without technical failure remains in the denominator. Zero RT can contribute to accuracy but not RT; correct finite RT must be strictly greater than zero and below 2000 ms. No 200 ms threshold, SD exclusion, trimming or imputation.

`simonEffectMeanMs = mean(incongruent) − mean(congruent)`. `accuracyCostRatio = accuracy(congruent) − accuracy(incongruent)`. Missing denominators or either condition’s correct RT yield null, not zero. All-wrong trials yield accuracy 0 and RT/effect null. The signed effect is descriptive, not a “lower is better” score. Nonzero counts alone do not establish reliability.

## Checks and limits

Task-owned tests cover balanced cells/both mappings, deterministic reconstruction, independent +100 ms golden arithmetic, empty/all-wrong cases, RT 0/0.1/1999.99/2000 boundaries, interruptions/timeouts, missing-condition null, and altered seed/mapping/phase/index/condition rejection. Frontend tests cover 20 unpersisted practice trials, full windows/feedback, pointer/repeat rejection, first-key locking, immediate hiding, focus-loss flags and timer cleanup. Synthetic data only.

No browser/monitor/keyboard hardware calibration, local population validation, normative study, live participant collection, production publication, deployment, or merge is implied. Chinese text is a research working translation. The parent integration performs host-level admission/persistence checks separately.
