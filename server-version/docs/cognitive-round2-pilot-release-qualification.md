# Cognitive Round 2 Pilot Release Qualification — 2026-09-22

Base: `main@46d0efb6c6a44d83f350b9277ad6660e0d50efca`

## Scope

This release qualification covers the 15 currently DRAFT Cognitive tasks:

- Core: patterncompare, flanker, cardsort, digitbackward, picturesequence, pairedassociate, matrix, mentalrotation, tower.
- Extended: trailmaking, reversallearning, bart, wordlist, lexicaldecision, emotionrecognition.

The product target is `PUBLISHED + PILOT`. Scientific maturity is independent from product lifecycle. Missing evidence for RESEARCH_READY/RESEARCH_GRADE is not by itself a PILOT publication blocker.

## Current engineering baseline

All 15 tasks already have task-owned backend execution, scorer, semantics, seed, frontend runner binding, participant presentation, scientific declaration, exact fixtures, and declared frontend acceptance suites. PR #148 reported passing onboarding decisions for all historical exact identities, and PR #149 integrated the onboarding/release architecture into main with full CI.

No task in this batch currently requires a new shared runtime primitive. New hardware, adaptive execution, timing primitives, or unsupported input modalities would still require a separate Platform Capability Change.

## Qualification policy

For this batch, automated work should close all machine-verifiable requirements:

1. exact package/manifest/registry identity;
2. config/profile/FINAL validation;
3. deterministic scorer fixtures and independent golden tests;
4. frontend runner and participant-presentation acceptance;
5. rights/provenance and report claim boundaries;
6. PILOT scientific declaration with explicit known limitations;
7. content-only boundary for task-owned release edits;
8. explicit lifecycle promotion only after the release candidate passes CI.

Human evidence is not fabricated. Real-device or real-participant evidence may remain as a scientific/device limitation for PILOT unless it is necessary to establish basic product operability.

## Known special case

BART 1.0.0 has a baseline-pinned compatibility warning: `adjustedPumps` and `meanPumpsAllCompleted` are fractional scorer outputs but the historical metric metadata declares count/integer. The 1.0.0 identity must not be mutated in place. Promotion should use a new exact identity with corrected metric value types.

## Publication sequencing

- Qualification changes do not publish database rows.
- Product publication remains an explicit `DRAFT -> PUBLISHED` operation through the Cognitive release workflow.
- Seed status is an initial bootstrap state only. After explicit publication or retirement, deterministic seeding preserves the existing DB lifecycle state as long as immutable core content still matches; it never republishes, retires, or downgrades a row.
