# Situational Text Pilot — PR-C launch guide

## Purpose

PR-C exposes the first participant-facing product surface for the standalone Situational Text Pilot. It is a published, pilot-maturity product for descriptive feedback, not a research-grade measurement product.

The only launchable package in this slice is `sjt-assertiveness-golden` (`PUBLISHED`, `PILOT`). Draft packages remain unavailable to participants.

The product contract is explicit:

- delivery is a frozen, linear `TEXT_V1` runner;
- response channels are `SINGLE_CHOICE` and `CONTINUOUS` only;
- sampling is `ALL`; there is no matrix sampling or adaptive selection;
- every attempt ends with one `FINAL_ONLY` submission;
- `referencePolicy` is `none` (`reference NONE` in the participant UI);
- no percentile, norm, population comparison, or diagnostic claim is displayed.

## Participant lifecycle

1. A student opens **情境测评** and sees only published pilot instruments.
2. Starting an instrument creates or resumes the server-owned attempt. The runner definition, instrument version, definition hash, compiled runtime hash, scorer key, and scoring version are frozen at attempt start.
3. The browser presents scenes in their declared order. Each scene has one to three channels. Choices and continuous values are kept as raw local draft answers in the existing IndexedDB draft store.
4. Reloading or returning to the route restores the draft against the same attempt identity. A stale or mismatched runtime identity invalidates the old draft instead of silently applying it to a new instrument version.
5. The client sends exactly one final request containing raw responses and frozen identity fields. It never sends scores, contributions, bands, percentiles, norms, or reference values.
6. The server validates the frozen identity, validates the raw response set, scores from the server-side compiled runtime, stores the raw submission and canonical result, and makes duplicate final requests idempotent.
7. The result screen renders the server result in the published report order as **construct × channel** metrics, with quality flags, limitations, and the pilot disclaimer. Refreshing the result reads the stored result; it does not score in the browser.
8. History lists completed and in-progress attempts. Completed results can be exported as JSON or CSV from the stored server result.

## Trust boundary and recovery

The browser owns presentation state, raw response drafts, and progress display. The server owns participant identity, attempt ownership, frozen runtime identity, response validation, scoring, quality status, canonical result, and history.

If a final request times out after the server may have committed it, the runner marks the local draft `RETRY_PENDING` and reads the terminal result. It navigates to the result only after the server reports `COMPLETED`; it never re-scores or invents a result locally. A replay with the same submission identity is safe and returns the stored result.

## Launch verification

The PR-C verification set includes:

- frontend TypeScript compilation and production build;
- frontend unit/component tests for local draft identity, raw-only payloads, choice/continuous boundaries, navigation, one-final-request behavior, and 10/30/60-scene payload smoke;
- backend Situational contract, admission, snapshot, scoring, final-submit, and PostgreSQL integration suites when the local database fixture is available;
- the existing Playwright-based browser script at `server-version/e2e/situational-text-pilot-browser-e2e.cjs` for login, published package entry, resume, final result, refresh, history, export, and desktop/mobile viewport smoke.

## Explicit non-goals

This pilot does not add bundle/composite/embedded/aggregate/collection facts, research-grade norms, percentile/reference comparisons, media stimulus, branching, open text, LLM interpretation, per-answer or per-scene durable server writes, telemetry, a new queue/semaphore, or administrative catalog authoring.

Those capabilities require a separately reviewed contract and belong to later PR-D/PR-E/PR-F work. The participant entry point deliberately reuses the existing Student layout; no new admin menu or catalog is introduced in PR-C.
