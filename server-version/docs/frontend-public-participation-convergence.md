# Huisurvey Public Participation Surface Convergence

## Goal

Public and anonymous participation should look and behave like one Huisurvey
product surface while preserving the stricter authority boundaries of public
capabilities.

This visual package covers:

- Public Questionnaire entry;
- Public Questionnaire legacy-delivery runner;
- Public Questionnaire result;
- Public Checkin.

## Non-negotiable runtime boundaries

Presentation work must not change:

- Proof-of-Work challenge/proof semantics;
- questionnaire session and resume-capability ownership;
- checkpoint enqueue / flush / retry order;
- FINAL_ONLY delivery behavior;
- completion retry behavior;
- context freeze before Scale execution;
- public Checkin session capability headers;
- image upload asset identity;
- submission payloads, limits or privacy semantics;
- report calculations.

## Component direction

Public page chrome should prefer:

- ProductPage;
- PageHeader;
- ProductStatus;
- ProductButton;
- Report primitives for result presentation;
- native inputs where they do not alter runtime behavior.

Ant Design is no longer the public page shell.

The current Public Checkin intentionally retains Ant `Upload` and `Image`
as specialized media selection/preview widgets. This boundary preserves the
existing local file-list and image-preview interaction while removing Ant
Card/Result/Spin/Button/Input/message from the page shell.

Future replacement of these media widgets should be a dedicated media-control
change with explicit upload/preview acceptance, not a side effect of visual
convergence.

## Legacy questionnaire runner

The legacy-delivery public Questionnaire branch may change presentation only.

The following remain authoritative and local to the existing controller:

- checkpointScheduler;
- expected revisions;
- response timing;
- recoveryState;
- runWithCompletionRetry;
- freezeContextBeforeScale;
- FINAL_ONLY handoff;
- navigation and completion endpoints.

Visual controls must not make a missing/failed recovery look successful.

## Canonical evidence

Canonical Visual QA includes deterministic examples for:

- entry;
- legacy runner;
- result;
- Checkin;

at 390, 768 and 1440 px.

The fixtures are GET-only. The runner is initialized with an isolated
sessionStorage resume capability but no answer is submitted during capture.

These screenshots are design evidence, not a replacement for questionnaire
recovery tests, public capability tests or seeded browser acceptance.
